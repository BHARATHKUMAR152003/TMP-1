import { execute, insert, query, withTransaction } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { clampInt, likeOp } from '../utils/sql.js';
import { first, trimOrNull } from '../utils/values.js';

const CUSTOMER_TOTALS = `
  (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
  (SELECT COALESCE(SUM(o.total_amount),0) FROM orders o
    WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS total_spent,
  (SELECT COALESCE(SUM(o.paid_amount),0) FROM orders o
    WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS total_paid,
  (SELECT COALESCE(SUM(o.balance_amount),0) FROM orders o
    WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS outstanding
`;

export async function listCustomers({ search, page = 1, limit = 20 } = {}) {
  const where = [];
  const params = [];
  if (search) {
    where.push(
      `(c.name ${likeOp()} ? OR c.phone ${likeOp()} ? OR c.email ${likeOp()} ? OR c.company_name ${likeOp()} ? OR c.gst_number ${likeOp()} ?)`,
    );
    const term = `%${search}%`;
    params.push(term, term, term, term, term);
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const safeLimit = clampInt(limit, 20, 1, 100);
  const offset = (safePage - 1) * safeLimit;

  const countRows = await query(`SELECT COUNT(*) AS total FROM customers c ${whereClause}`, params);
  const items = await query(
    `SELECT c.*, ${CUSTOMER_TOTALS}
     FROM customers c ${whereClause}
     ORDER BY c.name ASC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params,
  );
  return { items, page: safePage, limit: safeLimit, total: countRows[0].total };
}

/**
 * Type-ahead used by the order form. Returns a short list so the accountant
 * picks an existing customer instead of silently creating a duplicate.
 */
export async function searchCustomers(term, limit = 10) {
  const text = String(term ?? '').trim();
  if (text.length < 2) return [];
  const like = `%${text}%`;
  return query(
    `SELECT id, name, phone, email, address, company_name, gst_number, state, state_code
     FROM customers
     WHERE name ${likeOp()} ? OR phone ${likeOp()} ? OR company_name ${likeOp()} ? OR email ${likeOp()} ?
     ORDER BY name ASC
     LIMIT ${clampInt(limit, 10, 1, 25)}`,
    [like, like, like, like],
  );
}

/**
 * Finds a customer that would be a duplicate of the given details. Phone is the
 * strongest signal (it is unique in practice); otherwise an exact
 * case-insensitive name + company match is treated as the same person.
 */
export async function findDuplicateCustomer({ name, phone, companyName } = {}, client) {
  const cleanPhone = trimOrNull(phone);
  if (cleanPhone) {
    const byPhone = await query(
      'SELECT * FROM customers WHERE phone = ? ORDER BY id ASC LIMIT 1',
      [cleanPhone],
      client,
    );
    if (byPhone.length > 0) return byPhone[0];
  }

  const cleanName = trimOrNull(name);
  if (!cleanName) return null;

  const byName = await query(
    `SELECT * FROM customers
     WHERE LOWER(name) = LOWER(?)
       AND COALESCE(LOWER(company_name),'') = COALESCE(LOWER(?),'')
     ORDER BY id ASC LIMIT 1`,
    [cleanName, trimOrNull(companyName)],
    client,
  );
  return byName[0] ?? null;
}

/**
 * Full customer record: totals plus the complete order history (current and
 * imported historical orders together, newest first).
 */
export async function getCustomer(id) {
  const rows = await query(
    `SELECT c.*, ${CUSTOMER_TOTALS} FROM customers c WHERE c.id = ? LIMIT 1`,
    [id],
  );
  if (rows.length === 0) throw ApiError.notFound('Customer not found');

  const orders = await query(
    `SELECT o.id, o.order_number, o.product_name, o.status, o.payment_status,
            o.quantity, o.total_amount, o.paid_amount, o.balance_amount,
            o.order_date, o.is_historical, o.created_at, cat.name AS category_name
     FROM orders o
     LEFT JOIN product_categories cat ON cat.id = o.category_id
     WHERE o.customer_id = ?
     ORDER BY o.order_date DESC, o.id DESC`,
    [id],
  );
  const payments = await query(
    `SELECT p.id, p.amount, p.payment_method, p.payment_date, p.reference_no,
            o.order_number
     FROM payments p LEFT JOIN orders o ON o.id = p.order_id
     WHERE p.customer_id = ?
     ORDER BY p.payment_date DESC, p.id DESC
     LIMIT 100`,
    [id],
  );
  return { ...rows[0], orders, payments };
}

// Column -> accepted request keys. Only supplied fields are written, so a
// partial update never blanks the rest of the record.
const CUSTOMER_FIELDS = [
  ['name', ['name']],
  ['phone', ['phone']],
  ['email', ['email']],
  ['address', ['address']],
  ['gst_number', ['gstNumber', 'gst_number']],
  ['company_name', ['companyName', 'company_name']],
  ['state', ['state']],
  ['state_code', ['stateCode', 'state_code']],
];

export async function createCustomer(data, { allowDuplicate = false } = {}) {
  const name = trimOrNull(data.name);
  if (!name) throw ApiError.badRequest('Customer name is required');

  if (!allowDuplicate) {
    const duplicate = await findDuplicateCustomer({
      name,
      phone: data.phone,
      companyName: first(data, 'companyName', 'company_name'),
    });
    if (duplicate) {
      throw ApiError.conflict(
        `"${duplicate.name}"${duplicate.phone ? ` (${duplicate.phone})` : ''} already exists. Open that customer instead of creating a duplicate.`,
        { customerId: duplicate.id },
      );
    }
  }

  const id = await insert(
    `INSERT INTO customers (name, phone, email, address, gst_number, company_name, state, state_code)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      name, trimOrNull(data.phone), trimOrNull(data.email), trimOrNull(data.address),
      trimOrNull(first(data, 'gstNumber', 'gst_number')),
      trimOrNull(first(data, 'companyName', 'company_name')),
      trimOrNull(first(data, 'state')),
      trimOrNull(first(data, 'stateCode', 'state_code')),
    ],
  );
  return getCustomer(id);
}

