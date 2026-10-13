/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-D: Farm Ownership Authorization Middleware
 *
 * Verifies that the authenticated caller (req.user.id) is the verified owner (farmerId)
 * of the requested farm parcel. Rejects unauthorized access with 403 Forbidden.
 * Strictly adheres to project policy: no invented admin role or authorization bypass.
 */

import { Request, Response, NextFunction } from 'express';
import { farmRepository } from '../repositories/farm.repository.js';
import { IFarmRepository } from '../types/farm.types.js';
import { AppError } from '../utils/apiError.js';

export const createAuthorizeFarmAccess = (repo: IFarmRepository = farmRepository) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const { farmId } = req.params;
      if (!farmId) {
        return next(AppError.badRequest('Farm ID is required'));
      }

      // 1. Verify authenticated user identity is present
      if (!req.user || !req.user.id) {
        return next(AppError.unauthorized('Authentication required to access farm risk assessment'));
      }

      // 2. Fetch farm parcel from repository
      const farm = await repo.findById(farmId, false);
      if (!farm) {
        return next(AppError.notFound(`Farm with ID '${farmId}' not found`));
      }

      // 3. Enforce strict farmer ownership: farm.farmerId === req.user.id
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
