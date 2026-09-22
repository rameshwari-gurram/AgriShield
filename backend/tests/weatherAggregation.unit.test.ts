/**
 * Module 6 Stage 2: Weather Aggregation Service Unit Tests
 * Pure unit tests covering all 31 required aggregation behaviors:
 * 24h rainfall sums, rolling 3h rainfall maxes, completeness flags,
 * timestamp semantics, wind/temp semantics, and edge cases.
 */

import { weatherAggregationService } from '../src/services/weatherAggregation.service.js';
import { WeatherRecordInput } from '../src/types/weather.types.js';

function createHourlyRecord(
  observedAt: string,
  overrides?: Partial<WeatherRecordInput>
): WeatherRecordInput {
  return {
    observedAt: new Date(observedAt),
    rainfallMm: 0,
    temperatureC: 25.0,
    windSpeedKmh: 10.0,
    windGustKmh: 15.0,
    ...overrides,
  };
}

function createConsecutiveHours(
  startIso: string,
  count: number,
  recordFn?: (index: number) => Partial<WeatherRecordInput>
): WeatherRecordInput[] {
  const start = new Date(startIso);
  const result: WeatherRecordInput[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(start.getTime() + i * 3600000);
    const overrides = recordFn ? recordFn(i) : {};
    result.push(createHourlyRecord(t.toISOString(), overrides));
  }
  return result;
}

