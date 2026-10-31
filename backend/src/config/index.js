
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path to the backend project root. */
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

/** Required environment variables in production. */
const requiredInProduction = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
];

/**
 * Parse comma-separated CORS origins.
 */
function parseOrigins(raw) {
  if (raw && raw.trim().length > 0) {
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  // Local development defaults.
  const defaults = [];

  for (let port = 3001; port <= 3008; port += 1) {
    defaults.push(`http://localhost:${port}`);
  }

  defaults.push(
    'http://localhost:5173',
    'http://localhost:5174'
  );

  return defaults;
}

/**
 * Parse PORT.
 * Supports numeric ports and named pipes.
 */
function parseListenTarget(raw) {
  if (!raw) return 5000;

  return /^\d+$/.test(raw)
    ? Number.parseInt(raw, 10)
    : raw;
}

/**
 * Parse integer environment variables safely.
 */
function parseInteger(value, fallback, name) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid ${name} configuration.`);
  }

  return parsed;
}

const config = Object.freeze({
  // Application
  env: process.env.NODE_ENV || 'development',

  isProduction: process.env.NODE_ENV === 'production',

  port: parseListenTarget(process.env.PORT),

  // PostgreSQL / Supabase
  db: {
    host: process.env.DB_HOST || 'localhost',

    port: parseInteger(
      process.env.DB_PORT,
      5432,
      'DB_PORT'
    ),

    user: process.env.DB_USER || 'postgres',

    password: process.env.DB_PASSWORD || '',

    database: process.env.DB_NAME || 'printpress',

    // Used by pg.Pool configuration.
    connectionLimit: parseInteger(
      process.env.DB_CONNECTION_LIMIT,
      5,
      'DB_CONNECTION_LIMIT'
    ),

    // Enable SSL for Supabase PostgreSQL.
    ssl: process.env.DB_SSL === 'true',

    // Verify the database server certificate.
    sslRejectUnauthorized:
      process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  },

  // Authentication
  jwt: {
    secret:
      process.env.JWT_SECRET ||
      'insecure_dev_secret_do_not_use_in_prod',

    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // File uploads
  uploads: {
    dir: path.resolve(
      ROOT_DIR,
      process.env.UPLOAD_DIR || 'uploads'
    ),

    maxFileSizeBytes:
      parseInteger(
        process.env.MAX_FILE_SIZE_MB,
        10,
        'MAX_FILE_SIZE_MB'
      ) * 1024 * 1024,
  },

  // React frontend build
  client: {
    dir: path.resolve(
      ROOT_DIR,
      process.env.CLIENT_DIST_DIR || 'public'
    ),
  },

  // CORS
  cors: {
    origins: parseOrigins(process.env.CORS_ORIGINS),
  },

  // API rate limiting
  rateLimit: {
    windowMs:
      parseInteger(
        process.env.RATE_LIMIT_WINDOW_MINUTES,
        15,
        'RATE_LIMIT_WINDOW_MINUTES'
      ) * 60 * 1000,

    max: parseInteger(
      process.env.RATE_LIMIT_MAX,
      300,
      'RATE_LIMIT_MAX'
    ),
  },
});

/**
 * Validate configuration before starting production.
 */
export function assertConfig() {
  if (!config.isProduction) {
    return;
  }

  // Check required environment variables.
  const missing = requiredInProduction.filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(', ')}`
    );
  }

  // Validate PostgreSQL port.
  if (
    !Number.isInteger(config.db.port) ||
    config.db.port < 1 ||
    config.db.port > 65535
  ) {
    throw new Error('Invalid DB_PORT configuration.');
  }

  // Validate database connection limit.
  if (
    !Number.isInteger(config.db.connectionLimit) ||
    config.db.connectionLimit < 1
  ) {
    throw new Error('Invalid DB_CONNECTION_LIMIT configuration.');
  }

  // Supabase production connections must use SSL.
  if (!config.db.ssl) {
    throw new Error(
      'DB_SSL must be set to true in production.'
    );
  }

  if (!config.db.sslRejectUnauthorized) {
    throw new Error(
      'DB_SSL_REJECT_UNAUTHORIZED must be true in production.'
    );
  }

  // Reject the development JWT secret.
  if (
    config.jwt.secret ===
    'insecure_dev_secret_do_not_use_in_prod'
  ) {
    throw new Error(
      'A secure production JWT_SECRET must be configured.'
    );
  }
}

export default config;
