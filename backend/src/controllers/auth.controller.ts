import { Request, Response, NextFunction } from 'express';
import { authService, AuthService } from '../services/auth.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../utils/apiError.js';

export class AuthController {
  private service: AuthService;

  constructor(service: AuthService = authService) {
    this.service = service;
  }

  /**
   * POST /api/v1/auth/otp/send
   * Dispatches ephemeral 6-digit OTP to registered mobile number or email.
   * Employs non-enumerating responses.
   */
  async sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const identifier = req.body.identifier || req.body.mobileNumber || req.body.email;
      const clientIp = req.ip || req.socket.remoteAddress;

      const result = await this.service.sendOtp(identifier, clientIp);
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
      const identifier = req.body.identifier || req.body.mobileNumber || req.body.email;
      const { otp } = req.body;

      const result = await this.service.verifyOtp(identifier, otp);
      res.status(200).json(
        ApiResponse.success(result, 'Producer authenticated successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/email/request-link
   * Dispatches OTP to target email to verify ownership before linking to authenticated farmer.
   */
  async requestEmailLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const farmerId = req.user?.id;
      if (!farmerId) {
        throw AppError.unauthorized('Authentication required to link email address');
      }
      const { email } = req.body;
      const clientIp = req.ip || req.socket.remoteAddress;

      const result = await this.service.requestEmailLink(farmerId, email, clientIp);
      res.status(200).json(
        ApiResponse.success(result, result.message, req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/email/confirm-link
   * Confirms email linking with 6-digit OTP and associates email in PostgreSQL.
   */
  async confirmEmailLink(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const farmerId = req.user?.id;
      if (!farmerId) {
        throw AppError.unauthorized('Authentication required to link email address');
      }
      const { email, otp } = req.body;

      const result = await this.service.confirmEmailLink(farmerId, email, otp);
      res.status(200).json(
        ApiResponse.success(result, result.message, req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
