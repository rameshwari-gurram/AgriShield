/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.4: Claim Controller (Security Hardened)
 *
 * Exposes Claim operations via Express controller methods.
 * Enforces strict object-level authorization (BOLA/IDOR protection).
 * Ensures consistent response formatting using ApiResponse.success.
 */

import { Request, Response, NextFunction } from 'express';
import { claimService, ClaimService } from '../services/claim.service.js';
import { policyRepository } from '../repositories/policy.repository.js';
import { farmRepository } from '../repositories/farm.repository.js';
import { IPolicyRepository } from '../types/policy.types.js';
import { IFarmRepository } from '../types/farm.types.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../utils/apiError.js';

export class ClaimController {
  private service: ClaimService;
  private policyRepo: IPolicyRepository;
  private farmRepo: IFarmRepository;

  constructor(
    service: ClaimService = claimService,
    policyRepo: IPolicyRepository = policyRepository,
    farmRepo: IFarmRepository = farmRepository
  ) {
    this.service = service;
    this.policyRepo = policyRepo;
    this.farmRepo = farmRepo;
  }

  /**
   * Inject a mock service instance for isolated testing.
   */
  public setService(service: ClaimService): void {
    this.service = service;
  }

  /**
   * Inject a mock policy repository for isolated testing.
   */
  public setPolicyRepo(repo: IPolicyRepository): void {
    this.policyRepo = repo;
  }

  /**
   * Inject a mock farm repository for isolated testing.
   */
  public setFarmRepo(repo: IFarmRepository): void {
    this.farmRepo = repo;
  }

  /**
   * POST /api/v1/claims/evaluate
   * Evaluates a prospective claim against Module 6 assessment results.
   * Enforces that the caller owns the policy being evaluated or is ADMIN.
   */
  async evaluateClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Object-level authorization: caller must own the target policy or be ADMIN
      const policy = await this.policyRepo.findById(req.body.policyId);
      if (!policy) {
        throw AppError.notFound(`Policy with ID '${req.body.policyId}' not found`);
      }
      if (req.user && req.user.role !== 'ADMIN' && policy.farmerId !== req.user.id) {
        throw AppError.forbidden('Access denied: You do not have permission to evaluate claims for this policy');
      }

