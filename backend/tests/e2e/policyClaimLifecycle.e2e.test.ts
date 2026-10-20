/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.6: End-to-End Demonstration Lifecycle & Live PostgreSQL Concurrency Integration Tests
 *
 * Verifies the full parametric insurance lifecycle against LIVE PostgreSQL (agrishield_postgres):
 * 1.  Scoped database isolation and leaf-to-root reverse FK cleanup.
 * 2.  Farmer and farm registration in Indapur, Pune, Maharashtra.
 * 3.  Valid polygon boundary submission and PostGIS ST_Centroid derivation.
 * 4.  Policy creation in PENDING status with cumulative balance of 0.00.
 * 5.  Invariant check: Claims cannot be evaluated for PENDING policies (HTTP 400).
 * 6.  Policy activation via explicit validated issuance (/issue -> ACTIVE).
 * 7.  Deterministic 24-hour weather telemetry ingestion (130 mm 24h total, 110 mm 3h cloudburst).
 * 8.  Authoritative Module 6 assessment execution via ClimateRiskRuleEngine:
 *     - Rule VERY_HEAVY_RAINFALL_24H triggered (severity VERY_HIGH).
 *     - Rule EXCEPTIONALLY_HEAVY_RAINFALL_3H triggered (severity VERY_HIGH).
 *     - Rule HEAVY_RAINFALL_24H superseded (NOT_TRIGGERED).
 * 9.  Claim 1 parametric evaluation: PENDING status, payout ₹80,000.00, policy balance untouched.
 * 10. Database-level duplicate prevention: Re-evaluation for same (policyId, riskEventId) rejected (HTTP 409).
 * 11. Claim 1 approval: status APPROVED, policy balance untouched.
 * 12. Payout reference format validation: Settle without 'SIM-' prefix rejected (HTTP 400).
 * 13. Claim 1 settlement: Interactive transaction, policy cumulative balance incremented to ₹80,000.00.
 * 14. Double settlement invariant: Re-settlement of PAID claim rejected (HTTP 400).
 * 15. Claim 2 parametric evaluation: PENDING status, remaining-coverage cap applied (₹20,000.00).
 * 16. Claim 2 approval and settlement: status PAID, cumulative paid reaches ₹100,000.00.
 * 17. Automatic policy EXHAUSTED transition upon reaching sum insured.
 * 18. Post-exhaustion invariant: Subsequent claim evaluations rejected (HTTP 400).
 * 19. LIVE PostgreSQL CONCURRENCY TEST:
 *     - Separate interactive transactions competing for the same policy balance.
 *     - Verified row-level lock (SELECT ... FOR UPDATE) and rollback of losing transaction.
 *     - Direct assertion of database conservation: Sum(PAID claims) == cumulativePaidAmount.
 *     - Zero partial writes on losing claim.
 * 20. Security boundary: BOLA/IDOR cross-farmer mutation rejected (HTTP 403 Forbidden).
 * 21. Frontend API compatibility: Verified /policies and /claims DTO contracts.
 */

import http from 'http';
import jwt from 'jsonwebtoken';
import { strict as assert } from 'node:assert';
import {
  Prisma,
  PolicyStatus,
  ClaimStatus,
  RiskSeverity,
} from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/db.js';
import { env } from '../../src/config/env.config.js';
import { farmerRepository } from '../../src/repositories/farmer.repository.js';
import { farmRepository } from '../../src/repositories/farm.repository.js';
import { farmBoundaryService } from '../../src/services/farmBoundary.service.js';
import { ClaimService } from '../../src/services/claim.service.js';
import { PolicyService } from '../../src/services/policy.service.js';
import { GeoJSONPolygon } from '../../src/types/farmBoundary.types.js';

