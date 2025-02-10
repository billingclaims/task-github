import winston from 'winston';
import 'winston-daily-rotate-file';

const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, errors } = format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, stack }) => {
  const log = stack || message;
  return `${timestamp} [${level}] ${log}`;
});

// Custom format for file output
const fileFormat = printf(({ level, message, timestamp, stack }) => {
  return JSON.stringify({
    timestamp,
    level,
    message: stack || message,
  });
});

// Create logger instance
export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  handleExceptions: true,
  handleRejections: true,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // Enable error stack traces
  ),
  transports: [
    // Console transport
    new transports.Console({
      format: combine(
        colorize(),
        consoleFormat
      )
    }),
    // Rotating file transport
    new transports.DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat
    })
  ]
});

// Stream for Express/Morgan logging integration
export const httpLoggerStream = {
  write: (message) => logger.http(message.trim())
}; 