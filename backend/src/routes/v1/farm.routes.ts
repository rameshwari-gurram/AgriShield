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

const router = Router();

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
