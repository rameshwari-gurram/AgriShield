/**
 * AgriShield Parametric - Live End-to-End Demonstration Script
 * Module 9 Stage 9.6: Parametric Underwriting, Policy & Automated Claims Domain
 *
 * Demonstrates the full lifecycle against live PostgreSQL:
 * 1. Farmer Registration & Farm Parcel Onboarding (Indapur, Pune, Maharashtra)
 * 2. Farm Polygon Boundary Mapping & PostGIS Centroid Calculation
 * 3. Parametric Insurance Policy Creation (PENDING status)
 * 4. Policy Issuance & Activation (ACTIVE status)
 * 5. Deterministic Weather Telemetry Ingestion (130 mm 24h total, 110 mm 3h cloudburst)
 * 6. Authoritative Module 6 Parametric Assessment (Rule Engine Triggering)
 * 7. Parametric Claim 1 Evaluation, Approval & Simulated Settlement (₹80,000.00)
 * 8. Parametric Claim 2 Evaluation with Dynamic Remaining-Coverage Capping (₹20,000.00)
 * 9. Claim 2 Approval & Simulated Settlement
 * 10. Automatic Policy EXHAUSTED Transition & Conservation Verification
 *
 * NOTE: Records are preserved in PostgreSQL so the frontend (FarmDetailPage.tsx)
 * can display the active farm, policy card, claim history, and audit modal.
 * Run with `--cleanup-only` to remove previously created demo records on demand.
 */

import http from 'http';
import jwt from 'jsonwebtoken';
import { Prisma, PolicyStatus, ClaimStatus } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { env } from '../src/config/env.config.js';
import { farmerRepository } from '../src/repositories/farmer.repository.js';
import { farmRepository } from '../src/repositories/farm.repository.js';
import { farmBoundaryService } from '../src/services/farmBoundary.service.js';
import { GeoJSONPolygon } from '../src/types/farmBoundary.types.js';

const DEMO_FARMER_REF = 'AGRI-FMR-DEMO-STAGE96';
const DEMO_MOBILE = '9876543210';
const DEMO_FARM_REF = 'FRM-DEMO-INDAPUR-01';

