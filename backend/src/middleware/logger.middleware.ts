import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger.js';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const correlationId = (req.headers['x-correlation-id'] as string) || `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;

    const logMessage = `${method} ${originalUrl} ${statusCode} - ${duration}ms [${correlationId}]`;

    if (statusCode >= 500) {
      logger.error(logMessage);
    } else if (statusCode >= 400) {
      logger.warn(logMessage);
    } else {
      logger.info(logMessage);
    }
  });

  next();
};
