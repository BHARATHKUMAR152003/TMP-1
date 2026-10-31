
import pg from 'pg';
import config from './index.js';
import logger from './logger.js';

// Convert PostgreSQL BIGINT values into JavaScript numbers.
pg.types.setTypeParser(
  pg.types.builtins.INT8,
  (value) => Number(value)
);

// Preserve DATE values as YYYY-MM-DD strings.
// Prevents timezone-related invoice date changes.
pg.types.setTypeParser(
  pg.types.builtins.DATE,
  (value) => value
);

/**
 * Shared PostgreSQL connection pool.
 * Compatible with Supabase PostgreSQL Session Pooler.
 */
export const pool = new pg.Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,

  max: config.db.connectionLimit,

  // Supabase PostgreSQL SSL.
  ssl: config.db.ssl
    ? {
        rejectUnauthorized: config.db.sslRejectUnauthorized,
      }
    : false,

  // Connection management.
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Log unexpected connection pool errors.
pool.on('error', (error) => {
  logger.error('Unexpected PostgreSQL client error', {
    stack: error.stack,
  });
});

/**
 * Convert ? placeholders to PostgreSQL $1, $2, etc.
 */
function toPositional(sql) {
  let index = 0;

  return sql.replace(/\?/g, () => `$${++index}`);
}

/**
 * Execute parameterized SQL query.
 */
export async function query(sql, params = [], client = pool) {
  const result = await client.query(
    toPositional(sql),
    params
  );

  return result.rows;
}

/**
 * Insert a record and return its generated ID.
 */
export async function insert(sql, params = [], client = pool) {
  const rows = await query(
    `${sql} RETURNING id`,
    params,
    client
  );

  return rows[0]?.id ?? null;
}

/**
 * Execute INSERT, UPDATE or DELETE.
 * Return affected row count.
 */
export async function execute(sql, params = [], client = pool) {
  const result = await client.query(
    toPositional(sql),
    params
  );

  return result.rowCount;
}

/**
 * Verify Supabase PostgreSQL connectivity.
 */
export async function verifyConnection() {
  const client = await pool.connect();

  try {
    const result = await client.query(
      'SELECT current_database() AS database, NOW() AS server_time'
    );

    logger.info(
      `PostgreSQL connected successfully: ${config.db.host}`
    );

    logger.info(
      `Database: ${result.rows[0].database}`
    );

    return true;
  } catch (error) {
    logger.error('PostgreSQL connection verification failed', {
      stack: error.stack,
    });

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute multiple queries inside one transaction.
 */
export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await callback(client);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Transaction rollback failed', {
        stack: rollbackError.stack,
      });
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Gracefully close PostgreSQL connection pool.
 */
export async function closePool() {
  await pool.end();

  logger.info('PostgreSQL connection pool closed.');
}

export default pool;
