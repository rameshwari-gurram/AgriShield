import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/apiError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.config.js';

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  const correlationId = req.correlationId;

  // Handle known operational AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      data: err.details || null,
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlationId } : {}),
    });
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      success: false,
      message: 'Validation failed',
      data: { errors: formattedErrors },
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlationId } : {}),
    });
    return;
  }

  // Handle unhandled unexpected errors
  logger.error(`Unhandled Exception [${correlationId}]: ${err.message}`, { stack: err.stack });

  res.status(500).json({
    success: false,
    message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    data: env.NODE_ENV === 'production' ? null : { stack: err.stack },
    timestamp: new Date().toISOString(),
    ...(correlationId ? { correlationId } : {}),
  });
};
