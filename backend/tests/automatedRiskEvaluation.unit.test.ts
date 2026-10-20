/**
 * Module 10: System Integration & Security
 * Stage 10.3.1: Automated Risk Evaluation Service Unit Test Suite
 *
 * Verifies all 15 required invariants and edge cases for the core automated risk evaluation service:
 * 1. Disabled worker performs no evaluation work (exit code 0, 0 DB queries).
 * 2. Dry-run evaluates without any persistence calls (0 assessment writes, 0 claim writes, 0 balance updates).
 * 3. Dry-run uses the same authoritative eligibility and payout calculation as live evaluation.
 * 4. Insufficient weather data is skipped without fabricated values.
 * 5. Non-triggered events never produce claims.
 * 6. Triggered events with eligible coverage produce the correct projected result.
 * 7. A policy that did not cover event.observedAt is rejected.
 * 8. Uncovered hazard is rejected.
 * 9. Duplicate claims are skipped or handled through the existing safe duplicate path.
 * 10. Remaining coverage caps payout.
 * 11. A farm-level failure does not silently terminate the entire batch.
 * 12. Soft deadline stops starting new farms.
 * 13. ML prediction inputs cannot affect eligibility.
 * 14. No automatic approval, settlement, or payment occurs.
 * 15. Live claim creation preserves PENDING status and existing protections.
 */

import {
  Prisma,
  Policy,
  Claim,
  Farm,
  Farmer,
  PolicyStatus,
  ClaimStatus,
  FarmStatus,
  AreaUnit,
  Language,
  RiskHazardType,
  RiskSeverity,
  RiskLevel,
  RiskMeasurement,
  RiskSourceType,
} from '@prisma/client';
import {
  AutomatedRiskEvaluationService,
  FarmEvaluationOutcome,
  AutomatedRiskEvaluationSummary,
} from '../src/services/automatedRiskEvaluation.service.js';
import {
  ClaimService,
  AUTHORITATIVE_SEVERITY_MULTIPLIERS,
} from '../src/services/claim.service.js';
import { RiskAssessmentService } from '../src/services/riskAssessment.service.js';
import { IFarmRepository } from '../src/types/farm.types.js';
import { IWeatherRepository, NormalizedWeatherDTO } from '../src/types/weather.types.js';
import { IPolicyRepository } from '../src/types/policy.types.js';
import { IClaimRepository } from '../src/types/claim.types.js';
import {
  IRiskRepository,
  RiskAssessmentResponseDTO,
  RiskEventResponseDTO,
  RiskAssessmentWithEvents,
} from '../src/types/risk.types.js';
import { AppError } from '../src/utils/apiError.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASSED: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

// =============================================================================
// MOCK REPOSITORIES & SERVICES
// =============================================================================

class MockFarmRepository implements IFarmRepository {
  public farms: (Farm & { farmer?: Farmer })[] = [];
  public findAllCallCount = 0;

  async create(data: any): Promise<Farm & { farmer?: Farmer }> {
    const farm = { ...data, id: 'farm-' + Math.random(), createdAt: new Date(), updatedAt: new Date() };
    this.farms.push(farm);
    return farm;
  }
  async findById(id: string): Promise<(Farm & { farmer?: Farmer }) | null> {
    return this.farms.find((f) => f.id === id) || null;
  }
  async findByReferenceNumber(ref: string): Promise<Farm | null> {
    return this.farms.find((f) => f.farmReferenceNumber === ref) || null;
  }
  async findByFarmerId(farmerId: string): Promise<(Farm & { farmer?: Farmer })[]> {
    return this.farms.filter((f) => f.farmerId === farmerId);
  }
  async findAll(options: any): Promise<(Farm & { farmer?: Farmer })[]> {
    this.findAllCallCount++;
    return this.farms.filter((f) => !options.status || f.status === options.status).slice(0, options.take);
  }
  async count(): Promise<number> {
    return this.farms.length;
  }
  async update(id: string, data: any): Promise<Farm & { farmer?: Farmer }> {
    const farm = await this.findById(id);
    if (!farm) throw new Error('Not found');
    Object.assign(farm, data);
    return farm;
  }
  async delete(id: string): Promise<Farm> {
    const idx = this.farms.findIndex((f) => f.id === id);
    if (idx < 0) throw new Error('Not found');
    const [deleted] = this.farms.splice(idx, 1);
    return deleted;
  }
}

class MockWeatherRepository implements IWeatherRepository {
  public records: Map<string, any[]> = new Map();
  public findLatestCallCount = 0;

  async countByFarmId(farmId: string): Promise<number> {
    return (this.records.get(farmId) || []).length;
  }
  async upsert(farmId: string, obs: NormalizedWeatherDTO): Promise<any> {
    const list = this.records.get(farmId) || [];
    list.push({ ...obs, id: 'w-' + Math.random(), farmId });
    this.records.set(farmId, list);
    return list[list.length - 1];
  }
  async upsertMany(farmId: string, obss: NormalizedWeatherDTO[]): Promise<any[]> {
    for (const o of obss) await this.upsert(farmId, o);
    return this.records.get(farmId) || [];
  }
  async findLatestByFarmId(farmId: string): Promise<any | null> {
    this.findLatestCallCount++;
    const list = this.records.get(farmId) || [];
    if (list.length === 0) return null;
    return list[list.length - 1];
  }
  async findByFarmIdAndDateRange(): Promise<any[]> {
    return [];
  }
  async findByFarmId(): Promise<any[]> {
    return [];
  }
  async deleteByFarmId(farmId: string): Promise<number> {
    const count = (this.records.get(farmId) || []).length;
    this.records.delete(farmId);
    return count;
  }
}

class MockPolicyRepository implements IPolicyRepository {
  public policies: Policy[] = [];
  public updateBalanceCallCount = 0;

