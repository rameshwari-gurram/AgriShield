/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Claim Business Logic Service
 *
 * Enforces authoritative Module 6 event eligibility, payout configuration validation,
 * idempotency, separated evaluation/approval/settlement stages, and transactional settlement.
 */

import { Claim, ClaimStatus, PolicyStatus, RiskSeverity, PrismaClient, Prisma } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { claimRepository } from '../repositories/claim.repository.js';
import { policyRepository } from '../repositories/policy.repository.js';
import { riskRepository } from '../repositories/risk.repository.js';
import { ClaimResponseDTO, IClaimRepository } from '../types/claim.types.js';
import { IPolicyRepository } from '../types/policy.types.js';
import { IRiskRepository, RiskEventWithRule } from '../types/risk.types.js';
import { AppError } from '../utils/apiError.js';

export const AUTHORITATIVE_SEVERITY_MULTIPLIERS: Record<RiskSeverity, number> = {
  [RiskSeverity.LOW]: 0.25,
  [RiskSeverity.MODERATE]: 0.40,
  [RiskSeverity.HIGH]: 0.50,
  [RiskSeverity.VERY_HIGH]: 1.00,
};

export interface PayoutConfiguration {
  /**
   * Optional client payout configuration.
   * Note: Multipliers are calculated strictly from backend authoritative rates (SEC-10.2-01).
   */
  severityMultipliers?: Partial<Record<RiskSeverity, number>>;
}

export interface EvaluateClaimInput {
  policyId: string;
  assessmentId: string;
  riskEventId: string;
  payoutConfig?: PayoutConfiguration;
}

export interface ParametricClaimEligibilityResult {
  eligible: boolean;
  multiplier: number;
  basePayout: Prisma.Decimal;
  remainingCoverage: Prisma.Decimal;
  payoutAmount: Prisma.Decimal;
  rejectionReason?: string;
}

export interface ValidateClaimEligibilityInput {
  policy: {
    id: string;
    policyNumber: string;
    farmId: string;
    status: PolicyStatus;
    sumInsured: Prisma.Decimal | number | string;
    cumulativePaidAmount: Prisma.Decimal | number | string;
    startDate: Date | string;
    endDate: Date | string;
    coveredHazards: any[];
  };
  assessment: {
    id: string;
    farmId: string;
  };
  riskEvent: {
    id: string;
    assessmentId: string;
    triggered: boolean;
    severity: RiskSeverity;
    observedAt: Date | string;
    observedValue?: Prisma.Decimal | number | string | null;
    thresholdValue: Prisma.Decimal | number | string;
    riskRule?: {
      code?: string;
      hazardType?: any;
    } | null;
  };
}

export class ClaimService {
  private claimRepo: IClaimRepository;
  private policyRepo: IPolicyRepository;
  private riskRepo: IRiskRepository;
  private db: PrismaClient;

  constructor(
    claimRepo: IClaimRepository = claimRepository,
    policyRepo: IPolicyRepository = policyRepository,
    riskRepo: IRiskRepository = riskRepository,
    db: PrismaClient = prisma
  ) {
    this.claimRepo = claimRepo;
    this.policyRepo = policyRepo;
    this.riskRepo = riskRepo;
    this.db = db;
  }

  /**
   * Safely generate a unique internal AgriShield claim number.
   * Format: CLM-<YYYYMMDD>-<HEX4>
   * Example: CLM-20261013-C94B
   */
  public async generateUniqueClaimNumber(): Promise<string> {
    const maxRetries = 3;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const entropy = crypto.randomBytes(2).toString('hex').toUpperCase();
      const candidateNumber = `CLM-${dateStr}-${entropy}`;

      const existing = await this.claimRepo.findById(candidateNumber);
      if (!existing) {
        return candidateNumber;
      }
    }

