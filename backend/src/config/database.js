import pg from 'pg';
import config from './index.js';
import logger from './logger.js';

// COUNT()/SUM(bigint) arrive as strings by default; return real numbers so the
// dashboard aggregates serialise as JSON numbers.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

// DATE columns (order_date, payment_date, invoice_date) are calendar dates, not
// instants. Left to the driver they become JS Dates at local midnight, which
// JSON-serialise back a day earlier in any timezone east of UTC — an invoice
// dated 15-Aug would print as 14-Aug. Keep them as plain 'YYYY-MM-DD' strings.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

/**
 * Shared PostgreSQL connection pool. Prefer the `query`/`insert` helpers below
 * so every statement stays parameterised and safe from SQL injection.
 */
export const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: config.db.connectionLimit,
  ssl: config.db.ssl ? { rejectUnauthorized: config.db.sslRejectUnauthorized } : false,
});

pool.on('error', (error) => {
  logger.error('Unexpected PostgreSQL client error', { stack: error.stack });
});

/**
 * Rewrites `?` placeholders to PostgreSQL's `$1..$n`. Statements are written
 * with `?` throughout the service layer so the SQL stays compact and readable.
 */
function toPositional(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${(index += 1)}`);
}

/** Runs a query and returns the rows. `client` scopes it to a transaction. */
export async function query(sql, params = [], client = pool) {
  const result = await client.query(toPositional(sql), params);
  return result.rows;
}

/** Runs an INSERT and returns the generated id. */
export async function insert(sql, params = [], client = pool) {
  const rows = await query(`${sql} RETURNING id`, params, client);
  return rows[0]?.id ?? null;
}

/** Runs a statement and returns how many rows it affected. */
export async function execute(sql, params = [], client = pool) {
  const result = await client.query(toPositional(sql), params);
  return result.rowCount;
}

/** Verifies the database is reachable at startup. */
export async function verifyConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info(`PostgreSQL connected -> ${config.db.host}:${config.db.port}/${config.db.database}`);
  } finally {
    client.release();
  }
}

/**
 * Runs a set of statements inside a single transaction. The callback receives a
 * dedicated client; commit/rollback are handled automatically.
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}

export default pool;