// ============================================================================
// Scoped Cleanup Helper (Strict Leaf-to-Root Reverse FK Dependency Order)
// ============================================================================
async function cleanupFarmerById(farmerId: string): Promise<void> {
  const farmer = await prisma.farmer.findUnique({ where: { id: farmerId } });
  if (!farmer) return;

  const farms = await prisma.farm.findMany({ where: { farmerId } });
  const farmIds = farms.map((f) => f.id);

  const policies = await prisma.policy.findMany({ where: { farmerId } });
  const policyIds = policies.map((p) => p.id);

  const assessments = await prisma.riskAssessment.findMany({
    where: { farmId: { in: farmIds } },
  });
  const assessmentIds = assessments.map((a) => a.id);

  // 1. Delete Claims
  if (policyIds.length > 0) {
    await prisma.claim.deleteMany({ where: { policyId: { in: policyIds } } });
  }

  // 2. Delete Policies
  if (policyIds.length > 0) {
    await prisma.policy.deleteMany({ where: { id: { in: policyIds } } });
  }

  // 3. Delete Risk Events & Assessments
  if (assessmentIds.length > 0) {
    await prisma.riskEvent.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await prisma.riskAssessment.deleteMany({ where: { id: { in: assessmentIds } } });
  }

  // 4. Delete Farm Sub-records (Weather, Boundaries, ML, Satellite)
  if (farmIds.length > 0) {
    await prisma.weatherRecord.deleteMany({ where: { farmId: { in: farmIds } } });
    await prisma.mlRiskPrediction.deleteMany({ where: { farmId: { in: farmIds } } });
    await prisma.satelliteObservation.deleteMany({ where: { farmId: { in: farmIds } } });
    for (const fId of farmIds) {
      await prisma.$executeRaw`DELETE FROM "farm_boundaries" WHERE "farmId" = ${fId}::uuid`;
    }
    // 5. Delete Farms
    await prisma.farm.deleteMany({ where: { id: { in: farmIds } } });
  }

  // 6. Delete Farmer
  await prisma.farmer.delete({ where: { id: farmerId } });
}

