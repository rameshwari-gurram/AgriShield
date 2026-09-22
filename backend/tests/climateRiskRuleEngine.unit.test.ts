/**
 * Module 6 Stage 3: Climate Risk Rule Engine Unit Test Suite
 * Pure unit tests verifying all 36 required rule engine behaviors:
 * 24h rainfall bands, 3h rainfall intensity bands, completeness handling,
 * multi-group independence, future rule support, metadata fidelity, and edge cases.
 */

import { climateRiskRuleEngine } from '../src/services/climateRiskRuleEngine.service.js';
import { INITIAL_IMD_RISK_RULES } from '../src/config/initialRiskRules.js';
import { WeatherAggregationResult } from '../src/types/weather.types.js';
import {
  RiskRuleEvaluationInput,
  RiskHazardType,
  RiskMeasurement,
  RiskSeverity,
  RiskSourceType,
} from '../src/types/risk.types.js';

function createMockWeather(overrides?: Partial<WeatherAggregationResult>): WeatherAggregationResult {
  return {
    farmId: 'test-farm-uuid',
    observationStart: new Date('2026-09-21T00:00:00Z'),
    observationEnd: new Date('2026-09-21T23:00:00Z'),
    recordCount: 24,
    totalRainfall24h: 0,
    maximumRolling3hRainfall: 0,
    maximumTemperatureC: 28.0,
    maximumWindSpeedKmh: 15.0,
    maximumWindGustKmh: 22.0,
    complete24hWindow: true,
    complete3hWindow: true,
    threeHourWindowEnd: new Date('2026-09-21T12:00:00Z'),
    ...overrides,
  };
}

// 24h rainfall rules subset from INITIAL_IMD_RISK_RULES
const rules24h: RiskRuleEvaluationInput[] = INITIAL_IMD_RISK_RULES.filter(
  (r) => r.observationWindow === '24_HOURS'
);

// 3h rainfall rules subset from INITIAL_IMD_RISK_RULES
const rules3h: RiskRuleEvaluationInput[] = INITIAL_IMD_RISK_RULES.filter(
  (r) => r.observationWindow === '3_HOURS'
);

// All 7 IMD rules
const all7Rules: RiskRuleEvaluationInput[] = [...INITIAL_IMD_RISK_RULES];

