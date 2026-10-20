/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.2: Policy & Claim Domain Types, Validators & Repository Unit Tests
 */

import { Prisma, Policy, Claim, PolicyStatus, ClaimStatus, RiskHazardType, RiskSeverity } from '@prisma/client';
import { createPolicySchema, policyIdParamSchema, farmIdParamSchema } from '../src/validators/policy.validator.js';
import { createClaimSchema, claimIdParamSchema } from '../src/validators/claim.validator.js';
import { PolicyRepository } from '../src/repositories/policy.repository.js';
import { ClaimRepository } from '../src/repositories/claim.repository.js';
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
// MOCK PRISMA CLIENT FOR REPOSITORY UNIT TESTS
// =============================================================================

class MockPrismaClient {
  public policies: Policy[] = [];
  public claims: Claim[] = [];

  public policy = {
    create: async ({ data }: { data: any }): Promise<Policy> => {
      const newPolicy: Policy = {
        id: data.id || '11111111-1111-4111-8111-111111111111',
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
    },

    findUnique: async ({ where }: { where: { id?: string; policyNumber?: string } }): Promise<Policy | null> => {
      if (where.id) {
        return this.policies.find((p) => p.id === where.id) || null;
      }
      if (where.policyNumber) {
        return this.policies.find((p) => p.policyNumber === where.policyNumber) || null;
      }
      return null;
    },

    findMany: async ({ where, orderBy }: { where?: any; orderBy?: any }): Promise<Policy[]> => {
      let result = [...this.policies];
      if (where?.farmId) {
        result = result.filter((p) => p.farmId === where.farmId);
      }
      return result;
    },

    findFirst: async ({ where }: { where?: any }): Promise<Policy | null> => {
      return this.policies.find((p) => {
        if (where.farmId && p.farmId !== where.farmId) return false;
        if (where.status && p.status !== where.status) return false;
        if (where.startDate?.lte && p.startDate > where.startDate.lte) return false;
        if (where.endDate?.gte && p.endDate < where.endDate.gte) return false;
        return true;
      }) || null;
    },

    update: async ({ where, data }: { where: { id: string }; data: any }): Promise<Policy> => {
      const idx = this.policies.findIndex((p) => p.id === where.id);
      if (idx === -1) {
        throw new Error('Record not found');
      }
      const updated: Policy = {
        ...this.policies[idx],
        ...data,
        updatedAt: new Date('2026-10-13T12:00:00.000Z'),
      };
      this.policies[idx] = updated;
      return updated;
    },
  };

  public claim = {
    create: async ({ data }: { data: any }): Promise<Claim> => {
      // Simulate unique compound constraint on (policyId, riskEventId)
      const existingDuplicate = this.claims.find(
        (c) => c.policyId === data.policyId && c.riskEventId === data.riskEventId
      );
      if (existingDuplicate) {
        const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
        });
        (error as any).meta = { target: ['policyId', 'riskEventId'] };
        throw error;
      }

      // Simulate unique claimNumber constraint
      const existingNum = this.claims.find((c) => c.claimNumber === data.claimNumber);
      if (existingNum) {
        const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
        });
        (error as any).meta = { target: ['claimNumber'] };
        throw error;
      }

      const newClaim: Claim = {
        id: data.id || '22222222-2222-4222-8222-222222222222',
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
    },

    findUnique: async ({ where }: { where: any }): Promise<Claim | null> => {
      if (where.id) {
        return this.claims.find((c) => c.id === where.id) || null;
      }
      if (where.policy_risk_event_unique) {
        const { policyId, riskEventId } = where.policy_risk_event_unique;
        return (
          this.claims.find((c) => c.policyId === policyId && c.riskEventId === riskEventId) || null
        );
      }
      return null;
    },

    findMany: async ({ where }: { where?: any }): Promise<Claim[]> => {
      let result = [...this.claims];
      if (where?.policyId) {
        result = result.filter((c) => c.policyId === where.policyId);
      }
      if (where?.policy?.farmId) {
        const farmId = where.policy.farmId;
        const matchingPolicyIds = this.policies
          .filter((p) => p.farmId === farmId)
          .map((p) => p.id);
        result = result.filter((c) => matchingPolicyIds.includes(c.policyId));
      }
      return result;
    },
  };

  public async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

// =============================================================================
// TEST EXECUTION
// =============================================================================

