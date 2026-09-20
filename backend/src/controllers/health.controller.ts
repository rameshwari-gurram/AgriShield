import { Request, Response, NextFunction } from 'express';
import { healthService } from '../services/health.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class HealthController {
  /**
   * GET /api/v1/health
   * Returns system health status
   */
  async getHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const healthData = await healthService.getSystemHealth();
      const httpStatus = healthData.status === 'unhealthy' ? 503 : 200;
      res.status(httpStatus).json(
        ApiResponse.success(healthData, 'System health report generated', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/health/ready
   * Kubernetes/Docker readiness check probe
   */
  async getReadiness(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const readiness = await healthService.getReadiness();
      const httpStatus = readiness.ready ? 200 : 503;
      res.status(httpStatus).json(
        ApiResponse.success(readiness, readiness.ready ? 'Service is ready' : 'Service is not ready', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const healthController = new HealthController();
