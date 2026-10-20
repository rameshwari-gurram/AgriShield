/**
 * Module 8 Stage 8.3-B: ML Microservice HTTP Client Unit Tests
 *
 * Comprehensive mocked unit tests verifying:
 * 1. Valid Python response returns a validated typed DTO
 * 2. Exact POST /predict path and HTTP method
 * 3. Exactly the 17 canonical feature keys are forwarded
 * 4. Feature values and nullable NDVI values are preserved
 * 5. No extra business or metadata fields are injected (strict schema rejection before call)
 * 6. Probability outside [0, 1] is rejected
 * 7. Missing or malformed required response fields are rejected
 * 8. Invalid predicted class (not in {0, 1}) or invalid margin (NaN/Infinity) is rejected
 * 9. Timeout and HTTP 408 normalization
 * 10. Connection-refused and network/DNS failure normalization
 * 11. HTTP 422 normalization
 * 12. HTTP 503 normalization
 * 13. HTTP 500 and unexpected upstream failures are sanitized (no stack trace leaks)
 * 14. No automatic retries occur (callCount === 1)
 * 15. Zero dependency on Module 6 or database persistence
 */

import { MLHttpClient } from '../../src/providers/mlHttp.client.js';
import { MLFeatureContractV1_1 } from '../../src/types/mlFeatureContract.types.js';
import { CANONICAL_FEATURE_NAMES } from '../../src/validators/mlFeatureContract.validator.js';
import { CANONICAL_NDVI_FEATURE_NAMES } from '../../src/validators/ndviPrediction.validator.js';
import { NdviFeaturePayload, NdviPredictionResponse } from '../../src/types/ndviPrediction.types.js';
import { AppError } from '../../src/utils/apiError.js';
import { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

class MockAxiosClient {
  public callCount: number = 0;
  public lastMethod: string = '';
  public lastUrl: string = '';
  public lastData: any = null;
  public lastConfig: any = null;
  public mockResponse: any = null;
  public mockError: any = null;

  async post<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    this.callCount++;
    this.lastMethod = 'POST';
    this.lastUrl = url;
    this.lastData = data;
    this.lastConfig = config;

    if (this.mockError) {
      throw this.mockError;
    }

    return {
      data: this.mockResponse,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    };
  }
}

function createValidPythonResponse() {
  return {
    prediction: {
      predicted_class: 0,
      calibrated_probability: 0.3245,
      raw_decision_margin: -0.4521,
    },
    explanation: {
      base_value: -1.50748,
      reconstructed_margin: -0.4521,
      additivity_error: 4.7184e-16,
      attributions: [
        { feature_name: 'precipitation_sum_30d', feature_value: 120.5, shap_value: -0.12, direction: 'pushes model toward class 0', contribution_magnitude: 0.12 },
        { feature_name: 'precipitation_sum_14d', feature_value: 45.2, shap_value: -0.08, direction: 'pushes model toward class 0', contribution_magnitude: 0.08 },
        { feature_name: 'precipitation_std_30d', feature_value: 8.4, shap_value: 0.02, direction: 'pushes model toward class 1', contribution_magnitude: 0.02 },
        { feature_name: 'consecutive_dry_days_max', feature_value: 12, shap_value: 0.15, direction: 'pushes model toward class 1', contribution_magnitude: 0.15 },
        { feature_name: 'temp_max_30d', feature_value: 41.2, shap_value: 0.25, direction: 'pushes model toward class 1', contribution_magnitude: 0.25 },
        { feature_name: 'temp_mean_30d', feature_value: 32.1, shap_value: 0.10, direction: 'pushes model toward class 1', contribution_magnitude: 0.10 },
        { feature_name: 'temp_amplitude_mean_30d', feature_value: 11.5, shap_value: 0.05, direction: 'pushes model toward class 1', contribution_magnitude: 0.05 },
        { feature_name: 'heat_wave_hours_30d', feature_value: 48, shap_value: 0.30, direction: 'pushes model toward class 1', contribution_magnitude: 0.30 },
        { feature_name: 'relative_humidity_mean_30d', feature_value: 55.0, shap_value: -0.05, direction: 'pushes model toward class 0', contribution_magnitude: 0.05 },
        { feature_name: 'vpd_mean_30d', feature_value: 2.35, shap_value: 0.12, direction: 'pushes model toward class 1', contribution_magnitude: 0.12 },
        { feature_name: 'wind_speed_mean_30d', feature_value: 12.4, shap_value: 0.01, direction: 'pushes model toward class 1', contribution_magnitude: 0.01 },
        { feature_name: 'wind_gust_max_30d', feature_value: 75.0, shap_value: 0.04, direction: 'pushes model toward class 1', contribution_magnitude: 0.04 },
        { feature_name: 'ndvi_latest', feature_value: 0.42, shap_value: -0.22, direction: 'pushes model toward class 0', contribution_magnitude: 0.22 },
        { feature_name: 'ndvi_trend_30d', feature_value: -0.003, shap_value: 0.08, direction: 'pushes model toward class 1', contribution_magnitude: 0.08 },
        { feature_name: 'calculated_area_ha', feature_value: 2.5, shap_value: -0.01, direction: 'pushes model toward class 0', contribution_magnitude: 0.01 },
        { feature_name: 'is_ndvi_available', feature_value: 1.0, shap_value: 0.00, direction: 'no contribution', contribution_magnitude: 0.00 },
        { feature_name: 'is_ndvi_trend_available', feature_value: 1.0, shap_value: 0.00, direction: 'no contribution', contribution_magnitude: 0.00 },
      ],
    },
    model: {
      model_name: 'AgriShield-Risk-HGB-Prototype',
      model_version: '1.0.0',
      feature_contract_version: 'v1.1',
      feature_count: 17,
    },
    disclaimer:
      'This prediction and SHAP explanation are generated by a prototype machine learning model trained on parameterized synthetic agronomic simulation data.',
  };
}

