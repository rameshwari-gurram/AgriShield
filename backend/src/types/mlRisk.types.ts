/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-C: ML Risk Domain Types, DTOs & Repository Interface
 *
 * Provides type contracts for ML risk prediction persistence,
 * caching identity, audit metadata, and service orchestration.
 */

import { MlRiskPrediction, Prisma } from '@prisma/client';
import { MLFeatureContractV1_1 } from './mlFeatureContract.types.js';
import { ExplanationResult } from '../validators/mlPredictionResponse.validator.js';

export { MlRiskPrediction };

/**
 * Authoritative response DTO for ML risk evaluation.
 * Decoupled from direct Prisma database models.
 */
export interface MlRiskPredictionDTO {
  id: string;
  farmId: string;
  assessedAt: Date;
  inputFingerprint: string;
  predictedClass: 0 | 1;
  calibratedProbability: number;
  rawDecisionMargin: number;
  featureSnapshot: MLFeatureContractV1_1;
  shapExplanation: ExplanationResult;
  model: {
    modelName: string;
    modelVersion: string;
    featureContractVersion: string;
  };
  disclaimer: string;
  createdAt: Date;
  isCached: boolean;
}

/**
 * Options for farm risk assessment execution.
 */
export interface AssessFarmRiskOptions {
  /**
   * Optional reference timestamp T_ref (for historical re-evaluation / backtesting).
   * Truncated to the UTC hour to determine T_end.
   */
  referenceTime?: Date;

  /**
   * If true, bypasses the persistent fingerprint cache and executes
   * a fresh inference call, appending a new audit prediction row.
   */
  forceRefresh?: boolean;
}

/**
 * Input DTO for persisting an ML risk prediction record in PostgreSQL.
 */
export interface CreateMlRiskPredictionInput {
  farmId: string;
  assessedAt: Date;
  inputFingerprint: string;
  predictedClass: number;
  calibratedProbability: number | Prisma.Decimal;
  rawDecisionMargin: number | Prisma.Decimal;
  featureSnapshot: Prisma.InputJsonValue;
  shapExplanation: Prisma.InputJsonValue;
  modelName: string;
  modelVersion: string;
  featureContractVersion: string;
  disclaimer: string;
}

/**
 * Repository interface for ML risk persistence operations.
 */
export interface IMlRiskRepository {
  create(data: CreateMlRiskPredictionInput): Promise<MlRiskPrediction>;
  findLatestByFarmId(farmId: string): Promise<MlRiskPrediction | null>;
  findLatestByFarmIdAndFingerprint(
    farmId: string,
    inputFingerprint: string
  ): Promise<MlRiskPrediction | null>;
  findHistoryByFarmId(farmId: string, limit?: number): Promise<MlRiskPrediction[]>;
}
