import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

const format = isProduction
  ? winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ level, message, timestamp, stack }) => {
        return `[${timestamp}] ${level}: ${stack || message}`;
      })
    );

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format,
  transports: [
    new winston.transports.Console(),
  ],
  exitOnError: false,
});
