import { Request, Response, NextFunction } from 'express';
import { farmBoundaryService, FarmBoundaryService } from '../services/farmBoundary.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class FarmBoundaryController {
  private service: FarmBoundaryService;

  constructor(service: FarmBoundaryService = farmBoundaryService) {
    this.service = service;
  }

  /**
   * POST /api/v1/farms/:farmId/boundary
   * Saves or registers boundary for a farm
   */
  async createBoundary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const result = await this.service.createBoundary(farmId, req.body);
      res.status(201).json(
        ApiResponse.success(result, 'Farm boundary saved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/boundary
   * Retrieves boundary for a farm
   */
  async getBoundary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const result = await this.service.getBoundary(farmId);
      res.status(200).json(
        ApiResponse.success(result, 'Farm boundary retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/farms/:farmId/boundary
   * Updates boundary for a farm
   */
  async updateBoundary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      const result = await this.service.updateBoundary(farmId, req.body);
      res.status(200).json(
        ApiResponse.success(result, 'Farm boundary updated successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/farms/:farmId/boundary
   * Deletes boundary for a farm
   */
  async deleteBoundary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { farmId } = req.params;
      await this.service.deleteBoundary(farmId);
      res.status(200).json(
        ApiResponse.success(null, 'Farm boundary deleted successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const farmBoundaryController = new FarmBoundaryController();
