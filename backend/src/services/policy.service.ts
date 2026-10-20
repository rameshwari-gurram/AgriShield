/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Policy Business Logic Service
 *
 * Enforces farm eligibility, boundary verification, unique policy numbering,
 * overlapping policy detection, and explicit validated issuance.
 */

import { Policy, PolicyStatus, FarmStatus, Prisma } from '@prisma/client';
import crypto from 'crypto';
import { policyRepository } from '../repositories/policy.repository.js';
import { farmRepository } from '../repositories/farm.repository.js';
import { farmerRepository } from '../repositories/farmer.repository.js';
import { farmBoundaryRepository } from '../repositories/farmBoundary.repository.js';
import { CreatePolicyDTO, PolicyResponseDTO, IPolicyRepository } from '../types/policy.types.js';
import { IFarmRepository } from '../types/farm.types.js';
import { IFarmerRepository } from '../types/farmer.types.js';
import { IFarmBoundaryRepository } from '../types/farmBoundary.types.js';
import { createPolicySchema } from '../validators/policy.validator.js';
import { AppError } from '../utils/apiError.js';

export class PolicyService {
  private policyRepo: IPolicyRepository;
  private farmRepo: IFarmRepository;
  private farmerRepo: IFarmerRepository;
  private boundaryRepo: IFarmBoundaryRepository;

  constructor(
    policyRepo: IPolicyRepository = policyRepository,
    farmRepo: IFarmRepository = farmRepository,
    farmerRepo: IFarmerRepository = farmerRepository,
    boundaryRepo: IFarmBoundaryRepository = farmBoundaryRepository
  ) {
    this.policyRepo = policyRepo;
    this.farmRepo = farmRepo;
    this.farmerRepo = farmerRepo;
    this.boundaryRepo = boundaryRepo;
  }

  /**
   * Safely generate a unique internal AgriShield policy number.
   * Format: POL-<YYYYMMDD>-<HEX4>
   * Example: POL-20261013-F8C2
   */
  public async generateUniquePolicyNumber(): Promise<string> {
    const maxRetries = 3;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const entropy = crypto.randomBytes(2).toString('hex').toUpperCase();
      const candidateNumber = `POL-${dateStr}-${entropy}`;

      const existing = await this.policyRepo.findById(candidateNumber);
      if (!existing) {
        return candidateNumber;
      }
    }

