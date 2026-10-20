/**
 * Module 10: System Integration & Security
 * Stage 10.3.1: Single-Host Automated Risk Evaluation Service
 *
 * Core service orchestrating automated risk evaluation and parametric claim processing.
 * Reuses existing Module 6 RiskAssessmentService and Module 9 ClaimService domain logic.
 *
 * Invariants:
 * - Runtime defaults: worker disabled (false), dry-run enabled (true).
 * - When disabled: returns immediately without executing business queries.
 * - Dry-run mode: 100% zero database mutations (no assessments, events, claims, or balance updates).
 * - Live mode: creates eligible claims strictly in PENDING status.
 * - Temporal policy binding: policies selected strictly at riskEvent.observedAt, never machine clock.
 * - Module 8 ML isolation: zero ML dependencies; ML outputs never influence underwriting or claims.
 * - Independent farm processing: individual farm failures never terminate batch execution.
 * - Soft deadline enforcement: stops initiating new farms when execution deadline expires.
 */

import { FarmStatus, Prisma, RiskSeverity } from '@prisma/client';
import { env } from '../config/env.config.js';
import { farmRepository } from '../repositories/farm.repository.js';
import { weatherRepository } from '../repositories/weather.repository.js';
import { policyRepository } from '../repositories/policy.repository.js';
import { claimRepository } from '../repositories/claim.repository.js';
import { riskRepository } from '../repositories/risk.repository.js';
import {
  RiskAssessmentService,
  riskAssessmentService as defaultRiskAssessmentService,
} from './riskAssessment.service.js';
import {
  ClaimService,
  claimService as defaultClaimService,
} from './claim.service.js';
import { IFarmRepository } from '../types/farm.types.js';
import { IWeatherRepository } from '../types/weather.types.js';
import { IPolicyRepository } from '../types/policy.types.js';
import { IClaimRepository } from '../types/claim.types.js';
import {
  IRiskRepository,
  RiskAssessmentResponseDTO,
  RiskAssessmentWithEvents,
} from '../types/risk.types.js';
import { AppError } from '../utils/apiError.js';

const isUuid = (val?: string | null): boolean =>
  typeof val === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

const isSyntheticId = (id?: string | null): boolean => {
  if (!id) return true;
  if (id.startsWith('simulated-')) return true;
  return !isUuid(id);
};

export type EvaluationBatchStatus =
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'DISABLED'
  | 'DEADLINE_EXCEEDED'
  | 'FATAL_ERROR';

export interface EventEvaluationDetail {
  eventId?: string;
  syntheticEventId?: string;
  isSynthetic?: boolean;
  hazardType?: string;
  severity?: RiskSeverity;
  policyId?: string;
  policyNumber?: string;
  outcome: 'CLAIM_CREATED' | 'PROJECTED' | 'SKIPPED';
  reason?: string;
  payoutAmount?: string;
  claimNumber?: string;
  duplicateStatus?:
    | 'CONFIRMED_PERSISTED_CLAIM'
    | 'POTENTIAL_DUPLICATE_UNVERIFIED'
    | 'NEW_CLAIM';
}

export interface FarmEvaluationOutcome {
  farmId: string;
  status: 'EVALUATED' | 'SKIPPED' | 'FAILED';
  reason?: string;
  assessmentId?: string;
  syntheticAssessmentId?: string;
  isSyntheticAssessment?: boolean;
  claimsCreated: number;
  claimsProjected: number;
  details: EventEvaluationDetail[];
  error?: string;
}

export interface AutomatedRiskEvaluationSummary {
  status: EvaluationBatchStatus;
  exitCode: 0 | 1 | 2;
  dryRun: boolean;
  batchSize: number;
  attempted: number;
  processed: number;
  skipped: number;
  failed: number;
  claimsCreated: number;
  claimsProjected: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  farmOutcomes: FarmEvaluationOutcome[];
  error?: string;
}

export interface AutomatedEvaluationOptions {
  dryRun?: boolean;
  referenceTime?: Date;
  force?: boolean;
}

export interface AutomatedBatchEvaluationOptions extends AutomatedEvaluationOptions {
  batchSize?: number;
  timeoutMs?: number;
  farmIds?: string[];
}

