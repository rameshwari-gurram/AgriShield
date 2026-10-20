/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-E: Frontend ML Risk API Service
 *
 * Dispatches HTTP requests to backend GET /api/v1/farms/:farmId/ml-risk.
 * Adheres strictly to project conventions and shared Axios apiClient.
 */

import { apiClient } from './api';
import { ApiResponse, MlRiskPredictionDTO, GetFarmRiskOptions, NdviForecastResponse } from '../types';

export interface ParsedMlRiskError {
  message: string;
  statusCode?: number;
  isInsufficientData: boolean;
  isNoSatelliteData?: boolean;
  isAuthError: boolean;
  isServiceUnavailable: boolean;
  isNotFound: boolean;
  details?: unknown;
}

/**
 * Normalizes backend error responses into actionable, user-friendly messages.
 * Preserves structured domain error codes when present.
 */
export function parseMlRiskErrorMessage(
  err: unknown,
  fallback: string = 'Unable to evaluate machine learning risk prediction.'
): ParsedMlRiskError {
  if (typeof err === 'string') {
    const isInsufficient =
      err.includes('INSUFFICIENT_WEATHER_DATA') || err.toLowerCase().includes('weather records');
    const isAuth =
      err.toLowerCase().includes('authentication') ||
      err.toLowerCase().includes('token') ||
      err.toLowerCase().includes('access denied');
    const isUnavailable =
      err.toLowerCase().includes('unavailable') || err.toLowerCase().includes('timed out');
    const isNotFound = err.toLowerCase().includes('not found');

    return {
      message: err,
      isInsufficientData: isInsufficient,
      isAuthError: isAuth,
      isServiceUnavailable: isUnavailable,
      isNotFound,
    };
  }

  const anyErr = err as any;
  const status = anyErr?.response?.status as number | undefined;
  const data = anyErr?.response?.data;
  const backendMessage = (data?.message || anyErr?.message || '') as string;
  const details = data?.data;

  // 1. Check for Insufficient Weather Telemetry (HTTP 400 with domain code)
  const isInsufficientData =
    (status === 400 || !status) &&
    (backendMessage.includes('INSUFFICIENT_WEATHER_DATA') ||
      backendMessage.toLowerCase().includes('weather records'));

  if (isInsufficientData) {
    const isNdviWindow =
      backendMessage.includes('168') ||
      backendMessage.toLowerCase().includes('7-day') ||
      backendMessage.toLowerCase().includes('vegetation');

    const message = isNdviWindow
      ? 'Insufficient Weather Telemetry: A complete 7-day (168-hour) weather observation window is required to generate the vegetation forecast. Please synchronize weather data first.'
      : 'Insufficient Weather Telemetry: A continuous 30-day (720-hour) weather observation history is required to construct the ML feature vector. Please synchronize weather data first.';

    return {
      message,
      statusCode: 400,
      isInsufficientData: true,
      isNoSatelliteData: false,
      isAuthError: false,
      isServiceUnavailable: false,
      isNotFound: false,
      details,
    };
  }

  // Check for Missing Satellite Data
  if (backendMessage.includes('NO_SATELLITE_DATA')) {
    return {
      message:
        'No Sentinel-2 satellite NDVI observations recorded for this farm yet. Please sync satellite observations first to generate a vegetation forecast.',
      statusCode: 400,
      isInsufficientData: false,
      isNoSatelliteData: true,
      isAuthError: false,
      isServiceUnavailable: false,
      isNotFound: false,
      details,
    };
  }

  // 2. Authentication and Ownership Authorization Failures (401 / 403)
  if (status === 401) {
    return {
      message:
        'Authentication Required: Access to advisory machine learning risk predictions requires an authenticated producer session.',
      statusCode: 401,
      isInsufficientData: false,
      isAuthError: true,
      isServiceUnavailable: false,
      isNotFound: false,
      details,
    };
  }

  if (status === 403) {
    return {
      message:
        'Access Denied: Advisory machine learning predictions are restricted to the registered owner (farmer) of this farm parcel.',
      statusCode: 403,
      isInsufficientData: false,
      isAuthError: true,
      isServiceUnavailable: false,
      isNotFound: false,
      details,
    };
  }

  // 3. Farm Not Found (404)
  if (status === 404) {
    return {
      message: 'Farm Parcel Not Found: The requested farm record does not exist in the platform registry.',
      statusCode: 404,
      isInsufficientData: false,
      isAuthError: false,
      isServiceUnavailable: false,
      isNotFound: true,
      details,
    };
  }

  // 4. ML Microservice Unavailable / Timeout (503)
  if (status === 503) {
    return {
      message:
        'ML Service Unavailable: The machine learning inference worker is currently unreachable or timed out (8000ms bound).',
      statusCode: 503,
      isInsufficientData: false,
      isAuthError: false,
      isServiceUnavailable: true,
      isNotFound: false,
      details,
    };
  }

  // 5. Upstream Bad Gateway or Persistence Failure (502)
  if (status === 502) {
    return {
      message: `ML Gateway Error: ${backendMessage || 'Upstream model inference or audit persistence failed.'}`,
      statusCode: 502,
      isInsufficientData: false,
      isAuthError: false,
      isServiceUnavailable: false,
      isNotFound: false,
      details,
    };
  }

  // 6. Generic or validation failure
  return {
    message: backendMessage || fallback,
    statusCode: status,
    isInsufficientData: false,
    isAuthError: false,
    isServiceUnavailable: false,
    isNotFound: false,
    details,
  };
}

export const mlRiskService = {
  /**
   * Retrieves or computes the advisory machine learning risk evaluation and
   * 17-feature SHAP explanation for a farm parcel.
   *
   * Calls GET /api/v1/farms/:farmId/ml-risk
   *
   * @param farmId UUID of the farm parcel
   * @param options Query options including forceRefresh and optional token header
   */
  async getFarmRisk(
    farmId: string,
    options?: GetFarmRiskOptions
  ): Promise<ApiResponse<MlRiskPredictionDTO>> {
    const config: Record<string, any> = {};

    if (options?.forceRefresh) {
      config.params = { forceRefresh: true };
    }

    if (options?.token) {
      config.headers = {
        Authorization: `Bearer ${options.token}`,
      };
    }

    const response = await apiClient.get<ApiResponse<MlRiskPredictionDTO>>(
      `/farms/${farmId}/ml-risk`,
      config
    );

    return response.data;
  },

  /**
   * Retrieves 7-day ahead Sentinel-2 NDVI vegetation condition forecast
   * and 29-feature SHAP attributions for a farm parcel.
   *
   * Calls GET /api/v1/farms/:farmId/ml-risk/ndvi-forecast
   */
  async getFarmNdviForecast(
    farmId: string,
    options?: GetFarmRiskOptions
  ): Promise<ApiResponse<NdviForecastResponse>> {
    const config: Record<string, any> = {};

    if (options?.token) {
      config.headers = {
        Authorization: `Bearer ${options.token}`,
      };
    }

    const response = await apiClient.get<ApiResponse<NdviForecastResponse>>(
      `/farms/${farmId}/ml-risk/ndvi-forecast`,
      config
    );

    return response.data;
  },
};
