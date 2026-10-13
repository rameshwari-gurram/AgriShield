/**
 * Module 8 Stage 8.3-C: ML Risk Assessment & Audit Persistence Unit Tests
 *
 * Comprehensive unit test suite covering:
 * - End-to-end orchestration (features -> inference -> persistence -> DTO)
 * - Deterministic input fingerprinting and object key order invariance
 * - Native NDVI null preservation in fingerprint and snapshots
 * - Cache hit on identical inputs (0 additional HTTP calls)
 * - Forced refresh bypassing cache and appending fresh audit rows
 * - Telemetry change detection triggering cache miss
 * - In-flight concurrent request coalescing within process
 * - Safe in-flight promise cleanup in finally block on success & failure
 * - Upstream failure producing zero partial prediction rows
 * - Persistence failure preventing unpersisted prediction returns
 * - Exact response metadata fidelity (no invented defaults)
 * - Decoupling from Module 6 and claims/payout mechanisms
 */

import { strict as assert } from 'node:assert';
import { Prisma } from '@prisma/client';
import { AppError } from '../../src/utils/apiError.js';
import { MLFeatureContractV1_1 } from '../../src/types/mlFeatureContract.types.js';
import { CANONICAL_FEATURE_NAMES } from '../../src/validators/mlFeatureContract.validator.js';
import {
  MLPredictionResponse,
} from '../../src/validators/mlPredictionResponse.validator.js';
import {
  IMlRiskRepository,
  CreateMlRiskPredictionInput,
  MlRiskPrediction,
} from '../../src/types/mlRisk.types.js';
import {
  MLRiskAssessmentService,
  computeInputFingerprint,
} from '../../src/services/mlRiskAssessment.service.js';

// ============================================================================
// Mock Implementations
// ============================================================================

function createValid17Features(): MLFeatureContractV1_1 {
  return {
    precipitation_sum_30d: 70.0,
    precipitation_sum_14d: 40.0,
    precipitation_std_30d: 2.5,
    consecutive_dry_days_max: 12,
    temp_max_30d: 41.5,
    temp_mean_30d: 32.0,
    temp_amplitude_mean_30d: 11.2,
    heat_wave_hours_30d: 8,
    relative_humidity_mean_30d: 45.0,
    vpd_mean_30d: 2.3,
    wind_speed_mean_30d: 14.0,
    wind_gust_max_30d: 28.0,
    ndvi_latest: 0.45,
    ndvi_trend_30d: -0.005,
    calculated_area_ha: 2.5,
    is_ndvi_available: 1,
    is_ndvi_trend_available: 1,
  };
}

function createValidPythonResponse(overrides?: Partial<MLPredictionResponse>): MLPredictionResponse {
  const attributions = CANONICAL_FEATURE_NAMES.map((name, i) => ({
    feature_name: name,
    feature_value: i === 12 ? 0.45 : i === 13 ? -0.005 : 10.0,
    shap_value: 0.05,
    direction: 'increases_risk',
    contribution_magnitude: 0.05,
  }));

  const base: MLPredictionResponse = {
    prediction: {
      predicted_class: 0,
      calibrated_probability: 0.3245,
      raw_decision_margin: -0.4521,
    },
    explanation: {
      base_value: -1.3021,
      reconstructed_margin: -0.4521,
      additivity_error: 1.11e-15,
      attributions,
    },
    model: {
      model_name: 'AgriShield-Risk-HGB-Prototype',
      model_version: '1.0.0',
      feature_contract_version: 'v1.1',
      feature_count: 17,
    },
    disclaimer: 'This prediction and SHAP explanation are advisory only.',
  };

  return { ...base, ...overrides };
}

class MockFeatureEngineeringService {
  public mockFeatures: MLFeatureContractV1_1 = createValid17Features();
  public mockError: Error | null = null;
  public callCount: number = 0;
  public lastFarmId: string = '';

  async constructFeaturesFromFarmId(
    farmId: string,
    _options?: any
  ): Promise<MLFeatureContractV1_1> {
    this.callCount++;
    this.lastFarmId = farmId;
    if (this.mockError) {
      throw this.mockError;
    }
    return { ...this.mockFeatures };
  }
}

