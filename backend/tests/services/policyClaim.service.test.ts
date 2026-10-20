/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.3: PolicyService and ClaimService Unit Tests
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
import { PolicyService } from '../../src/services/policy.service.js';
import { ClaimService, PayoutConfiguration, AUTHORITATIVE_SEVERITY_MULTIPLIERS } from '../../src/services/claim.service.js';
import { IPolicyRepository } from '../../src/types/policy.types.js';
import { IClaimRepository } from '../../src/types/claim.types.js';
import { IFarmRepository } from '../../src/types/farm.types.js';
import { IFarmerRepository } from '../../src/types/farmer.types.js';
import { IFarmBoundaryRepository, RawBoundaryResult } from '../../src/types/farmBoundary.types.js';
import { IRiskRepository, RiskAssessmentWithEvents } from '../../src/types/risk.types.js';
import { AppError } from '../../src/utils/apiError.js';

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
// MOCK REPOSITORIES
// =============================================================================

class MockPolicyRepository implements IPolicyRepository {
  public policies: Policy[] = [];

  async createPolicy(data: any): Promise<Policy> {
    const newPolicy: Policy = {
      id: data.id || `pol-uuid-${this.policies.length + 1}`,
      policyNumber: data.policyNumber,
      farmId: data.farmId,
      farmerId: data.farmerId,
      cropName: data.cropName,
      sumInsured: data.sumInsured,
      premiumAmount: data.premiumAmount,
      coveredHazards: data.coveredHazards,
      startDate: data.startDate,
      endDate: data.endDate,
      cumulativePaidAmount: data.cumulativePaidAmount || new Prisma.Decimal('0.00'),
      status: data.status || PolicyStatus.PENDING,
      createdAt: new Date('2026-10-13T10:00:00.000Z'),
      updatedAt: new Date('2026-10-13T10:00:00.000Z'),
    };
    this.policies.push(newPolicy);
    return newPolicy;
  }

  async findById(id: string): Promise<Policy | null> {
    return this.policies.find((p) => p.id === id || p.policyNumber === id) || null;
  }

  async findByFarmId(farmId: string): Promise<Policy[]> {
    return this.policies.filter((p) => p.farmId === farmId);
  }

  async findActivePolicyForFarm(farmId: string, referenceDate: Date = new Date()): Promise<Policy | null> {
    return (
      this.policies.find(
        (p) =>
          p.farmId === farmId &&
          p.status === PolicyStatus.ACTIVE &&
          p.startDate <= referenceDate &&
          p.endDate >= referenceDate
      ) || null
    );
  }

  async updatePolicyBalanceAndStatus(id: string, update: any, tx?: any): Promise<Policy> {
    if (tx && typeof tx.$queryRaw === 'function') {
      await tx.$queryRaw`SELECT "id" FROM "policies" WHERE "id" = ${id} FOR UPDATE`;
    }
    const policy = this.policies.find((p) => p.id === id);
    if (!policy) {
      throw AppError.notFound(`Policy with ID '${id}' not found`);
    }

    const increment =
      update.payoutIncrement instanceof Prisma.Decimal
        ? update.payoutIncrement
        : new Prisma.Decimal(update.payoutIncrement.toString());

    if (increment.lessThan(0)) {
      throw AppError.badRequest('Payout increment cannot be negative');
    }

    const newCumulative = policy.cumulativePaidAmount.add(increment);
    if (newCumulative.greaterThan(policy.sumInsured)) {
      throw AppError.badRequest(
        `Payout increment of ${increment.toFixed(2)} exceeds remaining coverage balance.`
      );
    }

    // Track modification before mutating if within transactional context
    if (tx && typeof tx._trackPolicyModification === 'function') {
      tx._trackPolicyModification(policy);
    }

    let finalStatus = update.newStatus ?? policy.status;
    if (!update.newStatus && newCumulative.equals(policy.sumInsured)) {
      finalStatus = PolicyStatus.EXHAUSTED;
    }

    policy.cumulativePaidAmount = newCumulative;
    policy.status = finalStatus;
    policy.updatedAt = new Date('2026-10-13T12:00:00.000Z');
    return policy;
  }

  async updatePolicyStatus(id: string, status: PolicyStatus): Promise<Policy> {
    const policy = this.policies.find((p) => p.id === id);
    if (!policy) {
      throw AppError.notFound(`Policy with ID '${id}' not found`);
    }
    policy.status = status;
    policy.updatedAt = new Date('2026-10-13T12:00:00.000Z');
    return policy;
  }
}

class MockClaimRepository implements IClaimRepository {
  public claims: Claim[] = [];

  async createClaim(data: any): Promise<Claim> {
    const existing = this.claims.find(
      (c) => c.policyId === data.policyId && c.riskEventId === data.riskEventId
    );
    if (existing) {
      throw AppError.conflict(
        `A claim for policy '${data.policyId}' and risk event '${data.riskEventId}' already exists`
      );
    }

    const newClaim: Claim = {
      id: data.id || `clm-uuid-${this.claims.length + 1}`,
      claimNumber: data.claimNumber,
      policyId: data.policyId,
      assessmentId: data.assessmentId,
      riskEventId: data.riskEventId,
      triggerRuleCode: data.triggerRuleCode,
      severity: data.severity,
      observedValue: data.observedValue ?? null,
      thresholdValue: data.thresholdValue,
      payoutAmount: data.payoutAmount,
      status: data.status || ClaimStatus.PENDING,
      rejectionReason: data.rejectionReason || null,
      payoutReference: data.payoutReference || null,
      paidAt: data.paidAt || null,
      createdAt: new Date('2026-10-13T10:00:00.000Z'),
      updatedAt: new Date('2026-10-13T10:00:00.000Z'),
    };
    this.claims.push(newClaim);
    return newClaim;
  }

  async findById(id: string): Promise<Claim | null> {
    return this.claims.find((c) => c.id === id) || null;
  }

  async findByPolicyId(policyId: string): Promise<Claim[]> {
    return this.claims.filter((c) => c.policyId === policyId);
  }

  async findByFarmId(farmId: string): Promise<Claim[]> {
    return this.claims;
  }

  async findClaimByPolicyAndRiskEvent(policyId: string, riskEventId: string): Promise<Claim | null> {
    return (
      this.claims.find((c) => c.policyId === policyId && c.riskEventId === riskEventId) || null
    );
  }

  async updateClaimStatus(id: string, data: any): Promise<Claim> {
    const claim = this.claims.find((c) => c.id === id);
    if (!claim) {
      throw AppError.notFound(`Claim with ID '${id}' not found`);
    }
    claim.status = data.status;
    if (data.payoutReference !== undefined) claim.payoutReference = data.payoutReference;
    if (data.paidAt !== undefined) claim.paidAt = data.paidAt;
    if (data.rejectionReason !== undefined) claim.rejectionReason = data.rejectionReason;
    claim.updatedAt = new Date('2026-10-13T12:00:00.000Z');
    return claim;
  }
}

class MockFarmRepository implements IFarmRepository {
  public farms: Farm[] = [];

