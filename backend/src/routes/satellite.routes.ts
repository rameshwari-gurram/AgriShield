/**
 * Module 7: Satellite & NDVI Routes
 * Defines HTTP routes for farm satellite NDVI synchronization and retrieval.
 *
 * Endpoints:
 * - POST /api/v1/farms/:farmId/satellite/sync
 * - GET  /api/v1/farms/:farmId/satellite/latest
 * - GET  /api/v1/farms/:farmId/satellite?from=...&to=...&limit=...
 */

import { Router } from 'express';
import { satelliteController } from '../controllers/satellite.controller.js';
import {
  validateParams,
  validateQuery,
  validateBody,
  farmIdParamForSatelliteSchema,
  syncSatelliteSchema,
  historicalSatelliteQuerySchema,
} from '../validators/satellite.validator.js';

const router = Router({ mergeParams: true });

/**
 * @route   POST /api/v1/farms/:farmId/satellite/sync
 * @desc    Synchronize Copernicus Sentinel-2 satellite NDVI observations for a farm parcel
 * @access  Public / Protected (Standard API v1)
 */
router.post(
  '/sync',
  validateParams(farmIdParamForSatelliteSchema),
  validateBody(syncSatelliteSchema),
  satelliteController.syncSatellite.bind(satelliteController)
);

/**
 * @route   GET /api/v1/farms/:farmId/satellite/latest
 * @desc    Retrieve the newest persisted satellite NDVI observation for a farm
 * @access  Public / Protected (Standard API v1)
 */
router.get(
  '/latest',
  validateParams(farmIdParamForSatelliteSchema),
  satelliteController.getLatestNdvi.bind(satelliteController)
);

/**
 * @route   GET /api/v1/farms/:farmId/satellite
 * @desc    Retrieve historical satellite NDVI observations for a farm within a date range
 * @access  Public / Protected (Standard API v1)
 */
router.get(
  '/',
  validateParams(farmIdParamForSatelliteSchema),
  validateQuery(historicalSatelliteQuerySchema),
  satelliteController.getHistoricalNdvi.bind(satelliteController)
);

export const satelliteRoutes = router;
