import { Router } from 'express';
import { farmController } from '../../controllers/farm.controller.js';
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
import { weatherRoutes } from '../weather.routes.js';
import { farmRiskRoutes } from '../riskAssessment.routes.js';

const router = Router();

// Mount farm boundary sub-routes (/api/v1/farms/:farmId/boundary)
router.use('/:farmId/boundary', farmBoundaryRoutes);

// Mount farm weather sub-routes (/api/v1/farms/:farmId/weather)
router.use('/:farmId/weather', weatherRoutes);

// Mount farm risk assessment sub-routes (/api/v1/farms/:farmId/risk-assessments)
router.use('/:farmId/risk-assessments', farmRiskRoutes);

// Register new farm
router.post(
  '/',
  validateBody(createFarmSchema),
  farmController.createFarm.bind(farmController)
);

// Get paginated list of farms with filters
router.get(
  '/',
  validateQuery(farmQuerySchema),
  farmController.getFarms.bind(farmController)
);

// Get farm details by ID
router.get(
  '/:id',
  validateParams(farmIdParamSchema),
  farmController.getFarmById.bind(farmController)
);

// Partially update farm
router.patch(
  '/:id',
  validateParams(farmIdParamSchema),
  validateBody(updateFarmSchema),
  farmController.updateFarm.bind(farmController)
);

// Delete farm
router.delete(
  '/:id',
  validateParams(farmIdParamSchema),
  farmController.deleteFarm.bind(farmController)
);

export const farmRoutes = router;
