import fs from 'node:fs/promises';
import path from 'node:path';
import { execute, insert, query, withTransaction } from '../config/database.js';
import config from '../config/index.js';
import ApiError from '../utils/ApiError.js';
import {
  asArray, first, round2, toDecimal, toInt, toIntOrNull, trimOrNull,
} from '../utils/values.js';
import { clampInt, likeOp, todayIso } from '../utils/sql.js';
import { nextInvoiceNumber } from '../utils/orderNumber.js';
import { financialYearRange, normalizeFinancialYearLabel } from '../utils/financialYear.js';
import { computeGst, normalizeGstRate } from '../utils/gst.js';
import { createNotification } from './notification.service.js';
import { findDuplicateCustomer } from './customer.service.js';
import {
  ORDER_STATUS,
  ORDER_SOURCE,
  PAYMENT_STATUS,
  PRIORITY_VALUES,
  PRODUCTION_TYPES,
  canTransition,
  NOTIFICATION_EVENTS,
} from '../constants/index.js';

const ORDER_SELECT = `
  SELECT o.*,
         c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
         c.address AS customer_address, c.company_name AS customer_company,
         c.gst_number AS customer_gst, c.state AS customer_state,
         c.state_code AS customer_state_code,
         cat.name AS category_name,
         b.id AS bill_id, b.bill_number, b.invoice_date,
         wi.item_name AS wastage_item_name, wi.unit AS wastage_unit,
         cu.name AS created_by_name
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN product_categories cat ON cat.id = o.category_id
  LEFT JOIN bills b ON b.order_id = o.id
  LEFT JOIN inventory wi ON wi.id = o.wastage_item_id
  LEFT JOIN users cu ON cu.id = o.created_by_user_id
`;

/**
 * Lists orders with filtering and pagination. Both roles see every order —
 * the accountant runs the front desk, so scoping by creator would hide the
 * company's own history from them.
 */
