import winston from 'winston';

/**
 * Enterprise-Grade Logger Utility
 * Optimized for containerized deployments (Coolify, Docker) and local debugging.
 * Inspired by logging systems of large-scale eCommerce platforms like Amazon and Alibaba:
 * - Structured JSON logging in production for ELK/Datadog log analysis.
 * - Human-readable, colorized terminal outputs in development.
 * - Dynamic severity level routing.
 * - Local file backups for server-side audit logs.
 */

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Development Output Format (easy to read by developers)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => {
      const { timestamp, level, message, ...meta } = info;
      const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    }
  )
);

// Production Output Format (standard structured JSON format)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  }),
];

// Write file logs in production
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: prodFormat,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: prodFormat,
    })
  );
}

const winstonLogger = winston.createLogger({
  level: level(),
  levels,
  defaultMeta: {
    service: 'femcart-api',
    environment: process.env.NODE_ENV || 'development',
  },
  transports,
});

const logger = {
  info: (messageOrObj: string | Record<string, any>, meta?: Record<string, unknown>) => {
    if (typeof messageOrObj === 'object') {
      const { message = '', ...rest } = messageOrObj;
      winstonLogger.info(message, rest);
    } else {
      winstonLogger.info(messageOrObj, meta);
    }
  },
  error: (messageOrObj: string | Record<string, any>, error?: unknown) => {
    if (typeof messageOrObj === 'object') {
      const { message = 'Error occurred', error: errField, ...meta } = messageOrObj;
      const finalError = errField || error;
      if (finalError instanceof Error) {
        winstonLogger.error(message, { ...meta, error: finalError.message, stack: finalError.stack });
      } else if (finalError) {
        winstonLogger.error(message, { ...meta, error: finalError });
      } else {
        winstonLogger.error(message, meta);
      }
    } else {
      if (error instanceof Error) {
        winstonLogger.error(messageOrObj, { error: error.message, stack: error.stack });
      } else if (error) {
        winstonLogger.error(messageOrObj, { error });
      } else {
        winstonLogger.error(messageOrObj);
      }
    }
  },
  warn: (messageOrObj: string | Record<string, any>, meta?: Record<string, unknown>) => {
    if (typeof messageOrObj === 'object') {
      const { message = '', ...rest } = messageOrObj;
      winstonLogger.warn(message, rest);
    } else {
      winstonLogger.warn(messageOrObj, meta);
    }
  },
  debug: (messageOrObj: string | Record<string, any>, meta?: Record<string, unknown>) => {
    if (typeof messageOrObj === 'object') {
      const { message = '', ...rest } = messageOrObj;
      winstonLogger.debug(message, rest);
    } else {
      winstonLogger.debug(messageOrObj, meta);
    }
  },
  http: (messageOrObj: string | Record<string, any>, meta?: Record<string, unknown>) => {
    if (typeof messageOrObj === 'object') {
      const { message = '', ...rest } = messageOrObj;
      winstonLogger.http(message, rest);
    } else {
      winstonLogger.http(messageOrObj, meta);
    }
  },
};

export default logger;