export async function updateCustomer(id, data) {
  await getCustomer(id);

  const updates = [];
  const params = [];
  for (const [column, keys] of CUSTOMER_FIELDS) {
    const value = first(data, ...keys);
    if (value !== undefined) {
      updates.push(`${column} = ?`);
      params.push(trimOrNull(value));
    }
  }
  if (updates.length > 0) {
    params.push(id);
    await execute(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params);
  }
  return getCustomer(id);
}

/**
 * Permanently removes a customer. Orders only SET NULL on this FK, so a customer
 * with history is refused unless `force` is set — in which case their orders
 * (and the bills/payments hanging off them) go too.
 */
export async function deleteCustomer(id, { force = false } = {}) {
  return withTransaction(async (client) => {
    const rows = await query('SELECT id, name FROM customers WHERE id = ? LIMIT 1', [id], client);
    const customer = rows[0];
    if (!customer) throw ApiError.notFound('Customer not found');

    const orderRows = await query('SELECT id FROM orders WHERE customer_id = ?', [id], client);
    if (orderRows.length > 0 && !force) {
      throw ApiError.conflict(
        `${customer.name} has ${orderRows.length} order(s). Deleting the customer will delete those orders and their invoices too.`,
        { orderCount: orderRows.length },
      );
    }

    // Bills / files / comments / slips / notifications cascade from the order FK.
    await execute(
      'DELETE FROM payments WHERE customer_id = ? OR order_id IN (SELECT id FROM orders WHERE customer_id = ?)',
      [id, id],
      client,
    );
    await execute('DELETE FROM inventory_usages WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ?)', [id], client);
    await execute('DELETE FROM orders WHERE customer_id = ?', [id], client);
    await execute('DELETE FROM customers WHERE id = ?', [id], client);

    return { id, name: customer.name, deletedOrders: orderRows.length };
  });
}

