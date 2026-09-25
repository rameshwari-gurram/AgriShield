/**
 * Module 6 Stage 6: Unit Test Suite
 * Tests RiskRuleService, Portfolio Risk Summary aggregation, FarmStatus.ACTIVE filtering,
 * deterministic tie-breaker selection, and mathematical invariants.
 */

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
} from '../src/types/risk.types.js';
import { IFarmRepository } from '../src/types/farm.types.js';
import { IWeatherRepository } from '../src/types/weather.types.js';
import { Farm, FarmStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

// =============================================================================
// MOCK REPOSITORIES
// =============================================================================

export interface MockHistoricalAssessment extends RiskAssessmentWithEvents {
  farmStatus?: FarmStatus;
}

class MockRiskRepository implements IRiskRepository {
  public activeRules: RiskRule[] = [];
  public latestAssessments: RiskAssessmentWithEvents[] = [];
  public allAssessments: MockHistoricalAssessment[] = [];

  async findActiveRules(): Promise<RiskRule[]> {
    return [...this.activeRules].sort((a, b) => a.code.localeCompare(b.code));
  }

  async findRuleByCode(code: string): Promise<RiskRule | null> {
    return this.activeRules.find((r) => r.code === code) || null;
  }

  async createAssessmentWithEvents(
    _assessmentData: CreateRiskAssessmentInput,
    _eventsData: CreateRiskEventInput[]
  ): Promise<RiskAssessmentWithEvents> {
    throw new Error('Not implemented for unit tests');
  }

  async findAssessmentById(_id: string): Promise<RiskAssessmentWithEvents | null> {
    return null;
  }

  async findAssessmentsByFarmId(_farmId: string, _limit?: number): Promise<RiskAssessmentWithEvents[]> {
    return [];
  }

  /**
   * If allAssessments is provided, accurately simulates PostgreSQL query:
   * SELECT DISTINCT ON (a.farm_id) a.id
   * FROM risk_assessments a
   * JOIN farms f ON a.farm_id = f.id
   * WHERE f.status::text = 'ACTIVE'
   * ORDER BY a.farm_id, a.assessed_at DESC, a.created_at DESC, a.id DESC;
   */
  async getLatestAssessmentsForActiveFarms(): Promise<RiskAssessmentWithEvents[]> {
    if (this.allAssessments.length > 0) {
      // Filter: WHERE f.status = 'ACTIVE'
      const activeAssessments = this.allAssessments.filter(
        (a) => !a.farmStatus || a.farmStatus === FarmStatus.ACTIVE
      );

      // Order: a.farm_id, a.assessed_at DESC, a.created_at DESC, a.id DESC
      const sorted = [...activeAssessments].sort((a, b) => {
        if (a.farmId !== b.farmId) return a.farmId.localeCompare(b.farmId);
        const timeDiff = new Date(b.assessedAt).getTime() - new Date(a.assessedAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        const createdDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (createdDiff !== 0) return createdDiff;
        return b.id.localeCompare(a.id);
      });

      // DISTINCT ON (a.farm_id)
      const seenFarms = new Set<string>();
      const distinct: RiskAssessmentWithEvents[] = [];
      for (const item of sorted) {
        if (!seenFarms.has(item.farmId)) {
          seenFarms.add(item.farmId);
          distinct.push(item);
        }
      }
      return distinct;
    }
    return this.latestAssessments;
  }
}

class MockFarmRepository implements IFarmRepository {
  public activeCount: number = 0;

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

async function runStage6UnitTests() {
  console.log('🧪 Running Module 6 Stage 6: Unit Tests...\n');

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

  // ---------------------------------------------------------------------------
  // Part A: Risk Rule Service Tests
  // ---------------------------------------------------------------------------
  console.log('--- Part A: Risk Rule Service Tests ---');

  mockRiskRepo.activeRules = [
    {
      id: 'rule-1',
      code: 'HEAVY_RAINFALL_24H',
      name: 'Heavy Rainfall - 24 Hour',
      description: 'IMD rainfall classification >= 64.5 mm',
      hazardType: 'HEAVY_RAINFALL',
      measurement: 'RAINFALL',
      threshold: new Prisma.Decimal(64.5),
      thresholdUnit: 'MM',
      observationWindow: '24_HOURS',
      severity: RiskSeverity.HIGH,
      sourceType: RiskSourceType.OFFICIAL_REFERENCE,
      sourceReference: 'India Meteorological Department (IMD)',
      isActive: true,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    },
    {
      id: 'rule-2',
      code: 'EXTREME_RAINFALL_24H',
      name: 'Extremely Heavy Rainfall - 24 Hour',
      description: 'IMD rainfall classification >= 204.5 mm',
      hazardType: 'HEAVY_RAINFALL',
      measurement: 'RAINFALL',
      threshold: new Prisma.Decimal(204.5),
      thresholdUnit: 'MM',
      observationWindow: '24_HOURS',
      severity: RiskSeverity.VERY_HIGH,
      sourceType: RiskSourceType.OFFICIAL_REFERENCE,
      sourceReference: 'India Meteorological Department (IMD)',
      isActive: true,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    },
    {
      id: 'rule-3',
      code: 'INTENSE_RAINFALL_3H',
      name: 'Intense Rainfall - 3 Hour',
      description: 'IMD rainfall intensity >= 20.0 mm',
      hazardType: 'INTENSE_RAINFALL',
      measurement: 'RAINFALL',
      threshold: new Prisma.Decimal(20.0),
      thresholdUnit: 'MM',
      observationWindow: '3_HOURS',
      severity: RiskSeverity.HIGH,
      sourceType: RiskSourceType.OFFICIAL_REFERENCE,
      sourceReference: 'India Meteorological Department (IMD)',
      isActive: true,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
    },
  ];

  const rules = await ruleService.getActiveRules();
  assert(Array.isArray(rules), '1. getActiveRules() returns active rules array');
  assert(rules.length === 3, '2. Returns all 3 seeded active rules');
  assert(rules[0].code === 'EXTREME_RAINFALL_24H', '3. Rules are ordered by code ascending');
  assert(typeof rules[0].threshold === 'number', '4. Converts Prisma Decimal to JavaScript number');
  assert(rules[0].threshold === 204.5, '5. Threshold matches numeric value (204.5)');
  assert(rules[0].thresholdUnit === 'MM', '6. Preserves thresholdUnit contract (strictly "thresholdUnit", not "unit")');
  assert(rules[0].hazardType === 'HEAVY_RAINFALL', '7. Preserves hazardType field in DTO');
  assert(rules[0].measurement === 'RAINFALL', '8. Preserves measurement field in DTO');
  assert(rules[0].severity === 'VERY_HIGH', '9. Supports RiskSeverity.VERY_HIGH in DTO');
  assert(rules[1].severity === 'HIGH', '10. Preserves severity HIGH on HEAVY_RAINFALL_24H');
  assert(rules[0].sourceType === 'OFFICIAL_REFERENCE', '11. Preserves sourceType metadata');
  assert(rules[0].sourceReference === 'India Meteorological Department (IMD)', '12. Preserves sourceReference metadata');

  // ---------------------------------------------------------------------------
  // Part B: Portfolio Risk Summary Tests
  // ---------------------------------------------------------------------------
  console.log('\n--- Part B: Portfolio Risk Summary Tests ---');

  // Scenario 1: Zero active farms
  mockFarmRepo.activeCount = 0;
  mockRiskRepo.latestAssessments = [];
  mockRiskRepo.allAssessments = [];

  let summary = await assessmentService.getPortfolioRiskSummary();
  assert(summary.totalFarms === 0, '13. Zero active farms: totalFarms = 0');
  assert(summary.assessedFarms === 0, '14. Zero active farms: assessedFarms = 0');
  assert(summary.unassessedFarms === 0, '15. Zero active farms: unassessedFarms = 0');
  assert(
    summary.highRiskCount === 0 &&
    summary.moderateRiskCount === 0 &&
    summary.lowRiskCount === 0 &&
    summary.lowRiskUnconfirmedCount === 0,
    '16. Zero active farms: all risk counts = 0'
  );
  assert(typeof summary.generatedAt === 'string', '17. generatedAt timestamp is returned as ISO string');

  // Scenario 2: Active farms exist, but zero assessments
  mockFarmRepo.activeCount = 5;
  summary = await assessmentService.getPortfolioRiskSummary();
  assert(summary.totalFarms === 5, '18. Active farms without assessments: totalFarms = 5');
  assert(summary.assessedFarms === 0, '19. Active farms without assessments: assessedFarms = 0');
  assert(summary.unassessedFarms === 5, '20. Active farms without assessments: unassessedFarms = 5');

  // Scenario 3: Deterministic Latest-Assessment and Invariant Tests
  // Test multiple historical assessments for Farm 1 and FarmStatus filtering!
  mockFarmRepo.activeCount = 6;
  mockRiskRepo.allAssessments = [
    // Farm 1 (Older assessment: LOW risk on 2026-09-23) - MUST BE OVERRIDDEN BY NEWER
    {
      id: 'a1-old',
      farmId: 'farm-1',
      farmStatus: FarmStatus.ACTIVE,
      assessedAt: new Date('2026-09-23T10:00:00Z'),
      overallRisk: RiskLevel.LOW,
      assessmentVersion: '1.0.0',
      ruleCount: 7,
      triggeredRuleCount: 0,
      weatherRecordCount: 24,
      createdAt: new Date('2026-09-23T10:01:00Z'),
      riskEvents: [],
    },
    // Farm 1 (Latest assessment: HIGH risk on 2026-09-25) - MUST BE SELECTED
    {
      id: 'a1-latest',
      farmId: 'farm-1',
      farmStatus: FarmStatus.ACTIVE,
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
          assessmentId: 'a1-latest',
          riskRuleId: 'r1',
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
    // Farm 2: MODERATE risk
    {
      id: 'a2',
      farmId: 'farm-2',
      farmStatus: FarmStatus.ACTIVE,
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
          assessmentId: 'a2',
          riskRuleId: 'r2',
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
    // Farm 3: LOW risk (confirmed, complete data: 24 records)
    {
      id: 'a3',
      farmId: 'farm-3',
      farmStatus: FarmStatus.ACTIVE,
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
          assessmentId: 'a3',
          riskRuleId: 'r1',
          observedValue: new Prisma.Decimal(10.0),
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
    // Farm 4: LOW risk (unconfirmed, incomplete window: 5 records)
    {
      id: 'a4',
      farmId: 'farm-4',
      farmStatus: FarmStatus.ACTIVE,
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
          assessmentId: 'a4',
          riskRuleId: 'r1',
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
    // Farm 5: INACTIVE farm (must be excluded by WHERE f.status = 'ACTIVE')
    {
      id: 'a5',
      farmId: 'farm-5',
      farmStatus: FarmStatus.INACTIVE,
      assessedAt: new Date('2026-09-25T10:00:00Z'),
      overallRisk: RiskLevel.HIGH,
      assessmentVersion: '1.0.0',
      ruleCount: 7,
      triggeredRuleCount: 1,
      weatherRecordCount: 24,
      createdAt: new Date('2026-09-25T10:01:00Z'),
      riskEvents: [],
    },
    // Farm 6: HARVESTED farm (must be excluded by WHERE f.status = 'ACTIVE')
    {
      id: 'a6',
      farmId: 'farm-6',
      farmStatus: FarmStatus.HARVESTED,
      assessedAt: new Date('2026-09-25T10:00:00Z'),
      overallRisk: RiskLevel.MODERATE,
      assessmentVersion: '1.0.0',
      ruleCount: 7,
      triggeredRuleCount: 1,
      weatherRecordCount: 24,
      createdAt: new Date('2026-09-25T10:01:00Z'),
      riskEvents: [],
    },
  ];

  summary = await assessmentService.getPortfolioRiskSummary();

  assert(summary.totalFarms === 6, '21. totalFarms matches active farm count (6 active farms)');
  assert(summary.assessedFarms === 4, '22. assessedFarms matches assessed active count (4 assessed farms, inactive/harvested excluded)');
  assert(summary.unassessedFarms === 2, '23. unassessedFarms = totalFarms - assessedFarms (6 - 4 = 2)');
  assert(summary.highRiskCount === 1, '24. highRiskCount = 1 (Farm 1 latest is HIGH, older LOW ignored; Farm 5 INACTIVE ignored)');
  assert(summary.moderateRiskCount === 1, '25. moderateRiskCount = 1 (Farm 2 is MODERATE; Farm 6 HARVESTED ignored)');
  assert(summary.lowRiskCount === 1, '26. lowRiskCount = 1 (Farm 3, confirmed)');
  assert(summary.lowRiskUnconfirmedCount === 1, '27. lowRiskUnconfirmedCount = 1 (Farm 4, insufficient data)');

  // Verify core invariants
  const assessedSum =
    summary.highRiskCount +
    summary.moderateRiskCount +
    summary.lowRiskCount +
    summary.lowRiskUnconfirmedCount;
  assert(
    summary.assessedFarms === assessedSum,
    '28. Invariant: assessedFarms === highRiskCount + moderateRiskCount + lowRiskCount + lowRiskUnconfirmedCount'
  );
  assert(
    summary.totalFarms === summary.assessedFarms + summary.unassessedFarms,
    '29. Invariant: totalFarms === assessedFarms + unassessedFarms'
  );

  console.log(`\n==================================================`);
  console.log(`Stage 6 Unit Test Results: ${passed} passed, ${failed} failed`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runStage6UnitTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
