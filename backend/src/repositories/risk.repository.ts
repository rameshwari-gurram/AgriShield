/**
 * Module 6: Risk Repository
 * Implements database operations for RiskRule, RiskAssessment, and RiskEvent models.
 * Guarantees transactional all-or-nothing assessment and event persistence.
 */

import { PrismaClient, RiskRule, Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import {
  IRiskRepository,
  CreateRiskAssessmentInput,
  CreateRiskEventInput,
  RiskAssessmentWithEvents,
  DEFAULT_ASSESSMENT_VERSION,
} from '../types/risk.types.js';

export class RiskRepository implements IRiskRepository {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.db = dbClient;
  }

  /**
   * Retrieve all active risk rules from PostgreSQL.
   * Sorted deterministically by rule code ascending.
   */
  async findActiveRules(): Promise<RiskRule[]> {
    return this.db.riskRule.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Retrieve a single risk rule by its unique code.
   */
  async findRuleByCode(code: string): Promise<RiskRule | null> {
    return this.db.riskRule.findUnique({
      where: { code },
    });
  }

  /**
   * Atomically create a RiskAssessment and all its associated RiskEvent rows
   * inside a single PostgreSQL transaction.
   * If any event creation fails, the entire transaction rolls back cleanly.
   */
  async createAssessmentWithEvents(
    assessmentData: CreateRiskAssessmentInput,
    eventsData: CreateRiskEventInput[]
  ): Promise<RiskAssessmentWithEvents> {
    return this.db.$transaction(async (tx) => {
      // 1. Create RiskAssessment record
      const assessment = await tx.riskAssessment.create({
        data: {
          farmId: assessmentData.farmId,
          assessedAt: assessmentData.assessedAt,
          overallRisk: assessmentData.overallRisk,
          assessmentVersion: assessmentData.assessmentVersion ?? DEFAULT_ASSESSMENT_VERSION,
          ruleCount: assessmentData.ruleCount,
          triggeredRuleCount: assessmentData.triggeredRuleCount,
          weatherRecordCount: assessmentData.weatherRecordCount,
        },
      });

      // 2. Create RiskEvent records linked to the assessment
      const createdEvents = [];
      for (const event of eventsData) {
        const createdEvent = await tx.riskEvent.create({
          data: {
            assessmentId: assessment.id,
            riskRuleId: event.riskRuleId,
            observedValue: event.observedValue,
            thresholdValue: event.thresholdValue,
            unit: event.unit,
            severity: event.severity,
            triggered: event.triggered,
            explanation: event.explanation,
            observedAt: event.observedAt,
          },
          include: {
            riskRule: true,
          },
        });
        createdEvents.push(createdEvent);
      }

      return {
        ...assessment,
        riskEvents: createdEvents,
      };
    });
  }

  /**
   * Retrieve a single RiskAssessment by ID including its associated RiskEvents and RiskRules.
   */
  async findAssessmentById(id: string): Promise<RiskAssessmentWithEvents | null> {
    return this.db.riskAssessment.findUnique({
      where: { id },
      include: {
        riskEvents: {
          include: {
            riskRule: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }) as unknown as Promise<RiskAssessmentWithEvents | null>;
  }

  /**
   * Retrieve all RiskAssessments for a farm parcel.
   * Results are sorted chronologically descending (assessedAt DESC).
   */
  async findAssessmentsByFarmId(
    farmId: string,
    limit?: number
  ): Promise<RiskAssessmentWithEvents[]> {
    const query: Prisma.RiskAssessmentFindManyArgs = {
      where: { farmId },
      orderBy: { assessedAt: 'desc' },
      include: {
        riskEvents: {
          include: {
            riskRule: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    };

    if (limit !== undefined && limit > 0) {
      query.take = limit;
    }

    return this.db.riskAssessment.findMany(query) as unknown as Promise<RiskAssessmentWithEvents[]>;
  }

  /**
   * Delete assessments for a farm parcel.
   * Cascade-deletes child RiskEvents automatically (ON DELETE CASCADE).
   * Used for isolated integration test setup and teardown.
   */
  async deleteAssessmentsByFarmId(farmId: string): Promise<number> {
    const { count } = await this.db.riskAssessment.deleteMany({
      where: { farmId },
    });
    return count;
  }
}

export const riskRepository = new RiskRepository();
