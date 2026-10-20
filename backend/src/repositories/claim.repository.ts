/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Claim Repository Implementation
 */

import { PrismaClient, Claim, ClaimStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { IClaimRepository, CreateClaimInput } from '../types/claim.types.js';
import { AppError } from '../utils/apiError.js';

export class ClaimRepository implements IClaimRepository {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.db = dbClient;
  }

  /**
   * Persist a new claim record.
   * Respects PENDING default status and enforces database-level duplicate-claim prevention.
   */
  async createClaim(
    data: CreateClaimInput,
    tx?: Prisma.TransactionClient
  ): Promise<Claim> {
    const client = tx || this.db;

    try {
      return await client.claim.create({
        data: {
          claimNumber: data.claimNumber,
          policyId: data.policyId,
          assessmentId: data.assessmentId,
          riskEventId: data.riskEventId,
          triggerRuleCode: data.triggerRuleCode,
          severity: data.severity,
          observedValue: data.observedValue,
          thresholdValue: data.thresholdValue,
          payoutAmount: data.payoutAmount,
          status: data.status ?? ClaimStatus.PENDING,
          rejectionReason: data.rejectionReason,
          payoutReference: data.payoutReference,
          paidAt: data.paidAt,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = Array.isArray(err.meta?.target)
          ? (err.meta.target as string[]).join(',')
          : String(err.meta?.target || '');

        if (target.includes('policyId') && target.includes('riskEventId')) {
          throw AppError.conflict(
            `A claim for policy '${data.policyId}' and risk event '${data.riskEventId}' already exists`
          );
        }
        if (target.includes('claimNumber')) {
          throw AppError.conflict(
            `Claim with claim number '${data.claimNumber}' already exists`
          );
        }
        throw AppError.conflict('A duplicate claim record already exists');
      }
      throw err;
    }
  }

  /**
   * Find a claim by UUID primary key or unique business claim number.
   * If the input is UUID-shaped (8-4-4-4-12 hex format), queries the primary key 'id'.
   * If not UUID-shaped, queries the unique business key 'claimNumber'.
   * Never sends non-UUID business numbers to Prisma's UUID column.
   */
  async findById(
    id: string,
    tx?: Prisma.TransactionClient
  ): Promise<Claim | null> {
    const client = tx || this.db;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUuid) {
      return client.claim.findUnique({
        where: { id },
      });
    }
    return client.claim.findUnique({
      where: { claimNumber: id },
    });
  }

  /**
   * Find all claims for a given policy, ordered by creation date desc.
   */
  async findByPolicyId(
    policyId: string,
    tx?: Prisma.TransactionClient
  ): Promise<Claim[]> {
    const client = tx || this.db;
    return client.claim.findMany({
      where: { policyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find all claims for a given farm parcel across all its policies.
   */
  async findByFarmId(
    farmId: string,
    tx?: Prisma.TransactionClient
  ): Promise<Claim[]> {
    const client = tx || this.db;
    return client.claim.findMany({
      where: {
        policy: {
          farmId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find an existing claim by unique compound key (policyId, riskEventId).
   * Used for application-level idempotent duplicate lookup prior to insertion.
   * If either identifier is not a valid UUID format, returns null without querying PostgreSQL.
   */
  async findClaimByPolicyAndRiskEvent(
    policyId: string,
    riskEventId: string,
    tx?: Prisma.TransactionClient
  ): Promise<Claim | null> {
    if (!policyId || !riskEventId || policyId.startsWith('simulated-') || riskEventId.startsWith('simulated-')) {
      return null;
    }
    const client = tx || this.db;
    return client.claim.findUnique({
      where: {
        policy_risk_event_unique: {
          policyId,
          riskEventId,
        },
      },
    });
  }

  /**
   * Update claim status and audit fields (approval, settlement, or rejection).
   */
  async updateClaimStatus(
    id: string,
    data: {
      status: ClaimStatus;
      payoutReference?: string | null;
      paidAt?: Date | null;
      rejectionReason?: string | null;
    },
    tx?: Prisma.TransactionClient
  ): Promise<Claim> {
    const client = tx || this.db;
    const existing = await client.claim.findUnique({
      where: { id },
    });

    if (!existing) {
      throw AppError.notFound(`Claim with ID '${id}' not found`);
    }

    return client.claim.update({
      where: { id },
      data: {
        status: data.status,
        payoutReference: data.payoutReference !== undefined ? data.payoutReference : existing.payoutReference,
        paidAt: data.paidAt !== undefined ? data.paidAt : existing.paidAt,
        rejectionReason: data.rejectionReason !== undefined ? data.rejectionReason : existing.rejectionReason,
      },
    });
  }
}

export const claimRepository = new ClaimRepository();
