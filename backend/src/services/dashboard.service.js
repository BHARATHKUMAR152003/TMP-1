import { clampInt, dateOnly, fetchAll, scalar, todayIso } from '../utils/sql.js';
import { financialYearRange } from '../utils/financialYear.js';

/** Payment-status distribution used by the dashboard charts. */
function paymentBreakdown() {
  return fetchAll(
    `SELECT payment_status, COUNT(*) AS count, COALESCE(SUM(total_amount),0) AS value
     FROM orders WHERE status <> 'cancelled' GROUP BY payment_status`,
  );
}

/** Sales + collections grouped by month across the current financial year. */
function salesTrend() {
  const fy = financialYearRange(new Date());
  return fetchAll(
    `SELECT to_char(order_date, 'YYYY-MM') AS month,
            COUNT(*) AS orders,
            COALESCE(SUM(total_amount),0) AS revenue,
            COALESCE(SUM(paid_amount),0) AS collected
     FROM orders
     WHERE status <> 'cancelled' AND order_date BETWEEN ? AND ?
     GROUP BY 1 ORDER BY 1 ASC`,
    [fy.from, fy.to],
  );
}

function recentOrders(limit = 8, today = null) {
  return fetchAll(
    `SELECT o.id, o.order_number, o.product_name, o.status, o.payment_status,
            o.total_amount, o.paid_amount, o.balance_amount, o.order_date,
            c.name AS customer_name, c.company_name AS customer_company
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.status <> 'cancelled'${today ? ' AND o.order_date = ?' : ''}
     ORDER BY o.order_date DESC, o.id DESC LIMIT ${clampInt(limit, 8, 1, 50)}`,
    today ? [today] : [],
  );
}

function recentPayments(limit = 8, today = null) {
  return fetchAll(
    `SELECT p.id, p.amount, p.payment_method, p.payment_date, o.id AS order_id,
            o.order_number, c.name AS customer_name, u.name AS recorded_by
     FROM payments p
     LEFT JOIN orders o ON o.id = p.order_id
     LEFT JOIN customers c ON c.id = p.customer_id
     LEFT JOIN users u ON u.id = p.recorded_by_user_id
     ${today ? 'WHERE p.payment_date = ?' : ''}
     ORDER BY p.payment_date DESC, p.id DESC LIMIT ${clampInt(limit, 8, 1, 50)}`,
    today ? [today] : [],
  );
}

function lowStockItems(limit = 8) {
  return fetchAll(
    `SELECT i.id, i.item_name, i.quantity, i.min_quantity, i.unit, g.name AS group_name
     FROM inventory i LEFT JOIN inventory_groups g ON g.id = i.group_id
     WHERE i.quantity < i.min_quantity
     ORDER BY (i.min_quantity - i.quantity) DESC LIMIT ${clampInt(limit, 8, 1, 50)}`,
  );
}

/**
 * Figures shared by both dashboards. `notCancelled` keeps voided invoices out
 * of every sales and collection total. When `today` is a date the sales tiles
 * only count that day; the inventory tiles are never date-scoped.
 */
async function coreStats(today = null) {
  const now = todayIso();
  const notCancelled = "status <> 'cancelled'";
  const onDay = today ? ' AND order_date = ?' : '';
  const dayParam = today ? [today] : [];

  const [
    totalCustomers, totalOrders, totalSales, totalReceived, totalOutstanding,
    unpaidCount, inventoryItems, lowStock,
    todayOrders, todaySales, todayReceived,
  ] = await Promise.all([
    today
      ? scalar(`SELECT COUNT(*) FROM customers WHERE ${dateOnly('created_at')} = ?`, dayParam)
      : scalar('SELECT COUNT(*) FROM customers'),
    scalar(`SELECT COUNT(*) FROM orders WHERE ${notCancelled}${onDay}`, dayParam),
    scalar(`SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE ${notCancelled}${onDay}`, dayParam),
    today
      ? scalar('SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_date = ?', dayParam)
      : scalar(`SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE ${notCancelled}`),
    scalar(`SELECT COALESCE(SUM(balance_amount),0) FROM orders WHERE ${notCancelled}${onDay}`, dayParam),
    scalar(`SELECT COUNT(*) FROM orders WHERE ${notCancelled} AND balance_amount > 0${onDay}`, dayParam),
    scalar('SELECT COUNT(*) FROM inventory'),
    scalar('SELECT COUNT(*) FROM inventory WHERE quantity < min_quantity'),
    scalar(`SELECT COUNT(*) FROM orders WHERE ${notCancelled} AND order_date = ?`, [now]),
    scalar(`SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE ${notCancelled} AND order_date = ?`, [now]),
    scalar('SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_date = ?', [now]),
  ]);

  return {
    totalCustomers, totalOrders, totalSales, totalReceived, totalOutstanding,
    unpaidCount, inventoryItems, lowStock,
    today: { totalOrders: todayOrders, totalSales: todaySales, totalReceived: todayReceived },
  };
}

/** `range` is 'today' (the default) or 'all'. */
export async function adminDashboard({ range = 'today' } = {}) {
  const today = range === 'all' ? null : todayIso();

  const [stats, salesByMonth, orders, payments, lowStock, breakdown] = await Promise.all([
    coreStats(today), salesTrend(), recentOrders(8, today), recentPayments(8, today),
    lowStockItems(), paymentBreakdown(),
  ]);

  return {
    range: today ? 'today' : 'all',
    date: today,
    stats,
    financialYear: financialYearRange(new Date()),
    paymentBreakdown: breakdown,
    salesTrend: salesByMonth,
    recentOrders: orders,
    recentPayments: payments,
    lowStockItems: lowStock,
  };
}

/** Same figures as the admin dashboard, minus the user/settings tiles. */
export async function accountantDashboard(options) {
  return adminDashboard(options);
}