export async function listOrders({ filters = {} } = {}) {
  const where = [];
  const params = [];

  // Optional filters.
  if (filters.status) {
    const statuses = String(filters.status).split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      where.push(`o.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (filters.customerId) {
    where.push('o.customer_id = ?');
    params.push(Number(filters.customerId));
  }
  if (filters.paymentStatus) {
    where.push('o.payment_status = ?');
    params.push(filters.paymentStatus);
  }
  if (filters.financialYear) {
    const label = normalizeFinancialYearLabel(filters.financialYear);
    if (label) {
      where.push('o.financial_year = ?');
      params.push(label);
    }
  }
  if (filters.production) {
    where.push('o.production_type = ?');
    params.push(filters.production);
  }
  if (filters.search) {
    where.push(
      `(o.order_number ${likeOp()} ? OR o.product_name ${likeOp()} ? OR c.name ${likeOp()} ? OR c.phone ${likeOp()} ?)`,
    );
    const term = `%${filters.search}%`;
    params.push(term, term, term, term);
  }
  // Dates filter on order_date so imported historical invoices land in the
  // period they actually belong to, not the day they were imported.
  if (filters.scope === 'today') {
    where.push('o.order_date = ?');
    params.push(todayIso());
  } else {
    if (filters.from) {
      where.push('o.order_date >= ?');
      params.push(filters.from);
    }
    if (filters.to) {
      where.push('o.order_date <= ?');
      params.push(filters.to);
    }
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
  const limit = clampInt(filters.limit, 20, 1, 100);
  const offset = (page - 1) * limit;

  const countRows = await query(
    `SELECT COUNT(*) AS total FROM orders o LEFT JOIN customers c ON c.id = o.customer_id ${whereClause}`,
    params,
  );
  const total = countRows[0].total;

  const items = await query(
    `${ORDER_SELECT} ${whereClause} ORDER BY o.order_date DESC, o.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return { items, page, limit, total };
}

/** Fetches a single order plus its files, comments and payments. */
export async function getOrderById(id) {
  const rows = await query(`${ORDER_SELECT} WHERE o.id = ? LIMIT 1`, [id]);
  const order = rows[0];
  if (!order) throw ApiError.notFound('Order not found');

  const files = await query(
    `SELECT id, file_name, file_path, file_type, size, quantity, instructions, created_at
     FROM order_files WHERE order_id = ? ORDER BY created_at DESC`,
    [id],
  );
  const comments = await query(
    `SELECT oc.id, oc.comment, oc.comment_type, oc.created_at, u.name AS author, u.role AS author_role
     FROM order_comments oc LEFT JOIN users u ON u.id = oc.user_id
     WHERE oc.order_id = ? ORDER BY oc.created_at ASC`,
    [id],
  );
  const payments = await query(
    `SELECT id, amount, payment_method, payment_type, payment_date, reference_no, notes, created_at
     FROM payments WHERE order_id = ? ORDER BY payment_date ASC, id ASC`,
    [id],
  );

  return { ...order, ...computeGst(gstInputs(order)), files, comments, payments };
}

/** The GST inputs for an order row, used by both the API and the PDF. */
function gstInputs(order) {
  return {
    total: Number(order.total_amount ?? 0),
    gstRate: order.gst_rate,
    quantity: Number(order.quantity ?? 1),
  };
}

function validateCreateOrder(data) {
  const errors = [];
  const productionType = first(data, 'productionType', 'production_type');
  if (productionType && !PRODUCTION_TYPES.includes(productionType)) {
    errors.push({ field: 'productionType', message: 'Production type must be Offset or Digital' });
  }
  const quantity = data.quantity;
  if (quantity !== undefined && quantity !== null && quantity !== '') {
    const parsed = Number.parseInt(quantity, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      errors.push({ field: 'quantity', message: 'Quantity must be at least 1' });
    }
  }
  const priority = data.priority;
  if (priority && !PRIORITY_VALUES.includes(priority)) {
    errors.push({ field: 'priority', message: 'Invalid priority' });
  }
  for (const field of ['totalAmount', 'paymentAmount', 'deliveryCharge', 'cuttingCharge', 'wastageQuantity']) {
    const value = data[field];
    if (value !== undefined && value !== null && value !== '') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        errors.push({ field, message: 'Must be a positive number' });
      }
    }
  }
  if (!first(data, 'customerId', 'customer_id') && !first(data, 'customerName', 'customer_name')) {
    errors.push({ field: 'customerName', message: 'Select an existing customer or enter a name' });
  }
  if (errors.length > 0) throw ApiError.unprocessable('Validation failed', errors);
}

function derivePaymentStatus(paid, balance) {
  if (paid > 0 && balance <= 0) return PAYMENT_STATUS.PAID;
  if (paid > 0) return PAYMENT_STATUS.PARTIAL;
  return PAYMENT_STATUS.UNPAID;
}

function storedPath(file) {
  return `uploads/${file.filename}`;
}

// Marks the inventory_usages rows created by an order's wastage entry, so an
// edit can undo exactly those without touching an operator's own consumption.
const WASTAGE_NOTE = 'Wastage recorded on the order';

/**
 * Books the stock consumed as wastage on an order. Any previous booking is
 * returned to stock first, so editing an order never double-deducts.
 */