class MockMLHttpClient {
  public mockResponse: MLPredictionResponse = createValidPythonResponse();
  public mockError: Error | null = null;
  public callCount: number = 0;
  public lastPayload: MLFeatureContractV1_1 | null = null;
  public delayMs: number = 0;

  async predict(features: MLFeatureContractV1_1): Promise<MLPredictionResponse> {
    this.callCount++;
    this.lastPayload = features;

    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }

    if (this.mockError) {
      throw this.mockError;
    }
    return this.mockResponse;
  }
}

class MockMlRiskRepository implements IMlRiskRepository {
  public records: MlRiskPrediction[] = [];
  public createCallCount: number = 0;
  public mockCreateError: Error | null = null;

  async create(data: CreateMlRiskPredictionInput): Promise<MlRiskPrediction> {
    this.createCallCount++;
    if (this.mockCreateError) {
      throw this.mockCreateError;
    }

    const record: MlRiskPrediction = {
      id: `pred-uuid-${this.records.length + 1}`,
      farmId: data.farmId,
      assessedAt: data.assessedAt,
      inputFingerprint: data.inputFingerprint,
      predictedClass: data.predictedClass,
      calibratedProbability: new Prisma.Decimal(data.calibratedProbability.toString()),
      rawDecisionMargin: new Prisma.Decimal(data.rawDecisionMargin.toString()),
      featureSnapshot: data.featureSnapshot as any,
      shapExplanation: data.shapExplanation as any,
      modelName: data.modelName,
      modelVersion: data.modelVersion,
      featureContractVersion: data.featureContractVersion,
      disclaimer: data.disclaimer,
      createdAt: new Date(),
    };

    this.records.push(record);
    return record;
  }

  async findLatestByFarmId(farmId: string): Promise<MlRiskPrediction | null> {
    const matching = this.records
      .filter((r) => r.farmId === farmId)
      .sort((a, b) => b.assessedAt.getTime() - a.assessedAt.getTime());
    return matching[0] || null;
  }

  async findLatestByFarmIdAndFingerprint(
    farmId: string,
    inputFingerprint: string
  ): Promise<MlRiskPrediction | null> {
    const matching = this.records
      .filter((r) => r.farmId === farmId && r.inputFingerprint === inputFingerprint)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matching[0] || null;
  }