function createValidFeatures(): MLFeatureContractV1_1 {
  return {
    precipitation_sum_30d: 120.5,
    precipitation_sum_14d: 45.2,
    precipitation_std_30d: 8.4,
    consecutive_dry_days_max: 12,
    temp_max_30d: 41.2,
    temp_mean_30d: 32.1,
    temp_amplitude_mean_30d: 11.5,
    heat_wave_hours_30d: 48,
    relative_humidity_mean_30d: 55.0,
    vpd_mean_30d: 2.35,
    wind_speed_mean_30d: 12.4,
    wind_gust_max_30d: 75.0,
    ndvi_latest: 0.42,
    ndvi_trend_30d: -0.003,
    calculated_area_ha: 2.5,
    is_ndvi_available: 1,
    is_ndvi_trend_available: 1,
  };
}

async function runMLHttpClientUnitTests() {
  console.log('================================================================================');
  console.log('🧪 Running Module 8 Stage 8.3-B: ML HTTP Client Unit Tests (Mocked)');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
    }
  };

  const mockAxios = new MockAxiosClient();
  const client = new MLHttpClient(mockAxios as unknown as AxiosInstance, {
    baseUrl: 'http://mock-ml-service:8000',
    timeoutMs: 8000,
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Valid Python response returns a validated typed DTO
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Valid Python Response Round-Trip ---');
  {
    mockAxios.callCount = 0;
    mockAxios.mockError = null;
    mockAxios.mockResponse = createValidPythonResponse();

    const response = await client.predict(createValidFeatures());

    assert(response.prediction.predicted_class === 0, '1.1 predicted_class parsed as 0');
    assert(response.prediction.calibrated_probability === 0.3245, '1.2 calibrated_probability parsed accurately');
    assert(response.prediction.raw_decision_margin === -0.4521, '1.3 raw_decision_margin parsed accurately');
    assert(response.explanation.attributions.length === 17, '1.4 exactly 17 feature attributions returned');
    assert(response.explanation.base_value === -1.50748, '1.5 base_value parsed accurately');
    assert(response.model.feature_count === 17, '1.6 model.feature_count is 17');
    assert(response.model.feature_contract_version === 'v1.1', '1.7 feature_contract_version is v1.1');
    assert(response.disclaimer.length > 0, '1.8 disclaimer preserved');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Exact POST /predict path and HTTP method
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Endpoint Path & Method Verification ---');
  {
    assert(mockAxios.lastMethod === 'POST', '2.1 HTTP method is strictly POST');
    assert(mockAxios.lastUrl === '/predict', '2.2 Endpoint path is strictly /predict');
    assert(
      mockAxios.lastConfig?.headers?.['Content-Type'] === 'application/json',
      '2.3 Content-Type header is application/json'
    );
    assert(
      mockAxios.lastConfig?.headers?.['Accept'] === 'application/json',
      '2.4 Accept header is application/json'
    );
    assert(mockAxios.lastConfig?.timeout === 8000, '2.5 Request timeout configured as 8000ms');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Exactly the 17 canonical feature keys are forwarded
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Canonical 17-Feature Forwarding ---');
  {
    const forwardedKeys = Object.keys(mockAxios.lastData);
    assert(forwardedKeys.length === 17, '3.1 Exactly 17 keys forwarded to Python service');
    const allMatch = CANONICAL_FEATURE_NAMES.every((k) => forwardedKeys.includes(k));
    assert(allMatch, '3.2 All 17 keys strictly match CANONICAL_FEATURE_NAMES');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Feature values and nullable NDVI values are preserved
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Nullable NDVI Value Preservation ---');
  {
    mockAxios.callCount = 0;
    const missingNdviFeatures: MLFeatureContractV1_1 = {
      ...createValidFeatures(),
      ndvi_latest: null,
      ndvi_trend_30d: null,
      is_ndvi_available: 0,
      is_ndvi_trend_available: 0,
    };

    mockAxios.mockResponse = createValidPythonResponse();
    await client.predict(missingNdviFeatures);

    assert(mockAxios.lastData.ndvi_latest === null, '4.1 ndvi_latest forwarded as native null');
    assert(mockAxios.lastData.ndvi_trend_30d === null, '4.2 ndvi_trend_30d forwarded as native null');
    assert(mockAxios.lastData.is_ndvi_available === 0, '4.3 is_ndvi_available forwarded as 0');
    assert(mockAxios.lastData.is_ndvi_trend_available === 0, '4.4 is_ndvi_trend_available forwarded as 0');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: No extra business or metadata fields are injected
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Rejection of Injected Extra Fields ---');
  {
    mockAxios.callCount = 0;
    const injectedPayload = {
      ...createValidFeatures(),
      farm_id: '123e4567-e89b-12d3-a456-426614174000',
      claim_status: 'PENDING',
      payout_amount: 50000,
    } as any;

    let rejectedBeforeTransmission = false;
    try {
      await client.predict(injectedPayload);
    } catch (err: any) {
      rejectedBeforeTransmission = err instanceof AppError && err.statusCode === 400;
    }

    assert(rejectedBeforeTransmission, '5.1 Injected fields rejected before transmission (HTTP 400 AppError)');
    assert(mockAxios.callCount === 0, '5.2 Axios never called when extra fields are present');
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Probability outside [0, 1] is rejected
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Response Probability Range Rejection ---');
  {
    mockAxios.mockError = null;
    const invalidProbResponse = createValidPythonResponse();
    invalidProbResponse.prediction.calibrated_probability = 1.05;
    mockAxios.mockResponse = invalidProbResponse;

    let caughtInvalidProb = false;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caughtInvalidProb = err instanceof AppError && err.statusCode === 502;
    }
    assert(caughtInvalidProb, '6.1 Calibrated probability > 1.0 rejected as 502 Bad Gateway');

    invalidProbResponse.prediction.calibrated_probability = -0.01;
    let caughtNegativeProb = false;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caughtNegativeProb = err instanceof AppError && err.statusCode === 502;
    }
    assert(caughtNegativeProb, '6.2 Calibrated probability < 0.0 rejected as 502 Bad Gateway');
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Missing or malformed required response fields are rejected
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Malformed Response Schema Rejection ---');
  {
    // 7.1 Missing explanation block
    const missingExplanation = createValidPythonResponse() as any;
    delete missingExplanation.explanation;
    mockAxios.mockResponse = missingExplanation;

    let caughtMissingExp = false;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caughtMissingExp = err instanceof AppError && err.statusCode === 502;
    }
    assert(caughtMissingExp, '7.1 Missing explanation block rejected as 502 Bad Gateway');

    // 7.2 Attributions count !== 17
    const truncatedAttributions = createValidPythonResponse();
    truncatedAttributions.explanation.attributions.pop(); // 16 items
    mockAxios.mockResponse = truncatedAttributions;

    let caughtTruncated = false;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caughtTruncated = err instanceof AppError && err.statusCode === 502;
    }
    assert(caughtTruncated, '7.2 Attributions array length !== 17 rejected as 502 Bad Gateway');

    // 7.3 Missing model block
    const missingModel = createValidPythonResponse() as any;
    delete missingModel.model;
    mockAxios.mockResponse = missingModel;

    let caughtMissingModel = false;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caughtMissingModel = err instanceof AppError && err.statusCode === 502;
    }
    assert(caughtMissingModel, '7.3 Missing model block rejected as 502 Bad Gateway');
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Invalid predicted class or margin rejected
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: Invalid Predicted Class & Margin Rejection ---');
  {
    // 8.1 predicted_class = 2 (must be 0 or 1)
    const invalidClass = createValidPythonResponse() as any;
    invalidClass.prediction.predicted_class = 2;
    mockAxios.mockResponse = invalidClass;

    let caughtInvalidClass = false;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caughtInvalidClass = err instanceof AppError && err.statusCode === 502;
    }
    assert(caughtInvalidClass, '8.1 predicted_class = 2 rejected as 502 Bad Gateway');

    // 8.2 raw_decision_margin = NaN
    const nanMargin = createValidPythonResponse() as any;
    nanMargin.prediction.raw_decision_margin = 'not-a-number';
    mockAxios.mockResponse = nanMargin;

    let caughtNanMargin = false;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caughtNanMargin = err instanceof AppError && err.statusCode === 502;
    }
    assert(caughtNanMargin, '8.2 Non-numeric raw_decision_margin rejected as 502 Bad Gateway');
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Timeout and HTTP 408 normalization
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9: Timeout & HTTP 408 Normalization ---');
  {
    // 9.1 ECONNABORTED
    mockAxios.mockError = {
      isAxiosError: true,
      code: 'ECONNABORTED',
      message: 'timeout of 8000ms exceeded',
    };

    let caughtTimeout = false;
    let timeoutMessage = '';
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caughtTimeout = err instanceof AppError && err.statusCode === 503;
      timeoutMessage = err.message;
    }
    assert(caughtTimeout, '9.1 ECONNABORTED mapped to 503 Service Unavailable');
    assert(timeoutMessage.includes('timed out after 8000ms'), '9.2 Timeout message indicates 8000ms bound');

    // 9.2 HTTP 408
    mockAxios.mockError = {
      isAxiosError: true,
      response: {
        status: 408,
        data: {},
      },
    };

    let caught408 = false;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caught408 = err instanceof AppError && err.statusCode === 503;
    }
    assert(caught408, '9.3 HTTP 408 Request Timeout mapped to 503 Service Unavailable');
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Connection-refused and network/DNS failure normalization
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10: Connection Failure Normalization ---');
  {
    mockAxios.mockError = {
      isAxiosError: true,
      code: 'ECONNREFUSED',
      request: {}, // Request was made, no response received
      message: 'connect ECONNREFUSED 127.0.0.1:8000',
    };

    let caughtRefused = false;
    let refusedMsg = '';
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caughtRefused = err instanceof AppError && err.statusCode === 503;
      refusedMsg = err.message;
    }
    assert(caughtRefused, '10.1 ECONNREFUSED mapped to 503 Service Unavailable');
    assert(refusedMsg.includes('unreachable'), '10.2 Message clarifies service is unreachable');
  }

  // ---------------------------------------------------------------------------
  // TEST 11: HTTP 422 normalization
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 11: HTTP 422 Contract Rejection Normalization ---');
  {
    mockAxios.mockError = {
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          detail: 'Feature validation failed: consecutive_dry_days_max out of range',
        },
      },
    };

    let caught422 = false;
    let detailPresent = false;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caught422 = err instanceof AppError && err.statusCode === 400;
      detailPresent = err.message.includes('consecutive_dry_days_max out of range');
    }
    assert(caught422, '11.1 HTTP 422 mapped to 400 Bad Request domain error');
    assert(detailPresent, '11.2 Error message contains clean upstream detail');
  }

  // ---------------------------------------------------------------------------
  // TEST 12: HTTP 503 normalization
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 12: HTTP 503 Service Unavailable Normalization ---');
  {
    mockAxios.mockError = {
      isAxiosError: true,
      response: {
        status: 503,
        data: {
          detail: 'Model artifacts unavailable or model service not initialized.',
        },
      },
    };

    let caught503 = false;
    let serviceUnreadyMsg = false;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caught503 = err instanceof AppError && err.statusCode === 503;
      serviceUnreadyMsg = err.message.includes('Model artifacts unavailable');
    }
    assert(caught503, '12.1 HTTP 503 preserved as 503 Service Unavailable');
    assert(serviceUnreadyMsg, '12.2 Clean detail message preserved in 503 AppError');
  }

  // ---------------------------------------------------------------------------
  // TEST 13: HTTP 500 and unexpected upstream failures sanitized
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 13: HTTP 500 Sanitization (No Stack Trace Leaks) ---');
  {
    const sensitiveStackTrace =
      'Traceback (most recent call last):\n  File "E:\\AgriShield\\ml-service\\app\\api\\v1\\predict.py", line 52\nZeroDivisionError: division by zero';
    mockAxios.mockError = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          detail: sensitiveStackTrace,
        },
      },
    };

    let caught500 = false;
    let stackTraceLeaked = true;
    try {
      await client.predict(createValidFeatures());
    } catch (err: any) {
      caught500 = err instanceof AppError && err.statusCode === 502;
      stackTraceLeaked = err.message.includes('Traceback') || err.message.includes('ZeroDivisionError');
    }
    assert(caught500, '13.1 HTTP 500 mapped to 502 Bad Gateway');
    assert(!stackTraceLeaked, '13.2 Upstream Python traceback and file paths completely sanitized');
  }

  // ---------------------------------------------------------------------------
  // TEST 14: No automatic retries occur
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 14: Zero Automatic Retries Audit ---');
  {
    mockAxios.callCount = 0;
    mockAxios.mockError = {
      isAxiosError: true,
      response: { status: 500, data: {} },
    };

    try {
      await client.predict(createValidFeatures());
    } catch {
      // Expected
    }

    assert(mockAxios.callCount === 1, '14.1 Failed request dispatched exactly once (zero retry loops)');
  }

  // ---------------------------------------------------------------------------
  // TEST 15: Zero dependency on Module 6 or database persistence
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 15: Module 6 & Database Decoupling Audit ---');
  {
    const clientSourcePath = path.resolve('src/providers/mlHttp.client.ts');
    const validatorSourcePath = path.resolve('src/validators/mlPredictionResponse.validator.ts');

    const clientCode = fs.readFileSync(clientSourcePath, 'utf-8');
    const validatorCode = fs.readFileSync(validatorSourcePath, 'utf-8');

    // Strip comments to inspect executable code tokens
    const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    const cleanClientCode = stripComments(clientCode);
    const cleanValidatorCode = stripComments(validatorCode);

    const hasModule6Import =
      /import\s+.*from\s+['"].*climateRiskRuleEngine.*['"]/.test(clientCode) ||
      /import\s+.*from\s+['"].*climateRiskRuleEngine.*['"]/.test(validatorCode) ||
      cleanClientCode.includes('climateRiskRuleEngine') ||
      cleanValidatorCode.includes('climateRiskRuleEngine');

    const hasPrismaImport =
      /import\s+.*from\s+['"].*@prisma\/client.*['"]/.test(clientCode) ||
      /import\s+.*from\s+['"].*@prisma\/client.*['"]/.test(validatorCode) ||
      cleanClientCode.includes('@prisma/client') ||
      cleanValidatorCode.includes('@prisma/client');

    const hasPayoutOrClaimImport =
      /import\s+.*from\s+['"].*(policy|claim|payout).*['"]/.test(clientCode) ||
      /import\s+.*from\s+['"].*(policy|claim|payout).*['"]/.test(validatorCode) ||
      cleanClientCode.includes('payout') ||
      cleanClientCode.includes('claim');

    assert(!hasModule6Import, '15.1 Zero import or invocation of climateRiskRuleEngine (Module 6 decoupled)');
    assert(!hasPrismaImport, '15.2 Zero import of @prisma/client (database persistence decoupled)');
    assert(!hasPayoutOrClaimImport, '15.3 Zero import or reference to claims/payouts in transport client');
  }

  // ---------------------------------------------------------------------------
  // TEST 16: predictNdvi dispatch, schema validation, and error handling
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 16: predictNdvi Method Verification ---');
  {
    mockAxios.callCount = 0;
    mockAxios.mockError = null;
    mockAxios.mockResponse = {
      predicted_ndvi: 0.435,
      current_ndvi: 0.42,
      predicted_delta: 0.015,
      forecast_horizon: '7_days',
      target_variable: 'NDVI_next_week',
      baseline_persistence_ndvi: 0.42,
      explanation: {
        base_value: 0.3505,
        reconstructed_prediction: 0.435,
        additivity_error: 0.0000001,
        attributions: CANONICAL_NDVI_FEATURE_NAMES.map((name) => ({
          feature_name: name,
          feature_value: 0.42,
          shap_value: 0.005,
          direction: 'increases vegetation health forecast (+)',
          contribution_magnitude: 0.005,
        })),
      },
      model: {
        model_name: 'AgriVision-NDVI-Forecast-HGB',
        model_version: '1.0.0',
        feature_contract_version: 'v1.0-ndvi-29',
        feature_count: 29,
      },
      disclaimer: 'Advisory NDVI forecast disclaimer',
    };

    const validNdviPayload: NdviFeaturePayload = {
      NDVI: 0.42,
      Rainfall_Current: 12.5,
      Temperature_Current: 28.4,
      NDVI_lag_1: 0.41,
      NDVI_lag_2: 0.39,
      NDVI_lag_3: 0.38,
      NDVI_lag_4: 0.36,
      NDVI_lag_8: 0.35,
      NDVI_change_1w: 0.01,
      NDVI_change_2w: 0.03,
      NDVI_change_4w: 0.06,
      Rainfall_lag_1: 8.0,
      Rainfall_lag_2: 0.0,
      Rainfall_lag_4: 15.0,
      Rainfall_rolling_2w: 20.5,
      Rainfall_rolling_4w: 45.0,
      Rainfall_rolling_8w: 98.0,
      Temperature_lag_1: 29.0,
      Temperature_lag_2: 29.5,
      Temperature_lag_4: 30.1,
      Temperature_rolling_2w: 28.8,
      Temperature_rolling_4w: 29.2,
      Temperature_rolling_8w: 29.8,
      Week_Sin: 0.5,
      Week_Cos: 0.866,
      Month_Sin: 0.5,
      Month_Cos: 0.866,
      Latitude: 19.75,
      Longitude: 75.71,
    };

    const res = await client.predictNdvi(validNdviPayload);

    assert(mockAxios.lastMethod === 'POST', '16.1 HTTP method is strictly POST');
    assert(mockAxios.lastUrl === '/predict/ndvi', '16.2 Endpoint path is strictly /predict/ndvi');
    assert(res.predicted_ndvi === 0.435, '16.3 predicted_ndvi parsed correctly');
    assert(res.explanation.attributions.length === 29, '16.4 exactly 29 feature attributions returned');
    assert(res.target_variable === 'NDVI_next_week', '16.5 target_variable is NDVI_next_week');

    // Reject extra forbidden fields
    const invalidNdviPayload = { ...validNdviPayload, extra_field: 123 } as any;
    let caughtExtra = false;
    try {
      await client.predictNdvi(invalidNdviPayload);
    } catch (err: any) {
      caughtExtra = err instanceof AppError && err.statusCode === 400;
    }
    assert(caughtExtra, '16.6 Extra injected field rejected before transmission (HTTP 400)');
  }

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed across all 16 test checkpoints`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMLHttpClientUnitTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
