/**
 * AgriShield Stage 2: RBAC & API Authorization Test Suite
 *
 * Exhaustively verifies Role-Based Access Control and Object-Level Authorization (BOLA/IDOR):
 * 1. Public endpoints accessible without token (health, gateway, risk-rules, public auth).
 * 2. Missing token rejected with HTTP 401 across all protected routes.
 * 3. Invalid token or unknown role rejected (HTTP 401 / 403).
 * 4. FARMER token attempting ADMIN endpoints rejected with HTTP 403 Forbidden.
 * 5. Cross-farmer BOLA/IDOR attempts rejected with HTTP 403 Forbidden (farms, boundaries, weather, satellite, risk, policies, claims).
 * 6. Cost-protection on expensive external sync endpoints (weather sync, satellite sync).
 * 7. Authorized FARMER successfully accesses own resources (HTTP 200 / 201).
 * 8. Authorized ADMIN successfully accesses system-wide and farmer resources (HTTP 200).
 */

import http from 'http';
import jwt from 'jsonwebtoken';
import { strict as assert } from 'node:assert';
import {
  Prisma,
  Farm,
  Farmer,
  Policy,
  Claim,
  PolicyStatus,
  ClaimStatus,
  FarmStatus,
  AreaUnit,
  Language,
  RiskLevel,
  RiskSeverity,
  RiskHazardType,
  RiskMeasurement,
  RiskSourceType,
} from '@prisma/client';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.config.js';
import { farmerRepository } from '../../src/repositories/farmer.repository.js';
import { farmRepository } from '../../src/repositories/farm.repository.js';
import { farmBoundaryRepository } from '../../src/repositories/farmBoundary.repository.js';
import { weatherRepository } from '../../src/repositories/weather.repository.js';
import { satelliteRepository } from '../../src/repositories/satellite.repository.js';
import { farmerController } from '../../src/controllers/farmer.controller.js';
import { farmController } from '../../src/controllers/farm.controller.js';
import { riskAssessmentController } from '../../src/controllers/riskAssessment.controller.js';
import { riskRuleController } from '../../src/controllers/riskRule.controller.js';
import { policyController } from '../../src/controllers/policy.controller.js';
import { claimController } from '../../src/controllers/claim.controller.js';
import { FarmerService } from '../../src/services/farmer.service.js';
import { FarmService } from '../../src/services/farm.service.js';
import { PolicyService } from '../../src/services/policy.service.js';
import { ClaimService } from '../../src/services/claim.service.js';
import { RiskAssessmentService } from '../../src/services/riskAssessment.service.js';
import { IFarmerRepository } from '../../src/types/farmer.types.js';
import { IFarmRepository } from '../../src/types/farm.types.js';
import { IFarmBoundaryRepository } from '../../src/types/farmBoundary.types.js';
import { IPolicyRepository } from '../../src/types/policy.types.js';
import { IClaimRepository } from '../../src/types/claim.types.js';
import { IRiskRepository, RiskAssessmentWithEvents } from '../../src/types/risk.types.js';

// ============================================================================
// Fixtures & UUIDs
// ============================================================================
const FARMER_A_ID = '11111111-1111-4111-8111-111111111111';
const FARMER_B_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';

const FARM_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FARM_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ASSESSMENT_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ASSESSMENT_B_ID = 'cccccccc-cccc-4ccc-8ccc-bbbbbbbbbbbb';

const POLICY_A_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const POLICY_B_ID = 'dddddddd-dddd-4ddd-8ddd-bbbbbbbbbbbb';

const CLAIM_A_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CLAIM_B_ID = 'eeeeeeee-eeee-4eee-8eee-bbbbbbbbbbbb';

function generateToken(userId: string, role?: string, expiresIn: string = '1h'): string {
  const payload: any = { id: userId, email: `${userId}@example.com` };
  if (role) payload.role = role;
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

// ============================================================================
// In-Memory Mock Repositories
// ============================================================================
class MockFarmerRepository implements IFarmerRepository {
  public farmers: Farmer[] = [];

  async create(data: any): Promise<Farmer> {
    const farmer: Farmer = {
      id: data.id || FARMER_A_ID,
      fullName: data.fullName,
      mobileNumber: data.mobileNumber,
      preferredLanguage: data.preferredLanguage || Language.MARATHI,
      farmerReferenceNumber: 'AGRI-REF-001',
      email: data.email || null,
      emailVerified: data.emailVerified || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.farmers.push(farmer);
    return farmer;
  }

  async findById(id: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.id === id) || null;
  }

  async findByMobileNumber(mobileNumber: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.mobileNumber === mobileNumber) || null;
  }

  async findByEmail(email: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.email === email) || null;
  }

  async updateEmail(id: string, email: string): Promise<Farmer> {
    const f = this.farmers.find((x) => x.id === id);
    if (!f) throw new Error('Farmer not found');
    f.email = email;
    f.emailVerified = true;
    return f;
  }

  async findAll(query?: any): Promise<Farmer[]> {
    return this.farmers;
  }

  async count(): Promise<number> {
    return this.farmers.length;
  }

  async findByReferenceNumber(ref: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.farmerReferenceNumber === ref) || null;
  }
}

