import { Router } from 'express';
import { farmerController } from '../../controllers/farmer.controller.js';
import { farmController } from '../../controllers/farm.controller.js';
import { authenticateJwt, requireAdmin } from '../../middleware/auth.middleware.js';
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

// Register new farmer (Admin only)
router.post(
  '/',
  authenticateJwt,
  requireAdmin,
  validateBody(createFarmerSchema),
  farmerController.createFarmer.bind(farmerController)
);

// Get paginated list of farmers (Admin only)
router.get(
  '/',
  authenticateJwt,
  requireAdmin,
  validateQuery(farmerQuerySchema),
  farmerController.getFarmers.bind(farmerController)
);

// Get farmer details by ID (Admin or matching Farmer)
router.get(
  '/:id',
  authenticateJwt,
  validateParams(farmerIdParamSchema),
  farmerController.getFarmerById.bind(farmerController)
);

// Get all farms belonging to a specific farmer (Admin or matching Farmer)
router.get(
  '/:farmerId/farms',
  authenticateJwt,
  validateParams(farmerIdParamForFarmsSchema),
  farmController.getFarmerFarms.bind(farmController)
);

export const farmerRoutes = router;

