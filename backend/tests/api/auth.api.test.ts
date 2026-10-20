/**
 * AgriShield Module 8/9: Auth OTP REST API Integration & Cross-Farmer Access Test Suite
 *
 * Verifies live Express HTTP dispatch:
 * 1. POST /api/v1/auth/otp/send (Validation, Rate Limiting, Non-enumerating)
 * 2. POST /api/v1/auth/otp/verify (Validation, Attempts counter, JWT issuance)
 * 3. Cross-Farmer BOLA/IDOR Integration:
 *    - Valid OTP token for Farmer A grants access to Farm A's ML Risk, Policies & Claims
 *    - Valid OTP token for Farmer B is strictly REJECTED with HTTP 403 Forbidden on Farm A
 */

import http from 'http';
import { strict as assert } from 'node:assert';
import { createApp } from '../../src/app.js';
import { farmRepository } from '../../src/repositories/farm.repository.js';
import { farmerRepository } from '../../src/repositories/farmer.repository.js';
import { authService } from '../../src/services/auth.service.js';
import { Farm, Farmer, Language, FarmStatus, AreaUnit, Policy, Claim, PolicyStatus, ClaimStatus } from '@prisma/client';
import { IFarmRepository } from '../../src/types/farm.types.js';
import { IFarmerRepository } from '../../src/types/farmer.types.js';
import { policyController } from '../../src/controllers/policy.controller.js';
import { claimController } from '../../src/controllers/claim.controller.js';
import { mlRiskController } from '../../src/controllers/mlRisk.controller.js';
import { IPolicyRepository } from '../../src/types/policy.types.js';
import { IClaimRepository } from '../../src/types/claim.types.js';
import { Prisma } from '@prisma/client';

const FARMER_A_ID = '11111111-1111-4111-8111-111111111111';
const FARMER_B_ID = '22222222-2222-4222-8222-222222222222';
const FARM_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FARM_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

class MockFarmerRepository implements IFarmerRepository {
  public farmers: Farmer[] = [
    {
      id: FARMER_A_ID,
      fullName: 'Anand Shinde',
      mobileNumber: '9876543210',
      preferredLanguage: Language.mr,
      farmerReferenceNumber: 'AGRI-FMR-DEMO-STAGE96',
      createdAt: new Date('2026-10-14T10:00:00.000Z'),
      updatedAt: new Date('2026-10-14T10:00:00.000Z'),
    },
    {
      id: FARMER_B_ID,
      fullName: 'Sunita Patil',
      mobileNumber: '9123456780',
      preferredLanguage: Language.en,
      farmerReferenceNumber: 'AGRI-FMR-DEMO-02',
      createdAt: new Date('2026-10-14T10:00:00.000Z'),
      updatedAt: new Date('2026-10-14T10:00:00.000Z'),
    },
  ];

  async findByMobileNumber(mobileNumber: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.mobileNumber === mobileNumber) || null;
  }
  async findById(id: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.id === id) || null;
  }
  async findByReferenceNumber(ref: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.farmerReferenceNumber === ref) || null;
  }
  async create(data: any): Promise<Farmer> {
    this.farmers.push(data);
    return data;
  }
  async findAll(): Promise<Farmer[]> {
    return this.farmers;
  }
  async count(): Promise<number> {
    return this.farmers.length;
  }
}

class MockFarmRepository implements IFarmRepository {
  public farms: Farm[] = [
    {
      id: FARM_A_ID,
      farmerId: FARMER_A_ID,
      farmName: 'Indapur Sugarcane Parcel A',
      farmReferenceNumber: 'FRM-DEMO-INDAPUR-01',
      cropName: 'Sugarcane',
      cropVariety: 'Co 86032',
      sowingDate: new Date('2026-06-01T00:00:00.000Z'),
      expectedHarvestDate: new Date('2027-04-30T00:00:00.000Z'),
      farmArea: 2.5,
      farmAreaUnit: AreaUnit.ACRE,
      village: 'Indapur',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413106',
      status: FarmStatus.ACTIVE,
      createdAt: new Date('2026-10-14T10:00:00.000Z'),
      updatedAt: new Date('2026-10-14T10:00:00.000Z'),
    },
    {
      id: FARM_B_ID,
      farmerId: FARMER_B_ID,
      farmName: 'Baramati Cotton Parcel B',
      farmReferenceNumber: 'FRM-DEMO-BARAMATI-01',
      cropName: 'Cotton',
      cropVariety: 'Bt Cotton',
      sowingDate: new Date('2026-06-15T00:00:00.000Z'),
      expectedHarvestDate: new Date('2026-12-31T00:00:00.000Z'),
      farmArea: 3.0,
      farmAreaUnit: AreaUnit.ACRE,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
      status: FarmStatus.ACTIVE,
      createdAt: new Date('2026-10-14T10:00:00.000Z'),
      updatedAt: new Date('2026-10-14T10:00:00.000Z'),
    },
  ];