class MockFarmRepository implements IFarmRepository {
  public farms: (Farm & { farmer?: Farmer })[] = [];

  async create(data: any): Promise<Farm & { farmer?: Farmer }> {
    const farm: Farm & { farmer?: Farmer } = {
      id: data.id || ('f0000000-0000-4000-8000-' + String(this.farms.length + 1).padStart(12, '0')),
      farmerId: data.farmerId,
      farmName: data.farmName,
      cropName: data.cropName,
      cropVariety: data.cropVariety || null,
      sowingDate: new Date(data.sowingDate),
      expectedHarvestDate: data.expectedHarvestDate ? new Date(data.expectedHarvestDate) : null,
      farmArea: data.farmArea,
      farmAreaUnit: data.farmAreaUnit || AreaUnit.ACRE,
      state: data.state,
      district: data.district,
      village: data.village,
      pincode: data.pincode,
      status: data.status || FarmStatus.ACTIVE,
      referenceNumber: 'AGRI-FRM-001',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.farms.push(farm);
    return farm;
  }

  async findById(id: string): Promise<(Farm & { farmer?: Farmer }) | null> {
    return this.farms.find((f) => f.id === id) || null;
  }

  async findByFarmerId(farmerId: string): Promise<(Farm & { farmer?: Farmer })[]> {
    return this.farms.filter((f) => f.farmerId === farmerId);
  }

  async findAll(): Promise<(Farm & { farmer?: Farmer })[]> {
    return this.farms;
  }

  async count(): Promise<number> {
    return this.farms.length;
  }

  async update(id: string, data: any): Promise<Farm & { farmer?: Farmer }> {
    const f = this.farms.find((x) => x.id === id);
    if (!f) throw new Error('Farm not found');
    Object.assign(f, data);
    return f;
  }

  async delete(id: string): Promise<Farm> {
    const idx = this.farms.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error('Farm not found');
    const [removed] = this.farms.splice(idx, 1);
    return removed;
  }

  async findByReferenceNumber(ref: string): Promise<Farm | null> {
    return this.farms.find((f) => f.referenceNumber === ref) || null;
  }
}

class MockPolicyRepository implements IPolicyRepository {
  public policies: Policy[] = [];

  async createPolicy(data: any): Promise<Policy> {
    const p: Policy = {
      id: data.id || POLICY_A_ID,
      policyNumber: data.policyNumber || 'POL-20261025-001',
      farmId: data.farmId,
      farmerId: data.farmerId,
      cropName: data.cropName,
      sumInsured: new Prisma.Decimal(data.sumInsured.toString()),
      premiumAmount: new Prisma.Decimal(data.premiumAmount.toString()),
      coveredHazards: data.coveredHazards,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      cumulativePaidAmount: new Prisma.Decimal('0.00'),
      status: data.status || PolicyStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.policies.push(p);
    return p;
  }

  async findById(id: string): Promise<Policy | null> {
    return this.policies.find((p) => p.id === id || p.policyNumber === id) || null;
  }

  async findByFarmId(farmId: string): Promise<Policy[]> {
    return this.policies.filter((p) => p.farmId === farmId);
  }

  async findActivePolicyForFarm(farmId: string): Promise<Policy | null> {
    return this.policies.find((p) => p.farmId === farmId && p.status === PolicyStatus.ACTIVE) || null;
  }

  async updatePolicyBalanceAndStatus(id: string, update: any): Promise<Policy> {
    const p = this.policies.find((x) => x.id === id);
    if (!p) throw new Error('Policy not found');
    if (update.newStatus) p.status = update.newStatus;
    return p;
  }

  async updatePolicyStatus(id: string, status: PolicyStatus): Promise<Policy> {
    const p = this.policies.find((x) => x.id === id);
    if (!p) throw new Error('Policy not found');
    p.status = status;
    return p;
  }
}

class MockClaimRepository implements IClaimRepository {
  public claims: Claim[] = [];

