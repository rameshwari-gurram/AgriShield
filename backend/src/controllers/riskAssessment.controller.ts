/**
 * Module 6: Risk Assessment Controller
 * Thin HTTP controller delegating all domain logic to RiskAssessmentService.
 */

import { Request, Response, NextFunction } from 'express';
import { riskAssessmentService, RiskAssessmentService } from '../services/riskAssessment.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class RiskAssessmentController {
  private service: RiskAssessmentService;

  constructor(service: RiskAssessmentService = riskAssessmentService) {
    this.service = service;
  }

  /**
   * Allows swapping or injecting service instance (e.g. for testing)
   */
  public setService(service: RiskAssessmentService): void {
    this.service = service;
  }

  /**
   * POST /api/v1/farms/:farmId/risk-assessments
   * Triggers a new deterministic risk assessment using the farm's latest weather observation.
   * Returns HTTP 201 Created.
   */
  async createAssessment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const result = await this.service.assessFarmRisk(farmId);
      res.status(201).json(
        ApiResponse.success(result, 'Risk assessment completed successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/risk-assessments/latest
   * Retrieves the newest persisted assessment for a farm.
   * Returns HTTP 200 OK.
   */
  async getLatestAssessment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const result = await this.service.getLatestAssessmentForFarm(farmId);
      res.status(200).json(
        ApiResponse.success(result, 'Latest risk assessment retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/risk-assessments
   * Retrieves assessment history for a farm parcel, newest first.
   * Supports optional query parameter: limit (1 to 100).
   * Returns HTTP 200 OK.
   */
  async getAssessmentsForFarm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const result = await this.service.getAssessmentsForFarm(farmId, limit);
      res.status(200).json(
        ApiResponse.success(result, 'Risk assessments retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/risk-assessments/:assessmentId
   * Retrieves a single assessment by ID with populated risk events and rule definitions.
   * Returns HTTP 200 OK.
   */
  async getAssessmentById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { assessmentId } = req.params;
      const result = await this.service.getAssessmentById(assessmentId);
      res.status(200).json(
        ApiResponse.success(result, 'Risk assessment retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const riskAssessmentController = new RiskAssessmentController();
