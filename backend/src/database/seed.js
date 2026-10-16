import { closePool, execute, insert, withTransaction } from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import logger from '../config/logger.js';
import { ROLES } from '../constants/roles.js';
import { ORDER_STATUS, PAYMENT_STATUS, PRODUCTION_TYPE } from '../constants/orderStatus.js';
import { computeGst } from '../utils/gst.js';
import { financialYearLabel } from '../utils/financialYear.js';
import { formatInvoiceNumber } from '../utils/orderNumber.js';

const DEFAULT_PASSWORD = 'password123';

const USERS = [
  { name: 'System Admin', email: 'admin@printpress.com', role: ROLES.ADMIN, phone: '9800000001' },
  { name: 'Priya Accountant', email: 'accountant@printpress.com', role: ROLES.ACCOUNTANT, phone: '9800000003' },
];

const CATEGORIES = [
  { name: 'Business Cards', description: 'Standard and premium visiting cards' },
  { name: 'Flyers & Pamphlets', description: 'Single and multi-fold marketing flyers' },
  { name: 'Banners & Hoardings', description: 'Large format flex and vinyl banners' },
  { name: 'Brochures', description: 'Bi-fold and tri-fold brochures' },
  { name: 'Wedding Cards', description: 'Custom invitation printing' },
  { name: 'Stationery', description: 'Letterheads, envelopes, bill books' },
];

// Inventory taxonomy: group -> category -> types, plus the stock held per type.
const TAXONOMY = [
  {
    group: 'Offset',
    categories: [
      {
        name: 'Paper',
        types: [
          { name: 'Art Paper 300 GSM', item: { quantity: 5000, unit: 'sheets', min: 500, cost: 4.5, supplier: 'Paper World' } },
          { name: 'Maplitho 90 GSM', item: { quantity: 8000, unit: 'sheets', min: 800, cost: 2.1, supplier: 'Paper World' } },
        ],
      },
      {
        name: 'Ink',
        types: [
          { name: 'Cyan Ink', item: { quantity: 40, unit: 'litres', min: 10, cost: 850, supplier: 'InkTech' } },
          { name: 'Magenta Ink', item: { quantity: 8, unit: 'litres', min: 10, cost: 850, supplier: 'InkTech' } },
        ],
      },
      { name: 'Chemical', types: [{ name: 'Fountain Solution', item: { quantity: 25, unit: 'litres', min: 5, cost: 400, supplier: 'ChemCo' } }] },
    ],
  },
  {
    group: 'Plate',
    categories: [
      { name: 'Plate', types: [{ name: 'CTP Plate', item: { quantity: 300, unit: 'plates', min: 50, cost: 180, supplier: 'PlateHub' } }] },
      { name: 'Chemical', types: [{ name: 'Developer', item: { quantity: 18, unit: 'litres', min: 5, cost: 520, supplier: 'ChemCo' } }] },
    ],
  },
  {
    group: 'Digital',
    categories: [
      {
        name: 'Paper',
        types: [
          { name: 'Vinyl Flex Roll', item: { quantity: 120, unit: 'meters', min: 20, cost: 35, supplier: 'FlexPro' } },
          { name: 'Lamination Film Gloss', item: { quantity: 60, unit: 'rolls', min: 15, cost: 220, supplier: 'FinishRight' } },
        ],
      },
    ],
  },
];