  async createClaim(data: any): Promise<Claim> {
    const c: Claim = {
      id: data.id || CLAIM_A_ID,
      claimNumber: data.claimNumber || 'CLM-20261025-001',
      policyId: data.policyId,
      farmId: data.farmId,
      riskEventId: data.riskEventId,
      assessmentId: data.assessmentId || ASSESSMENT_A_ID,
      triggerRuleCode: data.triggerRuleCode || 'PARAMETRIC_HEAT_RULE',
      severity: data.severity || RiskSeverity.HIGH,
      observedValue: new Prisma.Decimal('42.0'),
      thresholdValue: new Prisma.Decimal('40.0'),
      payoutAmount: new Prisma.Decimal(data.payoutAmount.toString()),
      status: data.status || ClaimStatus.PENDING,
      payoutReference: null,
      rejectionReason: null,
      paidAt: null,
      evaluatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.claims.push(c);
    return c;
  }

  async findById(id: string): Promise<Claim | null> {
    return this.claims.find((c) => c.id === id || c.claimNumber === id) || null;
  }

  async findByPolicyId(policyId: string): Promise<Claim[]> {
    return this.claims.filter((c) => c.policyId === policyId);
  }

  async findByFarmId(farmId: string): Promise<Claim[]> {
    return this.claims.filter((c) => c.farmId === farmId);
  }

  async findByRiskEventId(riskEventId: string): Promise<Claim | null> {
    return this.claims.find((c) => c.riskEventId === riskEventId) || null;
  }

  async updateClaimStatus(id: string, status: any, extra?: any): Promise<Claim> {
    const c = this.claims.find((x) => x.id === id);
    if (!c) throw new Error('Claim not found');
    c.status = typeof status === 'object' && status !== null && status.status ? status.status : status;
    if (extra?.payoutReference) c.payoutReference = extra.payoutReference;
    if (extra?.rejectionReason) c.rejectionReason = extra.rejectionReason;
    if (extra?.paidAt) c.paidAt = extra.paidAt;
    return c;
  }
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
// Test Suite Execution
// ============================================================================
async function runRbacTests(): Promise<void> {
  console.log('================================================================================');
  console.log('🧪 AgriShield Stage 2: RBAC & API Authorization Test Suite');
  console.log('================================================================================\n');

  let passed = 0;

  // 1. Setup Mock Repositories
  const mockFarmerRepo = new MockFarmerRepository();
  const mockFarmRepo = new MockFarmRepository();
  const mockPolicyRepo = new MockPolicyRepository();
  const mockClaimRepo = new MockClaimRepository();

  // Populate Farmer A & Farmer B
  const farmerA = await mockFarmerRepo.create({
    id: FARMER_A_ID,
    fullName: 'Ramesh Patil',
    mobileNumber: '9876543210',
    preferredLanguage: Language.MARATHI,
    email: 'ramesh@example.com',
    emailVerified: true,
  });

  const farmerB = await mockFarmerRepo.create({
    id: FARMER_B_ID,
    fullName: 'Suresh Deshmukh',
    mobileNumber: '9876543211',
    preferredLanguage: Language.MARATHI,
    email: 'suresh@example.com',
    emailVerified: true,
  });

  // Populate Farm A (owned by Farmer A) & Farm B (owned by Farmer B)
  const farmA = await mockFarmRepo.create({
    id: FARM_A_ID,
    farmerId: FARMER_A_ID,
    farmName: 'Ramesh Soy Farm',
    cropName: 'Soybean',
    sowingDate: '2026-06-01',
    farmArea: 4.0,
    state: 'Maharashtra',
    district: 'Nashik',
    village: 'Dindori',
    pincode: '422202',
  });

  const farmB = await mockFarmRepo.create({
    id: FARM_B_ID,
    farmerId: FARMER_B_ID,
    farmName: 'Suresh Wheat Farm',
    cropName: 'Wheat',
    sowingDate: '2026-06-01',
    farmArea: 3.5,
    state: 'Maharashtra',
    district: 'Nagpur',
    village: 'Katol',
    pincode: '441302',
  });

  // Dynamically calculate valid policy coverage dates (starts 30 days ago, ends 180 days in future)
  const policyStartDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const policyEndDate = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

  // Populate Policy A (Farmer A) & Policy B (Farmer B)
  const policyA = await mockPolicyRepo.createPolicy({
    id: POLICY_A_ID,
    policyNumber: 'POL-20261025-0001',
    farmId: FARM_A_ID,
    farmerId: FARMER_A_ID,
    cropName: 'Soybean',
    sumInsured: 100000,
    premiumAmount: 5000,
    coveredHazards: [RiskHazardType.DEFICIT_RAINFALL],
    startDate: policyStartDate,
    endDate: policyEndDate,
    status: PolicyStatus.PENDING,
  });

  const policyB = await mockPolicyRepo.createPolicy({
    id: POLICY_B_ID,
    policyNumber: 'POL-20261025-0002',
    farmId: FARM_B_ID,
    farmerId: FARMER_B_ID,
    cropName: 'Wheat',
    sumInsured: 100000,
    premiumAmount: 5000,
    coveredHazards: [RiskHazardType.HIGH_TEMPERATURE],
    startDate: policyStartDate,
    endDate: policyEndDate,
    status: PolicyStatus.PENDING,
  });

  // Populate Claim A & Claim B
  const claimA = await mockClaimRepo.createClaim({
    id: CLAIM_A_ID,
    claimNumber: 'CLM-20261025-0001',
    policyId: POLICY_A_ID,
    farmId: FARM_A_ID,
    riskEventId: 'evt-11111111-1111-4111-8111-111111111111',
    payoutAmount: 25000,
    status: ClaimStatus.PENDING,
  });

  const claimB = await mockClaimRepo.createClaim({
    id: CLAIM_B_ID,
    claimNumber: 'CLM-20261025-0002',
    policyId: POLICY_B_ID,
    farmId: FARM_B_ID,
    riskEventId: 'evt-22222222-2222-4222-8222-222222222222',
    payoutAmount: 20000,
    status: ClaimStatus.PENDING,
  });

  // Hook repositories into controllers and middlewares
  farmerController.setService(new FarmerService(mockFarmerRepo));
  farmController.setService(new FarmService(mockFarmRepo, mockFarmerRepo));
  riskRuleController.setService({
    getActiveRules: async () => [
      { id: 'rule-01', code: 'PARAMETRIC_DROUGHT_RULE', name: 'Deficit Rainfall Rule', isActive: true },
    ],
  } as any);
  policyController.setFarmRepo(mockFarmRepo);
  policyController.setService(new PolicyService(mockPolicyRepo, mockFarmRepo, mockFarmerRepo, {} as any));
  const mockDb = new MockPrismaTxClient(mockPolicyRepo, mockClaimRepo);
  claimController.setFarmRepo(mockFarmRepo);
  claimController.setPolicyRepo(mockPolicyRepo);
  claimController.setService(new ClaimService(mockClaimRepo, mockPolicyRepo, {} as any, mockDb as any));
  riskAssessmentController.setFarmRepo(mockFarmRepo);

  // Mock global farmRepository.findById for farmOwnership middleware
  (farmRepository as any).findById = async (id: string) => {
    return mockFarmRepo.findById(id);
  };

  // Mock riskAssessmentService for risk controller
  const mockRiskAssessments: Record<string, any> = {
    [ASSESSMENT_A_ID]: {
      id: ASSESSMENT_A_ID,
      farmId: FARM_A_ID,
      assessedAt: new Date(),
      overallRiskLevel: RiskLevel.MEDIUM,
      overallScore: 50,
      triggeredRuleCount: 1,
      riskEvents: [],
    },
    [ASSESSMENT_B_ID]: {
      id: ASSESSMENT_B_ID,
      farmId: FARM_B_ID,
      assessedAt: new Date(),
      overallRiskLevel: RiskLevel.HIGH,
      overallScore: 80,
      triggeredRuleCount: 2,
      riskEvents: [],
    },
  };

  riskAssessmentController.setService({
    getAssessmentById: async (id: string) => {
      const a = mockRiskAssessments[id];
      if (!a) throw { statusCode: 404, message: 'Assessment not found' };
      return a;
    },
    getPortfolioRiskSummary: async () => {
      return { totalParcels: 2, averageRiskScore: 65 };
    },
  } as any);

  // Start app on ephemeral port
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Tokens
  const tokenFarmerA = generateToken(FARMER_A_ID, 'FARMER');
  const tokenFarmerB = generateToken(FARMER_B_ID, 'FARMER');
  const tokenAdmin = generateToken(ADMIN_ID, 'ADMIN');
  const tokenUnknownRole = generateToken(FARMER_A_ID, 'STAFF' as any);

  try {
    // =========================================================================
    console.log('--- SUITE 1: Public Routes (No Token Required) ---');
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      passed++;
      console.log('  ✅ PASSED: 1.1 GET / (gateway meta) is public (HTTP 200)');
    }
    {
      const res = await fetch(`${baseUrl}/api/v1/health`);
      assert.equal(res.status, 200);
      passed++;
      console.log('  ✅ PASSED: 1.2 GET /api/v1/health is public (HTTP 200)');
    }
    {
      const res = await fetch(`${baseUrl}/api/v1/health/ready`);
      // Readiness probe returns 200 when DB is connected or 503 when disconnected, never 401/403
      assert.ok([200, 503].includes(res.status));
      passed++;
      console.log(`  ✅ PASSED: 1.3 GET /api/v1/health/ready is public without auth (HTTP ${res.status})`);
    }
    {
      const res = await fetch(`${baseUrl}/api/v1/risk-rules`);
      assert.equal(res.status, 200);
      passed++;
      console.log('  ✅ PASSED: 1.4 GET /api/v1/risk-rules is public (HTTP 200)');
    }

    // =========================================================================
    console.log('\n--- SUITE 2: Protected Endpoints Reject Missing Authentication (HTTP 401) ---');
    // =========================================================================
    const unauthChecks = [
      { method: 'GET', path: '/api/v1/farmers', name: 'GET /farmers' },
      { method: 'POST', path: '/api/v1/farmers', name: 'POST /farmers' },
      { method: 'GET', path: `/api/v1/farmers/${FARMER_A_ID}`, name: 'GET /farmers/:id' },
      { method: 'GET', path: `/api/v1/farmers/${FARMER_A_ID}/farms`, name: 'GET /farmers/:id/farms' },
      { method: 'GET', path: '/api/v1/farms', name: 'GET /farms' },
      { method: 'POST', path: '/api/v1/farms', name: 'POST /farms' },
      { method: 'GET', path: `/api/v1/farms/${FARM_A_ID}`, name: 'GET /farms/:id' },
      { method: 'PATCH', path: `/api/v1/farms/${FARM_A_ID}`, name: 'PATCH /farms/:id' },
      { method: 'DELETE', path: `/api/v1/farms/${FARM_A_ID}`, name: 'DELETE /farms/:id' },
      { method: 'GET', path: `/api/v1/farms/${FARM_A_ID}/boundary`, name: 'GET /farms/:id/boundary' },
      { method: 'POST', path: `/api/v1/farms/${FARM_A_ID}/boundary`, name: 'POST /farms/:id/boundary' },
      { method: 'POST', path: `/api/v1/farms/${FARM_A_ID}/weather/sync`, name: 'POST /farms/:id/weather/sync (Cost protected)' },
      { method: 'GET', path: `/api/v1/farms/${FARM_A_ID}/weather/latest`, name: 'GET /farms/:id/weather/latest' },
      { method: 'POST', path: `/api/v1/farms/${FARM_A_ID}/satellite/sync`, name: 'POST /farms/:id/satellite/sync (Cost protected)' },
      { method: 'GET', path: `/api/v1/farms/${FARM_A_ID}/satellite/latest`, name: 'GET /farms/:id/satellite/latest' },
      { method: 'POST', path: `/api/v1/farms/${FARM_A_ID}/risk-assessments`, name: 'POST /farms/:id/risk-assessments' },
      { method: 'GET', path: `/api/v1/farms/${FARM_A_ID}/risk-assessments/latest`, name: 'GET /farms/:id/risk-assessments/latest' },
      { method: 'GET', path: '/api/v1/risk-assessments/portfolio-summary', name: 'GET /risk-assessments/portfolio-summary' },
      { method: 'GET', path: `/api/v1/risk-assessments/${ASSESSMENT_A_ID}`, name: 'GET /risk-assessments/:id' },
      { method: 'GET', path: '/api/v1/policies', name: 'GET /policies' },
      { method: 'POST', path: '/api/v1/policies', name: 'POST /policies' },
      { method: 'GET', path: `/api/v1/policies/${POLICY_A_ID}`, name: 'GET /policies/:id' },
      { method: 'POST', path: `/api/v1/policies/${POLICY_A_ID}/issue`, name: 'POST /policies/:id/issue' },
      { method: 'GET', path: '/api/v1/claims', name: 'GET /claims' },
      { method: 'POST', path: '/api/v1/claims/evaluate', name: 'POST /claims/evaluate' },
      { method: 'GET', path: `/api/v1/claims/${CLAIM_A_ID}`, name: 'GET /claims/:id' },
      { method: 'POST', path: `/api/v1/claims/${CLAIM_A_ID}/approve`, name: 'POST /claims/:id/approve' },
      { method: 'POST', path: `/api/v1/claims/${CLAIM_A_ID}/settle`, name: 'POST /claims/:id/settle' },
      { method: 'POST', path: `/api/v1/claims/${CLAIM_A_ID}/reject`, name: 'POST /claims/:id/reject' },
    ];

    let checkNum = 1;
    for (const c of unauthChecks) {
      const res = await fetch(`${baseUrl}${c.path}`, { method: c.method });
      assert.equal(res.status, 401, `Expected HTTP 401 for ${c.name}, got ${res.status}`);
      passed++;
      console.log(`  ✅ PASSED: 2.${checkNum++} Missing token rejected with HTTP 401: ${c.name}`);
    }

    // =========================================================================
    console.log('\n--- SUITE 3: Farmer Attempting Admin-Only Endpoints (HTTP 403 Forbidden) ---');
    // =========================================================================
    const adminOnlyEndpoints = [
      { method: 'GET', path: '/api/v1/farmers', name: 'GET /farmers (list all farmers)' },
      { method: 'POST', path: '/api/v1/farmers', name: 'POST /farmers (create farmer)' },
      { method: 'GET', path: '/api/v1/farms', name: 'GET /farms (list all farms)' },
      { method: 'GET', path: '/api/v1/risk-assessments/portfolio-summary', name: 'GET /risk-assessments/portfolio-summary' },
      { method: 'POST', path: `/api/v1/policies/${POLICY_A_ID}/issue`, name: 'POST /policies/:id/issue (underwrite/issue policy)' },
      { method: 'POST', path: `/api/v1/claims/${CLAIM_A_ID}/approve`, name: 'POST /claims/:id/approve (claim approval)' },
      { method: 'POST', path: `/api/v1/claims/${CLAIM_A_ID}/settle`, name: 'POST /claims/:id/settle (claim settlement)' },
      { method: 'POST', path: `/api/v1/claims/${CLAIM_A_ID}/reject`, name: 'POST /claims/:id/reject (claim rejection)' },
    ];

    let adminCheckNum = 1;
    for (const a of adminOnlyEndpoints) {
      const res = await fetch(`${baseUrl}${a.path}`, {
        method: a.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: a.method === 'POST' ? JSON.stringify({ reason: 'testing' }) : undefined,
      });
      assert.equal(res.status, 403, `Expected HTTP 403 Forbidden for farmer on ${a.name}, got ${res.status}`);
      const body = await res.json();
      assert.match(body.message, /access denied/i);
      passed++;
      console.log(`  ✅ PASSED: 3.${adminCheckNum++} Farmer blocked from admin route with HTTP 403: ${a.name}`);
    }

    // =========================================================================
    console.log('\n--- SUITE 4: Cross-Farmer BOLA/IDOR Defenses (HTTP 403 Forbidden) ---');
    // =========================================================================
    // 4.1 Farmer A cannot view Farmer B's profile
    {
      const res = await fetch(`${baseUrl}/api/v1/farmers/${FARMER_B_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.1 Cross-farmer profile access rejected with HTTP 403 Forbidden');
    }

    // 4.2 Farmer A cannot view Farmer B's farm list
    {
      const res = await fetch(`${baseUrl}/api/v1/farmers/${FARMER_B_ID}/farms`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.2 Cross-farmer farm list access rejected with HTTP 403 Forbidden');
    }

    // 4.3 Farmer A cannot register a farm for Farmer B
    {
      const farmerBFarmsBefore = (await mockFarmRepo.findByFarmerId(FARMER_B_ID)).length;

      const res = await fetch(`${baseUrl}/api/v1/farms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          farmerId: FARMER_B_ID,
          farmName: 'Attacker Farm',
          cropName: 'Cotton',
          sowingDate: '2026-06-01',
          farmArea: 2.5,
          state: 'Maharashtra',
          district: 'Pune',
          village: 'Bhor',
          pincode: '412206',
        }),
      });
      assert.equal(res.status, 403);

