/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.4: Policy Controller (Security Hardened)
 *
 * Exposes Policy operations via Express controller methods.
 * Enforces strict object-level authorization (BOLA/IDOR protection).
 * Ensures consistent response formatting using ApiResponse.success.
 */

import { Request, Response, NextFunction } from 'express';
import { policyService, PolicyService } from '../services/policy.service.js';
import { farmRepository } from '../repositories/farm.repository.js';
import { IFarmRepository } from '../types/farm.types.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { AppError } from '../utils/apiError.js';

export class PolicyController {
  private service: PolicyService;
  private farmRepo: IFarmRepository;

  constructor(
    service: PolicyService = policyService,
    farmRepo: IFarmRepository = farmRepository
  ) {
    this.service = service;
    this.farmRepo = farmRepo;
  }

  /**
   * Inject a mock service instance for isolated testing.
   */
  public setService(service: PolicyService): void {
    this.service = service;
  }

  /**
   * Inject a mock farm repository for isolated testing.
   */
  public setFarmRepo(repo: IFarmRepository): void {
    this.farmRepo = repo;
  }

  /**
   * POST /api/v1/policies
   * Creates a new policy quote/contract in PENDING status.
   * Enforces that the authenticated caller matches the policy's producer identity.
   */
  async createPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Object-level authorization: non-admin caller must match the farmer identified in payload
      if (req.user && req.user.role !== 'ADMIN') {
        if (req.body.farmerId && req.body.farmerId !== req.user.id) {
          throw AppError.forbidden('Access denied: You cannot create a policy for another farmer');
        }
        if (req.body.farmId) {
          const farm = await this.farmRepo.findById(req.body.farmId);
          if (farm && farm.farmerId !== req.user.id) {
            throw AppError.forbidden("Access denied: You cannot create a policy for another farmer's farm");
          }
        }
      }

      const result = await this.service.createPolicy(req.body);
      res.status(201).json(
        ApiResponse.success(result, 'Policy created successfully in PENDING status', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/policies/:id
   * Retrieves policy details by UUID.
   * Enforces that the authenticated caller owns the policy or has ADMIN role.
   */
  async getPolicyById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.getPolicyById(req.params.id);

      // Object-level authorization: caller must be ADMIN or the policy owner
      if (req.user && req.user.role !== 'ADMIN' && result.farmerId !== req.user.id) {
        throw AppError.forbidden('Access denied: You do not have permission to access this policy');
      }

      res.status(200).json(
        ApiResponse.success(result, 'Policy retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/policies/:id/issue
   * Explicitly activates and issues a PENDING policy.
   * Strictly restricted to ADMIN role.
   */
  async issuePolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role !== 'ADMIN') {
        throw AppError.forbidden('Access denied: Admin role required to issue policies');
      }

      const result = await this.service.issuePolicy(req.params.id);
      res.status(200).json(
        ApiResponse.success(result, 'Policy issued and activated successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/policies?farmId=<uuid>
   * Queries policies, optionally filtered by farm parcel ID.
   * Enforces that the authenticated caller owns the queried farm parcel or is ADMIN.
   */
  async getPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const farmId = req.query.farmId as string | undefined;
      if (farmId) {
        // Object-level authorization: caller must own the queried farm parcel or be ADMIN
        const farm = await this.farmRepo.findById(farmId);
        if (!farm) {
          throw AppError.notFound(`Farm with ID '${farmId}' not found`);
        }
        if (req.user && req.user.role !== 'ADMIN' && farm.farmerId !== req.user.id) {
          throw AppError.forbidden(`Access denied: You do not have permission to access farm '${farmId}'`);
        }

        const result = await this.service.getPoliciesForFarm(farmId);
        res.status(200).json(
          ApiResponse.success(result, 'Policies retrieved successfully', req.correlationId)
        );
      } else {
        res.status(200).json(
          ApiResponse.success([], 'Policies retrieved successfully', req.correlationId)
        );
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/policies
   * Retrieves all policies belonging to a specific farm parcel.
   */
  async getPoliciesForFarm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const farmId = req.params.farmId;
      const result = await this.service.getPoliciesForFarm(farmId);
      res.status(200).json(
        ApiResponse.success(result, 'Farm policies retrieved successfully', req.correlationId)
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/farms/:farmId/policies/active
   * Retrieves the currently active policy covering referenceDate for the farm parcel.
   */
  async getActivePolicyForFarm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const farmId = req.params.farmId;
      const referenceDate = req.query.referenceDate
        ? new Date(req.query.referenceDate as string)
        : new Date();
      const result = await this.service.getActivePolicyForFarm(farmId, referenceDate);
      res.status(200).json(
        ApiResponse.success(
          result,
          result ? 'Active policy retrieved successfully' : 'No active policy found for farm',
          req.correlationId
        )
      );
    } catch (error) {
      next(error);
    }
  }
}

export const policyController = new PolicyController();
