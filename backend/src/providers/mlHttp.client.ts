/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-B: ML Microservice HTTP Transport Client
 *
 * Responsibilities:
 * - Connects Node.js backend to Python FastAPI ML microservice.
 * - Validates outgoing 17-feature Contract v1.1 payload before transmission.
 * - Dispatches HTTP POST /predict to env.ML_SERVICE_URL with explicit timeout bounds.
 * - Enforces zero retries: failed calls fail deterministically without retry loops.
 * - Validates incoming response payload against strict Zod schema (mlPredictionResponseSchema).
 * - Sanitizes upstream exceptions into domain AppErrors without leaking Python stack traces.
 * - Maintains complete isolation from Module 6 (climateRiskRuleEngine.service.ts).
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../config/env.config.js';
import { AppError } from '../utils/apiError.js';
import { MLFeatureContractV1_1 } from '../types/mlFeatureContract.types.js';
import { mlFeatureContractV1_1Schema } from '../validators/mlFeatureContract.validator.js';
import {
  mlPredictionResponseSchema,
  MLPredictionResponse,
} from '../validators/mlPredictionResponse.validator.js';
import {
  NdviFeaturePayload,
  NdviPredictionResponse,
} from '../types/ndviPrediction.types.js';
import {
  ndviFeaturePayloadSchema,
  ndviPredictionResponseSchema,
} from '../validators/ndviPrediction.validator.js';

export interface MLHttpClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

export class MLHttpClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private timeoutMs: number;

  /**
   * Initializes MLHttpClient with configurable target URL and timeout.
   * Default timeout of 8,000 ms is aligned with backend microservice conventions (WEATHER_REQUEST_TIMEOUT_MS).
   */
  constructor(client?: AxiosInstance, options?: MLHttpClientConfig) {
    this.baseUrl = options?.baseUrl || env.ML_SERVICE_URL;
    this.timeoutMs = options?.timeoutMs || 8000;

    this.client =
      client ||
      axios.create({
        baseURL: this.baseUrl,
        timeout: this.timeoutMs,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getTimeoutMs(): number {
    return this.timeoutMs;
  }

  /**
   * Sends a validated 17-feature Contract v1.1 payload to Python ML service POST /predict.
   *
   * @param features Validated 17-feature vector conforming to Contract v1.1
   * @returns Validated, typed MLPredictionResponse DTO
   * @throws AppError.badRequest on feature validation failure or HTTP 422
   * @throws AppError.serviceUnavailable on timeout, network disconnection, or HTTP 503
   * @throws AppError.badGateway on upstream 500 or malformed response schema
   */
  public async predict(features: MLFeatureContractV1_1): Promise<MLPredictionResponse> {
    // 1. Verify outgoing request payload against locked 17-feature Contract v1.1
    const validationResult = mlFeatureContractV1_1Schema.safeParse(features);
    if (!validationResult.success) {
      throw AppError.badRequest(
        `ML feature payload rejected before transmission: ${validationResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`
      );
    }
    const cleanPayload = validationResult.data;

    // 2. Dispatch HTTP POST /predict
    try {
      const response = await this.client.post<unknown>('/predict', cleanPayload, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: this.timeoutMs,
      });

      // 3. Validate received response against strict Zod schema
      const responseValidation = mlPredictionResponseSchema.safeParse(response.data);
      if (!responseValidation.success) {
        throw AppError.badGateway(
          `ML risk prediction service returned an invalid response schema: ${responseValidation.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', ')}`
        );
      }

      return responseValidation.data;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        this.handleHttpError(error);
      }

      throw AppError.badGateway(
        `ML risk prediction service request failed: ${error instanceof Error ? error.message : 'Unknown communication error'}`
      );
    }
  }

  /**
   * Sends a validated 29-feature NDVI forecast payload to Python ML service POST /predict/ndvi.
   *
   * @param features Validated 29-feature vector
   * @returns Validated, typed NdviPredictionResponse DTO
   */
  public async predictNdvi(features: NdviFeaturePayload): Promise<NdviPredictionResponse> {
    // 1. Validate outgoing 29-feature payload
    const validationResult = ndviFeaturePayloadSchema.safeParse(features);
    if (!validationResult.success) {
      throw AppError.badRequest(
        `NDVI feature payload rejected before transmission: ${validationResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`
      );
    }
    const cleanPayload = validationResult.data;

    // 2. Dispatch HTTP POST /predict/ndvi
    try {
      const response = await this.client.post<unknown>('/predict/ndvi', cleanPayload, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: this.timeoutMs,
      });

      // 3. Validate response
      const responseValidation = ndviPredictionResponseSchema.safeParse(response.data);
      if (!responseValidation.success) {
        throw AppError.badGateway(
          `NDVI prediction service returned an invalid response schema: ${responseValidation.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', ')}`
        );
      }

      return responseValidation.data;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        this.handleHttpError(error);
      }

      throw AppError.badGateway(
        `NDVI prediction service request failed: ${error instanceof Error ? error.message : 'Unknown communication error'}`
      );
    }
  }

  /**
   * Sanitizes and maps Axios errors to appropriate domain AppErrors.
   * Protects against leakage of internal Python stack traces or filesystem paths.
   */
  private handleHttpError(err: AxiosError): never {
    // 1. Timeout detection (ECONNABORTED, 408, or timeout message)
    if (
      err.code === 'ECONNABORTED' ||
      err.message?.toLowerCase().includes('timeout') ||
      err.response?.status === 408
    ) {
      throw AppError.serviceUnavailable(
        `ML risk prediction service request timed out after ${this.timeoutMs}ms.`
      );
    }

    // 2. HTTP response received from upstream
    if (err.response) {
      const status = err.response.status;
      const responseData = err.response.data as any;
      const rawDetail =
        responseData?.detail || responseData?.error?.message || responseData?.message || '';

      // Format clean detail if string and non-empty
      const cleanDetail =
        typeof rawDetail === 'string' && rawDetail.trim() ? `: ${rawDetail.trim()}` : '';

      switch (status) {
        case 422:
          throw AppError.badRequest(
            `ML risk prediction service rejected feature payload (HTTP 422)${cleanDetail}`
          );
        case 503:
          throw AppError.serviceUnavailable(
            `ML risk prediction service is unavailable (HTTP 503)${cleanDetail}`
          );
        default:
          if (status >= 500) {
            // Sanitize internal server errors to avoid exposing internal Python tracebacks
            throw AppError.badGateway(
              `ML risk prediction service server failure (HTTP ${status}).`
            );
          }
          throw AppError.badGateway(
            `ML risk prediction service unexpected response (HTTP ${status})${cleanDetail}`
          );
      }
    }

    // 3. Network connection failure (no HTTP response received)
    if (err.request) {
      throw AppError.serviceUnavailable(
        `ML risk prediction service is unreachable: Connection failed (${err.code || 'Network failure'}).`
      );
    }

    throw AppError.serviceUnavailable(
      `ML risk prediction service request failed: ${err.message}`
    );
  }
}

export const mlHttpClient = new MLHttpClient();
