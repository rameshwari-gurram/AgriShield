/**
 * Module 6 Stage 3: Climate Risk Rule Engine Integration Test (Live PostgreSQL)
 * Proves that active RiskRule rows loaded from real PostgreSQL table `risk_rules`
 * feed cleanly into ClimateRiskRuleEngine and evaluate deterministically with zero database mutations.
 */

import { prisma } from '../src/config/db.js';
import { climateRiskRuleEngine } from '../src/services/climateRiskRuleEngine.service.js';
import { WeatherAggregationResult } from '../src/types/weather.types.js';

async function runRuleEngineIntegrationTests() {
  console.log('🧪 Running Module 6 Stage 3: Climate Risk Rule Engine Integration Test (Live PostgreSQL)...\n');

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

  try {
    // ---------------------------------------------------------------------------
    // 1. Load active RiskRule rows directly from live PostgreSQL
    // ---------------------------------------------------------------------------
    const dbRules = await prisma.riskRule.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });

    assert(dbRules.length >= 7, `1.1 Loaded at least 7 active RiskRule records from PostgreSQL (got ${dbRules.length})`);
    assert(dbRules.every((r) => r.id && r.id.length === 36), '1.2 All loaded rules possess valid database UUIDs');

    // Baseline counts to guarantee zero database mutations
    const initialAssessments = await prisma.riskAssessment.count();
    const initialEvents = await prisma.riskEvent.count();

    // ---------------------------------------------------------------------------
    // 2. Feed into ClimateRiskRuleEngine
    // ---------------------------------------------------------------------------
    const weather: WeatherAggregationResult = {
      farmId: 'test-farm-uuid',
      observationStart: new Date('2026-09-22T00:00:00Z'),
      observationEnd: new Date('2026-09-22T23:00:00Z'),
      recordCount: 24,
      totalRainfall24h: 135.5, // Exceeds 115.6mm (VERY_HEAVY), below 204.5mm (EXTREME)
      maximumRolling3hRainfall: 35.0, // Exceeds 30.0mm (VERY_INTENSE), below 50.0mm (EXTREMELY_INTENSE)
      maximumTemperatureC: 32.0,
      maximumWindSpeedKmh: 20.0,
      maximumWindGustKmh: 30.0,
      complete24hWindow: true,
      complete3hWindow: true,
      threeHourWindowEnd: new Date('2026-09-22T14:00:00Z'),
    };

    const results = climateRiskRuleEngine.evaluate(weather, dbRules);

    assert(results.length === dbRules.length, `2.1 Evaluated all ${dbRules.length} rules loaded from PostgreSQL`);

    // Verify database rule UUIDs are preserved on results
    const allHaveRuleId = results.every((r) => r.ruleId !== undefined && r.ruleId.length === 36);
    assert(allHaveRuleId, '2.2 Database UUIDs preserved on evaluation results');

    // ---------------------------------------------------------------------------
    // 3. Mutually exclusive classification verification
    // ---------------------------------------------------------------------------
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 2, `3.1 Exactly 2 rules triggered across the two observation window groups (got ${triggered.length})`);

    const triggered24h = triggered.find((r) => r.observationWindow === '24_HOURS');
    assert(
      triggered24h?.ruleCode === 'VERY_HEAVY_RAINFALL_24H',
      `3.2 Highest-satisfied 24h threshold selected: VERY_HEAVY_RAINFALL_24H (got ${triggered24h?.ruleCode})`
    );

    const triggered3h = triggered.find((r) => r.observationWindow === '3_HOURS');
    assert(
      triggered3h?.ruleCode === 'VERY_INTENSE_RAINFALL_3H',
      `3.3 Highest-satisfied 3h threshold selected: VERY_INTENSE_RAINFALL_3H (got ${triggered3h?.ruleCode})`
    );

    const heavy24h = results.find((r) => r.ruleCode === 'HEAVY_RAINFALL_24H');
    assert(
      heavy24h?.triggered === false && heavy24h?.status === 'NOT_TRIGGERED',
      '3.4 Lower threshold HEAVY_RAINFALL_24H is NOT triggered (mutually exclusive band)'
    );

    // ---------------------------------------------------------------------------
    // 4. Guarantee zero database mutations (pure evaluation)
    // ---------------------------------------------------------------------------
    const finalAssessments = await prisma.riskAssessment.count();
    const finalEvents = await prisma.riskEvent.count();

    assert(finalAssessments === initialAssessments, '4.1 Rule engine performed zero writes to risk_assessments table');
    assert(finalEvents === initialEvents, '4.2 Rule engine performed zero writes to risk_events table');
  } finally {
    // Zero mutations were made, no teardown needed
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Rule Engine Integration Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runRuleEngineIntegrationTests().catch((err) => {
  console.error('Fatal error during rule engine integration test:', err);
  process.exit(1);
});
