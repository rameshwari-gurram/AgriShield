import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/apiError.js';

export const notFoundMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};
