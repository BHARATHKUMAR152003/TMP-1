import app from './app.js';
import config, { assertConfig } from './config/index.js';
import logger from './config/logger.js';
import { verifyConnection, closePool } from './config/database.js';

async function bootstrap() {
  assertConfig();
  await verifyConnection();

  const server = app.listen(config.port, () => {
    const target =
      typeof config.port === 'number' ? `http://localhost:${config.port}` : config.port;
    logger.info(`PrintPress API running on ${target} [${config.env}]`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await closePool();
      logger.info('HTTP server closed, DB pool drained. Bye.');
      process.exit(0);
    });
    // Force-exit if graceful shutdown stalls.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { stack: err.stack });
  process.exit(1);
});