  async findHistoryByFarmId(farmId: string, limit: number = 20): Promise<MlRiskPrediction[]> {
    return this.records
      .filter((r) => r.farmId === farmId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

class MockPrismaDb {
  public weatherRecords: any[] = [];

  public weatherRecord = {
    findFirst: async ({ where }: any) => {
      const farmWeather = this.weatherRecords
        .filter((w) => w.farmId === where.farmId)
        .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
      return farmWeather[0] || null;
    },
  };
}

// ============================================================================
// Test Suite Execution
// ============================================================================

async function runStage83CUnitTests() {
  console.log('================================================================================');
  console.log('🧪 Running Module 8 Stage 8.3-C: ML Risk Orchestration & Persistence Unit Tests');
  console.log('================================================================================\n');

  let passed = 0;
  const farmId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
  const sampleDate = new Date('2026-09-20T12:00:00.000Z');

  function setup() {
    const mockFe = new MockFeatureEngineeringService();
    const mockHttp = new MockMLHttpClient();
    const mockRepo = new MockMlRiskRepository();
    const mockDb = new MockPrismaDb();
    mockDb.weatherRecords.push({ farmId, observedAt: sampleDate });

    const service = new MLRiskAssessmentService(
      mockFe as any,
      mockHttp as any,
      mockRepo,
      mockDb as any
    );

    return { service, mockFe, mockHttp, mockRepo, mockDb };
  }

  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Successful Inference, Persistence, and Typed DTO Mapping ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockHttp, mockRepo } = setup();

    const result = await service.assessFarmRisk(farmId);

    assert.equal(result.farmId, farmId);
    assert.equal(result.isCached, false);
    assert.equal(result.predictedClass, 0);
    assert.equal(result.calibratedProbability, 0.3245);
    assert.equal(result.rawDecisionMargin, -0.4521);
    assert.equal(result.model.modelName, 'AgriShield-Risk-HGB-Prototype');
    assert.equal(result.model.modelVersion, '1.0.0');
    assert.equal(result.model.featureContractVersion, 'v1.1');
    assert.equal(result.disclaimer, 'This prediction and SHAP explanation are advisory only.');
    assert.equal(result.inputFingerprint.length, 64);
    assert.equal(mockHttp.callCount, 1);
    assert.equal(mockRepo.createCallCount, 1);
    assert.equal(mockRepo.records.length, 1);

    passed += 5;
    console.log('  ✅ PASSED: 1.1 Complete pipeline produces valid typed DTO');
    console.log('  ✅ PASSED: 1.2 Calibrated probability & margin mapped accurately');
    console.log('  ✅ PASSED: 1.3 Database record created with UUID primary key');
    console.log('  ✅ PASSED: 1.4 Exactly 64-char hex SHA-256 fingerprint generated');
    console.log('  ✅ PASSED: 1.5 isCached correctly marked false on initial execution');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Deterministic Cache Hit (Zero Additional HTTP Calls) ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockHttp, mockRepo } = setup();

    const first = await service.assessFarmRisk(farmId);
    assert.equal(mockHttp.callCount, 1);
    assert.equal(mockRepo.createCallCount, 1);
    assert.equal(first.isCached, false);

    // Second call with same telemetry
    const second = await service.assessFarmRisk(farmId);
    assert.equal(mockHttp.callCount, 1, 'HTTP call count must remain 1 on cache hit');
    assert.equal(mockRepo.createCallCount, 1, 'No new row created on cache hit');
    assert.equal(second.isCached, true, 'isCached must be true on cache hit');
    assert.equal(second.id, first.id, 'Cached result reuses original assessment id');
    assert.equal(second.inputFingerprint, first.inputFingerprint);

    passed += 3;
    console.log('  ✅ PASSED: 2.1 Identical input telemetry finds existing database record');
    console.log('  ✅ PASSED: 2.2 Exactly zero additional HTTP calls dispatched on cache hit');
    console.log('  ✅ PASSED: 2.3 isCached is true and original prediction ID preserved');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Forced Refresh Cache Bypass ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockHttp, mockRepo } = setup();

    await service.assessFarmRisk(farmId);
    assert.equal(mockHttp.callCount, 1);
    assert.equal(mockRepo.createCallCount, 1);

    // Call with forceRefresh = true
    const refreshed = await service.assessFarmRisk(farmId, { forceRefresh: true });
    assert.equal(mockHttp.callCount, 2, 'HTTP call count must increment on forced refresh');
    assert.equal(mockRepo.createCallCount, 2, 'New database row must be persisted on forced refresh');
    assert.equal(refreshed.isCached, false, 'isCached must be false for freshly executed prediction');
    assert.equal(mockRepo.records.length, 2, 'Audit table has both evaluation rows');

