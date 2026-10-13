/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-C: ML Risk Persistence Repository
 *
 * Implements database operations for the MlRiskPrediction model.
 * Provides idempotent lookups, audit insertion, and historical queries.
 */

import { PrismaClient, MlRiskPrediction, Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { IMlRiskRepository, CreateMlRiskPredictionInput } from '../types/mlRisk.types.js';

export class MlRiskRepository implements IMlRiskRepository {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.db = dbClient;
  }

  async create(data: CreateMlRiskPredictionInput): Promise<MlRiskPrediction> {
    return this.db.mlRiskPrediction.create({
      data: {
        farmId: data.farmId,
        assessedAt: data.assessedAt,
        inputFingerprint: data.inputFingerprint,
        predictedClass: data.predictedClass,
        calibratedProbability: new Prisma.Decimal(data.calibratedProbability.toString()),
        rawDecisionMargin: new Prisma.Decimal(data.rawDecisionMargin.toString()),
        featureSnapshot: data.featureSnapshot,
        shapExplanation: data.shapExplanation,
        modelName: data.modelName,
        modelVersion: data.modelVersion,
        featureContractVersion: data.featureContractVersion,
        disclaimer: data.disclaimer,
      },
    });
  }

  async findLatestByFarmId(farmId: string): Promise<MlRiskPrediction | null> {
    return this.db.mlRiskPrediction.findFirst({
      where: { farmId },
      orderBy: { assessedAt: 'desc' },
    });
  }

  async findLatestByFarmIdAndFingerprint(
    farmId: string,
    inputFingerprint: string
  ): Promise<MlRiskPrediction | null> {
    return this.db.mlRiskPrediction.findFirst({
      where: {
        farmId,
        inputFingerprint,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findHistoryByFarmId(farmId: string, limit: number = 20): Promise<MlRiskPrediction[]> {
    return this.db.mlRiskPrediction.findMany({
      where: { farmId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const mlRiskRepository = new MlRiskRepository();
