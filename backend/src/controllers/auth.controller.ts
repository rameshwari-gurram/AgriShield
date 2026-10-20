import { Request, Response, NextFunction } from 'express';
import { authService, AuthService } from '../services/auth.service.js';
import { ApiResponse } from '../utils/apiResponse.js';

export class AuthController {
  private service: AuthService;

  constructor(service: AuthService = authService) {
    this.service = service;
  }

  /**
   * POST /api/v1/auth/otp/send
   * Dispatches ephemeral 6-digit OTP to registered mobile number.
   * Employs non-enumerating responses.
   */
  async sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mobileNumber } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress;

      const result = await this.service.sendOtp(mobileNumber, clientIp);
      res.status(200).json(
        ApiResponse.success(result, result.message, req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/otp/verify
   * Verifies 6-digit OTP and issues authenticated JWT Bearer token for matched producer.
   */
  async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { mobileNumber, otp } = req.body;

      const result = await this.service.verifyOtp(mobileNumber, otp);
      res.status(200).json(
        ApiResponse.success(result, 'Producer authenticated successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