async function runStage92Tests() {
  console.log('\n================================================================================');
  console.log('🧪 Running Module 9 Stage 9.2: Domain Types, Validators & Repository Tests');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // SUITE 1: POLICY VALIDATORS
  // ---------------------------------------------------------------------------
  console.log('--- SUITE 1: Policy Validators ---');

  const validPolicyPayload = {
    farmId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    farmerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    cropName: 'Cotton',
    sumInsured: '100000.00',
    premiumAmount: '5000.00',
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL, RiskHazardType.INTENSE_RAINFALL],
    startDate: '2026-06-01T00:00:00.000Z',
    endDate: '2026-11-30T23:59:59.000Z',
  };

  const parsedValidPolicy = createPolicySchema.safeParse(validPolicyPayload);
  assert(parsedValidPolicy.success === true, '1.1 Valid policy creation payload passes Zod validation');
  if (parsedValidPolicy.success) {
    assert(parsedValidPolicy.data.status === PolicyStatus.PENDING, '1.2 Policy defaults to PENDING status');
  }

  // Reject malformed UUIDs
  const invalidFarmId = createPolicySchema.safeParse({ ...validPolicyPayload, farmId: 'not-a-uuid' });
  assert(!invalidFarmId.success, '1.3 Malformed farmId rejected with UUID validation error');

  const invalidFarmerId = createPolicySchema.safeParse({ ...validPolicyPayload, farmerId: 'invalid-id' });
  assert(!invalidFarmerId.success, '1.4 Malformed farmerId rejected with UUID validation error');

  // Reject empty / short crop name
  const shortCrop = createPolicySchema.safeParse({ ...validPolicyPayload, cropName: 'A' });
  assert(!shortCrop.success, '1.5 Crop name shorter than 2 characters rejected');

  // Reject non-positive or malformed sumInsured
  const zeroSum = createPolicySchema.safeParse({ ...validPolicyPayload, sumInsured: '0.00' });
  assert(!zeroSum.success, '1.6 Zero sumInsured rejected');

  const negativeSum = createPolicySchema.safeParse({ ...validPolicyPayload, sumInsured: -500 });
  assert(!negativeSum.success, '1.7 Negative sumInsured rejected');

  const excessDecimalsSum = createPolicySchema.safeParse({ ...validPolicyPayload, sumInsured: '100.555' });
  assert(!excessDecimalsSum.success, '1.8 SumInsured with more than 2 decimal places rejected');

  // Reject premium exceeding sumInsured
  const excessPremium = createPolicySchema.safeParse({
    ...validPolicyPayload,
    sumInsured: '10000.00',
    premiumAmount: '15000.00',
  });
  assert(!excessPremium.success, '1.9 Premium amount exceeding sumInsured rejected');

  // Reject empty coveredHazards array
  const emptyHazards = createPolicySchema.safeParse({ ...validPolicyPayload, coveredHazards: [] });
  assert(!emptyHazards.success, '1.10 Empty coveredHazards array rejected');

  // Reject endDate before or equal to startDate
  const reversedDates = createPolicySchema.safeParse({
    ...validPolicyPayload,
    startDate: '2026-11-30T00:00:00.000Z',
    endDate: '2026-06-01T00:00:00.000Z',
  });
  assert(!reversedDates.success, '1.11 End date earlier than start date rejected');

  const equalDates = createPolicySchema.safeParse({
    ...validPolicyPayload,
    startDate: '2026-06-01T00:00:00.000Z',
    endDate: '2026-06-01T00:00:00.000Z',
  });
  assert(!equalDates.success, '1.12 End date identical to start date rejected');

  // Param schemas
  const validPolicyId = policyIdParamSchema.safeParse({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  assert(validPolicyId.success === true, '1.13 Valid policy UUID param passes');

  const invalidPolicyId = policyIdParamSchema.safeParse({ id: 'bad-uuid' });
  assert(!invalidPolicyId.success, '1.14 Invalid policy UUID param rejected');

  // ---------------------------------------------------------------------------
  // SUITE 2: CLAIM VALIDATORS
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Claim Validators ---');

  const validClaimPayload = {
    policyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    assessmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    riskEventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    triggerRuleCode: 'HEAVY_RAINFALL_24H',
    severity: RiskSeverity.HIGH,
    observedValue: 78.4,
    thresholdValue: 64.5,
    payoutAmount: 50000.0,
  };

  const parsedValidClaim = createClaimSchema.safeParse(validClaimPayload);
  assert(parsedValidClaim.success === true, '2.1 Valid claim creation payload passes Zod validation');
  if (parsedValidClaim.success) {
    assert(parsedValidClaim.data.status === ClaimStatus.PENDING, '2.2 Claim creation defaults to PENDING status');
  }

  // Reject malformed UUIDs
  const invalidPolicyFk = createClaimSchema.safeParse({ ...validClaimPayload, policyId: '1234' });
  assert(!invalidPolicyFk.success, '2.3 Malformed policyId rejected');

  const invalidAssessmentFk = createClaimSchema.safeParse({ ...validClaimPayload, assessmentId: '1234' });
  assert(!invalidAssessmentFk.success, '2.4 Malformed assessmentId rejected');

  const invalidEventFk = createClaimSchema.safeParse({ ...validClaimPayload, riskEventId: '1234' });
  assert(!invalidEventFk.success, '2.5 Malformed riskEventId rejected');

  // Reject client attempting to set status = PAID on creation
  const paidCreationAttempt = createClaimSchema.safeParse({
    ...validClaimPayload,
    status: ClaimStatus.PAID as any,
  });
  assert(!paidCreationAttempt.success, '2.6 Setting Claim status to PAID during creation is strictly rejected');

  // Reject negative payoutAmount
  const negativePayout = createClaimSchema.safeParse({ ...validClaimPayload, payoutAmount: -100 });
  assert(!negativePayout.success, '2.7 Negative payout amount rejected');

  const zeroPayout = createClaimSchema.safeParse({ ...validClaimPayload, payoutAmount: 0 });
  assert(!zeroPayout.success, '2.8 Zero payout amount rejected');

  // Param schemas
  const validClaimId = claimIdParamSchema.safeParse({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  assert(validClaimId.success === true, '2.9 Valid claim UUID param passes');

  // ---------------------------------------------------------------------------
  // SUITE 3: POLICY REPOSITORY
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Policy Repository ---');

  const mockDb = new MockPrismaClient();
  const policyRepo = new PolicyRepository(mockDb as any);

  // 3.1 createPolicy
  const createdPolicy = await policyRepo.createPolicy({
    policyNumber: 'POL-2026-TEST-001',
    farmId: 'farm-uuid-1',
    farmerId: 'farmer-uuid-1',
    cropName: 'Soybean',
    sumInsured: new Prisma.Decimal('100000.00'),
    premiumAmount: new Prisma.Decimal('5000.00'),
    coveredHazards: [RiskHazardType.HEAVY_RAINFALL],
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-11-30T23:59:59.000Z'),
  });

  assert(createdPolicy.policyNumber === 'POL-2026-TEST-001', '3.1 Policy created with assigned policy number');
  assert(createdPolicy.status === PolicyStatus.PENDING, '3.2 Policy created with initial PENDING status');
  assert(createdPolicy.cumulativePaidAmount.equals(new Prisma.Decimal('0.00')), '3.3 Initial cumulativePaidAmount is exactly 0.00');

  // 3.2 findById
  const foundPolicy = await policyRepo.findById(createdPolicy.id);
  assert(foundPolicy !== null && foundPolicy.id === createdPolicy.id, '3.4 findById retrieves existing policy');

  const missingPolicy = await policyRepo.findById('non-existent-uuid');
  assert(missingPolicy === null, '3.5 findById returns null for non-existent UUID');

  // 3.3 findByFarmId
  const farmPolicies = await policyRepo.findByFarmId('farm-uuid-1');
  assert(farmPolicies.length === 1, '3.6 findByFarmId retrieves policies for farm');

  // 3.4 findActivePolicyForFarm (currently PENDING, so should return null)
  const activeCheck1 = await policyRepo.findActivePolicyForFarm('farm-uuid-1', new Date('2026-08-01T00:00:00.000Z'));
  assert(activeCheck1 === null, '3.7 findActivePolicyForFarm returns null for PENDING policy');

  // Activate policy for testing
  createdPolicy.status = PolicyStatus.ACTIVE;

  const activeCheck2 = await policyRepo.findActivePolicyForFarm('farm-uuid-1', new Date('2026-08-01T00:00:00.000Z'));
  assert(activeCheck2 !== null && activeCheck2.id === createdPolicy.id, '3.8 findActivePolicyForFarm returns ACTIVE policy during coverage window');

  const outsideWindow = await policyRepo.findActivePolicyForFarm('farm-uuid-1', new Date('2027-01-01T00:00:00.000Z'));
  assert(outsideWindow === null, '3.9 findActivePolicyForFarm returns null when reference date is outside coverage window');

  // 3.5 updatePolicyBalanceAndStatus
  const updated1 = await policyRepo.updatePolicyBalanceAndStatus(createdPolicy.id, {
    payoutIncrement: new Prisma.Decimal('50000.00'),
  });
  assert(updated1.cumulativePaidAmount.equals(new Prisma.Decimal('50000.00')), '3.10 Increments cumulative paid amount by 50,000.00');
  assert(updated1.status === PolicyStatus.ACTIVE, '3.11 Retains ACTIVE status when remaining coverage exists');

  // Second payout exhausting policy exactly
  const updated2 = await policyRepo.updatePolicyBalanceAndStatus(createdPolicy.id, {
    payoutIncrement: '50000.00',
  });
  assert(updated2.cumulativePaidAmount.equals(new Prisma.Decimal('100000.00')), '3.12 Reaches full sum insured (100,000.00)');
  assert(updated2.status === PolicyStatus.EXHAUSTED, '3.13 Automatically transitions status to EXHAUSTED upon reaching sum insured');

  // Attempting payout exceeding sum insured throws badRequest
  let caughtOverCap = false;
  try {
    await policyRepo.updatePolicyBalanceAndStatus(createdPolicy.id, {
      payoutIncrement: '100.00',
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes('exceeds remaining coverage')) {
      caughtOverCap = true;
    }
  }
  assert(caughtOverCap, '3.14 Strictly rejects payout increment exceeding sum insured with HTTP 400 Bad Request');

  // Attempting update on missing policy throws 404
  let caught404 = false;
  try {
    await policyRepo.updatePolicyBalanceAndStatus('99999999-9999-4999-8999-999999999999', {
      payoutIncrement: '100.00',
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      caught404 = true;
    }
  }
  assert(caught404, '3.15 Throws HTTP 404 Not Found when updating balance for non-existent policy');

  // ---------------------------------------------------------------------------
  // SUITE 4: CLAIM REPOSITORY
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Claim Repository ---');

  const claimRepo = new ClaimRepository(mockDb as any);

  // 4.1 createClaim
  const createdClaim = await claimRepo.createClaim({
    claimNumber: 'CLM-2026-TEST-001',
    policyId: createdPolicy.id,
    assessmentId: 'assess-uuid-1',
    riskEventId: 'event-uuid-1',
    triggerRuleCode: 'HEAVY_RAINFALL_24H',
    severity: RiskSeverity.HIGH,
    observedValue: new Prisma.Decimal('78.40'),
    thresholdValue: new Prisma.Decimal('64.50'),
    payoutAmount: new Prisma.Decimal('50000.00'),
    status: ClaimStatus.PENDING,
  });

  assert(createdClaim.claimNumber === 'CLM-2026-TEST-001', '4.1 Claim created with assigned claim number');
  assert(createdClaim.status === ClaimStatus.PENDING, '4.2 Newly created claim has PENDING status');
  assert(createdClaim.payoutAmount.equals(new Prisma.Decimal('50000.00')), '4.3 Payout amount matches Decimal precision');

  // 4.2 Database duplicate protection (policyId + riskEventId)
  let caughtDuplicate = false;
  try {
    await claimRepo.createClaim({
      claimNumber: 'CLM-2026-TEST-002',
      policyId: createdPolicy.id,
      assessmentId: 'assess-uuid-1',
      riskEventId: 'event-uuid-1', // DUPLICATE riskEventId for this policy!
      triggerRuleCode: 'HEAVY_RAINFALL_24H',
      severity: RiskSeverity.HIGH,
      observedValue: new Prisma.Decimal('78.40'),
      thresholdValue: new Prisma.Decimal('64.50'),
      payoutAmount: new Prisma.Decimal('50000.00'),
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 409 && err.message.includes('already exists')) {
      caughtDuplicate = true;
    }
  }
  assert(caughtDuplicate, '4.4 Re-inserting identical (policyId, riskEventId) triggers AppError.conflict (HTTP 409)');

  // 4.3 findById
  const foundClaim = await claimRepo.findById(createdClaim.id);
  assert(foundClaim !== null && foundClaim.id === createdClaim.id, '4.5 findById retrieves existing claim');

  // 4.4 findByPolicyId
  const policyClaims = await claimRepo.findByPolicyId(createdPolicy.id);
  assert(policyClaims.length === 1 && policyClaims[0].id === createdClaim.id, '4.6 findByPolicyId retrieves claims for policy');

  // 4.5 findByFarmId
  const farmClaims = await claimRepo.findByFarmId('farm-uuid-1');
  assert(farmClaims.length === 1 && farmClaims[0].id === createdClaim.id, '4.7 findByFarmId retrieves claims across farm policies');

  // 4.6 findClaimByPolicyAndRiskEvent
  const existingDupLookup = await claimRepo.findClaimByPolicyAndRiskEvent(createdPolicy.id, 'event-uuid-1');
  assert(existingDupLookup !== null && existingDupLookup.id === createdClaim.id, '4.8 findClaimByPolicyAndRiskEvent retrieves existing claim for idempotency lookup');

  const nonExistentLookup = await claimRepo.findClaimByPolicyAndRiskEvent(createdPolicy.id, 'event-uuid-999');
  assert(nonExistentLookup === null, '4.9 findClaimByPolicyAndRiskEvent returns null when no claim exists for event');

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

runStage92Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
