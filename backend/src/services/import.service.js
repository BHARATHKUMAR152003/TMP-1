import { execute, insert, query, withTransaction } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { round2, toInt, trimOrNull } from '../utils/values.js';
import { financialYearLabel } from '../utils/financialYear.js';
import { normalizeGstRate } from '../utils/gst.js';
import { nextInvoiceNumber, reserveInvoiceNumber } from '../utils/orderNumber.js';
import { findDuplicateCustomer } from './customer.service.js';
import { ORDER_SOURCE, ORDER_STATUS, PAYMENT_METHODS, PAYMENT_STATUS } from '../constants/index.js';

/**
 * Historical data migration.
 *
 * Old company records (Excel / CSV / SQL dumps / a previous database) are
 * imported into the SAME tables as current data — there is no separate "old
 * data" module. Two rules make that safe:
 *
 *  1. Original dates are preserved. `order_date` / `payment_date` hold the real
 *     document date; `created_at` records when the row entered this system.
 *  2. Original invoice numbers are preserved when supplied. If one matches the
 *     TMP/NNNN/YY-YY shape the financial-year counter is raised past it, so
 *     newly created invoices can never collide with an imported one.
 *
 * Every import runs as `dryRun` first by default: rows are validated, cleaned
 * and duplicate-checked, and a report is returned without writing anything.
 */

export const IMPORT_ENTITIES = Object.freeze(['customers', 'orders', 'payments', 'inventory']);

// Accepted source column names for each canonical field. Matching is done on a
// normalised key (lower-case, alphanumerics only) so "Customer Name",
// "customer_name" and "CUSTOMERNAME" all resolve to the same field.
const COLUMN_ALIASES = {
  customers: {
    name: ['name', 'customername', 'party', 'partyname', 'client'],
    phone: ['phone', 'mobile', 'contact', 'phoneno', 'mobileno'],
    email: ['email', 'emailid', 'mail'],
    address: ['address', 'billingaddress', 'addr'],
    companyName: ['company', 'companyname', 'firm', 'firmname'],
    gstNumber: ['gst', 'gstin', 'gstno', 'gstnumber', 'gstinuin'],
    state: ['state', 'statename'],
    stateCode: ['statecode', 'code'],
  },
  orders: {
    invoiceNumber: ['invoiceno', 'invoicenumber', 'billno', 'billnumber', 'orderno', 'ordernumber'],
    orderDate: ['date', 'invoicedate', 'billdate', 'orderdate'],
    customerName: ['customer', 'customername', 'party', 'partyname'],
    customerPhone: ['phone', 'customerphone', 'mobile'],
    companyName: ['company', 'companyname', 'firm'],
    gstNumber: ['gst', 'gstin', 'gstno', 'customergst'],
    address: ['address', 'customeraddress', 'billingaddress'],
    state: ['state', 'statename'],
    stateCode: ['statecode'],
    productName: ['product', 'productname', 'description', 'particulars', 'item', 'itemname'],
    category: ['category', 'productcategory', 'group'],
    quantity: ['qty', 'quantity'],
    unit: ['unit', 'uom', 'per'],
    size: ['size'],
    hsnCode: ['hsn', 'hsnsac', 'hsncode', 'sac'],
    gstRate: ['gstrate', 'taxrate', 'gst%', 'rate%'],
    totalAmount: ['total', 'totalamount', 'grandtotal', 'amount', 'invoiceamount', 'netamount'],
    paidAmount: ['paid', 'paidamount', 'received', 'receivedamount'],
    productionType: ['type', 'productiontype', 'printtype'],
    notes: ['notes', 'remarks', 'narration'],
  },
  payments: {
    invoiceNumber: ['invoiceno', 'invoicenumber', 'billno', 'orderno', 'ordernumber'],
    paymentDate: ['date', 'paymentdate', 'receiptdate'],
    amount: ['amount', 'paid', 'paidamount', 'receivedamount'],
    method: ['method', 'mode', 'paymentmode', 'paymentmethod'],
    referenceNo: ['reference', 'referenceno', 'refno', 'utr', 'chequeno', 'transactionid'],
    notes: ['notes', 'remarks', 'narration'],
  },
  inventory: {
    itemName: ['item', 'itemname', 'name', 'material', 'description'],
    group: ['group', 'groupname'],
    category: ['category', 'categoryname'],
    type: ['type', 'typename'],
    quantity: ['qty', 'quantity', 'stock', 'closingstock'],
    unit: ['unit', 'uom'],
    minQuantity: ['min', 'minqty', 'minquantity', 'reorderlevel', 'minimum'],
    costPerUnit: ['cost', 'rate', 'costperunit', 'unitcost', 'price'],
    supplier: ['supplier', 'vendor', 'party'],
  },
};