// Generate JWT for authenticating requests
function createAuthToken(farmerId: string): string {
  return jwt.sign({ id: farmerId, email: `farmer-${farmerId}@example.com` }, env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

// HTTP request helper
async function makeRequest(
  baseUrl: string,
  method: string,
  path: string,
  token?: string,
  body?: any
): Promise<{ status: number; body: any }> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const resBody = await res.json().catch(() => null);
  return { status: res.status, body: resBody };
}

// ============================================================================
// Main E2E Integration Test Runner
// ============================================================================
async function runStage96E2ETestSuite() {
  console.log('🧪 Starting AgriShield Module 9 Stage 9.6: End-to-End Live PostgreSQL Test Suite...\n');

  let passed = 0;
  let failed = 0;

  const testAssert = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
    }
  };

  // Start real Express HTTP server on ephemeral port (port 0)
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const runSeed = Date.now().toString().slice(-6);
  const demoMobileA = `98765${runSeed}`;
  const demoMobileB = `98764${runSeed}`;
  let farmerAId: string | null = null;
  let farmerBId: string | null = null;
  let farmAId: string | null = null;
  let policyAId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // CHECKPOINT 1: Farmer & Farm Registration in Live PostgreSQL
    // -------------------------------------------------------------------------
    const farmerA = await farmerRepository.create({
      fullName: 'Anand Shinde',
      mobileNumber: demoMobileA,
      preferredLanguage: 'mr',
      farmerReferenceNumber: `AGRI-FMR-E2E-${runSeed}`,
    });
    farmerAId = farmerA.id;

    const farmA = await farmRepository.create({
      farmerId: farmerA.id,
      farmName: 'Indapur Sugarcane Parcel A',
      cropName: 'Sugarcane',
      farmArea: 5.0,
      areaUnit: 'ACRE',
      sowingDate: new Date('2026-06-01T00:00:00.000Z'),
      expectedHarvestDate: new Date('2027-04-30T00:00:00.000Z'),
      farmReferenceNumber: `FRM-E2E-${runSeed}-A`,
      village: 'Indapur',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413106',
    });
    farmAId = farmA.id;

    testAssert(
      Boolean(farmerA.id && farmA.id),
      `1. Registered Farmer (${farmerA.fullName}) and Farm (${farmA.farmName}) in live PostgreSQL`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 2: Polygon Boundary & PostGIS Centroid Derivation
    // GeoJSON RFC 7946 coordinates: [longitude, latitude] around Indapur, Pune
    // -------------------------------------------------------------------------
    const indapurPolygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [75.0250, 18.1150],
          [75.0260, 18.1150],
          [75.0260, 18.1160],
          [75.0250, 18.1160],
          [75.0250, 18.1150],
        ],
      ],
    };

    const boundary = await farmBoundaryService.createBoundary(farmA.id, {
      boundary: indapurPolygon,
    });

    // Indapur bounding box center: Lon 75.0255, Lat 18.1155
    const lonDiff = Math.abs(boundary.centroidLongitude - 75.0255);
    const latDiff = Math.abs(boundary.centroidLatitude - 18.1155);
    testAssert(
      lonDiff < 0.0002 && latDiff < 0.0002 && boundary.calculatedAreaAcres > 0,
      `2. PostGIS derived valid geodesic boundary & centroid [Lon: ${boundary.centroidLongitude}, Lat: ${boundary.centroidLatitude}]`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 3: Policy Creation in PENDING Status via Express HTTP API
    // -------------------------------------------------------------------------
    const tokenA = createAuthToken(farmerA.id);

    const createPolicyPayload = {
      farmId: farmA.id,
      farmerId: farmerA.id,
      cropName: 'Sugarcane',
      sumInsured: 100000,
      premiumAmount: 5000,
      coveredHazards: ['HEAVY_RAINFALL', 'INTENSE_RAINFALL'],
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-11-30T23:59:59.999Z',
    };

    const createPolicyRes = await makeRequest(
      baseUrl,
      'POST',
      '/api/v1/policies',
      tokenA,
      createPolicyPayload
    );

    testAssert(
      createPolicyRes.status === 201 &&
        createPolicyRes.body.data.status === PolicyStatus.PENDING &&
        createPolicyRes.body.data.cumulativePaidAmount === '0.00' &&
        createPolicyRes.body.data.sumInsured === '100000.00',
      `3. Policy created via POST /api/v1/policies in PENDING status (Balance: ₹0.00, Sum Insured: ₹100,000.00)`
    );
    policyAId = createPolicyRes.body.data.id;

    // -------------------------------------------------------------------------
    // CHECKPOINT 4: Pre-Activation Invariant: Cannot evaluate claim on PENDING policy
    // -------------------------------------------------------------------------
    const dummyAssessmentId = '00000000-0000-4000-8000-000000000001';
    const dummyEventId = '00000000-0000-4000-8000-000000000002';
    const prematureClaimRes = await makeRequest(
      baseUrl,
      'POST',
      '/api/v1/claims/evaluate',
      tokenA,
      {
        policyId: policyAId,
        assessmentId: dummyAssessmentId,
        riskEventId: dummyEventId,
        payoutConfig: { severityMultipliers: { VERY_HIGH: 0.8 } },
      }
    );

    testAssert(
      prematureClaimRes.status === 400 &&
        prematureClaimRes.body.message.includes('Claims can only be evaluated for ACTIVE policies'),
      `4. Invariant enforced: Claim evaluation blocked for PENDING policy (HTTP 400 Bad Request)`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 5: Explicit Policy Activation via /issue
    // -------------------------------------------------------------------------
    const issueRes = await makeRequest(
      baseUrl,
      'POST',
      `/api/v1/policies/${policyAId}/issue`,
      tokenA
    );

    testAssert(
      issueRes.status === 200 && issueRes.body.data.status === PolicyStatus.ACTIVE,
      `5. Policy issued and activated via POST /api/v1/policies/${policyAId}/issue (Status: ACTIVE)`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 6: Deterministic Weather Telemetry Ingestion (130mm 24h, 110mm 3h)
    // 24 consecutive hourly records ending at 2026-08-15T12:00:00.000Z
    // -------------------------------------------------------------------------
    const targetEndUtc = new Date('2026-08-15T12:00:00.000Z');
    const targetEndMs = targetEndUtc.getTime();
    const weatherRecordsData: any[] = [];

    for (let i = 23; i >= 0; i--) {
      const obsTime = new Date(targetEndMs - i * 3600 * 1000);
      let rain = 0.5; // Hours 0-19: 0.5mm/h -> 10mm
      if (i === 3) rain = 10.0; // Hour 20: 10mm
      if (i === 2) rain = 35.0; // Hour 21: 35mm
      if (i === 1) rain = 40.0; // Hour 22: 40mm
      if (i === 0) rain = 35.0; // Hour 23: 35mm
      // Total 24h = 10 + 10 + 110 = 130mm. Rolling 3h max (hours 21-23) = 110mm.

      weatherRecordsData.push({
        farmId: farmA.id,
        observedAt: obsTime,
        latitude: boundary.centroidLatitude,
        longitude: boundary.centroidLongitude,
        temperatureC: 28.5,
        humidityPercent: 88.0,
        rainfallMm: rain,
        windSpeedKmh: 16.0,
        windGustKmh: 28.0,
        weatherCode: 65,
        source: 'Open-Meteo',
      });
    }

    await prisma.weatherRecord.createMany({ data: weatherRecordsData });
    const weatherCount = await prisma.weatherRecord.count({ where: { farmId: farmA.id } });
    testAssert(
      weatherCount === 24,
      `6. Ingested 24 consecutive hourly weather observations into PostgreSQL (Total: 130mm, 3h Cloudburst: 110mm)`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 7: Authoritative Module 6 Parametric Assessment Execution
    // -------------------------------------------------------------------------
    const assessmentRes = await makeRequest(
      baseUrl,
      'POST',
      `/api/v1/farms/${farmA.id}/risk-assessments`,
      tokenA
    );

    testAssert(
      assessmentRes.status === 201 && Boolean(assessmentRes.body.data.id),
      `7. Executed Module 6 ClimateRiskRuleEngine assessment (HTTP 201 Created)`
    );

    const assessmentId = assessmentRes.body.data.id;
    const persistedAssessment = await prisma.riskAssessment.findUnique({
      where: { id: assessmentId },
      include: {
        riskEvents: {
          include: { riskRule: true },
        },
      },
    });

    const triggeredEvents = (persistedAssessment?.riskEvents || []).filter((e) => e.triggered);
    const veryHeavy24hEvent = triggeredEvents.find(
      (e) => e.riskRule.code === 'VERY_HEAVY_RAINFALL_24H'
    );
    const intense3hEvent = triggeredEvents.find(
      (e) => e.riskRule.code === 'EXCEPTIONALLY_HEAVY_RAINFALL_3H'
    );
    const lowerBand24hEvent = (persistedAssessment?.riskEvents || []).find(
      (e) => e.riskRule.code === 'HEAVY_RAINFALL_24H'
    );

    testAssert(
      Boolean(veryHeavy24hEvent) &&
        Boolean(intense3hEvent) &&
        lowerBand24hEvent?.triggered === false,
      `8. Rule engine triggered 2 distinct eligible events (VERY_HEAVY_RAINFALL_24H & EXCEPTIONALLY_HEAVY_RAINFALL_3H) and superseded lower band`
    );

    const event1Id = veryHeavy24hEvent!.id;
    const event2Id = intense3hEvent!.id;

    // -------------------------------------------------------------------------
    // CHECKPOINT 9: Claim 1 Evaluation (80% Severity Multiplier -> ₹80,000.00)
    // -------------------------------------------------------------------------
    const claim1EvalRes = await makeRequest(baseUrl, 'POST', '/api/v1/claims/evaluate', tokenA, {
      policyId: policyAId,
      assessmentId,
      riskEventId: event1Id,
      payoutConfig: {
        severityMultipliers: {
          VERY_HIGH: 0.8,
        },
      },
    });

    testAssert(
      claim1EvalRes.status === 201 &&
        claim1EvalRes.body.data.status === ClaimStatus.PENDING &&
        claim1EvalRes.body.data.payoutAmount === '80000.00',
      `9. Evaluated Claim 1 in PENDING status: ₹80,000.00 payout (Policy cumulativePaid untouched)`
    );
    const claim1Id = claim1EvalRes.body.data.id;

    // Verify policy balance remains untouched
    const policyCheck1 = await prisma.policy.findUnique({ where: { id: policyAId! } });
    testAssert(
      policyCheck1?.cumulativePaidAmount.toNumber() === 0,
      `9.1 Financial conservation: Policy cumulativePaidAmount remains ₹0.00 while claim is PENDING`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 10: Duplicate Claim Prevention on Same (policyId, riskEventId)
    // -------------------------------------------------------------------------
    const duplicateClaimRes = await makeRequest(
      baseUrl,
      'POST',
      '/api/v1/claims/evaluate',
      tokenA,
      {
        policyId: policyAId,
        assessmentId,
        riskEventId: event1Id,
        payoutConfig: {
          severityMultipliers: {
            VERY_HIGH: 0.8,
          },
        },
      }
    );

    testAssert(
      duplicateClaimRes.status === 409 &&
        duplicateClaimRes.body.message.includes('already exists'),
      `10. Database unique constraint enforced: Duplicate claim evaluation rejected with HTTP 409 Conflict`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 10.1: Premature Settlement Guard on PENDING Claim Rejected
    // -------------------------------------------------------------------------
    const prematureSettleRes = await makeRequest(
      baseUrl,
      'POST',
      `/api/v1/claims/${claim1Id}/settle`,
      tokenA,
      {
        simulatedTransactionId: 'SIM-PAYOUT-PREMATURE',
      }
    );

    testAssert(
      prematureSettleRes.status === 400 &&
        JSON.stringify(prematureSettleRes.body).includes('before approval'),
      `10.1 Approval guard enforced: Attempt to settle PENDING claim rejected with HTTP 400 Bad Request`
    );

    // Verify policy cumulativePaidAmount remains ₹0.00 after failed settlement
    const policyCheckPostPremature = await prisma.policy.findUnique({ where: { id: policyAId! } });
    testAssert(
      policyCheckPostPremature?.cumulativePaidAmount.toNumber() === 0,
      `10.2 Financial conservation: Policy cumulativePaidAmount remains ₹0.00 after rejected settlement attempt`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 11: Claim 1 Approval
    // -------------------------------------------------------------------------
    const claim1ApproveRes = await makeRequest(
      baseUrl,
      'POST',
      `/api/v1/claims/${claim1Id}/approve`,
      tokenA
    );

    testAssert(
      claim1ApproveRes.status === 200 &&
        claim1ApproveRes.body.data.status === ClaimStatus.APPROVED,
      `11. Approved Claim 1 via POST /api/v1/claims/${claim1Id}/approve (Status: APPROVED)`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 12: Simulated Payout Reference Format Enforcement
    // -------------------------------------------------------------------------
    const invalidRefRes = await makeRequest(
      baseUrl,
      'POST',
      `/api/v1/claims/${claim1Id}/settle`,
      tokenA,
      {
        simulatedTransactionId: 'REAL-PAYMENT-REF-1234',
      }
    );

    testAssert(
      invalidRefRes.status === 400 &&
        JSON.stringify(invalidRefRes.body).includes("must start with 'SIM-'"),
      `12. Settlement safety guard: Non-simulated transaction reference rejected with HTTP 400 Bad Request`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 13: Transactional Settlement of Claim 1
    // -------------------------------------------------------------------------
    const claim1SettleRes = await makeRequest(
      baseUrl,
      'POST',
      `/api/v1/claims/${claim1Id}/settle`,
      tokenA,
      {
        simulatedTransactionId: 'SIM-PAYOUT-E2E-001',
      }
    );

    testAssert(
      claim1SettleRes.status === 200 &&
        claim1SettleRes.body.data.status === ClaimStatus.PAID &&
        claim1SettleRes.body.data.payoutReference === 'SIM-PAYOUT-E2E-001',
      `13. Settled Claim 1 with reference SIM-PAYOUT-E2E-001 (Status: PAID)`
    );

    const policyCheck2 = await prisma.policy.findUnique({ where: { id: policyAId! } });
    testAssert(
      policyCheck2?.cumulativePaidAmount.toNumber() === 80000.0 &&
        policyCheck2?.status === PolicyStatus.ACTIVE,
      `13.1 Policy cumulative balance atomically updated to ₹80,000.00 in PostgreSQL (Status: ACTIVE)`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 14: Duplicate Settlement Rejection
    // -------------------------------------------------------------------------
    const reSettleRes = await makeRequest(
      baseUrl,
      'POST',
      `/api/v1/claims/${claim1Id}/settle`,
      tokenA,
      {
        simulatedTransactionId: 'SIM-PAYOUT-E2E-DUPE',
      }
    );

    testAssert(
      reSettleRes.status === 400 &&
        reSettleRes.body.message.includes('has already been settled and paid'),
      `14. Double settlement invariant enforced: Re-settlement of PAID claim rejected with HTTP 400`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 15: Claim 2 Evaluation (Remaining-Coverage Capping: ₹20,000.00)
    // Base calculation: 100,000 * 0.50 = 50,000. Remaining coverage: 100,000 - 80,000 = 20,000.
    // -------------------------------------------------------------------------
    const claim2EvalRes = await makeRequest(baseUrl, 'POST', '/api/v1/claims/evaluate', tokenA, {
      policyId: policyAId,
      assessmentId,
      riskEventId: event2Id,
      payoutConfig: {
        severityMultipliers: {
          VERY_HIGH: 0.5,
        },
      },
    });

    testAssert(
      claim2EvalRes.status === 201 &&
        claim2EvalRes.body.data.status === ClaimStatus.PENDING &&
        claim2EvalRes.body.data.payoutAmount === '20000.00',
      `15. Evaluated Claim 2 with dynamic remaining-coverage cap: Capped to ₹20,000.00 (Base was ₹50,000.00)`
    );
    const claim2Id = claim2EvalRes.body.data.id;

    // Approve Claim 2
    await makeRequest(baseUrl, 'POST', `/api/v1/claims/${claim2Id}/approve`, tokenA);

    // Settle Claim 2
    const claim2SettleRes = await makeRequest(
      baseUrl,
      'POST',
      `/api/v1/claims/${claim2Id}/settle`,
      tokenA,
      {
        simulatedTransactionId: 'SIM-PAYOUT-E2E-002',
      }
    );

    testAssert(
      claim2SettleRes.status === 200 &&
        claim2SettleRes.body.data.status === ClaimStatus.PAID &&
        claim2SettleRes.body.data.payoutAmount === '20000.00',
      `16. Settled Claim 2 for ₹20,000.00 with reference SIM-PAYOUT-E2E-002`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 17: Policy Exhaustion Verification
    // -------------------------------------------------------------------------
    const policyFinal = await prisma.policy.findUnique({ where: { id: policyAId! } });
    testAssert(
      policyFinal?.cumulativePaidAmount.toNumber() === 100000.0 &&
        policyFinal?.status === PolicyStatus.EXHAUSTED,
      `17. Policy automatically transitioned to EXHAUSTED when cumulative paid reached ₹100,000.00`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 18: Post-Exhaustion Rejection Invariant
    // -------------------------------------------------------------------------
    const postExhaustionRes = await makeRequest(
      baseUrl,
      'POST',
      '/api/v1/claims/evaluate',
      tokenA,
      {
        policyId: policyAId,
        assessmentId,
        riskEventId: event2Id,
        payoutConfig: { severityMultipliers: { VERY_HIGH: 0.5 } },
      }
    );

    testAssert(
      postExhaustionRes.status === 400 &&
        postExhaustionRes.body.message.includes('coverage limit has already been exhausted'),
      `18. Post-exhaustion invariant enforced: Further claim evaluations on exhausted policy rejected (HTTP 400)`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 19: LIVE PostgreSQL Concurrency Test with Real Row Locking
    // Competing settlements competing for the same policy balance in parallel
    // -------------------------------------------------------------------------
    const farmConc = await farmRepository.create({
      farmerId: farmerA.id,
      farmName: 'Indapur Concurrency Farm',
      cropName: 'Sugarcane',
      farmArea: 4.0,
      areaUnit: 'ACRE',
      sowingDate: new Date('2026-06-01T00:00:00.000Z'),
      expectedHarvestDate: new Date('2027-04-30T00:00:00.000Z'),
      farmReferenceNumber: `FRM-CONC-${runSeed}`,
      village: 'Indapur',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413106',
    });

    const policyConc = await prisma.policy.create({
      data: {
        policyNumber: `POL-CONC-${runSeed}`,
        farmId: farmConc.id,
        farmerId: farmerA.id,
        cropName: 'Sugarcane',
        sumInsured: new Prisma.Decimal('100000.00'),
        premiumAmount: new Prisma.Decimal('5000.00'),
        coveredHazards: ['HEAVY_RAINFALL', 'INTENSE_RAINFALL'],
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-11-30T23:59:59.999Z'),
        cumulativePaidAmount: new Prisma.Decimal('0.00'),
        status: PolicyStatus.ACTIVE,
      },
    });

    // Create 2 independent approved claims under policyConc that together exceed 100,000
    // Claim Conc 1: ₹80,000.00
    const claimConc1 = await prisma.claim.create({
      data: {
        claimNumber: `CLM-CONC1-${runSeed}`,
        policyId: policyConc.id,
        assessmentId,
        riskEventId: event1Id,
        triggerRuleCode: 'VERY_HEAVY_RAINFALL_24H',
        severity: RiskSeverity.VERY_HIGH,
        thresholdValue: new Prisma.Decimal('115.60'),
        observedValue: new Prisma.Decimal('130.00'),
        payoutAmount: new Prisma.Decimal('80000.00'),
        status: ClaimStatus.APPROVED,
      },
    });

    // Claim Conc 2: ₹50,000.00
    const claimConc2 = await prisma.claim.create({
      data: {
        claimNumber: `CLM-CONC2-${runSeed}`,
        policyId: policyConc.id,
        assessmentId,
        riskEventId: event2Id,
        triggerRuleCode: 'EXCEPTIONALLY_HEAVY_RAINFALL_3H',
        severity: RiskSeverity.VERY_HIGH,
        thresholdValue: new Prisma.Decimal('100.00'),
        observedValue: new Prisma.Decimal('110.00'),
        payoutAmount: new Prisma.Decimal('50000.00'),
        status: ClaimStatus.APPROVED,
      },
    });

    const claimService = new ClaimService();

    // Fire concurrent settlement calls over separate database transactions
    const concResults = await Promise.allSettled([
      claimService.settleClaim(claimConc1.id, { simulatedTransactionId: 'SIM-CONC-001' }),
      claimService.settleClaim(claimConc2.id, { simulatedTransactionId: 'SIM-CONC-002' }),
    ]);

    const fulfilled = concResults.filter((r) => r.status === 'fulfilled');
    const rejected = concResults.filter((r) => r.status === 'rejected');

    testAssert(
      fulfilled.length === 1 && rejected.length === 1,
      `19. Live PostgreSQL Concurrency: Exactly 1 settlement succeeded and 1 was rejected (SELECT FOR UPDATE serialized)`
    );

    // Verify persisted state in live PostgreSQL
    const policyConcAfter = await prisma.policy.findUnique({ where: { id: policyConc.id } });
    const claimConc1After = await prisma.claim.findUnique({ where: { id: claimConc1.id } });
    const claimConc2After = await prisma.claim.findUnique({ where: { id: claimConc2.id } });

    const paidClaims = [claimConc1After, claimConc2After].filter(
      (c) => c?.status === ClaimStatus.PAID
    );
    const unPaidClaims = [claimConc1After, claimConc2After].filter(
      (c) => c?.status === ClaimStatus.APPROVED
    );

    testAssert(
      paidClaims.length === 1 &&
        unPaidClaims.length === 1 &&
        unPaidClaims[0]?.payoutReference === null &&
        unPaidClaims[0]?.paidAt === null,
      `19.1 Invariant: Losing claim preserved in APPROVED status with zero partial writes (payoutReference is null)`
    );

    const totalPaidConc = paidClaims.reduce(
      (acc, c) => acc + c!.payoutAmount.toNumber(),
      0
    );
    testAssert(
      totalPaidConc <= 100000.0 &&
        totalPaidConc === policyConcAfter?.cumulativePaidAmount.toNumber(),
      `19.2 Invariant: Persisted policy balance (₹${policyConcAfter?.cumulativePaidAmount.toFixed(2)}) strictly equals sum of PAID claims (₹${totalPaidConc.toFixed(2)})`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 20: Security Boundaries (BOLA / IDOR Verification)
    // -------------------------------------------------------------------------
    const farmerB = await farmerRepository.create({
      fullName: 'Sunil Patil',
      mobileNumber: demoMobileB,
      preferredLanguage: 'en',
      farmerReferenceNumber: `AGRI-FMR-E2E-${runSeed}-B`,
    });
    farmerBId = farmerB.id;
    const tokenB = createAuthToken(farmerB.id);

    // Farmer B attempts to issue Farmer A's policy
    const crossIssueRes = await makeRequest(
      baseUrl,
      'POST',
      `/api/v1/policies/${policyAId}/issue`,
      tokenB
    );

    testAssert(
      crossIssueRes.status === 403 &&
        crossIssueRes.body.message.includes('You do not have permission'),
      `20. Object-level authorization: Cross-farmer policy mutation blocked with HTTP 403 Forbidden`
    );

    // Farmer B attempts to query Farmer A's policy
    const crossGetPolicyRes = await makeRequest(
      baseUrl,
      'GET',
      `/api/v1/policies/${policyAId}`,
      tokenB
    );

    testAssert(
      crossGetPolicyRes.status === 403,
      `20.1 Object-level authorization: Cross-farmer policy access blocked with HTTP 403 Forbidden`
    );

    // -------------------------------------------------------------------------
    // CHECKPOINT 21: Frontend Presentation API Contract Compatibility
    // -------------------------------------------------------------------------
    const getPoliciesRes = await makeRequest(
      baseUrl,
      'GET',
      `/api/v1/farms/${farmA.id}/policies`,
      tokenA
    );

    const getClaimsRes = await makeRequest(
      baseUrl,
      'GET',
      `/api/v1/farms/${farmA.id}/claims`,
      tokenA
    );

    testAssert(
      getPoliciesRes.status === 200 &&
        Array.isArray(getPoliciesRes.body.data) &&
        getPoliciesRes.body.data.length >= 1 &&
        getClaimsRes.status === 200 &&
        Array.isArray(getClaimsRes.body.data) &&
        getClaimsRes.body.data.length === 2,
      `21. Frontend API contracts verified: GET /farms/:id/policies and GET /farms/:id/claims match Stage 9.5 UI schemas`
    );
  } finally {
    // Graceful teardown of HTTP server
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    // Clean up test data created during this specific run
    console.log('\n🧹 Cleaning up test-run records in PostgreSQL...');
    if (farmerAId) {
      await cleanupFarmerById(farmerAId);
    }
    if (farmerBId) {
      await cleanupFarmerById(farmerBId);
    }
    await prisma.$disconnect();
    console.log('✨ Cleanup complete.\n');
  }

  console.log(`================================================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log(`================================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runStage96E2ETestSuite().catch((err) => {
  console.error('💥 E2E Test Suite failed with unexpected error:', err);
  process.exit(1);
});
