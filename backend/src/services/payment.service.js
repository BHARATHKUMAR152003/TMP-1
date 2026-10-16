import { execute, insert, query, withTransaction } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { clampInt, dateOnly, fetchAll, fetchOne, likeOp, scalar, todayIso } from '../utils/sql.js';
import { first, money, round2, toDecimal, toIntOrNull, trimOrNull } from '../utils/values.js';
import { normalizeFinancialYearLabel } from '../utils/financialYear.js';
import { createNotification } from './notification.service.js';
import {
  NOTIFICATION_EVENTS, ORDER_STATUS, PAYMENT_METHODS, PAYMENT_STATUS,
} from '../constants/index.js';

export async function listPayments(query = {}) {
  const where = [];
  const params = [];

  if (query.orderId) {
    where.push('p.order_id = ?');
    params.push(Number(query.orderId));
  }
  if (query.customerId) {
    where.push('p.customer_id = ?');
    params.push(Number(query.customerId));
  }
  if (query.method) {
    where.push('p.payment_method = ?');
    params.push(query.method);
  }
  if (query.financialYear) {
    const label = normalizeFinancialYearLabel(query.financialYear);
    if (label) {
      where.push('o.financial_year = ?');
      params.push(label);
    }
  }
  if (query.search) {
    where.push(`(o.order_number ${likeOp()} ? OR c.name ${likeOp()} ? OR c.company_name ${likeOp()} ? OR p.reference_no ${likeOp()} ?)`);
    const term = `%${query.search}%`;
    params.push(term, term, term, term);
  }
  // scope=today limits to payments recorded today; from/to give a date range.
  if (query.scope === 'today') {
    where.push(`${dateOnly('p.payment_date')} = ?`);
    params.push(todayIso());
  } else {
    if (query.from) {
      where.push(`${dateOnly('p.payment_date')} >= ?`);
      params.push(query.from);
    }
    if (query.to) {
      where.push(`${dateOnly('p.payment_date')} <= ?`);
      params.push(query.to);
    }
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const JOINS = `
    LEFT JOIN orders o ON o.id = p.order_id
    LEFT JOIN customers c ON c.id = p.customer_id`;

  const safePage = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const safeLimit = clampInt(query.limit, 20, 1, 200);
  const offset = (safePage - 1) * safeLimit;

  const total = await scalar(`SELECT COUNT(*) FROM payments p ${JOINS} ${whereClause}`, params);
  const items = await fetchAll(
    `SELECT p.*, o.order_number, o.total_amount AS order_total, o.paid_amount AS order_paid,
            o.balance_amount AS order_balance, o.payment_status,
            c.name AS customer_name, c.company_name AS customer_company,
            u.name AS recorded_by
     FROM payments p
     ${JOINS}
     LEFT JOIN users u ON u.id = p.recorded_by_user_id
     ${whereClause}
     ORDER BY p.payment_date DESC, p.id DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params,
  );
  const summary = await fetchOne(
    `SELECT COALESCE(SUM(p.amount),0) AS total_collected, COUNT(*) AS count
     FROM payments p ${JOINS} ${whereClause}`,
    params,
  );

  return { items, page: safePage, limit: safeLimit, total: Number(total), summary };
}

/**
 * Resolves an order from the value typed into "Order / Invoice". Accepts the
 * tax invoice number (TMP/0001/26-27) or the numeric primary key. The invoice
 * number is matched first so alphanumeric IDs work.
 */
async function resolveOrderForPayment(client, raw) {
  const ref = String(raw ?? '').trim();
  if (!ref) throw ApiError.badRequest('Order / invoice number is required');

  const columns = 'id, order_number, customer_id, status, total_amount, paid_amount';
  const byNumber = await query(
    `SELECT ${columns} FROM orders WHERE order_number = ? LIMIT 1 FOR UPDATE`,
    [ref],
    client,
  );
  if (byNumber.length > 0) return byNumber[0];

  const numeric = toIntOrNull(ref);
  if (numeric !== null) {
    const byId = await query(
      `SELECT ${columns} FROM orders WHERE id = ? LIMIT 1 FOR UPDATE`,
      [numeric],
      client,
    );
    if (byId.length > 0) return byId[0];
  }
  throw ApiError.notFound(`No order found for "${ref}"`);
}

/**
 * Records a payment against an order and keeps the order's paid/balance/due
 * amounts and payment status in sync — all within a single transaction.
 * Every payment is stored as its own row, so partial payments accumulate
 * instead of overwriting each other.
 */
export async function recordPayment({ user, data, files = [] }) {
  const errors = [];
  if (!String(first(data, 'orderId', 'order_id') ?? '').trim()) {
    errors.push({ field: 'orderId', message: 'Order / invoice number is required' });
  }
  const amount = toDecimal(data.amount, 0);
  if (!(amount > 0)) {
    errors.push({ field: 'amount', message: 'Amount must be greater than zero' });
  }
  const method = first(data, 'paymentMethod', 'payment_method') ?? 'cash';
  if (!PAYMENT_METHODS.includes(method)) {
    errors.push({ field: 'paymentMethod', message: 'Unsupported payment method' });
  }
  if (errors.length > 0) throw ApiError.unprocessable('Validation failed', errors);

  return withTransaction(async (client) => {
    const order = await resolveOrderForPayment(client, first(data, 'orderId', 'order_id'));
    if (order.status === ORDER_STATUS.CANCELLED) {
      throw ApiError.badRequest('This invoice has been cancelled');
    }

    const outstanding = round2(Number(order.total_amount) - Number(order.paid_amount));
    if (amount > outstanding + 0.01) {
      throw ApiError.badRequest(
        `Amount exceeds the outstanding balance of ${money(outstanding)} on ${order.order_number ?? `order #${order.id}`}.`,
      );
    }

    const newPaid = round2(Number(order.paid_amount) + amount);
    const newBalance = round2(Number(order.total_amount) - newPaid);
    const paymentType =
      first(data, 'paymentType', 'payment_type') ?? (newBalance <= 0 ? 'full' : 'partial');
    const paymentDate = first(data, 'paymentDate', 'payment_date') ?? todayIso();

    const paymentId = await insert(
      `INSERT INTO payments
         (order_id, customer_id, amount, payment_method, payment_type, payment_date,
          reference_no, recorded_by_user_id, notes)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        order.id, order.customer_id, amount, method, paymentType, paymentDate,
        trimOrNull(first(data, 'referenceNo', 'reference_no')),
        user.id, trimOrNull(data.notes),
      ],
      client,
    );

    const paymentStatus =
      newBalance <= 0 ? PAYMENT_STATUS.PAID : newPaid > 0 ? PAYMENT_STATUS.PARTIAL : PAYMENT_STATUS.UNPAID;

    // Optional proof screenshot(s) attached by the accountant while recording.
    let storedPath = null;
    for (const file of files) {
      const stored = `uploads/${file.filename}`;
      storedPath = storedPath ?? stored;
      await execute(
        `INSERT INTO order_files (order_id, file_name, file_path, file_type, uploaded_by_user_id)
         VALUES (?,?,?,?,?)`,
        [order.id, file.originalname, stored, 'payment_screenshot', user.id],
        client,
      );
    }

    const orderUpdates = ['paid_amount = ?', 'balance_amount = ?', 'amount_due = ?', 'payment_status = ?'];
    const orderParams = [newPaid, newBalance, newBalance, paymentStatus];
    if (storedPath) {
      orderUpdates.push('payment_screenshot_path = ?');
      orderParams.push(storedPath);
    }
    orderParams.push(order.id);
    await execute(`UPDATE orders SET ${orderUpdates.join(', ')} WHERE id = ?`, orderParams, client);

    await createNotification(
      {
        orderId: order.id,
        eventType: NOTIFICATION_EVENTS.PAYMENT_RECORDED,
        title: `Payment recorded: ${money(amount)}`,
        message: `Balance now ${money(newBalance)}`,
        triggeredByRole: user.role,
      },
      client,
    );

    return {
      id: paymentId,
      orderId: order.id,
      orderNumber: order.order_number ?? null,
      amount,
      paidAmount: newPaid,
      balanceAmount: newBalance,
    };
  });
}