      const result = await this.service.evaluateClaim(req.body);
      res.status(201).json(
        ApiResponse.success(result, 'Claim evaluated successfully in PENDING status', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/claims/:id
   * Retrieves claim details by UUID.
   * Enforces that the caller owns the associated policy or is ADMIN.
   */
  async getClaimById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.getClaimById(req.params.id);

      // Object-level authorization: caller must own the associated policy or be ADMIN
      const policy = await this.policyRepo.findById(result.policyId);
      if (!policy) {
        throw AppError.notFound('Associated policy for claim not found');
      }
      if (req.user && req.user.role !== 'ADMIN' && policy.farmerId !== req.user.id) {
        throw AppError.forbidden('Access denied: You do not have permission to access this claim');
      }

      res.status(200).json(
        ApiResponse.success(result, 'Claim retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/claims/:id/approve
   * Approves a PENDING claim without modifying policy balance.
   * Strictly restricted to ADMIN role.
   */
  async approveClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role !== 'ADMIN') {
        throw AppError.forbidden('Access denied: Admin role required to approve claims');
      }

      const result = await this.service.approveClaim(req.params.id);
      res.status(200).json(
        ApiResponse.success(result, 'Claim approved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/claims/:id/settle
   * Settles a claim inside a transactional boundary with simulated payout reference.
   * Strictly restricted to ADMIN role.
   */
  async settleClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role !== 'ADMIN') {
        throw AppError.forbidden('Access denied: Admin role required to settle claims');
      }

      const options = req.body?.simulatedTransactionId
        ? { simulatedTransactionId: req.body.simulatedTransactionId }
        : undefined;

      const result = await this.service.settleClaim(req.params.id, options);
      res.status(200).json(
        ApiResponse.success(result, 'Claim settled and paid successfully via simulated payout', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/claims/:id/reject
   * Rejects a claim with an explicit reason.
   * Strictly restricted to ADMIN role.
   */
  async rejectClaim(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role !== 'ADMIN') {
        throw AppError.forbidden('Access denied: Admin role required to reject claims');
      }

      const { reason } = req.body;
      const result = await this.service.rejectClaim(req.params.id, reason);
      res.status(200).json(
        ApiResponse.success(result, 'Claim rejected successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/claims?policyId=<uuid>&farmId=<uuid>
   * Queries claims by policyId or farmId.
   * Enforces object-level authorization across every supplied query filter.
   * When both filters are supplied, verifies a consistent, authorized relationship.
   */
  async getClaims(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { policyId, farmId } = req.query as { policyId?: string; farmId?: string };

      if (!policyId && !farmId && req.user?.role !== 'ADMIN') {
        throw AppError.badRequest('policyId or farmId query parameter is required for farmer claims listing');
      }

      if (policyId && farmId) {
        // 1. Verify policy existence and ownership
        const policy = await this.policyRepo.findById(policyId);
        if (!policy) {
          throw AppError.notFound(`Policy with ID '${policyId}' not found`);
        }
        if (req.user && req.user.role !== 'ADMIN' && policy.farmerId !== req.user.id) {
          throw AppError.forbidden('Access denied: You do not have permission to access claims for this policy');
        }

        // 2. Verify farm existence and ownership
        const farm = await this.farmRepo.findById(farmId);
        if (!farm) {
          throw AppError.notFound(`Farm with ID '${farmId}' not found`);
        }
        if (req.user && req.user.role !== 'ADMIN' && farm.farmerId !== req.user.id) {
          throw AppError.forbidden(`Access denied: You do not have permission to access claims for farm '${farmId}'`);
        }

        // 3. Verify consistent relationship: policy must belong to the queried farm parcel
        if (policy.farmId !== farmId) {
          throw AppError.badRequest(`Policy '${policy.policyNumber}' does not belong to farm parcel '${farmId}'`);
        }

        const result = await this.service.getClaimsForPolicy(policyId);
        res.status(200).json(
          ApiResponse.success(result, 'Policy claims retrieved successfully', req.correlationId)
        );
      } else if (policyId) {
        // Verify policy existence and ownership
        const policy = await this.policyRepo.findById(policyId);
        if (!policy) {
          throw AppError.notFound(`Policy with ID '${policyId}' not found`);
        }
        if (req.user && req.user.role !== 'ADMIN' && policy.farmerId !== req.user.id) {
          throw AppError.forbidden('Access denied: You do not have permission to access claims for this policy');
        }

        const result = await this.service.getClaimsForPolicy(policyId);
        res.status(200).json(
          ApiResponse.success(result, 'Policy claims retrieved successfully', req.correlationId)
        );
      } else if (farmId) {
        // Verify farm existence and ownership
        const farm = await this.farmRepo.findById(farmId);
        if (!farm) {
          throw AppError.notFound(`Farm with ID '${farmId}' not found`);
        }
        if (req.user && req.user.role !== 'ADMIN' && farm.farmerId !== req.user.id) {
          throw AppError.forbidden(`Access denied: You do not have permission to access claims for farm '${farmId}'`);
        }

        const result = await this.service.getClaimsForFarm(farmId);
        res.status(200).json(
          ApiResponse.success(result, 'Farm claims retrieved successfully', req.correlationId)
        );
      } else {
        res.status(200).json(
          ApiResponse.success([], 'Claims retrieved successfully', req.correlationId)
        );
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/claims
   * Retrieves all claims for a given farm parcel.
   */
  async getClaimsForFarm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const farmId = req.params.farmId;
      const result = await this.service.getClaimsForFarm(farmId);
      res.status(200).json(
        ApiResponse.success(result, 'Farm claims retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }
}

export const claimController = new ClaimController();