function normalizeKey(key) {
  return String(key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Maps one source row onto the canonical field names.
 * @param {object} row        Raw row from the spreadsheet / query.
 * @param {object} aliases    Canonical field -> accepted source names.
 * @param {object} mapping    Optional explicit override: canonical -> source column.
 */
function mapRow(row, aliases, mapping = {}) {
  const normalised = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    normalised[normalizeKey(key)] = value;
  }

  const out = {};
  for (const [field, candidates] of Object.entries(aliases)) {
    const override = mapping[field];
    if (override) {
      out[field] = row?.[override] ?? normalised[normalizeKey(override)];
      continue;
    }
    for (const candidate of candidates) {
      const value = normalised[normalizeKey(candidate)];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        out[field] = value;
        break;
      }
    }
  }
  return out;
}

/** Parses the many date shapes old exports use into an ISO date, or null. */
export function parseImportDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  // Already ISO.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy — day first, as used on Indian invoices.
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // dd-MMM-yy / dd-MMM-yyyy (the format printed on the invoice).
  const dMy = /^(\d{1,2})[\s/-]([A-Za-z]{3,})[\s/-](\d{2}|\d{4})$/.exec(text);
  if (dMy) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.indexOf(dMy[2].slice(0, 3).toLowerCase()) + 1;
    let year = Number(dMy[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month > 0) {
      return `${year}-${String(month).padStart(2, '0')}-${String(dMy[1]).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/** Strips currency symbols, thousands separators and stray spaces. */
export function parseImportAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMethod(value) {
  const key = normalizeKey(value);
  if (!key) return 'other';
  if (key.includes('cash')) return 'cash';
  if (key.includes('upi') || key.includes('gpay') || key.includes('phonepe')) return 'upi';
  if (key.includes('cheque') || key.includes('check')) return 'cheque';
  if (key.includes('card')) return 'card';
  if (key.includes('bank') || key.includes('neft') || key.includes('rtgs') || key.includes('imps')) {
    return 'bank_transfer';
  }
  return PAYMENT_METHODS.includes(key) ? key : 'other';
}

// ---------------------------------------------------------------------------
// Per-entity row handlers. Each validates, then writes when not a dry run.
// ---------------------------------------------------------------------------

async function importCustomerRow(client, raw, mapping, dryRun) {
  const data = mapRow(raw, COLUMN_ALIASES.customers, mapping);
  const name = trimOrNull(data.name);
  if (!name) throw new Error('Customer name is required');

  const duplicate = await findDuplicateCustomer(
    { name, phone: data.phone, companyName: data.companyName },
    client,
  );
  if (duplicate) {
    return { action: 'skipped', reason: `Matches existing customer #${duplicate.id} (${duplicate.name})`, id: duplicate.id };
  }
  if (dryRun) return { action: 'imported', preview: { name, phone: trimOrNull(data.phone) } };

  const id = await insert(
    `INSERT INTO customers (name, phone, email, address, company_name, gst_number, state, state_code)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      name, trimOrNull(data.phone), trimOrNull(data.email), trimOrNull(data.address),
      trimOrNull(data.companyName), trimOrNull(data.gstNumber),
      trimOrNull(data.state), trimOrNull(data.stateCode),
    ],
    client,
  );
  return { action: 'imported', id };
}

/** Finds-or-creates the customer referenced by a historical order row. */
async function resolveImportCustomer(client, data, dryRun) {
  const name = trimOrNull(data.customerName) ?? 'Walk-in customer';
  const existing = await findDuplicateCustomer(
    { name, phone: data.customerPhone, companyName: data.companyName },
    client,
  );
  if (existing) return existing.id;
  if (dryRun) return null;

  return insert(
    `INSERT INTO customers (name, phone, email, address, company_name, gst_number, state, state_code)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      name, trimOrNull(data.customerPhone), null, trimOrNull(data.address),
      trimOrNull(data.companyName), trimOrNull(data.gstNumber),
      trimOrNull(data.state), trimOrNull(data.stateCode),
    ],
    client,
  );
}