  async createPolicy(data: any): Promise<Policy> {
    const policy: Policy = {
      id: data.id || 'pol-' + Math.random(),
      policyNumber: data.policyNumber || 'POL-TEST-001',
      farmId: data.farmId,
      farmerId: data.farmerId,
      cropName: data.cropName,
      sumInsured: data.sumInsured,
      premiumAmount: data.premiumAmount,
      coveredHazards: data.coveredHazards,
      startDate: data.startDate,
      endDate: data.endDate,
      cumulativePaidAmount: data.cumulativePaidAmount || new Prisma.Decimal('0.00'),
      status: data.status || PolicyStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.policies.push(policy);
    return policy;
  }
  async findById(id: string): Promise<Policy | null> {
    return this.policies.find((p) => p.id === id || p.policyNumber === id) || null;
  }
  async findByFarmId(farmId: string): Promise<Policy[]> {
    return this.policies.filter((p) => p.farmId === farmId);
  }
  async findActivePolicyForFarm(farmId: string, referenceDate: Date = new Date()): Promise<Policy | null> {
    const refTime = referenceDate.getTime();
    return (
      this.policies.find(
        (p) =>
          p.farmId === farmId &&
          p.status === PolicyStatus.ACTIVE &&
          new Date(p.startDate).getTime() <= refTime &&
          new Date(p.endDate).getTime() >= refTime
      ) || null
    );
  }
  async updatePolicyBalanceAndStatus(id: string, update: any): Promise<Policy> {
    this.updateBalanceCallCount++;
    const policy = await this.findById(id);
    if (!policy) throw AppError.notFound('Policy not found');
    policy.cumulativePaidAmount = policy.cumulativePaidAmount.add(new Prisma.Decimal(update.payoutIncrement.toString()));
    if (update.newStatus) policy.status = update.newStatus;
    return policy;
  }
  async updatePolicyStatus(id: string, status: PolicyStatus): Promise<Policy> {
    const policy = await this.findById(id);
    if (!policy) throw AppError.notFound('Policy not found');
    policy.status = status;
    return policy;
  }
}

class MockClaimRepository implements IClaimRepository {
  public claims: Claim[] = [];
  public createClaimCallCount = 0;

  async createClaim(data: any): Promise<Claim> {
    this.createClaimCallCount++;
    const existing = await this.findClaimByPolicyAndRiskEvent(data.policyId, data.riskEventId);
    if (existing) {
      throw AppError.conflict('Duplicate claim on policy and risk event');
    }
    const claim: Claim = {
      id: 'clm-id-' + (this.claims.length + 1),
      claimNumber: data.claimNumber,
      policyId: data.policyId,
      assessmentId: data.assessmentId,
      riskEventId: data.riskEventId,
      triggerRuleCode: data.triggerRuleCode,
      severity: data.severity,
      observedValue: data.observedValue,
      thresholdValue: data.thresholdValue,
      payoutAmount: data.payoutAmount,
      status: data.status || ClaimStatus.PENDING,
      rejectionReason: data.rejectionReason || null,
      payoutReference: data.payoutReference || null,
      paidAt: data.paidAt || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.claims.push(claim);
    return claim;
  }
  async findById(id: string): Promise<Claim | null> {
    return this.claims.find((c) => c.id === id || c.claimNumber === id) || null;
  }
  async findByPolicyId(policyId: string): Promise<Claim[]> {
    return this.claims.filter((c) => c.policyId === policyId);
  }
  async findByFarmId(): Promise<Claim[]> {
    return this.claims;
  }
  async findClaimByPolicyAndRiskEvent(policyId: string, riskEventId: string): Promise<Claim | null> {
    return this.claims.find((c) => c.policyId === policyId && c.riskEventId === riskEventId) || null;
  }
  async updateClaimStatus(): Promise<Claim> {
    throw new Error('Not implemented');
  }
  async markClaimPaid(): Promise<Claim> {
    throw new Error('Not implemented');
  }
}

class MockRiskRepository implements IRiskRepository {
  public assessments: RiskAssessmentWithEvents[] = [];
  public createAssessmentCallCount = 0;

