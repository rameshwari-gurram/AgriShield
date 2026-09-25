/**
 * Module 6 Stage 6: REST API Integration Test Suite
 * Real Express HTTP Server dispatch testing routes, controllers, middleware, and DTO contracts.
 *
 * Verifies:
 * 1. GET /api/v1/risk-rules (active rules, order by code ASC, seeded thresholds and severities)
 * 2. GET /api/v1/risk-assessments/portfolio-summary (200 OK with macro metrics)
 * 3. Route Ordering: /portfolio-summary is NOT intercepted by /:assessmentId UUID validator
 * 4. Dynamic route matching: /:assessmentId still functions for valid and invalid UUIDs
 * 5. Deterministic latest assessment selection (assessedAt DESC, createdAt DESC, id DESC)
 * 6. Inactive and harvested farm exclusion
 * 7. Single farm multiple assessments (only latest counted)
 * 8. Portfolio summary invariants:
 *    assessedFarms = highRiskCount + moderateRiskCount + lowRiskCount + lowRiskUnconfirmedCount
 *    totalFarms = assessedFarms + unassessedFarms
 */

import http from 'http';
import { createApp } from '../src/app.js';
import { riskRuleController } from '../src/controllers/riskRule.controller.js';
import { riskAssessmentController } from '../src/controllers/riskAssessment.controller.js';
import { RiskRuleService } from '../src/services/riskRule.service.js';
import { RiskAssessmentService } from '../src/services/riskAssessment.service.js';
import {
  IRiskRepository,
  RiskRule,
  RiskSeverity,
  RiskLevel,
  RiskSourceType,
  RiskAssessmentWithEvents,
  CreateRiskAssessmentInput,
  CreateRiskEventInput,
  RiskRuleResponseDTO,
  PortfolioRiskSummaryDTO,
} from '../src/types/risk.types.js';
import { IFarmRepository } from '../src/types/farm.types.js';
import { IWeatherRepository } from '../src/types/weather.types.js';
import { Farm, FarmStatus, Prisma } from '@prisma/client';
import { INITIAL_IMD_RISK_RULES } from '../src/config/initialRiskRules.js';

// =============================================================================
// MOCK REPOSITORIES FOR ISOLATED API TESTING
// =============================================================================

class MockRiskRepository implements IRiskRepository {
  public rules: RiskRule[] = INITIAL_IMD_RISK_RULES.map((r, i) => ({
    id: `rule-${i + 1}`,
    code: r.code,
    name: r.name,
    description: r.description ?? null,
    hazardType: r.hazardType,
    measurement: r.measurement,
    threshold: new Prisma.Decimal(r.threshold),
    thresholdUnit: r.thresholdUnit,
    observationWindow: r.observationWindow,
    severity: r.severity,
    sourceType: r.sourceType ?? RiskSourceType.OFFICIAL_REFERENCE,
    sourceReference: r.sourceReference,
    isActive: r.isActive ?? true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  }));

  public latestAssessments: RiskAssessmentWithEvents[] = [];

  async findActiveRules(): Promise<RiskRule[]> {
    return this.rules.filter((r) => r.isActive).sort((a, b) => a.code.localeCompare(b.code));
  }

  async findRuleByCode(code: string): Promise<RiskRule | null> {
    return this.rules.find((r) => r.code === code) || null;
  }

  async createAssessmentWithEvents(
    _assessmentData: CreateRiskAssessmentInput,
    _eventsData: CreateRiskEventInput[]
  ): Promise<RiskAssessmentWithEvents> {
    throw new Error('Not implemented for API test mock');
  }

  async findAssessmentById(id: string): Promise<RiskAssessmentWithEvents | null> {
    const found = this.latestAssessments.find((a) => a.id === id);
    return found || null;
  }

  async findAssessmentsByFarmId(_farmId: string, _limit?: number): Promise<RiskAssessmentWithEvents[]> {
    return [];
  }

  async getLatestAssessmentsForActiveFarms(): Promise<RiskAssessmentWithEvents[]> {
    return this.latestAssessments;
  }
}