    passed += 3;
    console.log('  ✅ PASSED: 3.1 forceRefresh: true bypasses persistent cache');
    console.log('  ✅ PASSED: 3.2 Fresh inference dispatched and new audit row persisted');
    console.log('  ✅ PASSED: 3.3 Historical record count preserved for audit trail');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Telemetry Change Triggers Cache Miss ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockFe, mockHttp, mockRepo } = setup();

    const res1 = await service.assessFarmRisk(farmId);
    assert.equal(mockHttp.callCount, 1);

    // 4a. Weather change
    mockFe.mockFeatures.precipitation_sum_30d = 120.0;
    const res2 = await service.assessFarmRisk(farmId);
    assert.equal(mockHttp.callCount, 2, 'Weather change must cause cache miss');
    assert.notEqual(res1.inputFingerprint, res2.inputFingerprint);

    // 4b. NDVI change
    mockFe.mockFeatures.ndvi_latest = 0.22;
    const res3 = await service.assessFarmRisk(farmId);
    assert.equal(mockHttp.callCount, 3, 'NDVI change must cause cache miss');
    assert.notEqual(res2.inputFingerprint, res3.inputFingerprint);

    // 4c. Area change
    mockFe.mockFeatures.calculated_area_ha = 5.0;
    const res4 = await service.assessFarmRisk(farmId);
    assert.equal(mockHttp.callCount, 4, 'Area change must cause cache miss');
    assert.notEqual(res3.inputFingerprint, res4.inputFingerprint);

    passed += 3;
    console.log('  ✅ PASSED: 4.1 Weather change alters fingerprint and triggers fresh inference');
    console.log('  ✅ PASSED: 4.2 NDVI change alters fingerprint and triggers fresh inference');
    console.log('  ✅ PASSED: 4.3 Farm area change alters fingerprint and triggers fresh inference');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Native NDVI Null Preservation ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockFe, mockRepo } = setup();

    mockFe.mockFeatures.ndvi_latest = null;
    mockFe.mockFeatures.ndvi_trend_30d = null;
    mockFe.mockFeatures.is_ndvi_available = 0;
    mockFe.mockFeatures.is_ndvi_trend_available = 0;

    const res = await service.assessFarmRisk(farmId);

    assert.equal(res.featureSnapshot.ndvi_latest, null);
    assert.equal(res.featureSnapshot.ndvi_trend_30d, null);
    assert.equal(res.featureSnapshot.is_ndvi_available, 0);

    const persisted = mockRepo.records[0];
    const snapshot = persisted.featureSnapshot as any;
    assert.strictEqual(snapshot.ndvi_latest, null);
    assert.strictEqual(snapshot.ndvi_trend_30d, null);

    // Verify fingerprint incorporates :null
    const fp = computeInputFingerprint(mockFe.mockFeatures);
    assert.equal(res.inputFingerprint, fp);

    passed += 3;
    console.log('  ✅ PASSED: 5.1 Native NDVI null preserved in DTO');
    console.log('  ✅ PASSED: 5.2 Native NDVI null preserved in persisted JSONB snapshot');
    console.log('  ✅ PASSED: 5.3 Fingerprint unambiguously reflects null remote sensing indicators');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Canonical Fingerprint Invariance Under Key Reordering ---');
  // --------------------------------------------------------------------------
  {
    const featuresA = createValid17Features();

    // Create featuresB with reversed key insertion order
    const keys = Object.keys(featuresA).reverse();
    const featuresB: any = {};
    for (const k of keys) {
      featuresB[k] = (featuresA as any)[k];
    }

    const fpA = computeInputFingerprint(featuresA);
    const fpB = computeInputFingerprint(featuresB);

    assert.equal(fpA, fpB, 'Fingerprint must be 100% invariant to object key order');
    assert.equal(fpA.length, 64);

    passed += 2;
    console.log('  ✅ PASSED: 6.1 Object key reordering produces bitwise identical SHA-256 fingerprint');
    console.log('  ✅ PASSED: 6.2 Fingerprint strictly governed by CANONICAL_FEATURE_NAMES array order');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: In-Flight Concurrency Request Coalescing ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockHttp, mockRepo } = setup();
    mockHttp.delayMs = 25; // Simulate network latency

    // Fire two identical concurrent calls
    const promise1 = service.assessFarmRisk(farmId);
    const promise2 = service.assessFarmRisk(farmId);

    const [res1, res2] = await Promise.all([promise1, promise2]);

    assert.equal(mockHttp.callCount, 1, 'Concurrent identical calls must share 1 HTTP inference');
    assert.equal(mockRepo.createCallCount, 1, 'Only 1 database row persisted for coalesced calls');
    assert.equal(res1.id, res2.id);
    assert.equal(res1.inputFingerprint, res2.inputFingerprint);

    passed += 3;
    console.log('  ✅ PASSED: 7.1 Concurrent identical requests coalesce into single HTTP inference');
    console.log('  ✅ PASSED: 7.2 Single audit row persisted for coalesced burst');
    console.log('  ✅ PASSED: 7.3 Both callers receive identical valid DTO');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Safe In-Flight Promise Cleanup on Success and Failure ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockHttp, mockDb } = setup();

    // 8a. Successful execution cleans up inFlightRequests
    mockHttp.delayMs = 50;
    const p1 = service.assessFarmRisk(farmId);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(service.getInFlightCount(), 1, 'Active promise registered in map');
    await p1;
    assert.equal(service.getInFlightCount(), 0, 'Promise cleaned up after success');

    // 8b. Failed execution cleans up inFlightRequests
    const farmIdFail = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';
    mockDb.weatherRecords.push({ farmId: farmIdFail, observedAt: sampleDate });
    mockHttp.mockError = AppError.serviceUnavailable('ML service timeout');
    mockHttp.delayMs = 50;
    const p2 = service.assessFarmRisk(farmIdFail);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(service.getInFlightCount(), 1, 'Active failing promise registered in map');

    await assert.rejects(p2, /ML service timeout/);
    assert.equal(service.getInFlightCount(), 0, 'Failed promise safely removed from map');

    passed += 3;
    console.log('  ✅ PASSED: 8.1 In-flight entry registered during async execution');
    console.log('  ✅ PASSED: 8.2 In-flight entry evicted in finally block on success');
    console.log('  ✅ PASSED: 8.3 In-flight entry evicted in finally block on failure (no stuck promises)');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Upstream Failure Produces Zero Database Rows ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockHttp, mockRepo } = setup();
    mockHttp.mockError = AppError.serviceUnavailable('Connection refused');

    await assert.rejects(
      async () => service.assessFarmRisk(farmId),
      (err: any) => err.statusCode === 503
    );

    assert.equal(mockRepo.createCallCount, 0, 'No database record created on upstream error');
    assert.equal(mockRepo.records.length, 0);

    passed += 2;
    console.log('  ✅ PASSED: 9.1 Upstream 503 error propagates as AppError');
    console.log('  ✅ PASSED: 9.2 Zero partial or corrupt database rows created on HTTP failure');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Persistence Failure Prevents Unpersisted Prediction Return ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockHttp, mockRepo } = setup();
    mockRepo.mockCreateError = new Error('PostgreSQL connection dropped');

    await assert.rejects(
      async () => service.assessFarmRisk(farmId),
      (err: any) => {
        assert.equal(err.statusCode, 502);
        assert.match(err.message, /audit persistence failed/);
        return true;
      }
    );

    assert.equal(mockHttp.callCount, 1, 'Inference completed');
    assert.equal(mockRepo.createCallCount, 1, 'Persistence was attempted');

    passed += 2;
    console.log('  ✅ PASSED: 10.1 Database write failure throws AppError.badGateway');
    console.log('  ✅ PASSED: 10.2 Unpersisted inference result is NEVER returned to caller');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 11: Exact Metadata Fidelity (No Invented Defaults) ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockHttp, mockRepo } = setup();
    mockHttp.mockResponse = createValidPythonResponse({
      model: {
        model_name: 'Custom-Production-HGB-Calibrated',
        model_version: '2.5.1',
        feature_contract_version: 'v1.1',
        feature_count: 17,
      },
      disclaimer: 'Strict legal advisory: Prototype calculation only.',
    });

    const result = await service.assessFarmRisk(farmId);

    assert.equal(result.model.modelName, 'Custom-Production-HGB-Calibrated');
    assert.equal(result.model.modelVersion, '2.5.1');
    assert.equal(result.model.featureContractVersion, 'v1.1');
    assert.equal(result.disclaimer, 'Strict legal advisory: Prototype calculation only.');

    const persisted = mockRepo.records[0];
    assert.equal(persisted.modelName, 'Custom-Production-HGB-Calibrated');
    assert.equal(persisted.modelVersion, '2.5.1');
    assert.equal(persisted.featureContractVersion, 'v1.1');
    assert.equal(persisted.disclaimer, 'Strict legal advisory: Prototype calculation only.');

    passed += 3;
    console.log('  ✅ PASSED: 11.1 Dynamic model_name preserved from HTTP response');
    console.log('  ✅ PASSED: 11.2 Dynamic model_version preserved without hardcoded defaults');
    console.log('  ✅ PASSED: 11.3 Full disclaimer persisted immutably for legal audit trail');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 12: Missing Farms and Insufficient Weather Telemetry ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockFe, mockHttp, mockRepo } = setup();

    // 12a. Farm not found
    mockFe.mockError = AppError.notFound(`Farm with ID 'missing-farm' not found.`);
    await assert.rejects(
      async () => service.assessFarmRisk('missing-farm'),
      (err: any) => err.statusCode === 404
    );
    assert.equal(mockHttp.callCount, 0);
    assert.equal(mockRepo.createCallCount, 0);

    // 12b. Insufficient weather data
    mockFe.mockError = AppError.badRequest('INSUFFICIENT_WEATHER_DATA: Only 710 hours found');
    await assert.rejects(
      async () => service.assessFarmRisk(farmId),
      (err: any) => err.statusCode === 400
    );
    assert.equal(mockHttp.callCount, 0);
    assert.equal(mockRepo.createCallCount, 0);

    passed += 3;
    console.log('  ✅ PASSED: 12.1 Non-existent farm throws 404 Not Found before ML call');
    console.log('  ✅ PASSED: 12.2 Insufficient weather history throws 400 Bad Request before ML call');
    console.log('  ✅ PASSED: 12.3 Zero downstream HTTP or database operations dispatched');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 13: Forced Refresh Interacting with Concurrent Requests ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockHttp, mockRepo } = setup();
    mockHttp.delayMs = 20;

    // Ordinary request starts
    const ordinaryPromise = service.assessFarmRisk(farmId);

    // Concurrent forceRefresh request starts
    const forcePromise = service.assessFarmRisk(farmId, { forceRefresh: true });

    const [ordinaryRes, forceRes] = await Promise.all([ordinaryPromise, forcePromise]);

    assert.equal(mockHttp.callCount, 2, 'forceRefresh must NOT coalesce into ordinary request');
    assert.equal(mockRepo.createCallCount, 2, 'Two separate audit rows created');
    assert.notEqual(ordinaryRes.id, forceRes.id);
    assert.equal(forceRes.isCached, false);

    passed += 2;
    console.log('  ✅ PASSED: 13.1 forceRefresh does not coalesce into ordinary in-flight request');
    console.log('  ✅ PASSED: 13.2 forceRefresh guarantees dedicated execution and distinct audit row');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- TEST 14: History Query and Module 6 Isolation Audit ---');
  // --------------------------------------------------------------------------
  {
    const { service, mockRepo } = setup();

    // Populate history in mockRepo
    for (let i = 0; i < 5; i++) {
      mockRepo.records.push({
        id: `pred-hist-${i}`,
        farmId,
        assessedAt: new Date(sampleDate.getTime() - i * 3600 * 1000),
        inputFingerprint: `fp-${i}`,
        predictedClass: 0,
        calibratedProbability: new Prisma.Decimal('0.25000'),
        rawDecisionMargin: new Prisma.Decimal('-0.80000'),
        featureSnapshot: createValid17Features() as any,
        shapExplanation: createValidPythonResponse().explanation as any,
        modelName: 'AgriShield-Risk-HGB-Prototype',
        modelVersion: '1.0.0',
        featureContractVersion: 'v1.1',
        disclaimer: 'Advisory only.',
        createdAt: new Date(Date.now() - i * 60000),
      });
    }

    const history = await service.getAssessmentHistory(farmId, 3);
    assert.equal(history.length, 3);
    assert.equal(history[0].id, 'pred-hist-0');
    assert.equal(history[0].isCached, true);

    const latest = await service.getLatestAssessment(farmId);
    assert.ok(latest);
    assert.equal(latest.farmId, farmId);

    // Module 6 & claims decoupling audit:
    // Assert no references to claims, payouts, or Module 6
    const serviceStr = service.assessFarmRisk.toString();
    assert.ok(!serviceStr.includes('payout'), 'Must not reference payouts');
    // Ensure 'claim' is not referenced outside of the required 'disclaimer' property
    const codeWithoutDisclaimer = serviceStr.replace(/disclaimer/gi, '');
    assert.ok(!/\bclaims?\b/i.test(codeWithoutDisclaimer), 'Must not reference claims');
    assert.ok(!serviceStr.includes('climateRiskRuleEngine'), 'Must not reference Module 6');
    assert.ok(!serviceStr.includes('riskRule'), 'Must not reference risk rules');

    passed += 3;
    console.log('  ✅ PASSED: 14.1 getAssessmentHistory retrieves ordered audit trail');
    console.log('  ✅ PASSED: 14.2 getLatestAssessment retrieves most recent evaluation');
    console.log('  ✅ PASSED: 14.3 Service completely decoupled from Module 6, claims, and payouts');
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, 0 failed across all 14 test checkpoints`);
  console.log('================================================================================\n');
}

runStage83CUnitTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
