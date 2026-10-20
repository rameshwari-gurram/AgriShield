/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-D: ML Risk Sub-Router
 *
 * Configures the authenticated advisory machine learning risk prediction route.
 * Nested under /api/v1/farms/:farmId/ml-risk.
 */

import { Router } from 'express';
import { mlRiskController } from '../../controllers/mlRisk.controller.js';
import { authenticateJwt } from '../../middleware/auth.middleware.js';
import { authorizeFarmAccess } from '../../middleware/farmOwnership.middleware.js';
import {
  validateParams,
  validateQuery,
  farmIdParamSchema,
  mlRiskQuerySchema,
} from '../../validators/mlRisk.validator.js';

const router = Router({ mergeParams: true });

/**
 * @route   GET /api/v1/farms/:farmId/ml-risk
 * @desc    Retrieve or evaluate advisory machine learning risk prediction for a farm parcel
 * @access  Protected (Requires Bearer JWT and verified farm ownership)
 *
 * Middleware pipeline order:
 * authenticateJwt → validateParams → validateQuery → authorizeFarmAccess → controller
 */
router.get(
  '/',
  authenticateJwt,
  validateParams(farmIdParamSchema),
  validateQuery(mlRiskQuerySchema),
  authorizeFarmAccess,
  mlRiskController.getFarmRisk.bind(mlRiskController)
);

/**
 * @route   GET /api/v1/farms/:farmId/ml-risk/ndvi-forecast
 * @desc    Forecast 7-day ahead Sentinel-2 NDVI vegetation health for a farm parcel
 * @access  Protected (Requires Bearer JWT and verified farm ownership)
 */
router.get(
  '/ndvi-forecast',
  authenticateJwt,
  validateParams(farmIdParamSchema),
  authorizeFarmAccess,
  mlRiskController.getFarmNdviForecast.bind(mlRiskController)
);

export const mlRiskRoutes = router;
