
import app from './app.js';
import config, { assertConfig } from './config/index.js';
import logger from './config/logger.js';
import { verifyConnection, closePool } from './config/database.js';

async function bootstrap() {
  // Validate production environment variables.
  assertConfig();

  // Verify PostgreSQL / Supabase connection before startup.
  await verifyConnection();

  const server = app.listen(config.port, () => {
    const target =
      typeof config.port === 'number'
        ? `http://localhost:${config.port}`
        : config.port;

    logger.info(
      `PrintPress API running on ${target} [${config.env}]`
    );
  });

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;

    shuttingDown = true;

    logger.info(`${signal} received. Shutting down gracefully...`);

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out.');
      process.exit(1);
    }, 10000);

    forceExit.unref();

    server.close(async (err) => {
      try {
        await closePool();

        if (err) {
          logger.error('HTTP server shutdown error', { err });
          process.exitCode = 1;
        } else {
          logger.info('HTTP server closed. Database pool drained.');
        }
      } catch (error) {
        logger.error('Database pool shutdown failed', {
          stack: error.stack,
        });

        process.exitCode = 1;
      } finally {
        clearTimeout(forceExit);
        process.exit();
      }
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', {
    stack: err.stack,
  });

  process.exit(1);
});
