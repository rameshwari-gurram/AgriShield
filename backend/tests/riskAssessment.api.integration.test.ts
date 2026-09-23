/**
 * Module 6 Stage 5A: Climate Risk REST API Integration Test Suite
 * (Express HTTP Server + PostgreSQL + PostGIS)
 *
 * Verifies real HTTP request dispatch, Zod validation middleware, error middleware,
 * controller orchestration, service delegation, status codes, DTO contracts,
 * insufficient data semantics, rule traceability, and test data isolation.
 *
 * Tests all 18 required scenarios:
 * 1.  POST valid assessment → 201
 * 2.  POST nonexistent farm → 404
 * 3.  POST invalid farm UUID → 400
 * 4.  POST with complete weather data → hasInsufficientDataCoverage = false
 * 5.  POST with incomplete weather data → hasInsufficientDataCoverage = true, observedValue = null, status = INSUFFICIENT_DATA
 * 6.  130 mm rainfall scenario → VERY_HEAVY_RAINFALL_24H triggered, overallRisk = HIGH, lower band not triggered
 * 7.  250 mm rainfall scenario → EXTREME_RAINFALL_24H triggered, overallRisk = HIGH, lower bands not triggered
 * 8.  Complete weather data with zero rainfall → overallRisk = LOW, no rainfall rules triggered
 * 9.  GET latest assessment → 200
 * 10. GET latest when no assessment exists → 404
 * 11. GET assessment history → 200, newest first
 * 12. GET history with ?limit=1 → 200, exactly one result
 * 13. GET assessment by ID → 200, populated risk events
 * 14. GET nonexistent assessment → 404
 * 15. Insufficient-data response preserves INSUFFICIENT_DATA, explanation, hasInsufficientDataCoverage
 * 16. Response contains populated riskEvents array
 * 17. Response preserves sourceType, sourceReference, observationWindow
 * 18. Response preserves assessmentVersion = "1.0.0"
 */

import http from 'http';
import { prisma } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { farmerRepository } from '../src/repositories/farmer.repository.js';
import { farmRepository } from '../src/repositories/farm.repository.js';
import { riskRepository } from '../src/repositories/risk.repository.js';
import { RiskAssessmentResponseDTO, RiskEventResponseDTO } from '../src/types/risk.types.js';

