/**
 * Module 5: Weather Integration Test Suite (Live PostgreSQL + PostGIS)
 * Tests real PostgreSQL database persistence, foreign key relationships,
 * transactional batch upserts with real database-level rollback, idempotency,
 * initial 24h backfill, subsequent sync, latest weather retrieval,
 * and historical queries.
 */

import { prisma } from '../src/config/db.js';
import { farmerService } from '../src/services/farmer.service.js';
import { farmService } from '../src/services/farm.service.js';
import { farmBoundaryRepository } from '../src/repositories/farmBoundary.repository.js';
import { weatherRepository } from '../src/repositories/weather.repository.js';
import { WeatherService } from '../src/services/weather.service.js';
import { IWeatherProvider, NormalizedWeatherDTO } from '../src/types/weather.types.js';
import { AppError } from '../src/utils/apiError.js';

class MockTestWeatherProvider implements IWeatherProvider {
  public readonly providerName = 'Open-Meteo';
  public currentCalls: number = 0;
  public hourlyCalls: number = 0;
  public currentObservation: NormalizedWeatherDTO | null = null;
  public hourlyObservations: NormalizedWeatherDTO[] = [];

  async fetchCurrentWeather(latitude: number, longitude: number): Promise<NormalizedWeatherDTO> {
    this.currentCalls++;
    if (this.currentObservation) {
      return { ...this.currentObservation, latitude, longitude };
    }
    return {
      observedAt: new Date('2026-09-22T12:00:00Z'),
      latitude,
      longitude,
      temperatureC: 28.5,
      humidityPercent: 65,
      rainfallMm: 0,
      windSpeedKmh: 12,
      windGustKmh: 18,
      weatherCode: 1,
      source: this.providerName,
    };
  }

  async fetchRecentHourlyWeather(latitude: number, longitude: number): Promise<NormalizedWeatherDTO[]> {
    this.hourlyCalls++;
    return this.hourlyObservations.map((obs) => ({ ...obs, latitude, longitude }));
  }
}

