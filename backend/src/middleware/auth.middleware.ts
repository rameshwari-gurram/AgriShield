import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config.js';
import { AppError } from '../utils/apiError.js';
import { UserRole } from '../types/auth.types.js';

interface JwtPayload {
  id: string;
  role?: UserRole;
  email?: string;
  username?: string;
  fullName?: string;
  mobileNumber?: string;
}

/**
 * JWT Authentication Middleware
 * Validates Bearer token and assigns decoded claims to req.user
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

/**
 * Role-Based Authorization Guard
 * Strictly enforces that req.user.role matches allowed UserRole ('FARMER' | 'ADMIN').
 */
export const requireRole = (allowedRoles: UserRole | UserRole[]) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.id) {
      return next(AppError.unauthorized('Authentication required'));
    }

    if (!req.user.role || !roles.includes(req.user.role as UserRole)) {
      return next(
        AppError.forbidden(
          `Access denied: requires one of the following roles: [${roles.join(', ')}]`
        )
      );
    }

    next();
  };
};

export const requireAdmin = requireRole('ADMIN');
export const requireFarmer = requireRole('FARMER');
