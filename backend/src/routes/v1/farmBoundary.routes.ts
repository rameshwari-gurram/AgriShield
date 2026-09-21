import { Router } from 'express';
import { farmBoundaryController } from '../../controllers/farmBoundary.controller.js';
import {
  validateBody,
  validateParams,
  createFarmBoundarySchema,
  updateFarmBoundarySchema,
  farmIdParamForBoundarySchema,
} from '../../validators/farmBoundary.validator.js';

const router = Router({ mergeParams: true });

// Register/create farm boundary
router.post(
  '/',
  validateParams(farmIdParamForBoundarySchema),
  validateBody(createFarmBoundarySchema),
  farmBoundaryController.createBoundary.bind(farmBoundaryController)
);

// Get farm boundary
router.get(
  '/',
  validateParams(farmIdParamForBoundarySchema),
  farmBoundaryController.getBoundary.bind(farmBoundaryController)
);

// Update farm boundary
router.patch(
  '/',
  validateParams(farmIdParamForBoundarySchema),
  validateBody(updateFarmBoundarySchema),
  farmBoundaryController.updateBoundary.bind(farmBoundaryController)
);

// Delete farm boundary
router.delete(
  '/',
  validateParams(farmIdParamForBoundarySchema),
  farmBoundaryController.deleteBoundary.bind(farmBoundaryController)
);

export const farmBoundaryRoutes = router;