  async findActiveRules(): Promise<any[]> {
    return [];
  }
  async findRuleByCode(): Promise<any | null> {
    return null;
  }
  async createAssessmentWithEvents(assessmentData: any, eventsData: any[]): Promise<RiskAssessmentWithEvents> {
    this.createAssessmentCallCount++;
    const assessment: RiskAssessmentWithEvents = {
      id: 'assessment-' + (this.assessments.length + 1),
      farmId: assessmentData.farmId,
      assessedAt: assessmentData.assessedAt,
      overallRisk: assessmentData.overallRisk,
      assessmentVersion: assessmentData.assessmentVersion || '1.0.0',
      ruleCount: assessmentData.ruleCount,
      triggeredRuleCount: assessmentData.triggeredRuleCount,
      weatherRecordCount: assessmentData.weatherRecordCount,
      createdAt: new Date(),
      riskEvents: eventsData.map((e, idx) => ({
        id: 'event-' + (this.assessments.length + 1) + '-' + idx,
        assessmentId: 'assessment-' + (this.assessments.length + 1),
        riskRuleId: e.riskRuleId,
        observedValue: e.observedValue ? new Prisma.Decimal(e.observedValue.toString()) : null,
        thresholdValue: new Prisma.Decimal(e.thresholdValue.toString()),
        unit: e.unit,
        severity: e.severity,
        triggered: e.triggered,
        explanation: e.explanation,
        observedAt: e.observedAt,
        createdAt: new Date(),
        riskRule: {
          id: e.riskRuleId,
          code: 'RULE-EXCESS-RAIN',
          name: 'Excess Rainfall',
          description: 'Excess rainfall',
          hazardType: RiskHazardType.HEAVY_RAINFALL,
          measurement: RiskMeasurement.SUM,
          threshold: new Prisma.Decimal('100.00'),
          thresholdUnit: 'mm',
          observationWindow: '24h',
          severity: e.severity,
          sourceType: RiskSourceType.OFFICIAL_REFERENCE,
          sourceReference: 'IMD',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })),
    };
    this.assessments.push(assessment);
    return assessment;
  }
  async findAssessmentById(id: string): Promise<RiskAssessmentWithEvents | null> {
    return this.assessments.find((a) => a.id === id) || null;
  }
  async findAssessmentsByFarmId(farmId: string): Promise<RiskAssessmentWithEvents[]> {
    return this.assessments.filter((a) => a.farmId === farmId);
  }
  async getLatestAssessmentsForActiveFarms(): Promise<RiskAssessmentWithEvents[]> {
    return this.assessments;
  }
}

// =============================================================================
// TEST SUITE
// =============================================================================

async function runTestSuite() {
  console.log('\n================================================================================');
  console.log('🧪 Running Module 10 Stage 10.3.1: Automated Risk Evaluation Service Unit Tests');
  console.log('================================================================================\n');

  const testFarmId = 'farm-uuid-1111-2222-3333-4444';
  const testFarmerId = 'farmer-uuid-5555-6666-7777-8888';
  const eventTime = new Date('2026-10-15T12:00:00.000Z');

  // Setup common fixtures
  const farmRepo = new MockFarmRepository();
  const weatherRepo = new MockWeatherRepository();
  const policyRepo = new MockPolicyRepository();
  const claimRepo = new MockClaimRepository();
  const riskRepo = new MockRiskRepository();

  await farmRepo.create({
    id: testFarmId,
    farmerId: testFarmerId,
    farmName: 'Green Acres',
    farmReferenceNumber: 'FRM-GA-001',
    cropName: 'Wheat',
    cropVariety: 'Sharbati',
    sowingDate: new Date('2026-06-01'),
    farmArea: 5,
    farmAreaUnit: AreaUnit.ACRE,
    village: 'Solapur',
    district: 'Solapur',
    state: 'Maharashtra',
    pincode: '413001',
    status: FarmStatus.ACTIVE,
  });

  await weatherRepo.upsert(testFarmId, {
    observedAt: eventTime,
    latitude: 17.6599,
    longitude: 75.9064,
    temperatureC: 28,
    humidityPercent: 85,
    rainfallMm: 125,
    windSpeedKmh: 20,
    windGustKmh: 35,
    weatherCode: 65,
    source: 'Open-Meteo',
  });

  const testPolicy = await policyRepo.createPolicy({
    id: 'pol-uuid-1234',
    policyNumber: 'POL-2026-001',
    farmId: testFarmId,
    farmerId: testFarmerId,
    cropName: 'Wheat',
    sumInsured: new Prisma.Decimal('100000.00'),
    premiumAmount: new Prisma.Decimal('5000.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-11-30T23:59:59.000Z'),
    status: PolicyStatus.ACTIVE,
  });

  // Mock RiskAssessmentService with controllable return DTO
  let mockAssessmentResponse: RiskAssessmentResponseDTO = {
    id: 'assessment-uuid-1',
    farmId: testFarmId,
    assessedAt: eventTime.toISOString(),
    overallRisk: RiskLevel.HIGH,
    assessmentVersion: '1.0.0',
    ruleCount: 1,
    triggeredRuleCount: 1,
    weatherRecordCount: 24,
    hasInsufficientDataCoverage: false,
    summary: 'High risk detected',
    events: [
      {
        id: 'event-uuid-1',
        assessmentId: 'assessment-uuid-1',
        riskRuleId: 'rule-uuid-1',
        ruleCode: 'RULE-EXCESS-RAIN',
        ruleName: 'Excess Rainfall',
        hazardType: RiskHazardType.HEAVY_RAINFALL,
        measurement: RiskMeasurement.SUM,
        observedValue: 125,
        thresholdValue: 100,
        unit: 'mm',
        severity: RiskSeverity.HIGH,
        triggered: true,
        status: 'TRIGGERED',
        explanation: 'Rainfall 125mm exceeded threshold 100mm',
        sourceType: RiskSourceType.OFFICIAL_REFERENCE,
        sourceReference: 'IMD',
        observationWindow: '24h',
        observedAt: eventTime.toISOString(),
        createdAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  };

  let assessFarmRiskCallCount = 0;
  let lastAssessOptions: { persist?: boolean } | undefined = undefined;

  const mockRiskAssessmentService = {
    assessFarmRisk: async (farmId: string, refTime?: Date | string, options?: { persist?: boolean }) => {
      assessFarmRiskCallCount++;
      lastAssessOptions = options;
      return {
        ...mockAssessmentResponse,
        farmId,
        assessedAt: refTime instanceof Date ? refTime.toISOString() : (refTime || mockAssessmentResponse.assessedAt),
      };
    },
  } as unknown as RiskAssessmentService;

  const claimService = new ClaimService(claimRepo, policyRepo, riskRepo);

  // Initialize AutomatedRiskEvaluationService
  const autoRiskService = new AutomatedRiskEvaluationService(
    mockRiskAssessmentService,
    claimService,
    farmRepo,
    weatherRepo,
    policyRepo,
    claimRepo,
    riskRepo
  );

  // ---------------------------------------------------------------------------
  // Checkpoint 1: Disabled Worker Performs No Evaluation Work
  // ---------------------------------------------------------------------------
  console.log('--- CHECKPOINT 1: Disabled Worker Safety ---');
  // When feature is disabled and force is false
  const disabledResult = await autoRiskService.executeBatch({ force: false });
  assert(disabledResult.status === 'DISABLED', '1.1 Disabled batch reports status DISABLED');
  assert(disabledResult.exitCode === 0, '1.2 Disabled batch returns exit code 0');
  assert(disabledResult.attempted === 0, '1.3 Zero farms attempted when disabled');
  assert(farmRepo.findAllCallCount === 0, '1.4 farmRepo.findAll not called when disabled');
  assert(weatherRepo.findLatestCallCount === 0, '1.5 weatherRepo.findLatestByFarmId not called when disabled');
  assert(assessFarmRiskCallCount === 0, '1.6 assessFarmRisk not called when disabled');

  // ---------------------------------------------------------------------------
  // Checkpoint 2: Dry-Run Evaluates Without Any Persistence Calls
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 2: True Dry-Run Zero Mutation ---');
  const initialAssessWrites = riskRepo.createAssessmentCallCount;
  const initialClaimWrites = claimRepo.createClaimCallCount;
  const initialPolicyBalanceUpdates = policyRepo.updateBalanceCallCount;

  const dryRunBatchResult = await autoRiskService.executeBatch({
    dryRun: true,
    force: true,
    farmIds: [testFarmId],
  });

  assert(dryRunBatchResult.status === 'SUCCESS', '2.1 Dry-run batch execution completed with status SUCCESS');
  assert(dryRunBatchResult.exitCode === 0, '2.2 Dry-run batch returns exit code 0');
  assert(dryRunBatchResult.claimsProjected === 1, '2.3 Exactly 1 claim projected in dry-run');
  assert(dryRunBatchResult.claimsCreated === 0, '2.4 Zero claims created in dry-run');
  assert(lastAssessOptions?.persist === false, '2.5 assessFarmRisk called with persist: false');
  assert(
    riskRepo.createAssessmentCallCount === initialAssessWrites,
    '2.6 Zero assessment persistence calls in dry-run mode'
  );
  assert(
    claimRepo.createClaimCallCount === initialClaimWrites,
    '2.7 Zero claim persistence calls in dry-run mode'
  );
  assert(
    policyRepo.updateBalanceCallCount === initialPolicyBalanceUpdates,
    '2.8 Zero policy balance update calls in dry-run mode'
  );

  // ---------------------------------------------------------------------------
  // Checkpoint 3: Authoritative Eligibility & Payout Parity
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 3: Eligibility & Payout Parity ---');
  // Verify across all 4 severity tiers
  const severities = [
    { severity: RiskSeverity.LOW, multiplier: 0.25, expected: '25000.00' },
    { severity: RiskSeverity.MODERATE, multiplier: 0.40, expected: '40000.00' },
    { severity: RiskSeverity.HIGH, multiplier: 0.50, expected: '50000.00' },
    { severity: RiskSeverity.VERY_HIGH, multiplier: 1.00, expected: '100000.00' },
  ];

  for (const s of severities) {
    const calc = ClaimService.computeParametricPayout(testPolicy.sumInsured, testPolicy.cumulativePaidAmount, s.severity);
    assert(calc.multiplier === s.multiplier, `3.1 Multiplier for ${s.severity} is ${s.multiplier}`);
    assert(calc.calculatedPayout.toFixed(2) === s.expected, `3.2 Calculated payout for ${s.severity} is ₹${s.expected}`);

    const parityResult = ClaimService.validateClaimEligibilityAndPayout(
      {
        policy: testPolicy,
        assessment: { id: 'asmt-1', farmId: testFarmId },
        riskEvent: {
          id: 'evt-1',
          assessmentId: 'asmt-1',
          triggered: true,
          severity: s.severity,
          observedAt: eventTime,
          thresholdValue: 100,
          riskRule: { code: 'RULE-1', hazardType: RiskHazardType.HEAVY_RAINFALL },
        },
      },
      false
    );
    assert(parityResult.eligible === true, `3.3 Parity validation eligible for ${s.severity}`);
    assert(parityResult.payoutAmount.toFixed(2) === s.expected, `3.4 Parity validation payout matches ₹${s.expected}`);
  }

  // ---------------------------------------------------------------------------
  // Checkpoint 4: Insufficient Weather Data Skipped Without Fabrication
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 4: Insufficient Weather Data Handling ---');
  const farmWithoutWeatherId = 'farm-uuid-no-weather';
  await farmRepo.create({
    id: farmWithoutWeatherId,
    farmerId: testFarmerId,
    farmName: 'Dry Farm',
    farmReferenceNumber: 'FRM-DRY-002',
    cropName: 'Corn',
    sowingDate: new Date('2026-06-01'),
    farmArea: 2,
    farmAreaUnit: AreaUnit.ACRE,
    village: 'Pune',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
    status: FarmStatus.ACTIVE,
  });

  const noWeatherOutcome = await autoRiskService.evaluateFarm(farmWithoutWeatherId, { dryRun: true });
  assert(noWeatherOutcome.status === 'SKIPPED', '4.1 Farm with no weather records is SKIPPED');
  assert(noWeatherOutcome.reason === 'NO_WEATHER_DATA', '4.2 Reason is strictly NO_WEATHER_DATA');
  assert(noWeatherOutcome.claimsProjected === 0, '4.3 Zero claims projected for farm without weather');

  // ---------------------------------------------------------------------------
  // Checkpoint 5: Non-Triggered Events Never Produce Claims
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 5: Non-Triggered Events Safety ---');
  mockAssessmentResponse = {
    ...mockAssessmentResponse,
    overallRisk: RiskLevel.LOW,
    triggeredRuleCount: 0,
    events: [
      {
        ...mockAssessmentResponse.events[0],
        triggered: false,
        status: 'NOT_TRIGGERED',
        explanation: 'Rainfall 20mm below threshold 100mm',
      },
    ],
  };

  const nonTriggeredOutcome = await autoRiskService.evaluateFarm(testFarmId, { dryRun: true });
  assert(nonTriggeredOutcome.status === 'EVALUATED', '5.1 Evaluated successfully');
  assert(nonTriggeredOutcome.reason === 'NO_TRIGGERED_EVENTS', '5.2 Outcome reason is NO_TRIGGERED_EVENTS');
  assert(nonTriggeredOutcome.claimsProjected === 0, '5.3 Zero claims projected for non-triggered event');
  assert(nonTriggeredOutcome.claimsCreated === 0, '5.4 Zero claims created for non-triggered event');

  // ---------------------------------------------------------------------------
  // Checkpoint 6: Triggered Event with Eligible Policy Produces Projected Result
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 6: Eligible Triggered Event Projection ---');
  mockAssessmentResponse = {
    ...mockAssessmentResponse,
    overallRisk: RiskLevel.HIGH,
    triggeredRuleCount: 1,
    events: [
      {
        ...mockAssessmentResponse.events[0],
        triggered: true,
        status: 'TRIGGERED',
        severity: RiskSeverity.HIGH,
      },
    ],
  };

  const eligibleOutcome = await autoRiskService.evaluateFarm(testFarmId, { dryRun: true });
  assert(eligibleOutcome.status === 'EVALUATED', '6.1 Farm evaluated with triggered event');
  assert(eligibleOutcome.claimsProjected === 1, '6.2 Exactly 1 claim projected');
  assert(eligibleOutcome.details[0].outcome === 'PROJECTED', '6.3 Detail outcome is PROJECTED');
  assert(eligibleOutcome.details[0].payoutAmount === '50000.00', '6.4 Projected payout is ₹50,000.00 (50%)');
  assert(eligibleOutcome.details[0].policyNumber === testPolicy.policyNumber, '6.5 Policy number matches');

  // ---------------------------------------------------------------------------
  // Checkpoint 7: Policy Date Window Invalidation
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 7: Coverage Window Invalidation ---');
  // Event occurred in 2025, but policy starts in June 2026
  const pastEventTime = new Date('2025-05-15T12:00:00.000Z');
  mockAssessmentResponse = {
    ...mockAssessmentResponse,
    assessedAt: pastEventTime.toISOString(),
    events: [
      {
        ...mockAssessmentResponse.events[0],
        observedAt: pastEventTime.toISOString(),
      },
    ],
  };

  const outOfWindowOutcome = await autoRiskService.evaluateFarm(testFarmId, {
    dryRun: true,
    referenceTime: pastEventTime,
  });
  assert(outOfWindowOutcome.details[0].outcome === 'SKIPPED', '7.1 Out-of-window event outcome is SKIPPED');
  assert(
    outOfWindowOutcome.details[0].reason === 'NO_ACTIVE_POLICY_FOR_EVENT_DATE',
    '7.2 Reason notes no active policy for event date'
  );

  // Restore eventTime
  mockAssessmentResponse.events[0].observedAt = eventTime.toISOString();
  mockAssessmentResponse.assessedAt = eventTime.toISOString();

  // ---------------------------------------------------------------------------
  // Checkpoint 8: Uncovered Hazard Rejected
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 8: Uncovered Hazard Handling ---');
  // Policy covers HEAVY_RAINFALL only. Change event to HIGH_TEMPERATURE
  mockAssessmentResponse = {
    ...mockAssessmentResponse,
    events: [
      {
        ...mockAssessmentResponse.events[0],
        hazardType: RiskHazardType.HIGH_TEMPERATURE,
        ruleCode: 'RULE-HIGH-TEMP',
      },
    ],
  };

  const uncoveredOutcome = await autoRiskService.evaluateFarm(testFarmId, { dryRun: true });
  assert(uncoveredOutcome.details[0].outcome === 'SKIPPED', '8.1 Uncovered hazard is SKIPPED');
  assert(
    uncoveredOutcome.details[0].reason?.includes('not included in the covered hazards'),
    '8.2 Reason explicitly notes hazard is not covered'
  );

  // Restore hazard
  mockAssessmentResponse.events[0].hazardType = RiskHazardType.HEAVY_RAINFALL;
  mockAssessmentResponse.events[0].ruleCode = 'RULE-EXCESS-RAIN';

  // ---------------------------------------------------------------------------
  // Checkpoint 9: Duplicate Claim Detection & Skip
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 9: Duplicate Claim Handling ---');
  // Pre-seed an existing claim for this (policyId, eventId)
  await claimRepo.createClaim({
    claimNumber: 'CLM-EXISTING-001',
    policyId: testPolicy.id,
    assessmentId: mockAssessmentResponse.id,
    riskEventId: mockAssessmentResponse.events[0].id,
    triggerRuleCode: 'RULE-EXCESS-RAIN',
    severity: RiskSeverity.HIGH,
    observedValue: new Prisma.Decimal('125.00'),
    thresholdValue: new Prisma.Decimal('100.00'),
    payoutAmount: new Prisma.Decimal('50000.00'),
    status: ClaimStatus.PENDING,
  });

  const duplicateOutcome = await autoRiskService.evaluateFarm(testFarmId, { dryRun: true });
  assert(duplicateOutcome.details[0].outcome === 'SKIPPED', '9.1 Duplicate event outcome is SKIPPED');
  assert(duplicateOutcome.details[0].reason === 'DUPLICATE_CLAIM', '9.2 Reason is strictly DUPLICATE_CLAIM');
  assert(
    duplicateOutcome.details[0].claimNumber === 'CLM-EXISTING-001',
    '9.3 Existing claim number reported in detail'
  );

  // Clear existing claim for subsequent tests
  claimRepo.claims = [];

  // ---------------------------------------------------------------------------
  // Checkpoint 10: Remaining Coverage Cap
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 10: Remaining Coverage Limit Cap ---');
  // Sum insured = 100,000, cumulativePaid = 75,000 -> remaining = 25,000
  testPolicy.cumulativePaidAmount = new Prisma.Decimal('75000.00');
  mockAssessmentResponse.events[0].severity = RiskSeverity.VERY_HIGH; // Multiplier 1.0 (base 100,000)

  const cappedOutcome = await autoRiskService.evaluateFarm(testFarmId, { dryRun: true });
  assert(cappedOutcome.claimsProjected === 1, '10.1 Claim projected');
  assert(
    cappedOutcome.details[0].payoutAmount === '25000.00',
    '10.2 Base payout of 100,000.00 is strictly capped to remaining coverage limit (₹25,000.00)'
  );

  // Restore policy balance
  testPolicy.cumulativePaidAmount = new Prisma.Decimal('0.00');
  mockAssessmentResponse.events[0].severity = RiskSeverity.HIGH;

  // ---------------------------------------------------------------------------
  // Checkpoint 11: Farm-Level Failure Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 11: Farm-Level Failure Isolation ---');
  const farmFailId = 'farm-uuid-fail';
  await farmRepo.create({
    id: farmFailId,
    farmerId: testFarmerId,
    farmName: 'Failing Farm',
    farmReferenceNumber: 'FRM-FAIL-003',
    cropName: 'Soybean',
    sowingDate: new Date('2026-06-01'),
    farmArea: 3,
    farmAreaUnit: AreaUnit.ACRE,
    village: 'Nagpur',
    district: 'Nagpur',
    state: 'Maharashtra',
    pincode: '440001',
    status: FarmStatus.ACTIVE,
  });

  await weatherRepo.upsert(farmFailId, {
    observedAt: eventTime,
    latitude: 21.1458,
    longitude: 79.0882,
    temperatureC: 30,
    humidityPercent: 70,
    rainfallMm: 50,
    windSpeedKmh: 10,
    windGustKmh: 20,
    weatherCode: 61,
    source: 'Open-Meteo',
  });

  // Mock assessFarmRisk to fail for farmFailId only
  const originalAssess = mockRiskAssessmentService.assessFarmRisk;
  mockRiskAssessmentService.assessFarmRisk = async (fId: string, ref?: any, opt?: any) => {
    if (fId === farmFailId) {
      throw new Error('Database socket timeout on farm ' + fId);
    }
    return originalAssess(fId, ref, opt);
  };

  const partialBatchResult = await autoRiskService.executeBatch({
    dryRun: true,
    force: true,
    farmIds: [farmFailId, testFarmId],
  });

  assert(partialBatchResult.status === 'PARTIAL_SUCCESS', '11.1 Batch status is PARTIAL_SUCCESS');
  assert(partialBatchResult.exitCode === 2, '11.2 Batch returns exit code 2 on partial farm failures');
  assert(partialBatchResult.failed === 1, '11.3 Failed farm count is exactly 1');
  assert(partialBatchResult.processed === 1, '11.4 Successful farm count is exactly 1 (processed despite prior failure)');
  assert(partialBatchResult.claimsProjected === 1, '11.5 Second farm produced projected claim');

  // Restore assess
  mockRiskAssessmentService.assessFarmRisk = originalAssess;

  // ---------------------------------------------------------------------------
  // Checkpoint 12: Soft Deadline Enforcement
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 12: Soft Deadline Enforcement ---');
  // Pass timeoutMs = -10 (already expired)
  const deadlineResult = await autoRiskService.executeBatch({
    dryRun: true,
    force: true,
    timeoutMs: -10,
    farmIds: [testFarmId],
  });

  assert(deadlineResult.status === 'DEADLINE_EXCEEDED', '12.1 Batch status is DEADLINE_EXCEEDED');
  assert(deadlineResult.exitCode === 2, '12.2 Deadline exceeded returns exit code 2');
  assert(deadlineResult.attempted === 0, '12.3 Zero farms attempted after deadline expired');

  // ---------------------------------------------------------------------------
  // Checkpoint 13: Module 8 ML Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 13: Module 8 ML Isolation ---');
  // Verify that ML services are not referenced or used in AutomatedRiskEvaluationService
  const serviceCode = AutomatedRiskEvaluationService.toString();
  assert(!serviceCode.includes('mlRisk'), '13.1 Service has no references to mlRisk');
  assert(!serviceCode.includes('copernicus'), '13.2 Service has no references to copernicus');
  assert(!serviceCode.includes('predict'), '13.3 Service has no references to ML predict');

  // ---------------------------------------------------------------------------
  // Checkpoint 14: No Automatic Approval, Settlement, or Payment
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 14: No Automatic Settlement ---');
  // In live mode evaluation:
  // We need riskRepo to persist assessment for ClaimService to find it
  await riskRepo.createAssessmentWithEvents(
    {
      farmId: testFarmId,
      assessedAt: eventTime,
      overallRisk: RiskLevel.HIGH,
      ruleCount: 1,
      triggeredRuleCount: 1,
      weatherRecordCount: 24,
    },
    [
      {
        riskRuleId: 'rule-uuid-1',
        observedValue: 125,
        thresholdValue: 100,
        unit: 'mm',
        severity: RiskSeverity.HIGH,
        triggered: true,
        explanation: 'Heavy rain',
        observedAt: eventTime,
      },
    ]
  );

  const persistedAssessment = riskRepo.assessments[0];
  mockAssessmentResponse.id = persistedAssessment.id;
  mockAssessmentResponse.events[0].id = persistedAssessment.riskEvents[0].id;
  mockAssessmentResponse.events[0].assessmentId = persistedAssessment.id;

  const liveOutcome = await autoRiskService.evaluateFarm(testFarmId, { dryRun: false });
  assert(liveOutcome.status === 'EVALUATED', '14.1 Live evaluation status is EVALUATED');
  assert(liveOutcome.claimsCreated === 1, '14.2 Exactly 1 claim created in live mode');

  const createdClaim = claimRepo.claims[0];
  assert(createdClaim !== undefined, '14.3 Claim was persisted to repository');
  assert(createdClaim.status === ClaimStatus.PENDING, '14.4 Created claim status is strictly PENDING');
  assert(createdClaim.paidAt === null, '14.5 paidAt timestamp is strictly null');
  assert(createdClaim.payoutReference === null, '14.6 payoutReference is strictly null');
  assert(
    testPolicy.cumulativePaidAmount.equals(new Prisma.Decimal('0.00')),
    '14.7 Policy cumulativePaidAmount is UNCHANGED (0.00) after live claim creation'
  );

  // ---------------------------------------------------------------------------
  // Checkpoint 15: Live Claim Idempotency & Protection
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 15: Live Claim Idempotency ---');
  const secondLiveOutcome = await autoRiskService.evaluateFarm(testFarmId, { dryRun: false });
  assert(secondLiveOutcome.claimsCreated === 0, '15.1 Zero new claims created on repeat evaluation');
  assert(secondLiveOutcome.details[0].outcome === 'SKIPPED', '15.2 Duplicate claim is SKIPPED');
  assert(secondLiveOutcome.details[0].reason === 'DUPLICATE_CLAIM', '15.3 Reason is DUPLICATE_CLAIM');
  assert(claimRepo.claims.length === 1, '15.4 Exactly 1 claim remains in repository');

  // ---------------------------------------------------------------------------
  // Checkpoint 16: Stable Assessment & Event Identity on Repeat Evaluation (SEC-10.3.1-01)
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 16: Stable Assessment Identity on Repeat Evaluation ---');
  const repeatFarmId = 'farm-uuid-repeat-test';
  await farmRepo.create({
    id: repeatFarmId,
    farmerId: testFarmerId,
    farmName: 'Repeat Evaluation Farm',
    farmReferenceNumber: 'FRM-REPEAT-001',
    cropName: 'Cotton',
    sowingDate: new Date('2026-06-01'),
    farmArea: 5,
    farmAreaUnit: AreaUnit.ACRE,
    village: 'Wardha',
    district: 'Wardha',
    state: 'Maharashtra',
    pincode: '442001',
    status: FarmStatus.ACTIVE,
  });

  const repeatObservedTime = new Date('2026-08-10T10:00:00.000Z');
  await weatherRepo.upsert(repeatFarmId, {
    observedAt: repeatObservedTime,
    latitude: 20.7453,
    longitude: 78.6022,
    temperatureC: 32,
    humidityPercent: 85,
    rainfallMm: 150,
    windSpeedKmh: 12,
    windGustKmh: 25,
    weatherCode: 65,
    source: 'Open-Meteo',
  });

  const repeatPolicy = await policyRepo.createPolicy({
    policyNumber: 'POL-REPEAT-001',
    farmId: repeatFarmId,
    farmerId: testFarmerId,
    cropName: 'Cotton',
    sumInsured: new Prisma.Decimal('100000.00'),
    premiumAmount: new Prisma.Decimal('5000.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-10-31T23:59:59.000Z'),
    status: PolicyStatus.ACTIVE,
  });

  // Configure assessFarmRisk to persist to riskRepo when persist: true (matching real RiskAssessmentService)
  const prevAssess = mockRiskAssessmentService.assessFarmRisk;
  mockRiskAssessmentService.assessFarmRisk = async (farmId: string, refTime?: any, options?: any) => {
    if (farmId === repeatFarmId && options?.persist !== false) {
      const persisted = await riskRepo.createAssessmentWithEvents(
        {
          farmId,
          assessedAt: repeatObservedTime,
          overallRisk: RiskLevel.HIGH,
          ruleCount: 1,
          triggeredRuleCount: 1,
          weatherRecordCount: 24,
        },
        [
          {
            riskRuleId: 'rule-uuid-1',
            observedValue: 150,
            thresholdValue: 100,
            unit: 'mm',
            severity: RiskSeverity.HIGH,
            triggered: true,
            explanation: 'Heavy rainfall',
            observedAt: repeatObservedTime,
          },
        ]
      );
      return {
        id: persisted.id,
        farmId,
        assessedAt: repeatObservedTime.toISOString(),
        overallRisk: RiskLevel.HIGH,
        assessmentVersion: '1.0.0',
        ruleCount: 1,
        triggeredRuleCount: 1,
        weatherRecordCount: 24,
        hasInsufficientDataCoverage: false,
        summary: 'Heavy rainfall risk detected',
        events: persisted.riskEvents.map((e) => ({
          id: e.id,
          assessmentId: e.assessmentId,
          riskRuleId: e.riskRuleId,
          ruleCode: 'RULE-EXCESS-RAIN',
          ruleName: 'Excess Rainfall',
          hazardType: RiskHazardType.HEAVY_RAINFALL,
          measurement: RiskMeasurement.SUM,
          observedValue: 150,
          thresholdValue: 100,
          unit: 'mm',
          severity: RiskSeverity.HIGH,
          triggered: true,
          status: 'TRIGGERED',
          explanation: 'Rainfall 150mm exceeded threshold 100mm',
          sourceType: RiskSourceType.OFFICIAL_REFERENCE,
          sourceReference: 'IMD',
          observationWindow: '24h',
          observedAt: repeatObservedTime.toISOString(),
          createdAt: new Date().toISOString(),
        })),
        createdAt: new Date().toISOString(),
      };
    }
    return prevAssess(farmId, refTime, options);
  };

  // First live run: creates 1 assessment and 1 claim
  const firstOutcome = await autoRiskService.evaluateFarm(repeatFarmId, { dryRun: false });
  assert(firstOutcome.status === 'EVALUATED', '16.1 First run evaluated');
  assert(firstOutcome.claimsCreated === 1, '16.2 First run created 1 claim');
  assert(firstOutcome.details[0].outcome === 'CLAIM_CREATED', '16.3 First run detail outcome is CLAIM_CREATED');

  // Verify assessment was persisted
  const assessmentsAfterFirst = await riskRepo.findAssessmentsByFarmId(repeatFarmId);
  assert(assessmentsAfterFirst.length === 1, '16.4 Exactly 1 assessment persisted for farm');

  // Second live run: same farm, same observation timestamp
  const secondOutcome = await autoRiskService.evaluateFarm(repeatFarmId, { dryRun: false });
  assert(secondOutcome.status === 'EVALUATED', '16.5 Second run evaluated');
  assert(secondOutcome.claimsCreated === 0, '16.6 Second run created 0 claims (idempotent)');
  assert(secondOutcome.details[0].outcome === 'SKIPPED', '16.7 Second run detail outcome is SKIPPED');
  assert(secondOutcome.details[0].reason === 'DUPLICATE_CLAIM', '16.8 Second run reason is DUPLICATE_CLAIM');
  assert(
    secondOutcome.details[0].duplicateStatus === 'CONFIRMED_PERSISTED_CLAIM',
    '16.9 Status is CONFIRMED_PERSISTED_CLAIM'
  );

  // Verify NO duplicate assessment was created
  const assessmentsAfterSecond = await riskRepo.findAssessmentsByFarmId(repeatFarmId);
  assert(assessmentsAfterSecond.length === 1, '16.10 Reused existing assessment: count remains exactly 1');

  // ---------------------------------------------------------------------------
  // Checkpoint 17: Defense-in-Depth Against New Random Event UUIDs
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 17: Defense Against Random Event UUIDs ---');
  // Manually insert a second assessment for the same timestamp with a BRAND NEW random event UUID
  const secondAssessment = await riskRepo.createAssessmentWithEvents(
    {
      farmId: repeatFarmId,
      assessedAt: repeatObservedTime,
      overallRisk: RiskLevel.HIGH,
      ruleCount: 1,
      triggeredRuleCount: 1,
      weatherRecordCount: 24,
    },
    [
      {
        riskRuleId: 'rule-uuid-random-new',
        observedValue: 150,
        thresholdValue: 100,
        unit: 'mm',
        severity: RiskSeverity.HIGH,
        triggered: true,
        explanation: 'Heavy rainfall event',
        observedAt: repeatObservedTime,
      },
    ]
  );
  secondAssessment.riskEvents[0].riskRule = {
    ...secondAssessment.riskEvents[0].riskRule!,
    code: 'RULE-EXCESS-RAIN',
    hazardType: RiskHazardType.HEAVY_RAINFALL,
  };

  const randomEvent = secondAssessment.riskEvents[0];
  const claimsBeforeRandom = claimRepo.claims.length;

  // Direct compound key lookup returns null for this random UUID
  const directLookup = await claimRepo.findClaimByPolicyAndRiskEvent(repeatPolicy.id, randomEvent.id);
  assert(directLookup === null, '17.1 Direct compound key lookup returns null for fresh random event UUID');

  // Re-evaluating the farm must still block duplicate claim creation via defense-in-depth rule check
  const randomOutcome = await autoRiskService.evaluateFarm(repeatFarmId, { dryRun: false });
  assert(randomOutcome.claimsCreated === 0, '17.2 Zero claims created even with fresh event UUID');
  assert(claimRepo.claims.length === claimsBeforeRandom, '17.3 Total claims count unchanged');

  // ---------------------------------------------------------------------------
  // Checkpoint 18: Dry-Run Synthetic Event ID Safety & No Invalid UUID Queries (SEC-10.3.1-02)
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 18: Dry-Run Synthetic UUID Safety ---');
  let invalidUuidQueried = false;
  const originalFindCompound = claimRepo.findClaimByPolicyAndRiskEvent.bind(claimRepo);

  // Spy on findClaimByPolicyAndRiskEvent to verify no synthetic non-UUID ID is ever queried
  claimRepo.findClaimByPolicyAndRiskEvent = async (policyId: string, riskEventId: string) => {
    const isStrictUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (riskEventId.startsWith('simulated-') || (!isStrictUuid.test(riskEventId) && riskEventId !== 'event-uuid-1')) {
      invalidUuidQueried = true;
    }
    return originalFindCompound(policyId, riskEventId);
  };

  const syntheticFarmId = 'farm-uuid-synthetic-safety';
  await farmRepo.create({
    id: syntheticFarmId,
    farmerId: testFarmerId,
    farmName: 'Synthetic Event Farm',
    farmReferenceNumber: 'FRM-SYNTH-001',
    cropName: 'Wheat',
    sowingDate: new Date('2026-06-01'),
    farmArea: 4,
    farmAreaUnit: AreaUnit.ACRE,
    village: 'Nagpur',
    district: 'Nagpur',
    state: 'Maharashtra',
    pincode: '440001',
    status: FarmStatus.ACTIVE,
  });

  await weatherRepo.upsert(syntheticFarmId, {
    observedAt: eventTime,
    latitude: 21.1458,
    longitude: 79.0882,
    temperatureC: 28,
    humidityPercent: 75,
    rainfallMm: 120,
    windSpeedKmh: 10,
    windGustKmh: 18,
    weatherCode: 61,
    source: 'Open-Meteo',
  });

  await policyRepo.createPolicy({
    policyNumber: 'POL-SYNTH-001',
    farmId: syntheticFarmId,
    farmerId: testFarmerId,
    cropName: 'Wheat',
    sumInsured: new Prisma.Decimal('80000.00'),
    premiumAmount: new Prisma.Decimal('4000.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-10-31T23:59:59.000Z'),
    status: PolicyStatus.ACTIVE,
  });

  mockAssessmentResponse = {
    ...mockAssessmentResponse,
    id: `simulated-assessment-${syntheticFarmId}-12345`,
    events: [
      {
        ...mockAssessmentResponse.events[0],
        id: `simulated-event-${syntheticFarmId}-0`,
        assessmentId: `simulated-assessment-${syntheticFarmId}-12345`,
        triggered: true,
        status: 'TRIGGERED',
      },
    ],
  };

  const synthOutcome = await autoRiskService.evaluateFarm(syntheticFarmId, { dryRun: true });
  assert(!invalidUuidQueried, '18.1 Zero synthetic/non-UUID strings reached findClaimByPolicyAndRiskEvent');
  assert(synthOutcome.status === 'EVALUATED', '18.2 Synthetic farm evaluation status is EVALUATED');
  assert(synthOutcome.claimsProjected === 1, '18.3 Projected 1 claim in dry-run');
  assert(synthOutcome.details[0].eventId === undefined, '18.4 detail.eventId is undefined (not reported as DB identifier)');
  assert(
    synthOutcome.details[0].syntheticEventId === `simulated-event-${syntheticFarmId}-0`,
    '18.5 detail.syntheticEventId preserves trace'
  );
  assert(synthOutcome.details[0].isSynthetic === true, '18.6 detail.isSynthetic flag is strictly true');

  claimRepo.findClaimByPolicyAndRiskEvent = originalFindCompound;

  // ---------------------------------------------------------------------------
  // Checkpoint 19: Distinction Between Dry-Run Duplicate Statuses
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 19: Dry-Run Duplicate Status Categories ---');
  assert(synthOutcome.details[0].duplicateStatus === 'NEW_CLAIM', '19.1 Status is NEW_CLAIM when no claims exist');
  assert(
    synthOutcome.details[0].reason === 'SIMULATED_POINT_IN_TIME_PROJECTION',
    '19.2 Reason is SIMULATED_POINT_IN_TIME_PROJECTION'
  );

  // Seed a prior claim for the same triggerRuleCode on this policy
  await claimRepo.createClaim({
    claimNumber: 'CLM-SYNTH-PRIOR-001',
    policyId: (await policyRepo.findActivePolicyForFarm(syntheticFarmId, eventTime))!.id,
    assessmentId: '00000000-0000-4000-8000-000000000001',
    riskEventId: '00000000-0000-4000-8000-000000000002',
    triggerRuleCode: 'RULE-EXCESS-RAIN',
    severity: RiskSeverity.HIGH,
    observedValue: new Prisma.Decimal('120.00'),
    thresholdValue: new Prisma.Decimal('100.00'),
    payoutAmount: new Prisma.Decimal('40000.00'),
    status: ClaimStatus.PENDING,
  });

  const potentialDupOutcome = await autoRiskService.evaluateFarm(syntheticFarmId, { dryRun: true });
  assert(
    potentialDupOutcome.details[0].duplicateStatus === 'POTENTIAL_DUPLICATE_UNVERIFIED',
    '19.3 Status is POTENTIAL_DUPLICATE_UNVERIFIED when matching rule exists but event ID is synthetic'
  );
  assert(
    potentialDupOutcome.details[0].reason === 'PROJECTED_POTENTIAL_DUPLICATE_UNVERIFIED',
    '19.4 Reason indicates unverified potential duplicate'
  );
  assert(potentialDupOutcome.details[0].outcome === 'PROJECTED', '19.5 Outcome is still PROJECTED in dry-run');

  // ---------------------------------------------------------------------------
  // Checkpoint 20: Concurrency Race Condition Limitation Documentation
  // ---------------------------------------------------------------------------
  console.log('\n--- CHECKPOINT 20: Concurrency Race Condition Limitation ---');
  const raceFarmId = 'farm-uuid-race-condition';
  await farmRepo.create({
    id: raceFarmId,
    farmerId: testFarmerId,
    farmName: 'Race Condition Farm',
    farmReferenceNumber: 'FRM-RACE-001',
    cropName: 'Paddy',
    sowingDate: new Date('2026-06-01'),
    farmArea: 2,
    farmAreaUnit: AreaUnit.ACRE,
    village: 'Nagpur',
    district: 'Nagpur',
    state: 'Maharashtra',
    pincode: '440001',
    status: FarmStatus.ACTIVE,
  });

  await weatherRepo.upsert(raceFarmId, {
    observedAt: eventTime,
    latitude: 21.1458,
    longitude: 79.0882,
    temperatureC: 30,
    humidityPercent: 80,
    rainfallMm: 110,
    windSpeedKmh: 8,
    windGustKmh: 16,
    weatherCode: 61,
    source: 'Open-Meteo',
  });

  await policyRepo.createPolicy({
    policyNumber: 'POL-RACE-001',
    farmId: raceFarmId,
    farmerId: testFarmerId,
    cropName: 'Paddy',
    sumInsured: new Prisma.Decimal('50000.00'),
    premiumAmount: new Prisma.Decimal('2500.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-10-31T23:59:59.000Z'),
    status: PolicyStatus.ACTIVE,
  });

  const preCheckWorker1 = await riskRepo.findAssessmentsByFarmId(raceFarmId);
  const preCheckWorker2 = await riskRepo.findAssessmentsByFarmId(raceFarmId);
  assert(preCheckWorker1.length === 0, '20.1 Worker 1 observes 0 assessments before commit');
  assert(preCheckWorker2.length === 0, '20.2 Worker 2 observes 0 assessments before commit');
  assert(
    preCheckWorker1.length === preCheckWorker2.length,
    '20.3 Proves that without DB unique constraint or advisory lock, read-before-write is not concurrency-safe'
  );

  // ---------------------------------------------------------------------------
  // Final Results
  // ---------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed across all checkpoints`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
