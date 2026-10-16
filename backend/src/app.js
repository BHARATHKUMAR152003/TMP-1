import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import config from './config/index.js';
import { httpLogStream } from './config/logger.js';
import apiRoutes from './routes/index.js';
import { notFound } from './middleware/notFound.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();

// Trust the first proxy (needed for correct client IPs behind nginx, etc.).
app.set('trust proxy', 1);

// Security headers. crossOriginResourcePolicy relaxed so the SPA on another
// port can load uploaded images/files.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;
    // The SPA is served by this process, so its Origin equals the request Host;
    // browsers send it for `crossorigin` assets and fetch/XHR alike.
    const isSameOrigin = Boolean(origin) && origin === `${req.protocol}://${req.headers.host}`;
    const allowed = !origin || isSameOrigin || config.cors.origins.includes(origin);

    if (!allowed) return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    return callback(null, { origin: true, credentials: true });
  }),
);

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

if (!config.isProduction) {
  app.use(morgan('dev', { stream: httpLogStream }));
} else {
  app.use(morgan('combined', { stream: httpLogStream }));
}

// Global API rate limiter.
app.use(
  '/api',
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
  }),
);

// Serve uploaded files (payment screenshots, design files, delivery slips).
app.use('/uploads', express.static(config.uploads.dir));

// Versioned API surface.
app.use('/api/v1', apiRoutes);
// Back-compat alias so clients using /api/* still work.
app.use('/api', apiRoutes);

// Single-origin hosting: when a built SPA bundle is present, this process also
// serves the frontend, so there is nothing to deploy or CORS-configure apart.
const clientIndex = path.join(config.client.dir, 'index.html');

if (fs.existsSync(clientIndex)) {
  // Hashed asset filenames -> safe to cache aggressively; index.html is not.
  app.use(express.static(config.client.dir, { index: false, maxAge: '1y' }));

  app.get('*', (req, res, next) => {
    // Missing bundle files must 404 rather than silently return the shell.
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/assets')
    ) {
      return next();
    }
    res.sendFile(clientIndex);
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ name: 'PrintPress API', version: '1.0.0', docs: '/api/v1/health' });
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