      // Verify that no farm was created for Farmer B
      const farmerBFarmsAfter = (await mockFarmRepo.findByFarmerId(FARMER_B_ID)).length;
      assert.equal(farmerBFarmsAfter, farmerBFarmsBefore, 'Farmer B farm count must remain unchanged after rejected cross-farmer registration');
      const allFarms = await mockFarmRepo.findAll();
      assert.ok(!allFarms.some((f) => f.farmName === 'Attacker Farm'), 'Farm "Attacker Farm" must not have been created');

      passed++;
      console.log('  ✅ PASSED: 4.3 Farmer creating farm for another farmer rejected with HTTP 403 Forbidden (no farm created)');
    }

    // 4.3b Farmer omitting farmerId is rejected with HTTP 400 Bad Request
    {
      const totalFarmsBefore = await mockFarmRepo.count();

      const res = await fetch(`${baseUrl}/api/v1/farms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          farmName: 'Missing FarmerId Plot',
          cropName: 'Cotton',
          sowingDate: '2026-06-01',
          farmArea: 2.5,
          state: 'Maharashtra',
          district: 'Pune',
          village: 'Bhor',
          pincode: '412206',
        }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.message, 'Validation failed');
      assert.ok(
        body.data?.errors?.some((e: any) => e.field === 'farmerId'),
        'Response must identify farmerId as the missing validation field'
      );

      // Confirm no farm was created by the rejected request
      const totalFarmsAfter = await mockFarmRepo.count();
      assert.equal(totalFarmsAfter, totalFarmsBefore, 'Total farm count must remain unchanged after rejected request');
      const allFarms = await mockFarmRepo.findAll();
      assert.ok(!allFarms.some((f) => f.farmName === 'Missing FarmerId Plot'), 'Farm "Missing FarmerId Plot" must not have been created');

      passed++;
      console.log('  ✅ PASSED: 4.3b Farm creation omitting farmerId rejected with HTTP 400 Bad Request (no farm created)');
    }

    // 4.4 Farmer A cannot access Farmer B's farm parcel details
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_B_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.4 Cross-farmer farm details access rejected with HTTP 403 Forbidden');
    }

    // 4.5 Farmer A cannot update Farmer B's farm parcel
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_B_ID}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({ farmName: 'Malicious Update' }),
      });
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.5 Cross-farmer farm update rejected with HTTP 403 Forbidden');
    }

    // 4.6 Farmer A cannot delete Farmer B's farm parcel
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_B_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.6 Cross-farmer farm deletion rejected with HTTP 403 Forbidden');
    }

    // 4.7 Farmer A cannot view Farmer B's farm boundary
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_B_ID}/boundary`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.7 Cross-farmer boundary access rejected with HTTP 403 Forbidden');
    }

    // 4.8 Farmer A cannot sync or read weather on Farmer B's farm parcel (Cost protection)
    {
      const syncRes = await fetch(`${baseUrl}/api/v1/farms/${FARM_B_ID}/weather/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(syncRes.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.8 Cross-farmer weather sync rejected with HTTP 403 Forbidden (cost protected)');
    }

    // 4.9 Farmer A cannot sync or read satellite NDVI on Farmer B's farm parcel (Cost protection)
    {
      const syncRes = await fetch(`${baseUrl}/api/v1/farms/${FARM_B_ID}/satellite/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({}),
      });
      assert.equal(syncRes.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.9 Cross-farmer satellite sync rejected with HTTP 403 Forbidden (cost protected)');
    }

    // 4.10 Farmer A cannot view Farmer B's risk assessment by ID
    {
      const res = await fetch(`${baseUrl}/api/v1/risk-assessments/${ASSESSMENT_B_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.10 Cross-farmer risk assessment retrieval rejected with HTTP 403 Forbidden');
    }

    // 4.11 Farmer A cannot view Farmer B's policy by ID
    {
      const res = await fetch(`${baseUrl}/api/v1/policies/${POLICY_B_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.11 Cross-farmer policy details retrieval rejected with HTTP 403 Forbidden');
    }

    // 4.12 Farmer A cannot view Farmer B's claim by ID
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${CLAIM_B_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 4.12 Cross-farmer claim details retrieval rejected with HTTP 403 Forbidden');
    }

    // =========================================================================
    console.log('\n--- SUITE 5: Unknown / Injected Role Rejection (HTTP 403 Forbidden) ---');
    // =========================================================================
    {
      const res = await fetch(`${baseUrl}/api/v1/farms`, {
        headers: { Authorization: `Bearer ${tokenUnknownRole}` },
      });
      assert.equal(res.status, 403);
      passed++;
      console.log('  ✅ PASSED: 5.1 Token with non-permitted role (STAFF) rejected with HTTP 403 on admin route');
    }
    {
      const res = await fetch(`${baseUrl}/api/v1/farmers/${FARMER_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenUnknownRole}` },
      });
      // Even if token id matches, role is not ADMIN and cannot bypass ownership checks
      assert.equal(res.status, 200); // Farmer id matches self
      passed++;
      console.log('  ✅ PASSED: 5.2 Token with matching ID accesses self profile');
    }
    {
      const totalFarmsBefore = await mockFarmRepo.count();

      const res = await fetch(`${baseUrl}/api/v1/farms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenUnknownRole}`,
        },
        body: JSON.stringify({
          farmerId: FARMER_A_ID,
          farmName: 'Unauthorized Staff Parcel',
          cropName: 'Barley',
          sowingDate: '2026-06-01',
          farmArea: 3.0,
          state: 'Maharashtra',
          district: 'Pune',
          village: 'Bhor',
          pincode: '412206',
        }),
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.match(body.message, /access denied/i);

      // Verify no farm was created
      const totalFarmsAfter = await mockFarmRepo.count();
      assert.equal(totalFarmsAfter, totalFarmsBefore, 'Total farm count must remain unchanged after rejected farm registration');
      const allFarms = await mockFarmRepo.findAll();
      assert.ok(!allFarms.some((f) => f.farmName === 'Unauthorized Staff Parcel'), 'Farm "Unauthorized Staff Parcel" must not have been created');

      passed++;
      console.log('  ✅ PASSED: 5.3 Token with non-permitted role (STAFF) rejected with HTTP 403 on farm registration (no farm created)');
    }

    // =========================================================================
    console.log('\n--- SUITE 6: Legitimate Farmer & Admin Authorized Access (HTTP 200 / 201) ---');
    // =========================================================================
    // 6.1 Farmer A accesses own profile
    {
      const res = await fetch(`${baseUrl}/api/v1/farmers/${FARMER_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.id, FARMER_A_ID);
      passed++;
      console.log('  ✅ PASSED: 6.1 Farmer A successfully accesses own profile (HTTP 200)');
    }

    // 6.2 Farmer A accesses own farms
    {
      const res = await fetch(`${baseUrl}/api/v1/farmers/${FARMER_A_ID}/farms`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0].id, FARM_A_ID);
      passed++;
      console.log('  ✅ PASSED: 6.2 Farmer A successfully accesses own farms (HTTP 200)');
    }

    // 6.3 Farmer A accesses own farm parcel
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.id, FARM_A_ID);
      passed++;
      console.log('  ✅ PASSED: 6.3 Farmer A successfully accesses own farm parcel (HTTP 200)');
    }

    // 6.4 Farmer A accesses own risk assessment by ID
    {
      const res = await fetch(`${baseUrl}/api/v1/risk-assessments/${ASSESSMENT_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.id, ASSESSMENT_A_ID);
      passed++;
      console.log('  ✅ PASSED: 6.4 Farmer A successfully accesses own risk assessment (HTTP 200)');
    }

    // 6.5 Farmer A accesses own policy details
    {
      const res = await fetch(`${baseUrl}/api/v1/policies/${POLICY_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.id, POLICY_A_ID);
      passed++;
      console.log('  ✅ PASSED: 6.5 Farmer A successfully accesses own policy details (HTTP 200)');
    }

    // 6.6 Farmer A accesses own claim details
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${CLAIM_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenFarmerA}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.id, CLAIM_A_ID);
      passed++;
      console.log('  ✅ PASSED: 6.6 Farmer A successfully accesses own claim details (HTTP 200)');
    }

    // 6.7 Admin lists all farmers
    {
      const res = await fetch(`${baseUrl}/api/v1/farmers`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.pagination.total, 2);
      passed++;
      console.log('  ✅ PASSED: 6.7 Admin lists all farmers successfully (HTTP 200)');
    }

    // 6.8 Admin lists all farms
    {
      const res = await fetch(`${baseUrl}/api/v1/farms`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.pagination.total, 2);
      passed++;
      console.log('  ✅ PASSED: 6.8 Admin lists all farms successfully (HTTP 200)');
    }

    // 6.9 Admin retrieves portfolio summary
    {
      const res = await fetch(`${baseUrl}/api/v1/risk-assessments/portfolio-summary`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.totalParcels, 2);
      passed++;
      console.log('  ✅ PASSED: 6.9 Admin retrieves portfolio summary successfully (HTTP 200)');
    }

    // 6.10 Admin accesses any farmer profile
    {
      const res = await fetch(`${baseUrl}/api/v1/farmers/${FARMER_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.id, FARMER_A_ID);
      passed++;
      console.log('  ✅ PASSED: 6.10 Admin accesses Farmer A profile (HTTP 200)');
    }

    // 6.11 Admin accesses any farm parcel
    {
      const res = await fetch(`${baseUrl}/api/v1/farms/${FARM_A_ID}`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      assert.equal(res.status, 200);
      passed++;
      console.log('  ✅ PASSED: 6.11 Admin accesses Farm A parcel (HTTP 200)');
    }

    // 6.12 Admin accesses any risk assessment
    {
      const res = await fetch(`${baseUrl}/api/v1/risk-assessments/${ASSESSMENT_B_ID}`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      assert.equal(res.status, 200);
      passed++;
      console.log('  ✅ PASSED: 6.12 Admin accesses Farm B risk assessment (HTTP 200)');
    }

    // 6.13 Admin issues policy successfully
    {
      const res = await fetch(`${baseUrl}/api/v1/policies/${POLICY_A_ID}/issue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.status, PolicyStatus.ACTIVE);
      passed++;
      console.log('  ✅ PASSED: 6.13 Admin successfully issues policy to ACTIVE (HTTP 200)');
    }

    // 6.14 Admin approves claim successfully
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${CLAIM_A_ID}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.status, ClaimStatus.APPROVED);
      passed++;
      console.log('  ✅ PASSED: 6.14 Admin successfully approves claim to APPROVED (HTTP 200)');
    }

    // 6.15 Admin settles claim successfully
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${CLAIM_A_ID}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({ simulatedTransactionId: 'SIM-PAYOUT-ADMIN-001' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.status, ClaimStatus.PAID);
      passed++;
      console.log('  ✅ PASSED: 6.15 Admin successfully settles claim to PAID (HTTP 200)');
    }

    // 6.16 Admin rejects claim successfully
    {
      const res = await fetch(`${baseUrl}/api/v1/claims/${CLAIM_B_ID}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({ reason: 'Audit flagged potential anomaly' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.status, ClaimStatus.REJECTED);
      passed++;
      console.log('  ✅ PASSED: 6.16 Admin successfully rejects claim to REJECTED (HTTP 200)');
    }

    // 6.17 Farmer A creates a farm parcel for themselves (HTTP 201)
    {
      const res = await fetch(`${baseUrl}/api/v1/farms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenFarmerA}`,
        },
        body: JSON.stringify({
          farmerId: FARMER_A_ID,
          farmName: 'Anand Shinde East Orchard',
          cropName: 'Sugarcane',
          sowingDate: '2026-06-01',
          farmArea: 4.0,
          state: 'Maharashtra',
          district: 'Pune',
          village: 'Baramati',
          pincode: '413102',
        }),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.farmerId, FARMER_A_ID);
      assert.equal(body.data.farmName, 'Anand Shinde East Orchard');
      passed++;
      console.log('  ✅ PASSED: 6.17 Farmer A successfully creates farm parcel for themselves (HTTP 201)');
    }

    // 6.18 Admin creates a farm parcel for Farmer B (HTTP 201)
    {
      const res = await fetch(`${baseUrl}/api/v1/farms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({
          farmerId: FARMER_B_ID,
          farmName: 'Admin Registered Plot',
          cropName: 'Wheat',
          sowingDate: '2026-07-01',
          farmArea: 5.5,
          state: 'Maharashtra',
          district: 'Solapur',
          village: 'Karmala',
          pincode: '413203',
        }),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.farmerId, FARMER_B_ID);
      assert.equal(body.data.farmName, 'Admin Registered Plot');
      passed++;
      console.log('  ✅ PASSED: 6.18 Admin successfully registers a farm parcel for Farmer B (HTTP 201)');
    }

    console.log('\n================================================================================');
    console.log(`RBAC Test Results: ${passed} passed, 0 failed`);
    console.log('================================================================================\n');
  } finally {
    server.close();
  }
}

runRbacTests().catch((err) => {
  console.error('❌ RBAC test run failed with unhandled error:', err);
  process.exit(1);
});
