/**
 * Module 5: Weather Routes
 * Defines HTTP routes for farm weather data synchronization and retrieval.
 *
 * Endpoints:
 * - POST /api/v1/farms/:farmId/weather/sync
 * - GET  /api/v1/farms/:farmId/weather/latest
 * - GET  /api/v1/farms/:farmId/weather?from=...&to=...
 *
 * Traceability & Attribution:
 * Stores the centroid coordinates used for the weather query, preserving query-location traceability.
 * Model-derived weather data for the farm centroid coordinates.
 * Not an on-site physical weather-station measurement.
 * Data source attributed to "Open-Meteo".
 */

import { Router } from 'express';
import { weatherController } from '../controllers/weather.controller.js';
import {
  validateParams,
  validateQuery,
  farmIdParamForWeatherSchema,
  historicalWeatherQuerySchema,
} from '../validators/weather.validator.js';

const router = Router({ mergeParams: true });

/**
 * @route   POST /api/v1/farms/:farmId/weather/sync
 * @desc    Synchronize current and (on first sync) 24h hourly weather observations from Open-Meteo
 * @access  Public / Protected (Standard API v1)
 */
router.post(
  '/sync',
  validateParams(farmIdParamForWeatherSchema),
  weatherController.syncWeather.bind(weatherController)
);

/**
 * @route   GET /api/v1/farms/:farmId/weather/latest
 * @desc    Retrieve the newest persisted weather record from PostgreSQL (no external API calls)
 * @access  Public / Protected (Standard API v1)
 */
router.get(
  '/latest',
  validateParams(farmIdParamForWeatherSchema),
  weatherController.getLatestWeather.bind(weatherController)
);

/**
 * @route   GET /api/v1/farms/:farmId/weather
 * @desc    Retrieve historical weather observations from PostgreSQL within a time window (observedAt ASC)
 * @query   from (ISO-8601 string, required)
 * @query   to (ISO-8601 string, required)
 * @query   limit (positive integer, optional)
 * @access  Public / Protected (Standard API v1)
 */
router.get(
  '/',
  validateParams(farmIdParamForWeatherSchema),
  validateQuery(historicalWeatherQuerySchema),
  weatherController.getHistoricalWeather.bind(weatherController)
);

export const weatherRoutes = router;
