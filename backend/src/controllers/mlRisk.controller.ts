/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-D: ML Risk Controller
 *
 * Thin Express controller that delegates all risk assessment, caching,
 * inference, and persistence orchestration to MLRiskAssessmentService.
 */

import { Request, Response, NextFunction } from 'express';
import {
  mlRiskAssessmentService,
  MLRiskAssessmentService,
} from '../services/mlRiskAssessment.service.js';
import {
  ndviForecastService,
  NdviForecastService,
} from '../services/ndviForecast.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class MLRiskController {
  private service: MLRiskAssessmentService;
  private ndviService: NdviForecastService;

  constructor(
    service: MLRiskAssessmentService = mlRiskAssessmentService,
    ndviService: NdviForecastService = ndviForecastService
  ) {
    this.service = service;
    this.ndviService = ndviService;
  }

  /**
   * Allows injecting mock service instances for testing.
   */
  public setService(service: MLRiskAssessmentService): void {
    this.service = service;
  }

  public setNdviService(ndviService: NdviForecastService): void {
    this.ndviService = ndviService;
  }

  /**
   * GET /api/v1/farms/:farmId/ml-risk
   *
   * Evaluates or retrieves the cached advisory machine learning risk prediction
   * and 17-feature SHAP explanation for a farm parcel.
   *
   * Query params:
   * - forceRefresh: boolean ('true' | 'false', default: false)
   */
  async getFarmRisk(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const forceRefresh = String(req.query.forceRefresh) === 'true';

      const result = await this.service.assessFarmRisk(farmId, { forceRefresh });

      const message = result.isCached
        ? 'Cached ML risk prediction retrieved successfully'
        : 'ML risk prediction evaluated and persisted successfully';

      res.status(200).json(
        ApiResponse.success(result, message, req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/ml-risk/ndvi-forecast
   *
   * Generates a 7-day ahead Sentinel-2 NDVI vegetation condition forecast
   * and 29-feature SHAP explanation for a farm parcel.
   */
  async getFarmNdviForecast(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const result = await this.ndviService.forecastFarmNdvi(farmId);

      res.status(200).json(
        ApiResponse.success(
          result,
          'Next-week NDVI vegetation condition forecast generated successfully',
          req.correlationId
        )
      );
    } catch (error) {
      next(error);
    }
  }
}

export const mlRiskController = new MLRiskController();