export class AutomatedRiskEvaluationService {
  constructor(
    private riskService: RiskAssessmentService = defaultRiskAssessmentService,
    private claimService: ClaimService = defaultClaimService,
    private farmRepo: IFarmRepository = farmRepository,
    private weatherRepo: IWeatherRepository = weatherRepository,
    private policyRepo: IPolicyRepository = policyRepository,
    private claimRepo: IClaimRepository = claimRepository,
    public readonly riskRepo: IRiskRepository = riskRepository
  ) {}

  /**
   * Determine whether the automated risk evaluation feature is enabled.
   */
  public isEnabled(): boolean {
    return env.AUTOMATED_RISK_EVALUATION_ENABLED;
  }

  /**
   * Determine whether dry-run mode is active by default.
   */
  public isDryRun(): boolean {
    return env.AUTOMATED_RISK_EVALUATION_DRY_RUN;
  }

  /**
   * Evaluate a single farm for weather risk and prospective parametric claims.
   * Reuses authoritative Module 6 assessment and Module 9 claim eligibility logic.
   */
  /**
   * Format raw assessment with events into clean presentation DTO.
   * Leverages RiskAssessmentService.formatAssessment when available,
   * or applies identical deterministic mapping in test/mock environments.
   */
  private formatAssessmentResponse(
    assessment: RiskAssessmentWithEvents
  ): RiskAssessmentResponseDTO {
    if (typeof this.riskService.formatAssessment === 'function') {
      return this.riskService.formatAssessment(assessment);
    }
    return {
      id: assessment.id,
      farmId: assessment.farmId,
      assessedAt:
        assessment.assessedAt instanceof Date
          ? assessment.assessedAt.toISOString()
          : String(assessment.assessedAt),
      overallRisk: assessment.overallRisk,
      assessmentVersion: assessment.assessmentVersion,
      ruleCount: assessment.ruleCount,
      triggeredRuleCount: assessment.triggeredRuleCount,
      weatherRecordCount: assessment.weatherRecordCount,
      hasInsufficientDataCoverage: false,
      summary: `Risk assessment identified ${assessment.triggeredRuleCount} triggered hazard rule(s)`,
      events: (assessment.riskEvents || []).map((evt) => ({
        id: evt.id,
        assessmentId: evt.assessmentId,
        riskRuleId: evt.riskRuleId,
        ruleCode: evt.riskRule?.code,
        ruleName: evt.riskRule?.name,
        hazardType: evt.riskRule?.hazardType,
        measurement: evt.riskRule?.measurement,
        observedValue: evt.observedValue !== null ? Number(evt.observedValue) : null,
        thresholdValue: Number(evt.thresholdValue),
        unit: evt.unit,
        severity: evt.severity,
        triggered: evt.triggered,
        status: evt.triggered ? 'TRIGGERED' : 'NOT_TRIGGERED',
        explanation: evt.explanation,
        sourceType: evt.riskRule?.sourceType ?? ('OFFICIAL_REFERENCE' as any),
        sourceReference: evt.riskRule?.sourceReference ?? '',
        observationWindow: evt.riskRule?.observationWindow ?? '',
        observedAt:
          evt.observedAt instanceof Date ? evt.observedAt.toISOString() : String(evt.observedAt),
        createdAt:
          evt.createdAt instanceof Date ? evt.createdAt.toISOString() : String(evt.createdAt),
      })),
      createdAt:
        assessment.createdAt instanceof Date
          ? assessment.createdAt.toISOString()
          : String(assessment.createdAt),
    };
  }

