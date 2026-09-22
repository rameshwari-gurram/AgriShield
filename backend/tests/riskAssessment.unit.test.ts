/**
 * Module 6 Stage 4: Risk Assessment Service Unit Test Suite
 * Tests service orchestration, deterministic timestamp selection, farm validation,
 * severity-to-risk mapping, insufficient data handling, atomic persistence, and history.
 */

import { RiskAssessmentService } from '../src/services/riskAssessment.service.js';
import {
  IRiskRepository,
  CreateRiskAssessmentInput,
  CreateRiskEventInput,
  RiskAssessmentWithEvents,
  RiskRule,
  RiskSeverity,
  RiskLevel,
  DEFAULT_ASSESSMENT_VERSION,
} from '../src/types/risk.types.js';
import { IFarmRepository } from '../src/types/farm.types.js';
import { IWeatherRepository, WeatherAggregationResult } from '../src/types/weather.types.js';
import { WeatherAggregationService } from '../src/services/weatherAggregation.service.js';
import { ClimateRiskRuleEngine } from '../src/services/climateRiskRuleEngine.service.js';
import { AppError } from '../src/utils/apiError.js';
import { Farm, WeatherRecord } from '@prisma/client';
import { INITIAL_IMD_RISK_RULES } from '../src/config/initialRiskRules.js';

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

class MockFarmRepository implements IFarmRepository {
  public farms: Map<string, Farm> = new Map();

  async findById(id: string): Promise<Farm | null> {
    return this.farms.get(id) || null;
  }
  async create(): Promise<any> { throw new Error('Not implemented'); }
  async update(): Promise<any> { throw new Error('Not implemented'); }
  async delete(): Promise<any> { throw new Error('Not implemented'); }
  async list(): Promise<any> { throw new Error('Not implemented'); }
  async count(): Promise<number> { return this.farms.size; }
  async findByReferenceNumber(): Promise<any> { throw new Error('Not implemented'); }
}

class MockWeatherRepository implements IWeatherRepository {
  public records: WeatherRecord[] = [];

  async findLatestByFarmId(farmId: string): Promise<WeatherRecord | null> {
    const matching = this.records
      .filter((r) => r.farmId === farmId)
      .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime());
    return matching[0] || null;
  }
  async getRecordsForAggregation(farmId: string, startTime: Date, endTime: Date): Promise<WeatherRecord[]> {
    return this.records.filter(
      (r) =>
        r.farmId === farmId &&
        new Date(r.observedAt).getTime() >= startTime.getTime() &&
        new Date(r.observedAt).getTime() <= endTime.getTime()
    );
  }
  async countByFarmId(): Promise<number> { return this.records.length; }
  async upsert(): Promise<any> { throw new Error('Not implemented'); }
  async upsertMany(): Promise<any> { throw new Error('Not implemented'); }
  async findHistoricalByFarmId(): Promise<any> { throw new Error('Not implemented'); }
}

class MockRiskRepository implements IRiskRepository {
  public rules: RiskRule[] = [];
  public assessments: RiskAssessmentWithEvents[] = [];
  public shouldFailTransaction = false;
  public lastAssessmentInput: CreateRiskAssessmentInput | null = null;
  public lastEventsInput: CreateRiskEventInput[] | null = null;