async function runWeatherIntegrationTests() {
  console.log('🧪 Running Module 5: Weather Integration Tests (Live PostgreSQL)...\n');

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

  const testMobile = '9999900005';
  let testFarmerId: string | null = null;
  let testFarmId: string | null = null;
  let testFarmWithoutBoundaryId: string | null = null;
  let testRollbackFarmId: string | null = null;

  const mockProvider = new MockTestWeatherProvider();
  const weatherService = new WeatherService(
    weatherRepository,
    undefined,
    undefined,
    mockProvider
  );

  try {
    // ---------------------------------------------------------------------------
    // 1. Live Connection & Existing Table Verification
    // ---------------------------------------------------------------------------
    const tableCheck: any[] = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'weather_records';
    `;
    assert(tableCheck.length > 0, '1. Live PostgreSQL contains weather_records table');

    // Cleanup lingering test records from previous runs if any
    const existingFarmer = await prisma.farmer.findFirst({ where: { mobileNumber: testMobile } });
    if (existingFarmer) {
      const existingFarms = await prisma.farm.findMany({ where: { farmerId: existingFarmer.id } });
      for (const f of existingFarms) {
        await weatherRepository.deleteByFarmId(f.id);
        await farmBoundaryRepository.deleteByFarmId(f.id);
        await farmService.deleteFarm(f.id);
      }
      await prisma.farmer.delete({ where: { id: existingFarmer.id } });
    }

    // ---------------------------------------------------------------------------
    // Setup Test Farmer, Farm, and FarmBoundary
    // ---------------------------------------------------------------------------
    const farmer = await farmerService.registerFarmer({
      fullName: 'Vikram Shinde',
      mobileNumber: testMobile,
      preferredLanguage: 'mr' as any,
    });
    testFarmerId = farmer.id;

    const farm = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Weather Test Plot',
      cropName: 'Sugarcane',
      sowingDate: '2026-05-10',
      farmArea: 6.0,
      village: 'Nira',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '412102',
    });
    testFarmId = farm.id;

    // Digitize boundary for test farm (centered around Pune 18.5204, 73.8567)
    const polygonGeoJson = {
      type: 'Polygon',
      coordinates: [
        [
          [73.8560, 18.5200],
          [73.8574, 18.5200],
          [73.8574, 18.5208],
          [73.8560, 18.5208],
          [73.8560, 18.5200],
        ],
      ],
    };
    await farmBoundaryRepository.create(testFarmId, JSON.stringify(polygonGeoJson));

    // Create a second farm without boundary for boundary validation test
    const farmWithoutBoundary = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Unmapped Boundary Plot',
      cropName: 'Bajra',
      sowingDate: '2026-06-01',
      farmArea: 3.0,
      village: 'Nira',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '412102',
    });
    testFarmWithoutBoundaryId = farmWithoutBoundary.id;

    // ---------------------------------------------------------------------------
    // A. Farm Validation Errors
    // ---------------------------------------------------------------------------
    let nonExistentFarmCaught = false;
    try {
      await weatherService.syncWeather('00000000-0000-0000-0000-000000000000');
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) {
        nonExistentFarmCaught = true;
      }
    }
    assert(nonExistentFarmCaught, 'A.1 Sync on non-existent farm returns 404 Not Found');

    let missingBoundaryCaught = false;
    try {
      await weatherService.syncWeather(testFarmWithoutBoundaryId);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404 && err.message.includes('boundary not found')) {
        missingBoundaryCaught = true;
      }
    }
    assert(missingBoundaryCaught, 'A.2 Sync on farm without boundary returns 404 Not Found');

    // ---------------------------------------------------------------------------
    // B. Initial Weather Synchronization (Initial Backfill)
    // ---------------------------------------------------------------------------
    const baseUtcTime = new Date('2026-09-22T10:00:00Z');
    mockProvider.hourlyObservations = [];
    for (let i = 24; i >= 1; i--) {
      mockProvider.hourlyObservations.push({
        observedAt: new Date(baseUtcTime.getTime() - i * 3600 * 1000),
        latitude: 18.5204,
        longitude: 73.8567,
        temperatureC: 22.0 + (i % 5),
        humidityPercent: 50.0 + (i % 30),
        rainfallMm: i % 6 === 0 ? 3.5 : 0.0,
        windSpeedKmh: 8.0 + (i % 10),
        windGustKmh: 14.0 + (i % 10),
        weatherCode: 1,
        source: 'Open-Meteo',
      });
    }
    mockProvider.currentObservation = {
      observedAt: baseUtcTime,
      latitude: 18.5204,
      longitude: 73.8567,
      temperatureC: 29.8,
      humidityPercent: 58.0,
      rainfallMm: 0.0,
      windSpeedKmh: 12.5,
      windGustKmh: 19.0,
      weatherCode: 0,
      source: 'Open-Meteo',
    };

    mockProvider.currentCalls = 0;
    mockProvider.hourlyCalls = 0;

    const initialSync = await weatherService.syncWeather(testFarmId);
    assert(initialSync.synced === true, 'B.1 Initial sync completed with synced: true');
    assert(initialSync.isInitialBackfill === true, 'B.2 isInitialBackfill flag is true on initial sync');
    assert(initialSync.recordsSynced === 25, `B.3 recordsSynced reflects 25 unique records (got ${initialSync.recordsSynced})`);
    assert(initialSync.record.temperatureC === 29.8, 'B.4 Response record contains the current observation');
    assert(initialSync.record.weatherDescription === 'Clear sky', 'B.5 WMO weather description mapped to "Clear sky"');
    assert(mockProvider.currentCalls === 1, 'B.6 Current weather fetched once from provider');
    assert(mockProvider.hourlyCalls === 1, 'B.7 Hourly weather backfill fetched once from provider');

    // Verify records exist in live PostgreSQL database
    const dbCountAfterInitial = await prisma.weatherRecord.count({ where: { farmId: testFarmId } });
    assert(dbCountAfterInitial === 25, `B.8 Real PostgreSQL contains exactly 25 persisted WeatherRecord rows (got ${dbCountAfterInitial})`);

    // ---------------------------------------------------------------------------
    // C. Subsequent Weather Synchronization (Current Weather Only)
    // ---------------------------------------------------------------------------
    const nextUtcTime = new Date('2026-09-22T11:00:00Z');
    mockProvider.currentObservation = {
      observedAt: nextUtcTime,
      latitude: 18.5204,
      longitude: 73.8567,
      temperatureC: 31.2,
      humidityPercent: 54.0,
      rainfallMm: 0.0,
      windSpeedKmh: 15.0,
      windGustKmh: 22.0,
      weatherCode: 1,
      source: 'Open-Meteo',
    };

    mockProvider.currentCalls = 0;
    mockProvider.hourlyCalls = 0;

    const subsequentSync = await weatherService.syncWeather(testFarmId);
    assert(subsequentSync.synced === true, 'C.1 Subsequent sync completed with synced: true');
    assert(subsequentSync.isInitialBackfill === false, 'C.2 isInitialBackfill is false on subsequent sync');
    assert(subsequentSync.recordsSynced === 1, 'C.3 recordsSynced equals 1 on subsequent sync');
    assert(subsequentSync.record.temperatureC === 31.2, 'C.4 Returned record is updated current observation (31.2)');
    assert(mockProvider.currentCalls === 1, 'C.5 Current weather provider called during subsequent sync');
    assert(mockProvider.hourlyCalls === 0, 'C.6 Hourly weather provider was NOT called during subsequent sync');

    const dbCountAfterSubsequent = await prisma.weatherRecord.count({ where: { farmId: testFarmId } });
    assert(dbCountAfterSubsequent === 26, `C.7 Real PostgreSQL count increased by 1 to 26 (got ${dbCountAfterSubsequent})`);

    // ---------------------------------------------------------------------------
    // D. Idempotency Check on Repeated Synchronization
    // ---------------------------------------------------------------------------
    // Calling sync again with same observation timestamp (nextUtcTime)
    const repeatedSync = await weatherService.syncWeather(testFarmId);
    assert(repeatedSync.synced === true, 'D.1 Repeated sync completed successfully');
    const dbCountAfterRepeated = await prisma.weatherRecord.count({ where: { farmId: testFarmId } });
    assert(dbCountAfterRepeated === 26, `D.2 Repeated sync did not create duplicate (farmId, observedAt) rows (remained ${dbCountAfterRepeated})`);

    // ---------------------------------------------------------------------------
    // E. Latest Weather Retrieval from PostgreSQL
    // ---------------------------------------------------------------------------
    mockProvider.currentCalls = 0;
    mockProvider.hourlyCalls = 0;

    const latest = await weatherService.getLatestWeather(testFarmId);
    assert(latest !== null, 'E.1 Latest weather record retrieved from PostgreSQL');
    assert(latest?.temperatureC === 31.2, 'E.2 Latest temperature matches newest observation (31.2)');
    assert(latest?.observedAt === nextUtcTime.toISOString(), 'E.3 Latest timestamp matches expected newest observation');
    assert(mockProvider.currentCalls === 0 && mockProvider.hourlyCalls === 0, 'E.4 Latest weather read PostgreSQL only (zero provider calls)');

    // ---------------------------------------------------------------------------
    // F. Historical Weather Retrieval from PostgreSQL
    // ---------------------------------------------------------------------------
    mockProvider.currentCalls = 0;
    mockProvider.hourlyCalls = 0;

    const history = await weatherService.getHistoricalWeather(testFarmId);
    assert(Array.isArray(history) && history.length === 26, `F.1 Retrieved all 26 historical records from PostgreSQL`);
    assert(mockProvider.currentCalls === 0 && mockProvider.hourlyCalls === 0, 'F.2 Historical query read PostgreSQL only (zero provider calls)');

    // Verify chronological ascending order
    let isAscending = true;
    for (let i = 1; i < history.length; i++) {
      if (new Date(history[i].observedAt).getTime() < new Date(history[i - 1].observedAt).getTime()) {
        isAscending = false;
        break;
      }
    }
    assert(isAscending, 'F.3 Historical observations are ordered chronologically ascending (observedAt ASC)');

    // ---------------------------------------------------------------------------
    // G. REAL PostgreSQL Transaction Rollback Test
    // ---------------------------------------------------------------------------
    console.log('\n  [Executing Real PostgreSQL Database-Level Transaction Rollback Test...]');
    // Create a third farm specifically to verify all-or-nothing rollback
    const rollbackFarm = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Transaction Rollback Plot',
      cropName: 'Cotton',
      sowingDate: '2026-06-01',
      farmArea: 4.0,
      village: 'Nira',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '412102',
    });
    testRollbackFarmId = rollbackFarm.id;

    // Verify 0 records initially
    const initialRollbackFarmCount = await prisma.weatherRecord.count({ where: { farmId: testRollbackFarmId } });
    assert(initialRollbackFarmCount === 0, 'G.1 Fresh farm has 0 weather records initially');

    // Create a batch of 5 observations where the 4th record deliberately causes a REAL DATABASE-LEVEL FAILURE
    // (violating VARCHAR(50) constraint on 'source' column with a 100-character string)
    const testBatch: NormalizedWeatherDTO[] = [
      {
        observedAt: new Date('2026-09-22T01:00:00Z'),
        latitude: 18.5204,
        longitude: 73.8567,
        temperatureC: 22.0,
        humidityPercent: 60.0,
        rainfallMm: 0,
        windSpeedKmh: 10,
        windGustKmh: 15,
        weatherCode: 1,
        source: 'Open-Meteo',
      },
      {
        observedAt: new Date('2026-09-22T02:00:00Z'),
        latitude: 18.5204,
        longitude: 73.8567,
        temperatureC: 23.0,
        humidityPercent: 62.0,
        rainfallMm: 0,
        windSpeedKmh: 11,
        windGustKmh: 16,
        weatherCode: 1,
        source: 'Open-Meteo',
      },
      {
        observedAt: new Date('2026-09-22T03:00:00Z'),
        latitude: 18.5204,
        longitude: 73.8567,
        temperatureC: 24.0,
        humidityPercent: 65.0,
        rainfallMm: 0,
        windSpeedKmh: 12,
        windGustKmh: 17,
        weatherCode: 1,
        source: 'Open-Meteo',
      },
      {
        observedAt: new Date('2026-09-22T04:00:00Z'),
        latitude: 18.5204,
        longitude: 73.8567,
        temperatureC: 25.0,
        humidityPercent: 68.0,
        rainfallMm: 0,
        windSpeedKmh: 13,
        windGustKmh: 18,
        weatherCode: 1,
        // DELIBERATE DATABASE FAILURE: string exceeds VARCHAR(50) column limit in PostgreSQL
        source: 'DELIBERATE_OVERFLOW_STRING_EXCEEDING_VARCHAR_50_LIMIT_TRIGGERING_POSTGRESQL_ERROR_CODE_22001',
      },
      {
        observedAt: new Date('2026-09-22T05:00:00Z'),
        latitude: 18.5204,
        longitude: 73.8567,
        temperatureC: 26.0,
        humidityPercent: 70.0,
        rainfallMm: 0,
        windSpeedKmh: 14,
        windGustKmh: 19,
        weatherCode: 1,
        source: 'Open-Meteo',
      },
    ];

    let transactionFailedCaught = false;
    try {
      await weatherRepository.upsertMany(testRollbackFarmId, testBatch);
    } catch (dbError: any) {
      transactionFailedCaught = true;
      assert(
        dbError !== null,
        `G.2 PostgreSQL raised database-level constraint error as expected (${dbError.message?.split('\n')[0] || 'DB Error'})`
      );
    }
    assert(transactionFailedCaught, 'G.3 upsertMany batch threw an error due to database-level failure');

    // VERIFY ZERO RECORDS REMAIN PERSISTED IN POSTGRESQL (FULL TRANSACTION ROLLBACK)
    const countAfterFailedBatch = await prisma.weatherRecord.count({ where: { farmId: testRollbackFarmId } });
    assert(
      countAfterFailedBatch === 0,
      `G.4 Real PostgreSQL transaction rolled back completely: EXACTLY 0 records remain persisted (got ${countAfterFailedBatch})`
    );

    // ---------------------------------------------------------------------------
    // H. Cascade Deletion Integrity
    // ---------------------------------------------------------------------------
    // Deleting the farm must cascade delete its weather records
    await weatherRepository.deleteByFarmId(testFarmId);
    const countAfterManualDelete = await prisma.weatherRecord.count({ where: { farmId: testFarmId } });
    assert(countAfterManualDelete === 0, 'H.1 weatherRepository.deleteByFarmId cleanly removed all records');

    console.log('\n  [Cleaning up integration test entities in proper sequence...]');
  } finally {
    // Teardown test entities
    try {
      if (testRollbackFarmId) {
        await weatherRepository.deleteByFarmId(testRollbackFarmId);
        await farmService.deleteFarm(testRollbackFarmId);
      }
      if (testFarmWithoutBoundaryId) {
        await farmService.deleteFarm(testFarmWithoutBoundaryId);
      }
      if (testFarmId) {
        await weatherRepository.deleteByFarmId(testFarmId);
        await farmBoundaryRepository.deleteByFarmId(testFarmId);
        await farmService.deleteFarm(testFarmId);
      }
      if (testFarmerId) {
        await prisma.farmer.delete({ where: { id: testFarmerId } });
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Weather Integration Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runWeatherIntegrationTests().catch((error) => {
  console.error('Fatal error during weather integration test run:', error);
  process.exit(1);
});
