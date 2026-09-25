/**
 * Module 6 Stage 6: Risk Rule Controller
 * Thin HTTP controller delegating active rule catalog retrieval to RiskRuleService.
 */

import { Request, Response, NextFunction } from 'express';
import { riskRuleService, RiskRuleService } from '../services/riskRule.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class RiskRuleController {
  private service: RiskRuleService;

  constructor(service: RiskRuleService = riskRuleService) {
    this.service = service;
  }

  /**
   * Allows injecting a service instance (e.g. for testing)
   */
  public setService(service: RiskRuleService): void {
    this.service = service;
  }

  /**
   * GET /api/v1/risk-rules
   * Retrieves all active parametric risk rules ordered deterministically by code ascending.
   * Returns HTTP 200 OK.
   */
  async getActiveRules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rules = await this.service.getActiveRules();
      res.status(200).json(
        ApiResponse.success(
          rules,
          'Active parametric risk rules retrieved successfully',
          req.correlationId
        )
      );
    } catch (error) {
      next(error);
    }
  }
}

export const riskRuleController = new RiskRuleController();