    return `CLM-${dateStr}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  }

  /**
   * Pure domain calculation for parametric payout.
   * Enforces authoritative severity multipliers, remaining coverage limits, and decimal rounding.
   */
  public static computeParametricPayout(
    sumInsured: Prisma.Decimal | number | string,
    cumulativePaidAmount: Prisma.Decimal | number | string,
    severity: RiskSeverity
  ): {
    multiplier: number;
    basePayout: Prisma.Decimal;
    remainingCoverage: Prisma.Decimal;
    calculatedPayout: Prisma.Decimal;
  } {
    const sumInsuredDec = new Prisma.Decimal(sumInsured.toString());
    const cumulativePaidDec = new Prisma.Decimal(cumulativePaidAmount.toString());

    if (cumulativePaidDec.greaterThanOrEqualTo(sumInsuredDec)) {
      throw AppError.badRequest('Policy coverage limit has already been exhausted.');
    }

    const multiplier = AUTHORITATIVE_SEVERITY_MULTIPLIERS[severity];
    if (multiplier === undefined || multiplier === null || typeof multiplier !== 'number' || multiplier <= 0 || multiplier > 1.0) {
      throw AppError.internal(
        `Authoritative payout multiplier missing or invalid for severity '${severity}'`
      );
    }

    const basePayout = sumInsuredDec.mul(new Prisma.Decimal(multiplier.toString()));
    const remainingCoverage = sumInsuredDec.sub(cumulativePaidDec);
    const calculatedPayout = Prisma.Decimal.min(basePayout, remainingCoverage);
    const payoutDecimal = new Prisma.Decimal(calculatedPayout.toFixed(2));

    return {
      multiplier,
      basePayout,
      remainingCoverage,
      calculatedPayout: payoutDecimal,
    };
  }

  /**
   * Pure shared domain validation and payout calculation.
   * Enforces 100% parity between dry-run simulation and live claim evaluation.
   * Operates purely on supplied in-memory domain structures without database mutations.
   * If throwOnError is true (default), throws AppError matching standard API behavior.
   * If throwOnError is false, returns { eligible: false, rejectionReason: ... }.
   */
  public static validateClaimEligibilityAndPayout(
    input: ValidateClaimEligibilityInput,
    throwOnError: boolean = true
  ): ParametricClaimEligibilityResult {
    const { policy, assessment, riskEvent } = input;

    const reject = (statusCode: number, message: string): ParametricClaimEligibilityResult => {
      if (throwOnError) {
        if (statusCode === 404) throw AppError.notFound(message);
        if (statusCode === 409) throw AppError.conflict(message);
        throw AppError.badRequest(message);
      }
      return {
        eligible: false,
        multiplier: 0,
        basePayout: new Prisma.Decimal(0),
        remainingCoverage: new Prisma.Decimal(0),
        payoutAmount: new Prisma.Decimal(0),
        rejectionReason: message,
      };
    };

    // 1. Policy status
    if (policy.status === PolicyStatus.EXHAUSTED) {
      return reject(400, `Policy '${policy.policyNumber}' coverage limit has already been exhausted.`);
    }

    if (policy.status !== PolicyStatus.ACTIVE) {
      return reject(
        400,
        `Policy '${policy.policyNumber}' has status '${policy.status}'. Claims can only be evaluated for ACTIVE policies.`
      );
    }

    // 2. Remaining coverage
    const sumInsuredDec = new Prisma.Decimal(policy.sumInsured.toString());
    const cumulativePaidDec = new Prisma.Decimal(policy.cumulativePaidAmount.toString());

    if (cumulativePaidDec.greaterThanOrEqualTo(sumInsuredDec)) {
      return reject(
        400,
        `Policy '${policy.policyNumber}' coverage limit has already been exhausted (paid ${cumulativePaidDec.toFixed(2)} of ${sumInsuredDec.toFixed(2)}).`
      );
    }

    // 3. Farm parcel consistency
    if (assessment.farmId !== policy.farmId) {
      return reject(
        400,
        `Risk assessment '${assessment.id}' belongs to farm '${assessment.farmId}', which does not match policy covered farm '${policy.farmId}'.`
      );
    }

    // 4. Assessment and event consistency
    if (riskEvent.assessmentId !== assessment.id) {
      return reject(
        404,
        `Risk event with ID '${riskEvent.id}' not found in risk assessment '${assessment.id}'.`
      );
    }

    // 5. Triggered status
    if (!riskEvent.triggered) {
      return reject(
        400,
        `Risk event '${riskEvent.id}' was not triggered (threshold was not breached). Parametric claim cannot be created.`
      );
    }

    // 6. Coverage window check against riskEvent.observedAt
    const eventTime = new Date(riskEvent.observedAt).getTime();
    const policyStart = new Date(policy.startDate).getTime();
    const policyEnd = new Date(policy.endDate).getTime();

    if (eventTime < policyStart || eventTime > policyEnd) {
      return reject(
        400,
        `Risk event occurred at ${new Date(riskEvent.observedAt).toISOString()}, which falls outside the policy coverage window (${new Date(policy.startDate).toISOString()} to ${new Date(policy.endDate).toISOString()}).`
      );
    }

    // 7. Hazard coverage
    const hazardType = riskEvent.riskRule?.hazardType;
    if (!hazardType || !policy.coveredHazards.includes(hazardType)) {
      return reject(
        400,
        `Hazard type '${hazardType || 'UNKNOWN'}' is not included in the covered hazards for policy '${policy.policyNumber}'.`
      );
    }

    // 8. Server-authoritative payout multiplier
    const multiplier = AUTHORITATIVE_SEVERITY_MULTIPLIERS[riskEvent.severity];
    if (multiplier === undefined || multiplier === null || typeof multiplier !== 'number' || multiplier <= 0 || multiplier > 1.0) {
      if (throwOnError) {
        throw AppError.internal(
          `Authoritative payout multiplier missing or invalid for severity '${riskEvent.severity}'`
        );
      }
      return {
        eligible: false,
        multiplier: 0,
        basePayout: new Prisma.Decimal(0),
        remainingCoverage: new Prisma.Decimal(0),
        payoutAmount: new Prisma.Decimal(0),
        rejectionReason: `Authoritative payout multiplier missing or invalid for severity '${riskEvent.severity}'`,
      };
    }

    // 9. Payout calculation with remaining coverage cap
    const basePayout = sumInsuredDec.mul(new Prisma.Decimal(multiplier.toString()));
    const remainingCoverage = sumInsuredDec.sub(cumulativePaidDec);
    const calculatedPayout = Prisma.Decimal.min(basePayout, remainingCoverage);
    const payoutDecimal = new Prisma.Decimal(calculatedPayout.toFixed(2));

    return {
      eligible: true,
      multiplier,
      basePayout,
      remainingCoverage,
      payoutAmount: payoutDecimal,
    };
  }

  /**
   * Evaluate a prospective claim against authoritative Module 6 assessment results.
   * Creates claim in PENDING status without incrementing the policy balance.
   */
  async evaluateClaim(input: EvaluateClaimInput): Promise<ClaimResponseDTO> {
    // 1. Verify policy existence and active status
    const policy = await this.policyRepo.findById(input.policyId);
    if (!policy) {
      throw AppError.notFound(`Policy with ID '${input.policyId}' not found`);
    }

    if (policy.status === PolicyStatus.EXHAUSTED) {
      throw AppError.badRequest(`Policy '${policy.policyNumber}' coverage limit has already been exhausted.`);
    }

    if (policy.status !== PolicyStatus.ACTIVE) {
      throw AppError.badRequest(
        `Policy '${policy.policyNumber}' has status '${policy.status}'. Claims can only be evaluated for ACTIVE policies.`
      );
    }

    // 2. Verify authoritative Module 6 RiskAssessment
    const assessment = await this.riskRepo.findAssessmentById(input.assessmentId);
    if (!assessment) {
      throw AppError.notFound(`Risk assessment with ID '${input.assessmentId}' not found`);
    }

    // 3. Find the specific RiskEvent inside the assessment
    const riskEvent = (assessment.riskEvents || []).find((e: RiskEventWithRule) => e.id === input.riskEventId);
    if (!riskEvent) {
      throw AppError.notFound(
        `Risk event with ID '${input.riskEventId}' not found in risk assessment '${input.assessmentId}'.`
      );
    }

    // 4. Shared authoritative domain validation and payout calculation (throws on error)
    const eligibility = ClaimService.validateClaimEligibilityAndPayout(
      {
        policy,
        assessment,
        riskEvent,
      },
      true
    );

    // 5. Check for duplicate claim on (policyId, riskEventId)
    const existingClaim = await this.claimRepo.findClaimByPolicyAndRiskEvent(
      input.policyId,
      input.riskEventId
    );
    if (existingClaim) {
      throw AppError.conflict(
        `A claim for policy '${policy.policyNumber}' and risk event '${input.riskEventId}' already exists ('${existingClaim.claimNumber}').`
      );
    }

    // 6. Generate claim number
    const claimNumber = await this.generateUniqueClaimNumber();

    // 7. Persist claim in PENDING status (policy cumulativePaidAmount remains untouched)
    const observedValueDec =
      riskEvent.observedValue !== null
        ? new Prisma.Decimal(riskEvent.observedValue.toString())
        : null;
    const thresholdValueDec = new Prisma.Decimal(riskEvent.thresholdValue.toString());

    const createdClaim = await this.claimRepo.createClaim({
      claimNumber,
      policyId: input.policyId,
      assessmentId: input.assessmentId,
      riskEventId: input.riskEventId,
      triggerRuleCode: riskEvent.riskRule?.code || 'PARAMETRIC_WEATHER_RULE',
      severity: riskEvent.severity,
      observedValue: observedValueDec,
      thresholdValue: thresholdValueDec,
      payoutAmount: eligibility.payoutAmount,
      status: ClaimStatus.PENDING,
    });

    return this.formatClaim(createdClaim);
  }

  /**
   * Approve a pending claim.
   * Verifies policy is still active and has remaining balance.
   * Does NOT increment policy balance.
   */
  async approveClaim(claimId: string): Promise<ClaimResponseDTO> {
    const claim = await this.claimRepo.findById(claimId);
    if (!claim) {
      throw AppError.notFound(`Claim with ID '${claimId}' not found`);
    }

    if (claim.status === ClaimStatus.APPROVED) {
      throw AppError.badRequest(`Claim '${claim.claimNumber}' is already approved`);
    }

    if (claim.status === ClaimStatus.PAID) {
      throw AppError.badRequest(`Claim '${claim.claimNumber}' has already been paid`);
    }

    if (claim.status === ClaimStatus.REJECTED) {
      throw AppError.badRequest(`Cannot approve rejected claim '${claim.claimNumber}'`);
    }

    const policy = await this.policyRepo.findById(claim.policyId);
    if (!policy || policy.status !== PolicyStatus.ACTIVE) {
      throw AppError.badRequest(`Associated policy is not active for claim approval`);
    }

    const updated = await this.claimRepo.updateClaimStatus(claimId, {
      status: ClaimStatus.APPROVED,
    });

    return this.formatClaim(updated);
  }

  /**
   * Execute simulated parametric claim settlement inside a PostgreSQL interactive transaction.
   * Only a successful settlement increments the policy's cumulativePaidAmount.
   */
  async settleClaim(
    claimId: string,
    options?: { simulatedTransactionId?: string }
  ): Promise<ClaimResponseDTO> {
    return this.db.$transaction(async (tx) => {
      // Acquire row-level lock on claim row in PostgreSQL to prevent double-settlement races
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claimId);
      if (typeof (tx as any).$queryRaw === 'function') {
        if (isUuid) {
          await (tx as any).$queryRaw`SELECT "id" FROM "claims" WHERE "id" = ${claimId}::uuid FOR UPDATE`;
        } else {
          await (tx as any).$queryRaw`SELECT "id" FROM "claims" WHERE "id" = ${claimId} FOR UPDATE`;
        }
      }

      // 1. Fresh read claim inside transaction
      const claim = await tx.claim.findUnique({
        where: { id: claimId },
      });

      if (!claim) {
        throw AppError.notFound(`Claim with ID '${claimId}' not found`);
      }

      if (claim.status === ClaimStatus.PAID) {
        throw AppError.badRequest(`Claim '${claim.claimNumber}' has already been settled and paid`);
      }

      if (claim.status === ClaimStatus.REJECTED) {
        throw AppError.badRequest(`Cannot settle rejected claim '${claim.claimNumber}'`);
      }

      if (claim.status !== ClaimStatus.APPROVED) {
        throw AppError.badRequest(`Cannot settle claim '${claim.claimNumber}' before approval`);
      }

      // 2. Generate simulated payout reference (clearly marked simulated)
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const entropy = crypto.randomBytes(2).toString('hex').toUpperCase();
      let payoutReference = `SIM-PAYOUT-${dateStr}-${entropy}`;
      if (options?.simulatedTransactionId) {
        if (!options.simulatedTransactionId.startsWith('SIM-')) {
          throw AppError.badRequest("Simulated payout reference must start with 'SIM-'");
        }
        payoutReference = options.simulatedTransactionId;
      }

      // 3. Atomically increment policy balance within transaction
      // Will throw 400 Bad Request if payoutIncrement exceeds remaining sum insured
      await this.policyRepo.updatePolicyBalanceAndStatus(
        claim.policyId,
        {
          payoutIncrement: claim.payoutAmount,
        },
        tx
      );

      // 4. Mark claim PAID with simulated reference
      const settled = await tx.claim.update({
        where: { id: claimId },
        data: {
          status: ClaimStatus.PAID,
          payoutReference,
          paidAt: new Date(),
        },
      });

      return this.formatClaim(settled);
    });
  }

  /**
   * Reject a claim with an explicit rejection reason.
   */
  async rejectClaim(claimId: string, reason: string): Promise<ClaimResponseDTO> {
    const claim = await this.claimRepo.findById(claimId);
    if (!claim) {
      throw AppError.notFound(`Claim with ID '${claimId}' not found`);
    }

    if (claim.status === ClaimStatus.PAID) {
      throw AppError.badRequest(`Cannot reject an already settled claim '${claim.claimNumber}'`);
    }

    const updated = await this.claimRepo.updateClaimStatus(claimId, {
      status: ClaimStatus.REJECTED,
      rejectionReason: reason,
    });

    return this.formatClaim(updated);
  }

  /**
   * Retrieve claim by UUID.
   */
  async getClaimById(claimId: string): Promise<ClaimResponseDTO> {
    const claim = await this.claimRepo.findById(claimId);
    if (!claim) {
      throw AppError.notFound(`Claim with ID '${claimId}' not found`);
    }
    return this.formatClaim(claim);
  }

  /**
   * Retrieve all claims for a given policy.
   */
  async getClaimsForPolicy(policyId: string): Promise<ClaimResponseDTO[]> {
    const policy = await this.policyRepo.findById(policyId);
    if (!policy) {
      throw AppError.notFound(`Policy with ID '${policyId}' not found`);
    }

    const claims = await this.claimRepo.findByPolicyId(policyId);
    return claims.map((c: Claim) => this.formatClaim(c));
  }

  /**
   * Retrieve all claims for a given farm parcel.
   */
  async getClaimsForFarm(farmId: string): Promise<ClaimResponseDTO[]> {
    const claims = await this.claimRepo.findByFarmId(farmId);
    return claims.map((c: Claim) => this.formatClaim(c));
  }

  /**
   * Format Prisma Claim entity into clean presentation DTO.
   */
  public formatClaim(claim: Claim): ClaimResponseDTO {
    const payoutDec = new Prisma.Decimal(claim.payoutAmount);

    return {
      id: claim.id,
      claimNumber: claim.claimNumber,
      policyId: claim.policyId,
      assessmentId: claim.assessmentId,
      riskEventId: claim.riskEventId,
      triggerRuleCode: claim.triggerRuleCode,
      severity: claim.severity,
      observedValue:
        claim.observedValue !== null
          ? new Prisma.Decimal(claim.observedValue.toString()).toFixed(2)
          : null,
      thresholdValue: new Prisma.Decimal(claim.thresholdValue.toString()).toFixed(2),
      payoutAmount: payoutDec.toFixed(2),
      status: claim.status,
      rejectionReason: claim.rejectionReason,
      payoutReference: claim.payoutReference,
      paidAt: claim.paidAt instanceof Date ? claim.paidAt.toISOString() : claim.paidAt ? String(claim.paidAt) : null,
      createdAt: claim.createdAt instanceof Date ? claim.createdAt.toISOString() : String(claim.createdAt),
      updatedAt: claim.updatedAt instanceof Date ? claim.updatedAt.toISOString() : String(claim.updatedAt),
    };
  }
}

export const claimService = new ClaimService();