  /**
   * Evaluate a single farm for weather risk and prospective parametric claims.
   * Reuses authoritative Module 6 assessment and Module 9 claim eligibility logic.
   *
   * Corrective Invariants (Stage 10.3.1.2):
   * - SEC-10.3.1-01: Reuses existing persisted assessment for (farmId, targetTime) to maintain
   *   stable entity identity across repeated runs, preventing duplicate claim creation.
   * - SEC-10.3.1-02: Never passes synthetic non-UUID IDs to PostgreSQL UUID columns; distinguishes
   *   confirmed persisted claims from unverified projected duplicates and new claims.
   */
  public async evaluateFarm(
    farmId: string,
    options?: AutomatedEvaluationOptions
  ): Promise<FarmEvaluationOutcome> {
    const dryRun = options?.dryRun ?? this.isDryRun();
    const details: EventEvaluationDetail[] = [];

    // 1. Obtain target farm weather observation timestamp
    const latestWeather = await this.weatherRepo.findLatestByFarmId(farmId);
    if (!latestWeather) {
      return {
        farmId,
        status: 'SKIPPED',
        reason: 'NO_WEATHER_DATA',
        claimsCreated: 0,
        claimsProjected: 0,
        details: [],
      };
    }

    const targetTime = options?.referenceTime || latestWeather.observedAt;
    const targetTimeMs = new Date(targetTime).getTime();

    // 2. Fetch existing assessments for farm to enable persistent identity reuse
    const existingAssessments = await this.riskRepo.findAssessmentsByFarmId(farmId);
    const reusableAssessment = existingAssessments.find(
      (a) => new Date(a.assessedAt).getTime() === targetTimeMs
    );

    let assessment: RiskAssessmentResponseDTO;
    if (!dryRun && reusableAssessment) {
      // Re-use existing persisted assessment to preserve stable assessment and event identities
      assessment = this.formatAssessmentResponse(reusableAssessment);
    } else {
      // In dry-run mode: persist: false completely bypasses createAssessmentWithEvents()
      assessment = await this.riskService.assessFarmRisk(farmId, targetTime, {
        persist: !dryRun,
      });
    }

    const isSyntheticAssessment = isSyntheticId(assessment.id);
    const reportedAssessmentId = isSyntheticAssessment ? undefined : assessment.id;
    const syntheticAssessmentId = isSyntheticAssessment ? assessment.id : undefined;

    // 3. Resolve risk events from the resulting assessment
    const triggeredEvents = (assessment.events || []).filter((e) => e.triggered === true);

    if (triggeredEvents.length === 0) {
      return {
        farmId,
        status: 'EVALUATED',
        reason: 'NO_TRIGGERED_EVENTS',
        assessmentId: reportedAssessmentId,
        syntheticAssessmentId,
        isSyntheticAssessment,
        claimsCreated: 0,
        claimsProjected: 0,
        details: [],
      };
    }

    let claimsCreated = 0;
    let claimsProjected = 0;

    // 4. Process each triggered hazard event
    for (const event of triggeredEvents) {
      const eventObservedAt = new Date(event.observedAt);
      const isSynthetic = isSyntheticId(event.id);

      // Select policy covering the event's observation timestamp (not worker execution clock)
      const policy = await this.policyRepo.findActivePolicyForFarm(farmId, eventObservedAt);

      if (!policy) {
        details.push({
          eventId: isSynthetic ? undefined : event.id,
          syntheticEventId: isSynthetic ? event.id : undefined,
          isSynthetic,
          hazardType: event.hazardType,
          severity: event.severity,
          outcome: 'SKIPPED',
          reason: 'NO_ACTIVE_POLICY_FOR_EVENT_DATE',
        });
        continue;
      }

      // Query policy claims to inspect duplicate status safely
      const policyClaims = await this.claimRepo.findByPolicyId(policy.id);

      // Check for pre-existing claims on (policyId, riskEventId)
      // SEC-10.3.1-02: Never pass synthetic non-UUID to findClaimByPolicyAndRiskEvent
      let existingClaim = null;
      if (!isSynthetic) {
        existingClaim = await this.claimRepo.findClaimByPolicyAndRiskEvent(
          policy.id,
          event.id
        );
      }

      if (!existingClaim) {
        existingClaim = policyClaims.find((c) => c.riskEventId === event.id) || null;
      }

      // SEC-10.3.1-01 Defense-in-depth:
      // Even if event.id is a freshly generated UUID from a repeated/concurrent assessment,
      // check if a claim on this policy already exists for the same trigger rule & observation timestamp
      if (!existingClaim && !dryRun) {
        const ruleCode = event.ruleCode || event.riskRuleId;
        const duplicateClaim = policyClaims.find((c) => {
          if (c.triggerRuleCode !== ruleCode) return false;
          if (c.assessmentId === assessment.id) return true;
          const priorAssessment = existingAssessments.find((a) => a.id === c.assessmentId);
          if (
            priorAssessment &&
            new Date(priorAssessment.assessedAt).getTime() === eventObservedAt.getTime()
          ) {
            return true;
          }
          return false;
        });

        if (duplicateClaim) {
          existingClaim = duplicateClaim;
        }
      }

      if (existingClaim) {
        details.push({
          eventId: isSynthetic ? undefined : event.id,
          syntheticEventId: isSynthetic ? event.id : undefined,
          isSynthetic,
          hazardType: event.hazardType,
          severity: event.severity,
          policyId: policy.id,
          policyNumber: policy.policyNumber,
          outcome: 'SKIPPED',
          reason: 'DUPLICATE_CLAIM',
          claimNumber: existingClaim.claimNumber,
          duplicateStatus: 'CONFIRMED_PERSISTED_CLAIM',
        });
        continue;
      }

      if (dryRun) {
        // DRY-RUN PATH: Pure in-memory domain validation & calculation (zero writes)
        const eligibility = ClaimService.validateClaimEligibilityAndPayout(
          {
            policy,
            assessment: {
              id: assessment.id,
              farmId: assessment.farmId,
            },
            riskEvent: {
              id: event.id,
              assessmentId: assessment.id,
              triggered: event.triggered,
              severity: event.severity,
              observedAt: eventObservedAt,
              observedValue:
                event.observedValue !== null
                  ? new Prisma.Decimal(event.observedValue.toString())
                  : null,
              thresholdValue: new Prisma.Decimal(event.thresholdValue.toString()),
              riskRule: {
                code: event.ruleCode || 'PARAMETRIC_WEATHER_RULE',
                hazardType: event.hazardType,
              },
            },
          },
          false // throwOnError: false -> returns rejectionReason instead of throwing
        );

        if (!eligibility.eligible) {
          details.push({
            eventId: isSynthetic ? undefined : event.id,
            syntheticEventId: isSynthetic ? event.id : undefined,
            isSynthetic,
            hazardType: event.hazardType,
            severity: event.severity,
            policyId: policy.id,
            policyNumber: policy.policyNumber,
            outcome: 'SKIPPED',
            reason: eligibility.rejectionReason,
          });
        } else {
          const ruleCode = event.ruleCode || event.riskRuleId;
          const isPotentialDuplicate =
            isSynthetic && policyClaims.some((c) => c.triggerRuleCode === ruleCode);

          claimsProjected++;
          details.push({
            eventId: isSynthetic ? undefined : event.id,
            syntheticEventId: isSynthetic ? event.id : undefined,
            isSynthetic,
            hazardType: event.hazardType,
            severity: event.severity,
            policyId: policy.id,
            policyNumber: policy.policyNumber,
            outcome: 'PROJECTED',
            payoutAmount: eligibility.payoutAmount.toFixed(2),
            reason: isPotentialDuplicate
              ? 'PROJECTED_POTENTIAL_DUPLICATE_UNVERIFIED'
              : 'SIMULATED_POINT_IN_TIME_PROJECTION',
            duplicateStatus: isPotentialDuplicate
              ? 'POTENTIAL_DUPLICATE_UNVERIFIED'
              : 'NEW_CLAIM',
          });
        }
      } else {
        // LIVE PATH: Create claim in PENDING status using authoritative ClaimService
        try {
          const claim = await this.claimService.evaluateClaim({
            policyId: policy.id,
            assessmentId: assessment.id,
            riskEventId: event.id,
          });

          claimsCreated++;
          details.push({
            eventId: event.id,
            isSynthetic: false,
            hazardType: event.hazardType,
            severity: event.severity,
            policyId: policy.id,
            policyNumber: policy.policyNumber,
            outcome: 'CLAIM_CREATED',
            claimNumber: claim.claimNumber,
            payoutAmount: claim.payoutAmount,
            duplicateStatus: 'NEW_CLAIM',
          });
        } catch (err: any) {
          const isConflict =
            err instanceof AppError && err.statusCode === 409;
          details.push({
            eventId: event.id,
            isSynthetic: false,
            hazardType: event.hazardType,
            severity: event.severity,
            policyId: policy.id,
            policyNumber: policy.policyNumber,
            outcome: 'SKIPPED',
            reason: isConflict ? 'DUPLICATE_CLAIM' : err.message || 'CLAIM_EVALUATION_FAILED',
            duplicateStatus: isConflict ? 'CONFIRMED_PERSISTED_CLAIM' : undefined,
          });
        }
      }
    }

    return {
      farmId,
      status: 'EVALUATED',
      assessmentId: reportedAssessmentId,
      syntheticAssessmentId,
      isSyntheticAssessment,
      claimsCreated,
      claimsProjected,
      details,
    };
  }