function runAggregationUnitTests() {
  console.log('🧪 Running Module 6 Stage 2: Weather Aggregation Unit Tests...\n');

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

  const dummyFarmId = 'farm-test-uuid-001';

  // ===========================================================================
  // Basic Aggregation (Tests 1 - 5)
  // ===========================================================================
  // 1. 24-hour rainfall sum
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => ({
      rainfallMm: 2.5,
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.totalRainfall24h === 60.0, `1. 24-hour rainfall sum correctly calculated as 60.0 mm (got ${res.totalRainfall24h})`);
  }

  // 2. Maximum temperature
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => ({
      temperatureC: i === 14 ? 38.6 : 24.0,
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.maximumTemperatureC === 38.6, `2. Maximum temperature correctly identified as 38.6 °C (got ${res.maximumTemperatureC})`);
  }

  // 3. Maximum wind speed
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => ({
      windSpeedKmh: i === 8 ? 48.5 : 12.0,
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.maximumWindSpeedKmh === 48.5, `3. Maximum wind speed correctly identified as 48.5 km/h (got ${res.maximumWindSpeedKmh})`);
  }

  // 4. Maximum wind gust
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => ({
      windGustKmh: i === 18 ? 72.4 : 20.0,
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.maximumWindGustKmh === 72.4, `4. Maximum wind gust correctly identified as 72.4 km/h (got ${res.maximumWindGustKmh})`);
  }

  // 5. Maximum rolling 3-hour rainfall
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => {
      if (i === 10) return { rainfallMm: 12.0 };
      if (i === 11) return { rainfallMm: 18.5 };
      if (i === 12) return { rainfallMm: 14.5 };
      return { rainfallMm: 1.0 };
    });
    // Peak window is hours 10, 11, 12 => 12.0 + 18.5 + 14.5 = 45.0 mm
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.maximumRolling3hRainfall === 45.0, `5. Maximum rolling 3-hour rainfall correctly calculated as 45.0 mm (got ${res.maximumRolling3hRainfall})`);
  }

  // ===========================================================================
  // Window Behavior (Tests 6 - 14)
  // ===========================================================================
  // 6. Exact 24-hour complete window
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24);
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.complete24hWindow === true, '6. Exact 24 consecutive hourly observations flags complete24hWindow = true');
  }

  // 7. Exact 3-hour complete window
  {
    const records = createConsecutiveHours('2026-09-21T10:00:00Z', 3, (i) => ({
      rainfallMm: 5.0,
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.complete3hWindow === true, '7.1 Exact 3 consecutive hourly observations flags complete3hWindow = true');
    assert(res.maximumRolling3hRainfall === 15.0, '7.2 Rolling 3-hour rainfall sum is 15.0 mm');
    assert(
      res.threeHourWindowEnd?.toISOString() === new Date('2026-09-21T12:00:00Z').toISOString(),
      '7.3 threeHourWindowEnd matches the 3rd hour timestamp (12:00:00Z)'
    );
  }

  // 8. Missing hourly record
  {
    // 24 records but hour 15 is missing, substituted by a later hour
    const records: WeatherRecordInput[] = [];
    const base = new Date('2026-09-21T00:00:00Z').getTime();
    for (let i = 0; i < 25; i++) {
      if (i === 15) continue; // Skip hour 15
      records.push(createHourlyRecord(new Date(base + i * 3600000).toISOString()));
    }
    // Total records is 24, but hour 15 is missing
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId, new Date(base + 24 * 3600000));
    assert(res.complete24hWindow === false, '8. Missing intermediate hour (gap at 15:00) marks complete24hWindow = false');
  }

  // 9. Incomplete 24-hour window (fewer records)
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 18);
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.complete24hWindow === false, '9. Only 18 hourly records marks complete24hWindow = false');
  }

  // 10. Incomplete 3-hour window
  {
    // 3 records but with a gap: 10:00, 12:00, 13:00 (11:00 is missing)
    const records = [
      createHourlyRecord('2026-09-21T10:00:00Z', { rainfallMm: 5.0 }),
      createHourlyRecord('2026-09-21T12:00:00Z', { rainfallMm: 10.0 }),
      createHourlyRecord('2026-09-21T13:00:00Z', { rainfallMm: 8.0 }),
    ];
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.complete3hWindow === false, '10.1 Gap in 3-hour sequence (10:00 to 12:00) marks complete3hWindow = false');
    assert(res.maximumRolling3hRainfall === 0, '10.2 Incomplete 3-hour window produces maximumRolling3hRainfall = 0');
    assert(res.threeHourWindowEnd === null, '10.3 Incomplete 3-hour window produces threeHourWindowEnd = null');
  }

  // 11. Multiple rolling 3-hour windows
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 6, (i) => ({
      rainfallMm: [2.0, 4.0, 6.0, 8.0, 10.0, 12.0][i],
    }));
    // Window 0 (0-2): 2+4+6 = 12
    // Window 1 (1-3): 4+6+8 = 18
    // Window 2 (2-4): 6+8+10 = 24
    // Window 3 (3-5): 8+10+12 = 30
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.complete3hWindow === true, '11.1 Multiple rolling 3-hour windows evaluated');
    assert(res.maximumRolling3hRainfall === 30.0, '11.2 Maximum of 4 rolling windows correctly found as 30.0 mm');
    assert(
      res.threeHourWindowEnd?.toISOString() === new Date('2026-09-21T05:00:00Z').toISOString(),
      '11.3 Window end matches hour 5'
    );
  }

  // 12. Maximum 3-hour window occurs in the middle of dataset
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => {
      if (i === 11) return { rainfallMm: 20.0 };
      if (i === 12) return { rainfallMm: 30.0 };
      if (i === 13) return { rainfallMm: 25.0 };
      return { rainfallMm: 1.0 };
    });
    // Peak window is hours 11, 12, 13 (sum = 75.0), ending at hour 13
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.maximumRolling3hRainfall === 75.0, '12.1 Peak in middle calculated as 75.0 mm');
    assert(
      res.threeHourWindowEnd?.toISOString() === new Date('2026-09-21T13:00:00Z').toISOString(),
      '12.2 Peak in middle ends at hour 13 (2026-09-21T13:00:00Z)'
    );
  }

  // 13. Maximum 3-hour window occurs at the beginning
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => {
      if (i === 0) return { rainfallMm: 20.0 };
      if (i === 1) return { rainfallMm: 30.0 };
      if (i === 2) return { rainfallMm: 25.0 };
      return { rainfallMm: 1.0 };
    });
    // Peak window is hours 0, 1, 2 (sum = 75.0), ending at hour 2
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.maximumRolling3hRainfall === 75.0, '13.1 Peak at beginning calculated as 75.0 mm');
    assert(
      res.threeHourWindowEnd?.toISOString() === new Date('2026-09-21T02:00:00Z').toISOString(),
      '13.2 Peak at beginning ends at hour 2 (2026-09-21T02:00:00Z)'
    );
  }

  // 14. Maximum 3-hour window occurs at the end
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => {
      if (i === 21) return { rainfallMm: 20.0 };
      if (i === 22) return { rainfallMm: 30.0 };
      if (i === 23) return { rainfallMm: 25.0 };
      return { rainfallMm: 1.0 };
    });
    // Peak window is hours 21, 22, 23 (sum = 75.0), ending at hour 23
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.maximumRolling3hRainfall === 75.0, '14.1 Peak at end calculated as 75.0 mm');
    assert(
      res.threeHourWindowEnd?.toISOString() === new Date('2026-09-21T23:00:00Z').toISOString(),
      '14.2 Peak at end ends at hour 23 (2026-09-21T23:00:00Z)'
    );
  }

  // ===========================================================================
  // Timestamp Behavior (Tests 15 - 18)
  // ===========================================================================
  // 15. Unsorted input records
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => ({
      rainfallMm: i,
    }));
    // Reverse array
    const reversed = [...records].reverse();
    const res = weatherAggregationService.aggregateRecords(reversed, dummyFarmId);
    assert(res.recordCount === 24, '15.1 Reverse-ordered input correctly sorted and counted');
    assert(res.complete24hWindow === true, '15.2 Reverse-ordered input recognized as complete 24h window after internal sort');
    assert(
      res.observationStart?.toISOString() === new Date('2026-09-21T00:00:00Z').toISOString(),
      '15.3 observationStart is earliest timestamp'
    );
    assert(
      res.observationEnd?.toISOString() === new Date('2026-09-21T23:00:00Z').toISOString(),
      '15.4 observationEnd is latest timestamp'
    );
  }

  // 16. UTC timestamp handling
  {
    const records = [
      createHourlyRecord('2026-09-21T10:00:00Z', { rainfallMm: 2.0 }),
      createHourlyRecord('2026-09-21T11:00:00Z', { rainfallMm: 3.0 }),
      createHourlyRecord('2026-09-21T12:00:00Z', { rainfallMm: 4.0 }),
    ];
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.observationStart?.getUTCHours() === 10, '16.1 UTC hours preserved deterministically (start: 10:00 UTC)');
    assert(res.observationEnd?.getUTCHours() === 12, '16.2 UTC hours preserved deterministically (end: 12:00 UTC)');
    assert(res.threeHourWindowEnd?.getUTCHours() === 12, '16.3 threeHourWindowEnd in UTC matches 12:00 UTC');
  }

  // 17. Deterministic reference time
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 30, (i) => ({
      rainfallMm: 1.0,
    }));
    // Anchor reference time at 2026-09-21T23:00:00Z
    const ref = new Date('2026-09-21T23:00:00Z');
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId, ref);
    assert(res.recordCount === 24, `17.1 Reference time limits window to 24 records (got ${res.recordCount})`);
    assert(res.totalRainfall24h === 24.0, `17.2 24h sum under reference time is 24.0 (got ${res.totalRainfall24h})`);
    assert(res.observationEnd?.toISOString() === ref.toISOString(), '17.3 observationEnd matches explicit referenceTime');
  }

  // 18. Records outside the requested window are ignored
  {
    const base = new Date('2026-09-21T12:00:00Z');
    // Add 1 record from 30 hours ago, 24 records inside window, and 1 record 2 hours in the future
    const records: WeatherRecordInput[] = [
      createHourlyRecord('2026-09-20T06:00:00Z', { rainfallMm: 99.0 }), // 30h ago (outside)
      createHourlyRecord('2026-09-20T12:00:00Z', { rainfallMm: 50.0 }), // Exactly 24h ago (rainfall for 11h-12h, outside (T-24h, T])
      ...createConsecutiveHours('2026-09-20T13:00:00Z', 24, () => ({ rainfallMm: 2.0 })), // exactly in window
      createHourlyRecord('2026-09-21T14:00:00Z', { rainfallMm: 88.0 }), // future relative to ref (outside)
    ];
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId, base);
    assert(res.recordCount === 24, `18.1 Exactly 24 records within the (T-24h, T] window included (got ${res.recordCount})`);
    assert(res.totalRainfall24h === 48.0, `18.2 Total rainfall excluded outside records (got ${res.totalRainfall24h}, expected 48.0)`);
    assert(res.complete24hWindow === true, '18.3 Clean 24h window verified after filtering outside records');
  }

  // ===========================================================================
  // Rainfall Semantics (Tests 19 - 22)
  // ===========================================================================
  // 19. Zero rainfall values
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, () => ({
      rainfallMm: 0.0,
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.totalRainfall24h === 0.0, '19.1 24-hour total rainfall is 0.0 mm');
    assert(res.maximumRolling3hRainfall === 0.0, '19.2 Rolling 3-hour maximum rainfall is 0.0 mm');
    assert(res.complete24hWindow === true, '19.3 Complete 24h window preserved even with zero rainfall');
  }

  // 20. Decimal rainfall values
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => ({
      rainfallMm: i % 2 === 0 ? 1.35 : 2.65,
    }));
    // 12 * 1.35 + 12 * 2.65 = 12 * 4.00 = 48.00
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.totalRainfall24h === 48.0, `20. Decimal precision sum preserves accuracy: 48.0 mm (got ${res.totalRainfall24h})`);
  }

  // 21. Rainfall is summed rather than averaged
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, () => ({
      rainfallMm: 5.0,
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.totalRainfall24h === 120.0, `21. Total rainfall is 120.0 mm (summed), NOT 5.0 mm (averaged)`);
  }

  // 22. Missing rainfall is not converted to zero
  {
    // Dataset of only 2 records, gap of 4 hours
    const records = [
      createHourlyRecord('2026-09-21T00:00:00Z', { rainfallMm: 10.0 }),
      createHourlyRecord('2026-09-21T04:00:00Z', { rainfallMm: 15.0 }),
    ];
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.recordCount === 2, '22.1 Actual record count is 2 (missing hours not synthesized as 0-records)');
    assert(res.complete24hWindow === false, '22.2 complete24hWindow remains false');
    assert(res.complete3hWindow === false, '22.3 complete3hWindow remains false');
  }

  // ===========================================================================
  // Wind Semantics (Tests 23 - 25)
  // ===========================================================================
  // 23. Wind speed and gust remain separate
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => ({
      windSpeedKmh: 15.0,
      windGustKmh: 45.0,
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.maximumWindSpeedKmh === 15.0, '23.1 Maximum wind speed is 15.0 km/h (distinct from gust)');
    assert(res.maximumWindGustKmh === 45.0, '23.2 Maximum wind gust is 45.0 km/h (distinct from sustained speed)');
  }

  // 24. Maximum wind speed calculated correctly
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => ({
      windSpeedKmh: [10, 12, 14, 25, 30, 28, 15, 11, 9, 8, 7, 12, 16, 20, 22, 24, 18, 14, 10, 12, 15, 18, 19, 14][i],
      windGustKmh: 50.0, // Fixed high gust to ensure windSpeed isn't polluted by gust
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.maximumWindSpeedKmh === 30.0, `24. Peak sustained wind speed correctly identified as 30.0 km/h (got ${res.maximumWindSpeedKmh})`);
  }

  // 25. Maximum gust calculated correctly
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24, (i) => ({
      windSpeedKmh: 20.0,
      windGustKmh: [25, 28, 30, 35, 42, 65, 55, 40, 30, 25, 28, 30, 35, 38, 40, 42, 45, 48, 50, 45, 40, 35, 30, 25][i],
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.maximumWindGustKmh === 65.0, `25. Peak wind gust correctly identified as 65.0 km/h (got ${res.maximumWindGustKmh})`);
  }

  // ===========================================================================
  // Edge Cases (Tests 26 - 31)
  // ===========================================================================
  // 26. Fewer than 3 records
  {
    const records = createConsecutiveHours('2026-09-21T10:00:00Z', 2, (i) => ({
      rainfallMm: 10.0,
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.recordCount === 2, '26.1 Record count is 2');
    assert(res.complete3hWindow === false, '26.2 Fewer than 3 records flags complete3hWindow = false');
    assert(res.maximumRolling3hRainfall === 0, '26.3 maximumRolling3hRainfall is 0 when < 3 records');
    assert(res.threeHourWindowEnd === null, '26.4 threeHourWindowEnd is null when < 3 records');
  }

  // 27. Fewer than 24 records
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 23);
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.recordCount === 23, '27.1 Exactly 23 records counted');
    assert(res.complete24hWindow === false, '27.2 23 records marks complete24hWindow = false');
  }

  // 28. Exactly 3 records
  {
    const records = createConsecutiveHours('2026-09-21T10:00:00Z', 3, (i) => ({
      rainfallMm: [4.0, 6.0, 8.0][i],
    }));
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.recordCount === 3, '28.1 Exactly 3 records counted');
    assert(res.complete3hWindow === true, '28.2 Exactly 3 records marks complete3hWindow = true');
    assert(res.maximumRolling3hRainfall === 18.0, '28.3 3-hour sum is 18.0 mm (4+6+8)');
    assert(res.complete24hWindow === false, '28.4 complete24hWindow is false');
  }

  // 29. Exactly 24 records
  {
    const records = createConsecutiveHours('2026-09-21T00:00:00Z', 24);
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.recordCount === 24, '29.1 Exactly 24 records counted');
    assert(res.complete24hWindow === true, '29.2 Exactly 24 records marks complete24hWindow = true');
  }

  // 30. Records with gaps
  {
    // Block 1: 10:00, 11:00, 12:00 (sum: 30mm)
    // Gap: 3 hours
    // Block 2: 16:00, 17:00, 18:00 (sum: 50mm)
    const records = [
      createHourlyRecord('2026-09-21T10:00:00Z', { rainfallMm: 10.0 }),
      createHourlyRecord('2026-09-21T11:00:00Z', { rainfallMm: 10.0 }),
      createHourlyRecord('2026-09-21T12:00:00Z', { rainfallMm: 10.0 }),
      createHourlyRecord('2026-09-21T16:00:00Z', { rainfallMm: 15.0 }),
      createHourlyRecord('2026-09-21T17:00:00Z', { rainfallMm: 20.0 }),
      createHourlyRecord('2026-09-21T18:00:00Z', { rainfallMm: 15.0 }),
    ];
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.complete3hWindow === true, '30.1 Valid 3-hour window found despite gap between blocks');
    assert(res.maximumRolling3hRainfall === 50.0, '30.2 Correctly identified peak rolling 3-hour window across gap (50.0 mm)');
    assert(
      res.threeHourWindowEnd?.toISOString() === new Date('2026-09-21T18:00:00Z').toISOString(),
      '30.3 threeHourWindowEnd points to end of peak block (18:00:00Z)'
    );
    assert(res.complete24hWindow === false, '30.4 Incomplete 24h window due to gap');
  }

  // 31. Single record
  {
    const records = [
      createHourlyRecord('2026-09-21T12:00:00Z', {
        rainfallMm: 8.5,
        temperatureC: 31.2,
        windSpeedKmh: 14.0,
        windGustKmh: 22.5,
      }),
    ];
    const res = weatherAggregationService.aggregateRecords(records, dummyFarmId);
    assert(res.recordCount === 1, '31.1 Single record counted');
    assert(res.totalRainfall24h === 8.5, '31.2 Total rainfall equals single record rainfall (8.5 mm)');
    assert(res.maximumTemperatureC === 31.2, '31.3 Maximum temperature equals single record temperature (31.2 °C)');
    assert(res.maximumWindSpeedKmh === 14.0, '31.4 Maximum wind speed equals single record speed (14.0 km/h)');
    assert(res.maximumWindGustKmh === 22.5, '31.5 Maximum wind gust equals single record gust (22.5 km/h)');
    assert(res.complete24hWindow === false, '31.6 Single record marks complete24hWindow = false');
    assert(res.complete3hWindow === false, '31.7 Single record marks complete3hWindow = false');
    assert(res.threeHourWindowEnd === null, '31.8 Single record marks threeHourWindowEnd = null');
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Weather Aggregation Unit Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

try {
  runAggregationUnitTests();
} catch (err) {
  console.error('Fatal error during weather aggregation unit tests:', err);
  process.exit(1);
}
