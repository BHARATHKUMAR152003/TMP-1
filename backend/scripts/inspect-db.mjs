/**
 * Read-only snapshot of a database: row counts, role mix and invoice-number
 * formats. Used to review an existing installation before migrating it.
 *
 *   node scripts/inspect-db.mjs [databaseName]
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const target = process.argv[2] || process.env.DB_NAME || 'printpress';
const base = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};

const admin = new pg.Client({ ...base, database: 'postgres' });
await admin.connect();
const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [target]);
await admin.end();

if (rowCount === 0) {
  console.log(`Database "${target}" does not exist yet.`);
  process.exit(0);
}

const client = new pg.Client({ ...base, database: target });
await client.connect();

async function show(label, sql, params = []) {
  try {
    const { rows } = await client.query(sql, params);
    console.log(`  ${label.padEnd(22)} ${rows.map((r) => Object.values(r).join('=')).join(', ') || '(none)'}`);
  } catch {
    console.log(`  ${label.padEnd(22)} (table missing)`);
  }
}

console.log(`\nDatabase: ${target}\n`);
for (const table of ['users', 'customers', 'orders', 'order_items', 'bills', 'payments', 'inventory']) {
  await show(table, `SELECT COUNT(*)::int AS n FROM ${table}`);
}
console.log('');
await show('roles', 'SELECT role, COUNT(*)::int AS n FROM users GROUP BY role ORDER BY 2 DESC');
await show('order statuses', 'SELECT status, COUNT(*)::int AS n FROM orders GROUP BY status ORDER BY 2 DESC');
await show(
  'invoice formats',
  `SELECT CASE
            WHEN order_number IS NULL THEN 'unnumbered'
            WHEN order_number ~ '^[A-Za-z0-9]+/[0-9]+/[0-9]{2}-[0-9]{2}$' THEN 'TMP/NNNN/YY-YY'
            ELSE 'legacy (' || split_part(order_number, '-', 1) || '-...)'
          END AS format,
          COUNT(*)::int AS n
   FROM orders GROUP BY 1 ORDER BY 2 DESC`,
);
await show('financial years', 'SELECT financial_year, COUNT(*)::int AS n FROM orders GROUP BY 1 ORDER BY 1');
await show('invoice sequences', 'SELECT prefix || \' \' || financial_year AS k, last_number FROM invoice_sequences ORDER BY 1');

await client.end();
console.log('');
