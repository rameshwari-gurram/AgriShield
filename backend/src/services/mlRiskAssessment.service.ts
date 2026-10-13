/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-C: ML Risk Assessment & Audit Persistence Orchestrator
 *
 * Responsibilities:
 * - Coordinates farm telemetry feature construction, input fingerprinting, and ML HTTP inference.
 * - Enforces deterministic cache identity using 17-feature canonical SHA-256 fingerprinting.
 * - Coalesces concurrent in-flight requests in-process to prevent redundant upstream inferences.
 * - Persists full audit provenance (features, SHAP explanations, model versions, legal disclaimers).
 * - Enforces strict transactional failure semantics (no unpersisted predictions returned).
 * - Strictly isolated from Module 6 (climateRiskRuleEngine) and payout/claim execution.
 */

import crypto from 'node:crypto';
import { PrismaClient, MlRiskPrediction, Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/apiError.js';
import { MLFeatureContractV1_1 } from '../types/mlFeatureContract.types.js';
import { CANONICAL_FEATURE_NAMES } from '../validators/mlFeatureContract.validator.js';
import { ExplanationResult } from '../validators/mlPredictionResponse.validator.js';
import {
  MLFeatureEngineeringService,
  mlFeatureEngineeringService,
} from './mlFeatureEngineering.service.js';
import { MLHttpClient } from '../providers/mlHttp.client.js';
import { mlRiskRepository } from '../repositories/mlRisk.repository.js';
import {
  IMlRiskRepository,
  MlRiskPredictionDTO,
  AssessFarmRiskOptions,
} from '../types/mlRisk.types.js';

/**
 * Computes a deterministic SHA-256 fingerprint for the complete 17-feature input payload.
 *
 * Rules:
 * 1. Uses CANONICAL_FEATURE_NAMES as the sole authority for feature ordering.
 * 2. Incorporates all 17 features.
 * 3. Preserves native null for unavailable NDVI values without coercing to 0.
 * 4. Invariant to JavaScript object key iteration order.
 * 5. Rejects non-finite numbers according to contract.
 */
export function computeInputFingerprint(features: MLFeatureContractV1_1): string {
  const parts: string[] = [];

  for (const key of CANONICAL_FEATURE_NAMES) {
    const val = features[key];
    if (val === null) {
      parts.push(`${key}:null`);
    } else if (typeof val === 'number') {
      if (!Number.isFinite(val)) {
        throw AppError.badRequest(
          `Invalid non-finite number for canonical feature '${key}': ${val}`
        );
      }
      parts.push(`${key}:${val}`);
    } else {
      throw AppError.badRequest(
        `Unexpected value type for canonical feature '${key}': ${typeof val}`
      );
    }
  }

  const serialized = parts.join(';');
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

export class MLRiskAssessmentService {
  private featureEngineeringService: MLFeatureEngineeringService;
  private mlHttpClient: MLHttpClient;
  private repository: IMlRiskRepository;
  private prisma: PrismaClient;

  /**
   * In-process in-flight promise map used to coalesce identical concurrent requests.
   * Keyed by `${farmId}:${fingerprint}`.
   *
   * Note: In-process coalescing handles concurrent burst requests within the same
   * Node.js event loop. It does not provide distributed deduplication across multiple
   * independent server instances, but database persistence is append-only and safe.
   */
  private inFlightRequests: Map<string, Promise<MlRiskPredictionDTO>>;

  constructor(
    featureEngineeringService: MLFeatureEngineeringService = mlFeatureEngineeringService,
    mlHttpClient: MLHttpClient = new MLHttpClient(),
    repository: IMlRiskRepository = mlRiskRepository,
    dbClient: PrismaClient = prisma
  ) {
    this.featureEngineeringService = featureEngineeringService;
    this.mlHttpClient = mlHttpClient;
    this.repository = repository;
    this.prisma = dbClient;
    this.inFlightRequests = new Map();
  }

  /**
   * Returns current count of active in-flight request promises (for testing & diagnostics).
   */
  public getInFlightCount(): number {
    return this.inFlightRequests.size;
  }

  /**
   * Evaluates machine learning risk for a farm parcel.
   *
   * Flow:
   * 1. Constructs and validates 17-feature Contract v1.1 vector from PostgreSQL telemetry.
   * 2. Resolves evaluation anchor T_end (assessedAt) from latest weather or reference time.
   * 3. Computes canonical SHA-256 input fingerprint.
   * 4. Checks persistent cache for matching (farmId, inputFingerprint) unless forceRefresh is true.
   * 5. Coalesces concurrent in-flight requests for identical inputs.
   * 6. Dispatches HTTP POST /predict to Python ML microservice.
   * 7. Persists complete audit record (features, SHAP, model metadata, disclaimer) to PostgreSQL.
   * 8. Returns typed MlRiskPredictionDTO.
   *
   * @throws AppError.notFound if farm does not exist
   * @throws AppError.badRequest on insufficient weather telemetry (< 720h)
   * @throws AppError.serviceUnavailable on ML microservice timeout or disconnection
   * @throws AppError.badGateway on persistence failure or invalid model response
   */
  public async assessFarmRisk(
    farmId: string,
    options?: AssessFarmRiskOptions
  ): Promise<MlRiskPredictionDTO> {
    // 1. Construct & validate 17-feature vector from farm telemetry
    const features = await this.featureEngineeringService.constructFeaturesFromFarmId(
      farmId,
      options
    );

    // 2. Resolve evaluation anchor T_end (assessedAt)
    let tRef = options?.referenceTime;
    if (!tRef) {
      const latestWeather = await this.prisma.weatherRecord.findFirst({
        where: { farmId },
        orderBy: { observedAt: 'desc' },
      });
      if (!latestWeather) {
        throw AppError.badRequest(
          `INSUFFICIENT_WEATHER_DATA: No weather records found in database for farm '${farmId}'.`
        );
      }
      tRef = latestWeather.observedAt;
    }

    const assessedAt = new Date(
      Date.UTC(
        tRef.getUTCFullYear(),
        tRef.getUTCMonth(),
        tRef.getUTCDate(),
        tRef.getUTCHours(),
        0,
        0,
        0
      )
    );

    // 3. Compute deterministic input fingerprint across all 17 features
    const fingerprint = computeInputFingerprint(features);
    const flightKey = `${farmId}:${fingerprint}`;

    // 4. Cache evaluation (unless forceRefresh is explicitly requested)
    if (!options?.forceRefresh) {
      // 4a. Check persistent PostgreSQL audit cache
      const cached = await this.repository.findLatestByFarmIdAndFingerprint(
        farmId,
        fingerprint
      );
      if (cached) {
        return this.mapToDTO(cached, true);
      }

      // 4b. Coalesce identical concurrent requests in-flight
      const inFlight = this.inFlightRequests.get(flightKey);
      if (inFlight) {
        return await inFlight;
      }
    }

    // 5. Execute inference & persistence workflow
    const executionPromise = (async (): Promise<MlRiskPredictionDTO> => {
      // 5a. Dispatch HTTP POST /predict to Python ML service
      const response = await this.mlHttpClient.predict(features);

      // 5b. Persist prediction audit record in PostgreSQL
      let persisted: MlRiskPrediction;
      try {
        persisted = await this.repository.create({
          farmId,
          assessedAt,
          inputFingerprint: fingerprint,
          predictedClass: response.prediction.predicted_class,
          calibratedProbability: response.prediction.calibrated_probability,
          rawDecisionMargin: response.prediction.raw_decision_margin,
          featureSnapshot: features as unknown as Prisma.InputJsonValue,
          shapExplanation: response.explanation as unknown as Prisma.InputJsonValue,
          modelName: response.model.model_name,
          modelVersion: response.model.model_version,
          featureContractVersion: response.model.feature_contract_version,
          disclaimer: response.disclaimer,
        });
      } catch (persistenceError) {
        logger.error('Failed to persist ML risk prediction audit record', {
          farmId,
          assessedAt: assessedAt.toISOString(),
          inputFingerprint: fingerprint,
          modelName: response.model.model_name,
          modelVersion: response.model.model_version,
          error:
            persistenceError instanceof Error
              ? persistenceError.message
              : String(persistenceError),
        });
        throw AppError.badGateway('ML risk prediction succeeded but audit persistence failed.');
      }

      return this.mapToDTO(persisted, false);
    })();

    // 6. Register in-flight promise for concurrent ordinary requests
    if (!options?.forceRefresh) {
      this.inFlightRequests.set(flightKey, executionPromise);
    }

    try {
      return await executionPromise;
    } finally {
      if (!options?.forceRefresh) {
        this.inFlightRequests.delete(flightKey);
      }
    }
  }

  /**
   * Retrieves the latest persisted ML risk prediction for a farm.
   */
  public async getLatestAssessment(farmId: string): Promise<MlRiskPredictionDTO | null> {
    const record = await this.repository.findLatestByFarmId(farmId);
    if (!record) {
      return null;
    }
    return this.mapToDTO(record, true);
  }

  /**
   * Retrieves the historical audit trail of ML risk predictions for a farm.
   */
  public async getAssessmentHistory(
    farmId: string,
    limit: number = 20
  ): Promise<MlRiskPredictionDTO[]> {
    const records = await this.repository.findHistoryByFarmId(farmId, limit);
    return records.map((r: MlRiskPrediction) => this.mapToDTO(r, true));
  }

  /**
   * Maps a Prisma MlRiskPrediction record to a clean, typed domain DTO.
   */
  private mapToDTO(record: MlRiskPrediction, isCached: boolean): MlRiskPredictionDTO {
    return {
      id: record.id,
      farmId: record.farmId,
      assessedAt: record.assessedAt,
      inputFingerprint: record.inputFingerprint,
      predictedClass: record.predictedClass as 0 | 1,
      calibratedProbability: Number(record.calibratedProbability),
      rawDecisionMargin: Number(record.rawDecisionMargin),
      featureSnapshot: record.featureSnapshot as unknown as MLFeatureContractV1_1,
      shapExplanation: record.shapExplanation as unknown as ExplanationResult,
      model: {
        modelName: record.modelName,
        modelVersion: record.modelVersion,
        featureContractVersion: record.featureContractVersion,
      },
      disclaimer: record.disclaimer,
      createdAt: record.createdAt,
      isCached,
    };
  }
}

export const mlRiskAssessmentService = new MLRiskAssessmentService();
