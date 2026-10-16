-- ============================================================
-- PrintPress Database Schema (PostgreSQL 13+)
-- Applied by src/database/migrate.js, which then runs the
-- idempotent upgrade steps for databases created earlier.
-- ============================================================

-- Keeps updated_at current without an application-side write.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL UNIQUE,
  password       VARCHAR(255) NOT NULL,
  phone          VARCHAR(20),
  role           VARCHAR(20) NOT NULL DEFAULT 'customer',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_staff       BOOLEAN NOT NULL DEFAULT FALSE,
  is_superuser   BOOLEAN NOT NULL DEFAULT FALSE,
  avatar         VARCHAR(255),
  last_login     TIMESTAMP,
  otp_code       VARCHAR(10),
  otp_expires_at TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- ---------- customers ----------
-- state / state_code are printed on the tax invoice's buyer block.
CREATE TABLE IF NOT EXISTS customers (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  name         VARCHAR(120) NOT NULL,
  phone        VARCHAR(20),
  email        VARCHAR(160),
  address      VARCHAR(500),
  gst_number   VARCHAR(30),
  company_name VARCHAR(160),
  state        VARCHAR(80),
  state_code   VARCHAR(4),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers (user_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name);

-- ---------- product_categories ----------
CREATE TABLE IF NOT EXISTS product_categories (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(500),
  status      VARCHAR(10) NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- invoice_sequences ----------
-- One counter per (prefix, financial year). Reserving a number is a single
-- atomic UPSERT, which is what guarantees invoice numbers are never duplicated
-- across concurrent users, retries or restarts. Sequences restart at 1 each
-- financial year, so TMP/0001/26-27 and TMP/0001/27-28 can both exist.
CREATE TABLE IF NOT EXISTS invoice_sequences (
  id             SERIAL PRIMARY KEY,
  prefix         VARCHAR(10) NOT NULL,
  financial_year VARCHAR(7) NOT NULL,
  last_number    INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (prefix, financial_year)
);

-- ---------- orders ----------
-- order_number holds the user-facing invoice number (TMP/0001/26-27) and is
-- assigned the moment the order is created. It is NULL only for legacy drafts.
CREATE TABLE IF NOT EXISTS orders (
  id                      SERIAL PRIMARY KEY,
  order_number            VARCHAR(40) UNIQUE,
  customer_id             INTEGER REFERENCES customers (id) ON DELETE SET NULL,
  category_id             INTEGER REFERENCES product_categories (id) ON DELETE SET NULL,
  source                  VARCHAR(20) NOT NULL DEFAULT 'customer',
  production_type         VARCHAR(10) NOT NULL DEFAULT 'digital',
  status                  VARCHAR(30) NOT NULL DEFAULT 'new',
  product_name            VARCHAR(160) NOT NULL,
  quantity                INTEGER NOT NULL DEFAULT 1,
  size                    VARCHAR(60),
  width                   NUMERIC(10,2),
  height                  NUMERIC(10,2),
  paper_type              VARCHAR(80),
  printing_type           VARCHAR(80),
  color                   VARCHAR(60),
  lamination              VARCHAR(60),
  finishing_type          VARCHAR(80),
  priority                VARCHAR(10) NOT NULL DEFAULT 'normal',
  special_instructions    TEXT,
  -- Invoice identity: sequence + financial year behind order_number.
  financial_year          VARCHAR(7),
  invoice_seq             INTEGER,
  -- Tax-invoice line details.
  hsn_code                VARCHAR(12),
  gst_rate                NUMERIC(5,2) NOT NULL DEFAULT 18,
  unit                    VARCHAR(20) NOT NULL DEFAULT 'Nos',
  -- Document date. For imported historical records this is the ORIGINAL date;
  -- created_at always records when the row entered this system.
  order_date              DATE,
  is_historical           BOOLEAN NOT NULL DEFAULT FALSE,
  payment_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_screenshot_path VARCHAR(255),
  -- Delivery and cutting are charged on top of the product amount; total_amount
  -- already includes both, so item_amount = total_amount - delivery - cutting.
  delivery_charge         NUMERIC(12,2) NOT NULL DEFAULT 0,
  cutting_charge          NUMERIC(12,2) NOT NULL DEFAULT 0,
  dispatched_through      VARCHAR(120),
  -- Stock consumed as wastage on this job. Booked against inventory_usages.
  -- The FK to inventory is added by migrate.js, which runs after that table.
  wastage_item_id         INTEGER,
  wastage_quantity        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- amount_due mirrors balance_amount; delivery is blocked while it is > 0.
  amount_due              NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status          VARCHAR(10) NOT NULL DEFAULT 'unpaid',
  -- What the customer claims to have paid when uploading a screenshot
  -- (informational only — the accountant records the verified payment).
  reported_payment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Accountant may permit dispatch even while a balance is due.
  delivery_override_approved BOOLEAN NOT NULL DEFAULT FALSE,
  delivered_at            TIMESTAMP,
  created_by_user_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  assigned_operator_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  assigned_delivery_id    INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);
-- The same sequence number may repeat across financial years but never within
-- one: this is the database-level guarantee behind invoice uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_invoice_seq
  ON orders (financial_year, invoice_seq)
  WHERE financial_year IS NOT NULL AND invoice_seq IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders (order_date);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_production ON orders (production_type);
CREATE INDEX IF NOT EXISTS idx_orders_operator ON orders (assigned_operator_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders (assigned_delivery_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);

-- ---------- bills ----------
-- Written together with the order inside one transaction; bill_number always
-- equals orders.order_number (the TMP/NNNN/YY-YY tax invoice number).
CREATE TABLE IF NOT EXISTS bills (
  id                 SERIAL PRIMARY KEY,
  order_id           INTEGER NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
  bill_number        VARCHAR(40) NOT NULL UNIQUE,
  invoice_date       DATE,
  subtotal_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate           NUMERIC(5,2) NOT NULL DEFAULT 18,
  cgst_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes              VARCHAR(500),
  created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bills_order ON bills (order_id);

-- ---------- order_files ----------
-- Each uploaded design can carry its own size / quantity / instructions, since
-- one order may bundle several distinct designs.
CREATE TABLE IF NOT EXISTS order_files (
  id                  SERIAL PRIMARY KEY,
  order_id            INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  file_name           VARCHAR(255) NOT NULL,
  file_path           VARCHAR(255) NOT NULL,
  file_type           VARCHAR(80),
  size                VARCHAR(120),
  quantity            INTEGER,
  instructions        VARCHAR(500),
  uploaded_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_files_order ON order_files (order_id);

-- ---------- payments ----------
CREATE TABLE IF NOT EXISTS payments (
  id                  SERIAL PRIMARY KEY,
  order_id            INTEGER REFERENCES orders (id) ON DELETE SET NULL,
  customer_id         INTEGER REFERENCES customers (id) ON DELETE SET NULL,
  amount              NUMERIC(12,2) NOT NULL,
  payment_method      VARCHAR(40),
  payment_type        VARCHAR(40),
  payment_date        DATE,
  reference_no        VARCHAR(120),
  recorded_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  notes               VARCHAR(500),
  is_historical       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date);

-- ---------- delivery_slips ----------
CREATE TABLE IF NOT EXISTS delivery_slips (
  id                             SERIAL PRIMARY KEY,
  order_id                       INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  customer_name                  VARCHAR(120),
  customer_address               VARCHAR(500),
  customer_phone                 VARCHAR(20),
  generated_by_delivery_agent_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  pdf_path                       VARCHAR(255),
  delivery_notes                 VARCHAR(500),
  created_at                     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_slips_order ON delivery_slips (order_id);

-- ---------- notifications ----------
-- One row per recipient role so every portal keeps its own read state.
CREATE TABLE IF NOT EXISTS notifications (
  id                SERIAL PRIMARY KEY,
  order_id          INTEGER REFERENCES orders (id) ON DELETE CASCADE,
  event_type        VARCHAR(60) NOT NULL,
  title             VARCHAR(160) NOT NULL,
  message           VARCHAR(500),
  triggered_by_role VARCHAR(40),
  target_role       VARCHAR(40),
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications (is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_order ON notifications (order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications (target_role);

-- ---------- inventory taxonomy: group -> category -> type ----------
CREATE TABLE IF NOT EXISTS inventory_groups (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(80) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_categories (
  id         SERIAL PRIMARY KEY,
  group_id   INTEGER NOT NULL REFERENCES inventory_groups (id) ON DELETE CASCADE,
  name       VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, name)
);

CREATE TABLE IF NOT EXISTS inventory_types (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES inventory_categories (id) ON DELETE CASCADE,
  name        VARCHAR(80) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, name)
);

-- ---------- inventory ----------
-- Items are normally assigned down to a type; group/category are stored too so
-- listing/filtering stays a single indexed lookup. Every level is nullable +
-- ON DELETE SET NULL so removing a taxonomy node never deletes stock.
CREATE TABLE IF NOT EXISTS inventory (
  id            SERIAL PRIMARY KEY,
  item_name     VARCHAR(160) NOT NULL,
  group_id      INTEGER REFERENCES inventory_groups (id) ON DELETE SET NULL,
  category_id   INTEGER REFERENCES inventory_categories (id) ON DELETE SET NULL,
  type_id       INTEGER REFERENCES inventory_types (id) ON DELETE SET NULL,
  quantity      NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit          VARCHAR(40),
  min_quantity  NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  supplier      VARCHAR(160),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_group ON inventory (group_id);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory (category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_type ON inventory (type_id);

-- ---------- inventory_usages ----------
-- A recorded consumption of stock (usually by an operator during production).
CREATE TABLE IF NOT EXISTS inventory_usages (
  id              SERIAL PRIMARY KEY,
  item_id         INTEGER REFERENCES inventory (id) ON DELETE SET NULL,
  order_id        INTEGER REFERENCES orders (id) ON DELETE SET NULL,
  quantity        NUMERIC(12,2) NOT NULL,
  unit            VARCHAR(40),
  used_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  note            VARCHAR(500),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_item ON inventory_usages (item_id);
CREATE INDEX IF NOT EXISTS idx_usage_order ON inventory_usages (order_id);

-- ---------- order_comments ----------
CREATE TABLE IF NOT EXISTS order_comments (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  comment      TEXT NOT NULL,
  comment_type VARCHAR(40),
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_order ON order_comments (order_id);

-- ---------- settings ----------
CREATE TABLE IF NOT EXISTS settings (
  id            SERIAL PRIMARY KEY,
  setting_key   VARCHAR(120) NOT NULL UNIQUE,
  setting_value TEXT
);

-- ---------- import_batches ----------
-- Audit trail for historical data migration runs. `report` holds the JSON
-- summary (counts, skipped duplicates, per-row errors) shown after an import.
CREATE TABLE IF NOT EXISTS import_batches (
  id                 SERIAL PRIMARY KEY,
  entity             VARCHAR(40) NOT NULL,
  source_name        VARCHAR(255),
  dry_run            BOOLEAN NOT NULL DEFAULT TRUE,
  total_rows         INTEGER NOT NULL DEFAULT 0,
  imported_rows      INTEGER NOT NULL DEFAULT 0,
  skipped_rows       INTEGER NOT NULL DEFAULT 0,
  failed_rows        INTEGER NOT NULL DEFAULT 0,
  report             JSONB,
  created_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_batches_entity ON import_batches (entity);

