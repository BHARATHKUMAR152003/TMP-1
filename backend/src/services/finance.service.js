import { query, withTransaction } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { clampInt, fetchAll, fetchOne, likeOp, scalar, todayIso } from '../utils/sql.js';
import { normalizeFinancialYearLabel } from '../utils/financialYear.js';
import { computeGstBreakdown } from '../utils/gst.js';
import { DOC_DOWNLOAD_ROLES } from '../constants/roles.js';
import { ORDER_STATUS } from '../constants/index.js';

const INVOICE_SELECT = `
  SELECT o.id, o.order_number, o.financial_year, o.invoice_seq, o.product_name,
         o.quantity, o.unit, o.hsn_code, o.gst_rate, o.status, o.payment_status,
         o.total_amount, o.paid_amount, o.balance_amount, o.amount_due,
         o.delivery_charge, o.cutting_charge, o.dispatched_through,
         o.order_date, o.is_historical, o.created_at,
         c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone,
         c.email AS customer_email, c.address AS customer_address,
         c.gst_number, c.company_name, c.state AS customer_state,
         c.state_code AS customer_state_code,
         b.id AS bill_id, b.bill_number, b.invoice_date, b.subtotal_amount,
         b.cgst_amount, b.sgst_amount, b.tax_amount
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN bills b ON b.order_id = o.id
`;

/** Shared filter builder for the invoice/bill lists. */
function invoiceFilters(query = {}) {
  const where = ["o.status <> 'cancelled'"];
  const params = [];

  if (query.status === 'paid') where.push('o.balance_amount <= 0');
  if (query.status === 'unpaid') where.push('o.balance_amount > 0');

  if (query.customerId) {
    where.push('o.customer_id = ?');
    params.push(Number(query.customerId));
  }
  if (query.financialYear) {
    const label = normalizeFinancialYearLabel(query.financialYear);
    if (label) {
      where.push('o.financial_year = ?');
      params.push(label);
    }
  }
  if (query.scope === 'today') {
    where.push('o.order_date = ?');
    params.push(todayIso());
  } else {
    if (query.from) {
      where.push('o.order_date >= ?');
      params.push(query.from);
    }
    if (query.to) {
      where.push('o.order_date <= ?');
      params.push(query.to);
    }
  }
  if (query.search) {
    where.push(
      `(o.order_number ${likeOp()} ? OR o.product_name ${likeOp()} ? OR c.name ${likeOp()} ? OR c.company_name ${likeOp()} ?)`,
    );
    const term = `%${query.search}%`;
    params.push(term, term, term, term);
  }

  return { whereClause: `WHERE ${where.join(' AND ')}`, params };
}

/** Adds the derived GST breakdown to each row so the UI never recomputes it. */
function withGst(rows) {
  return rows.map((row) => ({
    ...row,
    gst: computeGstBreakdown({
      total: Number(row.total_amount ?? 0),
      gstRate: row.gst_rate,
      quantity: Number(row.quantity ?? 1),
      deliveryCharge: Number(row.delivery_charge ?? 0),
      cuttingCharge: Number(row.cutting_charge ?? 0),
    }),
  }));
}

