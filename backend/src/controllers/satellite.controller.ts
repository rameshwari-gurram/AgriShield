/**
 * Module 7: Satellite API Controller
 * Thin HTTP controller delegating all domain logic to SatelliteService.
 *
 * Endpoints:
 * - POST /api/v1/farms/:farmId/satellite/sync
 * - GET  /api/v1/farms/:farmId/satellite/latest
 * - GET  /api/v1/farms/:farmId/satellite?from=...&to=...&limit=...
 */

import { Request, Response, NextFunction } from 'express';
import { satelliteService, SatelliteService } from '../services/satellite.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../utils/apiError.js';

export class SatelliteController {
  private service: SatelliteService;

  constructor(service: SatelliteService = satelliteService) {
    this.service = service;
  }

  /**
   * Allows swapping or injecting service instance (e.g. for testing)
   */
  public setService(service: SatelliteService): void {
    this.service = service;
  }

  /**
   * POST /api/v1/farms/:farmId/satellite/sync
   * Triggers Sentinel-2 satellite observation synchronization for a farm parcel.
   *
   * Request Body:
   * - from: ISO-8601 string (required)
   * - to: ISO-8601 string (required)
   * - maxCloudCoverage: optional number (0.0 - 100.0)
   */
  async syncSatellite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const { from, to, maxCloudCoverage } = req.body;

      const dateRange = {
        from: new Date(from),
        to: new Date(to),
      };

      const options =
        maxCloudCoverage !== undefined ? { maxCloudCoverage: Number(maxCloudCoverage) } : undefined;

      const result = await this.service.syncSatelliteObservations(farmId, dateRange, options);

      res.status(200).json(
        ApiResponse.success(result, 'Satellite data synchronized successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/satellite/latest
   * Retrieves the newest persisted satellite NDVI observation for a farm.
   * Throws HTTP 404 if no observations exist for the farm.
   */
  async getLatestNdvi(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const result = await this.service.getLatestNdvi(farmId);

      if (!result) {
        throw AppError.notFound(`No satellite NDVI observations found for farm '${farmId}'`);
      }

      res.status(200).json(
        ApiResponse.success(result, 'Latest satellite NDVI retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/satellite?from=...&to=...&limit=...
   * Retrieves historical satellite NDVI observations for a farm within a date range.
   * Returns observations ordered chronologically ascending (observedAt ASC).
   */
  async getHistoricalNdvi(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const { from, to, limit } = req.query as { from?: string; to?: string; limit?: string };
      const parsedLimit = limit ? parseInt(limit, 10) : 100;

      const result = await this.service.getHistoricalNdvi(farmId, {
        from,
        to,
        limit: parsedLimit,
      });

      res.status(200).json(
        ApiResponse.success(result, 'Historical satellite NDVI retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const satelliteController = new SatelliteController();
