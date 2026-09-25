/**
 * Module 6: Risk Assessment Service
 * Orchestrates farm-level climate risk evaluation and atomic persistence.
 *
 * Architecture Flow:
 * Farm Validation
 *   ↓
 * Latest WeatherRecord.observedAt (Deterministic Reference Time)
 *   ↓
 * WeatherAggregationService
 *   ↓
 * Active RiskRules from PostgreSQL
 *   ↓
 * ClimateRiskRuleEngine (Pure Evaluation)
 *   ↓
 * Severity-to-Overall-Risk Mapping
 *   ↓
 * Prisma Transaction (RiskAssessment + RiskEvent[])
 */

import {
  RiskLevel,
  RiskSeverity,
  RiskSourceType,
  IRiskRepository,
  RiskAssessmentResponseDTO,
  RiskEventResponseDTO,
  RiskAssessmentWithEvents,
  CreateRiskEventInput,
  RuleEvaluationStatus,
  DEFAULT_ASSESSMENT_VERSION,
  RiskRuleEvaluationInput,
  PortfolioRiskSummaryDTO,
} from '../types/risk.types.js';
import { FarmStatus } from '@prisma/client';
import { IWeatherRepository } from '../types/weather.types.js';
import { IFarmRepository } from '../types/farm.types.js';
import { riskRepository } from '../repositories/risk.repository.js';
import { farmRepository } from '../repositories/farm.repository.js';
import { weatherRepository } from '../repositories/weather.repository.js';
import {
  WeatherAggregationService,
  weatherAggregationService,
} from './weatherAggregation.service.js';
import {
  ClimateRiskRuleEngine,
  climateRiskRuleEngine,
} from './climateRiskRuleEngine.service.js';
import { AppError } from '../utils/apiError.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RiskAssessmentService {
  private riskRepo: IRiskRepository;
  private farmRepo: IFarmRepository;
  private weatherRepo: IWeatherRepository;
  private aggregationService: WeatherAggregationService;
  private ruleEngine: ClimateRiskRuleEngine;

  constructor(
    riskRepo: IRiskRepository = riskRepository,
    farmRepo: IFarmRepository = farmRepository,
    weatherRepo: IWeatherRepository = weatherRepository,
    aggregationService: WeatherAggregationService = weatherAggregationService,
    ruleEngine: ClimateRiskRuleEngine = climateRiskRuleEngine
  ) {
    this.riskRepo = riskRepo;
    this.farmRepo = farmRepo;
    this.weatherRepo = weatherRepo;
    this.aggregationService = aggregationService;
    this.ruleEngine = ruleEngine;
  }

  /**
   * Execute and persist an end-to-end climate risk assessment for a farm.
   *
   * @param farmId - Farm UUID
   * @param referenceTime - Optional explicit reference time (defaults to farm's latest WeatherRecord.observedAt)
   */
  async assessFarmRisk(
    farmId: string,
    referenceTime?: Date | string
  ): Promise<RiskAssessmentResponseDTO> {
    // -------------------------------------------------------------------------
    // STEP 1 — Validate Farm Existence
    // -------------------------------------------------------------------------
    await this.ensureFarmExists(farmId);

    // -------------------------------------------------------------------------
    // STEP 2 — Determine Deterministic Reference Time
    // -------------------------------------------------------------------------
    let targetAssessmentTime: Date;

    if (referenceTime !== undefined) {
      const parsed = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);
      if (isNaN(parsed.getTime())) {
        throw AppError.badRequest(`Invalid reference time parameter: '${referenceTime}'`);
      }
      targetAssessmentTime = parsed;
    } else {
      // Query latest WeatherRecord for the farm
      const latestRecord = await this.weatherRepo.findLatestByFarmId(farmId);
      if (!latestRecord) {
        throw AppError.notFound(
          `No weather records found for farm '${farmId}'. Cannot perform risk assessment.`
        );
      }
      targetAssessmentTime = latestRecord.observedAt;
    }

    // -------------------------------------------------------------------------
    // STEP 3 — Aggregate Weather
    // -------------------------------------------------------------------------
    const weatherAggregation = await this.aggregationService.aggregateFarmWeather(
      farmId,
      targetAssessmentTime
    );

    // -------------------------------------------------------------------------
    // STEP 4 — Load Active Rules from Repository
    // -------------------------------------------------------------------------
    const activeRules = await this.riskRepo.findActiveRules();

    // -------------------------------------------------------------------------
    // STEP 5 — Evaluate Rules via ClimateRiskRuleEngine
    // -------------------------------------------------------------------------
    const ruleInputs: RiskRuleEvaluationInput[] = activeRules.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      hazardType: r.hazardType,
      measurement: r.measurement,
      threshold: r.threshold,
      thresholdUnit: r.thresholdUnit,
      observationWindow: r.observationWindow,
      severity: r.severity,
      sourceType: r.sourceType,
      sourceReference: r.sourceReference,
      isActive: r.isActive,
    }));

    const ruleEvaluationResults = this.ruleEngine.evaluate(weatherAggregation, ruleInputs);

    // -------------------------------------------------------------------------
    // STEP 6 — Calculate Overall RiskLevel
    // -------------------------------------------------------------------------
    const triggeredResults = ruleEvaluationResults.filter((r) => r.status === 'TRIGGERED');
    const triggeredSeverities = triggeredResults.map((r) => r.severity);
    const overallRisk = this.calculateOverallRisk(triggeredSeverities);

    // -------------------------------------------------------------------------
    // STEP 7 & 8 — Calculate Counts & Handle Insufficient Data
    // -------------------------------------------------------------------------
    const ruleCount = activeRules.length;
    const triggeredRuleCount = triggeredResults.length;
    const weatherRecordCount = weatherAggregation.recordCount;

    // -------------------------------------------------------------------------
    // STEP 9 — Prepare RiskEvent Inputs for All Evaluated Rules
    // -------------------------------------------------------------------------
    const ruleIdMap = new Map<string, string>();
    for (const r of activeRules) {
      ruleIdMap.set(r.code, r.id);
    }

    const eventInputs: CreateRiskEventInput[] = ruleEvaluationResults.map((result) => {
      const riskRuleId = result.ruleId || ruleIdMap.get(result.ruleCode);
      if (!riskRuleId) {
        throw AppError.internal(`Rule ID not resolved for evaluated rule '${result.ruleCode}'`);
      }

      return {
        riskRuleId,
        observedValue: result.status === 'INSUFFICIENT_DATA' ? null : result.observedValue,
        thresholdValue: result.threshold,
        unit: result.thresholdUnit,
        severity: result.severity,
        triggered: result.triggered,
        explanation: result.explanation,
        observedAt: targetAssessmentTime,
      };
    });

    // -------------------------------------------------------------------------
    // STEP 10 — Persist Atomically Inside a Single Prisma Transaction
    // -------------------------------------------------------------------------
    const assessment = await this.riskRepo.createAssessmentWithEvents(
      {
        farmId,
        assessedAt: targetAssessmentTime,
        overallRisk,
        assessmentVersion: DEFAULT_ASSESSMENT_VERSION,
        ruleCount,
        triggeredRuleCount,
        weatherRecordCount,
      },
      eventInputs
    );

    // -------------------------------------------------------------------------
    // STEP 11 — Return Formatted Response DTO
    // -------------------------------------------------------------------------
    return this.formatAssessment(assessment);
  }

  /**
   * Retrieve a single RiskAssessment by its UUID.
   */
  async getAssessmentById(assessmentId: string): Promise<RiskAssessmentResponseDTO> {
    if (!UUID_REGEX.test(assessmentId)) {
      throw AppError.badRequest(`Invalid assessment ID format: '${assessmentId}'`);
    }

    const assessment = await this.riskRepo.findAssessmentById(assessmentId);
    if (!assessment) {
      throw AppError.notFound(`Risk assessment with ID '${assessmentId}' not found`);
    }

    return this.formatAssessment(assessment);
  }

  /**
   * Retrieve assessment history for a farm parcel, ordered by assessedAt DESC.
   */
  async getAssessmentsForFarm(
    farmId: string,
    limit?: number
  ): Promise<RiskAssessmentResponseDTO[]> {
    if (!UUID_REGEX.test(farmId)) {
      throw AppError.badRequest(`Invalid farm ID format: '${farmId}'`);
    }

    await this.ensureFarmExists(farmId);

    const assessments = await this.riskRepo.findAssessmentsByFarmId(farmId, limit);
    return assessments.map((a) => this.formatAssessment(a));
  }

  /**
   * Retrieve the newest persisted RiskAssessment for a farm parcel.
   * Throws 404 if the farm has no risk assessments.
   */
  async getLatestAssessmentForFarm(farmId: string): Promise<RiskAssessmentResponseDTO> {
    if (!UUID_REGEX.test(farmId)) {
      throw AppError.badRequest(`Invalid farm ID format: '${farmId}'`);
    }

    await this.ensureFarmExists(farmId);

    const assessments = await this.riskRepo.findAssessmentsByFarmId(farmId, 1);
    if (!assessments || assessments.length === 0) {
      throw AppError.notFound(`No risk assessments found for farm '${farmId}'`);
    }

    return this.formatAssessment(assessments[0]);
  }

  /**
   * Retrieve macro-level risk summary across all active farm parcels (status = ACTIVE).
   *
   * Population:
   * Only farms with status = FarmStatus.ACTIVE.
   *
   * Metrics:
   * - totalFarms: Count of active farms
   * - assessedFarms: Count of active farms with at least one assessment
   * - unassessedFarms: totalFarms - assessedFarms
   * - highRiskCount: Active farms whose latest assessment has overallRisk = HIGH
   * - moderateRiskCount: Active farms whose latest assessment has overallRisk = MODERATE
   * - lowRiskCount: Active farms whose latest assessment has overallRisk = LOW and hasInsufficientDataCoverage = false
   * - lowRiskUnconfirmedCount: Active farms whose latest assessment has overallRisk = LOW and hasInsufficientDataCoverage = true
   */
  async getPortfolioRiskSummary(): Promise<PortfolioRiskSummaryDTO> {
    const totalFarms = await this.farmRepo.count({ status: FarmStatus.ACTIVE });
    const latestAssessments = await this.riskRepo.getLatestAssessmentsForActiveFarms();

    let highRiskCount = 0;
    let moderateRiskCount = 0;
    let lowRiskCount = 0;
    let lowRiskUnconfirmedCount = 0;

    for (const assessment of latestAssessments) {
      const formatted = this.formatAssessment(assessment);
      if (formatted.overallRisk === RiskLevel.HIGH) {
        highRiskCount++;
      } else if (formatted.overallRisk === RiskLevel.MODERATE) {
        moderateRiskCount++;
      } else if (formatted.overallRisk === RiskLevel.LOW) {
        if (formatted.hasInsufficientDataCoverage) {
          lowRiskUnconfirmedCount++;
        } else {
          lowRiskCount++;
        }
      }
    }

    const assessedFarms = highRiskCount + moderateRiskCount + lowRiskCount + lowRiskUnconfirmedCount;
    const unassessedFarms = Math.max(0, totalFarms - assessedFarms);

    return {
      totalFarms,
      assessedFarms,
      unassessedFarms,
      highRiskCount,
      moderateRiskCount,
      lowRiskCount,
      lowRiskUnconfirmedCount,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Transparent Severity-to-RiskLevel mapping.
   * Evaluates the highest severity among triggered rules:
   *   LOW       → LOW
   *   MODERATE  → MODERATE
   *   HIGH      → HIGH
   *   VERY_HIGH → HIGH
   *   No triggers → LOW
   */
  public calculateOverallRisk(triggeredSeverities: RiskSeverity[]): RiskLevel {
    if (triggeredSeverities.length === 0) {
      return RiskLevel.LOW;
    }

    const severityRank: Record<RiskSeverity, number> = {
      LOW: 1,
      MODERATE: 2,
      HIGH: 3,
      VERY_HIGH: 4,
    };

    let highestRank = 0;
    for (const sev of triggeredSeverities) {
      const rank = severityRank[sev] ?? 0;
      if (rank > highestRank) {
        highestRank = rank;
      }
    }

    switch (highestRank) {
      case 4: // VERY_HIGH
      case 3: // HIGH
        return RiskLevel.HIGH;
      case 2: // MODERATE
        return RiskLevel.MODERATE;
      case 1: // LOW
      default:
        return RiskLevel.LOW;
    }
  }

  /**
   * Format raw Prisma assessment with events into clean presentation DTO.
   */
  public formatAssessment(assessment: RiskAssessmentWithEvents): RiskAssessmentResponseDTO {
    const events: RiskEventResponseDTO[] = (assessment.riskEvents || []).map((evt) => {
      const isTriggered = evt.triggered;
      const isInsufficient =
        evt.observedValue === null ||
        evt.explanation.includes('INSUFFICIENT_DATA') ||
        evt.explanation.includes('could not be evaluated');

      let status: RuleEvaluationStatus;
      if (isTriggered) {
        status = 'TRIGGERED';
      } else if (isInsufficient) {
        status = 'INSUFFICIENT_DATA';
      } else {
        status = 'NOT_TRIGGERED';
      }

      return {
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
        status,
        explanation: evt.explanation,
        sourceType: evt.riskRule?.sourceType ?? RiskSourceType.OFFICIAL_REFERENCE,
        sourceReference: evt.riskRule?.sourceReference ?? '',
        observationWindow: evt.riskRule?.observationWindow ?? '',
        observedAt:
          evt.observedAt instanceof Date ? evt.observedAt.toISOString() : String(evt.observedAt),
        createdAt:
          evt.createdAt instanceof Date ? evt.createdAt.toISOString() : String(evt.createdAt),
      };
    });

    const hasInsufficientDataCoverage = events.some((e) => e.status === 'INSUFFICIENT_DATA');

    let summary: string;
    if (assessment.triggeredRuleCount > 0) {
      summary = `Risk assessment identified ${assessment.triggeredRuleCount} triggered hazard rule(s) resulting in overall ${assessment.overallRisk} risk.`;
    } else if (hasInsufficientDataCoverage) {
      summary =
        'No configured rainfall threshold was triggered among evaluable rules; some rules could not be evaluated because the required weather observation window was incomplete.';
    } else {
      summary =
        'No configured climate risk thresholds were triggered across complete observation window.';
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
      hasInsufficientDataCoverage,
      summary,
      events,
      createdAt:
        assessment.createdAt instanceof Date
          ? assessment.createdAt.toISOString()
          : String(assessment.createdAt),
    };
  }

  private async ensureFarmExists(farmId: string): Promise<void> {
    const farm = await this.farmRepo.findById(farmId);
    if (!farm) {
      throw AppError.notFound(`Farm with ID '${farmId}' not found`);
    }
  }
}

export const riskAssessmentService = new RiskAssessmentService();
