/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Policy Domain Types & Repository Interfaces
 */

import { Policy, PolicyStatus, RiskHazardType, Prisma } from '@prisma/client';

export { PolicyStatus, RiskHazardType };

export interface CreatePolicyDTO {
  farmId: string;
  farmerId: string;
  cropName: string;
  sumInsured: number | string | Prisma.Decimal;
  premiumAmount: number | string | Prisma.Decimal;
  coveredHazards: RiskHazardType[];
  startDate: string | Date;
  endDate: string | Date;
  policyNumber?: string;
  status?: PolicyStatus;
}

export interface CreatePolicyInput {
  policyNumber: string;
  farmId: string;
  farmerId: string;
  cropName: string;
  sumInsured: Prisma.Decimal;
  premiumAmount: Prisma.Decimal;
  coveredHazards: RiskHazardType[];
  startDate: Date;
  endDate: Date;
  cumulativePaidAmount?: Prisma.Decimal;
  status?: PolicyStatus;
}

export interface UpdatePolicyBalanceInput {
  payoutIncrement: Prisma.Decimal | number | string;
  newStatus?: PolicyStatus;
}

export interface PolicyResponseDTO {
  id: string;
  policyNumber: string;
  farmId: string;
  farmerId: string;
  cropName: string;
  sumInsured: string;
  premiumAmount: string;
  coveredHazards: RiskHazardType[];
  startDate: string;
  endDate: string;
  cumulativePaidAmount: string;
  remainingCoverage: string;
  status: PolicyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IPolicyRepository {
  createPolicy(data: CreatePolicyInput, tx?: Prisma.TransactionClient): Promise<Policy>;
  findById(id: string, tx?: Prisma.TransactionClient): Promise<Policy | null>;
  findByFarmId(farmId: string, tx?: Prisma.TransactionClient): Promise<Policy[]>;
  findActivePolicyForFarm(
    farmId: string,
    referenceDate?: Date,
    tx?: Prisma.TransactionClient
  ): Promise<Policy | null>;
  updatePolicyBalanceAndStatus(
    id: string,
    update: UpdatePolicyBalanceInput,
    tx?: Prisma.TransactionClient
  ): Promise<Policy>;
  updatePolicyStatus(
    id: string,
    status: PolicyStatus,
    tx?: Prisma.TransactionClient
  ): Promise<Policy>;
}