  async findActiveRules(): Promise<RiskRule[]> {
    return this.rules
      .filter((r) => r.isActive !== false)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  async findRuleByCode(code: string): Promise<RiskRule | null> {
    return this.rules.find((r) => r.code === code) || null;
  }

  async createAssessmentWithEvents(
    assessmentData: CreateRiskAssessmentInput,
    eventsData: CreateRiskEventInput[]
  ): Promise<RiskAssessmentWithEvents> {
    if (this.shouldFailTransaction) {
      throw new Error('Simulated transaction database failure during event creation');
    }

    this.lastAssessmentInput = assessmentData;
    this.lastEventsInput = eventsData;

    const assessmentId = `00000000-0000-4000-8000-${String(this.assessments.length + 1).padStart(12, '0')}`;
    const assessment: RiskAssessmentWithEvents = {
      id: assessmentId,
      farmId: assessmentData.farmId,
      assessedAt: assessmentData.assessedAt,
      overallRisk: assessmentData.overallRisk,
      assessmentVersion: assessmentData.assessmentVersion ?? DEFAULT_ASSESSMENT_VERSION,
      ruleCount: assessmentData.ruleCount,
      triggeredRuleCount: assessmentData.triggeredRuleCount,
      weatherRecordCount: assessmentData.weatherRecordCount,
      createdAt: new Date(),
      riskEvents: eventsData.map((e, idx) => {
        const rule = this.rules.find((r) => r.id === e.riskRuleId);
        return {
          id: `00000000-0000-4000-9000-${String(idx + 1).padStart(12, '0')}`,
          assessmentId,
          riskRuleId: e.riskRuleId,
          observedValue: e.observedValue as any,
          thresholdValue: e.thresholdValue as any,
          unit: e.unit,
          severity: e.severity,
          triggered: e.triggered,
          explanation: e.explanation,
          observedAt: e.observedAt,
          createdAt: new Date(),
          riskRule: rule,
        };
      }),
    };

    this.assessments.push(assessment);
    return assessment;
  }

  async findAssessmentById(id: string): Promise<RiskAssessmentWithEvents | null> {
    return this.assessments.find((a) => a.id === id) || null;
  }

  async findAssessmentsByFarmId(farmId: string, limit?: number): Promise<RiskAssessmentWithEvents[]> {
    const matching = this.assessments
      .filter((a) => a.farmId === farmId)
      .sort((a, b) => new Date(b.assessedAt).getTime() - new Date(a.assessedAt).getTime());
    return limit ? matching.slice(0, limit) : matching;
  }
}

// =============================================================================
// TEST SUITE EXECUTION
// =============================================================================

async function runRiskAssessmentUnitTests() {
  console.log('🧪 Running Module 6 Stage 4: Risk Assessment Service Unit Tests...\n');

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

  const validFarmId = '11111111-1111-4111-8111-111111111111';
  const unknownFarmId = '22222222-2222-4222-8222-222222222222';

  // Seed default IMD rules for mocks
  const defaultRules: RiskRule[] = INITIAL_IMD_RISK_RULES.map((r, idx) => ({
    id: `rule-uuid-${idx + 1}`,
    code: r.code,
    name: r.name,
    description: r.description || null,
    hazardType: r.hazardType,
    measurement: r.measurement,
    threshold: r.threshold as any,
    thresholdUnit: r.thresholdUnit,
    observationWindow: r.observationWindow,
    severity: r.severity,
    sourceType: r.sourceType || 'OFFICIAL_REFERENCE',
    sourceReference: r.sourceReference,
    isActive: r.isActive ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  // Helper setup
  const createTestEnv = () => {
    const farmRepo = new MockFarmRepository();
    const weatherRepo = new MockWeatherRepository();
    const riskRepo = new MockRiskRepository();
    riskRepo.rules = defaultRules.map((r) => ({ ...r }));

    const mockFarm: Farm = {
      id: validFarmId,
      farmerId: 'farmer-uuid',
      farmName: 'Green Valley Farm',
      farmReferenceNumber: 'AGRI-FRM-20260922-0001',
      cropName: 'Soybean',
      farmArea: 5.0 as any,
      areaUnit: 'ACRE',
      status: 'ACTIVE',
      sowingDate: new Date('2026-06-15'),
      expectedHarvestDate: new Date('2026-10-15'),
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    farmRepo.farms.set(validFarmId, mockFarm);

    const aggregationService = new WeatherAggregationService(weatherRepo as any, farmRepo as any);
    const ruleEngine = new ClimateRiskRuleEngine();
    const service = new RiskAssessmentService(
      riskRepo,
      farmRepo as any,
      weatherRepo as any,
      aggregationService,
      ruleEngine
    );

    return { farmRepo, weatherRepo, riskRepo, aggregationService, ruleEngine, service };
  };

  // ---------------------------------------------------------------------------
  // 1 & 2. Farm Validation
  // ---------------------------------------------------------------------------
  {
    const { service } = createTestEnv();
    try {
      await service.assessFarmRisk(unknownFarmId);
      assert(false, '1. Unknown farm should throw 404 AppError');
    } catch (err: any) {
      assert(err instanceof AppError && err.statusCode === 404, '1. Unknown farm throws 404 Not Found error');
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Farm with No Weather Data
  // ---------------------------------------------------------------------------
  {
    const { service } = createTestEnv();
    try {
      await service.assessFarmRisk(validFarmId);
      assert(false, '3. Farm with no weather records should throw domain error');
    } catch (err: any) {
      assert(
        err instanceof AppError && (err.statusCode === 404 || err.statusCode === 400),
        '3. Farm with no weather records throws clear domain error'
      );
    }
  }

  // Helper to generate 24 consecutive hourly records
  const generate24HourlyRecords = (farmId: string, endUtc: string, rainfallPerHour: number = 0) => {
    const records: WeatherRecord[] = [];
    const endMs = new Date(endUtc).getTime();
    for (let i = 23; i >= 0; i--) {
      const observedAt = new Date(endMs - i * 3600 * 1000);
      records.push({
        id: `rec-${i}`,
        farmId,
        observedAt,
        latitude: 18.52 as any,
        longitude: 73.85 as any,
        temperatureC: 28.5 as any,
        humidityPercent: 65 as any,
        rainfallMm: rainfallPerHour as any,
        windSpeedKmh: 15.0 as any,
        windGustKmh: 25.0 as any,
        weatherCode: 61,
        source: 'Open-Meteo',
        createdAt: new Date(),
      });
    }
    return records;
  };

  // ---------------------------------------------------------------------------
  // 4, 5, 30, 40. Deterministic Reference Time (Latest WeatherRecord observedAt)
  // ---------------------------------------------------------------------------
  {
    const { service, weatherRepo } = createTestEnv();
    const historicalTime = '2026-09-22T08:00:00.000Z';
    weatherRepo.records = generate24HourlyRecords(validFarmId, historicalTime, 0);

    const result = await service.assessFarmRisk(validFarmId);
    assert(result.assessedAt === historicalTime, '4. Latest weather observation timestamp used as assessedAt');
    assert(result.assessedAt !== new Date().toISOString(), '5. Arbitrary machine clock (new Date()) NOT used as assessment time');
  }

  // ---------------------------------------------------------------------------
  // 6, 7, 8. Only Active Rules Evaluated
  // ---------------------------------------------------------------------------
  {
    const { service, weatherRepo, riskRepo } = createTestEnv();
    weatherRepo.records = generate24HourlyRecords(validFarmId, '2026-09-22T10:00:00.000Z', 0);

    // Inactivate one rule
    riskRepo.rules[0].isActive = false;

    const result = await service.assessFarmRisk(validFarmId);
    assert(result.ruleCount === 6, '6. Only active rules are evaluated (got 6 active rules)');
    assert(!result.events.some((e) => e.riskRuleId === riskRepo.rules[0].id), '7. Inactive rule was ignored');
    assert(result.events.length === 6, '8. Correct ruleCount in DTO and event list');
  }

  // ---------------------------------------------------------------------------
  // 9. No Triggered Rules → LOW
  // ---------------------------------------------------------------------------
  {
    const { service, weatherRepo } = createTestEnv();
    weatherRepo.records = generate24HourlyRecords(validFarmId, '2026-09-22T10:00:00.000Z', 0);

    const result = await service.assessFarmRisk(validFarmId);
    assert(result.overallRisk === 'LOW', '9. Zero rainfall across complete window produces overallRisk = LOW');
    assert(result.triggeredRuleCount === 0, '9.2 triggeredRuleCount is 0');
  }

  // ---------------------------------------------------------------------------
  // 10, 11, 12, 13. Severity-to-Risk Mapping
  // ---------------------------------------------------------------------------
  {
    const { service } = createTestEnv();
    assert(service.calculateOverallRisk([]) === 'LOW', '10.1 Empty triggered list maps to LOW');
    assert(service.calculateOverallRisk(['LOW']) === 'LOW', '10.2 LOW severity maps to RiskLevel.LOW');
    assert(service.calculateOverallRisk(['MODERATE']) === 'MODERATE', '11. MODERATE severity maps to RiskLevel.MODERATE');
    assert(service.calculateOverallRisk(['HIGH']) === 'HIGH', '12. HIGH severity maps to RiskLevel.HIGH');
    assert(service.calculateOverallRisk(['VERY_HIGH']) === 'HIGH', '13. VERY_HIGH severity maps to RiskLevel.HIGH');
  }

  // ---------------------------------------------------------------------------
  // 14, 15, 16, 17, 18. Mixed Severities (Highest Takes Precedence)
  // ---------------------------------------------------------------------------
  {
    const { service } = createTestEnv();
    assert(service.calculateOverallRisk(['LOW', 'MODERATE']) === 'MODERATE', '14. LOW + MODERATE maps to MODERATE');
    assert(service.calculateOverallRisk(['MODERATE', 'HIGH']) === 'HIGH', '15. MODERATE + HIGH maps to HIGH');
    assert(service.calculateOverallRisk(['HIGH', 'VERY_HIGH']) === 'HIGH', '16. HIGH + VERY_HIGH maps to HIGH');
    assert(service.calculateOverallRisk(['LOW', 'VERY_HIGH']) === 'HIGH', '17. LOW + VERY_HIGH maps to HIGH');
    assert(service.calculateOverallRisk(['LOW', 'MODERATE', 'HIGH']) === 'HIGH', '18. Multiple triggered rules prioritize highest severity');
  }

  // ---------------------------------------------------------------------------
  // 16 & 17 (Prompt). Insufficient Data Handling
  // ---------------------------------------------------------------------------
  {
    const { service, weatherRepo } = createTestEnv();
    // Only 2 records (incomplete window)
    const refTime = '2026-09-22T10:00:00.000Z';
    weatherRepo.records = [
      {
        id: 'rec-1',
        farmId: validFarmId,
        observedAt: new Date('2026-09-22T09:00:00.000Z'),
        latitude: 18.52 as any,
        longitude: 73.85 as any,
        temperatureC: 30 as any,
        humidityPercent: 60 as any,
        rainfallMm: 0 as any,
        windSpeedKmh: 10 as any,
        windGustKmh: 15 as any,
        weatherCode: 0,
        source: 'Open-Meteo',
        createdAt: new Date(),
      },
      {
        id: 'rec-2',
        farmId: validFarmId,
        observedAt: new Date('2026-09-22T10:00:00.000Z'),
        latitude: 18.52 as any,
        longitude: 73.85 as any,
        temperatureC: 30 as any,
        humidityPercent: 60 as any,
        rainfallMm: 0 as any,
        windSpeedKmh: 10 as any,
        windGustKmh: 15 as any,
        weatherCode: 0,
        source: 'Open-Meteo',
        createdAt: new Date(),
      },
    ];

    const result = await service.assessFarmRisk(validFarmId);
    assert(result.hasInsufficientDataCoverage === true, '16. Incomplete window marks hasInsufficientDataCoverage = true');
    assert(result.overallRisk === 'LOW', '17.1 No triggers + incomplete data persists overallRisk = LOW');
    assert(result.summary.includes('incomplete'), '17.2 Assessment summary explicitly notes coverage limitation');

    const insufficientEvents = result.events.filter((e) => e.status === 'INSUFFICIENT_DATA');
    assert(insufficientEvents.length > 0, '17.3 Events contain INSUFFICIENT_DATA status');
    assert(insufficientEvents[0].triggered === false, '17.4 Insufficient data event has triggered = false');
    assert(insufficientEvents[0].observedValue === null, '17.5 Insufficient data event has observedValue = null');
  }

  // ---------------------------------------------------------------------------
  // 18, 19, 20, 21, 22. Counts and Assessment Fields
  // ---------------------------------------------------------------------------
  {
    const { service, weatherRepo } = createTestEnv();
    weatherRepo.records = generate24HourlyRecords(validFarmId, '2026-09-22T12:00:00.000Z', 3.0); // 72 mm total rain

    const result = await service.assessFarmRisk(validFarmId);
    assert(result.ruleCount === 7, '21. ruleCount equals active rules count (7)');
    assert(result.triggeredRuleCount === 1, '22. triggeredRuleCount equals 1 (HEAVY_RAINFALL_24H triggered)');
    assert(result.weatherRecordCount === 24, '23. weatherRecordCount equals 24');
    assert(result.assessmentVersion === '1.0.0', '29. assessmentVersion is strictly "1.0.0"');
    assert(result.events.length === 7, '24. Exactly 7 RiskEvent DTOs returned');
  }

  // ---------------------------------------------------------------------------
  // 25, 26, 27, 28. Event Triggered and Non-Triggered Fields
  // ---------------------------------------------------------------------------
  {
    const { service, weatherRepo } = createTestEnv();
    weatherRepo.records = generate24HourlyRecords(validFarmId, '2026-09-22T12:00:00.000Z', 3.0); // 72 mm -> Heavy Rainfall

    const result = await service.assessFarmRisk(validFarmId);
    const heavyEvent = result.events.find((e) => e.ruleCode === 'HEAVY_RAINFALL_24H');
    const veryHeavyEvent = result.events.find((e) => e.ruleCode === 'VERY_HEAVY_RAINFALL_24H');

    assert(heavyEvent?.triggered === true, '25. Triggered event has triggered = true');
    assert(veryHeavyEvent?.triggered === false, '26. Non-triggered event has triggered = false');
    assert(heavyEvent?.thresholdValue === 64.5, '29. Threshold value preserved');
    assert(heavyEvent?.severity === 'HIGH', '30. Severity preserved');
    assert(heavyEvent?.explanation.includes('64.50 MM'), '31. Explanation preserved');
  }

  // ---------------------------------------------------------------------------
  // 31, 32, 33. Repository Persistence & Atomic Transaction Rollback
  // ---------------------------------------------------------------------------
  {
    const { service, weatherRepo, riskRepo } = createTestEnv();
    weatherRepo.records = generate24HourlyRecords(validFarmId, '2026-09-22T12:00:00.000Z', 1.0);

    // Test successful persistence
    const result = await service.assessFarmRisk(validFarmId);
    assert(riskRepo.assessments.length === 1, '31. RiskAssessment saved to repository');
    assert(riskRepo.assessments[0].riskEvents.length === 7, '32. Associated 7 RiskEvents persisted with assessment');

    // Test simulated failure during transaction
    riskRepo.shouldFailTransaction = true;
    try {
      await service.assessFarmRisk(validFarmId);
      assert(false, 'Transaction failure should propagate');
    } catch (err: any) {
      assert(err.message.includes('Simulated transaction database failure'), '35. Transaction failure propagates cleanly');
      assert(riskRepo.assessments.length === 1, '35.2 Assessment count remained 1 (no orphan created on failure)');
    }
  }

  // ---------------------------------------------------------------------------
  // 35, 36, 37. Get Assessment by ID and Assessment History
  // ---------------------------------------------------------------------------
  {
    const { service, weatherRepo, riskRepo } = createTestEnv();
    weatherRepo.records = generate24HourlyRecords(validFarmId, '2026-09-22T08:00:00.000Z', 1.0);
    const first = await service.assessFarmRisk(validFarmId, '2026-09-22T08:00:00.000Z');

    weatherRepo.records = generate24HourlyRecords(validFarmId, '2026-09-22T12:00:00.000Z', 2.0);
    const second = await service.assessFarmRisk(validFarmId, '2026-09-22T12:00:00.000Z');

    // Test getAssessmentById
    const fetched = await service.getAssessmentById(first.id);
    assert(fetched.id === first.id, '36. getAssessmentById successfully retrieved assessment');
    assert(fetched.events.length === 7, '36.2 getAssessmentById includes populated events');

    // Test unknown assessment
    try {
      await service.getAssessmentById('00000000-0000-4000-8000-000000000000');
      assert(false, 'Unknown assessment should throw 404');
    } catch (err: any) {
      assert(err instanceof AppError && err.statusCode === 404, '39. Unknown assessment ID throws 404 AppError');
    }

    // Test getAssessmentsForFarm
    const history = await service.getAssessmentsForFarm(validFarmId);
    assert(history.length === 2, '37. getAssessmentsForFarm returns all farm assessments');
    assert(
      new Date(history[0].assessedAt).getTime() > new Date(history[1].assessedAt).getTime(),
      '38. History returned in descending order (assessedAt DESC)'
    );
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================');
  console.log(`Risk Assessment Unit Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRiskAssessmentUnitTests().catch((err) => {
  console.error('Fatal error during unit tests:', err);
  process.exit(1);
});