async function runRiskAssessmentApiTests() {
  console.log('🧪 Running Module 6 Stage 5A: Climate Risk REST API Integration Tests (Express + Live PostgreSQL)...\n');

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

  // Start real Express HTTP Server on ephemeral port
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const testMobile = '9999900006';
  let testFarmerId: string;

  // Farm IDs for isolated test scenarios
  let farmValidId: string;
  let farmCompleteId: string;
  let farmIncompleteId: string;
  let farm130mmId: string;
  let farm250mmId: string;
  let farmZeroRainId: string;
  let farmLatestId: string;
  let farmNoAssessmentsId: string;
  let farmHistoryId: string;
  let farmByIdId: string;

  // Helper to insert consecutive hourly records into PostgreSQL
  const insertHourlyWeather = async (
    farmId: string,
    endUtc: Date,
    hoursCount: number,
    rainfallPattern: (hourIndex: number) => number
  ) => {
    const records = [];
    const endMs = endUtc.getTime();
    for (let i = hoursCount - 1; i >= 0; i--) {
      const obsTime = new Date(endMs - i * 3600 * 1000);
      const rain = rainfallPattern(i);
      records.push({
        farmId,
        observedAt: obsTime,
        latitude: 18.5204,
        longitude: 73.8567,
        temperatureC: 30.5,
        humidityPercent: 60.0,
        rainfallMm: rain,
        windSpeedKmh: 14.0,
        windGustKmh: 22.0,
        weatherCode: 61,
        source: 'Open-Meteo',
      });
    }
    return prisma.weatherRecord.createMany({ data: records });
  };

  // Helper for cleanup
  const cleanupTestData = async () => {
    const existingFarmers = await prisma.farmer.findMany({ where: { mobileNumber: testMobile } });
    for (const f of existingFarmers) {
      const farms = await prisma.farm.findMany({ where: { farmerId: f.id } });
      for (const farm of farms) {
        await prisma.riskEvent.deleteMany({ where: { assessment: { farmId: farm.id } } });
        await prisma.riskAssessment.deleteMany({ where: { farmId: farm.id } });
        await prisma.weatherRecord.deleteMany({ where: { farmId: farm.id } });
        await prisma.farmBoundary.deleteMany({ where: { farmId: farm.id } });
        await prisma.farm.delete({ where: { id: farm.id } });
      }
      await prisma.farmer.delete({ where: { id: f.id } });
    }
  };

  try {
    // ---------------------------------------------------------------------------
    // Initial Database Cleanup & Setup
    // ---------------------------------------------------------------------------
    await cleanupTestData();

    // Create Test Farmer
    const farmer = await farmerRepository.create({
      fullName: 'Anand Shinde',
      mobileNumber: testMobile,
      preferredLanguage: 'mr',
      farmerReferenceNumber: 'AGRI-FMR-20260923-0006',
    });
    testFarmerId = farmer.id;

    // Helper to register farms
    const createTestFarm = async (name: string, ref: string) => {
      const farm = await farmRepository.create({
        farmerId: testFarmerId,
        farmName: name,
        cropName: 'Sugarcane',
        farmArea: 4.5,
        areaUnit: 'ACRE',
        sowingDate: new Date('2026-03-01'),
        expectedHarvestDate: new Date('2027-02-01'),
        farmReferenceNumber: ref,
        village: 'Indapur',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '413106',
      });
      return farm.id;
    };

    farmValidId = await createTestFarm('Valid Assessment Farm', 'FRM-API-001');
    farmCompleteId = await createTestFarm('Complete Weather Farm', 'FRM-API-002');
    farmIncompleteId = await createTestFarm('Incomplete Weather Farm', 'FRM-API-003');
    farm130mmId = await createTestFarm('130mm Rain Farm', 'FRM-API-004');
    farm250mmId = await createTestFarm('250mm Rain Farm', 'FRM-API-005');
    farmZeroRainId = await createTestFarm('Zero Rain Farm', 'FRM-API-006');
    farmLatestId = await createTestFarm('Latest Assessment Farm', 'FRM-API-007');
    farmNoAssessmentsId = await createTestFarm('No Assessments Farm', 'FRM-API-008');
    farmHistoryId = await createTestFarm('History Assessment Farm', 'FRM-API-009');
    farmByIdId = await createTestFarm('Assessment By ID Farm', 'FRM-API-010');

    const baseObservationTime = new Date('2026-09-23T12:00:00Z');

    // ---------------------------------------------------------------------------
    // Scenario 1: POST valid assessment → HTTP 201 Created
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 1: POST valid assessment → 201 ---');
    await insertHourlyWeather(farmValidId, baseObservationTime, 24, () => 2.0);

    const postValidRes = await fetch(`${baseUrl}/api/v1/farms/${farmValidId}/risk-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const postValidBody = await postValidRes.json();

    assert(postValidRes.status === 201, `POST /farms/:farmId/risk-assessments returns HTTP 201 (got ${postValidRes.status})`);
    assert(postValidBody.success === true, 'Response body has success: true');
    assert(postValidBody.data?.id !== undefined, 'Response data contains assessment ID');
    assert(postValidBody.data?.farmId === farmValidId, 'Response assessment belongs to target farmId');

    // ---------------------------------------------------------------------------
    // Scenario 2: POST nonexistent farm → HTTP 404 Not Found
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 2: POST nonexistent farm → 404 ---');
    const nonexistentFarmId = '00000000-0000-4000-8000-000000000000';
    const postNonexistentRes = await fetch(`${baseUrl}/api/v1/farms/${nonexistentFarmId}/risk-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const postNonexistentBody = await postNonexistentRes.json();

    assert(postNonexistentRes.status === 404, `POST nonexistent farm returns HTTP 404 (got ${postNonexistentRes.status})`);
    assert(postNonexistentBody.success === false, 'Response has success: false');
    assert(postNonexistentBody.message.includes('not found'), `Message indicates farm not found: '${postNonexistentBody.message}'`);

    // ---------------------------------------------------------------------------
    // Scenario 3: POST invalid farm UUID → HTTP 400 Bad Request
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 3: POST invalid farm UUID → 400 ---');
    const postInvalidUuidRes = await fetch(`${baseUrl}/api/v1/farms/not-a-valid-uuid/risk-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const postInvalidUuidBody = await postInvalidUuidRes.json();

    assert(postInvalidUuidRes.status === 400, `POST invalid UUID returns HTTP 400 (got ${postInvalidUuidRes.status})`);
    assert(postInvalidUuidBody.success === false, 'Response has success: false');
    assert(postInvalidUuidBody.message.includes('Validation failed'), 'Response message indicates validation failure');

    // ---------------------------------------------------------------------------
    // Scenario 4: POST with complete weather data → hasInsufficientDataCoverage = false
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 4: Complete weather data → hasInsufficientDataCoverage = false ---');
    await insertHourlyWeather(farmCompleteId, baseObservationTime, 24, () => 1.5);

    const completeRes = await fetch(`${baseUrl}/api/v1/farms/${farmCompleteId}/risk-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const completeBody = await completeRes.json();
    const completeData: RiskAssessmentResponseDTO = completeBody.data;

    assert(completeRes.status === 201, 'Complete weather POST returns 201');
    assert(completeData.weatherRecordCount === 24, `Weather record count is 24 (got ${completeData.weatherRecordCount})`);
    assert(completeData.hasInsufficientDataCoverage === false, 'hasInsufficientDataCoverage is false');
    assert(!completeData.summary.includes('incomplete'), 'Summary does not flag incomplete window');

    // ---------------------------------------------------------------------------
    // Scenario 5: POST with incomplete weather data → hasInsufficientDataCoverage = true
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 5: Incomplete weather data → hasInsufficientDataCoverage = true ---');
    // Only 6 hours of weather records
    await insertHourlyWeather(farmIncompleteId, baseObservationTime, 6, () => 2.0);

    const incompleteRes = await fetch(`${baseUrl}/api/v1/farms/${farmIncompleteId}/risk-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const incompleteBody = await incompleteRes.json();
    const incompleteData: RiskAssessmentResponseDTO = incompleteBody.data;

    assert(incompleteRes.status === 201, 'Incomplete weather POST returns 201');
    assert(incompleteData.hasInsufficientDataCoverage === true, 'hasInsufficientDataCoverage is true');

    const rainfall24hEvents = incompleteData.events.filter((e) => e.ruleCode?.includes('24H'));
    assert(rainfall24hEvents.length > 0, 'Found 24H rainfall events');
    const allInsufficient = rainfall24hEvents.every(
      (e) => e.status === 'INSUFFICIENT_DATA' && e.observedValue === null && e.triggered === false
    );
    assert(allInsufficient, 'All 24H events have status = INSUFFICIENT_DATA, observedValue = null, and triggered = false');

    // ---------------------------------------------------------------------------
    // Scenario 6: 130 mm rainfall scenario → VERY_HEAVY_RAINFALL_24H triggered, overallRisk = HIGH
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 6: 130 mm rainfall scenario ---');
    // 24 records, total rainfall = 130.0 mm spread evenly (130 / 24 ≈ 5.416 mm/hr, 3h sum ≈ 16.25 mm < 20 mm)
    const rainPerHour130 = 130.0 / 24.0;
    await insertHourlyWeather(farm130mmId, baseObservationTime, 24, () => rainPerHour130);

    const rain130Res = await fetch(`${baseUrl}/api/v1/farms/${farm130mmId}/risk-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const rain130Body = await rain130Res.json();
    const rain130Data: RiskAssessmentResponseDTO = rain130Body.data;

    assert(rain130Res.status === 201, '130mm scenario returns 201');
    assert(rain130Data.overallRisk === 'HIGH', `overallRisk is HIGH (got ${rain130Data.overallRisk})`);

    const veryHeavyEvent = rain130Data.events.find((e) => e.ruleCode === 'VERY_HEAVY_RAINFALL_24H');
    assert(veryHeavyEvent !== undefined && veryHeavyEvent.triggered === true, 'VERY_HEAVY_RAINFALL_24H is triggered');
    assert(veryHeavyEvent?.status === 'TRIGGERED', 'VERY_HEAVY_RAINFALL_24H status is TRIGGERED');

    const heavyEvent = rain130Data.events.find((e) => e.ruleCode === 'HEAVY_RAINFALL_24H');
    assert(heavyEvent !== undefined && heavyEvent.triggered === false, 'Lower band HEAVY_RAINFALL_24H is NOT triggered');
    assert(heavyEvent?.status === 'NOT_TRIGGERED', 'HEAVY_RAINFALL_24H status is NOT_TRIGGERED');

    const extremeEvent = rain130Data.events.find((e) => e.ruleCode === 'EXTREME_RAINFALL_24H');
    assert(extremeEvent !== undefined && extremeEvent.triggered === false, 'Higher band EXTREME_RAINFALL_24H is NOT triggered');

    // ---------------------------------------------------------------------------
    // Scenario 7: 250 mm rainfall scenario → EXTREME_RAINFALL_24H triggered, overallRisk = HIGH
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 7: 250 mm rainfall scenario ---');
    // 24 records, total rainfall = 250.0 mm (250 / 24 ≈ 10.416 mm/hr, 3h sum ≈ 31.25 mm)
    const rainPerHour250 = 250.0 / 24.0;
    await insertHourlyWeather(farm250mmId, baseObservationTime, 24, () => rainPerHour250);

    const rain250Res = await fetch(`${baseUrl}/api/v1/farms/${farm250mmId}/risk-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const rain250Body = await rain250Res.json();
    const rain250Data: RiskAssessmentResponseDTO = rain250Body.data;

    assert(rain250Res.status === 201, '250mm scenario returns 201');
    assert(rain250Data.overallRisk === 'HIGH', `overallRisk is HIGH (got ${rain250Data.overallRisk})`);

    const extreme250Event = rain250Data.events.find((e) => e.ruleCode === 'EXTREME_RAINFALL_24H');
    assert(extreme250Event !== undefined && extreme250Event.triggered === true, 'EXTREME_RAINFALL_24H is triggered');
    assert(extreme250Event?.status === 'TRIGGERED', 'EXTREME_RAINFALL_24H status is TRIGGERED');

    const veryHeavy250Event = rain250Data.events.find((e) => e.ruleCode === 'VERY_HEAVY_RAINFALL_24H');
    assert(veryHeavy250Event !== undefined && veryHeavy250Event.triggered === false, 'Lower band VERY_HEAVY_RAINFALL_24H is NOT triggered');

    const heavy250Event = rain250Data.events.find((e) => e.ruleCode === 'HEAVY_RAINFALL_24H');
    assert(heavy250Event !== undefined && heavy250Event.triggered === false, 'Lower band HEAVY_RAINFALL_24H is NOT triggered');

    // ---------------------------------------------------------------------------
    // Scenario 8: Complete weather data with zero rainfall → overallRisk = LOW
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 8: Complete weather with zero rainfall ---');
    await insertHourlyWeather(farmZeroRainId, baseObservationTime, 24, () => 0.0);

    const zeroRainRes = await fetch(`${baseUrl}/api/v1/farms/${farmZeroRainId}/risk-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const zeroRainBody = await zeroRainRes.json();
    const zeroRainData: RiskAssessmentResponseDTO = zeroRainBody.data;

    assert(zeroRainRes.status === 201, 'Zero rain scenario returns 201');
    assert(zeroRainData.overallRisk === 'LOW', `overallRisk is LOW (got ${zeroRainData.overallRisk})`);
    assert(zeroRainData.triggeredRuleCount === 0, `triggeredRuleCount is 0 (got ${zeroRainData.triggeredRuleCount})`);
    const anyTriggered = zeroRainData.events.some((e) => e.triggered === true);
    assert(anyTriggered === false, 'No rules were triggered for zero rainfall');

    // ---------------------------------------------------------------------------
    // Scenario 9: GET latest assessment → HTTP 200 OK
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 9: GET latest assessment → 200 ---');
    await insertHourlyWeather(farmLatestId, baseObservationTime, 24, () => 1.0);

    // Create an assessment first
    const createLatestRes = await fetch(`${baseUrl}/api/v1/farms/${farmLatestId}/risk-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const createLatestBody = await createLatestRes.json();
    const createdAssessmentId = createLatestBody.data?.id;

    const getLatestRes = await fetch(`${baseUrl}/api/v1/farms/${farmLatestId}/risk-assessments/latest`);
    const getLatestBody = await getLatestRes.json();

    assert(getLatestRes.status === 200, `GET latest returns HTTP 200 (got ${getLatestRes.status})`);
    assert(getLatestBody.success === true, 'GET latest has success: true');
    assert(getLatestBody.data?.id === createdAssessmentId, `GET latest returned the correct newest assessment ID`);

    // ---------------------------------------------------------------------------
    // Scenario 10: GET latest when no assessment exists → HTTP 404 Not Found
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 10: GET latest with no assessments → 404 ---');
    const getNoAssessmentRes = await fetch(`${baseUrl}/api/v1/farms/${farmNoAssessmentsId}/risk-assessments/latest`);
    const getNoAssessmentBody = await getNoAssessmentRes.json();

    assert(getNoAssessmentRes.status === 404, `GET latest with no assessments returns HTTP 404 (got ${getNoAssessmentRes.status})`);
    assert(getNoAssessmentBody.success === false, 'GET latest returns success: false');
    assert(getNoAssessmentBody.message.includes('No risk assessments found'), `Message indicates no assessments: '${getNoAssessmentBody.message}'`);

    // ---------------------------------------------------------------------------
    // Scenario 11: GET assessment history → HTTP 200 OK, newest first
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 11: GET assessment history → 200, newest first ---');
    // Create 3 assessments directly on farmHistoryId with distinct timestamps
    const activeRules = await riskRepository.findActiveRules();
    const t1 = new Date('2026-09-23T08:00:00Z');
    const t2 = new Date('2026-09-23T09:00:00Z');
    const t3 = new Date('2026-09-23T10:00:00Z');

    const makeDummyEvents = (observedAt: Date) =>
      activeRules.map((r) => ({
        riskRuleId: r.id,
        observedValue: 5.0,
        thresholdValue: r.threshold,
        unit: r.thresholdUnit,
        severity: r.severity,
        triggered: false,
        explanation: 'Test event',
        observedAt,
      }));

    await riskRepository.createAssessmentWithEvents(
      { farmId: farmHistoryId, assessedAt: t1, overallRisk: 'LOW', ruleCount: activeRules.length, triggeredRuleCount: 0, weatherRecordCount: 24 },
      makeDummyEvents(t1)
    );
    await riskRepository.createAssessmentWithEvents(
      { farmId: farmHistoryId, assessedAt: t2, overallRisk: 'LOW', ruleCount: activeRules.length, triggeredRuleCount: 0, weatherRecordCount: 24 },
      makeDummyEvents(t2)
    );
    await riskRepository.createAssessmentWithEvents(
      { farmId: farmHistoryId, assessedAt: t3, overallRisk: 'LOW', ruleCount: activeRules.length, triggeredRuleCount: 0, weatherRecordCount: 24 },
      makeDummyEvents(t3)
    );

    const getHistoryRes = await fetch(`${baseUrl}/api/v1/farms/${farmHistoryId}/risk-assessments`);
    const getHistoryBody = await getHistoryRes.json();
    const historyList: RiskAssessmentResponseDTO[] = getHistoryBody.data;

    assert(getHistoryRes.status === 200, `GET history returns HTTP 200 (got ${getHistoryRes.status})`);
    assert(Array.isArray(historyList), 'History data is an array');
    assert(historyList.length === 3, `History list length is 3 (got ${historyList.length})`);
    assert(new Date(historyList[0].assessedAt).getTime() >= new Date(historyList[1].assessedAt).getTime(), 'First assessment is newer than second');
    assert(new Date(historyList[1].assessedAt).getTime() >= new Date(historyList[2].assessedAt).getTime(), 'Second assessment is newer than third');
    assert(new Date(historyList[0].assessedAt).toISOString() === t3.toISOString(), 'Newest assessment (10:00Z) is first');

    // ---------------------------------------------------------------------------
    // Scenario 12: GET history with ?limit=1 → HTTP 200 OK, exactly 1 result
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 12: GET history with ?limit=1 ---');
    const getLimit1Res = await fetch(`${baseUrl}/api/v1/farms/${farmHistoryId}/risk-assessments?limit=1`);
    const getLimit1Body = await getLimit1Res.json();
    const limit1List: RiskAssessmentResponseDTO[] = getLimit1Body.data;

    assert(getLimit1Res.status === 200, `GET history ?limit=1 returns HTTP 200 (got ${getLimit1Res.status})`);
    assert(Array.isArray(limit1List) && limit1List.length === 1, `Result is array with exactly 1 element (got length ${limit1List?.length})`);
    assert(new Date(limit1List[0].assessedAt).toISOString() === t3.toISOString(), 'Returned element is the newest assessment');

    // Test invalid limit validation
    const invalidLimitRes = await fetch(`${baseUrl}/api/v1/farms/${farmHistoryId}/risk-assessments?limit=0`);
    assert(invalidLimitRes.status === 400, `?limit=0 returns HTTP 400 (got ${invalidLimitRes.status})`);
    const invalidLimitHighRes = await fetch(`${baseUrl}/api/v1/farms/${farmHistoryId}/risk-assessments?limit=101`);
    assert(invalidLimitHighRes.status === 400, `?limit=101 returns HTTP 400 (got ${invalidLimitHighRes.status})`);

    // ---------------------------------------------------------------------------
    // Scenario 13: GET assessment by ID → HTTP 200 OK, populated risk events
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 13: GET assessment by ID → 200 ---');
    await insertHourlyWeather(farmByIdId, baseObservationTime, 24, () => 3.0);
    const createByIdRes = await fetch(`${baseUrl}/api/v1/farms/${farmByIdId}/risk-assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const createByIdBody = await createByIdRes.json();
    const testAssessmentId = createByIdBody.data.id;

    const getByIdRes = await fetch(`${baseUrl}/api/v1/risk-assessments/${testAssessmentId}`);
    const getByIdBody = await getByIdRes.json();
    const assessmentByIdData: RiskAssessmentResponseDTO = getByIdBody.data;

    assert(getByIdRes.status === 200, `GET assessment by ID returns HTTP 200 (got ${getByIdRes.status})`);
    assert(assessmentByIdData.id === testAssessmentId, 'Retrieved assessment matches requested ID');
    assert(Array.isArray(assessmentByIdData.events), 'Assessment has events array');
    assert(assessmentByIdData.events.length === activeRules.length, `Events length (${assessmentByIdData.events.length}) matches active rules (${activeRules.length})`);
    assert(assessmentByIdData.events[0].ruleCode !== undefined, 'Risk event has populated ruleCode');
    assert(assessmentByIdData.events[0].ruleName !== undefined, 'Risk event has populated ruleName');

    // ---------------------------------------------------------------------------
    // Scenario 14: GET nonexistent assessment → HTTP 404 Not Found
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 14: GET nonexistent assessment → 404 ---');
    const nonexistentAssessmentId = '00000000-0000-4000-8000-999999999999';
    const getNonexistentAssessmentRes = await fetch(`${baseUrl}/api/v1/risk-assessments/${nonexistentAssessmentId}`);
    const getNonexistentAssessmentBody = await getNonexistentAssessmentRes.json();

    assert(getNonexistentAssessmentRes.status === 404, `GET nonexistent assessment returns HTTP 404 (got ${getNonexistentAssessmentRes.status})`);
    assert(getNonexistentAssessmentBody.success === false, 'Response has success: false');
    assert(getNonexistentAssessmentBody.message.includes('not found'), `Message indicates not found: '${getNonexistentAssessmentBody.message}'`);

    const invalidAssessmentIdRes = await fetch(`${baseUrl}/api/v1/risk-assessments/invalid-uuid`);
    assert(invalidAssessmentIdRes.status === 400, `GET invalid UUID assessment returns HTTP 400 (got ${invalidAssessmentIdRes.status})`);

    // ---------------------------------------------------------------------------
    // Scenario 15: Insufficient data response preserves details
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 15: Insufficient data response details ---');
    assert(incompleteData.hasInsufficientDataCoverage === true, 'Preserves hasInsufficientDataCoverage = true');
    assert(incompleteData.summary.includes('incomplete'), 'Summary preserves incomplete observation explanation');
    const sampleInsufficientEvent = incompleteData.events.find((e) => e.status === 'INSUFFICIENT_DATA');
    assert(sampleInsufficientEvent !== undefined, 'Found event with INSUFFICIENT_DATA');
    assert(sampleInsufficientEvent?.observedValue === null, 'Preserves observedValue = null');
    assert(sampleInsufficientEvent?.explanation.includes('could not be evaluated'), 'Preserves explanation mentioning could not be evaluated');

    // ---------------------------------------------------------------------------
    // Scenario 16: Response contains populated riskEvents array
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 16: Populated riskEvents array ---');
    assert(Array.isArray(postValidBody.data?.events), 'data.events is an array');
    assert(postValidBody.data.events.length >= 7, `data.events contains all active rules (count: ${postValidBody.data.events.length})`);
    const firstEvent: RiskEventResponseDTO = postValidBody.data.events[0];
    assert(typeof firstEvent.id === 'string' && firstEvent.id.length > 0, 'Risk event has id');
    assert(typeof firstEvent.assessmentId === 'string' && firstEvent.assessmentId === postValidBody.data.id, 'Risk event has matching assessmentId');
    assert(typeof firstEvent.riskRuleId === 'string' && firstEvent.riskRuleId.length > 0, 'Risk event has riskRuleId');
    assert(typeof firstEvent.thresholdValue === 'number', 'Risk event has numeric thresholdValue');
    assert(typeof firstEvent.unit === 'string', 'Risk event has unit');
    assert(typeof firstEvent.severity === 'string', 'Risk event has severity');
    assert(typeof firstEvent.triggered === 'boolean', 'Risk event has boolean triggered flag');

    // ---------------------------------------------------------------------------
    // Scenario 17: Response preserves sourceType, sourceReference, observationWindow
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 17: Preserves rule traceability fields ---');
    for (const evt of postValidBody.data.events) {
      assert(evt.sourceType === 'OFFICIAL_REFERENCE' || evt.sourceType === 'PROJECT_INDICATOR', `Event ${evt.ruleCode} has valid sourceType (${evt.sourceType})`);
      assert(typeof evt.sourceReference === 'string' && evt.sourceReference.length > 0, `Event ${evt.ruleCode} has non-empty sourceReference`);
      assert(typeof evt.observationWindow === 'string' && evt.observationWindow.length > 0, `Event ${evt.ruleCode} has non-empty observationWindow (${evt.observationWindow})`);
    }

    // ---------------------------------------------------------------------------
    // Scenario 18: Response preserves assessmentVersion = "1.0.0"
    // ---------------------------------------------------------------------------
    console.log('\n--- Scenario 18: Preserves assessmentVersion = "1.0.0" ---');
    assert(postValidBody.data.assessmentVersion === '1.0.0', `POST assessmentVersion is "1.0.0" (got '${postValidBody.data.assessmentVersion}')`);
    assert(getLatestBody.data.assessmentVersion === '1.0.0', `GET latest assessmentVersion is "1.0.0" (got '${getLatestBody.data.assessmentVersion}')`);
    assert(assessmentByIdData.assessmentVersion === '1.0.0', `GET by ID assessmentVersion is "1.0.0" (got '${assessmentByIdData.assessmentVersion}')`);
    assert(historyList[0].assessmentVersion === '1.0.0', `GET history assessmentVersion is "1.0.0" (got '${historyList[0].assessmentVersion}')`);

  } catch (err: any) {
    console.error('💥 Test suite execution failed:', err);
    failed++;
  } finally {
    // Teardown HTTP server and clean test data
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await cleanupTestData();
  }

  console.log('\n==================================================');
  console.log(`📊 Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRiskAssessmentApiTests()
  .catch((e) => {
    console.error('Fatal error during test run:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