  /**
   * Execute batch evaluation of active farms.
   * Respects batch size, soft execution deadline, and error isolation between farms.
   */
  public async executeBatch(
    options?: AutomatedBatchEvaluationOptions
  ): Promise<AutomatedRiskEvaluationSummary> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // 1. Disabled check
    const isExplicitlyForced = options?.force === true;
    if (!this.isEnabled() && !isExplicitlyForced) {
      return {
        status: 'DISABLED',
        exitCode: 0,
        dryRun: options?.dryRun ?? this.isDryRun(),
        batchSize: options?.batchSize ?? env.AUTOMATED_RISK_EVALUATION_BATCH_SIZE,
        attempted: 0,
        processed: 0,
        skipped: 0,
        failed: 0,
        claimsCreated: 0,
        claimsProjected: 0,
        durationMs: 0,
        startedAt,
        completedAt: new Date().toISOString(),
        farmOutcomes: [],
      };
    }

    const batchSize =
      options?.batchSize ?? env.AUTOMATED_RISK_EVALUATION_BATCH_SIZE;
    const dryRun = options?.dryRun ?? this.isDryRun();
    const timeoutMs =
      options?.timeoutMs ?? env.AUTOMATED_RISK_EVALUATION_TIMEOUT_MS;
    const deadline = startTime + timeoutMs;

