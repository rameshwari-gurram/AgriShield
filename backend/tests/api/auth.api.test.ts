/**
 * AgriShield Module 8/9: Auth OTP REST API Integration & Cross-Farmer Access Test Suite
 *
 * Verifies live Express HTTP dispatch:
 * 1. POST /api/v1/auth/otp/send (Validation, Rate Limiting, Non-enumerating for mobile & email)
 * 2. POST /api/v1/auth/otp/verify (Validation, Attempts counter, JWT issuance)
 * 3. Cross-Farmer BOLA/IDOR Integration:
 *    - Valid OTP token for Farmer A grants access to Farm A's ML Risk, Policies & Claims
 *    - Valid OTP token for Farmer B is strictly REJECTED with HTTP 403 Forbidden on Farm A
 * 4. Dual-Identifier Email OTP Authentication via API
 * 5. Safe Email Linking & Verification Endpoints
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
import { IEmailProvider, SendOtpEmailOptions, EmailSendResult } from '../../src/providers/email.provider.js';

const FARMER_A_ID = '11111111-1111-4111-8111-111111111111';
const FARMER_B_ID = '22222222-2222-4222-8222-222222222222';
const FARM_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FARM_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

class MockEmailProvider implements IEmailProvider {
  public sentEmails: Array<{ to: string; otp: string; recipientName?: string }> = [];
  public shouldFail: boolean = false;

  async sendOtpEmail(options: SendOtpEmailOptions): Promise<EmailSendResult> {
    if (this.shouldFail) {
      return { success: false, error: 'SMTP delivery timeout' };
    }
    this.sentEmails.push(options);
    return { success: true, messageId: `mock-msg-${Date.now()}` };
  }

  async verifyConnection(): Promise<boolean> {
    return !this.shouldFail;
  }
}

class MockFarmerRepository implements IFarmerRepository {
  public farmers: Farmer[] = [
    {
      id: FARMER_A_ID,
      fullName: 'Anand Shinde',
      mobileNumber: '9876543210',
      email: 'anand.shinde@agrishield.com',
      preferredLanguage: Language.mr,
      farmerReferenceNumber: 'AGRI-FMR-DEMO-STAGE96',
      createdAt: new Date('2026-10-14T10:00:00.000Z'),
      updatedAt: new Date('2026-10-14T10:00:00.000Z'),
    },
    {
      id: FARMER_B_ID,
      fullName: 'Sunita Patil',
      mobileNumber: '9123456780',
      email: 'sunita.patil@agrishield.com',
      preferredLanguage: Language.en,
      farmerReferenceNumber: 'AGRI-FMR-DEMO-02',
      createdAt: new Date('2026-10-14T10:00:00.000Z'),
      updatedAt: new Date('2026-10-14T10:00:00.000Z'),
    },
  ];

  async findByMobileNumber(mobileNumber: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.mobileNumber === mobileNumber) || null;
  }
  async findByEmail(email: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.email?.toLowerCase() === email.toLowerCase()) || null;
  }
  async findById(id: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.id === id) || null;
  }
  async findByReferenceNumber(ref: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.farmerReferenceNumber === ref) || null;
  }
  async updateEmail(id: string, email: string): Promise<Farmer> {
    const f = this.farmers.find((farmer) => farmer.id === id);
    if (!f) throw new Error(`Farmer ${id} not found`);
    f.email = email;
    return f;
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

class MockFarmRepository implements IFarmerRepository {
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
      farmArea: new Prisma.Decimal('2.50'),
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
      farmReferenceNumber: 'FRM-DEMO-BARAMATI-02',
      cropName: 'Cotton',
      cropVariety: 'Bt Cotton',
      sowingDate: new Date('2026-06-15T00:00:00.000Z'),
      expectedHarvestDate: new Date('2026-12-15T00:00:00.000Z'),
      farmArea: new Prisma.Decimal('3.00'),
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
  async findAll() { return []; }
  async count() { return 0; }
  async create(d: any) { return d; }
  async findByMobileNumber() { return null; }
  async findByReferenceNumber() { return null; }
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

  const resBody = await res.json().catch(() => ({}));
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

  // Wire up repositories and mock email provider
  const mockFarmerRepo = new MockFarmerRepository();
  const mockFarmRepo = new MockFarmRepository();
  const mockPolicyRepo = new MockPolicyRepository();
  const mockClaimRepo = new MockClaimRepository();
  const mockEmailProvider = new MockEmailProvider();

  // Inject into singletons
  (authService as any).farmerRepo = mockFarmerRepo;
  (authService as any).emailProvider = mockEmailProvider;
  (farmRepository as any).findById = mockFarmRepo.findById.bind(mockFarmRepo);
  (farmerRepository as any).findByMobileNumber = mockFarmerRepo.findByMobileNumber.bind(mockFarmerRepo);
  (farmerRepository as any).findByEmail = mockFarmerRepo.findByEmail.bind(mockFarmerRepo);
  (farmerRepository as any).updateEmail = mockFarmerRepo.updateEmail.bind(mockFarmerRepo);
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
    // TEST 1: POST /api/v1/auth/otp/send - Mobile Validation & Non-Enumeration
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

    // -------------------------------------------------------------------------
    // TEST 4: Dual-Identifier Email OTP Authentication via API
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Dual-Identifier Email OTP Authentication via API ---');
    let farmerAEmailToken: string = '';
    {
      authService._clearAllForTest();
      mockEmailProvider.sentEmails = [];

      // 4.1 Invalid email format
      const resBadEmail = await request(server, 'POST', '/api/v1/auth/otp/send', {
        email: 'invalid-email-string',
      });
      check(resBadEmail.status === 400, '4.1 Malformed email rejected with HTTP 400');

      // 4.2 Registered email send
      const resSendEmail = await request(server, 'POST', '/api/v1/auth/otp/send', {
        email: 'anand.shinde@agrishield.com',
      });
      check(resSendEmail.status === 200, '4.2 Registered email OTP send succeeds with HTTP 200');
      check(resSendEmail.body.data.maskedIdentifier === 'a***e@agrishield.com', '4.2 Returns masked email address');
      check(mockEmailProvider.sentEmails.length === 1, '4.2 Outbound email dispatched via provider');
      const receivedEmailOtp = mockEmailProvider.sentEmails[0].otp;

      // 4.3 Unregistered email non-enumerating
      const resSendUnregEmail = await request(server, 'POST', '/api/v1/auth/otp/send', {
        email: 'nobody@unregistered-domain.com',
      });
      check(resSendUnregEmail.status === 200, '4.3 Unregistered email returns HTTP 200 non-enumerating');
      check(resSendUnregEmail.body.message.includes('If this email address is registered'), '4.3 Returns identical message');

      // 4.4 Verify email OTP
      const resVerifyEmail = await request(server, 'POST', '/api/v1/auth/otp/verify', {
        email: 'anand.shinde@agrishield.com',
        otp: receivedEmailOtp,
      });
      check(resVerifyEmail.status === 200, '4.4 Valid email OTP accepted with HTTP 200');
      check(resVerifyEmail.body.data.farmer.email === 'anand.shinde@agrishield.com', '4.4 Returns farmer profile with verified email');
      farmerAEmailToken = resVerifyEmail.body.data.token;

      // 4.5 Verify email token grants access to owner farm
      const resOwnerViaEmailToken = await request(server, 'GET', `/api/v1/farms/${FARM_A_ID}/policies`, undefined, farmerAEmailToken);
      check(resOwnerViaEmailToken.status === 200, '4.5 Email-authenticated token successfully accesses Farm A policies');
    }

    // -------------------------------------------------------------------------
    // TEST 5: Safe Email Association / Linking Endpoints
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Safe Email Association / Linking Endpoints ---');
    {
      authService._clearAllForTest();
      mockEmailProvider.sentEmails = [];

      // 5.1 Unauthenticated request-link rejected with 401
      const resNoAuthLink = await request(server, 'POST', '/api/v1/auth/email/request-link', {
        email: 'anand.updated@agrishield.com',
      });
      check(resNoAuthLink.status === 401, '5.1 Unauthenticated email link request rejected with 401');

      // 5.2 Duplicate email link request rejected with 409
      const resDupLink = await request(
        server,
        'POST',
        '/api/v1/auth/email/request-link',
        { email: 'sunita.patil@agrishield.com' },
        farmerAToken
      );
      check(resDupLink.status === 409, '5.2 Duplicate email link request rejected with 409 Conflict');

      // 5.3 Valid request-link dispatches OTP
      const resValidLink = await request(
        server,
        'POST',
        '/api/v1/auth/email/request-link',
        { email: 'anand.updated@agrishield.com' },
        farmerAToken
      );
      check(resValidLink.status === 200, '5.3 Valid email link request succeeds with 200');
      check(mockEmailProvider.sentEmails.length === 1, '5.3 OTP dispatched to new target email');
      const linkOtp = mockEmailProvider.sentEmails[0].otp;

      // 5.4 Confirm with wrong OTP rejected with 400
      const resWrongConfirm = await request(
        server,
        'POST',
        '/api/v1/auth/email/confirm-link',
        { email: 'anand.updated@agrishield.com', otp: '000000' },
        farmerAToken
      );
      check(resWrongConfirm.status === 400, '5.4 Wrong OTP for email link rejected with 400');

      // 5.5 Confirm with valid OTP succeeds and links email
      const resValidConfirm = await request(
        server,
        'POST',
        '/api/v1/auth/email/confirm-link',
        { email: 'anand.updated@agrishield.com', otp: linkOtp },
        farmerAToken
      );
      check(resValidConfirm.status === 200, '5.5 Confirming email link succeeds with 200');
      check(resValidConfirm.body.data.farmer.email === 'anand.updated@agrishield.com', '5.5 Email associated with farmer profile');

      // 5.6 Concurrent race condition (P2002) in API confirm-link returns HTTP 409
      const origUpdateEmail = mockFarmerRepo.updateEmail.bind(mockFarmerRepo);
      mockFarmerRepo.updateEmail = async () => {
        const p2002: any = new Error('Unique constraint failed on the fields: (`email`)');
        p2002.code = 'P2002';
        throw p2002;
      };
      try {
        await request(
          server,
          'POST',
          '/api/v1/auth/email/request-link',
          { email: 'race.test@agrishield.com' },
          farmerAToken
        );
        const raceOtp = mockEmailProvider.sentEmails[mockEmailProvider.sentEmails.length - 1].otp;
        const resRaceConfirm = await request(
          server,
          'POST',
          '/api/v1/auth/email/confirm-link',
          { email: 'race.test@agrishield.com', otp: raceOtp },
          farmerAToken
        );
        check(resRaceConfirm.status === 409, '5.6 Concurrent link race (P2002) returns HTTP 409 Conflict');
        check(
          resRaceConfirm.body.message === 'This email address is already associated with another producer account.',
          '5.6 Returns sanitized message'
        );
        check(!JSON.stringify(resRaceConfirm.body).includes('P2002'), '5.6 Zero Prisma internal error leakage');
      } finally {
        mockFarmerRepo.updateEmail = origUpdateEmail;
      }
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
