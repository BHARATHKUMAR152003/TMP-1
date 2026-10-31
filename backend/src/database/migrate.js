
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import config from '../config/index.js';
import logger from '../config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tables whose updated_at should be maintained by a trigger.
const TIMESTAMPED_TABLES = ['users', 'customers', 'orders', 'inventory'];

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows[0].n > 0;
}

async function addColumn(client, table, column, definition) {
  if (await columnExists(client, table, column)) return;
  await client.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  logger.info(`  + ${table}.${column}`);
}

/**
 * Idempotent upgrades for databases created by an earlier schema revision.
 * Historical data is preserved.
 */
async function upgrade(client) {
  await client.query(
    "ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20), ALTER COLUMN role SET DEFAULT 'accountant'"
  );

  await client.query(
    "ALTER TABLE orders ALTER COLUMN status TYPE VARCHAR(30), ALTER COLUMN status SET DEFAULT 'new'"
  );

  await client.query(
    "ALTER TABLE orders ALTER COLUMN source TYPE VARCHAR(20), ALTER COLUMN source SET DEFAULT 'counter'"
  );

  await client.query(
    "ALTER TABLE orders ALTER COLUMN priority TYPE VARCHAR(10), ALTER COLUMN priority SET DEFAULT 'normal'"
  );

  await client.query('ALTER TABLE orders ALTER COLUMN order_number DROP NOT NULL');

  await addColumn(client, 'users', 'is_staff', 'is_staff BOOLEAN NOT NULL DEFAULT FALSE');
  await addColumn(client, 'users', 'is_superuser', 'is_superuser BOOLEAN NOT NULL DEFAULT FALSE');

  await client.query('ALTER TABLE users ALTER COLUMN is_staff SET DEFAULT FALSE');
  await client.query('ALTER TABLE users ALTER COLUMN is_superuser SET DEFAULT FALSE');

  await addColumn(client, 'orders', 'production_type', "production_type VARCHAR(10) NOT NULL DEFAULT 'digital'");
  await addColumn(client, 'orders', 'amount_due', 'amount_due NUMERIC(12,2) NOT NULL DEFAULT 0');
  await addColumn(client, 'orders', 'payment_status', "payment_status VARCHAR(10) NOT NULL DEFAULT 'unpaid'");
  await addColumn(client, 'orders', 'reported_payment_amount', 'reported_payment_amount NUMERIC(12,2) NOT NULL DEFAULT 0');
  await addColumn(client, 'orders', 'delivery_override_approved', 'delivery_override_approved BOOLEAN NOT NULL DEFAULT FALSE');

  await addColumn(client, 'order_files', 'size', 'size VARCHAR(120)');
  await addColumn(client, 'order_files', 'quantity', 'quantity INTEGER');
  await addColumn(client, 'order_files', 'instructions', 'instructions VARCHAR(500)');

  await addColumn(client, 'notifications', 'target_role', 'target_role VARCHAR(40)');

  await addColumn(client, 'inventory', 'group_id', 'group_id INTEGER REFERENCES inventory_groups (id) ON DELETE SET NULL');
  await addColumn(client, 'inventory', 'category_id', 'category_id INTEGER REFERENCES inventory_categories (id) ON DELETE SET NULL');
  await addColumn(client, 'inventory', 'type_id', 'type_id INTEGER REFERENCES inventory_types (id) ON DELETE SET NULL');

  await client.query(
    'UPDATE orders SET amount_due = balance_amount WHERE amount_due = 0 AND balance_amount <> 0'
  );

  await upgradeRoles(client);
  await upgradeInvoicing(client);
  await upgradeBillingAndPayments(client);
  await upgradeWastageAndDelivery(client);
  await upgradeCuttingAndDispatch(client);

  for (const table of TIMESTAMPED_TABLES) {
    await client.query(`DROP TRIGGER IF EXISTS trg_${table}_updated_at ON ${table}`);

    await client.query(
      `CREATE TRIGGER trg_${table}_updated_at BEFORE UPDATE ON ${table}
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()`,
    );
  }
}

/**
 * Two-role simplification.
 * Managers become admins; retired roles are deactivated, not deleted.
 */
async function upgradeRoles(client) {
  const promoted = await client.query(
    "UPDATE users SET role = 'admin' WHERE role = 'manager'"
  );

  if (promoted.rowCount) {
    logger.info(`  ~ ${promoted.rowCount} manager account(s) promoted to admin`);
  }

  const retired = await client.query(
    `UPDATE users SET is_active = FALSE
     WHERE role NOT IN ('admin', 'accountant') AND is_active = TRUE`,
  );

  if (retired.rowCount) {
    logger.info(
      `  ~ ${retired.rowCount} account(s) with retired roles deactivated`
    );
  }

  const closed = await client.query(
    `UPDATE orders SET status = 'completed'
     WHERE status IN ('accountant_approved','designing','design_approved','plate_making',
                      'printing','cutting','finishing','ready_for_delivery',
                      'out_for_delivery','delivered','on_hold')`,
  );

  if (closed.rowCount) {
    logger.info(`  ~ ${closed.rowCount} in-production order(s) marked completed`);
  }

  await client.query(
    "UPDATE orders SET status = 'cancelled' WHERE status = 'rejected'"
  );

  await client.query(
    "UPDATE orders SET payment_status = 'unpaid' WHERE payment_status = 'rejected'"
  );

  await client.query(
    "UPDATE orders SET source = 'counter' WHERE source IN ('customer','designer')"
  );
}