async function resolveCategory(client, name, dryRun) {
  const clean = trimOrNull(name);
  if (!clean) return null;
  const rows = await query(
    'SELECT id FROM product_categories WHERE LOWER(name) = LOWER(?) LIMIT 1',
    [clean],
    client,
  );
  if (rows.length > 0) return rows[0].id;
  if (dryRun) return null;
  return insert('INSERT INTO product_categories (name) VALUES (?)', [clean], client);
}

async function importOrderRow(client, raw, mapping, dryRun) {
  const data = mapRow(raw, COLUMN_ALIASES.orders, mapping);

  const orderDate = parseImportDate(data.orderDate);
  if (!orderDate) throw new Error('A valid invoice date is required (historical dates are never replaced)');

  const total = round2(parseImportAmount(data.totalAmount));
  if (total < 0) throw new Error('Total amount cannot be negative');

  const paid = round2(Math.min(parseImportAmount(data.paidAmount), total));
  const balance = round2(total - paid);

  // Preserve the original invoice number when one is supplied.
  const suppliedNumber = trimOrNull(data.invoiceNumber);
  if (suppliedNumber) {
    const clash = await query(
      'SELECT id FROM orders WHERE order_number = ? LIMIT 1',
      [suppliedNumber],
      client,
    );
    if (clash.length > 0) {
      return { action: 'skipped', reason: `Invoice ${suppliedNumber} is already imported`, id: clash[0].id };
    }
  }

  if (dryRun) {
    return {
      action: 'imported',
      preview: {
        invoiceNumber: suppliedNumber ?? `(auto) .../${financialYearLabel(orderDate)}`,
        orderDate,
        customer: trimOrNull(data.customerName),
        total,
        paid,
      },
    };
  }

  const customerId = await resolveImportCustomer(client, data, dryRun);
  const categoryId = await resolveCategory(client, data.category, dryRun);

  let invoiceNumber = suppliedNumber;
  let financialYear = financialYearLabel(orderDate);
  let invoiceSeq = null;

  if (invoiceNumber) {
    const parsed = await reserveInvoiceNumber(client, invoiceNumber);
    if (parsed) {
      financialYear = parsed.financialYear;
      invoiceSeq = parsed.sequence;
    }
  } else {
    const issued = await nextInvoiceNumber(client, { date: orderDate });
    invoiceNumber = issued.invoiceNumber;
    financialYear = issued.financialYear;
    invoiceSeq = issued.sequence;
  }

  const quantity = Math.max(toInt(data.quantity, 1), 1);
  const gstRate = normalizeGstRate(data.gstRate);
  const paymentStatus =
    balance <= 0 && paid > 0 ? PAYMENT_STATUS.PAID
      : paid > 0 ? PAYMENT_STATUS.PARTIAL
        : PAYMENT_STATUS.UNPAID;

  const orderId = await insert(
    `INSERT INTO orders
      (order_number, financial_year, invoice_seq, customer_id, category_id, source,
       production_type, status, product_name, quantity, unit, size, hsn_code, gst_rate,
       order_date, is_historical, special_instructions, total_amount, paid_amount,
       balance_amount, amount_due, payment_status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,?,?,?,?,?,?,NOW())`,
    [
      invoiceNumber, financialYear, invoiceSeq, customerId, categoryId, ORDER_SOURCE.IMPORT,
      trimOrNull(data.productionType) === 'offset' ? 'offset' : 'digital',
      balance <= 0 ? ORDER_STATUS.COMPLETED : ORDER_STATUS.BILLED,
      trimOrNull(data.productName) ?? 'Historical order',
      quantity, trimOrNull(data.unit) ?? 'Nos', trimOrNull(data.size),
      trimOrNull(data.hsnCode), gstRate, orderDate,
      trimOrNull(data.notes), total, paid, balance, balance, paymentStatus,
    ],
    client,
  );

  const taxable = round2(total / (1 + gstRate / 100));
  const tax = round2(total - taxable);
  const cgst = round2(tax / 2);
  await execute(
    `INSERT INTO bills
       (order_id, bill_number, invoice_date, subtotal_amount, gst_rate,
        cgst_amount, sgst_amount, tax_amount, total_amount, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [orderId, invoiceNumber, orderDate, taxable, gstRate, cgst, round2(tax - cgst), tax, total, 'Imported'],
    client,
  );

  // An opening paid amount with no payment rows of its own becomes a single
  // historical receipt so Payments and customer history stay consistent.
  if (paid > 0) {
    await execute(
      `INSERT INTO payments
         (order_id, customer_id, amount, payment_method, payment_type, payment_date,
          notes, is_historical)
       VALUES (?,?,?,?,?,?,?,TRUE)`,
      [orderId, customerId, paid, 'other', balance <= 0 ? 'full' : 'partial', orderDate, 'Imported opening receipt'],
      client,
    );
  }

  return { action: 'imported', id: orderId, invoiceNumber };
}

async function importPaymentRow(client, raw, mapping, dryRun) {
  const data = mapRow(raw, COLUMN_ALIASES.payments, mapping);

  const invoiceNumber = trimOrNull(data.invoiceNumber);
  if (!invoiceNumber) throw new Error('Invoice number is required to attach the payment');

  const paymentDate = parseImportDate(data.paymentDate);
  if (!paymentDate) throw new Error('A valid payment date is required');

  const amount = round2(parseImportAmount(data.amount));
  if (!(amount > 0)) throw new Error('Payment amount must be greater than zero');

  const rows = await query(
    'SELECT id, customer_id, total_amount, paid_amount FROM orders WHERE order_number = ? LIMIT 1 FOR UPDATE',
    [invoiceNumber],
    client,
  );
  const order = rows[0];
  if (!order) throw new Error(`No invoice found for "${invoiceNumber}"`);

  const newPaid = round2(Number(order.paid_amount) + amount);
  if (newPaid > Number(order.total_amount) + 0.01) {
    throw new Error(`Payment would exceed the invoice total of ${order.total_amount}`);
  }
  if (dryRun) return { action: 'imported', preview: { invoiceNumber, paymentDate, amount } };

  const newBalance = round2(Number(order.total_amount) - newPaid);
  await insert(
    `INSERT INTO payments
       (order_id, customer_id, amount, payment_method, payment_type, payment_date,
        reference_no, notes, is_historical)
     VALUES (?,?,?,?,?,?,?,?,TRUE)`,
    [
      order.id, order.customer_id, amount, normalizeMethod(data.method),
      newBalance <= 0 ? 'full' : 'partial', paymentDate,
      trimOrNull(data.referenceNo), trimOrNull(data.notes),
    ],
    client,
  );
  await execute(
    `UPDATE orders SET paid_amount = ?, balance_amount = ?, amount_due = ?, payment_status = ?
     WHERE id = ?`,
    [
      newPaid, newBalance, newBalance,
      newBalance <= 0 ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PARTIAL,
      order.id,
    ],
    client,
  );

  return { action: 'imported', id: order.id };
}

async function resolveTaxonomy(client, { group, category, type }, dryRun) {
  const upsert = async (table, name, parentColumn, parentId) => {
    const clean = trimOrNull(name);
    if (!clean) return null;
    const where = parentColumn ? `${parentColumn} = ? AND LOWER(name) = LOWER(?)` : 'LOWER(name) = LOWER(?)';
    const params = parentColumn ? [parentId, clean] : [clean];
    const rows = await query(`SELECT id FROM ${table} WHERE ${where} LIMIT 1`, params, client);
    if (rows.length > 0) return rows[0].id;
    if (dryRun) return null;
    return parentColumn
      ? insert(`INSERT INTO ${table} (${parentColumn}, name) VALUES (?,?)`, [parentId, clean], client)
      : insert(`INSERT INTO ${table} (name) VALUES (?)`, [clean], client);
  };

  const groupId = await upsert('inventory_groups', group, null, null);
  const categoryId = groupId ? await upsert('inventory_categories', category, 'group_id', groupId) : null;
  const typeId = categoryId ? await upsert('inventory_types', type, 'category_id', categoryId) : null;
  return { groupId, categoryId, typeId };
}

async function importInventoryRow(client, raw, mapping, dryRun) {
  const data = mapRow(raw, COLUMN_ALIASES.inventory, mapping);
  const itemName = trimOrNull(data.itemName);
  if (!itemName) throw new Error('Item name is required');

  const existing = await query(
    'SELECT id FROM inventory WHERE LOWER(item_name) = LOWER(?) LIMIT 1',
    [itemName],
    client,
  );
  if (existing.length > 0) {
    return { action: 'skipped', reason: `Stock item "${itemName}" already exists`, id: existing[0].id };
  }
  if (dryRun) return { action: 'imported', preview: { itemName, quantity: parseImportAmount(data.quantity) } };

  const { groupId, categoryId, typeId } = await resolveTaxonomy(client, data, dryRun);
  const id = await insert(
    `INSERT INTO inventory
       (item_name, group_id, category_id, type_id, quantity, unit, min_quantity, cost_per_unit, supplier)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      itemName, groupId, categoryId, typeId,
      parseImportAmount(data.quantity), trimOrNull(data.unit),
      parseImportAmount(data.minQuantity), parseImportAmount(data.costPerUnit),
      trimOrNull(data.supplier),
    ],
    client,
  );
  return { action: 'imported', id };
}