async function applyWastage(client, { orderId, user, itemId, quantity, previous = null }) {
  const prevId = previous?.itemId ?? null;
  const prevQty = round2(previous?.quantity ?? 0);
  const nextQty = round2(quantity ?? 0);
  if (prevId === itemId && prevQty === nextQty) return;

  if (prevId && prevQty > 0) {
    await execute('UPDATE inventory SET quantity = quantity + ? WHERE id = ?', [prevQty, prevId], client);
    await execute(
      'DELETE FROM inventory_usages WHERE order_id = ? AND item_id = ? AND note = ?',
      [orderId, prevId, WASTAGE_NOTE],
      client,
    );
  }

  if (!itemId || !(nextQty > 0)) return;

  const rows = await query(
    'SELECT id, item_name, quantity, unit FROM inventory WHERE id = ? LIMIT 1 FOR UPDATE',
    [itemId],
    client,
  );
  const item = rows[0];
  if (!item) throw ApiError.badRequest('The selected wastage item no longer exists');
  if (nextQty > Number(item.quantity)) {
    throw ApiError.badRequest(
      `Only ${item.quantity} ${item.unit || 'units'} of ${item.item_name} left in stock`,
    );
  }

  await execute('UPDATE inventory SET quantity = quantity - ? WHERE id = ?', [nextQty, itemId], client);
  await execute(
    `INSERT INTO inventory_usages (item_id, order_id, quantity, unit, used_by_user_id, note)
     VALUES (?,?,?,?,?,?)`,
    [itemId, orderId, nextQty, item.unit, user.id, WASTAGE_NOTE],
    client,
  );
}

/**
 * Creates an order and issues its tax invoice in a single transaction:
 * the TMP/NNNN/YY-YY number is reserved, the bills row is written and the order
 * opens in the `billed` state. There is no production workflow afterwards —
 * the order simply waits to be paid.
 */