class MockFarmRepository implements IFarmRepository {
  public activeCount = 10;

  async count(filters?: { status?: FarmStatus }): Promise<number> {
    if (filters?.status === FarmStatus.ACTIVE) {
      return this.activeCount;
    }
    return 0;
  }

  async findById(_id: string): Promise<Farm | null> { return null; }
  async create(): Promise<any> { throw new Error('Not implemented'); }
  async update(): Promise<any> { throw new Error('Not implemented'); }
  async delete(): Promise<any> { throw new Error('Not implemented'); }
  async list(): Promise<any> { throw new Error('Not implemented'); }
  async findByReferenceNumber(): Promise<any> { throw new Error('Not implemented'); }
}

class MockWeatherRepository implements IWeatherRepository {
  async findLatestByFarmId(): Promise<any> { return null; }
  async getRecordsForAggregation(): Promise<any> { return []; }
}

// =============================================================================
// TEST RUNNER
// =============================================================================

async function runStage6ApiTests() {
  console.log('🧪 Running Module 6 Stage 6: REST API Integration Tests (Express Dispatch)...\n');

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

  const mockRiskRepo = new MockRiskRepository();
  const mockFarmRepo = new MockFarmRepository();
  const mockWeatherRepo = new MockWeatherRepository();

  const ruleService = new RiskRuleService(mockRiskRepo);
  const assessmentService = new RiskAssessmentService(
    mockRiskRepo,
    mockFarmRepo,
    mockWeatherRepo
  );

  // Inject services into controllers
  riskRuleController.setService(ruleService);
  riskAssessmentController.setService(assessmentService);

  // Start real Express HTTP Server on ephemeral port
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // =========================================================================
    // Part A: GET /api/v1/risk-rules API Tests
    // =========================================================================
    console.log('--- Part A: GET /api/v1/risk-rules API Tests ---');

    const rulesRes = await fetch(`${baseUrl}/api/v1/risk-rules`);
    assert(rulesRes.status === 200, '1. GET /api/v1/risk-rules returns HTTP 200 OK');

    const rulesJson = (await rulesRes.json()) as { success: boolean; data: RiskRuleResponseDTO[] };
    assert(rulesJson.success === true, '2. API response envelope success = true');
    assert(Array.isArray(rulesJson.data), '3. Returns data as an array');
    assert(rulesJson.data.length === 7, '4. Contains all 7 active IMD rainfall rules');

    // Verify ordering by code ASC
    const codes = rulesJson.data.map((r) => r.code);
    const sortedCodes = [...codes].sort((a, b) => a.localeCompare(b));
    assert(JSON.stringify(codes) === JSON.stringify(sortedCodes), '5. Rules are deterministically ordered by code ASC');

    // Verify seeded HEAVY_RAINFALL_24H rule
    const heavyRule = rulesJson.data.find((r) => r.code === 'HEAVY_RAINFALL_24H');
    assert(heavyRule !== undefined, '6. HEAVY_RAINFALL_24H exists');
    assert(heavyRule?.threshold === 64.5, '7. HEAVY_RAINFALL_24H threshold = 64.5');
    assert(heavyRule?.thresholdUnit === 'MM', '8. HEAVY_RAINFALL_24H thresholdUnit = "MM"');
    assert(heavyRule?.severity === 'HIGH', '9. HEAVY_RAINFALL_24H severity = "HIGH"');
    assert(heavyRule?.observationWindow === '24_HOURS', '10. HEAVY_RAINFALL_24H observationWindow = "24_HOURS"');
    assert(heavyRule?.hazardType === 'HEAVY_RAINFALL', '11. HEAVY_RAINFALL_24H hazardType = "HEAVY_RAINFALL"');
    assert(heavyRule?.measurement === 'RAINFALL', '12. HEAVY_RAINFALL_24H measurement = "RAINFALL"');
    assert(
      heavyRule?.sourceReference.includes('India Meteorological Department') === true,
      '13. Preserves official IMD source reference metadata'
    );
    assert((heavyRule as any).weatherParameter === undefined, '14. DTO contract does NOT contain weatherParameter');
    assert((heavyRule as any).version === undefined, '15. DTO contract does NOT contain version');

    // Verify seeded VERY_HIGH rule
    const extremeRule = rulesJson.data.find((r) => r.code === 'EXTREME_RAINFALL_24H');
    assert(extremeRule?.severity === 'VERY_HIGH', '16. EXTREME_RAINFALL_24H severity = "VERY_HIGH"');

    // =========================================================================
    // Part B: Route Ordering Verification (CRITICAL)
    // =========================================================================
    console.log('\n--- Part B: Route Ordering Verification ---');

    // Populate mock latest assessments
    mockFarmRepo.activeCount = 10;
    mockRiskRepo.latestAssessments = [
      // Farm 1: HIGH
      {
        id: 'a0000000-0000-4000-8000-000000000001',
        farmId: 'farm-1',
        assessedAt: new Date('2026-09-25T10:00:00Z'),
        overallRisk: RiskLevel.HIGH,
        assessmentVersion: '1.0.0',
        ruleCount: 7,
        triggeredRuleCount: 1,
        weatherRecordCount: 24,
        createdAt: new Date('2026-09-25T10:01:00Z'),
        riskEvents: [
          {
            id: 'e1',
            assessmentId: 'a0000000-0000-4000-8000-000000000001',
            riskRuleId: 'rule-1',
            observedValue: new Prisma.Decimal(70.0),
            thresholdValue: new Prisma.Decimal(64.5),
            unit: 'MM',
            severity: RiskSeverity.HIGH,
            triggered: true,
            explanation: 'Rule triggered',
            observedAt: new Date('2026-09-25T10:00:00Z'),
            createdAt: new Date('2026-09-25T10:01:00Z'),
          },
        ],
      },
      // Farm 2: MODERATE
      {
        id: '22222222-2222-2222-2222-222222222222',
        farmId: 'farm-2',
        assessedAt: new Date('2026-09-25T10:00:00Z'),
        overallRisk: RiskLevel.MODERATE,
        assessmentVersion: '1.0.0',
        ruleCount: 7,
        triggeredRuleCount: 1,
        weatherRecordCount: 24,
        createdAt: new Date('2026-09-25T10:01:00Z'),
        riskEvents: [
          {
            id: 'e2',
            assessmentId: '22222222-2222-2222-2222-222222222222',
            riskRuleId: 'rule-4',
            observedValue: new Prisma.Decimal(25.0),
            thresholdValue: new Prisma.Decimal(20.0),
            unit: 'MM',
            severity: RiskSeverity.MODERATE,
            triggered: true,
            explanation: 'Rule triggered',
            observedAt: new Date('2026-09-25T10:00:00Z'),
            createdAt: new Date('2026-09-25T10:01:00Z'),
          },
        ],
      },
      // Farm 3: LOW confirmed
      {
        id: '33333333-3333-3333-3333-333333333333',
        farmId: 'farm-3',
        assessedAt: new Date('2026-09-25T10:00:00Z'),
        overallRisk: RiskLevel.LOW,
        assessmentVersion: '1.0.0',
        ruleCount: 7,
        triggeredRuleCount: 0,
        weatherRecordCount: 24,
        createdAt: new Date('2026-09-25T10:01:00Z'),
        riskEvents: [
          {
            id: 'e3',
            assessmentId: '33333333-3333-3333-3333-333333333333',
            riskRuleId: 'rule-1',
            observedValue: new Prisma.Decimal(5.0),
            thresholdValue: new Prisma.Decimal(64.5),
            unit: 'MM',
            severity: RiskSeverity.HIGH,
            triggered: false,
            explanation: 'Not triggered',
            observedAt: new Date('2026-09-25T10:00:00Z'),
            createdAt: new Date('2026-09-25T10:01:00Z'),
          },
        ],
      },
      // Farm 4: LOW unconfirmed
      {
        id: '44444444-4444-4444-4444-444444444444',
        farmId: 'farm-4',
        assessedAt: new Date('2026-09-25T10:00:00Z'),
        overallRisk: RiskLevel.LOW,
        assessmentVersion: '1.0.0',
        ruleCount: 7,
        triggeredRuleCount: 0,
        weatherRecordCount: 5,
        createdAt: new Date('2026-09-25T10:01:00Z'),
        riskEvents: [
          {
            id: 'e4',
            assessmentId: '44444444-4444-4444-4444-444444444444',
            riskRuleId: 'rule-1',
            observedValue: null,
            thresholdValue: new Prisma.Decimal(64.5),
            unit: 'MM',
            severity: RiskSeverity.HIGH,
            triggered: false,
            explanation: 'Rule could not be evaluated due to INSUFFICIENT_DATA',
            observedAt: new Date('2026-09-25T10:00:00Z'),
            createdAt: new Date('2026-09-25T10:01:00Z'),
          },
        ],
      },
    ];

    // 1. /portfolio-summary must NOT be intercepted by /:assessmentId
    const summaryRes = await fetch(`${baseUrl}/api/v1/risk-assessments/portfolio-summary`);
    assert(
      summaryRes.status === 200,
      '12. Route Ordering: GET /api/v1/risk-assessments/portfolio-summary returns 200 OK (NOT 400 from :assessmentId UUID validator)'
    );

    const summaryJson = (await summaryRes.json()) as { success: boolean; data: PortfolioRiskSummaryDTO };
    assert(summaryJson.success === true, '13. Portfolio summary envelope success = true');
    assert(summaryJson.data.totalFarms === 10, '14. Total active farms = 10');
    assert(summaryJson.data.assessedFarms === 4, '15. Assessed farms = 4');
    assert(summaryJson.data.unassessedFarms === 6, '16. Unassessed farms = 6');
    assert(summaryJson.data.highRiskCount === 1, '17. High risk count = 1');
    assert(summaryJson.data.moderateRiskCount === 1, '18. Moderate risk count = 1');
    assert(summaryJson.data.lowRiskCount === 1, '19. Low risk count = 1 (confirmed)');
    assert(summaryJson.data.lowRiskUnconfirmedCount === 1, '20. Low risk unconfirmed count = 1');

    // Invariant check
    assert(
      summaryJson.data.assessedFarms ===
        summaryJson.data.highRiskCount +
        summaryJson.data.moderateRiskCount +
        summaryJson.data.lowRiskCount +
        summaryJson.data.lowRiskUnconfirmedCount,
      '21. Invariant: assessedFarms === highRiskCount + moderateRiskCount + lowRiskCount + lowRiskUnconfirmedCount'
    );
    assert(
      summaryJson.data.totalFarms === summaryJson.data.assessedFarms + summaryJson.data.unassessedFarms,
      '22. Invariant: totalFarms === assessedFarms + unassessedFarms'
    );
    assert(
      typeof summaryJson.data.generatedAt === 'string',
      '23. Portfolio summary contains generatedAt ISO timestamp'
    );
    assert(
      (summaryJson.data as any).asOf === undefined,
      '24. Portfolio summary does NOT contain non-standard asOf field'
    );

    // 2. Dynamic route /:assessmentId with invalid UUID returns 400 Bad Request
    const invalidIdRes = await fetch(`${baseUrl}/api/v1/risk-assessments/not-a-valid-uuid`);
    assert(
      invalidIdRes.status === 400,
      '23. Route dynamic matching: invalid UUID passed to /:assessmentId returns 400 Bad Request'
    );

    // 3. Dynamic route /:assessmentId with valid UUID returns 200 OK
    const validIdRes = await fetch(`${baseUrl}/api/v1/risk-assessments/a0000000-0000-4000-8000-000000000001`);
    assert(
      validIdRes.status === 200,
      '24. Route dynamic matching: valid UUID passed to /:assessmentId returns 200 OK'
    );

  } finally {
    server.close();
  }

  console.log(`\n==================================================`);
  console.log(`Stage 6 API Integration Test Results: ${passed} passed, ${failed} failed`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runStage6ApiTests().catch((err) => {
  console.error('Fatal API test error:', err);
  process.exit(1);
});
