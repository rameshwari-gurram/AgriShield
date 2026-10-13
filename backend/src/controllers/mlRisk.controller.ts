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
import { ApiResponse } from '../utils/apiResponse.js';

export class MLRiskController {
  private service: MLRiskAssessmentService;

  constructor(service: MLRiskAssessmentService = mlRiskAssessmentService) {
    this.service = service;
  }

  /**
   * Allows injecting a mock service instance for testing.
   */
  public setService(service: MLRiskAssessmentService): void {
    this.service = service;
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
}

export const mlRiskController = new MLRiskController();
