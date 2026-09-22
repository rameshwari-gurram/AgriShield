/**
 * Module 6: Climate Risk Database and Rule Types
 * Re-exports Prisma enums and provides DTO definitions for risk rules, assessments, and events.
 */

import {
  RiskSeverity,
  RiskLevel,
  RiskSourceType,
  RiskHazardType,
  RiskMeasurement,
  RiskRule,
  RiskAssessment,
  RiskEvent,
  Prisma,
} from '@prisma/client';

export {
  RiskSeverity,
  RiskLevel,
  RiskSourceType,
  RiskHazardType,
  RiskMeasurement,
  RiskRule,
  RiskAssessment,
  RiskEvent,
};

export interface CreateRiskRuleInput {
  code: string;
  name: string;
  description?: string;
  hazardType: RiskHazardType;
  measurement: RiskMeasurement;
  threshold: number | string;
  thresholdUnit: string;
  observationWindow: string;
  severity: RiskSeverity;
  sourceType?: RiskSourceType;
  sourceReference: string;
  isActive?: boolean;
}

export type RuleEvaluationStatus = 'TRIGGERED' | 'NOT_TRIGGERED' | 'INSUFFICIENT_DATA';

export interface RuleEvaluationResult {
  ruleId?: string;
  ruleCode: string;
  ruleName: string;
  hazardType: RiskHazardType;
  measurement: RiskMeasurement;
  threshold: number;
  thresholdUnit: string;
  observationWindow: string;
  observedValue: number | null;
  severity: RiskSeverity;
  sourceType: RiskSourceType;
  sourceReference: string;
  status: RuleEvaluationStatus;
  triggered: boolean;
  explanation: string;
}

export interface RiskRuleEvaluationInput {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  hazardType: RiskHazardType;
  measurement: RiskMeasurement;
  threshold: number | string | Prisma.Decimal;
  thresholdUnit: string;
  observationWindow: string;
  severity: RiskSeverity;
  sourceType: RiskSourceType;
  sourceReference: string;
  isActive?: boolean;
}
export const DEFAULT_ASSESSMENT_VERSION = '1.0.0';

export interface CreateRiskAssessmentInput {
  farmId: string;
  assessedAt: Date;
  overallRisk: RiskLevel;
  assessmentVersion?: string;
  ruleCount: number;
  triggeredRuleCount: number;
  weatherRecordCount: number;
}

export interface CreateRiskEventInput {
  riskRuleId: string;
  observedValue: number | Prisma.Decimal | null;
  thresholdValue: number | Prisma.Decimal;
  unit: string;
  severity: RiskSeverity;
  triggered: boolean;
  explanation: string;
  observedAt: Date;
}

export type RiskEventWithRule = RiskEvent & {
  riskRule?: RiskRule;
};

export type RiskAssessmentWithEvents = RiskAssessment & {
  riskEvents: RiskEventWithRule[];
};

export interface RiskEventResponseDTO {
  id: string;
  assessmentId: string;
  riskRuleId: string;
  ruleCode?: string;
  ruleName?: string;
  hazardType?: RiskHazardType;
  measurement?: RiskMeasurement;
  observedValue: number | null;
  thresholdValue: number;
  unit: string;
  severity: RiskSeverity;
  triggered: boolean;
  status: RuleEvaluationStatus;
  explanation: string;
  observedAt: string;
  createdAt: string;
}

export interface RiskAssessmentResponseDTO {
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
  events: RiskEventResponseDTO[];
  createdAt: string;
}

export interface IRiskRepository {
  findActiveRules(): Promise<RiskRule[]>;
  findRuleByCode(code: string): Promise<RiskRule | null>;
  createAssessmentWithEvents(
    assessmentData: CreateRiskAssessmentInput,
    eventsData: CreateRiskEventInput[]
  ): Promise<RiskAssessmentWithEvents>;
  findAssessmentById(id: string): Promise<RiskAssessmentWithEvents | null>;
  findAssessmentsByFarmId(farmId: string, limit?: number): Promise<RiskAssessmentWithEvents[]>;
  deleteAssessmentsByFarmId?(farmId: string): Promise<number>;
}
