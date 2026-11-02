import { Router } from 'express';
import { farmController } from '../../controllers/farm.controller.js';
import { authenticateJwt, requireAdmin, requireRole } from '../../middleware/auth.middleware.js';
import { authorizeFarmAccess } from '../../middleware/farmOwnership.middleware.js';
import {
  validateBody,
  validateQuery,
  validateParams,
  createFarmSchema,
  updateFarmSchema,
  farmIdParamSchema,
  farmQuerySchema,
} from '../../validators/farm.validator.js';

import { farmBoundaryRoutes } from './farmBoundary.routes.js';
import { weatherRoutes } from './weather.routes.js';
import { farmRiskRoutes } from '../riskAssessment.routes.js';
import { satelliteRoutes } from '../satellite.routes.js';
import { mlRiskRoutes } from './mlRisk.routes.js';
import { farmPolicyRoutes } from './policy.routes.js';
import { farmClaimRoutes } from './claim.routes.js';

const router = Router();

// Mount farm boundary sub-routes (/api/v1/farms/:farmId/boundary)
router.use('/:farmId/boundary', authenticateJwt, authorizeFarmAccess, farmBoundaryRoutes);

// Mount farm weather sub-routes (/api/v1/farms/:farmId/weather)
router.use('/:farmId/weather', authenticateJwt, authorizeFarmAccess, weatherRoutes);

// Mount farm risk assessment sub-routes (/api/v1/farms/:farmId/risk-assessments)
router.use('/:farmId/risk-assessments', authenticateJwt, authorizeFarmAccess, farmRiskRoutes);

// Mount farm satellite sub-routes (/api/v1/farms/:farmId/satellite)
router.use('/:farmId/satellite', authenticateJwt, authorizeFarmAccess, satelliteRoutes);

// Mount farm ML risk advisory sub-routes (/api/v1/farms/:farmId/ml-risk)
router.use('/:farmId/ml-risk', mlRiskRoutes);

// Mount farm policy sub-routes (/api/v1/farms/:farmId/policies)
router.use('/:farmId/policies', farmPolicyRoutes);

// Mount farm claims sub-routes (/api/v1/farms/:farmId/claims)
router.use('/:farmId/claims', farmClaimRoutes);


// Register new farm (Authenticated Farmer for self, or Admin for any farmer)
router.post(
  '/',
  authenticateJwt,
  requireRole(['FARMER', 'ADMIN']),
  validateBody(createFarmSchema),
  farmController.createFarm.bind(farmController)
);

// Get paginated list of farms with filters (Admin only)
router.get(
  '/',
  authenticateJwt,
  requireAdmin,
  validateQuery(farmQuerySchema),
  farmController.getFarms.bind(farmController)
);

// Get farm details by ID (Admin or matching Farmer)
router.get(
  '/:id',
  authenticateJwt,
  validateParams(farmIdParamSchema),
  authorizeFarmAccess,
  farmController.getFarmById.bind(farmController)
);

// Partially update farm (Admin or matching Farmer)
router.patch(
  '/:id',
  authenticateJwt,
  validateParams(farmIdParamSchema),
  authorizeFarmAccess,
  validateBody(updateFarmSchema),
  farmController.updateFarm.bind(farmController)
);

// Delete farm (Admin or matching Farmer)
router.delete(
  '/:id',
  authenticateJwt,
  validateParams(farmIdParamSchema),
  authorizeFarmAccess,
  farmController.deleteFarm.bind(farmController)
);

export const farmRoutes = router;