const HANDLERS = {
  customers: importCustomerRow,
  orders: importOrderRow,
  payments: importPaymentRow,
  inventory: importInventoryRow,
};

/**
 * Runs an import batch.
 *
 * @param {object}  params
 * @param {object}  params.user      The admin performing the import.
 * @param {string}  params.entity    One of IMPORT_ENTITIES.
 * @param {Array}   params.rows      Parsed source rows (objects keyed by column).
 * @param {object}  params.mapping   Optional canonical -> source column overrides.
 * @param {boolean} params.dryRun    Validate only (default true).
 * @param {string}  params.sourceName Original file name, for the audit trail.
 * @returns {Promise<object>} Import summary with per-row errors.
 */
export async function runImport({ user, entity, rows, mapping = {}, dryRun = true, sourceName = null }) {
  if (!IMPORT_ENTITIES.includes(entity)) {
    throw ApiError.badRequest(`entity must be one of: ${IMPORT_ENTITIES.join(', ')}`);
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw ApiError.badRequest('No rows to import');
  }
  if (rows.length > 5000) {
    throw ApiError.badRequest('Import up to 5000 rows per batch');
  }

  const handler = HANDLERS[entity];
  const imported = [];
  const skipped = [];
  const failed = [];

  await withTransaction(async (client) => {
    for (let i = 0; i < rows.length; i += 1) {
      // Each row gets its own savepoint: one bad row cannot abort the batch,
      // and a dry run leaves the database exactly as it found it.
      await client.query('SAVEPOINT import_row');
      try {
        const result = await handler(client, rows[i], mapping, dryRun);
        await client.query('RELEASE SAVEPOINT import_row');
        const record = { row: i + 1, ...result };
        if (result.action === 'skipped') skipped.push(record);
        else imported.push(record);
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT import_row');
        failed.push({ row: i + 1, error: error.message });
      }
    }

    if (dryRun) throw new DryRunComplete();
  }).catch((error) => {
    if (!(error instanceof DryRunComplete)) throw error;
  });

  const report = {
    entity,
    dryRun,
    totalRows: rows.length,
    imported: imported.length,
    skipped: skipped.length,
    failed: failed.length,
    samples: imported.slice(0, 10),
    skippedRows: skipped.slice(0, 100),
    errors: failed.slice(0, 100),
  };

  await execute(
    `INSERT INTO import_batches
       (entity, source_name, dry_run, total_rows, imported_rows, skipped_rows, failed_rows, report, created_by_user_id)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      entity, sourceName, dryRun, rows.length, imported.length, skipped.length,
      failed.length, JSON.stringify(report), user.id,
    ],
  );

  return report;
}

/** Signals the end of a successful dry run so the transaction rolls back. */
class DryRunComplete extends Error {}

export function listImportBatches(limit = 25) {
  return query(
    `SELECT b.id, b.entity, b.source_name, b.dry_run, b.total_rows, b.imported_rows,
            b.skipped_rows, b.failed_rows, b.created_at, u.name AS created_by
     FROM import_batches b LEFT JOIN users u ON u.id = b.created_by_user_id
     ORDER BY b.created_at DESC LIMIT ${Math.min(Math.max(Number(limit) || 25, 1), 100)}`,
  );
}

/** The canonical fields and accepted source column names, for the mapping UI. */
export function getImportTemplate(entity) {
  if (!IMPORT_ENTITIES.includes(entity)) {
    throw ApiError.badRequest(`entity must be one of: ${IMPORT_ENTITIES.join(', ')}`);
  }
  return {
    entity,
    fields: Object.entries(COLUMN_ALIASES[entity]).map(([field, aliases]) => ({ field, aliases })),
  };
}