/** Every issued tax invoice, newest first. */
export async function listInvoices(options = {}) {
  const { whereClause, params } = invoiceFilters(options);
  const safePage = Math.max(Number.parseInt(options.page, 10) || 1, 1);
  const safeLimit = clampInt(options.limit, 20, 1, 200);
  const offset = (safePage - 1) * safeLimit;

  const total = await scalar(
    `SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON c.id = o.customer_id ${whereClause}`,
    params,
  );
  const rows = await fetchAll(
    `${INVOICE_SELECT} ${whereClause} ORDER BY o.order_date DESC, o.id DESC LIMIT ${safeLimit} OFFSET ${offset}`,
    params,
  );
  const summary = await fetchOne(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(o.total_amount),0) AS total_value,
            COALESCE(SUM(o.paid_amount),0) AS total_paid,
            COALESCE(SUM(o.balance_amount),0) AS total_outstanding
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id ${whereClause}`,
    params,
  );

  return { items: withGst(rows), page: safePage, limit: safeLimit, total: Number(total), summary };
}

export async function getInvoice(orderId) {
  const invoice = await fetchOne(`${INVOICE_SELECT} WHERE o.id = ? LIMIT 1`, [orderId]);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  invoice.payments = await fetchAll(
    `SELECT amount, payment_method, payment_type, payment_date, reference_no, notes, created_at
     FROM payments WHERE order_id = ? ORDER BY payment_date ASC, id ASC`,
    [orderId],
  );
  return withGst([invoice])[0];
}

/** Orders with an outstanding balance, for the collections / Unpaid tab. */
export async function listOutstanding(options = {}) {
  const { whereClause, params } = invoiceFilters({ ...options, status: 'unpaid' });
  const orderBy = options.sort === 'oldest' ? 'o.order_date ASC, o.id ASC' : 'o.order_date DESC, o.id DESC';

  const items = await fetchAll(`${INVOICE_SELECT} ${whereClause} ORDER BY ${orderBy}`, params);
  const summary = await fetchOne(
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(o.total_amount),0) AS total_value,
            COALESCE(SUM(o.paid_amount),0) AS total_paid,
            COALESCE(SUM(o.balance_amount),0) AS total_outstanding
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id ${whereClause}`,
    params,
  );
  return { items: withGst(items), summary };
}

/** Bills/Invoices screen — same data, filterable across all financial years. */
export async function listBills(options = {}) {
  return listInvoices({ limit: 50, ...options });
}

// ---------------------------------------------------------------------------
// Tax invoice document
// ---------------------------------------------------------------------------
const DOC_SELECT = `
  SELECT o.*, c.name AS customer_name, c.phone AS customer_phone,
         c.email AS customer_email, c.address AS customer_address,
         c.company_name AS customer_company, c.gst_number AS customer_gst,
         c.state AS customer_state, c.state_code AS customer_state_code,
         cat.name AS category_name
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN product_categories cat ON cat.id = o.category_id
  WHERE o.id = ? LIMIT 1
`;

export async function getOrderForDocument(orderId) {
  const row = await fetchOne(DOC_SELECT, [orderId]);
  if (!row) throw ApiError.notFound('Order not found');
  return row;
}

/** Only admin and accountant may download billing documents. */
export function ensureDocumentAccess(user) {
  if (DOC_DOWNLOAD_ROLES.includes(user.role)) return;
  throw ApiError.forbidden('You cannot access this document');
}

export function getBillForOrder(orderId) {
  return fetchOne('SELECT * FROM bills WHERE order_id = ? LIMIT 1', [orderId]);
}

export function getPaymentsForOrder(orderId) {
  return fetchAll(
    `SELECT amount, payment_method, payment_date, reference_no
     FROM payments WHERE order_id = ? ORDER BY payment_date ASC, id ASC`,
    [orderId],
  );
}

/** Cancels an invoice. Nothing is deleted — the row keeps its number. */
export async function cancelInvoice(user, orderId, reason) {
  return withTransaction(async (client) => {
    const rows = await query(
      'SELECT id, order_number, paid_amount FROM orders WHERE id = ? LIMIT 1 FOR UPDATE',
      [orderId],
      client,
    );
    const order = rows[0];
    if (!order) throw ApiError.notFound('Order not found');
    if (Number(order.paid_amount) > 0) {
      throw ApiError.badRequest('Payments have been received against this invoice; it cannot be cancelled');
    }

    await query('UPDATE orders SET status = ? WHERE id = ?', [ORDER_STATUS.CANCELLED, orderId], client);
    await query(
      'INSERT INTO order_comments (order_id, user_id, comment, comment_type) VALUES (?,?,?,?)',
      [orderId, user.id, reason || 'Invoice cancelled', 'cancel'],
      client,
    );
    return { id: orderId, status: ORDER_STATUS.CANCELLED };
  });
}

