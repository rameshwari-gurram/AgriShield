import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config.js';
import { AppError } from '../utils/apiError.js';

interface JwtPayload {
  id: string;
  email?: string;
  role?: string;
}

/**
 * JWT Authentication Middleware Architecture
 * Prepared for future secure endpoints (Farmer, Admin, Policy APIs)
 */
export const authenticateJwt = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Authorization token is missing or invalid'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(AppError.unauthorized('Token has expired'));
    }
    return next(AppError.unauthorized('Invalid authentication token'));
  }
};
