/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Claim Domain Types & Repository Interfaces
 */

import { Claim, ClaimStatus, RiskSeverity, Prisma } from '@prisma/client';

export { ClaimStatus, RiskSeverity };

export interface CreateClaimDTO {
  policyId: string;
  assessmentId: string;
  riskEventId: string;
  triggerRuleCode: string;
  severity: RiskSeverity;
  observedValue?: number | string | Prisma.Decimal | null;
  thresholdValue: number | string | Prisma.Decimal;
  payoutAmount: number | string | Prisma.Decimal;
  claimNumber?: string;
  status?: ClaimStatus;
  rejectionReason?: string | null;
  payoutReference?: string | null;
  paidAt?: Date | string | null;
}

export interface CreateClaimInput {
  claimNumber: string;
  policyId: string;
  assessmentId: string;
  riskEventId: string;
  triggerRuleCode: string;
  severity: RiskSeverity;
  observedValue: Prisma.Decimal | null;
  thresholdValue: Prisma.Decimal;
  payoutAmount: Prisma.Decimal;
  status?: ClaimStatus;
  rejectionReason?: string | null;
  payoutReference?: string | null;
  paidAt?: Date | null;
}

export interface ClaimResponseDTO {
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

export interface IClaimRepository {
  createClaim(data: CreateClaimInput, tx?: Prisma.TransactionClient): Promise<Claim>;
  findById(id: string, tx?: Prisma.TransactionClient): Promise<Claim | null>;
  findByPolicyId(policyId: string, tx?: Prisma.TransactionClient): Promise<Claim[]>;
  findByFarmId(farmId: string, tx?: Prisma.TransactionClient): Promise<Claim[]>;
  findClaimByPolicyAndRiskEvent(
    policyId: string,
    riskEventId: string,
    tx?: Prisma.TransactionClient
  ): Promise<Claim | null>;
  updateClaimStatus(
    id: string,
    data: {
      status: ClaimStatus;
      payoutReference?: string | null;
      paidAt?: Date | null;
      rejectionReason?: string | null;
    },
    tx?: Prisma.TransactionClient
  ): Promise<Claim>;
}
