/**
 * Module 6 Stage 4: Risk Assessment Integration Tests (Live PostgreSQL + Prisma)
 * Verifies end-to-end orchestration, live PostgreSQL persistence, cascade deletes,
 * database-level transaction rollback, deterministic reference time, 130mm & 250mm regressions,
 * zero rainfall, incomplete window nullability, and assessment history.
 */

import { prisma } from '../src/config/db.js';
import { seedRiskRules } from '../src/config/seedRiskRules.js';
import { riskAssessmentService } from '../src/services/riskAssessment.service.js';
import { riskRepository } from '../src/repositories/risk.repository.js';
import { farmRepository } from '../src/repositories/farm.repository.js';
import { farmerRepository } from '../src/repositories/farmer.repository.js';
import { farmBoundaryRepository } from '../src/repositories/farmBoundary.repository.js';
import { weatherRepository } from '../src/repositories/weather.repository.js';
import { RiskLevel, RiskSeverity } from '../src/types/risk.types.js';

async function runRiskAssessmentIntegrationTests() {
  console.log('🧪 Running Module 6 Stage 4: Risk Assessment Integration Tests (Live PostgreSQL)...\n');

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

  const testMobile = '9999900007';
  let testFarmerId: string | null = null;
  let testFarmId: string | null = null;
  let rollbackFarmId: string | null = null;

  try {
    // ---------------------------------------------------------------------------
    // Step 0: Ensure Rules are Seeded and DB is Connected
    // ---------------------------------------------------------------------------
    await seedRiskRules(prisma);

    // Clean up any previous test entities
    await prisma.riskEvent.deleteMany({
      where: { assessment: { farm: { farmer: { mobileNumber: testMobile } } } },
    });
    await prisma.riskAssessment.deleteMany({
      where: { farm: { farmer: { mobileNumber: testMobile } } },
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

    // Create Test Farmer and Farm
    const farmer = await farmerRepository.create({
      fullName: 'Suresh Patil',
      mobileNumber: testMobile,
      preferredLanguage: 'mr',
      farmerReferenceNumber: 'AGRI-FMR-20260922-9907',
    });
    testFarmerId = farmer.id;

    const farm = await farmRepository.create({
      farmerId: farmer.id,
      farmName: 'Risk Test Farm Plot',
      cropName: 'Sugarcane',
      farmArea: 6.5,
      areaUnit: 'ACRE',
      sowingDate: new Date('2026-03-01'),
      expectedHarvestDate: new Date('2027-02-01'),
      farmReferenceNumber: 'AGRI-FRM-20260922-9907',
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testFarmId = farm.id;

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

    // ---------------------------------------------------------------------------
    // A. Complete Assessment Persistence & Relations
    // ---------------------------------------------------------------------------
    const timeA = new Date('2026-09-22T10:00:00.000Z');
    await insertHourlyWeather(testFarmId, timeA, 24, (i) => 0); // 0 rain initially

    const assessmentA = await riskAssessmentService.assessFarmRisk(testFarmId);
    assert(assessmentA.id !== undefined, 'A.1 RiskAssessment created with valid UUID');
    assert(assessmentA.farmId === testFarmId, 'A.2 RiskAssessment.farmId matches target farm');
    assert(assessmentA.ruleCount === 7, 'A.3 Evaluated all 7 active IMD rules');
    assert(assessmentA.events.length === 7, 'A.4 Persisted exactly 7 RiskEvent records');
    assert(assessmentA.assessmentVersion === '1.0.0', 'A.5 assessmentVersion is strictly "1.0.0"');

    // Verify PostgreSQL rows
    const liveAssessment = await prisma.riskAssessment.findUnique({
      where: { id: assessmentA.id },
      include: { riskEvents: true },
    });
    assert(liveAssessment !== null, 'A.6 RiskAssessment exists in live PostgreSQL');
    assert(liveAssessment?.riskEvents.length === 7, 'A.7 Live PostgreSQL contains 7 linked RiskEvent rows');

    // ---------------------------------------------------------------------------
    // B. Deterministic Reference Timestamp
    // ---------------------------------------------------------------------------
    assert(
      assessmentA.assessedAt === timeA.toISOString(),
      `D.1 assessedAt (${assessmentA.assessedAt}) equals latest WeatherRecord.observedAt (${timeA.toISOString()})`
    );

    // ---------------------------------------------------------------------------
    // C. 130 mm Rainfall Regression Test (Mutually Exclusive Band)
    // ---------------------------------------------------------------------------
    // Clean weather records for farm
    await prisma.weatherRecord.deleteMany({ where: { farmId: testFarmId } });

    const time130 = new Date('2026-09-22T12:00:00.000Z');
    // 24 records summing to exactly 130.0 mm
    // Let 22 hours be 0 mm, 1 hour be 65 mm, 1 hour be 65 mm -> 130 mm total, peak 3h = 130 mm (>100mm -> exceptionally heavy 3h)
    // Wait, let's distribute evenly so 3h does not exceed 30mm: e.g. 5.4166 mm/hr * 24 = 130.0 mm
    // 5.4166 * 3 = 16.25 mm (< 20 mm, so 3h triggers 0 rules!)
    // This isolates 24h rainfall to 130.0 mm without triggering 3h rules!
    const rainPerHr = 130.0 / 24; // ~5.416666 mm
    await insertHourlyWeather(testFarmId, time130, 24, () => Math.round(rainPerHr * 100) / 100);

    // Adjust last record to ensure exact 130.0 mm sum
    const allRecords130 = await prisma.weatherRecord.findMany({
      where: { farmId: testFarmId },
      orderBy: { observedAt: 'asc' },
    });
    let currentSum = allRecords130.reduce((acc, r) => acc + Number(r.rainfallMm), 0);
    const diff = Math.round((130.0 - currentSum) * 100) / 100;
    if (diff !== 0) {
      await prisma.weatherRecord.update({
        where: { id: allRecords130[allRecords130.length - 1].id },
        data: { rainfallMm: Number(allRecords130[allRecords130.length - 1].rainfallMm) + diff },
      });
    }

    const assessment130 = await riskAssessmentService.assessFarmRisk(testFarmId, time130);
    const veryHeavy24h = assessment130.events.find((e) => e.ruleCode === 'VERY_HEAVY_RAINFALL_24H');
    const heavy24h = assessment130.events.find((e) => e.ruleCode === 'HEAVY_RAINFALL_24H');
    const extreme24h = assessment130.events.find((e) => e.ruleCode === 'EXTREME_RAINFALL_24H');

    assert(veryHeavy24h?.triggered === true, 'E.1 130 mm rain: VERY_HEAVY_RAINFALL_24H is TRIGGERED');
    assert(heavy24h?.triggered === false, 'E.2 130 mm rain: HEAVY_RAINFALL_24H is NOT_TRIGGERED (superseded)');
    assert(extreme24h?.triggered === false, 'E.3 130 mm rain: EXTREME_RAINFALL_24H is NOT_TRIGGERED');
    assert(heavy24h?.explanation.includes('superseded'), 'E.4 Superseded explanation generated for lower band');
    assert(assessment130.overallRisk === 'HIGH', 'E.5 130 mm rain: overallRisk is HIGH (mapped from VERY_HIGH)');
    assert(assessment130.triggeredRuleCount === 1, 'E.6 Exactly 1 triggered rule in 130 mm scenario');

    // ---------------------------------------------------------------------------
    // D. 250 mm Rainfall Regression Test
    // ---------------------------------------------------------------------------
    await prisma.weatherRecord.deleteMany({ where: { farmId: testFarmId } });

    const time250 = new Date('2026-09-22T14:00:00.000Z');
    // Distribute 250 mm across 24h: ~10.41 mm/hr (3h = ~31.23 mm)
    // To isolate 24h rule, spread evenly: 250 / 24 = 10.416 mm
    await insertHourlyWeather(testFarmId, time250, 24, () => 10.42);
    // Ensure 24h total >= 204.5 mm
    const assessment250 = await riskAssessmentService.assessFarmRisk(testFarmId, time250);
    const extremeEvent250 = assessment250.events.find((e) => e.ruleCode === 'EXTREME_RAINFALL_24H');
    const veryHeavyEvent250 = assessment250.events.find((e) => e.ruleCode === 'VERY_HEAVY_RAINFALL_24H');
    const heavyEvent250 = assessment250.events.find((e) => e.ruleCode === 'HEAVY_RAINFALL_24H');

    assert(extremeEvent250?.triggered === true, 'F.1 250 mm rain: EXTREME_RAINFALL_24H is TRIGGERED');
    assert(veryHeavyEvent250?.triggered === false, 'F.2 250 mm rain: VERY_HEAVY_RAINFALL_24H is NOT_TRIGGERED (superseded)');
    assert(heavyEvent250?.triggered === false, 'F.3 250 mm rain: HEAVY_RAINFALL_24H is NOT_TRIGGERED (superseded)');
    assert(assessment250.overallRisk === 'HIGH', 'F.4 250 mm rain: overallRisk is HIGH');

    // ---------------------------------------------------------------------------
    // E. Zero Rainfall Test
    // ---------------------------------------------------------------------------
    await prisma.weatherRecord.deleteMany({ where: { farmId: testFarmId } });
    const timeZero = new Date('2026-09-22T16:00:00.000Z');
    await insertHourlyWeather(testFarmId, timeZero, 24, () => 0.0);

    const assessmentZero = await riskAssessmentService.assessFarmRisk(testFarmId, timeZero);
    assert(assessmentZero.overallRisk === 'LOW', 'G.1 Zero rainfall across complete window: overallRisk = LOW');
    assert(assessmentZero.triggeredRuleCount === 0, 'G.2 Zero rainfall: triggeredRuleCount = 0');
    assert(!assessmentZero.hasInsufficientDataCoverage, 'G.3 Zero rainfall: complete observation window verified');

    // ---------------------------------------------------------------------------
    // F. Incomplete Window Test (Nullable observedValue in PostgreSQL)
    // ---------------------------------------------------------------------------
    await prisma.weatherRecord.deleteMany({ where: { farmId: testFarmId } });
    const timeIncomplete = new Date('2026-09-22T18:00:00.000Z');
    // Only 2 records
    await insertHourlyWeather(testFarmId, timeIncomplete, 2, () => 0.0);

    const assessmentIncomplete = await riskAssessmentService.assessFarmRisk(testFarmId, timeIncomplete);
    assert(assessmentIncomplete.hasInsufficientDataCoverage === true, 'H.1 Incomplete window: hasInsufficientDataCoverage = true');
    assert(assessmentIncomplete.overallRisk === 'LOW', 'H.2 Incomplete window with no triggers: persisted overallRisk = LOW');

    // Query live PostgreSQL risk_events to verify observedValue is strictly NULL in the database
    const liveIncompleteEvents = await prisma.riskEvent.findMany({
      where: { assessmentId: assessmentIncomplete.id },
    });
    const rainfall24hEvent = liveIncompleteEvents.find(
      (e) => e.explanation.includes('24-hour rainfall')
    );
    assert(rainfall24hEvent?.observedValue === null, 'H.3 Live PostgreSQL: observedValue is strictly NULL (not 0.00)');
    assert(rainfall24hEvent?.triggered === false, 'H.4 Live PostgreSQL: triggered is false for incomplete window');

    // ---------------------------------------------------------------------------
    // G. Multiple Assessments History
    // ---------------------------------------------------------------------------
    const history = await riskAssessmentService.getAssessmentsForFarm(testFarmId);
    assert(history.length >= 4, `I.1 Multiple assessments persisted for farm (found ${history.length})`);
    assert(
      new Date(history[0].assessedAt).getTime() >= new Date(history[1].assessedAt).getTime(),
      'I.2 Assessment history returned in descending order (assessedAt DESC)'
    );

    // ---------------------------------------------------------------------------
    // H. Real PostgreSQL Transaction Rollback Test
    // ---------------------------------------------------------------------------
    console.log('\n  [Executing Real PostgreSQL Database-Level Transaction Rollback Test...]');
    const rollbackFarm = await farmRepository.create({
      farmerId: testFarmerId,
      farmName: 'Transaction Rollback Test Farm',
      cropName: 'Millet',
      farmArea: 2.0,
      areaUnit: 'ACRE',
      sowingDate: new Date('2026-05-01'),
      expectedHarvestDate: new Date('2026-09-01'),
      farmReferenceNumber: 'AGRI-FRM-20260922-ROLL',
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    rollbackFarmId = rollbackFarm.id;

    // Verify 0 assessments initially
    const countBefore = await prisma.riskAssessment.count({ where: { farmId: rollbackFarmId } });
    assert(countBefore === 0, 'C.1 Initial assessment count for rollback farm is 0');

    // Attempt createAssessmentWithEvents with an invalid riskRuleId that deliberately
    // violates PostgreSQL foreign key constraint (P2003)
    let transactionThrew = false;
    try {
      await riskRepository.createAssessmentWithEvents(
        {
          farmId: rollbackFarmId,
          assessedAt: new Date(),
          overallRisk: RiskLevel.LOW,
          ruleCount: 1,
          triggeredRuleCount: 0,
          weatherRecordCount: 0,
        },
        [
          {
            riskRuleId: '00000000-0000-0000-0000-000000000000', // Non-existent foreign key!
            observedValue: null,
            thresholdValue: 64.5,
            unit: 'MM',
            severity: RiskSeverity.HIGH,
            triggered: false,
            explanation: 'Rollback test',
            observedAt: new Date(),
          },
        ]
      );
    } catch (err: any) {
      transactionThrew = true;
      assert(err !== null, 'C.2 PostgreSQL rejected invalid foreign key during event creation');
    }

    assert(transactionThrew === true, 'C.3 createAssessmentWithEvents threw on constraint violation');
    const countAfter = await prisma.riskAssessment.count({ where: { farmId: rollbackFarmId } });
    const eventCountAfter = await prisma.riskEvent.count({
      where: { assessment: { farmId: rollbackFarmId } },
    });
    assert(countAfter === 0, 'C.4 Atomic transaction rolled back: RiskAssessment count remains strictly 0');
    assert(eventCountAfter === 0, 'C.5 Atomic transaction rolled back: RiskEvent count remains strictly 0');

    // ---------------------------------------------------------------------------
    // I. Cascade Delete Test
    // ---------------------------------------------------------------------------
    const farmAssessmentsBefore = await prisma.riskAssessment.count({ where: { farmId: testFarmId } });
    assert(farmAssessmentsBefore > 0, 'B.1 Target farm has active assessments before delete');
    await farmRepository.delete(testFarmId);
    const farmAssessmentsAfter = await prisma.riskAssessment.count({ where: { farmId: testFarmId } });
    assert(farmAssessmentsAfter === 0, 'B.2 Deleting farm cascade-deleted all associated RiskAssessments (ON DELETE CASCADE)');
    testFarmId = null; // Marked deleted
  } finally {
    // Cleanup entities
    try {
      if (rollbackFarmId) {
        await prisma.farm.delete({ where: { id: rollbackFarmId } }).catch(() => {});
      }
      if (testFarmId) {
        await prisma.farm.delete({ where: { id: testFarmId } }).catch(() => {});
      }
      if (testFarmerId) {
        await prisma.farmer.delete({ where: { id: testFarmerId } }).catch(() => {});
      }
    } catch {
      // Ignore cleanup error
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================');
  console.log(`Risk Assessment Integration Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRiskAssessmentIntegrationTests().catch((err) => {
  console.error('Fatal error during integration tests:', err);
  process.exit(1);
});
