import winston from 'winston';
import config from './index.js';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => {
    return `${ts} ${level}: ${stack || message}`;
  }),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = winston.createLogger({
  level: config.isProduction ? 'info' : 'debug',
  format: config.isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

/** A morgan-compatible stream so HTTP logs flow through winston. */
export const httpLogStream = {
  write: (message) => logger.http?.(message.trim()) ?? logger.info(message.trim()),
};

export default logger;