export async function createOrder({ user, data, files = {} }) {
  validateCreateOrder(data);

  const orderId = await withTransaction(async (client) => {
    const customerId = await resolveCustomer(client, data);

    const productionType = first(data, 'productionType', 'production_type') ?? 'digital';
    const categoryId = toIntOrNull(first(data, 'categoryId', 'category_id'));
    let productName = first(data, 'productName', 'product_name');
    if (!productName) {
      let categoryName = null;
      if (categoryId) {
        const catRows = await query(
          'SELECT name FROM product_categories WHERE id = ? LIMIT 1',
          [categoryId],
          client,
        );
        categoryName = catRows[0]?.name ?? null;
      }
      productName = categoryName || 'Custom order';
    }

    const quantity = toInt(data.quantity, 1);
    // The form prices the product; delivery and cutting are charged on top and
    // all are billed as one GST-inclusive invoice total.
    const itemAmount = toDecimal(first(data, 'totalAmount', 'total_amount'), 0);
    const deliveryCharge = toDecimal(first(data, 'deliveryCharge', 'delivery_charge'), 0);
    const cuttingCharge = toDecimal(first(data, 'cuttingCharge', 'cutting_charge'), 0);
    const total = round2(itemAmount + deliveryCharge + cuttingCharge);
    const paid = toDecimal(first(data, 'paymentAmount', 'payment_amount'), 0);
    const balance = round2(total - paid);
    const paymentStatus = derivePaymentStatus(paid, balance);
    const gstRate = normalizeGstRate(first(data, 'gstRate', 'gst_rate'));
    const wastageItemId = toIntOrNull(first(data, 'wastageItemId', 'wastage_item_id'));
    const wastageQuantity = toDecimal(first(data, 'wastageQuantity', 'wastage_quantity'), 0);

    // Historical imports carry their original document date; everything else
    // is invoiced today.
    const orderDate = first(data, 'orderDate', 'order_date') || todayIso();
    const isHistorical = Boolean(first(data, 'isHistorical', 'is_historical'));

    const invoice = await nextInvoiceNumber(client, { date: orderDate });

    const paymentShots = files.paymentScreenshot ?? [];
    const paymentScreenshot = paymentShots[0] ? storedPath(paymentShots[0]) : null;

    const newOrderId = await insert(
      `INSERT INTO orders
        (order_number, financial_year, invoice_seq, customer_id, category_id, source,
         production_type, status, product_name, quantity, size, width, height,
         paper_type, printing_type, color, lamination, finishing_type, priority,
         special_instructions, hsn_code, gst_rate, unit, order_date, is_historical,
         payment_amount, payment_screenshot_path, delivery_charge, cutting_charge,
         dispatched_through, wastage_item_id,
         wastage_quantity, total_amount, paid_amount,
         balance_amount, amount_due, payment_status, created_by_user_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        invoice.invoiceNumber, invoice.financialYear, invoice.sequence,
        customerId, categoryId,
        isHistorical ? ORDER_SOURCE.IMPORT : ORDER_SOURCE.COUNTER,
        productionType, ORDER_STATUS.BILLED, productName,
        quantity, trimOrNull(first(data, 'size')),
        toDecimalOrNull(data.width), toDecimalOrNull(data.height),
        trimOrNull(first(data, 'paperType', 'paper_type')),
        trimOrNull(first(data, 'printingType', 'printing_type')),
        trimOrNull(first(data, 'color')), trimOrNull(first(data, 'lamination')),
        trimOrNull(first(data, 'finishingType', 'finishing_type')),
        first(data, 'priority') ?? 'normal',
        trimOrNull(first(data, 'specialInstructions', 'special_instructions')),
        trimOrNull(first(data, 'hsnCode', 'hsn_code')),
        gstRate, trimOrNull(first(data, 'unit')) ?? 'Nos', orderDate, isHistorical,
        paid, paymentScreenshot, deliveryCharge, cuttingCharge,
        trimOrNull(first(data, 'dispatchedThrough', 'dispatched_through')),
        wastageItemId, wastageQuantity,
        total, paid, balance, balance, paymentStatus, user.id,
      ],
      client,
    );

    await applyWastage(client, {
      orderId: newOrderId,
      user,
      itemId: wastageItemId,
      quantity: wastageQuantity,
    });

    await writeBill(client, {
      orderId: newOrderId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: orderDate,
      total,
      gstRate,
      quantity,
      notes: trimOrNull(first(data, 'billNotes', 'bill_notes')),
      userId: user.id,
    });

    // Per-design metadata arrives as parallel lists aligned with designFiles.
    const designSizes = asArray(data.designSize);
    const designQtys = asArray(data.designQuantity);
    const designNotes = asArray(data.designInstructions);
    const designFiles = files.designFiles ?? [];
    for (let i = 0; i < designFiles.length; i += 1) {
      const file = designFiles[i];
      await execute(
        `INSERT INTO order_files
           (order_id, file_name, file_path, file_type, size, quantity, instructions, uploaded_by_user_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          newOrderId, file.originalname, storedPath(file), file.mimetype,
          trimOrNull(designSizes[i]), toIntOrNull(designQtys[i]), trimOrNull(designNotes[i]),
          user.id,
        ],
        client,
      );
    }

    for (const file of paymentShots) {
      await execute(
        `INSERT INTO order_files (order_id, file_name, file_path, file_type, uploaded_by_user_id)
         VALUES (?,?,?,?,?)`,
        [newOrderId, file.originalname, storedPath(file), 'payment_screenshot', user.id],
        client,
      );
    }

    // Record the advance collected at the counter as its own transaction.
    if (paid > 0) {
      await execute(
        `INSERT INTO payments
           (order_id, customer_id, amount, payment_method, payment_type, payment_date,
            reference_no, recorded_by_user_id, notes, is_historical)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          newOrderId, customerId, paid,
          first(data, 'paymentMethod', 'payment_method') ?? 'cash',
          balance <= 0 ? 'full' : 'advance', orderDate,
          trimOrNull(first(data, 'referenceNo', 'reference_no')),
          user.id, 'Collected with order', isHistorical,
        ],
        client,
      );
    }

    await createNotification(
      {
        orderId: newOrderId,
        eventType: NOTIFICATION_EVENTS.ORDER_CREATED,
        title: `Invoice ${invoice.invoiceNumber} created`,
        message: `${productName} — ${balance > 0 ? 'balance outstanding' : 'fully paid'}`,
        triggeredByRole: user.role,
      },
      client,
    );

    return newOrderId;
  });

  return getOrderById(orderId);
}

/** Writes (or refreshes) the bills row that backs an order's tax invoice. */
async function writeBill(client, { orderId, invoiceNumber, invoiceDate, total, gstRate, quantity, notes, userId }) {
  const gst = computeGst({ total, gstRate, quantity });
  await execute(
    `INSERT INTO bills
       (order_id, bill_number, invoice_date, subtotal_amount, gst_rate,
        cgst_amount, sgst_amount, tax_amount, total_amount, notes, created_by_user_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (order_id) DO UPDATE SET
       bill_number = EXCLUDED.bill_number,
       invoice_date = EXCLUDED.invoice_date,
       subtotal_amount = EXCLUDED.subtotal_amount,
       gst_rate = EXCLUDED.gst_rate,
       cgst_amount = EXCLUDED.cgst_amount,
       sgst_amount = EXCLUDED.sgst_amount,
       tax_amount = EXCLUDED.tax_amount,
       total_amount = EXCLUDED.total_amount,
       notes = COALESCE(EXCLUDED.notes, bills.notes)`,
    [
      orderId, invoiceNumber, invoiceDate, gst.taxableValue, gst.gstRate,
      gst.cgstAmount, gst.sgstAmount, gst.totalTax, gst.grandTotal, notes ?? null, userId,
    ],
    client,
  );
}

function toDecimalOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Resolves the customer for an order. An explicit customerId (picked from the
 * search box) always wins; otherwise an existing customer is matched on phone
 * or name+company before a new one is created, so repeat walk-ins never
 * accumulate duplicate records.
 */
async function resolveCustomer(client, data) {
  const explicitId = toIntOrNull(first(data, 'customerId', 'customer_id'));
  if (explicitId) {
    const rows = await query('SELECT id FROM customers WHERE id = ? LIMIT 1', [explicitId], client);
    if (rows.length === 0) throw ApiError.badRequest('Selected customer no longer exists');
    return explicitId;
  }

  const name = trimOrNull(first(data, 'customerName', 'customer_name'));
  const phone = trimOrNull(first(data, 'customerPhone', 'customer_phone'));
  const companyName = trimOrNull(first(data, 'companyName', 'company_name'));
  if (!name) throw ApiError.badRequest('Customer name is required');

  const existing = await findDuplicateCustomer({ name, phone, companyName }, client);
  if (existing) return existing.id;

  return insert(
    `INSERT INTO customers (name, phone, email, address, company_name, gst_number, state, state_code)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      name, phone,
      trimOrNull(first(data, 'customerEmail', 'customer_email')),
      trimOrNull(first(data, 'customerAddress', 'customer_address')),
      companyName,
      trimOrNull(first(data, 'gstNumber', 'gst_number')),
      trimOrNull(first(data, 'state')),
      trimOrNull(first(data, 'stateCode', 'state_code')),
    ],
    client,
  );
}

// Column -> accepted request keys for order edits. Financial fields are handled
// separately because they also have to refresh the bill and payment status.
const EDITABLE_ORDER_FIELDS = [
  ['category_id', ['categoryId', 'category_id'], toIntOrNull],
  ['production_type', ['productionType', 'production_type'], (v) => (PRODUCTION_TYPES.includes(v) ? v : null)],
  ['product_name', ['productName', 'product_name'], trimOrNull],
  ['quantity', ['quantity'], (v) => toInt(v, 1)],
  ['size', ['size'], trimOrNull],
  ['priority', ['priority'], (v) => (PRIORITY_VALUES.includes(v) ? v : 'normal')],
  ['special_instructions', ['specialInstructions', 'special_instructions'], trimOrNull],
  ['hsn_code', ['hsnCode', 'hsn_code'], trimOrNull],
  ['unit', ['unit'], trimOrNull],
  ['dispatched_through', ['dispatchedThrough', 'dispatched_through'], trimOrNull],
];

/**
 * Edits an order. The invoice number, financial year and document date are
 * immutable once issued — a tax invoice cannot be renumbered or back-dated.
 * Changing the amount or GST rate re-derives the bill and the payment status.
 */
export async function updateOrder({ id, user, data = {} }) {
  await withTransaction(async (client) => {
    const rows = await query('SELECT * FROM orders WHERE id = ? LIMIT 1 FOR UPDATE', [id], client);
    const order = rows[0];
    if (!order) throw ApiError.notFound('Order not found');
    if (order.status === ORDER_STATUS.CANCELLED) {
      throw ApiError.badRequest('A cancelled order cannot be edited');
    }

    const updates = [];
    const params = [];
    for (const [column, keys, coerce] of EDITABLE_ORDER_FIELDS) {
      const value = first(data, ...keys);
      if (value === undefined) continue;
      updates.push(`${column} = ?`);
      params.push(coerce(value));
    }

    const rawTotal = first(data, 'totalAmount', 'total_amount');
    const rawGstRate = first(data, 'gstRate', 'gst_rate');
    // Delivery may legitimately be cleared to 0, so test for the key rather
    // than for a non-empty value.
    const deliveryKeyPresent = 'deliveryCharge' in data || 'delivery_charge' in data;
    const cuttingKeyPresent = 'cuttingCharge' in data || 'cutting_charge' in data;
    const wastageKeyPresent =
      'wastageItemId' in data || 'wastage_item_id' in data ||
      'wastageQuantity' in data || 'wastage_quantity' in data;

    if (wastageKeyPresent) {
      const wastageItemId = toIntOrNull(first(data, 'wastageItemId', 'wastage_item_id'));
      const wastageQuantity = wastageItemId
        ? toDecimal(first(data, 'wastageQuantity', 'wastage_quantity'), 0)
        : 0;
      await applyWastage(client, {
        orderId: id,
        user,
        itemId: wastageItemId,
        quantity: wastageQuantity,
        previous: {
          itemId: order.wastage_item_id ?? null,
          quantity: Number(order.wastage_quantity ?? 0),
        },
      });
      updates.push('wastage_item_id = ?', 'wastage_quantity = ?');
      params.push(wastageItemId, wastageQuantity);
    }

    const financialsChanged =
      rawTotal !== undefined || rawGstRate !== undefined || deliveryKeyPresent || cuttingKeyPresent;

    const previousDelivery = Number(order.delivery_charge ?? 0);
    const previousCutting = Number(order.cutting_charge ?? 0);
    const deliveryCharge = deliveryKeyPresent
      ? toDecimal(first(data, 'deliveryCharge', 'delivery_charge'), 0)
      : previousDelivery;
    const cuttingCharge = cuttingKeyPresent
      ? toDecimal(first(data, 'cuttingCharge', 'cutting_charge'), 0)
      : previousCutting;
    const itemAmount =
      rawTotal !== undefined
        ? toDecimal(rawTotal, 0)
        : round2(Number(order.total_amount) - previousDelivery - previousCutting);
    const total = round2(itemAmount + deliveryCharge + cuttingCharge);
    const gstRate = rawGstRate !== undefined ? normalizeGstRate(rawGstRate) : Number(order.gst_rate);
    const paid = Number(order.paid_amount);

    if (financialsChanged) {
      if (total < paid) {
        throw ApiError.badRequest(
          `Total cannot be less than the ${paid} already received. Refund or adjust the payments first.`,
        );
      }
      const balance = round2(total - paid);
      updates.push(
        'total_amount = ?', 'delivery_charge = ?', 'cutting_charge = ?', 'balance_amount = ?',
        'amount_due = ?', 'payment_status = ?', 'gst_rate = ?',
      );
      params.push(
        total, deliveryCharge, cuttingCharge, balance, balance, derivePaymentStatus(paid, balance), gstRate,
      );
    }

    if (updates.length === 0) return;
    params.push(id);
    await execute(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, params, client);

    const quantity =
      first(data, 'quantity') !== undefined ? toInt(data.quantity, 1) : Number(order.quantity ?? 1);

    await writeBill(client, {
      orderId: id,
      invoiceNumber: order.order_number,
      invoiceDate: order.order_date,
      total,
      gstRate,
      quantity,
      notes: trimOrNull(first(data, 'billNotes', 'bill_notes')),
      userId: user.id,
    });

    await execute(
      'INSERT INTO order_comments (order_id, user_id, comment, comment_type) VALUES (?,?,?,?)',
      [id, user.id, `Order updated by ${user.role}`, 'edit'],
      client,
    );
  });

  return getOrderById(id);
}


/** Updates an order status, enforcing the allowed transition map. */
export async function updateStatus({ id, toStatus, user, note }) {
  await withTransaction(async (client) => {
    const rows = await query(
      'SELECT id, order_number, status FROM orders WHERE id = ? LIMIT 1 FOR UPDATE',
      [id],
      client,
    );
    const order = rows[0];
    if (!order) throw ApiError.notFound('Order not found');
    if (order.status === toStatus) return;

    if (!canTransition(order.status, toStatus)) {
      throw ApiError.badRequest(`Cannot move order from "${order.status}" to "${toStatus}"`);
    }

    await execute('UPDATE orders SET status = ? WHERE id = ?', [toStatus, id], client);

    if (note) {
      await execute(
        'INSERT INTO order_comments (order_id, user_id, comment, comment_type) VALUES (?,?,?,?)',
        [id, user.id, note, 'status'],
        client,
      );
    }

    await createNotification(
      {
        orderId: id,
        eventType: NOTIFICATION_EVENTS.STATUS_CHANGED,
        title: `${order.order_number ?? `Order #${id}`} → ${toStatus}`,
        message: note ?? null,
        triggeredByRole: user.role,
      },
      client,
    );
  });

  return getOrderById(id);
}

export async function addComment({ id, user, comment }) {
  const rows = await query('SELECT id FROM orders WHERE id = ? LIMIT 1', [id]);
  if (rows.length === 0) throw ApiError.notFound('Order not found');

  await execute(
    'INSERT INTO order_comments (order_id, user_id, comment, comment_type) VALUES (?,?,?,?)',
    [id, user.id, comment, 'note'],
  );
  return getOrderById(id);
}

export async function addFiles({ id, user, files }) {
  const rows = await query('SELECT id FROM orders WHERE id = ? LIMIT 1', [id]);
  if (rows.length === 0) throw ApiError.notFound('Order not found');

  for (const file of files ?? []) {
    await execute(
      `INSERT INTO order_files (order_id, file_name, file_path, file_type, uploaded_by_user_id)
       VALUES (?,?,?,?,?)`,
      [id, file.originalname, storedPath(file), file.mimetype, user.id],
    );
  }
  return getOrderById(id);
}

/**
 * Permanently removes an order. Bills, design files, comments, delivery slips
 * and notifications cascade from the FK definitions; payments only SET NULL, so
 * they are removed explicitly rather than left orphaned in the ledger.
 */
export async function deleteOrder({ id } = {}) {
  const run = async (client) => {
    const rows = await query(
      'SELECT id, order_number FROM orders WHERE id = ? LIMIT 1 FOR UPDATE',
      [id],
      client,
    );
    const order = rows[0];
    if (!order) throw ApiError.notFound('Order not found');

    const files = await query('SELECT file_path FROM order_files WHERE order_id = ?', [id], client);
    await execute('DELETE FROM payments WHERE order_id = ?', [id], client);
    await execute('DELETE FROM inventory_usages WHERE order_id = ?', [id], client);
    await execute('DELETE FROM orders WHERE id = ?', [id], client);
    return { id, orderNumber: order.order_number, files };
  };

  const { files, ...result } = await withTransaction(run);
  await Promise.allSettled(
    files.map(({ file_path: filePath }) => fs.unlink(path.join(config.uploads.dir, path.basename(filePath)))),
  );
  return result;
}

/** Financial-year options plus the current label, for the orders/report filters. */
export function getFinancialYearContext() {
  return financialYearRange(new Date());
}

