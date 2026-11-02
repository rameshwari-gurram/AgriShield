import { Request, Response, NextFunction } from 'express';
import { farmerService, FarmerService } from '../services/farmer.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../utils/apiError.js';

export class FarmerController {
  private service: FarmerService;

  constructor(service: FarmerService = farmerService) {
    this.service = service;
  }

  public setService(service: FarmerService): void {
    this.service = service;
  }

  /**
   * POST /api/v1/farmers
   * Registers a new farmer
   */
  async createFarmer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.registerFarmer(req.body);
      res.status(201).json(
        ApiResponse.success(result, 'Farmer registered successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farmers
   * Retrieves paginated list of farmers
   */
  async getFarmers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.getAllFarmers(req.query);
      res.status(200).json(
        ApiResponse.success(result, 'Farmers retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farmers/:id
   * Retrieves farmer by ID
   */
  async getFarmerById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role === 'FARMER' && req.user.id !== req.params.id) {
        throw AppError.forbidden('Access denied: You do not have permission to access another farmer profile');
      }

      const result = await this.service.getFarmerById(req.params.id);
      res.status(200).json(
        ApiResponse.success(result, 'Farmer details retrieved', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const farmerController = new FarmerController();
