import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Absolute path to the backend project root (one level above /src). */
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

const requiredInProduction = ['JWT_SECRET', 'DB_PASSWORD'];

function parseOrigins(raw) {
  if (raw && raw.trim().length > 0) {
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
  }
  // Sensible defaults for local development (Vite ports + custom range).
  const defaults = [];
  for (let port = 3001; port <= 3008; port += 1) {
    defaults.push(`http://localhost:${port}`);
  }
  defaults.push('http://localhost:5173', 'http://localhost:5174');
  return defaults;
}

/** iisnode (Azure App Service on Windows) passes a named pipe, not a number. */
function parseListenTarget(raw) {
  if (!raw) return 5000;
  return /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : raw;
}

const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseListenTarget(process.env.PORT),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'printpress',
    connectionLimit: Number.parseInt(process.env.DB_CONNECTION_LIMIT ?? '10', 10),
    // Managed providers (Azure Database for PostgreSQL, RDS, Neon…) require TLS.
    ssl: process.env.DB_SSL === 'true',
    sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'insecure_dev_secret_do_not_use_in_prod',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  uploads: {
    dir: path.resolve(ROOT_DIR, process.env.UPLOAD_DIR || 'uploads'),
    maxFileSizeBytes: Number.parseInt(process.env.MAX_FILE_SIZE_MB ?? '10', 10) * 1024 * 1024,
  },

  client: {
    // Built SPA bundle (vite build output) served by this same process.
    dir: path.resolve(ROOT_DIR, process.env.CLIENT_DIST_DIR || 'public'),
  },

  cors: {
    origins: parseOrigins(process.env.CORS_ORIGINS),
  },

  rateLimit: {
    windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES ?? '15', 10) * 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_MAX ?? '300', 10),
  },
});

/** Throws if mandatory secrets are missing in production. */
export function assertConfig() {
  if (config.isProduction) {
    const missing = requiredInProduction.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
    }
  }
}

export default config;
