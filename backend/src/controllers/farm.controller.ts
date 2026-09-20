import { Request, Response, NextFunction } from 'express';
import { farmService, FarmService } from '../services/farm.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class FarmController {
  private service: FarmService;

  constructor(service: FarmService = farmService) {
    this.service = service;
  }

  /**
   * POST /api/v1/farms
   * Registers a new farm parcel
   */
  async createFarm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.registerFarm(req.body);
      res.status(201).json(
        ApiResponse.success(result, 'Farm registered successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms
   * Retrieves paginated list of farms with optional filtering
   */
  async getFarms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.getAllFarms(req.query);
      res.status(200).json(
        ApiResponse.success(result, 'Farms retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:id
   * Retrieves farm by ID with associated farmer details
   */
  async getFarmById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.getFarmById(req.params.id);
      res.status(200).json(
        ApiResponse.success(result, 'Farm details retrieved', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farmers/:farmerId/farms
   * Retrieves all farms belonging to a specific farmer
   */
  async getFarmerFarms(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const farmerId = req.params.farmerId || req.params.id;
      const result = await this.service.getFarmsByFarmerId(farmerId);
      res.status(200).json(
        ApiResponse.success(result, 'Farmer farms retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/farms/:id
   * Partially updates a farm
   */
  async updateFarm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.updateFarm(req.params.id, req.body);
      res.status(200).json(
        ApiResponse.success(result, 'Farm updated successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/farms/:id
   * Deletes a farm
   */
  async deleteFarm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.deleteFarm(req.params.id);
      res.status(200).json(
        ApiResponse.success(result, 'Farm deleted successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const farmController = new FarmController();