  async findById(id: string): Promise<Farm | null> {
    return this.farms.find((f) => f.id === id) || null;
  }
  async create(data: any): Promise<Farm> { throw new Error('Not implemented'); }
  async update(id: string, data: any): Promise<Farm> { throw new Error('Not implemented'); }
  async delete(id: string): Promise<Farm> { throw new Error('Not implemented'); }
  async findAll(): Promise<Farm[]> { return this.farms; }
  async findByReferenceNumber(ref: string): Promise<Farm | null> { return null; }
  async count(): Promise<number> { return this.farms.length; }
}

class MockFarmerRepository implements IFarmerRepository {
  public farmers: Farmer[] = [];

  async findById(id: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.id === id) || null;
  }
  async create(data: any): Promise<Farmer> { throw new Error('Not implemented'); }
  async findByMobileNumber(): Promise<Farmer | null> { return null; }
  async findByReferenceNumber(): Promise<Farmer | null> { return null; }
  async findAll(): Promise<Farmer[]> { return this.farmers; }
  async count(): Promise<number> { return this.farmers.length; }
}

class MockBoundaryRepository implements IFarmBoundaryRepository {
  public boundaries: RawBoundaryResult[] = [];

  async findByFarmId(farmId: string): Promise<RawBoundaryResult | null> {
    return this.boundaries.find((b) => b.farmId === farmId) || null;
  }
  async findCentroidByFarmId(): Promise<any> { return null; }
  async saveBoundary(): Promise<any> { throw new Error('Not implemented'); }
  async updateBoundary(): Promise<any> { throw new Error('Not implemented'); }
  async deleteByFarmId(): Promise<boolean> { return true; }
}

class MockRiskRepository implements IRiskRepository {
  public assessments: RiskAssessmentWithEvents[] = [];

  async findAssessmentById(id: string): Promise<RiskAssessmentWithEvents | null> {
    return this.assessments.find((a) => a.id === id) || null;
  }
  async findActiveRules(): Promise<any[]> { return []; }
  async findRuleByCode(): Promise<any> { return null; }
  async createAssessmentWithEvents(): Promise<any> { throw new Error('Not implemented'); }
  async findAssessmentsByFarmId(): Promise<any[]> { return []; }
  async getLatestAssessmentsForActiveFarms(): Promise<any[]> { return []; }
}

class MockPrismaTxClient {
  public shouldFailClaimUpdate: boolean = false;
  private static locks = new Map<string, Promise<void>>();

  constructor(public policyRepo: MockPolicyRepository, public claimRepo: MockClaimRepository) {}

  public claim = {
    findUnique: async ({ where }: any) => {
      return this.claimRepo.claims.find((c) => c.id === where.id) || null;
    },
    update: async ({ where, data }: any) => {
      if (this.shouldFailClaimUpdate) {
        throw new Error('Injected database failure during claim update mutation');
      }
      return this.claimRepo.updateClaimStatus(where.id, data);
    },
  };

  public policy = {
    findUnique: async ({ where }: any) => {
      return this.policyRepo.policies.find((p) => p.id === where.id) || null;
    },
  };

  private async acquireLock(key: string): Promise<() => void> {
    while (MockPrismaTxClient.locks.has(key)) {
      await MockPrismaTxClient.locks.get(key);
    }
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    MockPrismaTxClient.locks.set(key, promise);
    return () => {
      MockPrismaTxClient.locks.delete(key);
      release();
    };
  }

  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const originalPolicies = new Map<
      string,
      { cumulativePaidAmount: Prisma.Decimal; status: PolicyStatus; updatedAt: Date }
    >();
    const originalClaims = new Map<
      string,
      {
        status: ClaimStatus;
        payoutReference: string | null;
        paidAt: Date | null;
        rejectionReason: string | null;
        updatedAt: Date;
      }
    >();
    const txReleases: (() => void)[] = [];

    const tx = {
      claim: {
        findUnique: this.claim.findUnique,
        update: async ({ where, data }: any) => {
          if (this.shouldFailClaimUpdate) {
            throw new Error('Injected database failure during claim update mutation');
          }
          const existing = this.claimRepo.claims.find((c) => c.id === where.id);
          if (existing && !originalClaims.has(where.id)) {
            originalClaims.set(where.id, {
              status: existing.status,
              payoutReference: existing.payoutReference,
              paidAt: existing.paidAt,
              rejectionReason: existing.rejectionReason,
              updatedAt: existing.updatedAt,
            });
          }
          return this.claimRepo.updateClaimStatus(where.id, data);
        },
      },
      policy: {
        findUnique: this.policy.findUnique,
      },
      $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        const sql = strings.join('?');
        if (sql.includes('policies') && sql.includes('FOR UPDATE')) {
          const policyId = values[0];
          if (policyId) {
            const release = await this.acquireLock(`policy:${policyId}`);
            txReleases.push(release);
          }
        } else if (sql.includes('claims') && sql.includes('FOR UPDATE')) {
          const claimId = values[0];
          if (claimId) {
            const release = await this.acquireLock(`claim:${claimId}`);
            txReleases.push(release);
          }
        }
        return [];
      },
      _trackPolicyModification: (policy: Policy) => {
        if (!originalPolicies.has(policy.id)) {
          originalPolicies.set(policy.id, {
            cumulativePaidAmount: new Prisma.Decimal(policy.cumulativePaidAmount),
            status: policy.status,
            updatedAt: policy.updatedAt,
          });
        }
      },
    };

    try {
      return await fn(tx);
    } catch (err) {
      // Rollback only records that were actually mutated within this transaction
      for (const [id, original] of originalPolicies.entries()) {
        const p = this.policyRepo.policies.find((item) => item.id === id);
        if (p) {
          p.cumulativePaidAmount = new Prisma.Decimal(original.cumulativePaidAmount);
          p.status = original.status;
          p.updatedAt = original.updatedAt;
        }
      }
      for (const [id, original] of originalClaims.entries()) {
        const c = this.claimRepo.claims.find((item) => item.id === id);
        if (c) {
          c.status = original.status;
          c.payoutReference = original.payoutReference;
          c.paidAt = original.paidAt;
          c.rejectionReason = original.rejectionReason;
          c.updatedAt = original.updatedAt;
        }
      }
      throw err;
    } finally {
      // Release all acquired row-locks for this transaction
      for (const release of txReleases) {
        release();
      }
    }
  }
}

// =============================================================================
// TEST SUITES
// =============================================================================