    const farmOutcomes: FarmEvaluationOutcome[] = [];
    let attempted = 0;
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    let claimsCreated = 0;
    let claimsProjected = 0;
    let deadlineExceeded = false;

    try {
      // 2. Discover target farms
      let targetFarmIds: string[] = [];

      if (options?.farmIds && options.farmIds.length > 0) {
        targetFarmIds = options.farmIds.slice(0, batchSize);
      } else {
        const activeFarms = await this.farmRepo.findAll({
          skip: 0,
          take: batchSize,
          status: FarmStatus.ACTIVE,
        });
        targetFarmIds = activeFarms.map((f) => f.id);
      }

      // 3. Process each farm independently
      for (const farmId of targetFarmIds) {
        // Soft deadline check before initiating work on each farm
        if (Date.now() >= deadline) {
          deadlineExceeded = true;
          break;
        }

        attempted++;

        try {
          const outcome = await this.evaluateFarm(farmId, {
            dryRun,
            referenceTime: options?.referenceTime,
          });

          farmOutcomes.push(outcome);

          if (outcome.status === 'EVALUATED') {
            processed++;
            claimsCreated += outcome.claimsCreated;
            claimsProjected += outcome.claimsProjected;
          } else if (outcome.status === 'SKIPPED') {
            skipped++;
          } else {
            failed++;
          }
        } catch (farmErr: any) {
          // Farm-level failure isolation: does not terminate subsequent farms
          failed++;
          farmOutcomes.push({
            farmId,
            status: 'FAILED',
            claimsCreated: 0,
            claimsProjected: 0,
            details: [],
            error: farmErr.message || 'Unknown farm evaluation error',
          });
        }
      }

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;

      let status: EvaluationBatchStatus = 'SUCCESS';
      let exitCode: 0 | 1 | 2 = 0;

      if (deadlineExceeded) {
        status = 'DEADLINE_EXCEEDED';
        exitCode = 2;
      } else if (failed > 0) {
        status = 'PARTIAL_SUCCESS';
        exitCode = 2;
      } else {
        status = 'SUCCESS';
        exitCode = 0;
      }

      return {
        status,
        exitCode,
        dryRun,
        batchSize,
        attempted,
        processed,
        skipped,
        failed,
        claimsCreated,
        claimsProjected,
        durationMs,
        startedAt,
        completedAt,
        farmOutcomes,
      };
    } catch (infrastructureErr: any) {
      // Fatal infrastructure failure
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;

      return {
        status: 'FATAL_ERROR',
        exitCode: 1,
        dryRun,
        batchSize,
        attempted,
        processed,
        skipped,
        failed: failed + 1,
        claimsCreated,
        claimsProjected,
        durationMs,
        startedAt,
        completedAt,
        farmOutcomes,
        error: infrastructureErr.message || 'Fatal infrastructure failure during batch evaluation',
      };
    }
  }
}

export const automatedRiskEvaluationService = new AutomatedRiskEvaluationService();