function runRuleEngineUnitTests() {
  console.log('🧪 Running Module 6 Stage 3: Climate Risk Rule Engine Unit Tests...\n');

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

  // ===========================================================================
  // 1. 24-Hour Rainfall Rules (Tests 1 - 7)
  // ===========================================================================
  // 1. Below 64.5 -> no trigger
  {
    const weather = createMockWeather({ totalRainfall24h: 45.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules24h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 0, '1.1 Rainfall 45.0 mm (< 64.5 mm) triggers zero rules');
    assert(results.every((r) => r.status === 'NOT_TRIGGERED'), '1.2 All rules marked NOT_TRIGGERED');
  }

  // 2. Exactly 64.5 -> Heavy
  {
    const weather = createMockWeather({ totalRainfall24h: 64.5 });
    const results = climateRiskRuleEngine.evaluate(weather, rules24h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1, '2.1 Rainfall exactly 64.5 mm triggers exactly 1 rule');
    assert(triggered[0].ruleCode === 'HEAVY_RAINFALL_24H', '2.2 Triggered rule is HEAVY_RAINFALL_24H');
  }

  // 3. 64.51 -> Heavy
  {
    const weather = createMockWeather({ totalRainfall24h: 64.51 });
    const results = climateRiskRuleEngine.evaluate(weather, rules24h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1 && triggered[0].ruleCode === 'HEAVY_RAINFALL_24H', '3. Rainfall 64.51 mm triggers HEAVY_RAINFALL_24H');
  }

  // 4. Exactly 115.6 -> Very Heavy
  {
    const weather = createMockWeather({ totalRainfall24h: 115.6 });
    const results = climateRiskRuleEngine.evaluate(weather, rules24h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1, '4.1 Rainfall exactly 115.6 mm triggers exactly 1 rule');
    assert(triggered[0].ruleCode === 'VERY_HEAVY_RAINFALL_24H', '4.2 Triggered rule is VERY_HEAVY_RAINFALL_24H');
  }

  // 5. 130 -> Very Heavy only (verify lower threshold 64.5 is NOT simultaneously triggered)
  {
    const weather = createMockWeather({ totalRainfall24h: 130.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules24h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1, '5.1 Rainfall 130.0 mm triggers ONLY 1 rule (mutually exclusive)');
    assert(triggered[0].ruleCode === 'VERY_HEAVY_RAINFALL_24H', '5.2 Triggered rule is VERY_HEAVY_RAINFALL_24H');

    const heavyRule = results.find((r) => r.ruleCode === 'HEAVY_RAINFALL_24H');
    assert(heavyRule?.triggered === false, '5.3 Lower threshold HEAVY_RAINFALL_24H is NOT triggered');
    assert(heavyRule?.explanation.includes('superseded by higher classification'), '5.4 Lower threshold explanation notes it was superseded');
  }

  // 6. Exactly 204.5 -> Extreme
  {
    const weather = createMockWeather({ totalRainfall24h: 204.5 });
    const results = climateRiskRuleEngine.evaluate(weather, rules24h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1, '6.1 Rainfall exactly 204.5 mm triggers exactly 1 rule');
    assert(triggered[0].ruleCode === 'EXTREME_RAINFALL_24H', '6.2 Triggered rule is EXTREME_RAINFALL_24H');
  }

  // 7. 250 -> Extreme only (lower thresholds are not simultaneously triggered)
  {
    const weather = createMockWeather({ totalRainfall24h: 250.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules24h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1, '7.1 Rainfall 250.0 mm triggers ONLY 1 rule');
    assert(triggered[0].ruleCode === 'EXTREME_RAINFALL_24H', '7.2 Triggered rule is EXTREME_RAINFALL_24H');

    const veryHeavy = results.find((r) => r.ruleCode === 'VERY_HEAVY_RAINFALL_24H');
    const heavy = results.find((r) => r.ruleCode === 'HEAVY_RAINFALL_24H');
    assert(veryHeavy?.triggered === false && heavy?.triggered === false, '7.3 Lower thresholds are NOT triggered');
  }

  // ===========================================================================
  // 2. 3-Hour Rainfall Rules (Tests 8 - 15)
  // ===========================================================================
  // 8. Below 20 -> no trigger
  {
    const weather = createMockWeather({ maximumRolling3hRainfall: 14.5 });
    const results = climateRiskRuleEngine.evaluate(weather, rules3h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 0, '8. 3h rainfall 14.5 mm (< 20 mm) triggers zero rules');
  }

  // 9. Exactly 20 -> Intense
  {
    const weather = createMockWeather({ maximumRolling3hRainfall: 20.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules3h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1 && triggered[0].ruleCode === 'INTENSE_RAINFALL_3H', '9. Exactly 20.0 mm triggers INTENSE_RAINFALL_3H');
  }

  // 10. Exactly 30 -> Very Intense
  {
    const weather = createMockWeather({ maximumRolling3hRainfall: 30.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules3h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1 && triggered[0].ruleCode === 'VERY_INTENSE_RAINFALL_3H', '10. Exactly 30.0 mm triggers VERY_INTENSE_RAINFALL_3H');
  }

  // 11. Exactly 50 -> Extremely Intense
  {
    const weather = createMockWeather({ maximumRolling3hRainfall: 50.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules3h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1 && triggered[0].ruleCode === 'EXTREMELY_INTENSE_RAINFALL_3H', '11. Exactly 50.0 mm triggers EXTREMELY_INTENSE_RAINFALL_3H');
  }

  // 12. Exactly 100 -> Exceptionally Heavy
  {
    const weather = createMockWeather({ maximumRolling3hRainfall: 100.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules3h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1 && triggered[0].ruleCode === 'EXCEPTIONALLY_HEAVY_RAINFALL_3H', '12. Exactly 100.0 mm triggers EXCEPTIONALLY_HEAVY_RAINFALL_3H');
  }

  // 13. 35 -> Very Intense only
  {
    const weather = createMockWeather({ maximumRolling3hRainfall: 35.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules3h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1, '13.1 Rainfall 35.0 mm triggers only 1 rule');
    assert(triggered[0].ruleCode === 'VERY_INTENSE_RAINFALL_3H', '13.2 Triggered rule is VERY_INTENSE_RAINFALL_3H');
    const lower = results.find((r) => r.ruleCode === 'INTENSE_RAINFALL_3H');
    assert(lower?.triggered === false, '13.3 Lower INTENSE_RAINFALL_3H is NOT triggered');
  }

  // 14. 75 -> Extremely Intense only
  {
    const weather = createMockWeather({ maximumRolling3hRainfall: 75.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules3h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1 && triggered[0].ruleCode === 'EXTREMELY_INTENSE_RAINFALL_3H', '14. Rainfall 75.0 mm triggers EXTREMELY_INTENSE_RAINFALL_3H only');
  }

  // 15. 150 -> Exceptionally Heavy only
  {
    const weather = createMockWeather({ maximumRolling3hRainfall: 150.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules3h);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1 && triggered[0].ruleCode === 'EXCEPTIONALLY_HEAVY_RAINFALL_3H', '15. Rainfall 150.0 mm triggers EXCEPTIONALLY_HEAVY_RAINFALL_3H only');
  }

  // ===========================================================================
  // 3. Completeness (Tests 16 - 19)
  // ===========================================================================
  // 16. Incomplete 24h window -> insufficient data
  {
    const weather = createMockWeather({ totalRainfall24h: 120.0, complete24hWindow: false });
    const results = climateRiskRuleEngine.evaluate(weather, rules24h);
    assert(results.every((r) => r.status === 'INSUFFICIENT_DATA'), '16.1 All 24h rules marked INSUFFICIENT_DATA when complete24hWindow = false');
    assert(results.every((r) => r.triggered === false), '16.2 Zero rules triggered when incomplete 24h window');
    assert(results[0].explanation.includes('complete 24-hour observation window'), '16.3 Explanations report incomplete window limitation');
  }

  // 17. Incomplete 3h window -> insufficient data
  {
    const weather = createMockWeather({ maximumRolling3hRainfall: 80.0, complete3hWindow: false });
    const results = climateRiskRuleEngine.evaluate(weather, rules3h);
    assert(results.every((r) => r.status === 'INSUFFICIENT_DATA'), '17.1 All 3h rules marked INSUFFICIENT_DATA when complete3hWindow = false');
    assert(results.every((r) => r.triggered === false), '17.2 Zero rules triggered when incomplete 3h window');
  }

  // 18. Complete 24h window -> rainfall rules evaluate normally
  {
    const weather = createMockWeather({ totalRainfall24h: 80.0, complete24hWindow: true });
    const results = climateRiskRuleEngine.evaluate(weather, rules24h);
    assert(results.some((r) => r.status === 'TRIGGERED'), '18. Complete 24h window evaluated normally with trigger');
  }

  // 19. Complete 3h window -> rainfall rules evaluate normally
  {
    const weather = createMockWeather({ maximumRolling3hRainfall: 40.0, complete3hWindow: true });
    const results = climateRiskRuleEngine.evaluate(weather, rules3h);
    assert(results.some((r) => r.status === 'TRIGGERED'), '19. Complete 3h window evaluated normally with trigger');
  }

  // ===========================================================================
  // 4. Multiple Groups (Tests 20 - 22)
  // ===========================================================================
  // 20. Valid 24h and 3h measurements -> both groups evaluated independently
  {
    const weather = createMockWeather({
      totalRainfall24h: 130.0, // Should trigger VERY_HEAVY_RAINFALL_24H
      maximumRolling3hRainfall: 60.0, // Should trigger EXTREMELY_INTENSE_RAINFALL_3H
      complete24hWindow: true,
      complete3hWindow: true,
    });
    const results = climateRiskRuleEngine.evaluate(weather, all7Rules);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 2, '20.1 Both 24h and 3h rule groups produce independent triggered classifications (count: 2)');
    const codes = triggered.map((r) => r.ruleCode).sort();
    assert(
      codes[0] === 'EXTREMELY_INTENSE_RAINFALL_3H' && codes[1] === 'VERY_HEAVY_RAINFALL_24H',
      '20.2 Correct rules triggered across distinct observation window groups'
    );
  }

  // 21. Incomplete 24h but complete 3h -> only 3h group can produce a valid classification
  {
    const weather = createMockWeather({
      totalRainfall24h: 130.0,
      maximumRolling3hRainfall: 60.0,
      complete24hWindow: false,
      complete3hWindow: true,
    });
    const results = climateRiskRuleEngine.evaluate(weather, all7Rules);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1, '21.1 Exactly 1 rule triggered');
    assert(triggered[0].ruleCode === 'EXTREMELY_INTENSE_RAINFALL_3H', '21.2 Only 3h rule triggered');
    const r24h = results.filter((r) => r.observationWindow === '24_HOURS');
    assert(r24h.every((r) => r.status === 'INSUFFICIENT_DATA'), '21.3 All 24h rules marked INSUFFICIENT_DATA');
  }

  // 22. Complete 24h but incomplete 3h -> only 24h group can produce a valid classification
  {
    const weather = createMockWeather({
      totalRainfall24h: 130.0,
      maximumRolling3hRainfall: 60.0,
      complete24hWindow: true,
      complete3hWindow: false,
    });
    const results = climateRiskRuleEngine.evaluate(weather, all7Rules);
    const triggered = results.filter((r) => r.triggered);
    assert(triggered.length === 1, '22.1 Exactly 1 rule triggered');
    assert(triggered[0].ruleCode === 'VERY_HEAVY_RAINFALL_24H', '22.2 Only 24h rule triggered');
    const r3h = results.filter((r) => r.observationWindow === '3_HOURS');
    assert(r3h.every((r) => r.status === 'INSUFFICIENT_DATA'), '22.3 All 3h rules marked INSUFFICIENT_DATA');
  }

  // ===========================================================================
  // 5. Future-Rule Support (Tests 23 - 25)
  // (In-memory test rules with PROJECT_INDICATOR, clearly labeled)
  // ===========================================================================
  // 23. Temperature rule mapping works when explicitly supplied
  {
    const testTempRule: RiskRuleEvaluationInput = {
      code: 'TEST_HIGH_TEMP_40C',
      name: 'Test High Temperature',
      hazardType: RiskHazardType.HIGH_TEMPERATURE,
      measurement: RiskMeasurement.TEMPERATURE,
      threshold: 40.0,
      thresholdUnit: 'C',
      observationWindow: 'INSTANTANEOUS',
      severity: RiskSeverity.HIGH,
      sourceType: RiskSourceType.PROJECT_INDICATOR,
      sourceReference: 'Test configuration threshold for temperature mapping',
      isActive: true,
    };
    const weatherTrigger = createMockWeather({ maximumTemperatureC: 42.5 });
    const resTrigger = climateRiskRuleEngine.evaluate(weatherTrigger, [testTempRule]);
    assert(resTrigger[0].triggered === true, '23.1 Temperature 42.5 °C triggers test temperature rule (>= 40.0 °C)');
    assert(resTrigger[0].observedValue === 42.5, '23.2 Observed temperature accurately passed');

    const weatherNoTrigger = createMockWeather({ maximumTemperatureC: 36.0 });
    const resNoTrigger = climateRiskRuleEngine.evaluate(weatherNoTrigger, [testTempRule]);
    assert(resNoTrigger[0].triggered === false, '23.3 Temperature 36.0 °C does not trigger test temperature rule');
  }

  // 24. Wind-speed rule mapping works when explicitly supplied
  {
    const testWindRule: RiskRuleEvaluationInput = {
      code: 'TEST_STRONG_WIND_50KMH',
      name: 'Test Strong Wind',
      hazardType: RiskHazardType.STRONG_WIND,
      measurement: RiskMeasurement.WIND_SPEED,
      threshold: 50.0,
      thresholdUnit: 'KM_H',
      observationWindow: 'INSTANTANEOUS',
      severity: RiskSeverity.HIGH,
      sourceType: RiskSourceType.PROJECT_INDICATOR,
      sourceReference: 'Test configuration threshold for wind speed mapping',
      isActive: true,
    };
    const weather = createMockWeather({ maximumWindSpeedKmh: 55.0 });
    const res = climateRiskRuleEngine.evaluate(weather, [testWindRule]);
    assert(res[0].triggered === true, '24.1 Wind speed 55.0 km/h triggers test wind speed rule');
    assert(res[0].observedValue === 55.0, '24.2 Observed wind speed accurately passed');
  }

  // 25. Wind-gust rule mapping works when explicitly supplied
  {
    const testGustRule: RiskRuleEvaluationInput = {
      code: 'TEST_STRONG_GUST_70KMH',
      name: 'Test Strong Gust',
      hazardType: RiskHazardType.STRONG_WIND,
      measurement: RiskMeasurement.WIND_GUST,
      threshold: 70.0,
      thresholdUnit: 'KM_H',
      observationWindow: 'INSTANTANEOUS',
      severity: RiskSeverity.VERY_HIGH,
      sourceType: RiskSourceType.PROJECT_INDICATOR,
      sourceReference: 'Test configuration threshold for wind gust mapping',
      isActive: true,
    };
    const weather = createMockWeather({ maximumWindGustKmh: 78.5 });
    const res = climateRiskRuleEngine.evaluate(weather, [testGustRule]);
    assert(res[0].triggered === true, '25.1 Wind gust 78.5 km/h triggers test wind gust rule');
    assert(res[0].observedValue === 78.5, '25.2 Observed wind gust accurately passed');
  }

  // ===========================================================================
  // 6. Rule Metadata Fidelity (Tests 26 - 30)
  // ===========================================================================
  {
    const weather = createMockWeather({ totalRainfall24h: 70.0 });
    const results = climateRiskRuleEngine.evaluate(weather, rules24h);
    const heavy = results.find((r) => r.ruleCode === 'HEAVY_RAINFALL_24H')!;

    // 26. sourceType preserved
    assert(heavy.sourceType === 'OFFICIAL_REFERENCE', '26. Rule sourceType preserved as OFFICIAL_REFERENCE');

    // 27. sourceReference preserved
    assert(heavy.sourceReference.includes('India Meteorological Department'), '27. Rule sourceReference preserved');

    // 28. threshold preserved
    assert(heavy.threshold === 64.5, '28. Rule threshold preserved accurately (64.5)');

    // 29. threshold unit preserved
    assert(heavy.thresholdUnit === 'MM', '29. Rule thresholdUnit preserved as MM');

    // 30. observation window preserved
    assert(heavy.observationWindow === '24_HOURS', '30. Rule observationWindow preserved as 24_HOURS');
  }

  // ===========================================================================
  // 7. Edge Cases (Tests 31 - 36)
  // ===========================================================================
  // 31. Empty rule list
  {
    const weather = createMockWeather({ totalRainfall24h: 100.0 });
    const results = climateRiskRuleEngine.evaluate(weather, []);
    assert(Array.isArray(results) && results.length === 0, '31. Empty rule list returns empty evaluation array');
  }

  // 32. Inactive rules ignored
  {
    const weather = createMockWeather({ totalRainfall24h: 70.0 });
    const inactiveRule: RiskRuleEvaluationInput = {
      ...rules24h[0],
      isActive: false,
    };
    const results = climateRiskRuleEngine.evaluate(weather, [inactiveRule]);
    assert(results.length === 0, '32. Inactive rule (isActive: false) ignored and produces 0 evaluations');
  }

  // 33. Exact threshold boundary comparisons
  {
    // 64.49 -> no trigger
    const w6449 = createMockWeather({ totalRainfall24h: 64.49 });
    const r6449 = climateRiskRuleEngine.evaluate(w6449, rules24h);
    assert(r6449.every((r) => !r.triggered), '33.1 64.49 mm does NOT trigger 64.5 mm threshold');

    // 64.50 -> triggers Heavy
    const w6450 = createMockWeather({ totalRainfall24h: 64.5 });
    const r6450 = climateRiskRuleEngine.evaluate(w6450, rules24h);
    assert(r6450.find((r) => r.ruleCode === 'HEAVY_RAINFALL_24H')?.triggered === true, '33.2 64.50 mm triggers Heavy');

    // 115.59 -> Heavy only
    const w11559 = createMockWeather({ totalRainfall24h: 115.59 });
    const r11559 = climateRiskRuleEngine.evaluate(w11559, rules24h);
    assert(r11559.find((r) => r.ruleCode === 'HEAVY_RAINFALL_24H')?.triggered === true, '33.3 115.59 mm triggers Heavy only');
    assert(r11559.find((r) => r.ruleCode === 'VERY_HEAVY_RAINFALL_24H')?.triggered === false, '33.4 115.59 mm does NOT trigger Very Heavy');

    // 115.60 -> triggers Very Heavy only
    const w11560 = createMockWeather({ totalRainfall24h: 115.6 });
    const r11560 = climateRiskRuleEngine.evaluate(w11560, rules24h);
    assert(r11560.find((r) => r.ruleCode === 'VERY_HEAVY_RAINFALL_24H')?.triggered === true, '33.5 115.60 mm triggers Very Heavy only');

    // 204.49 -> Very Heavy only
    const w20449 = createMockWeather({ totalRainfall24h: 204.49 });
    const r20449 = climateRiskRuleEngine.evaluate(w20449, rules24h);
    assert(r20449.find((r) => r.ruleCode === 'VERY_HEAVY_RAINFALL_24H')?.triggered === true, '33.6 204.49 mm triggers Very Heavy only');
    assert(r20449.find((r) => r.ruleCode === 'EXTREME_RAINFALL_24H')?.triggered === false, '33.7 204.49 mm does NOT trigger Extreme');

    // 204.50 -> triggers Extreme only
    const w20450 = createMockWeather({ totalRainfall24h: 204.5 });
    const r20450 = climateRiskRuleEngine.evaluate(w20450, rules24h);
    assert(r20450.find((r) => r.ruleCode === 'EXTREME_RAINFALL_24H')?.triggered === true, '33.8 204.50 mm triggers Extreme only');
  }

  // 34. Invalid negative rainfall rejected
  {
    let rejected = false;
    try {
      const invalidWeather = createMockWeather({ totalRainfall24h: -5.0 });
      climateRiskRuleEngine.evaluate(invalidWeather, rules24h);
    } catch (err: any) {
      rejected = err.statusCode === 400;
    }
    assert(rejected, '34. Invalid negative rainfall throws 400 Bad Request');
  }

  // 35. Unsorted rules produce the exact same result as sorted rules
  {
    const weather = createMockWeather({ totalRainfall24h: 130.0 });
    // Pass rules in reverse or scrambled order
    const scrambledRules = [rules24h[0], rules24h[2], rules24h[1]];
    const resScrambled = climateRiskRuleEngine.evaluate(weather, scrambledRules);
    const resNormal = climateRiskRuleEngine.evaluate(weather, rules24h);

    const triggeredScrambled = resScrambled.find((r) => r.triggered)?.ruleCode;
    const triggeredNormal = resNormal.find((r) => r.triggered)?.ruleCode;
    assert(triggeredScrambled === triggeredNormal, '35. Scrambled input rules produce identical triggered classification as sorted input');
  }

  // 36. Duplicate rule configuration handled deterministically
  {
    const weather = createMockWeather({ totalRainfall24h: 70.0 });
    // Pass duplicate rules in input array
    const duplicateRules = [...rules24h, rules24h[0], rules24h[1]];
    const res = climateRiskRuleEngine.evaluate(weather, duplicateRules);
    assert(res.length === 3, '36. Duplicate rule entries deduplicated deterministically (returns exactly 3 unique rule outcomes)');
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Climate Risk Rule Engine Unit Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

try {
  runRuleEngineUnitTests();
} catch (err) {
  console.error('Fatal error during rule engine unit tests:', err);
  process.exit(1);
}