async function runStage93UnitTests() {
  console.log('\n================================================================================');
  console.log('🧪 Running Module 9 Stage 9.3: PolicyService & ClaimService Unit Tests');
  console.log('================================================================================\n');

  // Shared test identifiers
  const farmId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const farmerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const otherFarmerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  // Seed baseline farm & farmer
  const mockFarm: Farm = {
    id: farmId,
    farmerId,
    farmName: 'Krishna Valley Farm',
    farmReferenceNumber: 'AGRI-FRM-20260920-F8C2',
    cropName: 'Cotton',
    cropVariety: 'BT-Cotton',
    sowingDate: new Date('2026-06-01'),
    expectedHarvestDate: new Date('2026-11-30'),
    farmArea: new Prisma.Decimal('2.50'),
    farmAreaUnit: AreaUnit.HECTARE,
    village: 'Baramati',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '413102',
    status: FarmStatus.ACTIVE,
    createdAt: new Date('2026-09-20'),
    updatedAt: new Date('2026-09-20'),
  };

  const mockFarmer: Farmer = {
    id: farmerId,
    fullName: 'Ramesh Patil',
    mobileNumber: '9876543210',
    preferredLanguage: Language.mr,
    farmerReferenceNumber: 'AGRI-FAR-20260920-0001',
    createdAt: new Date('2026-09-20'),
    updatedAt: new Date('2026-09-20'),
  };

  const mockBoundary: RawBoundaryResult = {
    id: 'bnd-uuid-1',
    farmId,
    geojson: '{"type":"Polygon","coordinates":[[[74.5,18.1],[74.6,18.1],[74.6,18.2],[74.5,18.2],[74.5,18.1]]]}',
    calculatedAreaSqM: 25000,
    calculatedAreaHectares: 2.5,
    calculatedAreaAcres: 6.177,
    centroidLatitude: 18.15,
    centroidLongitude: 74.55,
    createdAt: new Date('2026-09-21'),
    updatedAt: new Date('2026-09-21'),
  };

  // ---------------------------------------------------------------------------
  // PART 1: POLICY SERVICE TESTS
  // ---------------------------------------------------------------------------
  console.log('--- PART 1: PolicyService Business Logic ---');

  const policyRepo = new MockPolicyRepository();
  const farmRepo = new MockFarmRepository();
  const farmerRepo = new MockFarmerRepository();
  const boundaryRepo = new MockBoundaryRepository();

  farmRepo.farms.push(mockFarm);
  farmerRepo.farmers.push(mockFarmer);
  boundaryRepo.boundaries.push(mockBoundary);

  const policyService = new PolicyService(policyRepo, farmRepo, farmerRepo, boundaryRepo);

  // 1.1 Non-existent farm parcel
  let caughtFarm404 = false;
  try {
    await policyService.createPolicy({
      farmId: '99999999-9999-4999-8999-999999999999',
      farmerId,
      cropName: 'Cotton',
      sumInsured: '100000.00',
      premiumAmount: '5000.00',
      coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-11-30T23:59:59.000Z',
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) caughtFarm404 = true;
  }
  assert(caughtFarm404, '1.1 Non-existent farm throws 404 Not Found');

  // 1.2 Inactive farm parcel
  mockFarm.status = FarmStatus.INACTIVE;
  let caughtInactiveFarm = false;
  try {
    await policyService.createPolicy({
      farmId,
      farmerId,
      cropName: 'Cotton',
      sumInsured: '100000.00',
      premiumAmount: '5000.00',
      coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-11-30T23:59:59.000Z',
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('Only ACTIVE farms')) {
      caughtInactiveFarm = true;
    }
  }
  assert(caughtInactiveFarm, '1.2 Inactive farm parcel rejected with HTTP 400 Bad Request');
  mockFarm.status = FarmStatus.ACTIVE; // restore

  // 1.3 Incorrect farmer-farm association
  let caughtWrongFarmer = false;
  try {
    await policyService.createPolicy({
      farmId,
      farmerId: otherFarmerId,
      cropName: 'Cotton',
      sumInsured: '100000.00',
      premiumAmount: '5000.00',
      coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-11-30T23:59:59.000Z',
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('not the registered producer')) {
      caughtWrongFarmer = true;
    }
  }
  assert(caughtWrongFarmer, '1.3 Incorrect farmer-farm association rejected with HTTP 400 Bad Request');

  // 1.4 Missing boundary
  boundaryRepo.boundaries = [];
  let caughtMissingBoundary = false;
  try {
    await policyService.createPolicy({
      farmId,
      farmerId,
      cropName: 'Cotton',
      sumInsured: '100000.00',
      premiumAmount: '5000.00',
      coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-11-30T23:59:59.000Z',
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('geospatial boundary')) {
      caughtMissingBoundary = true;
    }
  }
  assert(caughtMissingBoundary, '1.4 Farm lacking geospatial boundary rejected with HTTP 400 Bad Request');
  boundaryRepo.boundaries.push(mockBoundary); // restore

  // 1.5 Successful policy creation in PENDING status
  const createdPolicy = await policyService.createPolicy({
    farmId,
    farmerId,
    cropName: 'Cotton',
    sumInsured: '125000.00', // ₹50,000 * 2.5 ha = 125,000 illustrative
    premiumAmount: '6250.00',
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL, RiskHazardType.INTENSE_RAINFALL],
    startDate: '2026-06-01T00:00:00.000Z',
    endDate: '2026-11-30T23:59:59.000Z',
  });

  assert(createdPolicy.status === PolicyStatus.PENDING, '1.5 Newly created policy is initialized in PENDING status');
  assert(createdPolicy.cumulativePaidAmount === '0.00', '1.6 Initial cumulativePaidAmount is 0.00');
  assert(createdPolicy.remainingCoverage === '125000.00', '1.7 Remaining coverage equals full sum insured');
  assert(createdPolicy.policyNumber.startsWith('POL-'), '1.8 Policy number generated matching POL- prefix');

  // 1.6 Overlapping policy detection
  let caughtOverlap = false;
  try {
    await policyService.createPolicy({
      farmId,
      farmerId,
      cropName: 'Cotton',
      sumInsured: '100000.00',
      premiumAmount: '5000.00',
      coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
      startDate: '2026-08-01T00:00:00.000Z', // Overlaps with existing 2026-06-01 to 2026-11-30
      endDate: '2026-12-31T23:59:59.000Z',
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 409 && err.message.includes('already has an overlapping')) {
      caughtOverlap = true;
    }
  }
  assert(caughtOverlap, '1.9 Overlapping policy for farm rejected with HTTP 409 Conflict');

  // 1.7 Explicit issuance transitions PENDING to ACTIVE
  const issuedPolicy = await policyService.issuePolicy(createdPolicy.id);
  assert(issuedPolicy.status === PolicyStatus.ACTIVE, '1.10 Explicit issuance operation transitions policy from PENDING to ACTIVE');

  // 1.8 Re-issuing an already active policy is rejected
  let caughtReissue = false;
  try {
    await policyService.issuePolicy(createdPolicy.id);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('already ACTIVE')) {
      caughtReissue = true;
    }
  }
  assert(caughtReissue, '1.11 Re-issuing an already ACTIVE policy rejected with HTTP 400 Bad Request');

  // 1.9 Query active policy
  const activeLookup = await policyService.getActivePolicyForFarm(farmId, new Date('2026-07-15T00:00:00.000Z'));
  assert(activeLookup !== null && activeLookup.id === createdPolicy.id, '1.12 getActivePolicyForFarm returns active policy during valid coverage window');

  // ---------------------------------------------------------------------------
  // PART 2: CLAIM SERVICE TESTS
  // ---------------------------------------------------------------------------
  console.log('\n--- PART 2: ClaimService Business Logic ---');

  const claimRepo = new MockClaimRepository();
  const riskRepo = new MockRiskRepository();
  const mockPrismaTx = new MockPrismaTxClient(policyRepo, claimRepo);

  const claimService = new ClaimService(claimRepo, policyRepo, riskRepo, mockPrismaTx as any);

  // Define approved test payout configuration
  const approvedPayoutConfig: PayoutConfiguration = {
    severityMultipliers: {
      [RiskSeverity.HIGH]: 0.5,
      [RiskSeverity.VERY_HIGH]: 1.0,
    },
  };

  // Seed authoritative Module 6 RiskAssessment with RiskEvent
  const assessmentId = 'assess-uuid-1';
  const riskEventId = 'event-uuid-1';
  const untriggeredEventId = 'event-uuid-untriggered';
  const outsidePeriodEventId = 'event-uuid-outside';
  const uncoveredHazardEventId = 'event-uuid-uncovered';

  const mockAssessment: RiskAssessmentWithEvents = {
    id: assessmentId,
    farmId,
    assessedAt: new Date('2026-07-20T12:00:00.000Z'),
    overallRisk: RiskLevel.HIGH,
    assessmentVersion: '1.0.0',
    ruleCount: 7,
    triggeredRuleCount: 1,
    weatherRecordCount: 24,
    createdAt: new Date('2026-07-20T12:00:00.000Z'),
    riskEvents: [
      {
        id: riskEventId,
        assessmentId,
        riskRuleId: 'rule-uuid-1',
        observedValue: new Prisma.Decimal('78.40'),
        thresholdValue: new Prisma.Decimal('64.50'),
        unit: 'MM',
        severity: RiskSeverity.HIGH,
        triggered: true, // TRIGGERED!
        explanation: '24-hour rainfall was 78.40 MM, meeting configured threshold of 64.50 MM.',
        observedAt: new Date('2026-07-20T10:00:00.000Z'), // Inside coverage (June to November 2026)
        createdAt: new Date('2026-07-20T12:00:00.000Z'),
        riskRule: {
          id: 'rule-uuid-1',
          code: 'HEAVY_RAINFALL_24H',
          name: 'Heavy Rainfall - 24 Hour',
          description: 'IMD Standard',
          hazardType: RiskHazardType.HEAVY_RAINFALL,
          measurement: RiskMeasurement.RAINFALL,
          threshold: new Prisma.Decimal('64.50'),
          thresholdUnit: 'MM',
          observationWindow: '24_HOURS',
          severity: RiskSeverity.HIGH,
          sourceType: RiskSourceType.OFFICIAL_REFERENCE,
          sourceReference: 'IMD',
          isActive: true,
          createdAt: new Date('2026-09-22'),
          updatedAt: new Date('2026-09-22'),
        },
      },
      {
        id: untriggeredEventId,
        assessmentId,
        riskRuleId: 'rule-uuid-2',
        observedValue: new Prisma.Decimal('12.00'),
        thresholdValue: new Prisma.Decimal('20.00'),
        unit: 'MM',
        severity: RiskSeverity.HIGH,
        triggered: false, // NOT TRIGGERED
        explanation: 'Did not meet threshold',
        observedAt: new Date('2026-07-20T10:00:00.000Z'),
        createdAt: new Date('2026-07-20T12:00:00.000Z'),
        riskRule: {
          id: 'rule-uuid-2',
          code: 'INTENSE_RAINFALL_3H',
          name: 'Intense Rainfall - 3 Hour',
          description: 'IMD Standard',
          hazardType: RiskHazardType.INTENSE_RAINFALL,
          measurement: RiskMeasurement.RAINFALL,
          threshold: new Prisma.Decimal('20.00'),
          thresholdUnit: 'MM',
          observationWindow: '3_HOURS',
          severity: RiskSeverity.HIGH,
          sourceType: RiskSourceType.OFFICIAL_REFERENCE,
          sourceReference: 'IMD',
          isActive: true,
          createdAt: new Date('2026-09-22'),
          updatedAt: new Date('2026-09-22'),
        },
      },
      {
        id: outsidePeriodEventId,
        assessmentId,
        riskRuleId: 'rule-uuid-1',
        observedValue: new Prisma.Decimal('85.00'),
        thresholdValue: new Prisma.Decimal('64.50'),
        unit: 'MM',
        severity: RiskSeverity.HIGH,
        triggered: true,
        explanation: 'Met threshold but in 2025',
        observedAt: new Date('2025-01-01T10:00:00.000Z'), // Outside 2026 coverage window!
        createdAt: new Date('2026-07-20T12:00:00.000Z'),
        riskRule: {
          id: 'rule-uuid-1',
          code: 'HEAVY_RAINFALL_24H',
          name: 'Heavy Rainfall - 24 Hour',
          description: 'IMD Standard',
          hazardType: RiskHazardType.HEAVY_RAINFALL,
          measurement: RiskMeasurement.RAINFALL,
          threshold: new Prisma.Decimal('64.50'),
          thresholdUnit: 'MM',
          observationWindow: '24_HOURS',
          severity: RiskSeverity.HIGH,
          sourceType: RiskSourceType.OFFICIAL_REFERENCE,
          sourceReference: 'IMD',
          isActive: true,
          createdAt: new Date('2026-09-22'),
          updatedAt: new Date('2026-09-22'),
        },
      },
      {
        id: uncoveredHazardEventId,
        assessmentId,
        riskRuleId: 'rule-uuid-3',
        observedValue: new Prisma.Decimal('48.00'),
        thresholdValue: new Prisma.Decimal('40.00'),
        unit: 'CELSIUS',
        severity: RiskSeverity.HIGH,
        triggered: true,
        explanation: 'Heatwave met',
        observedAt: new Date('2026-07-20T10:00:00.000Z'),
        createdAt: new Date('2026-07-20T12:00:00.000Z'),
        riskRule: {
          id: 'rule-uuid-3',
          code: 'HIGH_TEMP_WAVE',
          name: 'Heatwave',
          description: 'Heat wave',
          hazardType: RiskHazardType.HIGH_TEMPERATURE, // Policy only covers HEAVY_RAINFALL and INTENSE_RAINFALL!
          measurement: RiskMeasurement.TEMPERATURE,
          threshold: new Prisma.Decimal('40.00'),
          thresholdUnit: 'C',
          observationWindow: '24_HOURS',
          severity: RiskSeverity.HIGH,
          sourceType: RiskSourceType.OFFICIAL_REFERENCE,
          sourceReference: 'IMD',
          isActive: true,
          createdAt: new Date('2026-09-22'),
          updatedAt: new Date('2026-09-22'),
        },
      },
    ],
  };

  riskRepo.assessments.push(mockAssessment);

  // 2.1 Rejection of untriggered risk event
  let caughtUntriggered = false;
  try {
    await claimService.evaluateClaim({
      policyId: createdPolicy.id,
      assessmentId,
      riskEventId: untriggeredEventId,
      payoutConfig: approvedPayoutConfig,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('not triggered')) {
      caughtUntriggered = true;
    }
  }
  assert(caughtUntriggered, '2.1 Untriggered risk event rejected with HTTP 400 Bad Request');

  // 2.2 Rejection of event outside policy coverage window
  let caughtOutsidePeriod = false;
  try {
    await claimService.evaluateClaim({
      policyId: createdPolicy.id,
      assessmentId,
      riskEventId: outsidePeriodEventId,
      payoutConfig: approvedPayoutConfig,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('outside the policy coverage window')) {
      caughtOutsidePeriod = true;
    }
  }
  assert(caughtOutsidePeriod, '2.2 Risk event outside policy coverage window rejected with HTTP 400 Bad Request');

  // 2.3 Rejection of uncovered hazard type
  let caughtUncoveredHazard = false;
  try {
    await claimService.evaluateClaim({
      policyId: createdPolicy.id,
      assessmentId,
      riskEventId: uncoveredHazardEventId,
      payoutConfig: approvedPayoutConfig,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('not included in the covered hazards')) {
      caughtUncoveredHazard = true;
    }
  }
  assert(caughtUncoveredHazard, '2.3 Uncovered hazard type rejected with HTTP 400 Bad Request');

  // 2.4 SEC-10.2-01: Client attempt to tamper multiplier (e.g. HIGH: 0.10) is ignored; server calculates payout at authoritative 50%
  const tamperedClientConfig: PayoutConfiguration = {
    severityMultipliers: {
      [RiskSeverity.HIGH]: 0.10, // Attacker tries to alter multiplier
    },
  };

  // 2.5 Successful claim evaluation produces PENDING claim
  const evaluatedClaim = await claimService.evaluateClaim({
    policyId: createdPolicy.id,
    assessmentId,
    riskEventId,
    payoutConfig: tamperedClientConfig,
  });

  assert(evaluatedClaim.status === ClaimStatus.PENDING, '2.5 Evaluated claim is created in PENDING status');
  // High severity multiplier = 0.50 of sumInsured (125,000.00 * 0.50 = 62,500.00)
  assert(evaluatedClaim.payoutAmount === '62500.00', '2.6 Payout amount calculated using server-authoritative 50% severity multiplier (62,500.00), ignoring client tampering');
  assert(evaluatedClaim.triggerRuleCode === 'HEAVY_RAINFALL_24H', '2.7 Trigger rule code matches IMD rule code');

  // Verify that policy cumulativePaidAmount has NOT changed
  const policyPostEval = await policyRepo.findById(createdPolicy.id);
  assert(
    policyPostEval!.cumulativePaidAmount.equals(new Prisma.Decimal('0.00')),
    '2.8 Policy cumulativePaidAmount is UNCHANGED (0.00) after claim evaluation'
  );

  // 2.6 Duplicate claim evaluation on identical event rejected (idempotency)
  let caughtDupClaim = false;
  try {
    await claimService.evaluateClaim({
      policyId: createdPolicy.id,
      assessmentId,
      riskEventId,
      payoutConfig: approvedPayoutConfig,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 409 && err.message.includes('already exists')) {
      caughtDupClaim = true;
    }
  }
  assert(caughtDupClaim, '2.9 Re-evaluating claim for identical (policyId, riskEventId) rejected with HTTP 409 Conflict');

  // 2.7 Claim Approval transitions to APPROVED without incrementing policy balance
  const approvedClaim = await claimService.approveClaim(evaluatedClaim.id);
  assert(approvedClaim.status === ClaimStatus.APPROVED, '2.10 Claim approval transitions claim to APPROVED status');

  const policyPostApprove = await policyRepo.findById(createdPolicy.id);
  assert(
    policyPostApprove!.cumulativePaidAmount.equals(new Prisma.Decimal('0.00')),
    '2.11 Policy cumulativePaidAmount is UNCHANGED (0.00) after claim approval'
  );

  // 2.8 Claim Settlement executes simulated payout and atomically increments policy balance
  const settledClaim = await claimService.settleClaim(evaluatedClaim.id);
  assert(settledClaim.status === ClaimStatus.PAID, '2.12 Successful settlement transitions claim to PAID status');
  assert(settledClaim.payoutReference !== null && settledClaim.payoutReference.startsWith('SIM-PAYOUT-'), '2.13 Settlement generates simulated payout reference (SIM-PAYOUT- prefix)');
  assert(settledClaim.paidAt !== null, '2.14 Settlement populates paidAt timestamp');

  const policyPostSettle = await policyRepo.findById(createdPolicy.id);
  assert(
    policyPostSettle!.cumulativePaidAmount.equals(new Prisma.Decimal('62500.00')),
    '2.15 Policy cumulativePaidAmount is atomically incremented by exactly 62,500.00'
  );

  // 2.9 Second settlement attempt on already settled claim is rejected
  let caughtDoubleSettle = false;
  try {
    await claimService.settleClaim(evaluatedClaim.id);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('already been settled')) {
      caughtDoubleSettle = true;
    }
  }
  assert(caughtDoubleSettle, '2.16 Re-settling an already paid claim rejected with HTTP 400 Bad Request');

  // 2.10 Transaction rollback simulation when policy limit exceeded
  // Create a second claim for another event with VERY_HIGH severity (100% of sumInsured = 125,000.00)
  // Remaining coverage on policy is only 125,000 - 62,500 = 62,500.
  // When evaluated, payout is capped at remaining 62,500.
  const secondEventId = 'event-uuid-2';
  mockAssessment.riskEvents.push({
    id: secondEventId,
    assessmentId,
    riskRuleId: 'rule-uuid-1',
    observedValue: new Prisma.Decimal('120.00'),
    thresholdValue: new Prisma.Decimal('64.50'),
    unit: 'MM',
    severity: RiskSeverity.VERY_HIGH,
    triggered: true,
    explanation: 'Met threshold',
    observedAt: new Date('2026-07-21T10:00:00.000Z'),
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    riskRule: mockAssessment.riskEvents[0].riskRule,
  });

  const secondClaim = await claimService.evaluateClaim({
    policyId: createdPolicy.id,
    assessmentId,
    riskEventId: secondEventId,
    payoutConfig: approvedPayoutConfig,
  });
  // Cap enforced: remaining coverage 62,500
  assert(secondClaim.payoutAmount === '62500.00', '2.17 Second claim payout is strictly capped by remaining coverage limit (62,500.00)');

  // 2.17a Attempting to settle a PENDING claim before approval is rejected
  let caughtPendingSettlePart2 = false;
  try {
    await claimService.settleClaim(secondClaim.id);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('before approval')) {
      caughtPendingSettlePart2 = true;
    }
  }
  assert(caughtPendingSettlePart2, '2.17a Attempting to settle a PENDING claim rejected with HTTP 400 Bad Request');

  const policyPreSettle2 = await policyRepo.findById(createdPolicy.id);
  assert(
    policyPreSettle2!.cumulativePaidAmount.equals(new Prisma.Decimal('62500.00')),
    '2.17b Failed settlement attempt on PENDING claim leaves policy cumulativePaidAmount untouched at 62,500.00'
  );

  // Approve second claim prior to settlement
  const approvedClaim2 = await claimService.approveClaim(secondClaim.id);
  assert(approvedClaim2.status === ClaimStatus.APPROVED, '2.17c Second claim approved successfully');

  // Settle second claim -> exhausts policy completely
  const settledClaim2 = await claimService.settleClaim(secondClaim.id);
  assert(settledClaim2.status === ClaimStatus.PAID, '2.18 Second claim settled successfully');

  const policyExhausted = await policyRepo.findById(createdPolicy.id);
  assert(policyExhausted!.cumulativePaidAmount.equals(new Prisma.Decimal('125000.00')), '2.19 Policy reaches full sum insured (125,000.00)');
  assert(policyExhausted!.status === PolicyStatus.EXHAUSTED, '2.20 Policy status automatically transitions to EXHAUSTED upon reaching sum insured');

  // 2.11 Attempting to evaluate a third claim on exhausted policy is rejected
  const thirdEventId = 'event-uuid-3';
  mockAssessment.riskEvents.push({
    id: thirdEventId,
    assessmentId,
    riskRuleId: 'rule-uuid-1',
    observedValue: new Prisma.Decimal('130.00'),
    thresholdValue: new Prisma.Decimal('64.50'),
    unit: 'MM',
    severity: RiskSeverity.VERY_HIGH,
    triggered: true,
    explanation: 'Met threshold',
    observedAt: new Date('2026-07-22T10:00:00.000Z'),
    createdAt: new Date('2026-07-22T12:00:00.000Z'),
    riskRule: mockAssessment.riskEvents[0].riskRule,
  });

  let caughtExhaustedEval = false;
  try {
    await claimService.evaluateClaim({
      policyId: createdPolicy.id,
      assessmentId,
      riskEventId: thirdEventId,
      payoutConfig: approvedPayoutConfig,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('exhausted')) {
      caughtExhaustedEval = true;
    }
  }
  assert(caughtExhaustedEval, '2.21 Claim evaluation against EXHAUSTED policy rejected with HTTP 400 Bad Request');

  // ---------------------------------------------------------------------------
  // PART 3: STAGE 9.3 HARDENING & CONCURRENCY TESTS
  // ---------------------------------------------------------------------------
  console.log('\n--- PART 3: Stage 9.3 Hardening & Concurrency Tests ---');

  // 3.1 Injected failure after settlement's first database mutation rolls back both claim state and policy balance
  const polRollback = await policyRepo.createPolicy({
    id: 'pol-rollback-uuid-1',
    policyNumber: 'POL-ROLLBACK-001',
    farmId,
    farmerId,
    cropName: 'Cotton',
    sumInsured: new Prisma.Decimal('100000.00'),
    premiumAmount: new Prisma.Decimal('5000.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-11-30T23:59:59.000Z'),
    cumulativePaidAmount: new Prisma.Decimal('0.00'),
    status: PolicyStatus.ACTIVE,
  });

  const claimRollback = await claimRepo.createClaim({
    id: 'clm-rollback-uuid-1',
    claimNumber: 'CLM-ROLLBACK-001',
    policyId: polRollback.id,
    assessmentId,
    riskEventId: 'event-rollback-1',
    triggerRuleCode: 'HEAVY_RAINFALL_24H',
    severity: RiskSeverity.HIGH,
    observedValue: new Prisma.Decimal('75.00'),
    thresholdValue: new Prisma.Decimal('64.50'),
    payoutAmount: new Prisma.Decimal('50000.00'),
    status: ClaimStatus.APPROVED,
  });

  // Inject failure after the first database mutation (policy balance update)
  mockPrismaTx.shouldFailClaimUpdate = true;
  let caughtInjectedFailure = false;
  try {
    await claimService.settleClaim(claimRollback.id);
  } catch (err: any) {
    if (err && err.message && err.message.includes('Injected database failure')) {
      caughtInjectedFailure = true;
    }
  }
  mockPrismaTx.shouldFailClaimUpdate = false; // Reset injector

  assert(caughtInjectedFailure, '3.1 Injected failure after first database mutation is caught');
  const policyAfterFailedSettle = await policyRepo.findById(polRollback.id);
  assert(
    policyAfterFailedSettle!.cumulativePaidAmount.equals(new Prisma.Decimal('0.00')),
    '3.2 Policy balance successfully rolled back to pre-mutation balance (0.00)'
  );
  const claimAfterFailedSettle = await claimRepo.findById(claimRollback.id);
  assert(
    claimAfterFailedSettle!.status === ClaimStatus.APPROVED,
    '3.3 Claim status successfully rolled back to APPROVED (not marked PAID)'
  );
  assert(
    claimAfterFailedSettle!.payoutReference === null,
    '3.4 Claim payoutReference remained null after rollback'
  );

  // 3.2 Concurrent duplicate evaluations on same (policyId, riskEventId)
  const polConcurrent = await policyRepo.createPolicy({
    id: 'pol-concurrent-uuid-1',
    policyNumber: 'POL-CONC-001',
    farmId,
    farmerId,
    cropName: 'Cotton',
    sumInsured: new Prisma.Decimal('100000.00'),
    premiumAmount: new Prisma.Decimal('5000.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-11-30T23:59:59.000Z'),
    cumulativePaidAmount: new Prisma.Decimal('0.00'),
    status: PolicyStatus.ACTIVE,
  });

  const concurrentEventId = 'event-conc-duplicate-1';
  mockAssessment.riskEvents.push({
    id: concurrentEventId,
    assessmentId,
    riskRuleId: 'rule-uuid-1',
    observedValue: new Prisma.Decimal('80.00'),
    thresholdValue: new Prisma.Decimal('64.50'),
    unit: 'MM',
    severity: RiskSeverity.HIGH,
    triggered: true,
    explanation: 'Threshold met',
    observedAt: new Date('2026-07-23T10:00:00.000Z'),
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    riskRule: mockAssessment.riskEvents[0].riskRule,
  });

  const [evalResult1, evalResult2] = await Promise.allSettled([
    claimService.evaluateClaim({
      policyId: polConcurrent.id,
      assessmentId,
      riskEventId: concurrentEventId,
      payoutConfig: approvedPayoutConfig,
    }),
    claimService.evaluateClaim({
      policyId: polConcurrent.id,
      assessmentId,
      riskEventId: concurrentEventId,
      payoutConfig: approvedPayoutConfig,
    }),
  ]);

  const evalFulfilled = [evalResult1, evalResult2].filter((r) => r.status === 'fulfilled').length;
  const evalRejected = [evalResult1, evalResult2].filter((r) => r.status === 'rejected').length;

  assert(evalFulfilled === 1, '3.5 Exactly one concurrent evaluation succeeds (fulfilled)');
  assert(evalRejected === 1, '3.6 Exactly one concurrent evaluation is rejected (rejected)');

  const rejectedEval = [evalResult1, evalResult2].find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert(
    rejectedEval.reason instanceof AppError &&
    rejectedEval.reason.statusCode === 409 &&
    rejectedEval.reason.message.includes('already exists'),
    '3.7 Concurrent duplicate evaluation rejected with HTTP 409 Conflict'
  );

  const persistedDuplicateClaims = claimRepo.claims.filter(
    (c) => c.policyId === polConcurrent.id && c.riskEventId === concurrentEventId
  );
  assert(persistedDuplicateClaims.length === 1, '3.8 Exactly one claim record persisted for duplicate evaluation');

  // 3.3 Concurrent settlements on different claims for same policy where combined payout exceeds remaining coverage
  const polConcSettle = await policyRepo.createPolicy({
    id: 'pol-concurrent-settle-uuid-1',
    policyNumber: 'POL-CONC-SETTLE-001',
    farmId,
    farmerId,
    cropName: 'Cotton',
    sumInsured: new Prisma.Decimal('100000.00'),
    premiumAmount: new Prisma.Decimal('5000.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-11-30T23:59:59.000Z'),
    cumulativePaidAmount: new Prisma.Decimal('0.00'),
    status: PolicyStatus.ACTIVE,
  });

  // Claim A: Payout 60,000.00
  const claimA = await claimRepo.createClaim({
    id: 'clm-conc-a-1',
    claimNumber: 'CLM-CONC-A-001',
    policyId: polConcSettle.id,
    assessmentId,
    riskEventId: 'event-conc-settle-a',
    triggerRuleCode: 'HEAVY_RAINFALL_24H',
    severity: RiskSeverity.HIGH,
    observedValue: new Prisma.Decimal('85.00'),
    thresholdValue: new Prisma.Decimal('64.50'),
    payoutAmount: new Prisma.Decimal('60000.00'),
    status: ClaimStatus.APPROVED,
  });

  // Claim B: Payout 60,000.00
  const claimB = await claimRepo.createClaim({
    id: 'clm-conc-b-1',
    claimNumber: 'CLM-CONC-B-001',
    policyId: polConcSettle.id,
    assessmentId,
    riskEventId: 'event-conc-settle-b',
    triggerRuleCode: 'HEAVY_RAINFALL_24H',
    severity: RiskSeverity.HIGH,
    observedValue: new Prisma.Decimal('90.00'),
    thresholdValue: new Prisma.Decimal('64.50'),
    payoutAmount: new Prisma.Decimal('60000.00'),
    status: ClaimStatus.APPROVED,
  });

  // Dispatch both settlements concurrently. Total attempted payout = 120,000 against 100,000 limit.
  const [settleResultA, settleResultB] = await Promise.allSettled([
    claimService.settleClaim(claimA.id),
    claimService.settleClaim(claimB.id),
  ]);

  const settleFulfilledCount = [settleResultA, settleResultB].filter((r) => r.status === 'fulfilled').length;
  const settleRejectedCount = [settleResultA, settleResultB].filter((r) => r.status === 'rejected').length;

  assert(settleFulfilledCount === 1, '3.9 Exactly one concurrent settlement succeeds');
  assert(settleRejectedCount === 1, '3.10 Exactly one concurrent settlement is rejected');

  const rejectedSettle = [settleResultA, settleResultB].find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert(
    rejectedSettle.reason instanceof AppError &&
    rejectedSettle.reason.statusCode === 400 &&
    rejectedSettle.reason.message.includes('exceeds remaining coverage'),
    '3.11 Over-subscribing concurrent settlement rejected with HTTP 400 Bad Request'
  );

  const policyPostConcurrentSettle = await policyRepo.findById(polConcSettle.id);
  assert(
    policyPostConcurrentSettle!.cumulativePaidAmount.equals(new Prisma.Decimal('60000.00')),
    '3.12 Policy cumulativePaidAmount is exactly 60,000.00 (not over-subscribed to 120,000.00)'
  );

  const paidClaimsCount = [
    await claimRepo.findById(claimA.id),
    await claimRepo.findById(claimB.id),
  ].filter((c) => c?.status === ClaimStatus.PAID).length;
  assert(paidClaimsCount === 1, '3.13 Exactly one claim reached PAID status');

  const approvedClaimsCount = [
    await claimRepo.findById(claimA.id),
    await claimRepo.findById(claimB.id),
  ].filter((c) => c?.status === ClaimStatus.APPROVED).length;
  assert(approvedClaimsCount === 1, '3.14 Rejected claim remained in APPROVED status with balance untarnished');

  // 3.4 Consistency check: PENDING, APPROVED, and REJECTED claims do not increase paid balance
  const polConsistency = await policyRepo.createPolicy({
    id: 'pol-consistency-uuid-1',
    policyNumber: 'POL-CONST-001',
    farmId,
    farmerId,
    cropName: 'Cotton',
    sumInsured: new Prisma.Decimal('50000.00'),
    premiumAmount: new Prisma.Decimal('2500.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-11-30T23:59:59.000Z'),
    cumulativePaidAmount: new Prisma.Decimal('0.00'),
    status: PolicyStatus.ACTIVE,
  });

  const claimPending = await claimRepo.createClaim({
    id: 'clm-pending-uuid-1',
    claimNumber: 'CLM-PENDING-001',
    policyId: polConsistency.id,
    assessmentId,
    riskEventId: 'event-consistency-1',
    triggerRuleCode: 'HEAVY_RAINFALL_24H',
    severity: RiskSeverity.HIGH,
    thresholdValue: new Prisma.Decimal('64.50'),
    payoutAmount: new Prisma.Decimal('15000.00'),
    status: ClaimStatus.PENDING,
  });
  let polCheck = await policyRepo.findById(polConsistency.id);
  assert(polCheck!.cumulativePaidAmount.equals(new Prisma.Decimal('0.00')), '3.15 Policy cumulativePaidAmount is 0.00 when claim is PENDING');

  // Test: Attempting to settle PENDING claim before approval is rejected
  let caughtPendingSettlePart3 = false;
  try {
    await claimService.settleClaim(claimPending.id);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('before approval')) {
      caughtPendingSettlePart3 = true;
    }
  }
  assert(caughtPendingSettlePart3, '3.15a Settlement of PENDING claim rejected with HTTP 400 Bad Request');
  polCheck = await policyRepo.findById(polConsistency.id);
  assert(polCheck!.cumulativePaidAmount.equals(new Prisma.Decimal('0.00')), '3.15b Failed settlement attempt on PENDING claim leaves policy balance unchanged at 0.00');

  const claimApproved = await claimService.approveClaim(claimPending.id);
  polCheck = await policyRepo.findById(polConsistency.id);
  assert(polCheck!.cumulativePaidAmount.equals(new Prisma.Decimal('0.00')), '3.16 Policy cumulativePaidAmount is 0.00 when claim is APPROVED');

  const claimToReject = await claimRepo.createClaim({
    id: 'clm-reject-uuid-1',
    claimNumber: 'CLM-REJECT-001',
    policyId: polConsistency.id,
    assessmentId,
    riskEventId: 'event-consistency-2',
    triggerRuleCode: 'HEAVY_RAINFALL_24H',
    severity: RiskSeverity.HIGH,
    thresholdValue: new Prisma.Decimal('64.50'),
    payoutAmount: new Prisma.Decimal('10000.00'),
    status: ClaimStatus.PENDING,
  });
  await claimService.rejectClaim(claimToReject.id, 'Unverified field report');
  polCheck = await policyRepo.findById(polConsistency.id);
  assert(polCheck!.cumulativePaidAmount.equals(new Prisma.Decimal('0.00')), '3.17 Policy cumulativePaidAmount is 0.00 when claim is REJECTED');

  // Test: Attempting to settle REJECTED claim is rejected
  let caughtRejectedSettlePart3 = false;
  try {
    await claimService.settleClaim(claimToReject.id);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('Cannot settle rejected claim')) {
      caughtRejectedSettlePart3 = true;
    }
  }
  assert(caughtRejectedSettlePart3, '3.17a Settlement of REJECTED claim rejected with HTTP 400 Bad Request');
  polCheck = await policyRepo.findById(polConsistency.id);
  assert(polCheck!.cumulativePaidAmount.equals(new Prisma.Decimal('0.00')), '3.17b Failed settlement attempt on REJECTED claim leaves policy balance unchanged at 0.00');

  // Test: Settling APPROVED claim succeeds
  const settledApprovedClaim = await claimService.settleClaim(claimApproved.id);
  assert(settledApprovedClaim.status === ClaimStatus.PAID, '3.18 APPROVED claim settles successfully to PAID status');
  polCheck = await policyRepo.findById(polConsistency.id);
  assert(polCheck!.cumulativePaidAmount.equals(new Prisma.Decimal('15000.00')), '3.18a Policy cumulativePaidAmount increments ONLY on successful settlement (15,000.00)');

  // Test: Attempting to re-settle already-PAID claim is rejected
  let caughtPaidSettlePart3 = false;
  try {
    await claimService.settleClaim(claimApproved.id);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('already been settled')) {
      caughtPaidSettlePart3 = true;
    }
  }
  assert(caughtPaidSettlePart3, '3.18b Settlement of already-PAID claim rejected with HTTP 400 Bad Request');
  polCheck = await policyRepo.findById(polConsistency.id);
  assert(polCheck!.cumulativePaidAmount.equals(new Prisma.Decimal('15000.00')), '3.18c Failed settlement attempt on PAID claim leaves policy balance unchanged at 15,000.00');

  // ---------------------------------------------------------------------------
  // PART 4: SEC-10.2-01 SERVER-AUTHORITATIVE MULTIPLIERS & INTEGRITY SUITE
  // ---------------------------------------------------------------------------
  console.log('\n--- PART 4: SEC-10.2-01 Server-Authoritative Multipliers & Payout Integrity ---');

  // 4.1 Authoritative multipliers verification
  assert(AUTHORITATIVE_SEVERITY_MULTIPLIERS[RiskSeverity.LOW] === 0.25, '4.1a Authoritative LOW multiplier is exactly 0.25 (25%)');
  assert(AUTHORITATIVE_SEVERITY_MULTIPLIERS[RiskSeverity.MODERATE] === 0.40, '4.1b Authoritative MODERATE multiplier is exactly 0.40 (40%)');
  assert(AUTHORITATIVE_SEVERITY_MULTIPLIERS[RiskSeverity.HIGH] === 0.50, '4.1c Authoritative HIGH multiplier is exactly 0.50 (50%)');
  assert(AUTHORITATIVE_SEVERITY_MULTIPLIERS[RiskSeverity.VERY_HIGH] === 1.00, '4.1d Authoritative VERY_HIGH multiplier is exactly 1.00 (100%)');

  // Create isolated policy for security verification (Sum Insured: ₹100,000.00)
  const polSecurity = await policyRepo.createPolicy({
    id: 'pol-security-uuid-1',
    policyNumber: 'POL-SECURITY-001',
    farmId,
    farmerId,
    cropName: 'Cotton',
    sumInsured: new Prisma.Decimal('100000.00'),
    premiumAmount: new Prisma.Decimal('5000.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-11-30T23:59:59.000Z'),
    cumulativePaidAmount: new Prisma.Decimal('0.00'),
    status: PolicyStatus.ACTIVE,
  });

  const secLowEventId = 'event-sec-low-1';
  const secModEventId = 'event-sec-mod-1';
  const secVhEventId = 'event-sec-vh-1';

  mockAssessment.riskEvents.push(
    {
      id: secLowEventId,
      assessmentId,
      riskRuleId: 'rule-uuid-1',
      observedValue: new Prisma.Decimal('30.00'),
      thresholdValue: new Prisma.Decimal('25.00'),
      unit: 'MM',
      severity: RiskSeverity.LOW,
      triggered: true,
      explanation: 'Low severity rainfall event',
      observedAt: new Date('2026-07-20T10:00:00.000Z'),
      createdAt: new Date('2026-07-20T12:00:00.000Z'),
      riskRule: mockAssessment.riskEvents[0].riskRule,
    },
    {
      id: secModEventId,
      assessmentId,
      riskRuleId: 'rule-uuid-1',
      observedValue: new Prisma.Decimal('45.00'),
      thresholdValue: new Prisma.Decimal('40.00'),
      unit: 'MM',
      severity: RiskSeverity.MODERATE,
      triggered: true,
      explanation: 'Moderate severity rainfall event',
      observedAt: new Date('2026-07-20T10:00:00.000Z'),
      createdAt: new Date('2026-07-20T12:00:00.000Z'),
      riskRule: mockAssessment.riskEvents[0].riskRule,
    },
    {
      id: secVhEventId,
      assessmentId,
      riskRuleId: 'rule-uuid-1',
      observedValue: new Prisma.Decimal('150.00'),
      thresholdValue: new Prisma.Decimal('100.00'),
      unit: 'MM',
      severity: RiskSeverity.VERY_HIGH,
      triggered: true,
      explanation: 'Very high severity rainfall event',
      observedAt: new Date('2026-07-20T10:00:00.000Z'),
      createdAt: new Date('2026-07-20T12:00:00.000Z'),
      riskRule: mockAssessment.riskEvents[0].riskRule,
    }
  );

  // 4.2 LOW severity evaluation with client attempting to tamper LOW to 1.0 (100%)
  const claimSecLow = await claimService.evaluateClaim({
    policyId: polSecurity.id,
    assessmentId,
    riskEventId: secLowEventId,
    payoutConfig: {
      severityMultipliers: { [RiskSeverity.LOW]: 1.0 }, // Client tries to inflate to 100%!
    },
  });
  assert(claimSecLow.payoutAmount === '25000.00', '4.2 LOW severity produces strictly 25% payout (₹25,000.00) despite client tampered 1.0 multiplier');

  // 4.3 MODERATE severity evaluation with payoutConfig completely omitted
  const polSecurity2 = await policyRepo.createPolicy({
    id: 'pol-security-uuid-2',
    policyNumber: 'POL-SECURITY-002',
    farmId,
    farmerId,
    cropName: 'Cotton',
    sumInsured: new Prisma.Decimal('100000.00'),
    premiumAmount: new Prisma.Decimal('5000.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-11-30T23:59:59.000Z'),
    cumulativePaidAmount: new Prisma.Decimal('0.00'),
    status: PolicyStatus.ACTIVE,
  });
  const claimSecMod = await claimService.evaluateClaim({
    policyId: polSecurity2.id,
    assessmentId,
    riskEventId: secModEventId,
    // Omitting payoutConfig entirely
  });
  assert(claimSecMod.payoutAmount === '40000.00', '4.3 MODERATE severity produces strictly 40% payout (₹40,000.00) when payoutConfig is completely omitted');

  // 4.4 VERY_HIGH severity evaluation produces 100% payout
  const polSecurity3 = await policyRepo.createPolicy({
    id: 'pol-security-uuid-3',
    policyNumber: 'POL-SECURITY-003',
    farmId,
    farmerId,
    cropName: 'Cotton',
    sumInsured: new Prisma.Decimal('100000.00'),
    premiumAmount: new Prisma.Decimal('5000.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-11-30T23:59:59.000Z'),
    cumulativePaidAmount: new Prisma.Decimal('0.00'),
    status: PolicyStatus.ACTIVE,
  });
  const claimSecVh = await claimService.evaluateClaim({
    policyId: polSecurity3.id,
    assessmentId,
    riskEventId: secVhEventId,
  });
  assert(claimSecVh.payoutAmount === '100000.00', '4.4 VERY_HIGH severity produces strictly 100% payout (₹100,000.00)');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed across all checkpoints`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStage93UnitTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
