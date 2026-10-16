import { query } from '../config/database.js';
import { todayIso } from '../utils/sql.js';
import { financialYearRange, normalizeFinancialYearLabel } from '../utils/financialYear.js';

// Stand-in lower bound for the "All time" period — earlier than any invoice
// this business could hold, including imported historical records.
const EARLIEST = '1900-01-01';

/**
 * Resolves the reporting window. A financial-year label wins over explicit
 * dates; with neither, the window is every order on record ("All time").
 * Everything filters on `order_date` so imported historical invoices fall into
 * the period they belong to.
 */
function resolveRange({ from, to, financialYear } = {}) {
  const label = normalizeFinancialYearLabel(financialYear);
  if (label) {
    const fy = financialYearRange(`20${label.slice(0, 2)}-04-01`);
    return { from: fy.from, to: fy.to, financialYear: fy.label };
  }
  return { from: from || EARLIEST, to: to || todayIso(), financialYear: null };
}

/**
 * Aggregated reporting used by the Reports page: sales, payments, outstanding,
 * customer, order, inventory and low-stock views in one payload.
 */
export async function getReport(options = {}) {
  const range = resolveRange(options);
  const params = [range.from, range.to];
  const window = "o.status <> 'cancelled' AND o.order_date BETWEEN ? AND ?";

  const [
    [totals], byPaymentStatus, byCategory, monthly, topCustomers,
    paymentsByMethod, outstandingByCustomer, [inventoryTotals], lowStock,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(o.total_amount),0) AS sales,
              COALESCE(SUM(o.paid_amount),0) AS collected,
              COALESCE(SUM(o.balance_amount),0) AS outstanding,
              COUNT(DISTINCT o.customer_id) AS customers
       FROM orders o WHERE ${window}`,
      params,
    ),
    query(
      `SELECT o.payment_status, COUNT(*) AS count, COALESCE(SUM(o.total_amount),0) AS value
       FROM orders o WHERE ${window} GROUP BY o.payment_status`,
      params,
    ),
    query(
      `SELECT COALESCE(cat.name,'Uncategorised') AS category, COUNT(*) AS orders,
              COALESCE(SUM(o.total_amount),0) AS sales
       FROM orders o LEFT JOIN product_categories cat ON cat.id = o.category_id
       WHERE ${window} GROUP BY category ORDER BY sales DESC`,
      params,
    ),
    query(
      `SELECT to_char(o.order_date, 'YYYY-MM') AS month, COUNT(*) AS orders,
              COALESCE(SUM(o.total_amount),0) AS sales,
              COALESCE(SUM(o.paid_amount),0) AS collected
       FROM orders o WHERE ${window} GROUP BY 1 ORDER BY 1 ASC`,
      params,
    ),
    query(
      `SELECT c.id AS customer_id, c.name AS customer_name, c.company_name,
              COUNT(o.id) AS orders,
              COALESCE(SUM(o.total_amount),0) AS sales,
              COALESCE(SUM(o.paid_amount),0) AS paid,
              COALESCE(SUM(o.balance_amount),0) AS outstanding
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       WHERE ${window} GROUP BY c.id, c.name, c.company_name ORDER BY sales DESC LIMIT 15`,
      params,
    ),
    query(
      `SELECT p.payment_method, COUNT(*) AS count, COALESCE(SUM(p.amount),0) AS amount
       FROM payments p WHERE p.payment_date BETWEEN ? AND ?
       GROUP BY p.payment_method ORDER BY amount DESC`,
      params,
    ),
    query(
      `SELECT c.id AS customer_id, c.name AS customer_name, c.company_name, c.phone,
              COUNT(o.id) AS invoices, COALESCE(SUM(o.balance_amount),0) AS outstanding
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
       WHERE o.status <> 'cancelled' AND o.balance_amount > 0
       GROUP BY c.id, c.name, c.company_name, c.phone
       ORDER BY outstanding DESC LIMIT 25`,
    ),
    query(
      `SELECT COUNT(*) AS items,
              COALESCE(SUM(quantity * cost_per_unit),0) AS stock_value,
              COUNT(*) FILTER (WHERE quantity < min_quantity) AS low_stock
       FROM inventory`,
    ),
    query(
      `SELECT i.id, i.item_name, i.quantity, i.min_quantity, i.unit, i.supplier,
              g.name AS group_name, cat.name AS category_name, t.name AS type_name
       FROM inventory i
       LEFT JOIN inventory_groups g ON g.id = i.group_id
       LEFT JOIN inventory_categories cat ON cat.id = i.category_id
       LEFT JOIN inventory_types t ON t.id = i.type_id
       WHERE i.quantity < i.min_quantity
       ORDER BY (i.min_quantity - i.quantity) DESC`,
    ),
  ]);

  return {
    range,
    totals,
    byPaymentStatus,
    byCategory,
    monthly,
    topCustomers,
    paymentsByMethod,
    outstandingByCustomer,
    inventory: { totals: inventoryTotals, lowStock },
  };
}

/**
 * Full order dataset for the CSV / Excel / PDF export, filtered by the same
 * window as the report. Rates are derived from the GST-inclusive total so the
 * exported figures reconcile with the printed tax invoice.
 */
export function exportOrders(options = {}) {
  const range = resolveRange(options);
  return query(
    `SELECT o.id,
            o.order_number AS invoice_no,
            to_char(o.order_date, 'YYYY-MM-DD') AS invoice_date,
            o.financial_year, o.status, o.payment_status, o.priority,
            o.product_name, COALESCE(cat.name, 'Uncategorised') AS category,
            o.quantity, o.unit, o.size, o.hsn_code, o.gst_rate,
            COALESCE(c.name, 'Walk-in') AS customer_name,
            c.company_name, c.phone AS customer_phone, c.email AS customer_email,
            c.gst_number AS customer_gst,
            ROUND(o.total_amount / (1 + o.gst_rate / 100), 2) AS taxable_value,
            ROUND(o.total_amount / (1 + o.gst_rate / 100)
                  / GREATEST(o.quantity, 1), 2) AS rate_per_unit,
            ROUND((o.total_amount - o.total_amount / (1 + o.gst_rate / 100)) / 2, 2) AS cgst_amount,
            ROUND((o.total_amount - o.total_amount / (1 + o.gst_rate / 100)) / 2, 2) AS sgst_amount,
            o.delivery_charge,
            o.cutting_charge,
            o.dispatched_through,
            o.wastage_quantity,
            wi.item_name AS wastage_item,
            wi.unit AS wastage_unit,
            COALESCE(o.finishing_type, o.lamination) AS cutting,
            o.total_amount, o.paid_amount, o.balance_amount,
            o.is_historical
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN product_categories cat ON cat.id = o.category_id
     LEFT JOIN inventory wi ON wi.id = o.wastage_item_id
     WHERE o.status <> 'cancelled' AND o.order_date BETWEEN ? AND ?
     ORDER BY o.order_date DESC, o.id DESC`,
    [range.from, range.to],
  ).then((rows) => ({ rows, range }));
}