// Scoped leaf-to-root cleanup for the dedicated demo farmer
async function cleanupDemoRecords(): Promise<void> {
  const existingFarmer = await prisma.farmer.findFirst({
    where: { farmerReferenceNumber: DEMO_FARMER_REF },
  });

  if (!existingFarmer) return;

  const farmerId = existingFarmer.id;
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

function createAuthToken(farmerId: string): string {
  return jwt.sign({ id: farmerId, email: `demo-farmer@agrishield.internal` }, env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

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

async function runDemonstration() {
  const isCleanupOnly = process.argv.includes('--cleanup-only');

  console.log(`\n================================================================================`);
  console.log(`🛡️   AGRISHIELD PARAMETRIC: STAGE 9.6 LIVE DEMONSTRATION RUNNER`);
  console.log(`================================================================================\n`);

  console.log('🔄 Checking for prior demonstration records...');
  await cleanupDemoRecords();
  console.log('✅ Scoped database cleanup complete (prior demo records cleared, production data intact).\n');

  if (isCleanupOnly) {
    console.log('🧹 Cleanup-only mode requested. Exiting.');
    await prisma.$disconnect();
    return;
  }

  // Start real Express HTTP Server on ephemeral port
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Farmer & Farm Registration
    // -------------------------------------------------------------------------
    console.log('--------------------------------------------------------------------------------');
    console.log('STEP 1: Farmer & Farm Registration');
    console.log('--------------------------------------------------------------------------------');
    const farmer = await farmerRepository.create({
      fullName: 'Anand Shinde',
      mobileNumber: DEMO_MOBILE,
      preferredLanguage: 'mr',
      farmerReferenceNumber: DEMO_FARMER_REF,
    });
    console.log(`👨‍🌾 Farmer Registered: ${farmer.fullName} (${farmer.mobileNumber})`);
    console.log(`   ID: ${farmer.id}`);
    console.log(`   Ref: ${farmer.farmerReferenceNumber}`);

    const farm = await farmRepository.create({
      farmerId: farmer.id,
      farmName: 'Indapur Sugarcane Parcel',
      cropName: 'Sugarcane',
      farmArea: 5.0,
      areaUnit: 'ACRE',
      sowingDate: new Date('2026-06-01T00:00:00.000Z'),
      expectedHarvestDate: new Date('2027-04-30T00:00:00.000Z'),
      farmReferenceNumber: DEMO_FARM_REF,
      village: 'Indapur',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413106',
    });
    console.log(`🌱 Farm Parcel Registered: ${farm.farmName} (5.0 Acres, Sugarcane)`);
    console.log(`   ID: ${farm.id}\n`);

    const token = createAuthToken(farmer.id);

    // -------------------------------------------------------------------------
    // STEP 2: Polygon Boundary & PostGIS Centroid Derivation
    // -------------------------------------------------------------------------
    console.log('--------------------------------------------------------------------------------');
    console.log('STEP 2: Polygon Boundary Mapping & PostGIS Centroid Derivation');
    console.log('--------------------------------------------------------------------------------');
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

    const boundary = await farmBoundaryService.createBoundary(farm.id, {
      boundary: indapurPolygon,
    });
    console.log(`🗺️  Boundary Stored in PostGIS (SRID 4326):`);
    console.log(`   Centroid Coordinates: [Lon: ${boundary.centroidLongitude}, Lat: ${boundary.centroidLatitude}]`);
    console.log(`   Calculated Area: ${boundary.calculatedAreaAcres} Acres (${boundary.calculatedAreaHectares} ha)\n`);

    // -------------------------------------------------------------------------
    // STEP 3: Policy Creation (PENDING)
    // -------------------------------------------------------------------------
    console.log('--------------------------------------------------------------------------------');
    console.log('STEP 3: Policy Creation (PENDING Status)');
    console.log('--------------------------------------------------------------------------------');
    const createPolicyRes = await makeRequest(baseUrl, 'POST', '/api/v1/policies', token, {
      farmId: farm.id,
      farmerId: farmer.id,
      cropName: 'Sugarcane',
      sumInsured: 100000,
      premiumAmount: 5000,
      coveredHazards: ['HEAVY_RAINFALL', 'INTENSE_RAINFALL'],
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-11-30T23:59:59.999Z',
    });

    const policy = createPolicyRes.body.data;
    console.log(`📋 Policy Created: ${policy.policyNumber}`);
    console.log(`   Status: ${policy.status}`);
    console.log(`   Sum Insured: ₹${policy.sumInsured}`);
    console.log(`   Premium Amount: ₹${policy.premiumAmount}`);
    console.log(`   Cumulative Paid: ₹${policy.cumulativePaidAmount}\n`);

    // -------------------------------------------------------------------------
    // STEP 4: Policy Issuance & Activation (ACTIVE)
    // -------------------------------------------------------------------------
    console.log('--------------------------------------------------------------------------------');
    console.log('STEP 4: Policy Issuance & Activation (POST /api/v1/policies/:id/issue)');
    console.log('--------------------------------------------------------------------------------');
    const issueRes = await makeRequest(baseUrl, 'POST', `/api/v1/policies/${policy.id}/issue`, token);
    const activePolicy = issueRes.body.data;
    console.log(`⚡ Policy Issued & Activated: ${activePolicy.policyNumber}`);
    console.log(`   Status: ${activePolicy.status} (Coverage window: 2026-06-01 to 2026-11-30)\n`);

    // -------------------------------------------------------------------------
    // STEP 5: Weather Telemetry Ingestion (130 mm 24h, 110 mm 3h Cloudburst)
    // -------------------------------------------------------------------------
    console.log('--------------------------------------------------------------------------------');
    console.log('STEP 5: Deterministic Weather Telemetry Ingestion');
    console.log('--------------------------------------------------------------------------------');
    const targetEndUtc = new Date('2026-08-15T12:00:00.000Z');
    const targetEndMs = targetEndUtc.getTime();
    const weatherRecordsData: any[] = [];

    for (let i = 23; i >= 0; i--) {
      const obsTime = new Date(targetEndMs - i * 3600 * 1000);
      let rain = 0.5;
      if (i === 3) rain = 10.0;
      if (i === 2) rain = 35.0;
      if (i === 1) rain = 40.0;
      if (i === 0) rain = 35.0;

      weatherRecordsData.push({
        farmId: farm.id,
        observedAt: obsTime,
        latitude: boundary.centroidLatitude,
        longitude: boundary.centroidLongitude,
        temperatureC: 27.8,
        humidityPercent: 92.0,
        rainfallMm: rain,
        windSpeedKmh: 18.0,
        windGustKmh: 32.0,
        weatherCode: 65,
        source: 'Open-Meteo',
      });
    }

    await prisma.weatherRecord.createMany({ data: weatherRecordsData });
    console.log(`🌧️  Ingested 24 Consecutive Hourly Observations ending at 2026-08-15 12:00 UTC`);
    console.log(`   24-Hour Total Rainfall: 130.0 mm (IMD threshold: >= 115.6 mm for Very Heavy Rain)`);
    console.log(`   3-Hour Cloudburst Total: 110.0 mm (IMD threshold: > 100.0 mm for Exceptionally Heavy Rain)\n`);

    // -------------------------------------------------------------------------
    // STEP 6: Authoritative Module 6 Parametric Assessment
    // -------------------------------------------------------------------------
    console.log('--------------------------------------------------------------------------------');
    console.log('STEP 6: Authoritative Module 6 ClimateRiskRuleEngine Evaluation');
    console.log('--------------------------------------------------------------------------------');
    const assessRes = await makeRequest(
      baseUrl,
      'POST',
      `/api/v1/farms/${farm.id}/risk-assessments`,
      token
    );
    const assessment = assessRes.body.data;

    const fullAssessment = await prisma.riskAssessment.findUnique({
      where: { id: assessment.id },
      include: { riskEvents: { include: { riskRule: true } } },
    });

    const triggeredEvents = (fullAssessment?.riskEvents || []).filter((e) => e.triggered);
    console.log(`📊 Assessment Executed: ID ${assessment.id}`);
    console.log(`   Triggered Parametric Events (${triggeredEvents.length}):`);
    triggeredEvents.forEach((ev, idx) => {
      console.log(`   [Event ${idx + 1}] ${ev.riskRule.code} (Severity: ${ev.severity})`);
      console.log(`             Observed: ${ev.observedValue} mm | Threshold: ${ev.thresholdValue} mm`);
    });
    console.log('');

    const event1 = triggeredEvents.find((e) => e.riskRule.code === 'VERY_HEAVY_RAINFALL_24H')!;
    const event2 = triggeredEvents.find((e) => e.riskRule.code === 'EXCEPTIONALLY_HEAVY_RAINFALL_3H')!;

    // -------------------------------------------------------------------------
    // STEP 7: Parametric Claim 1 Evaluation, Approval & Settlement
    // -------------------------------------------------------------------------
    console.log('--------------------------------------------------------------------------------');
    console.log('STEP 7: Claim 1 Evaluation, Approval & Simulated Settlement');
    console.log('--------------------------------------------------------------------------------');
    const claim1EvalRes = await makeRequest(baseUrl, 'POST', '/api/v1/claims/evaluate', token, {
      policyId: policy.id,
      assessmentId: assessment.id,
      riskEventId: event1.id,
      payoutConfig: { severityMultipliers: { VERY_HIGH: 0.8 } },
    });
    const claim1 = claim1EvalRes.body.data;
    console.log(`📝 Claim 1 Evaluated: ${claim1.claimNumber}`);
    console.log(`   Rule: ${claim1.triggerRuleCode} | Severity: ${claim1.severity}`);
    console.log(`   Calculated Payout: ₹${claim1.payoutAmount} (80% of Sum Insured ₹100,000)`);
    console.log(`   Status: ${claim1.status}`);

    // Approve Claim 1
    await makeRequest(baseUrl, 'POST', `/api/v1/claims/${claim1.id}/approve`, token);
    console.log(`👍 Claim 1 Approved (Status: APPROVED)`);

    // Settle Claim 1
    const settle1Res = await makeRequest(baseUrl, 'POST', `/api/v1/claims/${claim1.id}/settle`, token, {
      simulatedTransactionId: 'SIM-PAYOUT-DEMO-001',
    });
    const settledClaim1 = settle1Res.body.data;
    console.log(`💸 Claim 1 Settled via Simulated Interactive Transaction:`);
    console.log(`   Status: ${settledClaim1.status}`);
    console.log(`   Simulated Reference: ${settledClaim1.payoutReference}`);
    console.log(`   Paid At: ${settledClaim1.paidAt}\n`);

    // Check intermediate policy balance
    const intermediatePolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
    console.log(`💰 Intermediate Policy Accounting:`);
    console.log(`   Cumulative Paid Amount: ₹${intermediatePolicy?.cumulativePaidAmount.toFixed(2)} / ₹${intermediatePolicy?.sumInsured.toFixed(2)}`);
    console.log(`   Remaining Coverage: ₹${(intermediatePolicy!.sumInsured.toNumber() - intermediatePolicy!.cumulativePaidAmount.toNumber()).toFixed(2)}`);
    console.log(`   Policy Status: ${intermediatePolicy?.status}\n`);

    // -------------------------------------------------------------------------
    // STEP 8: Parametric Claim 2 Evaluation with Dynamic Remaining Capping
    // -------------------------------------------------------------------------
    console.log('--------------------------------------------------------------------------------');
    console.log('STEP 8: Claim 2 Evaluation with Dynamic Remaining-Coverage Capping');
    console.log('--------------------------------------------------------------------------------');
    const claim2EvalRes = await makeRequest(baseUrl, 'POST', '/api/v1/claims/evaluate', token, {
      policyId: policy.id,
      assessmentId: assessment.id,
      riskEventId: event2.id,
      payoutConfig: { severityMultipliers: { VERY_HIGH: 0.5 } },
    });
    const claim2 = claim2EvalRes.body.data;
    console.log(`📝 Claim 2 Evaluated: ${claim2.claimNumber}`);
    console.log(`   Rule: ${claim2.triggerRuleCode} | Severity: ${claim2.severity}`);
    console.log(`   Base Multiplier Payout: ₹50,000.00 (50% of ₹100,000)`);
    console.log(`   Actual Evaluated Payout: ₹${claim2.payoutAmount} (Capped to remaining coverage: ₹20,000.00)`);
    console.log(`   Status: ${claim2.status}`);

    // Approve Claim 2
    await makeRequest(baseUrl, 'POST', `/api/v1/claims/${claim2.id}/approve`, token);
    console.log(`👍 Claim 2 Approved (Status: APPROVED)`);

    // Settle Claim 2
    const settle2Res = await makeRequest(baseUrl, 'POST', `/api/v1/claims/${claim2.id}/settle`, token, {
      simulatedTransactionId: 'SIM-PAYOUT-DEMO-002',
    });
    const settledClaim2 = settle2Res.body.data;
    console.log(`💸 Claim 2 Settled via Simulated Interactive Transaction:`);
    console.log(`   Status: ${settledClaim2.status}`);
    console.log(`   Simulated Reference: ${settledClaim2.payoutReference}\n`);

    // -------------------------------------------------------------------------
    // STEP 9: Automatic Policy EXHAUSTED Transition & Accounting
    // -------------------------------------------------------------------------
    console.log('--------------------------------------------------------------------------------');
    console.log('STEP 9: Policy Exhaustion & Financial Invariant Conservation');
    console.log('--------------------------------------------------------------------------------');
    const finalPolicy = await prisma.policy.findUnique({ where: { id: policy.id } });
    console.log(`🏁 Final Policy Status: ${finalPolicy?.status}`);
    console.log(`   Sum Insured: ₹${finalPolicy?.sumInsured.toFixed(2)}`);
    console.log(`   Total Cumulative Paid: ₹${finalPolicy?.cumulativePaidAmount.toFixed(2)}`);
    console.log(`   Remaining Coverage: ₹0.00 (100% of sum insured paid out)`);

    // Attempting further claims
    const postExhaustionRes = await makeRequest(
      baseUrl,
      'POST',
      '/api/v1/claims/evaluate',
      token,
      {
        policyId: policy.id,
        assessmentId: assessment.id,
        riskEventId: event2.id,
        payoutConfig: { severityMultipliers: { VERY_HIGH: 0.5 } },
      }
    );
    console.log(`🛡️  Post-Exhaustion Guard: Evaluated Attempt Rejected: HTTP ${postExhaustionRes.status} (${postExhaustionRes.body.message})\n`);

    // -------------------------------------------------------------------------
    // DEMONSTRATION SUMMARY & FRONTEND INTEGRATION GUIDE
    // -------------------------------------------------------------------------
    console.log('================================================================================');
    console.log('✨ DEMONSTRATION COMPLETE — LIVE FRONTEND VERIFICATION GUIDE');
    console.log('================================================================================');
    console.log(`The demo records have been preserved in PostgreSQL.`);
    console.log(`You can now inspect them live in the AgriShield frontend:`);
    console.log(`  1. Start backend:  npm run dev (in backend/)`);
    console.log(`  2. Start frontend: npm run dev (in frontend/)`);
    console.log(`  3. Navigate to:    http://localhost:5173/farms/${farm.id}`);
    console.log(`  4. Click on tab:   'Policies & Claims'`);
    console.log(`  5. You will see:`);
    console.log(`     • Policy Card with status 'EXHAUSTED', 100% coverage progress bar.`);
    console.log(`     • Claim History Table with Claim 1 (₹80,000) and Claim 2 (₹20,000) marked 'PAID'.`);
    console.log(`     • Click 'View Audit Trace' to view the full parametric meteorological evidence!`);
    console.log('================================================================================\n');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await prisma.$disconnect();
  }
}

runDemonstration().catch((err) => {
  console.error('❌ Demonstration encountered an unexpected error:', err);
  process.exit(1);
});
