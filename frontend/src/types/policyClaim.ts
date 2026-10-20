/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.5: Policy & Claim Frontend Domain Types
 *
 * Accurately mirrors the verified backend DTO contracts:
 * - PolicyResponseDTO -> Policy
 * - ClaimResponseDTO -> Claim
 * All monetary amounts are preserved as fixed-precision strings.
 */

import { RiskSeverity } from './risk';
import { Farm } from './farm';

export type PolicyStatus = 'PENDING' | 'ACTIVE' | 'EXHAUSTED' | 'CANCELLED';

export type ClaimStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';

export type PolicyHazardType =
  | 'HIGH_TEMPERATURE'
  | 'LOW_TEMPERATURE'
  | 'HEAVY_RAINFALL'
  | 'DEFICIT_RAINFALL'
  | 'HIGH_HUMIDITY'
  | 'LOW_HUMIDITY'
  | 'STRONG_WIND'
  | 'SOIL_MOISTURE_DEFICIT'
  | 'INTENSE_RAINFALL'
  | 'CONSECUTIVE_DRY_DAYS'
  | 'EXTREME_HEATWAVE';

export interface Policy {
  id: string;
  policyNumber: string;
  farmId: string;
  farmerId: string;
  cropName: string;
  sumInsured: string;
  premiumAmount: string;
  coveredHazards: PolicyHazardType[];
  startDate: string;
  endDate: string;
  cumulativePaidAmount: string;
  remainingCoverage: string;
  status: PolicyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Claim {
  id: string;
  claimNumber: string;
  policyId: string;
  assessmentId: string;
  riskEventId: string;
  triggerRuleCode: string;
  severity: RiskSeverity;
  observedValue: string | null;
  thresholdValue: string;
  payoutAmount: string;
  status: ClaimStatus;
  rejectionReason: string | null;
  payoutReference: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetFarmPolicyOptions {
  token?: string;
}

export interface GetActiveFarmPolicyOptions extends GetFarmPolicyOptions {
  referenceDate?: string;
}

export interface GetFarmClaimOptions {
  token?: string;
}

export interface PolicyWithFarm extends Policy {
  farm?: Farm;
}

export interface ClaimWithFarm extends Claim {
  farm?: Farm;
  policy?: Policy;
}

export interface EvaluateClaimInput {
  policyId: string;
  assessmentId: string;
  riskEventId: string;
  payoutConfig?: {
    severityMultipliers: Partial<Record<RiskSeverity, number>>;
  };
}

export const DEFAULT_SEVERITY_MULTIPLIERS: Record<RiskSeverity, number> = {
  LOW: 0.25,
  MODERATE: 0.4,
  HIGH: 0.5,
  VERY_HIGH: 1.0,
};
