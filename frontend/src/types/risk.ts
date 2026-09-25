/**
 * Module 6: Climate Risk Frontend Types
 * Matches the verified Stage 5A backend DTO contract.
 *
 * The backend is the single source of truth for risk evaluations.
 * The frontend must never calculate thresholds, rainfall aggregation,
 * severity, or overall risk.
 */

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export type RiskSeverity = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';

export type RiskSourceType = 'OFFICIAL_REFERENCE' | 'PROJECT_INDICATOR';

export type RiskHazardType =
  | 'HEAVY_RAINFALL'
  | 'INTENSE_RAINFALL'
  | 'HIGH_TEMPERATURE'
  | 'STRONG_WIND';

export type RiskMeasurement =
  | 'RAINFALL'
  | 'TEMPERATURE'
  | 'WIND_SPEED'
  | 'WIND_GUST';

export type RuleEvaluationStatus =
  | 'TRIGGERED'
  | 'NOT_TRIGGERED'
  | 'INSUFFICIENT_DATA';

export interface RiskEvent {
  id: string;
  assessmentId: string;
  riskRuleId: string;

  ruleCode: string;
  ruleName: string;
  hazardType: RiskHazardType;
  measurement: RiskMeasurement;

  thresholdValue: number;
  unit: string;

  // Stage 5B-3 DTO contract field aliases
  threshold?: number;
  thresholdUnit?: string;

  observationWindow: string;

  observedValue: number | null;

  severity: RiskSeverity;
  status: RuleEvaluationStatus;
  triggered: boolean;

  explanation: string;

  sourceType: RiskSourceType;
  sourceReference: string;

  observedAt: string;
  createdAt: string;
}

export interface RiskAssessment {
  id: string;
  farmId: string;
  assessedAt: string;
  overallRisk: RiskLevel;
  assessmentVersion: string;

  ruleCount: number;
  triggeredRuleCount: number;
  weatherRecordCount: number;

  hasInsufficientDataCoverage: boolean;
  summary: string;

  events: RiskEvent[];

  createdAt: string;
}

export type RiskAssessmentResponseDTO = RiskAssessment;
export type RiskEventResponseDTO = RiskEvent;
