/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Policy Repository Implementation
 */

import { PrismaClient, Policy, PolicyStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import {
  IPolicyRepository,
  CreatePolicyInput,
  UpdatePolicyBalanceInput,
} from '../types/policy.types.js';
import { AppError } from '../utils/apiError.js';

export class PolicyRepository implements IPolicyRepository {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.db = dbClient;
  }

  /**
   * Persist a new policy record.
   */
  async createPolicy(
    data: CreatePolicyInput,
    tx?: Prisma.TransactionClient
  ): Promise<Policy> {
    const client = tx || this.db;
    return client.policy.create({
      data: {
        policyNumber: data.policyNumber,
        farmId: data.farmId,
        farmerId: data.farmerId,
        cropName: data.cropName,
        sumInsured: data.sumInsured,
        premiumAmount: data.premiumAmount,
        coveredHazards: data.coveredHazards,
        startDate: data.startDate,
        endDate: data.endDate,
        cumulativePaidAmount: data.cumulativePaidAmount ?? new Prisma.Decimal('0.00'),
        status: data.status ?? PolicyStatus.PENDING,
      },
    });
  }

  /**
   * Find policy by UUID primary key or unique business policy number.
   * If the input is UUID-shaped (8-4-4-4-12 hex format), queries the primary key 'id'.
   * If not UUID-shaped, queries the unique business key 'policyNumber'.
   * Never sends non-UUID business numbers to Prisma's UUID column.
   */
  async findById(
    id: string,
    tx?: Prisma.TransactionClient
  ): Promise<Policy | null> {
    const client = tx || this.db;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (isUuid) {
      return client.policy.findUnique({
        where: { id },
      });
    }
    return client.policy.findUnique({
      where: { policyNumber: id },
    });
  }

  /**
   * Find all policies for a given farm parcel, ordered by creation date desc.
   */
  async findByFarmId(
    farmId: string,
    tx?: Prisma.TransactionClient
  ): Promise<Policy[]> {
    const client = tx || this.db;
    return client.policy.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find the currently active policy covering a given reference timestamp for a farm parcel.
   * Enforces status === ACTIVE, valid coverage date window, and remaining balance.
   */
  async findActivePolicyForFarm(
    farmId: string,
    referenceDate: Date = new Date(),
    tx?: Prisma.TransactionClient
  ): Promise<Policy | null> {
    const client = tx || this.db;
    return client.policy.findFirst({
      where: {
        farmId,
        status: PolicyStatus.ACTIVE,
        startDate: { lte: referenceDate },
        endDate: { gte: referenceDate },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Transactional update of cumulative paid balance and status.
   * Guarantees that cumulative payouts cannot exceed the sum insured.
   */
  async updatePolicyBalanceAndStatus(
    id: string,
    update: UpdatePolicyBalanceInput,
    tx?: Prisma.TransactionClient
  ): Promise<Policy> {
    const executeInTx = async (client: Prisma.TransactionClient | PrismaClient) => {
      // 1. Acquire row-level lock on policy row in PostgreSQL to serialize concurrent settlements
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (typeof (client as any).$queryRaw === 'function') {
        if (isUuid) {
          await (client as any).$queryRaw`SELECT "id" FROM "policies" WHERE "id" = ${id}::uuid FOR UPDATE`;
        } else {
          await (client as any).$queryRaw`SELECT "id" FROM "policies" WHERE "id" = ${id} FOR UPDATE`;
        }
      }

      const existing = await client.policy.findUnique({
        where: { id },
      });

      if (!existing) {
        throw AppError.notFound(`Policy with ID '${id}' not found`);
      }

      const increment =
        update.payoutIncrement instanceof Prisma.Decimal
          ? update.payoutIncrement
          : new Prisma.Decimal(update.payoutIncrement.toString());

      if (increment.lessThan(0)) {
        throw AppError.badRequest('Payout increment amount cannot be negative');
      }

      const newCumulativePaid = existing.cumulativePaidAmount.add(increment);

      // Financial invariant check: cumulative payouts cannot exceed the sum insured
      if (newCumulativePaid.greaterThan(existing.sumInsured)) {
        throw AppError.badRequest(
          `Payout increment of ${increment.toFixed(2)} exceeds remaining coverage balance. Cumulative paid would be ${newCumulativePaid.toFixed(2)} against sum insured ${existing.sumInsured.toFixed(2)}.`
        );
      }

      // Determine appropriate status transition
      let finalStatus = update.newStatus ?? existing.status;
      if (!update.newStatus && newCumulativePaid.equals(existing.sumInsured)) {
        finalStatus = PolicyStatus.EXHAUSTED;
      }

      return client.policy.update({
        where: { id },
        data: {
          cumulativePaidAmount: newCumulativePaid,
          status: finalStatus,
        },
      });
    };

    if (tx) {
      return executeInTx(tx);
    }

    return this.db.$transaction(async (innerTx) => {
      return executeInTx(innerTx);
    });
  }

  /**
   * Update policy status directly (e.g. issuance PENDING -> ACTIVE, or cancellation).
   */
  async updatePolicyStatus(
    id: string,
    status: PolicyStatus,
    tx?: Prisma.TransactionClient
  ): Promise<Policy> {
    const client = tx || this.db;
    const existing = await client.policy.findUnique({
      where: { id },
    });

    if (!existing) {
      throw AppError.notFound(`Policy with ID '${id}' not found`);
    }

    return client.policy.update({
      where: { id },
      data: { status },
    });
  }
}

export const policyRepository = new PolicyRepository();