const SETTINGS = [
  { setting_key: 'company_name', setting_value: 'TMP' },
  { setting_key: 'company_phone', setting_value: '+91 98000 00000' },
  { setting_key: 'company_address', setting_value: '12 Industrial Estate, Print Nagar, Bengaluru - 560058' },
  { setting_key: 'company_email', setting_value: 'accounts@printpress.com' },
  { setting_key: 'company_gst', setting_value: '29ABCDE1234F1Z5' },
  { setting_key: 'company_state', setting_value: 'Karnataka' },
  { setting_key: 'company_state_code', setting_value: '29' },
  { setting_key: 'currency', setting_value: 'INR' },
  { setting_key: 'invoice_prefix', setting_value: 'TMP' },
  { setting_key: 'default_gst_rate', setting_value: '18' },
  { setting_key: 'default_hsn_code', setting_value: '4911' },
  { setting_key: 'bank_account_name', setting_value: 'TMP' },
  { setting_key: 'bank_name', setting_value: 'State Bank of India' },
  { setting_key: 'bank_account_number', setting_value: '00000000000' },
  { setting_key: 'bank_branch_ifsc', setting_value: 'Peenya Branch & SBIN0000000' },
  {
    setting_key: 'invoice_declaration',
    setting_value:
      'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  },
  { setting_key: 'invoice_jurisdiction', setting_value: 'Bengaluru' },
];

async function truncateAll(client) {
  const tables = [
    'order_comments', 'notifications', 'delivery_slips', 'order_files',
    'payments', 'bills', 'inventory_usages', 'orders', 'product_categories', 'customers',
    'inventory', 'inventory_types', 'inventory_categories', 'inventory_groups',
    'invoice_sequences', 'import_batches', 'settings', 'users',
  ];
  // CASCADE clears dependent rows; RESTART IDENTITY resets the id sequences.
  await execute(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`, [], client);
}

async function seed() {
  await withTransaction(async (client) => {
    logger.info('Clearing existing data...');
    await truncateAll(client);

    // Users
    const passwordHash = await hashPassword(DEFAULT_PASSWORD);
    const userIds = {};
    for (const u of USERS) {
      userIds[u.email] = await insert(
        'INSERT INTO users (name, email, password, phone, role, is_active) VALUES (?,?,?,?,?,TRUE)',
        [u.name, u.email, passwordHash, u.phone, u.role],
        client,
      );
    }
    logger.info(`Seeded ${USERS.length} users (password: ${DEFAULT_PASSWORD})`);

    // Customers (no logins — the customer portal has been removed).
    const amitCustomerId = await insert(
      `INSERT INTO customers (name, phone, email, address, company_name, gst_number, state, state_code)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        'Amit Sharma', '9811111111', 'amit@example.com',
        '45 MG Road, Bengaluru, Karnataka 560001', 'Sharma Traders',
        '29AABCS1429B1ZX', 'Karnataka', '29',
      ],
      client,
    );

    // A walk-in customer
    const walkCustomerId = await insert(
      'INSERT INTO customers (name, phone, email, address, state, state_code) VALUES (?,?,?,?,?,?)',
      ['Neha Verma', '9822222222', 'neha@example.com', '7 Church Street, Bengaluru', 'Karnataka', '29'],
      client,
    );

    // Categories
    const categoryIds = [];
    for (const c of CATEGORIES) {
      categoryIds.push(
        await insert(
          'INSERT INTO product_categories (name, description, status) VALUES (?,?,?)',
          [c.name, c.description, 'active'],
          client,
        ),
      );
    }
    logger.info(`Seeded ${CATEGORIES.length} categories`);

    // Inventory taxonomy + stock
    let itemCount = 0;
    for (const group of TAXONOMY) {
      const groupId = await insert('INSERT INTO inventory_groups (name) VALUES (?)', [group.group], client);
      for (const category of group.categories) {
        const categoryId = await insert(
          'INSERT INTO inventory_categories (group_id, name) VALUES (?,?)',
          [groupId, category.name],
          client,
        );
        for (const type of category.types) {
          const typeId = await insert(
            'INSERT INTO inventory_types (category_id, name) VALUES (?,?)',
            [categoryId, type.name],
            client,
          );
          const stock = type.item;
          await execute(
            `INSERT INTO inventory
               (item_name, group_id, category_id, type_id, quantity, unit, min_quantity, cost_per_unit, supplier)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [
              type.name, groupId, categoryId, typeId,
              stock.quantity, stock.unit, stock.min, stock.cost, stock.supplier,
            ],
            client,
          );
          itemCount += 1;
        }
      }
    }
    logger.info(`Seeded inventory taxonomy with ${itemCount} stock items`);

    // Settings
    for (const s of SETTINGS) {
      await execute(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?,?)',
        [s.setting_key, s.setting_value],
        client,
      );
    }

    // Sample invoices across the current financial year. Each one is issued
    // with a TMP/NNNN/YY-YY number and its matching bill in the same step.
    const today = new Date();
    const fyLabel = financialYearLabel(today);
    const isoToday = today.toISOString().slice(0, 10);

    const sampleOrders = [
      { customer: amitCustomerId, status: ORDER_STATUS.BILLED, production: PRODUCTION_TYPE.DIGITAL, product: 'Premium Business Cards', qty: 1000, total: 1500, paid: 0 },
      { customer: amitCustomerId, status: ORDER_STATUS.BILLED, production: PRODUCTION_TYPE.OFFSET, product: 'Tri-fold Brochure', qty: 500, total: 4000, paid: 2000 },
      { customer: walkCustomerId, status: ORDER_STATUS.COMPLETED, production: PRODUCTION_TYPE.DIGITAL, product: 'Vinyl Banner 6x3', qty: 2, total: 2100, paid: 2100 },
      { customer: walkCustomerId, status: ORDER_STATUS.BILLED, production: PRODUCTION_TYPE.OFFSET, product: 'Wedding Card Set', qty: 300, total: 15000, paid: 10000 },
      { customer: amitCustomerId, status: ORDER_STATUS.COMPLETED, production: PRODUCTION_TYPE.OFFSET, product: 'Company Letterheads', qty: 2000, total: 3200, paid: 3200 },
      { customer: walkCustomerId, status: ORDER_STATUS.COMPLETED, production: PRODUCTION_TYPE.DIGITAL, product: 'Marketing Flyers A5', qty: 5000, total: 6500, paid: 6500 },
    ];

    for (const [index, o] of sampleOrders.entries()) {
      const sequence = index + 1;
      const invoiceNumber = formatInvoiceNumber('TMP', sequence, fyLabel);
      const balance = Number(o.total) - Number(o.paid);
      const paymentStatus =
        o.paid > 0 && balance <= 0 ? PAYMENT_STATUS.PAID : o.paid > 0 ? PAYMENT_STATUS.PARTIAL : PAYMENT_STATUS.UNPAID;
      const gst = computeGst({ total: o.total, gstRate: 18, quantity: o.qty });

      const orderId = await insert(
        `INSERT INTO orders
          (order_number, financial_year, invoice_seq, customer_id, category_id, source,
           production_type, status, product_name, quantity, unit, hsn_code, gst_rate,
           order_date, priority, payment_amount, total_amount, paid_amount, balance_amount,
           amount_due, payment_status, created_by_user_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          invoiceNumber, fyLabel, sequence, o.customer,
          categoryIds[index % categoryIds.length], 'counter', o.production, o.status,
          o.product, o.qty, 'Nos', '4911', 18, isoToday, 'normal',
          o.paid, o.total, o.paid, balance, balance, paymentStatus,
          userIds['accountant@printpress.com'],
        ],
        client,
      );

      await execute(
        `INSERT INTO bills
           (order_id, bill_number, invoice_date, subtotal_amount, gst_rate,
            cgst_amount, sgst_amount, tax_amount, total_amount, notes, created_by_user_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          orderId, invoiceNumber, isoToday, gst.taxableValue, gst.gstRate,
          gst.cgstAmount, gst.sgstAmount, gst.totalTax, gst.grandTotal, 'Seed bill',
          userIds['accountant@printpress.com'],
        ],
        client,
      );

      if (Number(o.paid) > 0) {
        await execute(
          `INSERT INTO payments
             (order_id, customer_id, amount, payment_method, payment_type, payment_date, recorded_by_user_id, notes)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            orderId, o.customer, o.paid, 'upi', balance > 0 ? 'partial' : 'full',
            isoToday, userIds['accountant@printpress.com'], 'Seed payment',
          ],
          client,
        );
      }
    }

    // Point the financial-year counter past the seeded invoices.
    await execute(
      `INSERT INTO invoice_sequences (prefix, financial_year, last_number) VALUES (?,?,?)
       ON CONFLICT (prefix, financial_year)
       DO UPDATE SET last_number = GREATEST(invoice_sequences.last_number, EXCLUDED.last_number)`,
      ['TMP', fyLabel, sampleOrders.length],
      client,
    );
    logger.info(`Seeded ${sampleOrders.length} invoices for FY ${fyLabel}`);
  });

  logger.info('Seeding complete. You can now log in with any seeded email + password123');
  await closePool();
}


seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Seeding failed', { stack: err.stack });
    process.exit(1);
  });
