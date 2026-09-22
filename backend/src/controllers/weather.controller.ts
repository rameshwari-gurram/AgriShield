/**
 * Module 5: Weather API Controller
 * Thin HTTP controller delegating all domain logic to WeatherService.
 *
 * Traceability & Attribution:
 * Stores the centroid coordinates used for the weather query, preserving query-location traceability.
 * Model-derived weather data for the farm centroid coordinates.
 * Not an on-site physical weather-station measurement.
 * Data source attributed to "Open-Meteo".
 */

import { Request, Response, NextFunction } from 'express';
import { weatherService, WeatherService } from '../services/weather.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../utils/apiError.js';

export class WeatherController {
  private service: WeatherService;

  constructor(service: WeatherService = weatherService) {
    this.service = service;
  }

  /**
   * Allows swapping or injecting service instance (e.g. for unit/integration testing)
   */
  public setService(service: WeatherService): void {
    this.service = service;
  }

  /**
   * POST /api/v1/farms/:farmId/weather/sync
   * Synchronizes weather data for a farm parcel.
   *
   * Orchestration:
   * - First sync: Fetches current weather and preceding 24h hourly observations,
   *   persists atomically via a Prisma transaction, returns isInitialBackfill = true.
   * - Subsequent sync: Fetches current observation only, upserts idempotently,
   *   returns isInitialBackfill = false, recordsSynced = 1.
   */
  async syncWeather(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const result = await this.service.syncWeather(farmId);
      res.status(200).json(
        ApiResponse.success(result, 'Weather data synchronized successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/weather/latest
   * Retrieves the newest persisted weather record for a farm from PostgreSQL.
   * Does NOT call Open-Meteo and does NOT trigger synchronization.
   * Throws 404 if no weather records exist for the farm.
   */
  async getLatestWeather(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const result = await this.service.getLatestWeather(farmId);
      if (!result) {
        throw AppError.notFound(`No weather records found for farm '${farmId}'`);
      }
      res.status(200).json(
        ApiResponse.success(result, 'Latest weather retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/weather?from=...&to=...
   * Retrieves historical weather observations from PostgreSQL within a time window.
   * Does NOT call Open-Meteo and does NOT trigger synchronization.
   * Returns observations ordered chronologically ascending (observedAt ASC).
   */
  async getHistoricalWeather(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const { from, to, limit } = req.query as { from: string; to: string; limit?: string };
      const parsedLimit = limit ? parseInt(limit, 10) : 100;
      const result = await this.service.getHistoricalWeather(farmId, from, to, parsedLimit);
      res.status(200).json(
        ApiResponse.success(result, 'Historical weather retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const weatherController = new WeatherController();
