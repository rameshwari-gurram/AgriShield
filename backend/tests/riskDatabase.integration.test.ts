/**
 * Module 6 Stage 1: Climate Risk Database & Rule Configuration Integration Test Suite
 * Tests live PostgreSQL persistence, Prisma models, enums, relations, cascades,
 * historical snapshot immutability, and seed idempotency.
 */

import { prisma } from '../src/config/db.js';
import { seedRiskRules } from '../src/config/seedRiskRules.js';
import {
  RiskSeverity,
  RiskLevel,
  RiskSourceType,
  RiskHazardType,
  RiskMeasurement,
} from '../src/types/risk.types.js';

async function runRiskDatabaseIntegrationTests() {
  console.log('🧪 Running Module 6 Stage 1: Climate Risk Database Integration Tests (Live PostgreSQL)...\n');

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

  const testMobile = '9999900006';
  let testFarmerId: string | null = null;
  let testFarmId: string | null = null;
  let customRuleId: string | null = null;
  let restrictRuleId: string | null = null;
  let restrictFarmId: string | null = null;

  try {
    // ---------------------------------------------------------------------------
    // Preliminary: Ensure database connection & tables exist
    // ---------------------------------------------------------------------------
    const tableChecks: any[] = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name IN ('risk_rules', 'risk_assessments', 'risk_events')
      ORDER BY table_name ASC;
    `;
    assert(tableChecks.length === 3, '0. Live PostgreSQL contains risk_rules, risk_assessments, and risk_events tables');

    // Cleanup lingering test entities if previous test crashed
    await prisma.riskEvent.deleteMany({
      where: {
        OR: [
          { riskRule: { code: { startsWith: 'TEST_' } } },
          { assessment: { farm: { farmer: { mobileNumber: testMobile } } } },
        ],
      },
    });
    await prisma.riskAssessment.deleteMany({
      where: { farm: { farmer: { mobileNumber: testMobile } } },
    });
    await prisma.riskRule.deleteMany({
      where: { code: { startsWith: 'TEST_' } },
    });
    await prisma.weatherRecord.deleteMany({
      where: { farm: { farmer: { mobileNumber: testMobile } } },
    });
    await prisma.farmBoundary.deleteMany({
      where: { farm: { farmer: { mobileNumber: testMobile } } },
    });
    await prisma.farm.deleteMany({
      where: { farmer: { mobileNumber: testMobile } },
    });
    await prisma.farmer.deleteMany({
      where: { mobileNumber: testMobile },
    });

    // ---------------------------------------------------------------------------
    // 1. RiskRule creation
    // ---------------------------------------------------------------------------
    const createdRule = await prisma.riskRule.create({
      data: {
        code: 'TEST_CUSTOM_RULE_01',
        name: 'Test Heavy Rain Rule',
        description: 'Temporary rule for integration testing',
        hazardType: RiskHazardType.HEAVY_RAINFALL,
        measurement: RiskMeasurement.RAINFALL,
        threshold: 64.5,
        thresholdUnit: 'MM',
        observationWindow: '24_HOURS',
        severity: RiskSeverity.HIGH,
        sourceType: RiskSourceType.OFFICIAL_REFERENCE,
        sourceReference: 'Test reference document section 4.1',
        isActive: true,
      },
    });
    customRuleId = createdRule.id;

    assert(createdRule.id !== undefined && createdRule.id.length === 36, '1.1 RiskRule created with valid UUID');
    assert(createdRule.code === 'TEST_CUSTOM_RULE_01', '1.2 RiskRule code persisted correctly');
    assert(Number(createdRule.threshold) === 64.5, '1.3 RiskRule decimal threshold persisted as 64.5');
    assert(createdRule.hazardType === 'HEAVY_RAINFALL', '1.4 RiskRule hazardType enum matches HEAVY_RAINFALL');
    assert(createdRule.severity === 'HIGH', '1.5 RiskRule severity enum matches HIGH');

    // ---------------------------------------------------------------------------
    // 2. Unique rule code rejection
    // ---------------------------------------------------------------------------
    let duplicateCodeRejected = false;
    try {
      await prisma.riskRule.create({
        data: {
          code: 'TEST_CUSTOM_RULE_01', // Duplicate code
          name: 'Conflicting Rule',
          hazardType: RiskHazardType.HEAVY_RAINFALL,
          measurement: RiskMeasurement.RAINFALL,
          threshold: 50.0,
          thresholdUnit: 'MM',
          observationWindow: '24_HOURS',
          severity: RiskSeverity.MODERATE,
          sourceType: RiskSourceType.PROJECT_INDICATOR,
          sourceReference: 'Duplicate test',
        },
      });
    } catch (err: any) {
      // Prisma P2002 is Unique constraint violation
      duplicateCodeRejected = err.code === 'P2002';
    }
    assert(duplicateCodeRejected, '2. Unique rule code constraint prevents duplicate code registration (P2002)');

    // ---------------------------------------------------------------------------
    // Setup Parent Farmer and Farm for Assessments
    // ---------------------------------------------------------------------------
    const testFarmer = await prisma.farmer.create({
      data: {
        fullName: 'Risk Test Farmer',
        mobileNumber: testMobile,
        preferredLanguage: 'en',
      },
    });
    testFarmerId = testFarmer.id;

    const testFarm = await prisma.farm.create({
      data: {
        farmerId: testFarmer.id,
        farmName: 'Risk Test Farm 1',
        farmReferenceNumber: 'AGRI-TEST-RISK-01',
        cropName: 'Cotton',
        sowingDate: new Date('2026-06-01'),
        farmArea: 10.5,
        village: 'Baramati Village',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '413102',
      },
    });
    testFarmId = testFarm.id;

    // ---------------------------------------------------------------------------
    // 3. RiskAssessment linked to Farm
    // ---------------------------------------------------------------------------
    const assessment1 = await prisma.riskAssessment.create({
      data: {
        farmId: testFarm.id,
        assessedAt: new Date('2026-09-22T10:00:00Z'),
        overallRisk: RiskLevel.HIGH,
        assessmentVersion: '1.0.0',
        ruleCount: 7,
        triggeredRuleCount: 1,
        weatherRecordCount: 25,
      },
    });
    assert(assessment1.id !== undefined && assessment1.farmId === testFarm.id, '3. RiskAssessment successfully linked to Farm UUID');

    // ---------------------------------------------------------------------------
    // 4. Multiple assessments for one Farm
    // ---------------------------------------------------------------------------
    const assessment2 = await prisma.riskAssessment.create({
      data: {
        farmId: testFarm.id,
        assessedAt: new Date('2026-09-22T11:00:00Z'),
        overallRisk: RiskLevel.LOW,
        assessmentVersion: '1.0.0',
        ruleCount: 7,
        triggeredRuleCount: 0,
        weatherRecordCount: 26,
      },
    });

    const farmAssessments = await prisma.riskAssessment.findMany({
      where: { farmId: testFarm.id },
      orderBy: { assessedAt: 'desc' },
    });
    assert(farmAssessments.length === 2, '4.1 Farm successfully has multiple distinct RiskAssessment records (count: 2)');
    assert(farmAssessments[0].overallRisk === 'LOW' && farmAssessments[1].overallRisk === 'HIGH', '4.2 Assessments ordered descending by assessedAt');

    // ---------------------------------------------------------------------------
    // 5. RiskEvent linked to RiskAssessment
    // 6. RiskEvent linked to RiskRule
    // 7. observedValue persistence
    // 8. thresholdValue persistence
    // 9. sourceType persistence
    // 10. sourceReference persistence
    // ---------------------------------------------------------------------------
    const event1 = await prisma.riskEvent.create({
      data: {
        assessmentId: assessment1.id,
        riskRuleId: createdRule.id,
        observedValue: 72.85,
        thresholdValue: 64.5,
        unit: 'MM',
        severity: RiskSeverity.HIGH,
        triggered: true,
        explanation: 'Observed 24-hour rainfall of 72.85 mm exceeded the heavy rainfall threshold of 64.50 mm.',
        observedAt: new Date('2026-09-22T09:30:00Z'),
      },
    });

    assert(event1.assessmentId === assessment1.id, '5. RiskEvent linked to parent RiskAssessment UUID');
    assert(event1.riskRuleId === createdRule.id, '6. RiskEvent linked to parent RiskRule UUID');
    assert(Number(event1.observedValue) === 72.85, '7. RiskEvent observedValue persisted accurately with decimal precision (72.85)');
    assert(Number(event1.thresholdValue) === 64.5, '8. RiskEvent thresholdValue persisted accurately (64.50)');
    assert(createdRule.sourceType === 'OFFICIAL_REFERENCE', '9. RiskRule sourceType persisted as OFFICIAL_REFERENCE');
    assert(createdRule.sourceReference.includes('Test reference document'), '10. RiskRule sourceReference text persisted accurately');

    // ---------------------------------------------------------------------------
    // 11. Historical RiskEvent remains explainable after rule configuration changes
    // ---------------------------------------------------------------------------
    // Simulate updating the rule: change threshold to 85.0 mm and deactivate it
    await prisma.riskRule.update({
      where: { id: createdRule.id },
      data: {
        threshold: 85.0,
        severity: RiskSeverity.VERY_HIGH,
        isActive: false,
        name: 'Updated Rule Name That Did Not Exist Earlier',
      },
    });

    // Re-fetch the previously recorded historical event
    const historicalEvent = await prisma.riskEvent.findUniqueOrThrow({
      where: { id: event1.id },
    });

    assert(Number(historicalEvent.thresholdValue) === 64.5, '11.1 Historical RiskEvent retains snapshot thresholdValue (64.50 mm) even after rule threshold was updated to 85.0 mm');
    assert(Number(historicalEvent.observedValue) === 72.85, '11.2 Historical RiskEvent retains original observedValue (72.85 mm)');
    assert(historicalEvent.severity === 'HIGH', '11.3 Historical RiskEvent retains original severity (HIGH)');
    assert(historicalEvent.explanation.includes('64.50 mm'), '11.4 Historical RiskEvent retains reproducible explanation');

    // ---------------------------------------------------------------------------
    // 12. Farm → RiskAssessment relation
    // ---------------------------------------------------------------------------
    const farmWithAssessments = await prisma.farm.findUnique({
      where: { id: testFarm.id },
      include: { riskAssessments: true },
    });
    assert(
      farmWithAssessments !== null && farmWithAssessments.riskAssessments.length === 2,
      '12. Farm.riskAssessments relation successfully retrieves child assessments'
    );

    // ---------------------------------------------------------------------------
    // 13. Assessment → RiskEvent relation
    // ---------------------------------------------------------------------------
    const assessmentWithEvents = await prisma.riskAssessment.findUnique({
      where: { id: assessment1.id },
      include: { riskEvents: true },
    });
    assert(
      assessmentWithEvents !== null && assessmentWithEvents.riskEvents.length === 1,
      '13. RiskAssessment.riskEvents relation successfully retrieves child events'
    );

    // ---------------------------------------------------------------------------
    // 14. Rule → RiskEvent relation
    // ---------------------------------------------------------------------------
    const ruleWithEvents = await prisma.riskRule.findUnique({
      where: { id: createdRule.id },
      include: { riskEvents: true },
    });
    assert(
      ruleWithEvents !== null && ruleWithEvents.riskEvents.length === 1,
      '14. RiskRule.riskEvents relation successfully retrieves linked events'
    );

    // ---------------------------------------------------------------------------
    // 15. Cascade and Restrict behavior
    // ---------------------------------------------------------------------------
    // 15.1 Deleting Farm must cascade-delete RiskAssessment and RiskEvent
    await prisma.farm.delete({ where: { id: testFarm.id } });
    testFarmId = null; // Marked deleted

    const assessmentAfterFarmDelete = await prisma.riskAssessment.findUnique({
      where: { id: assessment1.id },
    });
    const eventAfterFarmDelete = await prisma.riskEvent.findUnique({
      where: { id: event1.id },
    });

    assert(assessmentAfterFarmDelete === null, '15.1 Deleting Farm cascade-deleted associated RiskAssessment (ON DELETE CASCADE)');
    assert(eventAfterFarmDelete === null, '15.2 Deleting Farm cascade-deleted associated RiskEvent (ON DELETE CASCADE)');

    // 15.2 Deleting RiskRule referenced by a RiskEvent must be REJECTED (ON DELETE RESTRICT)
    const restrictRule = await prisma.riskRule.create({
      data: {
        code: 'TEST_RESTRICT_RULE',
        name: 'Restrict Test Rule',
        hazardType: RiskHazardType.HEAVY_RAINFALL,
        measurement: RiskMeasurement.RAINFALL,
        threshold: 64.5,
        thresholdUnit: 'MM',
        observationWindow: '24_HOURS',
        severity: RiskSeverity.HIGH,
        sourceType: RiskSourceType.OFFICIAL_REFERENCE,
        sourceReference: 'Restrict test reference',
      },
    });
    restrictRuleId = restrictRule.id;

    const restrictFarm = await prisma.farm.create({
      data: {
        farmerId: testFarmer.id,
        farmName: 'Restrict Test Farm',
        farmReferenceNumber: 'AGRI-TEST-RISK-02',
        cropName: 'Soybean',
        sowingDate: new Date('2026-06-01'),
        farmArea: 5.0,
        village: 'Baramati Village',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '413102',
      },
    });
    restrictFarmId = restrictFarm.id;

    const restrictAssessment = await prisma.riskAssessment.create({
      data: {
        farmId: restrictFarm.id,
        overallRisk: RiskLevel.LOW,
        ruleCount: 1,
        triggeredRuleCount: 0,
        weatherRecordCount: 24,
      },
    });

    const activeEvent = await prisma.riskEvent.create({
      data: {
        assessmentId: restrictAssessment.id,
        riskRuleId: restrictRule.id,
        observedValue: 12.0,
        thresholdValue: 64.5,
        unit: 'MM',
        severity: RiskSeverity.HIGH,
        triggered: false,
        explanation: 'Observed 12.0 mm was below threshold 64.50 mm',
        observedAt: new Date(),
      },
    });

    let deleteRuleRestricted = false;
    try {
      await prisma.riskRule.delete({ where: { id: restrictRule.id } });
    } catch (err: any) {
      // Prisma P2003 is foreign key constraint violation (ON DELETE RESTRICT)
      deleteRuleRestricted = err.code === 'P2003';
    }
    assert(deleteRuleRestricted, '15.3 Deleting RiskRule referenced by historical RiskEvent is REJECTED by PostgreSQL (ON DELETE RESTRICT, P2003)');

    // Clean up restrict entities
    await prisma.riskEvent.delete({ where: { id: activeEvent.id } });
    await prisma.riskAssessment.delete({ where: { id: restrictAssessment.id } });
    await prisma.farm.delete({ where: { id: restrictFarm.id } });
    restrictFarmId = null;
    await prisma.riskRule.delete({ where: { id: restrictRule.id } });
    restrictRuleId = null;

    // ---------------------------------------------------------------------------
    // 16. Seeded rule count and codes
    // ---------------------------------------------------------------------------
    const seededRules = await prisma.riskRule.findMany({
      where: {
        code: {
          in: [
            'HEAVY_RAINFALL_24H',
            'VERY_HEAVY_RAINFALL_24H',
            'EXTREME_RAINFALL_24H',
            'INTENSE_RAINFALL_3H',
            'VERY_INTENSE_RAINFALL_3H',
            'EXTREMELY_INTENSE_RAINFALL_3H',
            'EXCEPTIONALLY_HEAVY_RAINFALL_3H',
          ],
        },
      },
      orderBy: { code: 'asc' },
    });

    assert(seededRules.length === 7, `16.1 Seeded rules in database count is exactly 7 (got ${seededRules.length})`);

    const expectedCodes = [
      'EXCEPTIONALLY_HEAVY_RAINFALL_3H',
      'EXTREMELY_INTENSE_RAINFALL_3H',
      'EXTREME_RAINFALL_24H',
      'HEAVY_RAINFALL_24H',
      'INTENSE_RAINFALL_3H',
      'VERY_HEAVY_RAINFALL_24H',
      'VERY_INTENSE_RAINFALL_3H',
    ];
    const actualCodes = seededRules.map((r) => r.code).sort();
    const codesMatch = JSON.stringify(actualCodes) === JSON.stringify(expectedCodes.sort());
    assert(codesMatch, '16.2 All 7 expected IMD rainfall rule codes exist');

    const allOfficialRef = seededRules.every((r) => r.sourceType === 'OFFICIAL_REFERENCE');
    assert(allOfficialRef, '16.3 All 7 initial seeded rules have sourceType = OFFICIAL_REFERENCE');

    const allUnitsMM = seededRules.every((r) => r.thresholdUnit === 'MM');
    assert(allUnitsMM, '16.4 All 7 initial seeded rules have thresholdUnit = MM');

    const rule24hHeavy = seededRules.find((r) => r.code === 'HEAVY_RAINFALL_24H');
    assert(
      rule24hHeavy !== undefined &&
        Number(rule24hHeavy.threshold) === 64.5 &&
        rule24hHeavy.observationWindow === '24_HOURS' &&
        rule24hHeavy.severity === 'HIGH',
      '16.5 HEAVY_RAINFALL_24H configuration verified: 64.5mm, 24_HOURS, HIGH'
    );

    const rule3hExceptional = seededRules.find((r) => r.code === 'EXCEPTIONALLY_HEAVY_RAINFALL_3H');
    assert(
      rule3hExceptional !== undefined &&
        Number(rule3hExceptional.threshold) === 100.0 &&
        rule3hExceptional.observationWindow === '3_HOURS' &&
        rule3hExceptional.severity === 'VERY_HIGH',
      '16.6 EXCEPTIONALLY_HEAVY_RAINFALL_3H configuration verified: 100.0mm, 3_HOURS, VERY_HIGH'
    );

    // ---------------------------------------------------------------------------
    // 17. Duplicate seed execution does not create duplicates
    // ---------------------------------------------------------------------------
    const seedResult = await seedRiskRules(prisma);
    assert(seedResult.rulesProcessed === 7, '17.1 seedRiskRules executed again reports 7 rules processed');

    const countAfterReSeed = await prisma.riskRule.count({
      where: {
        code: {
          in: expectedCodes,
        },
      },
    });
    assert(countAfterReSeed === 7, `17.2 Idempotent seeding verified: rule count strictly remains 7 (got ${countAfterReSeed})`);
  } finally {
    // Teardown test entities
    try {
      if (customRuleId) {
        await prisma.riskRule.deleteMany({ where: { id: customRuleId } });
      }
      if (restrictRuleId) {
        await prisma.riskRule.deleteMany({ where: { id: restrictRuleId } });
      }
      if (restrictFarmId) {
        await prisma.farm.deleteMany({ where: { id: restrictFarmId } });
      }
      if (testFarmId) {
        await prisma.farm.deleteMany({ where: { id: testFarmId } });
      }
      if (testFarmerId) {
        await prisma.farmer.deleteMany({ where: { id: testFarmerId } });
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Risk Database Integration Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runRiskDatabaseIntegrationTests().catch((error) => {
  console.error('Fatal error during risk database integration test run:', error);
  process.exit(1);
});
