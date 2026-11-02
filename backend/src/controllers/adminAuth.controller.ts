/**
 * AgriShield Stage 1: Administrative Authentication Controller
 * Handles POST /api/v1/auth/admin/login
 */

import { Request, Response, NextFunction } from 'express';
import { adminAuthService, AdminAuthService } from '../services/adminAuth.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class AdminAuthController {
  private service: AdminAuthService;

  constructor(service: AdminAuthService = adminAuthService) {
    this.service = service;
  }

  /**
   * POST /api/v1/auth/admin/login
   * Authenticates administrator using username/email and password.
   * Issues JWT Bearer token with role: 'ADMIN'.
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress;

      const result = await this.service.login(username, password, clientIp);

      res.status(200).json(
        ApiResponse.success(result, 'Administrator authenticated successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const adminAuthController = new AdminAuthController();
