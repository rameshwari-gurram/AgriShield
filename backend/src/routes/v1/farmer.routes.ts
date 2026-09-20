import { Router } from 'express';
import { farmerController } from '../../controllers/farmer.controller.js';
import {
  validateBody,
  validateQuery,
  validateParams,
  createFarmerSchema,
  farmerQuerySchema,
  farmerIdParamSchema,
} from '../../validators/farmer.validator.js';

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

export const farmerRoutes = router;