    return `POL-${dateStr}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  }

  /**
   * Create an initial policy quote/contract in PENDING status.
   * Performs farmer-farm association checks, boundary eligibility verification,
   * date validity checks, and overlapping coverage detection.
   */
  async createPolicy(input: CreatePolicyDTO): Promise<PolicyResponseDTO> {
    // 1. Validate payload schema
    const validation = createPolicySchema.safeParse(input);
    if (!validation.success) {
      throw AppError.badRequest('Invalid policy creation input', validation.error.format());
    }
    const data = validation.data;

    // 2. Verify farm existence, status, and farmer association
    const farm = await this.farmRepo.findById(data.farmId);
    if (!farm) {
      throw AppError.notFound(`Farm parcel with ID '${data.farmId}' not found`);
    }

    if (farm.status !== FarmStatus.ACTIVE) {
      throw AppError.badRequest(
        `Farm parcel '${data.farmId}' has status '${farm.status}'. Only ACTIVE farms are eligible for coverage.`
      );
    }

    if (farm.farmerId !== data.farmerId) {
      throw AppError.badRequest(
        `Farmer with ID '${data.farmerId}' is not the registered producer for farm parcel '${data.farmId}'.`
      );
    }

    // 3. Verify farmer existence
    const farmer = await this.farmerRepo.findById(data.farmerId);
    if (!farmer) {
      throw AppError.notFound(`Farmer with ID '${data.farmerId}' not found`);
    }

    // 4. Verify boundary existence
    const boundary = await this.boundaryRepo.findByFarmId(data.farmId);
    if (!boundary) {
      throw AppError.badRequest(
        `Farm parcel '${data.farmId}' lacks an established geospatial boundary. A validated boundary is required for parametric coverage.`
      );
    }

    // 5. Detect overlapping active/pending policies for the farm parcel
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    const existingPolicies = await this.policyRepo.findByFarmId(data.farmId);
    const overlappingPolicy = existingPolicies.find((p: Policy) => {
      // Ignore exhausted or cancelled policies
      if (p.status === PolicyStatus.EXHAUSTED || p.status === PolicyStatus.CANCELLED) {
        return false;
      }
      // Check date interval intersection: S1 <= E2 and E1 >= S2
      const pStart = new Date(p.startDate).getTime();
      const pEnd = new Date(p.endDate).getTime();
      const targetStart = startDate.getTime();
      const targetEnd = endDate.getTime();

      return pStart <= targetEnd && pEnd >= targetStart;
    });

    if (overlappingPolicy) {
      throw AppError.conflict(
        `Farm parcel '${data.farmId}' already has an overlapping ${overlappingPolicy.status} policy ('${overlappingPolicy.policyNumber}') during the requested coverage window.`
      );
    }

    // 6. Generate unique policy number
    const policyNumber = data.policyNumber || (await this.generateUniquePolicyNumber());

    // 7. Persist policy in PENDING status
    const createdPolicy = await this.policyRepo.createPolicy({
      policyNumber,
      farmId: data.farmId,
      farmerId: data.farmerId,
      cropName: data.cropName,
      sumInsured: new Prisma.Decimal(data.sumInsured.toString()),
      premiumAmount: new Prisma.Decimal(data.premiumAmount.toString()),
      coveredHazards: data.coveredHazards,
      startDate,
      endDate,
      cumulativePaidAmount: new Prisma.Decimal('0.00'),
      status: PolicyStatus.PENDING,
    });

    return this.formatPolicy(createdPolicy);
  }

  /**
   * Activate an existing policy through a distinct, validated issuance operation.
   * Policies start as PENDING and transition to ACTIVE only when issuance conditions are met.
   */
  async issuePolicy(policyId: string): Promise<PolicyResponseDTO> {
    const policy = await this.policyRepo.findById(policyId);
    if (!policy) {
      throw AppError.notFound(`Policy with ID '${policyId}' not found`);
    }

    if (policy.status === PolicyStatus.ACTIVE) {
      throw AppError.badRequest(`Policy '${policy.policyNumber}' is already ACTIVE`);
    }

    if (policy.status !== PolicyStatus.PENDING) {
      throw AppError.badRequest(
        `Cannot issue policy '${policy.policyNumber}' with status '${policy.status}'. Only PENDING policies can be activated.`
      );
    }

    // Re-verify farm status
    const farm = await this.farmRepo.findById(policy.farmId);
    if (!farm || farm.status !== FarmStatus.ACTIVE) {
      throw AppError.badRequest(
        `Cannot issue policy for farm parcel '${policy.farmId}' because it is no longer active.`
      );
    }

    // Verify policy coverage window has not already expired
    if (new Date() > new Date(policy.endDate)) {
      throw AppError.badRequest(
        `Cannot issue policy '${policy.policyNumber}' because its coverage period has already expired.`
      );
    }

    // Transition to ACTIVE
    const activatedPolicy = await this.policyRepo.updatePolicyStatus(policyId, PolicyStatus.ACTIVE);
    return this.formatPolicy(activatedPolicy);
  }

  /**
   * Retrieve policy by UUID.
   */
  async getPolicyById(policyId: string): Promise<PolicyResponseDTO> {
    const policy = await this.policyRepo.findById(policyId);
    if (!policy) {
      throw AppError.notFound(`Policy with ID '${policyId}' not found`);
    }
    return this.formatPolicy(policy);
  }

  /**
   * Retrieve all policies for a given farm parcel.
   */
  async getPoliciesForFarm(farmId: string): Promise<PolicyResponseDTO[]> {
    const farm = await this.farmRepo.findById(farmId);
    if (!farm) {
      throw AppError.notFound(`Farm parcel with ID '${farmId}' not found`);
    }

    const policies = await this.policyRepo.findByFarmId(farmId);
    return policies.map((p: Policy) => this.formatPolicy(p));
  }

  /**
   * Retrieve the currently active policy covering a given reference timestamp for a farm parcel.
   */
  async getActivePolicyForFarm(
    farmId: string,
    referenceDate: Date = new Date()
  ): Promise<PolicyResponseDTO | null> {
    const farm = await this.farmRepo.findById(farmId);
    if (!farm) {
      throw AppError.notFound(`Farm parcel with ID '${farmId}' not found`);
    }

    const policy = await this.policyRepo.findActivePolicyForFarm(farmId, referenceDate);
    return policy ? this.formatPolicy(policy) : null;
  }

  /**
   * Format Prisma Policy entity into clean presentation DTO.
   */
  public formatPolicy(policy: Policy): PolicyResponseDTO {
    const sumInsuredDec = new Prisma.Decimal(policy.sumInsured);
    const paidDec = new Prisma.Decimal(policy.cumulativePaidAmount);
    const remainingDec = sumInsuredDec.sub(paidDec);

    return {
      id: policy.id,
      policyNumber: policy.policyNumber,
      farmId: policy.farmId,
      farmerId: policy.farmerId,
      cropName: policy.cropName,
      sumInsured: sumInsuredDec.toFixed(2),
      premiumAmount: new Prisma.Decimal(policy.premiumAmount).toFixed(2),
      coveredHazards: policy.coveredHazards,
      startDate: policy.startDate instanceof Date ? policy.startDate.toISOString() : String(policy.startDate),
      endDate: policy.endDate instanceof Date ? policy.endDate.toISOString() : String(policy.endDate),
      cumulativePaidAmount: paidDec.toFixed(2),
      remainingCoverage: remainingDec.toFixed(2),
      status: policy.status,
      createdAt: policy.createdAt instanceof Date ? policy.createdAt.toISOString() : String(policy.createdAt),
      updatedAt: policy.updatedAt instanceof Date ? policy.updatedAt.toISOString() : String(policy.updatedAt),
    };
  }
}

export const policyService = new PolicyService();