/** Invoice numbering: TMP/NNNN/YY-YY plus financial-year sequence. */
async function upgradeInvoicing(client) {
  await client.query('ALTER TABLE orders ALTER COLUMN order_number TYPE VARCHAR(40)');
  await client.query('ALTER TABLE bills ALTER COLUMN bill_number TYPE VARCHAR(40)');

  await addColumn(client, 'orders', 'financial_year', 'financial_year VARCHAR(7)');
  await addColumn(client, 'orders', 'invoice_seq', 'invoice_seq INTEGER');
  await addColumn(client, 'orders', 'hsn_code', 'hsn_code VARCHAR(12)');
  await addColumn(client, 'orders', 'gst_rate', 'gst_rate NUMERIC(5,2) NOT NULL DEFAULT 18');
  await addColumn(client, 'orders', 'unit', "unit VARCHAR(20) NOT NULL DEFAULT 'Nos'");
  await addColumn(client, 'orders', 'order_date', 'order_date DATE');
  await addColumn(client, 'orders', 'is_historical', 'is_historical BOOLEAN NOT NULL DEFAULT FALSE');

  await client.query(
    'UPDATE orders SET order_date = created_at::date WHERE order_date IS NULL'
  );

  await client.query(
    `UPDATE orders
     SET financial_year = split_part(order_number, '/', 3),
         invoice_seq = NULLIF(regexp_replace(split_part(order_number, '/', 2), '\\D', '', 'g'), '')::int
     WHERE order_number ~ '^[A-Za-z0-9]+/[0-9]+/[0-9]{2}-[0-9]{2}$'
       AND (financial_year IS NULL OR invoice_seq IS NULL)`,
  );

  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_invoice_seq
       ON orders (financial_year, invoice_seq)
       WHERE financial_year IS NOT NULL AND invoice_seq IS NOT NULL`,
  );

  await client.query(
    `INSERT INTO invoice_sequences (prefix, financial_year, last_number)
     SELECT split_part(order_number, '/', 1), financial_year, MAX(invoice_seq)
     FROM orders
     WHERE financial_year IS NOT NULL AND invoice_seq IS NOT NULL
     GROUP BY 1, 2
     ON CONFLICT (prefix, financial_year)
     DO UPDATE SET last_number = GREATEST(invoice_sequences.last_number, EXCLUDED.last_number)`,
  );
}

/** Tax breakdown, payment history and buyer state. */
async function upgradeBillingAndPayments(client) {
  await addColumn(client, 'bills', 'invoice_date', 'invoice_date DATE');
  await addColumn(client, 'bills', 'gst_rate', 'gst_rate NUMERIC(5,2) NOT NULL DEFAULT 18');
  await addColumn(client, 'bills', 'cgst_amount', 'cgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0');
  await addColumn(client, 'bills', 'sgst_amount', 'sgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0');

  await client.query(
    'UPDATE bills SET invoice_date = created_at::date WHERE invoice_date IS NULL'
  );

  await addColumn(client, 'payments', 'reference_no', 'reference_no VARCHAR(120)');
  await addColumn(client, 'payments', 'is_historical', 'is_historical BOOLEAN NOT NULL DEFAULT FALSE');

  await client.query(
    'UPDATE payments SET payment_date = created_at::date WHERE payment_date IS NULL'
  );

  await addColumn(client, 'customers', 'state', 'state VARCHAR(80)');
  await addColumn(client, 'customers', 'state_code', 'state_code VARCHAR(4)');

  await client.query('CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders (order_date)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date)');
}

/** Delivery charge and wastage tracking. */
async function upgradeWastageAndDelivery(client) {
  await addColumn(client, 'orders', 'delivery_charge', 'delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0');
  await addColumn(client, 'orders', 'wastage_item_id', 'wastage_item_id INTEGER');
  await addColumn(client, 'orders', 'wastage_quantity', 'wastage_quantity NUMERIC(12,2) NOT NULL DEFAULT 0');

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_wastage_item'
      ) THEN
        ALTER TABLE orders ADD CONSTRAINT fk_orders_wastage_item
          FOREIGN KEY (wastage_item_id) REFERENCES inventory (id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await client.query(
    'CREATE INDEX IF NOT EXISTS idx_orders_wastage_item ON orders (wastage_item_id)'
  );
}

/** Cutting charge and dispatch carrier. */
async function upgradeCuttingAndDispatch(client) {
  await addColumn(client, 'orders', 'cutting_charge', 'cutting_charge NUMERIC(12,2) NOT NULL DEFAULT 0');
  await addColumn(client, 'orders', 'dispatched_through', 'dispatched_through VARCHAR(120)');
}

/**
 * Supabase-compatible migration.
 *
 * Supabase creates and manages the PostgreSQL database.
 * This script only applies schema.sql and schema upgrades.
 *
 * Usage:
 *   npm run migrate
 *
 * Destructive database resets are intentionally disabled.
 */
async function migrate() {
  if (process.argv.includes('--fresh')) {
    throw new Error(
      'Fresh database reset is disabled. ' +
      'Use a separate development database for destructive resets.'
    );
  }

  const client = new pg.Client({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl
      ? { rejectUnauthorized: config.db.sslRejectUnauthorized }
      : false,
    connectionTimeoutMillis: 15000,
  });

  logger.info(
    `Connecting to PostgreSQL database "${config.db.database}"...`
  );

  await client.connect();

  try {
    const schema = await fs.readFile(
      path.join(__dirname, 'schema.sql'),
      'utf8'
    );

    logger.info('Applying database schema...');

    await client.query(schema);

    logger.info('Applying idempotent database upgrades...');

    await upgrade(client);

    logger.info(
      `Migration completed successfully on "${config.db.database}"`
    );
  } finally {
    await client.end();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Migration failed', { stack: err.stack });
    process.exit(1);
  });
