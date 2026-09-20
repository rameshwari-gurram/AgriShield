import { Router } from 'express';
import { farmerController } from '../../controllers/farmer.controller.js';
import { farmController } from '../../controllers/farm.controller.js';
import {
  validateBody,
  validateQuery,
  validateParams,
  createFarmerSchema,
  farmerQuerySchema,
  farmerIdParamSchema,
} from '../../validators/farmer.validator.js';
import { farmerIdParamForFarmsSchema } from '../../validators/farm.validator.js';

const router = Router();

// Register new farmer
router.post(
  '/',
  validateBody(createFarmerSchema),
  farmerController.createFarmer.bind(farmerController)
);

// Get paginated list of farmers
router.get(
  '/',
  validateQuery(farmerQuerySchema),
  farmerController.getFarmers.bind(farmerController)
);

// Get farmer details by ID
router.get(
  '/:id',
  validateParams(farmerIdParamSchema),
  farmerController.getFarmerById.bind(farmerController)
);

// Get all farms belonging to a specific farmer
router.get(
  '/:farmerId/farms',
  validateParams(farmerIdParamForFarmsSchema),
  farmController.getFarmerFarms.bind(farmController)
);

export const farmerRoutes = router;

