import multer from 'multer';
import config from '../config/index.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';

/**
 * Central error handler. Every thrown/next-ed error lands here and is converted
 * into a consistent JSON envelope. Unknown errors are logged with their stack
 * and masked in production to avoid leaking internals.
 */
// eslint-disable-next-line no-unused-vars -- Express requires the 4-arg signature.
export function errorHandler(err, req, res, _next) {
  let error = err;

  // Normalize known third-party errors into ApiError.
  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `File too large. Max ${config.uploads.maxFileSizeBytes / (1024 * 1024)}MB.`
        : error.message;
    error = ApiError.badRequest(message);
  } else if (error?.code === '23505') {
    error = ApiError.conflict('A record with these details already exists');
  } else if (error?.code === '23503') {
    error = ApiError.badRequest('A referenced record does not exist');
  } else if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
    error = ApiError.unauthorized('Invalid or expired token');
  }

  const isApiError = error instanceof ApiError;
  const statusCode = isApiError ? error.statusCode : 500;

  if (!isApiError || statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${error.message}`, { stack: error.stack });
  }

  const body = {
    success: false,
    message: isApiError || !config.isProduction ? error.message : 'Internal server error',
  };
  if (isApiError && error.details) body.details = error.details;
  if (!config.isProduction && !isApiError) body.stack = error.stack;

  res.status(statusCode).json(body);
}