  async findById(id: string): Promise<Farm | null> {
    return this.farms.find((f) => f.id === id) || null;
  }
  async findByFarmerId(farmerId: string): Promise<Farm[]> {
    return this.farms.filter((f) => f.farmerId === farmerId);
  }
  async findByReferenceNumber(ref: string): Promise<Farm | null> {
    return this.farms.find((f) => f.farmReferenceNumber === ref) || null;
  }
  async create(data: any): Promise<Farm> {
    this.farms.push(data);
    return data;
  }
  async findAll(): Promise<Farm[]> {
    return this.farms;
  }
  async count(): Promise<number> {
    return this.farms.length;
  }
  async update(): Promise<Farm> {
    return this.farms[0];
  }
  async delete(): Promise<Farm> {
    return this.farms[0];
  }
}

class MockPolicyRepository implements IPolicyRepository {
  public policies: Policy[] = [
    {
      id: 'pol-1111',
      policyNumber: 'POL-DEMO-001',
      farmId: FARM_A_ID,
      farmerId: FARMER_A_ID,
      cropName: 'Sugarcane',
      sumInsured: new Prisma.Decimal('100000.00'),
      premiumAmount: new Prisma.Decimal('5000.00'),
      coveredHazards: ['HEAVY_RAINFALL'],
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-11-30T00:00:00.000Z'),
      cumulativePaidAmount: new Prisma.Decimal('100000.00'),
      status: PolicyStatus.EXHAUSTED,
      createdAt: new Date('2026-10-14T10:00:00.000Z'),
      updatedAt: new Date('2026-10-14T10:00:00.000Z'),
    },
  ];

  async createPolicy(d: any) { return d; }
  async findById(id: string) { return this.policies.find((p) => p.id === id) || null; }
  async findByFarmId(farmId: string) { return this.policies.filter((p) => p.farmId === farmId); }
  async findActivePolicyForFarm() { return null; }
  async updatePolicyStatus(id: string, s: any) { return this.policies[0]; }
  async updatePolicyBalanceAndStatus() { return this.policies[0]; }
  async findAll() { return this.policies; }
  async count() { return this.policies.length; }
}

class MockClaimRepository implements IClaimRepository {
  public claims: Claim[] = [
    {
      id: 'clm-1111',
      claimNumber: 'CLM-DEMO-001',
      policyId: 'pol-1111',
      assessmentId: 'assess-1',
      riskEventId: 'event-1',
      triggerRuleCode: 'VERY_HEAVY_RAINFALL_24H',
      severity: 'VERY_HIGH' as any,
      observedValue: new Prisma.Decimal('130.00'),
      thresholdValue: new Prisma.Decimal('115.50'),
      payoutAmount: new Prisma.Decimal('80000.00'),
      status: ClaimStatus.PAID,
      rejectionReason: null,
      payoutReference: 'SIM-PAYOUT-DEMO-001',
      paidAt: new Date('2026-10-14T12:00:00.000Z'),
      createdAt: new Date('2026-10-14T11:00:00.000Z'),
      updatedAt: new Date('2026-10-14T12:00:00.000Z'),
    },
  ];

  async createClaim(d: any) { return d; }
  async findById(id: string) { return this.claims.find((c) => c.id === id) || null; }
  async findByFarmId() { return this.claims; }
  async findByPolicyId() { return this.claims; }
  async findByPolicyAndEvent() { return null; }
  async updateClaimStatus() { return this.claims[0]; }
  async findAll() { return this.claims; }
  async count() { return this.claims.length; }
}

