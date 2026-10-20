/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.4: Policy & Claims REST API Integration Test Suite
 *
 * Verifies end-to-end HTTP request dispatch across Express server:
 * - JWT authentication (authenticateJwt) on all endpoints
 * - Farm ownership authorization (authorizeFarmAccess) on farm-nested sub-routes
 * - Request validation via Zod (body, params, query) with HTTP 400 / 404 / 409 mapping
 * - Policy lifecycle: PENDING creation -> distinct validated issuance (ACTIVE)
 * - Claim evaluation against authoritative Module 6 assessments & triggered events
 * - Claim lifecycle: PENDING evaluation -> APPROVAL -> simulated transactional SETTLEMENT -> REJECTION
 * - Atomic policy balance decrement and EXHAUSTED transition upon reaching sum insured
 * - Strict decoupling from Module 8 (ML risk prediction / SHAP features never determine eligibility)
 */

import http from 'http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { strict as assert } from 'node:assert';
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
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.config.js';
import { farmRepository } from '../../src/repositories/farm.repository.js';
import { policyController } from '../../src/controllers/policy.controller.js';
import { claimController } from '../../src/controllers/claim.controller.js';
import { PolicyService } from '../../src/services/policy.service.js';
import { ClaimService } from '../../src/services/claim.service.js';
import { IPolicyRepository } from '../../src/types/policy.types.js';
import { IClaimRepository } from '../../src/types/claim.types.js';
import { IFarmRepository } from '../../src/types/farm.types.js';
import { IFarmerRepository } from '../../src/types/farmer.types.js';
import { IFarmBoundaryRepository, RawBoundaryResult } from '../../src/types/farmBoundary.types.js';
import { IRiskRepository, RiskAssessmentWithEvents } from '../../src/types/risk.types.js';
import { AppError } from '../../src/utils/apiError.js';

// ============================================================================
// Constants & UUID Fixtures
// ============================================================================
const FARMER_A_ID = '11111111-1111-4111-8111-111111111111';
const FARMER_B_ID = '22222222-2222-4222-8222-222222222222';
const FARM_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FARM_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NON_EXISTENT_FARM_ID = '99999999-9999-4999-8999-999999999999';

const ASSESSMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RISK_EVENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const UNTRIGGERED_EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function generateToken(userId: string, role?: string, expiresIn: string = '1h'): string {
  const payload: any = { id: userId, email: `${userId}@example.com` };
  if (role) payload.role = role;
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

// ============================================================================
// In-Memory Mock Repositories
// ============================================================================

class MockPolicyRepository implements IPolicyRepository {
  public policies: Policy[] = [];

  async createPolicy(data: any): Promise<Policy> {
    const newPolicy: Policy = {
      id: data.id || crypto.randomUUID(),
      policyNumber: data.policyNumber,
      farmId: data.farmId,
      farmerId: data.farmerId,
      cropName: data.cropName,
      sumInsured: new Prisma.Decimal(data.sumInsured.toString()),
      premiumAmount: new Prisma.Decimal(data.premiumAmount.toString()),
      coveredHazards: data.coveredHazards,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      cumulativePaidAmount: new Prisma.Decimal(data.cumulativePaidAmount ? data.cumulativePaidAmount.toString() : '0.00'),
      status: data.status || PolicyStatus.PENDING,
      createdAt: new Date('2026-10-13T09:00:00.000Z'),
      updatedAt: new Date('2026-10-13T09:00:00.000Z'),
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
    const ref = referenceDate.getTime();
    return (
      this.policies.find((p) => {
        if (p.farmId !== farmId) return false;
        if (p.status !== PolicyStatus.ACTIVE) return false;
        const s = new Date(p.startDate).getTime();
        const e = new Date(p.endDate).getTime();
        return ref >= s && ref <= e;
      }) || null
    );
  }

  async updatePolicyStatus(id: string, status: PolicyStatus): Promise<Policy> {
    const policy = this.policies.find((p) => p.id === id);
    if (!policy) throw AppError.notFound(`Policy with ID '${id}' not found`);
    policy.status = status;
    policy.updatedAt = new Date('2026-10-13T10:00:00.000Z');
    return policy;
  }

  async updatePolicyBalanceAndStatus(id: string, data: any, _tx?: any): Promise<Policy> {
    const policy = this.policies.find((p) => p.id === id);
    if (!policy) throw AppError.notFound(`Policy with ID '${id}' not found`);

    const payoutInc = new Prisma.Decimal(data.payoutIncrement.toString());
    const currentPaid = new Prisma.Decimal(policy.cumulativePaidAmount);
    const sumInsured = new Prisma.Decimal(policy.sumInsured);
    const newPaid = currentPaid.add(payoutInc);

    if (newPaid.greaterThan(sumInsured)) {
      throw AppError.badRequest(
        `Payout increment of ${payoutInc.toFixed(2)} exceeds remaining sum insured`
      );
    }

    policy.cumulativePaidAmount = newPaid;
    if (newPaid.equals(sumInsured)) {
      policy.status = PolicyStatus.EXHAUSTED;
    }
    policy.updatedAt = new Date('2026-10-13T11:00:00.000Z');
    return policy;
  }
}

class MockClaimRepository implements IClaimRepository {
  public claims: Claim[] = [];

  async createClaim(data: any): Promise<Claim> {
    const existing = await this.findClaimByPolicyAndRiskEvent(data.policyId, data.riskEventId);
    if (existing) {
      throw AppError.conflict(
        `A claim for policy '${data.policyId}' and risk event '${data.riskEventId}' already exists`
      );
    }

    const newClaim: Claim = {
      id: data.id || crypto.randomUUID(),
      claimNumber: data.claimNumber,
      policyId: data.policyId,
      assessmentId: data.assessmentId,
      riskEventId: data.riskEventId,
      triggerRuleCode: data.triggerRuleCode,
      severity: data.severity,
      observedValue: data.observedValue ? new Prisma.Decimal(data.observedValue.toString()) : null,
      thresholdValue: new Prisma.Decimal(data.thresholdValue.toString()),
      payoutAmount: new Prisma.Decimal(data.payoutAmount.toString()),
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
    return this.claims.find((c) => c.id === id || c.claimNumber === id) || null;
  }

  async findByPolicyId(policyId: string): Promise<Claim[]> {
    return this.claims.filter((c) => c.policyId === policyId);
  }

  async findByFarmId(_farmId: string): Promise<Claim[]> {
    return this.claims;
  }

  async findClaimByPolicyAndRiskEvent(policyId: string, riskEventId: string): Promise<Claim | null> {
    return this.claims.find((c) => c.policyId === policyId && c.riskEventId === riskEventId) || null;
  }

  async updateClaimStatus(id: string, data: any): Promise<Claim> {
    const claim = this.claims.find((c) => c.id === id);
    if (!claim) throw AppError.notFound(`Claim with ID '${id}' not found`);
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
  async create(_data: any): Promise<Farm> { throw new Error('Not implemented'); }
  async update(_id: string, _data: any): Promise<Farm> { throw new Error('Not implemented'); }
  async delete(_id: string): Promise<Farm> { throw new Error('Not implemented'); }
  async findAll(): Promise<Farm[]> { return this.farms; }
  async findByReferenceNumber(_ref: string): Promise<Farm | null> { return null; }
  async count(): Promise<number> { return this.farms.length; }
}

class MockFarmerRepository implements IFarmerRepository {
  public farmers: Farmer[] = [];
  async findById(id: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.id === id) || null;
  }
  async create(_data: any): Promise<Farmer> { throw new Error('Not implemented'); }
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
  constructor(public policyRepo: MockPolicyRepository, public claimRepo: MockClaimRepository) {}

  public claim = {
    findUnique: async ({ where }: any) => {
      return this.claimRepo.claims.find((c) => c.id === where.id) || null;
    },
    update: async ({ where, data }: any) => {
      return this.claimRepo.updateClaimStatus(where.id, data);
    },
  };

  public policy = {
    findUnique: async ({ where }: any) => {
      return this.policyRepo.policies.find((p) => p.id === where.id) || null;
    },
  };

  public async $transaction(fn: (tx: any) => Promise<any>): Promise<any> {
    return fn(this);
  }

  public async $queryRaw(): Promise<any> {
    return [];
  }
}

// ============================================================================
// Integration Test Runner
// ============================================================================

async function runStage94ApiIntegrationTests() {
  console.log('================================================================================');
  console.log('🧪 Running Module 9 Stage 9.4: Policy & Claims REST API Integration Test Suite');
  console.log('================================================================================\n');

  let passed = 0;

  // 1. Initialize Mock Repositories
  const mockPolicyRepo = new MockPolicyRepository();
  const mockClaimRepo = new MockClaimRepository();
  const mockFarmRepo = new MockFarmRepository();
  const mockFarmerRepo = new MockFarmerRepository();
  const mockBoundaryRepo = new MockBoundaryRepository();
  const mockRiskRepo = new MockRiskRepository();
  const mockDb = new MockPrismaTxClient(mockPolicyRepo, mockClaimRepo);

  // 2. Seed Baseline Entities
  const testFarmerA: Farmer = {
    id: FARMER_A_ID,
    fullName: 'Ramesh Patel',
    mobileNumber: '+919876543210',
    state: 'Maharashtra',
    district: 'Nashik',
    village: 'Dindori',
    pincode: '422202',
    preferredLanguage: Language.MARATHI,
    referenceNumber: 'FRM-2026-0001',
    createdAt: new Date('2026-10-13T08:00:00.000Z'),
    updatedAt: new Date('2026-10-13T08:00:00.000Z'),
  };
  mockFarmerRepo.farmers.push(testFarmerA);

  const testFarmerB: Farmer = {
    id: FARMER_B_ID,
    fullName: 'Suresh Rao',
    mobileNumber: '+919876543211',
    state: 'Maharashtra',
    district: 'Nagpur',
    village: 'Katol',
    pincode: '441302',
    preferredLanguage: Language.MARATHI,
    referenceNumber: 'FRM-2026-0002',
    createdAt: new Date('2026-10-13T08:00:00.000Z'),
    updatedAt: new Date('2026-10-13T08:00:00.000Z'),
  };
  mockFarmerRepo.farmers.push(testFarmerB);

  const testFarmA: Farm = {
    id: FARM_A_ID,
    farmerId: FARMER_A_ID,
    farmName: 'Green Valley Plot 1',
    cropName: 'Cotton',
    cropVariety: 'Bt Cotton',
    sowingDate: new Date('2026-06-01T00:00:00.000Z'),
    expectedHarvestDate: new Date('2026-11-30T00:00:00.000Z'),
    farmArea: 5.5,
    farmAreaUnit: AreaUnit.ACRE,
    state: 'Maharashtra',
    district: 'Nashik',
    village: 'Dindori',
    pincode: '422202',
    status: FarmStatus.ACTIVE,
    referenceNumber: 'FARM-2026-0001',
    createdAt: new Date('2026-10-13T08:00:00.000Z'),
    updatedAt: new Date('2026-10-13T08:00:00.000Z'),
  };
  mockFarmRepo.farms.push(testFarmA);

  const testFarmB: Farm = {
    id: FARM_B_ID,
    farmerId: FARMER_B_ID,
    farmName: 'Sunny Ridge Plot 2',
    cropName: 'Soybean',
    cropVariety: 'JS 335',
    sowingDate: new Date('2026-06-15T00:00:00.000Z'),
    expectedHarvestDate: new Date('2026-10-15T00:00:00.000Z'),
    farmArea: 3.0,
    farmAreaUnit: AreaUnit.ACRE,
    state: 'Maharashtra',
    district: 'Nagpur',
    village: 'Katol',
    pincode: '441302',
    status: FarmStatus.ACTIVE,
    referenceNumber: 'FARM-2026-0002',
    createdAt: new Date('2026-10-13T08:00:00.000Z'),
    updatedAt: new Date('2026-10-13T08:00:00.000Z'),
  };
  mockFarmRepo.farms.push(testFarmB);

  mockBoundaryRepo.boundaries.push({
    id: 'bnd-11111111-1111-4111-8111-111111111111',
    farmId: FARM_A_ID,
    geojson: '{"type":"Polygon","coordinates":[[[73.8,20.0],[73.81,20.0],[73.81,20.01],[73.8,20.01],[73.8,20.0]]]}',
    calculatedArea: 5.5,
    areaUnit: AreaUnit.ACRE,
    isValid: true,
    createdAt: new Date('2026-10-13T08:00:00.000Z'),
    updatedAt: new Date('2026-10-13T08:00:00.000Z'),
  });

  // Seed Authoritative Module 6 Assessment & Events
  const testAssessment: RiskAssessmentWithEvents = {
    id: ASSESSMENT_ID,
    farmId: FARM_A_ID,
    assessedAt: new Date('2026-07-15T12:00:00.000Z'),
    overallRiskLevel: RiskLevel.HIGH,
    overallScore: 78.5,
    summary: 'High parametric heatwave and rainfall deficit detected',
    triggeredRuleCount: 1,
    weatherContext: null,
    soilContext: null,
    vegetationContext: null,
    createdAt: new Date('2026-07-15T12:00:00.000Z'),
    riskEvents: [
      {
        id: RISK_EVENT_ID,
        assessmentId: ASSESSMENT_ID,
        riskRuleId: 'rule-heat-001',
        triggered: true,
        severity: RiskSeverity.HIGH,
        observedValue: new Prisma.Decimal('43.5'),
        thresholdValue: new Prisma.Decimal('40.0'),
        consecutiveDays: 5,
        observedAt: new Date('2026-07-15T12:00:00.000Z'),
        details: null,
        createdAt: new Date('2026-07-15T12:00:00.000Z'),
        riskRule: {
          id: 'rule-heat-001',
          code: 'PARAMETRIC_EXTREME_HEAT_RULE',
          name: 'Extreme Heatwave Parametric Rule',
          hazardType: RiskHazardType.HIGH_TEMPERATURE,
          measurement: RiskMeasurement.TEMPERATURE,
          severity: RiskSeverity.HIGH,
          sourceType: RiskSourceType.OFFICIAL_REFERENCE,
          thresholdValue: new Prisma.Decimal('40.0'),
          comparisonOperator: 'GREATER_THAN',
          unit: 'celsius',
          description: 'Triggers when maximum temperature exceeds 40C for sustained period',
          isActive: true,
          consecutiveDays: 3,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      },
      {
        id: UNTRIGGERED_EVENT_ID,
        assessmentId: ASSESSMENT_ID,
        riskRuleId: 'rule-wind-001',
        triggered: false,
        severity: RiskSeverity.LOW,
        observedValue: new Prisma.Decimal('18.0'),
        thresholdValue: new Prisma.Decimal('45.0'),
        consecutiveDays: 0,
        observedAt: new Date('2026-07-15T12:00:00.000Z'),
        details: null,
        createdAt: new Date('2026-07-15T12:00:00.000Z'),
        riskRule: {
          id: 'rule-wind-001',
          code: 'PARAMETRIC_WIND_RULE',
          name: 'High Wind Parametric Rule',
          hazardType: RiskHazardType.STRONG_WIND,
          measurement: RiskMeasurement.WIND_SPEED,
          severity: RiskSeverity.LOW,
          sourceType: RiskSourceType.OFFICIAL_REFERENCE,
          thresholdValue: new Prisma.Decimal('45.0'),
          comparisonOperator: 'GREATER_THAN',
          unit: 'km/h',
          description: 'Triggers when wind speed exceeds 45 km/h',
          isActive: true,
          consecutiveDays: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      },
    ],
  };
  mockRiskRepo.assessments.push(testAssessment);

  // 3. Instantiate and Inject Services into Controllers
  const policyService = new PolicyService(
    mockPolicyRepo,
    mockFarmRepo,
    mockFarmerRepo,
    mockBoundaryRepo
  );
  const claimService = new ClaimService(
    mockClaimRepo,
    mockPolicyRepo,
    mockRiskRepo,
    mockDb as any
  );

  policyController.setService(policyService);
  policyController.setFarmRepo(mockFarmRepo);
  claimController.setService(claimService);
  claimController.setPolicyRepo(mockPolicyRepo);
  claimController.setFarmRepo(mockFarmRepo);

  // 4. Mock farmRepository.findById for farmOwnership middleware
  const originalFindById = farmRepository.findById.bind(farmRepository);
  (farmRepository as any).findById = async (id: string) => {
    return mockFarmRepo.findById(id);
  };

  // 5. Start Express app on ephemeral port
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const tokenFarmerA = generateToken(FARMER_A_ID);
  const tokenFarmerB = generateToken(FARMER_B_ID);

  try {
    // =========================================================================
    console.log('--- SUITE 1: Authentication & Authorization Middleware ---');
    // =========================================================================

    // 1.1 Missing Authorization header returns 401
    {
      const res = await fetch(`${baseUrl}/api/v1/policies`);
      const body = await res.json();
      assert.equal(res.status, 401);
      assert.equal(body.success, false);
      assert.match(body.message, /Authorization token is missing or invalid/i);
      passed++;
      console.log('  ✅ PASSED: 1.1 Missing Authorization header rejected with HTTP 401 Unauthorized');
    }

    // 1.2 Invalid Bearer token returns 401
    {
      const res = await fetch(`${baseUrl}/api/v1/policies`, {
        headers: { Authorization: 'Bearer invalid.secret.token' },
      });
      const body = await res.json();
      assert.equal(res.status, 401);
      assert.equal(body.success, false);
      assert.match(body.message, /Invalid authentication token/i);
      passed++;
      console.log('  ✅ PASSED: 1.2 Malformed Bearer token rejected with HTTP 401 Unauthorized');
    }

    // 1.3 Expired token returns 401
    {
      const expiredToken = generateToken(FARMER_A_ID, undefined, '-10s');
      const res = await fetch(`${baseUrl}/api/v1/policies`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      const body = await res.json();
      assert.equal(res.status, 401);
      assert.equal(body.success, false);
      assert.match(body.message, /Token has expired/i);
      passed++;
      console.log('  ✅ PASSED: 1.3 Expired Bearer token rejected with HTTP 401 Unauthorized');
    }

    // 1.4 Farm policies sub-route rejects unauthorized farmer with 403 Forbidden
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_A_ID}/policies`, {
        headers: { Authorization: `Bearer ${tokenFarmerB}` },
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /Access denied: You do not have permission/i);
      passed++;
      console.log('  ✅ PASSED: 1.4 Farm policies sub-route rejects unauthorized farmer with HTTP 403 Forbidden');
    }

    // 1.5 Farm claims sub-route rejects unauthorized farmer with 403 Forbidden
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_A_ID}/claims`, {
        headers: { Authorization: `Bearer ${tokenFarmerB}` },
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /Access denied: You do not have permission/i);
      passed++;
      console.log('  ✅ PASSED: 1.5 Farm claims sub-route rejects unauthorized farmer with HTTP 403 Forbidden');
    }

    // 1.6 Non-existent farm returns 404 Not Found in farm-nested subroute
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${NON_EXISTENT_FARM_ID}/policies`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 404);
      assert.equal(body.success, false);
      assert.match(body.message, /Farm with ID .* not found/i);
      passed++;
      console.log('  ✅ PASSED: 1.6 Non-existent farm in subroute rejected with HTTP 404 Not Found');
    }

    // 1.7 Authorized farmer successfully accesses farm policies sub-route
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_A_ID}/policies`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.deepEqual(body.data, []);
      passed++;
      console.log('  ✅ PASSED: 1.7 Authorized farmer successfully accesses farm policies (HTTP 200)');
    }

    // 1.8 Authorized farmer successfully accesses farm claims sub-route
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_A_ID}/claims`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.deepEqual(body.data, []);
      passed++;
      console.log('  ✅ PASSED: 1.8 Authorized farmer successfully accesses farm claims (HTTP 200)');
    }

    // =========================================================================
    console.log('\n--- SUITE 2: Policy Management Endpoints ---');
    // =========================================================================

    let createdPolicyId = '';
    const validPolicyPayload = {
      farmId: FARM_A_ID,
      farmerId: FARMER_A_ID,
      cropName: 'Cotton',
      sumInsured: '100000.00',
      premiumAmount: '7500.00',
      coveredHazards: [RiskHazardType.HIGH_TEMPERATURE, RiskHazardType.HEAVY_RAINFALL],
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-11-30T00:00:00.000Z',
    };

    // 2.1 Policy creation in PENDING status
    {
      const res = await fetch(`${baseUrl}/api/v1/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify(validPolicyPayload),
      });
      const body = await res.json();
      assert.equal(res.status, 201);
      assert.equal(body.success, true);
      assert.equal(body.data.status, PolicyStatus.PENDING);
      assert.equal(body.data.sumInsured, '100000.00');
      assert.equal(body.data.cumulativePaidAmount, '0.00');
      assert.equal(body.data.remainingCoverage, '100000.00');
      assert.match(body.data.policyNumber, /^POL-/);
      createdPolicyId = body.data.id;
      passed++;
      console.log('  ✅ PASSED: 2.1 POST /api/v1/policies creates policy in PENDING status (HTTP 201)');
    }

    // 2.2 Object-level authorization: caller attempting to create policy for another farmer is rejected with 403
    {
      const res = await fetch(`${baseUrl}/api/v1/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`, // Authenticated as Farmer A
        },
        body: JSON.stringify({
          ...validPolicyPayload,
          farmId: FARM_B_ID,
          farmerId: FARMER_B_ID, // Mismatched farmer ID
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /cannot create a policy for another farmer/i);
      passed++;
      console.log('  ✅ PASSED: 2.2 Caller attempting to create policy for another farmer rejected with HTTP 403 Forbidden');
    }

    // 2.2b Boundary check: valid farmer on a farm parcel lacking boundary rejected with 400
    {
      const res = await fetch(`${baseUrl}/api/v1/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerB}`, // Authenticated as Farmer B
        },
        body: JSON.stringify({
          ...validPolicyPayload,
          farmId: FARM_B_ID,
          farmerId: FARMER_B_ID,
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2026-12-31T00:00:00.000Z',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.match(body.message, /lacks an established geospatial boundary/i);
      passed++;
      console.log('  ✅ PASSED: 2.2b Boundary check enforces farm eligibility during policy creation');
    }

    // 2.3 Invalid payload: missing cropName returns 400
    {
      const invalid = { ...validPolicyPayload };
      delete (invalid as any).cropName;
      const res = await fetch(`${baseUrl}/api/v1/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify(invalid),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.equal(body.message, 'Validation failed');
      passed++;
      console.log('  ✅ PASSED: 2.3 Missing required field returns HTTP 400 with Zod validation failure');
    }

    // 2.4 Invalid amount: negative sumInsured returns 400
    {
      const res = await fetch(`${baseUrl}/api/v1/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({ ...validPolicyPayload, sumInsured: -500 }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      passed++;
      console.log('  ✅ PASSED: 2.4 Negative sumInsured rejected with HTTP 400');
    }

    // 2.5 Premium exceeding sumInsured returns 400
    {
      const res = await fetch(`${baseUrl}/api/v1/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          ...validPolicyPayload,
          sumInsured: '5000.00',
          premiumAmount: '6000.00',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      passed++;
      console.log('  ✅ PASSED: 2.5 Premium amount exceeding sum insured rejected with HTTP 400');
    }

    // 2.6 End date earlier than start date returns 400
    {
      const res = await fetch(`${baseUrl}/api/v1/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          ...validPolicyPayload,
          startDate: '2026-11-30T00:00:00.000Z',
          endDate: '2026-06-01T00:00:00.000Z',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      passed++;
      console.log('  ✅ PASSED: 2.6 Reversed date window rejected with HTTP 400');
    }

    // 2.7 Overlapping active/pending policy for same farm rejected with 409 Conflict
    {
      const res = await fetch(`${baseUrl}/api/v1/policies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify(validPolicyPayload),
      });
      const body = await res.json();
      assert.equal(res.status, 409);
      assert.equal(body.success, false);
      assert.match(body.message, /already has an overlapping/i);
      passed++;
      console.log('  ✅ PASSED: 2.7 Overlapping policy creation rejected with HTTP 409 Conflict');
    }

    // 2.8 GET /api/v1/policies/:id retrieves policy
    {
      const res = await fetch(`${baseUrl}/api/v1/policies/${createdPolicyId}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.id, createdPolicyId);
      assert.equal(body.data.status, PolicyStatus.PENDING);
      passed++;
      console.log('  ✅ PASSED: 2.8 GET /api/v1/policies/:id retrieves policy details (HTTP 200)');
    }

    // 2.9 GET /api/v1/policies/:id non-existent UUID returns 404
    {
      const res = await fetch(`${baseUrl}/api/v1/policies/99999999-9999-4999-8999-999999999999`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 404);
      assert.equal(body.success, false);
      assert.match(body.message, /Policy with ID .* not found/i);
      passed++;
      console.log('  ✅ PASSED: 2.9 GET /api/v1/policies/:id returns HTTP 404 for non-existent policy');
    }

    // 2.10 Malformed UUID param returns 400
    {
      const res = await fetch(`${baseUrl}/api/v1/policies/invalid-not-uuid`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.equal(body.message, 'Validation failed');
      passed++;
      console.log('  ✅ PASSED: 2.10 Malformed policy UUID parameter rejected with HTTP 400');
    }

    // 2.11 POST /api/v1/policies/:id/issue activates policy
    {
      const res = await fetch(`${baseUrl}/api/v1/policies/${createdPolicyId}/issue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.status, PolicyStatus.ACTIVE);
      assert.match(body.message, /issued and activated successfully/i);
      passed++;
      console.log('  ✅ PASSED: 2.11 POST /api/v1/policies/:id/issue transitions policy to ACTIVE (HTTP 200)');
    }

    // 2.12 Re-issuing an already active policy returns 400
    {
      const res = await fetch(`${baseUrl}/api/v1/policies/${createdPolicyId}/issue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.match(body.message, /already ACTIVE/i);
      passed++;
      console.log('  ✅ PASSED: 2.12 Re-issuing already ACTIVE policy rejected with HTTP 400');
    }

    // 2.13 GET /api/v1/policies?farmId=<uuid>
    {
      const res = await fetch(`${baseUrl}/api/v1/policies?farmId=${FARM_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0].id, createdPolicyId);
      passed++;
      console.log('  ✅ PASSED: 2.13 GET /api/v1/policies?farmId=<uuid> retrieves farm policies');
    }

    // 2.14 GET /api/v1/farms/:farmId/policies/active
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_A_ID}/policies/active?referenceDate=2026-07-15T00:00:00.000Z`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.id, createdPolicyId);
      assert.equal(body.data.status, PolicyStatus.ACTIVE);
      passed++;
      console.log('  ✅ PASSED: 2.14 GET /api/v1/farms/:farmId/policies/active retrieves active policy during window');
    }

    // =========================================================================
    console.log('\n--- SUITE 3: Claim Management Endpoints ---');
    // =========================================================================

    let evaluatedClaimId = '';
    const validEvaluatePayload = {
      policyId: createdPolicyId,
      assessmentId: ASSESSMENT_ID,
      riskEventId: RISK_EVENT_ID,
      payoutConfig: {
        severityMultipliers: {
          [RiskSeverity.HIGH]: 0.5,
          [RiskSeverity.VERY_HIGH]: 1.0,
        },
      },
    };

    // 3.1 Claim evaluation against authoritative Module 6 assessment
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify(validEvaluatePayload),
      });
      const body = await res.json();
      assert.equal(res.status, 201);
      assert.equal(body.success, true);
      assert.equal(body.data.status, ClaimStatus.PENDING);
      assert.equal(body.data.severity, RiskSeverity.HIGH);
      // 50% of 100,000.00 = 50,000.00
      assert.equal(body.data.payoutAmount, '50000.00');
      assert.match(body.data.claimNumber, /^CLM-/);
      assert.equal(body.data.paidAt, null);
      assert.equal(body.data.payoutReference, null);
      evaluatedClaimId = body.data.id;
      passed++;
      console.log('  ✅ PASSED: 3.1 POST /api/v1/claims/evaluate creates claim in PENDING status (HTTP 201)');
    }

    // 3.2 Policy balance is NOT incremented upon evaluation
    {
      const policy = await mockPolicyRepo.findById(createdPolicyId);
      assert.equal(policy?.cumulativePaidAmount.toFixed(2), '0.00');
      passed++;
      console.log('  ✅ PASSED: 3.2 Evaluation creates PENDING claim without modifying policy cumulativePaidAmount');
    }

    // 3.3 Evaluating claim with untriggered risk event returns 400
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          ...validEvaluatePayload,
          riskEventId: UNTRIGGERED_EVENT_ID,
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.match(body.message, /was not triggered/i);
      passed++;
      console.log('  ✅ PASSED: 3.3 Untriggered risk event evaluation rejected with HTTP 400');
    }

    // 3.4 Duplicate claim evaluation on same (policyId, riskEventId) returns 409 Conflict
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify(validEvaluatePayload),
      });
      const body = await res.json();
      assert.equal(res.status, 409);
      assert.equal(body.success, false);
      assert.match(body.message, /already exists/i);
      passed++;
      console.log('  ✅ PASSED: 3.4 Duplicate claim evaluation on same risk event rejected with HTTP 409 Conflict');
    }

    // 3.5 Malformed payout configuration returns 400
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          policyId: createdPolicyId,
          assessmentId: ASSESSMENT_ID,
          riskEventId: RISK_EVENT_ID,
          payoutConfig: 'invalid_string_not_an_object',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.equal(body.message, 'Validation failed');
      passed++;
      console.log('  ✅ PASSED: 3.5 Malformed payout configuration rejected with HTTP 400');
    }

    // 3.6 GET /api/v1/claims/:id retrieves claim details
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${evaluatedClaimId}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.id, evaluatedClaimId);
      assert.equal(body.data.status, ClaimStatus.PENDING);
      assert.equal(body.data.payoutAmount, '50000.00');
      passed++;
      console.log('  ✅ PASSED: 3.6 GET /api/v1/claims/:id retrieves claim details (HTTP 200)');
    }

    // 3.7 POST /api/v1/claims/:id/approve approves claim without modifying policy balance
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${evaluatedClaimId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.status, ClaimStatus.APPROVED);

      // Verify policy balance still unchanged
      const policy = await mockPolicyRepo.findById(createdPolicyId);
      assert.equal(policy?.cumulativePaidAmount.toFixed(2), '0.00');
      passed += 2;
      console.log('  ✅ PASSED: 3.7 POST /api/v1/claims/:id/approve approves claim (HTTP 200)');
      console.log('  ✅ PASSED: 3.8 Approval preserves policy cumulativePaidAmount at 0.00');
    }

    // 3.9 Re-approving already APPROVED claim returns 400
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${evaluatedClaimId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.match(body.message, /already approved/i);
      passed++;
      console.log('  ✅ PASSED: 3.9 Approving already approved claim rejected with HTTP 400');
    }

    // 3.10 POST /api/v1/claims/:id/settle executes simulated payout in transaction
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${evaluatedClaimId}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          simulatedTransactionId: 'SIM-PAYOUT-TEST-8888',
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.status, ClaimStatus.PAID);
      assert.equal(body.data.payoutReference, 'SIM-PAYOUT-TEST-8888');
      assert.notEqual(body.data.paidAt, null);

      // Verify policy balance was atomically incremented to 50,000.00
      const policy = await mockPolicyRepo.findById(createdPolicyId);
      assert.equal(policy?.cumulativePaidAmount.toFixed(2), '50000.00');
      assert.equal(policy?.status, PolicyStatus.ACTIVE); // Remaining 50,000 coverage exists
      passed += 2;
      console.log('  ✅ PASSED: 3.10 POST /api/v1/claims/:id/settle marks claim PAID with simulated reference');
      console.log('  ✅ PASSED: 3.11 Settlement atomically increments policy cumulativePaidAmount to 50000.00');
    }

    // 3.12 Double-settlement of already PAID claim returns 400
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${evaluatedClaimId}/settle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.match(body.message, /already been settled and paid/i);
      passed++;
      console.log('  ✅ PASSED: 3.12 Settling already paid claim rejected with HTTP 400');
    }

    // 3.13 Rejection of a claim
    {
      // Create second claim to test rejection
      const secondEventId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      testAssessment.riskEvents.push({
        id: secondEventId,
        assessmentId: ASSESSMENT_ID,
        riskRuleId: 'rule-heat-001',
        triggered: true,
        severity: RiskSeverity.HIGH,
        observedValue: new Prisma.Decimal('42.0'),
        thresholdValue: new Prisma.Decimal('40.0'),
        consecutiveDays: 3,
        observedAt: new Date('2026-07-20T12:00:00.000Z'),
        details: null,
        createdAt: new Date('2026-07-20T12:00:00.000Z'),
        riskRule: testAssessment.riskEvents[0].riskRule,
      });

      const evalRes = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          ...validEvaluatePayload,
          riskEventId: secondEventId,
        }),
      });
      const evalBody = await evalRes.json();
      assert.equal(evalRes.status, 201);
      const secondClaimId = evalBody.data.id;

      // Reject without reason returns 400
      const emptyRejectRes = await fetch(`${baseUrl}/api/v1/claims/${secondClaimId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({}),
      });
      assert.equal(emptyRejectRes.status, 400);

      // Reject with reason succeeds
      const rejectRes = await fetch(`${baseUrl}/api/v1/claims/${secondClaimId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          reason: 'Duplicate anomalous weather reading flagged for secondary validation',
        }),
      });
      const rejectBody = await rejectRes.json();
      assert.equal(rejectRes.status, 200);
      assert.equal(rejectBody.data.status, ClaimStatus.REJECTED);
      assert.equal(
        rejectBody.data.rejectionReason,
        'Duplicate anomalous weather reading flagged for secondary validation'
      );
      passed += 2;
      console.log('  ✅ PASSED: 3.13 Claim rejection requires non-empty reason (HTTP 400 on empty)');
      console.log('  ✅ PASSED: 3.14 POST /api/v1/claims/:id/reject transitions claim to REJECTED (HTTP 200)');
    }

    // 3.15 Cannot reject an already settled claim
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${evaluatedClaimId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({ reason: 'Attempt to reject paid claim' }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.match(body.message, /Cannot reject an already settled claim/i);
      passed++;
      console.log('  ✅ PASSED: 3.15 Attempting to reject an already settled claim rejected with HTTP 400');
    }

    // 3.16 Querying claims by policyId
    {
      const res = await fetch(`${baseUrl}/api/v1/claims?policyId=${createdPolicyId}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.length, 2);
      passed++;
      console.log('  ✅ PASSED: 3.16 GET /api/v1/claims?policyId=<uuid> retrieves all policy claims');
    }

    // 3.17 Querying claims by farmId
    {
      const res = await fetch(`${baseUrl}/api/v1/claims?farmId=${FARM_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.length, 2);
      passed++;
      console.log('  ✅ PASSED: 3.17 GET /api/v1/claims?farmId=<uuid> retrieves all claims for farm');
    }

    // 3.18 Farm-nested claims endpoint returns claims for authorized farmer
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_A_ID}/claims`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.length, 2);
      passed++;
      console.log('  ✅ PASSED: 3.18 GET /api/v1/farms/:farmId/claims retrieves claims with farm ownership verified');
    }

    // 3.19 Settle claim to exhaust policy sum insured
    {
      // Create a third event and claim to exhaust the remaining 50,000.00 coverage
      const thirdEventId = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
      testAssessment.riskEvents.push({
        id: thirdEventId,
        assessmentId: ASSESSMENT_ID,
        riskRuleId: 'rule-heat-001',
        triggered: true,
        severity: RiskSeverity.HIGH,
        observedValue: new Prisma.Decimal('44.0'),
        thresholdValue: new Prisma.Decimal('40.0'),
        consecutiveDays: 4,
        observedAt: new Date('2026-07-25T12:00:00.000Z'),
        details: null,
        createdAt: new Date('2026-07-25T12:00:00.000Z'),
        riskRule: testAssessment.riskEvents[0].riskRule,
      });

      const evalRes = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          ...validEvaluatePayload,
          riskEventId: thirdEventId,
        }),
      });
      const evalBody = await evalRes.json();
      assert.equal(evalRes.status, 201);
      const thirdClaimId = evalBody.data.id;
      assert.equal(evalBody.data.payoutAmount, '50000.00');

      // Attempting to settle third claim while PENDING is rejected with HTTP 400
      const pendingSettleRes = await fetch(`${baseUrl}/api/v1/claims/${thirdClaimId}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({ simulatedTransactionId: 'SIM-PAYOUT-PRE-APPROVAL' }),
      });
      assert.equal(pendingSettleRes.status, 400);
      const pendingSettleBody = await pendingSettleRes.json();
      assert.match(pendingSettleBody.message, /before approval/i);

      // Verify policy balance remained untouched at 50,000.00
      const policyBeforeApprove = await mockPolicyRepo.findById(createdPolicyId);
      assert.equal(policyBeforeApprove?.cumulativePaidAmount.toFixed(2), '50000.00');

      // Approve the third claim prior to settlement
      const approveRes = await fetch(`${baseUrl}/api/v1/claims/${thirdClaimId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(approveRes.status, 200);

      // Settle the third claim
      const settleRes = await fetch(`${baseUrl}/api/v1/claims/${thirdClaimId}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({ simulatedTransactionId: 'SIM-PAYOUT-FINAL-9999' }),
      });
      const settleBody = await settleRes.json();
      assert.equal(settleRes.status, 200);
      assert.equal(settleBody.data.status, ClaimStatus.PAID);

      // Verify policy has reached EXHAUSTED status
      const exhaustedPolicy = await mockPolicyRepo.findById(createdPolicyId);
      assert.equal(exhaustedPolicy?.cumulativePaidAmount.toFixed(2), '100000.00');
      assert.equal(exhaustedPolicy?.status, PolicyStatus.EXHAUSTED);
      passed += 2;
      console.log('  ✅ PASSED: 3.19 Cumulative payouts reach full sum insured (100,000.00)');
      console.log('  ✅ PASSED: 3.20 Policy transitions to EXHAUSTED status upon full settlement');
    }

    // 3.21 Evaluating claim on EXHAUSTED policy is rejected with HTTP 400
    {
      const fourthEventId = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
      testAssessment.riskEvents.push({
        id: fourthEventId,
        assessmentId: ASSESSMENT_ID,
        riskRuleId: 'rule-heat-001',
        triggered: true,
        severity: RiskSeverity.HIGH,
        observedValue: new Prisma.Decimal('45.0'),
        thresholdValue: new Prisma.Decimal('40.0'),
        consecutiveDays: 4,
        observedAt: new Date('2026-07-28T12:00:00.000Z'),
        details: null,
        createdAt: new Date('2026-07-28T12:00:00.000Z'),
        riskRule: testAssessment.riskEvents[0].riskRule,
      });

      const evalRes = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          ...validEvaluatePayload,
          riskEventId: fourthEventId,
        }),
      });
      const evalBody = await evalRes.json();
      assert.equal(evalRes.status, 400);
      assert.match(evalBody.message, /coverage limit has already been exhausted/i);
      passed++;
      console.log('  ✅ PASSED: 3.21 Claim evaluation on EXHAUSTED policy rejected with HTTP 400');
    }

    // =========================================================================
    console.log('\n--- SUITE 4: Module 8 Decoupling & Boundary Verification ---');
    // =========================================================================

    // 4.1 Claim evaluation strictly requires Module 6 assessment ID (rejects ML prediction ID)
    {
      const decouplingPolicy = await mockPolicyRepo.createPolicy({
        policyNumber: 'POL-DECOUPLE-001',
        farmId: FARM_A_ID,
        farmerId: FARMER_A_ID,
        cropName: 'Cotton',
        sumInsured: new Prisma.Decimal('50000.00'),
        premiumAmount: new Prisma.Decimal('3000.00'),
        coveredHazards: [RiskHazardType.HIGH_TEMPERATURE],
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-11-30T00:00:00.000Z'),
        status: PolicyStatus.ACTIVE,
      });

      const mlPredictionFakeId = '12345678-1234-4234-8234-123456789abc';
      const res = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          policyId: decouplingPolicy.id,
          assessmentId: mlPredictionFakeId, // Not a Module 6 assessment
          riskEventId: RISK_EVENT_ID,
          payoutConfig: {
            severityMultipliers: { [RiskSeverity.HIGH]: 0.5 },
          },
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 404);
      assert.match(body.message, /Risk assessment with ID .* not found/i);
      passed++;
      console.log('  ✅ PASSED: 4.1 Attempting to evaluate claim with ML prediction ID fails with HTTP 404');
    }

    // 4.2 Module 8 advisory isolation verified
    {
      // Verify that claim payout is purely determined by Module 6 event severity and sum insured
      // (100,000 * 0.5 = 50,000), completely independent of ML calibrated probabilities or SHAP features
      const claim = await mockClaimRepo.findById(evaluatedClaimId);
      assert.equal(claim?.severity, RiskSeverity.HIGH);
      assert.equal(claim?.payoutAmount.toFixed(2), '50000.00');
      passed++;
      console.log('  ✅ PASSED: 4.2 Claim payout is strictly derived from Module 6 event severity, independent of ML advisory models');
    }

    // =========================================================================
    console.log('\n--- SUITE 5: Cross-Farmer Object-Level Authorization (BOLA/IDOR Hardening) & Payout Reference ---');
    // =========================================================================

    // Seed Farmer A test records dedicated for cross-farmer access denial verification
    const isoPolicyA = await mockPolicyRepo.createPolicy({
      policyNumber: 'POL-ISOLATION-001',
      farmId: FARM_A_ID,
      farmerId: FARMER_A_ID,
      cropName: 'Cotton',
      sumInsured: new Prisma.Decimal('100000.00'),
      premiumAmount: new Prisma.Decimal('7500.00'),
      coveredHazards: [RiskHazardType.HIGH_TEMPERATURE],
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-11-30T00:00:00.000Z'),
      status: PolicyStatus.PENDING,
    });

    const isoClaimA = await mockClaimRepo.createClaim({
      claimNumber: 'CLM-ISOLATION-001',
      policyId: isoPolicyA.id,
      assessmentId: ASSESSMENT_ID,
      riskEventId: 'iso-event-001-4aaa-8aaa-aaaaaaaaaaaa',
      triggerRuleCode: 'PARAMETRIC_EXTREME_HEAT_RULE',
      severity: RiskSeverity.HIGH,
      observedValue: new Prisma.Decimal('44.0'),
      thresholdValue: new Prisma.Decimal('40.0'),
      payoutAmount: new Prisma.Decimal('50000.00'),
      status: ClaimStatus.PENDING,
    });

    // 5.1 Farmer B cannot view Farmer A's policy by ID
    {
      const res = await fetch(`${baseUrl}/api/v1/policies/${isoPolicyA.id}`, {
        headers: { Authorization: `Bearer ${tokenFarmerB}` },
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /access denied.*permission.*policy/i);
      passed++;
      console.log('  ✅ PASSED: 5.1 Cross-farmer GET /api/v1/policies/:id rejected with HTTP 403 Forbidden');
    }

    // 5.2 Farmer B cannot query Farmer A's policies via ?farmId=...
    {
      const res = await fetch(`${baseUrl}/api/v1/policies?farmId=${FARM_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerB}` },
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /access denied.*permission.*farm/i);
      passed++;
      console.log('  ✅ PASSED: 5.2 Cross-farmer GET /api/v1/policies?farmId=<FarmA> rejected with HTTP 403 Forbidden');
    }

    // 5.3 Farmer B cannot issue/activate Farmer A's policy
    {
      const res = await fetch(`${baseUrl}/api/v1/policies/${isoPolicyA.id}/issue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFarmerB}` },
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /access denied.*permission.*issue/i);

      // Verify Policy A remains PENDING (mutation prevented)
      const policyRecord = await mockPolicyRepo.findById(isoPolicyA.id);
      assert.equal(policyRecord?.status, PolicyStatus.PENDING);
      passed += 2;
      console.log('  ✅ PASSED: 5.3 Cross-farmer POST /api/v1/policies/:id/issue rejected with HTTP 403 Forbidden');
      console.log('  ✅ PASSED: 5.4 Denied issuance preserves PENDING status without state corruption');
    }

    // 5.5 Farmer B cannot evaluate claims on Farmer A's policy
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerB}`,
        },
        body: JSON.stringify({
          policyId: isoPolicyA.id,
          assessmentId: ASSESSMENT_ID,
          riskEventId: RISK_EVENT_ID,
          payoutConfig: {
            severityMultipliers: { [RiskSeverity.HIGH]: 0.5 },
          },
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /access denied.*permission.*evaluate.*policy/i);
      passed++;
      console.log('  ✅ PASSED: 5.5 Cross-farmer POST /api/v1/claims/evaluate rejected with HTTP 403 Forbidden');
    }

    // 5.6 Farmer B cannot view Farmer A's claim by ID
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${isoClaimA.id}`, {
        headers: { Authorization: `Bearer ${tokenFarmerB}` },
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /access denied.*permission.*claim/i);
      passed++;
      console.log('  ✅ PASSED: 5.6 Cross-farmer GET /api/v1/claims/:id rejected with HTTP 403 Forbidden');
    }

    // 5.7 Farmer B cannot approve Farmer A's claim
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${isoClaimA.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFarmerB}` },
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /access denied.*permission.*approve/i);

      // Verify Claim A remains PENDING
      const claimRecord = await mockClaimRepo.findById(isoClaimA.id);
      assert.equal(claimRecord?.status, ClaimStatus.PENDING);
      passed += 2;
      console.log('  ✅ PASSED: 5.7 Cross-farmer POST /api/v1/claims/:id/approve rejected with HTTP 403 Forbidden');
      console.log('  ✅ PASSED: 5.8 Denied approval preserves PENDING claim status');
    }

    // 5.9 Farmer B cannot settle Farmer A's claim
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${isoClaimA.id}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerB}`,
        },
        body: JSON.stringify({ simulatedTransactionId: 'SIM-PAYOUT-ATTACK-001' }),
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /access denied.*permission.*settle/i);

      // Verify Claim A remains PENDING and Policy balance remains 0.00
      const claimRecord = await mockClaimRepo.findById(isoClaimA.id);
      assert.equal(claimRecord?.status, ClaimStatus.PENDING);
      const policyRecord = await mockPolicyRepo.findById(isoPolicyA.id);
      assert.equal(policyRecord?.cumulativePaidAmount.toFixed(2), '0.00');
      passed += 2;
      console.log('  ✅ PASSED: 5.9 Cross-farmer POST /api/v1/claims/:id/settle rejected with HTTP 403 Forbidden');
      console.log('  ✅ PASSED: 5.10 Denied settlement preserves policy balance and claim status');
    }

    // 5.11 Farmer B cannot reject Farmer A's claim
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${isoClaimA.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerB}`,
        },
        body: JSON.stringify({ reason: 'Malicious unauthorized rejection attempt' }),
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /access denied.*permission.*reject/i);

      // Verify Claim A remains PENDING
      const claimRecord = await mockClaimRepo.findById(isoClaimA.id);
      assert.equal(claimRecord?.status, ClaimStatus.PENDING);
      passed += 2;
      console.log('  ✅ PASSED: 5.11 Cross-farmer POST /api/v1/claims/:id/reject rejected with HTTP 403 Forbidden');
      console.log('  ✅ PASSED: 5.12 Denied rejection preserves claim status without corruption');
    }

    // 5.13 Farmer B cannot query claims for Farm A via ?farmId=...
    {
      const res = await fetch(`${baseUrl}/api/v1/claims?farmId=${FARM_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerB}` },
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /access denied.*permission.*claims.*farm/i);
      passed++;
      console.log('  ✅ PASSED: 5.13 Cross-farmer GET /api/v1/claims?farmId=<FarmA> rejected with HTTP 403 Forbidden');
    }

    // 5.14 Farmer B cannot query claims for Policy A via ?policyId=...
    {
      const res = await fetch(`${baseUrl}/api/v1/claims?policyId=${isoPolicyA.id}`, {
        headers: { Authorization: `Bearer ${tokenFarmerB}` },
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.success, false);
      assert.match(body.message, /access denied.*permission.*claims.*policy/i);
      passed++;
      console.log('  ✅ PASSED: 5.14 Cross-farmer GET /api/v1/claims?policyId=<PolicyA> rejected with HTTP 403 Forbidden');
    }

    // 5.15 Inconsistent query filters (farmId belongs to another farmer)
    {
      const res = await fetch(`${baseUrl}/api/v1/claims?policyId=${isoPolicyA.id}&farmId=${FARM_B_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 5.15 Querying claims with unauthorized farm filter rejected with HTTP 403');
    }

    // 5.16 Inconsistent relationship between owned policy and owned farm
    {
      const testFarmA2: Farm = {
        id: 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2',
        farmerId: FARMER_A_ID,
        farmName: 'Green Valley Plot 2',
        cropName: 'Cotton',
        cropVariety: 'Bt Cotton',
        sowingDate: new Date('2026-06-01T00:00:00.000Z'),
        expectedHarvestDate: new Date('2026-11-30T00:00:00.000Z'),
        farmArea: 2.0,
        farmAreaUnit: AreaUnit.ACRE,
        state: 'Maharashtra',
        district: 'Nashik',
        village: 'Dindori',
        pincode: '422202',
        status: FarmStatus.ACTIVE,
        referenceNumber: 'FARM-2026-0003',
        createdAt: new Date('2026-10-13T08:00:00.000Z'),
        updatedAt: new Date('2026-10-13T08:00:00.000Z'),
      };
      mockFarmRepo.farms.push(testFarmA2);

      const res = await fetch(`${baseUrl}/api/v1/claims?policyId=${isoPolicyA.id}&farmId=${testFarmA2.id}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.match(body.message, /does not belong to farm parcel/i);
      passed++;
      console.log('  ✅ PASSED: 5.16 Querying claims with mismatched policy and farm rejected with HTTP 400 Bad Request');
    }

    // 5.16b Attempting to settle PENDING claim before approval is rejected
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${isoClaimA.id}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({ simulatedTransactionId: 'SIM-PAYOUT-EARLY-001' }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.match(body.message, /before approval/i);

      // Verify policy cumulativePaidAmount remains untouched at 0.00
      const policyRecord = await mockPolicyRepo.findById(isoPolicyA.id);
      assert.equal(policyRecord?.cumulativePaidAmount.toFixed(2), '0.00');
      passed++;
      console.log('  ✅ PASSED: 5.16b Settling PENDING claim rejected with HTTP 400 before approval');

      // Activate policy first so claim can be approved
      await mockPolicyRepo.updatePolicyStatus(isoPolicyA.id, PolicyStatus.ACTIVE);

      // Now approve isoClaimA so subsequent settlement format tests execute against an APPROVED claim
      const approveRes = await fetch(`${baseUrl}/api/v1/claims/${isoClaimA.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(approveRes.status, 200);
    }

    // 5.17 Simulated Payout Reference: Invalid format without SIM- prefix rejected
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${isoClaimA.id}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({ simulatedTransactionId: 'REAL-BANK-WIRE-TRANSFER-9999' }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      assert.match(JSON.stringify(body.data), /Simulated transaction ID must start with 'SIM-'/i);
      passed++;
      console.log("  ✅ PASSED: 5.17 Settlement reference without 'SIM-' prefix rejected with HTTP 400");
    }

    // 5.18 Simulated Payout Reference: Lowercase prefix rejected
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${isoClaimA.id}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({ simulatedTransactionId: 'sim-payout-invalid-case' }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.success, false);
      passed++;
      console.log("  ✅ PASSED: 5.18 Settlement reference with lowercase prefix rejected with HTTP 400");
    }

    // 5.19 Authorized same-farmer legitimate settlement with valid SIM- reference succeeds
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${isoClaimA.id}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({ simulatedTransactionId: 'SIM-PAYOUT-VALID-AUTHORIZED-001' }),
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.equal(body.data.status, ClaimStatus.PAID);
      assert.equal(body.data.payoutReference, 'SIM-PAYOUT-VALID-AUTHORIZED-001');
      passed++;
      console.log("  ✅ PASSED: 5.19 Legitimate authorized settlement with valid 'SIM-' reference succeeds (HTTP 200)");
    }

    // =========================================================================
    console.log('\n--- SUITE 6: SEC-10.2-01 Payout Integrity & Authoritative Multipliers API ---');
    // =========================================================================

    const SEC_POLICY_ID = '99999999-9999-4999-8999-999999999999';
    const SEC_ASSESSMENT_ID = '88888888-8888-4888-8888-888888888888';
    const SEC_LOW_EVENT_ID = '77777777-7777-4777-8777-777777777771';
    const SEC_MOD_EVENT_ID = '77777777-7777-4777-8777-777777777772';

    await mockPolicyRepo.createPolicy({
      id: SEC_POLICY_ID,
      policyNumber: 'POL-20261018-SEC001',
      farmId: FARM_A_ID,
      farmerId: FARMER_A_ID,
      cropName: 'Cotton',
      sumInsured: new Prisma.Decimal('100000.00'),
      premiumAmount: new Prisma.Decimal('5000.00'),
      coveredHazards: [RiskHazardType.HIGH_TEMPERATURE],
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-11-30T23:59:59.000Z'),
      cumulativePaidAmount: new Prisma.Decimal('0.00'),
      status: PolicyStatus.ACTIVE,
    });

    mockRiskRepo.assessments.push({
      id: SEC_ASSESSMENT_ID,
      farmId: FARM_A_ID,
      assessedAt: new Date('2026-07-15T12:00:00.000Z'),
      overallRiskLevel: RiskLevel.HIGH,
      overallScore: 75.0,
      summary: 'Security verification assessment',
      triggeredRuleCount: 2,
      weatherContext: null,
      soilContext: null,
      vegetationContext: null,
      createdAt: new Date('2026-07-15T12:00:00.000Z'),
      riskEvents: [
        {
          id: SEC_LOW_EVENT_ID,
          assessmentId: SEC_ASSESSMENT_ID,
          riskRuleId: 'rule-sec-001',
          triggered: true,
          severity: RiskSeverity.LOW,
          observedValue: new Prisma.Decimal('41.0'),
          thresholdValue: new Prisma.Decimal('40.0'),
          consecutiveDays: 2,
          observedAt: new Date('2026-07-15T12:00:00.000Z'),
          details: null,
          createdAt: new Date('2026-07-15T12:00:00.000Z'),
          riskRule: {
            id: 'rule-sec-001',
            code: 'PARAMETRIC_SEC_LOW_RULE',
            name: 'Low Rule',
            hazardType: RiskHazardType.HIGH_TEMPERATURE,
            measurement: RiskMeasurement.TEMPERATURE,
            severity: RiskSeverity.LOW,
            sourceType: RiskSourceType.OFFICIAL_REFERENCE,
            thresholdValue: new Prisma.Decimal('40.0'),
            comparisonOperator: 'GREATER_THAN',
            unit: 'celsius',
            description: 'Low severity',
            isActive: true,
            consecutiveDays: 1,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        },
        {
          id: SEC_MOD_EVENT_ID,
          assessmentId: SEC_ASSESSMENT_ID,
          riskRuleId: 'rule-sec-002',
          triggered: true,
          severity: RiskSeverity.MODERATE,
          observedValue: new Prisma.Decimal('43.0'),
          thresholdValue: new Prisma.Decimal('40.0'),
          consecutiveDays: 3,
          observedAt: new Date('2026-07-15T12:00:00.000Z'),
          details: null,
          createdAt: new Date('2026-07-15T12:00:00.000Z'),
          riskRule: {
            id: 'rule-sec-002',
            code: 'PARAMETRIC_SEC_MOD_RULE',
            name: 'Moderate Rule',
            hazardType: RiskHazardType.HIGH_TEMPERATURE,
            measurement: RiskMeasurement.TEMPERATURE,
            severity: RiskSeverity.MODERATE,
            sourceType: RiskSourceType.OFFICIAL_REFERENCE,
            thresholdValue: new Prisma.Decimal('40.0'),
            comparisonOperator: 'GREATER_THAN',
            unit: 'celsius',
            description: 'Moderate severity',
            isActive: true,
            consecutiveDays: 2,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        },
      ],
    });

    // 6.1 LOW event evaluated with tampered client multipliers: LOW sent as 1.0 (100%)
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          policyId: SEC_POLICY_ID,
          assessmentId: SEC_ASSESSMENT_ID,
          riskEventId: SEC_LOW_EVENT_ID,
          payoutConfig: {
            severityMultipliers: {
              [RiskSeverity.LOW]: 1.0, // Client attempt to inflate payout to 100%!
            },
          },
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 201);
      assert.equal(body.success, true);
      assert.equal(body.data.status, ClaimStatus.PENDING);
      assert.equal(body.data.severity, RiskSeverity.LOW);
      // Strictly 25% of 100,000.00 = 25,000.00 (tampered 1.0 is ignored)
      assert.equal(body.data.payoutAmount, '25000.00');
      passed++;
      console.log('  ✅ PASSED: 6.1 Client-tampered multiplier (LOW: 1.0) strictly ignored; payout calculated at authoritative 25% (₹25,000.00)');
    }

    // 6.2 Claim evaluation with payoutConfig completely omitted succeeds using authoritative rate
    {
      const SEC_POLICY_2_ID = '99999999-9999-4999-8999-999999999998';
      await mockPolicyRepo.createPolicy({
        id: SEC_POLICY_2_ID,
        policyNumber: 'POL-20261018-SEC002',
        farmId: FARM_A_ID,
        farmerId: FARMER_A_ID,
        cropName: 'Cotton',
        sumInsured: new Prisma.Decimal('100000.00'),
        premiumAmount: new Prisma.Decimal('5000.00'),
        coveredHazards: [RiskHazardType.HIGH_TEMPERATURE],
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-11-30T23:59:59.000Z'),
        cumulativePaidAmount: new Prisma.Decimal('0.00'),
        status: PolicyStatus.ACTIVE,
      });

      const res = await fetch(`${baseUrl}/api/v1/claims/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          policyId: SEC_POLICY_2_ID,
          assessmentId: SEC_ASSESSMENT_ID,
          riskEventId: SEC_MOD_EVENT_ID,
          // payoutConfig completely omitted!
        }),
      });
      const body = await res.json();
      assert.equal(res.status, 201);
      assert.equal(body.success, true);
      assert.equal(body.data.status, ClaimStatus.PENDING);
      assert.equal(body.data.severity, RiskSeverity.MODERATE);
      // Strictly 40% of 100,000.00 = 40,000.00
      assert.equal(body.data.payoutAmount, '40000.00');
      passed++;
      console.log('  ✅ PASSED: 6.2 Claim evaluation without payoutConfig succeeds with authoritative MODERATE 40% (₹40,000.00)');
    }

  } finally {
    // Teardown: close server and restore mocked repository method
    server.close();
    (farmRepository as any).findById = originalFindById;
  }

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, 0 failed across all checkpoints`);
  console.log('================================================================================\n');
}

runStage94ApiIntegrationTests().catch((err) => {
  console.error('\n❌ Test execution failed with unhandled exception:\n', err);
  process.exit(1);
});
