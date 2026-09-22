/**
 * Module 6 Stage 2: Weather Aggregation Integration Test Suite (Live PostgreSQL)
 * Tests real PostgreSQL database reads, farm isolation, timestamp preservation,
 * immutability of WeatherRecords, and confirms zero side-effects on RiskRule/RiskAssessment/RiskEvent.
 */

import { prisma } from '../src/config/db.js';
import { weatherAggregationService } from '../src/services/weatherAggregation.service.js';
import { weatherRepository } from '../src/repositories/weather.repository.js';
import { NormalizedWeatherDTO } from '../src/types/weather.types.js';
import { AppError } from '../src/utils/apiError.js';

async function runAggregationIntegrationTests() {
  console.log('🧪 Running Module 6 Stage 2: Weather Aggregation Integration Tests (Live PostgreSQL)...\n');

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
  let testFarm1Id: string | null = null;
  let testFarm2Id: string | null = null;
  let emptyFarmId: string | null = null;

  try {
    // ---------------------------------------------------------------------------
    // Preliminary cleanup
    // ---------------------------------------------------------------------------
    const existingFarmer = await prisma.farmer.findFirst({ where: { mobileNumber: testMobile } });
    if (existingFarmer) {
      const farms = await prisma.farm.findMany({ where: { farmerId: existingFarmer.id } });
      for (const f of farms) {
        await weatherRepository.deleteByFarmId(f.id);
        await prisma.farm.delete({ where: { id: f.id } });
      }
      await prisma.farmer.delete({ where: { id: existingFarmer.id } });
    }

    // ---------------------------------------------------------------------------
    // Setup Farmer and Farms
    // ---------------------------------------------------------------------------
    const farmer = await prisma.farmer.create({
      data: {
        fullName: 'Weather Aggregation Farmer',
        mobileNumber: testMobile,
        preferredLanguage: 'en',
      },
    });
    testFarmerId = farmer.id;

    const farm1 = await prisma.farm.create({
      data: {
        farmerId: farmer.id,
        farmName: 'Aggregation Target Farm',
        farmReferenceNumber: 'AGRI-AGG-TEST-01',
        cropName: 'Wheat',
        sowingDate: new Date('2026-06-01'),
        farmArea: 12.0,
        village: 'Indapur',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '413106',
      },
    });
    testFarm1Id = farm1.id;

    const farm2 = await prisma.farm.create({
      data: {
        farmerId: farmer.id,
        farmName: 'Isolation Control Farm',
        farmReferenceNumber: 'AGRI-AGG-TEST-02',
        cropName: 'Sugarcane',
        sowingDate: new Date('2026-06-01'),
        farmArea: 8.0,
        village: 'Indapur',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '413106',
      },
    });
    testFarm2Id = farm2.id;

    const farm3 = await prisma.farm.create({
      data: {
        farmerId: farmer.id,
        farmName: 'Empty Farm (No Records)',
        farmReferenceNumber: 'AGRI-AGG-TEST-03',
        cropName: 'Maize',
        sowingDate: new Date('2026-06-01'),
        farmArea: 5.0,
        village: 'Indapur',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '413106',
      },
    });
    emptyFarmId = farm3.id;

    // ---------------------------------------------------------------------------
    // Seed 24 Hourly WeatherRecords for Farm 1 (2026-09-22T00:00:00Z to 23:00:00Z)
    // ---------------------------------------------------------------------------
    const farm1Observations: NormalizedWeatherDTO[] = [];
    const baseMs = new Date('2026-09-22T00:00:00Z').getTime();

    for (let i = 0; i < 24; i++) {
      const obsTime = new Date(baseMs + i * 3600000);
      farm1Observations.push({
        observedAt: obsTime,
        latitude: 18.5204,
        longitude: 73.8567,
        temperatureC: i === 14 ? 35.5 : 26.0, // Peak temp at 14:00
        humidityPercent: 60.0,
        rainfallMm: i >= 10 && i <= 12 ? 15.0 : 1.0, // 3h peak at 10,11,12 => 45mm
        windSpeedKmh: i === 16 ? 42.0 : 14.0, // Peak wind speed at 16:00
        windGustKmh: i === 16 ? 68.5 : 20.0, // Peak wind gust at 16:00
        weatherCode: 61,
        source: 'Open-Meteo',
      });
    }
    await weatherRepository.upsertMany(farm1.id, farm1Observations);

    // ---------------------------------------------------------------------------
    // Seed Distinct WeatherRecords for Farm 2 (Isolation Test)
    // ---------------------------------------------------------------------------
    const farm2Observations: NormalizedWeatherDTO[] = [
      {
        observedAt: new Date('2026-09-22T12:00:00Z'),
        latitude: 18.6,
        longitude: 73.9,
        temperatureC: 48.0, // Higher temp, should NOT leak into Farm 1
        humidityPercent: 20.0,
        rainfallMm: 90.0, // Heavy rain, should NOT leak into Farm 1
        windSpeedKmh: 95.0, // Strong wind, should NOT leak into Farm 1
        windGustKmh: 120.0,
        weatherCode: 95,
        source: 'Open-Meteo',
      },
    ];
    await weatherRepository.upsertMany(farm2.id, farm2Observations);

    // Baseline record counts for side-effect checks
    const initialRiskAssessmentCount = await prisma.riskAssessment.count();
    const initialRiskEventCount = await prisma.riskEvent.count();
    const initialFarm1WeatherCount = await prisma.weatherRecord.count({ where: { farmId: farm1.id } });

    // ---------------------------------------------------------------------------
    // 1. WeatherRecords are read correctly from live PostgreSQL
    // ---------------------------------------------------------------------------
    const result1 = await weatherAggregationService.aggregateFarmWeather(farm1.id);

    assert(result1.recordCount === 24, `1.1 Exactly 24 records read from PostgreSQL for Farm 1 (got ${result1.recordCount})`);
    assert(result1.complete24hWindow === true, '1.2 24 consecutive hourly records correctly flagged as complete24hWindow = true');
    // Total rainfall: 3 hours * 15.0 + 21 hours * 1.0 = 45.0 + 21.0 = 66.0 mm
    assert(result1.totalRainfall24h === 66.0, `1.3 24h total rainfall is 66.0 mm (got ${result1.totalRainfall24h})`);
    assert(result1.maximumRolling3hRainfall === 45.0, `1.4 Rolling 3h max rainfall is 45.0 mm (got ${result1.maximumRolling3hRainfall})`);
    assert(result1.maximumTemperatureC === 35.5, `1.5 Maximum temperature is 35.5 °C (got ${result1.maximumTemperatureC})`);
    assert(result1.maximumWindSpeedKmh === 42.0, `1.6 Maximum wind speed is 42.0 km/h (got ${result1.maximumWindSpeedKmh})`);
    assert(result1.maximumWindGustKmh === 68.5, `1.7 Maximum wind gust is 68.5 km/h (got ${result1.maximumWindGustKmh})`);

    // ---------------------------------------------------------------------------
    // 2. Farm filtering works (isolation)
    // ---------------------------------------------------------------------------
    assert(result1.maximumTemperatureC !== 48.0, '2.1 Farm 2 high temperature (48°C) did not leak into Farm 1 results');
    assert(result1.totalRainfall24h < 90.0, '2.2 Farm 2 rainfall (90mm) did not leak into Farm 1 results');
    assert(result1.maximumWindSpeedKmh !== 95.0, '2.3 Farm 2 wind speed (95 km/h) did not leak into Farm 1 results');

    // ---------------------------------------------------------------------------
    // 3. Timestamps are preserved
    // ---------------------------------------------------------------------------
    assert(
      result1.observationStart?.toISOString() === new Date('2026-09-22T00:00:00Z').toISOString(),
      '3.1 observationStart matches earliest UTC timestamp (2026-09-22T00:00:00Z)'
    );
    assert(
      result1.observationEnd?.toISOString() === new Date('2026-09-22T23:00:00Z').toISOString(),
      '3.2 observationEnd matches latest UTC timestamp (2026-09-22T23:00:00Z)'
    );
    assert(
      result1.threeHourWindowEnd?.toISOString() === new Date('2026-09-22T12:00:00Z').toISOString(),
      '3.3 threeHourWindowEnd matches 12:00 UTC (end of peak 10:00-12:00 window)'
    );

    // ---------------------------------------------------------------------------
    // 4. Aggregation does NOT modify WeatherRecords
    // ---------------------------------------------------------------------------
    const postAggregationCount = await prisma.weatherRecord.count({ where: { farmId: farm1.id } });
    assert(postAggregationCount === initialFarm1WeatherCount, '4.1 WeatherRecord count strictly preserved (no added or removed records)');

    const sampleRecord = await prisma.weatherRecord.findFirst({
      where: { farmId: farm1.id, observedAt: new Date('2026-09-22T14:00:00Z') },
    });
    assert(Number(sampleRecord?.temperatureC) === 35.5, '4.2 Sample WeatherRecord values remain strictly unmodified in PostgreSQL');

    // ---------------------------------------------------------------------------
    // 5. Zero side-effects: No RiskAssessment or RiskEvent is created
    // ---------------------------------------------------------------------------
    const finalRiskAssessmentCount = await prisma.riskAssessment.count();
    const finalRiskEventCount = await prisma.riskEvent.count();
    assert(
      finalRiskAssessmentCount === initialRiskAssessmentCount,
      '5.1 Aggregation created zero RiskAssessment records (strictly measurement-only)'
    );
    assert(
      finalRiskEventCount === initialRiskEventCount,
      '5.2 Aggregation created zero RiskEvent records (no rules evaluated)'
    );

    // ---------------------------------------------------------------------------
    // 6. Explicit referenceTime support
    // ---------------------------------------------------------------------------
    // Reference time at 12:00:00Z should capture hours 00:00 to 12:00 (13 records)
    const midDayRef = new Date('2026-09-22T12:00:00Z');
    const midDayResult = await weatherAggregationService.aggregateFarmWeather(farm1.id, midDayRef);
    assert(midDayResult.recordCount === 13, `6.1 Reference time 12:00 captured expected records (got ${midDayResult.recordCount})`);
    assert(midDayResult.complete24hWindow === false, '6.2 Incomplete 24h window for mid-day reference point');
    assert(midDayResult.complete3hWindow === true, '6.3 3h window valid for mid-day reference point');
    assert(
      midDayResult.threeHourWindowEnd?.toISOString() === midDayRef.toISOString(),
      '6.4 threeHourWindowEnd matches 12:00:00Z'
    );

    // ---------------------------------------------------------------------------
    // 7. Edge Cases with Live DB
    // ---------------------------------------------------------------------------
    // 7.1 Farm with no records
    const emptyResult = await weatherAggregationService.aggregateFarmWeather(emptyFarmId);
    assert(emptyResult.recordCount === 0, '7.1 Empty farm returns recordCount = 0');
    assert(emptyResult.totalRainfall24h === 0, '7.2 Empty farm returns totalRainfall24h = 0');
    assert(emptyResult.complete24hWindow === false, '7.3 Empty farm marks complete24hWindow = false');
    assert(emptyResult.maximumTemperatureC === null, '7.4 Empty farm marks maximumTemperatureC = null');

    // 7.2 Non-existent farm throws 404
    let notFoundThrown = false;
    try {
      await weatherAggregationService.aggregateFarmWeather('00000000-0000-0000-0000-000000000000');
    } catch (err: any) {
      notFoundThrown = err instanceof AppError && err.statusCode === 404;
    }
    assert(notFoundThrown, '7.5 Non-existent farm UUID throws AppError 404 Not Found');

    // 7.3 Invalid referenceTime throws 400
    let invalidRefThrown = false;
    try {
      await weatherAggregationService.aggregateFarmWeather(farm1.id, 'not-a-valid-date');
    } catch (err: any) {
      invalidRefThrown = err instanceof AppError && err.statusCode === 400;
    }
    assert(invalidRefThrown, '7.6 Malformed referenceTime throws AppError 400 Bad Request');
  } finally {
    // Teardown
    try {
      if (testFarm1Id) await weatherRepository.deleteByFarmId(testFarm1Id);
      if (testFarm2Id) await weatherRepository.deleteByFarmId(testFarm2Id);
      if (emptyFarmId) await weatherRepository.deleteByFarmId(emptyFarmId);
      if (testFarm1Id) await prisma.farm.deleteMany({ where: { id: testFarm1Id } });
      if (testFarm2Id) await prisma.farm.deleteMany({ where: { id: testFarm2Id } });
      if (emptyFarmId) await prisma.farm.deleteMany({ where: { id: emptyFarmId } });
      if (testFarmerId) await prisma.farmer.deleteMany({ where: { id: testFarmerId } });
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Weather Aggregation Integration Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAggregationIntegrationTests().catch((error) => {
  console.error('Fatal error during weather aggregation integration test run:', error);
  process.exit(1);
});