async function request(
  server: http.Server,
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any }> {
  const addr = server.address() as any;
  const url = `http://127.0.0.1:${addr.port}${path}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const resBody = await res.json().catch(() => null);
  return { status: res.status, body: resBody };
}

async function runAuthApiTests() {
  console.log('\n================================================================================');
  console.log('🧪 Running AgriShield Auth OTP API Integration & BOLA Tests');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  const check = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
    }
  };

  // Wire up repositories
  const mockFarmerRepo = new MockFarmerRepository();
  const mockFarmRepo = new MockFarmRepository();
  const mockPolicyRepo = new MockPolicyRepository();
  const mockClaimRepo = new MockClaimRepository();

  // Inject into singletons
  (authService as any).farmerRepo = mockFarmerRepo;
  (farmRepository as any).findById = mockFarmRepo.findById.bind(mockFarmRepo);
  (farmerRepository as any).findByMobileNumber = mockFarmerRepo.findByMobileNumber.bind(mockFarmerRepo);
  (policyController as any).service.policyRepo = mockPolicyRepo;
  (claimController as any).service.claimRepo = mockClaimRepo;

  // Mock ML service call in controller for testing
  (mlRiskController as any).service.assessFarmRisk = async (fId: string) => ({
    id: 'pred-test',
    farmId: fId,
    riskScore: 0.35,
    riskClass: 'LOW',
    calibratedProbability: 0.35,
    isCached: false,
    evaluatedAt: new Date().toISOString(),
    featureSnapshot: {} as any,
    shapExplanation: [] as any,
    modelMetadata: {} as any,
  });

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    authService._clearAllForTest();

    // -------------------------------------------------------------------------
    // TEST 1: POST /api/v1/auth/otp/send - Validation & Non-Enumeration
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: POST /api/v1/auth/otp/send ---');
    {
      // 1.1 Invalid mobile format
      const resBadMobile = await request(server, 'POST', '/api/v1/auth/otp/send', {
        mobileNumber: '12345',
      });
      check(resBadMobile.status === 400, '1.1 Malformed mobile number rejected with HTTP 400');

      // 1.2 Registered mobile number
      const resSendReg = await request(server, 'POST', '/api/v1/auth/otp/send', {
        mobileNumber: '+919876543210',
      });
      check(resSendReg.status === 200, '1.2 Registered number succeeds with HTTP 200');
      check(resSendReg.body.data.maskedMobile === '******3210', '1.2 Returns masked mobile number');
      check(resSendReg.body.data.otp === undefined, '1.2 Plaintext OTP is NOT returned in response');

      // 1.3 Unregistered mobile number (Non-enumerating)
      const resSendUnreg = await request(server, 'POST', '/api/v1/auth/otp/send', {
        mobileNumber: '9999999999',
      });
      check(resSendUnreg.status === 200, '1.3 Unregistered number returns HTTP 200 (Non-enumerating)');
      check(resSendUnreg.body.message === resSendReg.body.message, '1.3 Returns identical message for privacy');

      // 1.4 Formatted mobile number with spacing and hyphens
      authService._clearAllForTest();
      const resSendFormatted = await request(server, 'POST', '/api/v1/auth/otp/send', {
        mobileNumber: '+91 98765-43210',
      });
      check(resSendFormatted.status === 200, '1.4 Formatted mobile with spaces/hyphens succeeds with HTTP 200');
      check(resSendFormatted.body.data.maskedMobile === '******3210', '1.4 Normalizes formatted mobile number');
    }

    // -------------------------------------------------------------------------
    // TEST 2: POST /api/v1/auth/otp/verify - Code Validation & JWT Issuance
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: POST /api/v1/auth/otp/verify ---');
    let farmerAToken: string = '';
    let farmerBToken: string = '';
    {
      // Reset challenges and fix OTP for Farmer A
      authService._clearAllForTest();
      const origGen = authService.generateSixDigitOtp.bind(authService);
      authService.generateSixDigitOtp = () => '123456';

      try {
        await request(server, 'POST', '/api/v1/auth/otp/send', { mobileNumber: '9876543210' });

        // 2.1 Invalid OTP format (letters)
        const resBadFormat = await request(server, 'POST', '/api/v1/auth/otp/verify', {
          mobileNumber: '9876543210',
          otp: 'ABC123',
        });
        check(resBadFormat.status === 400, '2.1 Non-digit OTP rejected with HTTP 400');

        // 2.2 Incorrect OTP
        const resWrong = await request(server, 'POST', '/api/v1/auth/otp/verify', {
          mobileNumber: '9876543210',
          otp: '999999',
        });
        check(resWrong.status === 400, '2.2 Incorrect OTP rejected with HTTP 400');
        check(resWrong.body.message.includes('2 attempt(s) remaining'), '2.2 Informs remaining attempts');

        // 2.3 Correct OTP
        const resVerify = await request(server, 'POST', '/api/v1/auth/otp/verify', {
          mobileNumber: '9876543210',
          otp: '123456',
        });
        check(resVerify.status === 200, '2.3 Valid OTP accepted with HTTP 200');
        check(typeof resVerify.body.data.token === 'string', '2.3 Issues authenticated Bearer JWT token');
        check(resVerify.body.data.farmer.id === FARMER_A_ID, '2.3 Farmer ID is derived from database record');
        farmerAToken = resVerify.body.data.token;
      } finally {
        authService.generateSixDigitOtp = origGen;
      }

      // Generate token for Farmer B for BOLA/IDOR cross-farmer checks
      authService._clearAllForTest();
      authService.generateSixDigitOtp = () => '654321';
      try {
        await request(server, 'POST', '/api/v1/auth/otp/send', { mobileNumber: '9123456780' });
        const resVerifyB = await request(server, 'POST', '/api/v1/auth/otp/verify', {
          mobileNumber: '9123456780',
          otp: '654321',
        });
        check(resVerifyB.status === 200, '2.4 Farmer B authenticated via OTP');
        farmerBToken = resVerifyB.body.data.token;
      } finally {
        authService.generateSixDigitOtp = origGen;
      }
    }

    // -------------------------------------------------------------------------
    // TEST 3: BOLA / IDOR Verification on Module 8 & Module 9 Endpoints
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Cross-Farmer BOLA / IDOR Access Verification ---');
    {
      // 3.1 Unauthenticated requests to Module 8 ML Risk -> HTTP 401
      const resMlNoAuth = await request(server, 'GET', `/api/v1/farms/${FARM_A_ID}/ml-risk`);
      check(resMlNoAuth.status === 401, '3.1 Unauthenticated GET /farms/:id/ml-risk rejected with 401');

      // 3.2 Farmer A (owner) accessing Farm A's ML Risk -> HTTP 200
      const resMlOwner = await request(server, 'GET', `/api/v1/farms/${FARM_A_ID}/ml-risk`, undefined, farmerAToken);
      check(resMlOwner.status === 200, '3.2 Farmer A (owner) accessing Farm A ml-risk succeeds with 200');

      // 3.3 Farmer B (non-owner) accessing Farm A's ML Risk -> HTTP 403 Forbidden
      const resMlImposter = await request(server, 'GET', `/api/v1/farms/${FARM_A_ID}/ml-risk`, undefined, farmerBToken);
      check(resMlImposter.status === 403, '3.3 Farmer B accessing Farm A ml-risk strictly rejected with HTTP 403');

      // 3.4 Unauthenticated requests to Module 9 Policies -> HTTP 401
      const resPolNoAuth = await request(server, 'GET', `/api/v1/farms/${FARM_A_ID}/policies`);
      check(resPolNoAuth.status === 401, '3.4 Unauthenticated GET /farms/:id/policies rejected with 401');

      // 3.5 Farmer A (owner) accessing Farm A's Policies -> HTTP 200
      const resPolOwner = await request(server, 'GET', `/api/v1/farms/${FARM_A_ID}/policies`, undefined, farmerAToken);
      check(resPolOwner.status === 200, '3.5 Farmer A (owner) accessing Farm A policies succeeds with 200');

      // 3.6 Farmer B (non-owner) accessing Farm A's Policies -> HTTP 403 Forbidden
      const resPolImposter = await request(server, 'GET', `/api/v1/farms/${FARM_A_ID}/policies`, undefined, farmerBToken);
      check(resPolImposter.status === 403, '3.6 Farmer B accessing Farm A policies strictly rejected with HTTP 403');

      // 3.7 Unauthenticated requests to Module 9 Claims -> HTTP 401
      const resClmNoAuth = await request(server, 'GET', `/api/v1/farms/${FARM_A_ID}/claims`);
      check(resClmNoAuth.status === 401, '3.7 Unauthenticated GET /farms/:id/claims rejected with 401');

      // 3.8 Farmer A (owner) accessing Farm A's Claims -> HTTP 200
      const resClmOwner = await request(server, 'GET', `/api/v1/farms/${FARM_A_ID}/claims`, undefined, farmerAToken);
      check(resClmOwner.status === 200, '3.8 Farmer A (owner) accessing Farm A claims succeeds with 200');

      // 3.9 Farmer B (non-owner) accessing Farm A's Claims -> HTTP 403 Forbidden
      const resClmImposter = await request(server, 'GET', `/api/v1/farms/${FARM_A_ID}/claims`, undefined, farmerBToken);
      check(resClmImposter.status === 403, '3.9 Farmer B accessing Farm A claims strictly rejected with HTTP 403');
    }

    console.log('\n================================================================================');
    console.log(`Auth API Test Results: ${passed} passed, ${failed} failed`);
    console.log('================================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

runAuthApiTests().catch((err) => {
  console.error('Fatal error running Auth API Tests:', err);
  process.exit(1);
});
