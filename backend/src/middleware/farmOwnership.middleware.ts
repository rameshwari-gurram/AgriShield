/**
 * AgriShield Stage 2: Farm Ownership Authorization Middleware
 *
 * Verifies that the authenticated caller has permission to access the requested farm parcel:
 * - If role === 'ADMIN': Granted administrative access across all farm parcels.
 * - If role === 'FARMER': Enforces strict ownership: farm.farmerId === req.user.id.
 * Rejects unauthorized callers with 401 Unauthorized or 403 Forbidden.
 */

import { Request, Response, NextFunction } from 'express';
import { farmRepository } from '../repositories/farm.repository.js';
import { IFarmRepository } from '../types/farm.types.js';
import { AppError } from '../utils/apiError.js';

export const createAuthorizeFarmAccess = (repo: IFarmRepository = farmRepository) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const farmId = req.params.farmId || req.params.id;
      if (!farmId) {
        return next(AppError.badRequest('Farm ID is required'));
      }

      // 1. Verify authenticated user identity is present
      if (!req.user || !req.user.id) {
        return next(AppError.unauthorized('Authentication required to access farm'));
      }

      // 2. Fetch farm parcel from repository
      const farm = await repo.findById(farmId, false);
      if (!farm) {
        return next(AppError.notFound(`Farm with ID '${farmId}' not found`));
      }

      // 3. ADMIN role has global administrative access
      if (req.user.role === 'ADMIN') {
        return next();
      }

      // 4. Enforce strict farmer ownership: farm.farmerId === req.user.id
      if (farm.farmerId !== req.user.id) {
        return next(
          AppError.forbidden(`Access denied: You do not have permission to access farm '${farmId}'`)
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const authorizeFarmAccess = createAuthorizeFarmAccess();
