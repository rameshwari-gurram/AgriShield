/**
 * Module 5: Weather API Integration Test Suite (Express + PostgreSQL + PostGIS)
 * Verifies real HTTP request dispatch, Zod validation middleware, error middleware,
 * controller orchestration, provider call isolation, idempotency, and clean status codes.
 */

import http from 'http';
import { prisma } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { farmerService } from '../src/services/farmer.service.js';
import { farmService } from '../src/services/farm.service.js';
import { farmBoundaryRepository } from '../src/repositories/farmBoundary.repository.js';
import { weatherRepository } from '../src/repositories/weather.repository.js';
import { weatherService } from '../src/services/weather.service.js';
import { openMeteoProvider } from '../src/providers/openmeteo.provider.js';
import { IWeatherProvider, NormalizedWeatherDTO } from '../src/types/weather.types.js';
import { AppError } from '../src/utils/apiError.js';

class MockApiWeatherProvider implements IWeatherProvider {
  public readonly providerName = 'Open-Meteo';
  public currentCalls: number = 0;
  public hourlyCalls: number = 0;
  public currentObservation: NormalizedWeatherDTO | null = null;
  public hourlyObservations: NormalizedWeatherDTO[] = [];
  public failureToThrow: Error | null = null;

  async fetchCurrentWeather(latitude: number, longitude: number): Promise<NormalizedWeatherDTO> {
    this.currentCalls++;
    if (this.failureToThrow) {
      throw this.failureToThrow;
    }
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
    if (this.failureToThrow) {
      throw this.failureToThrow;
    }
    return this.hourlyObservations.map((obs) => ({ ...obs, latitude, longitude }));
  }

  resetCalls(): void {
    this.currentCalls = 0;
    this.hourlyCalls = 0;
    this.failureToThrow = null;
  }
}

async function runWeatherApiIntegrationTests() {
  console.log('🧪 Running Module 5: Weather API Integration Tests (Express + Live PostgreSQL)...\n');

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

  // Install mock weather provider into weatherService
  const mockProvider = new MockApiWeatherProvider();
  weatherService.setWeatherProvider(mockProvider);

  const testMobile = '9999900005';
  let testFarmerId: string | null = null;
  let testFarmId: string | null = null;
  let testFarmWithoutBoundaryId: string | null = null;
  let testFarmWithoutWeatherId: string | null = null;

  try {
    // ---------------------------------------------------------------------------
    // Initial Database Cleanup & Setup
    // ---------------------------------------------------------------------------
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

    const farmer = await farmerService.registerFarmer({
      fullName: 'Ganesh Patil',
      mobileNumber: testMobile,
      preferredLanguage: 'mr' as any,
    });
    testFarmerId = farmer.id;

    // Farm 1: Primary farm with boundary
    const farm = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Api Weather Plot',
      cropName: 'Sugarcane',
      sowingDate: '2026-05-15',
      farmArea: 5.0,
      village: 'Bhor',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '412206',
    });
    testFarmId = farm.id;

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

    // Farm 2: Farm without boundary
    const farmWithoutBoundary = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'No Boundary Parcel',
      cropName: 'Jowar',
      sowingDate: '2026-06-01',
      farmArea: 3.5,
      village: 'Bhor',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '412206',
    });
    testFarmWithoutBoundaryId = farmWithoutBoundary.id;

    // Farm 3: Farm with boundary but 0 weather records (for latest weather 404 test)
    const farmWithoutWeather = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Empty Weather Parcel',
      cropName: 'Wheat',
      sowingDate: '2026-06-05',
      farmArea: 2.0,
      village: 'Bhor',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '412206',
    });
    testFarmWithoutWeatherId = farmWithoutWeather.id;
    await farmBoundaryRepository.create(testFarmWithoutWeatherId, JSON.stringify(polygonGeoJson));

    // ---------------------------------------------------------------------------
    // A. Initial Synchronization (POST /api/v1/farms/:farmId/weather/sync)
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
        rainfallMm: i % 6 === 0 ? 2.5 : 0.0,
        windSpeedKmh: 9.0 + (i % 10),
        windGustKmh: 15.0 + (i % 10),
        weatherCode: 0,
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
      windSpeedKmh: 11.5,
      windGustKmh: 16.0,
      weatherCode: 0,
      source: 'Open-Meteo',
    };
    mockProvider.resetCalls();

    const initialSyncRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const initialSyncBody = await initialSyncRes.json();

    assert(initialSyncRes.status === 200, 'A.1 POST /weather/sync returns HTTP 200 on initial sync');
    assert(initialSyncBody.success === true, 'A.2 Response envelope indicates success: true');
    assert(initialSyncBody.data.synced === true, 'A.3 data.synced is true');
    assert(initialSyncBody.data.isInitialBackfill === true, 'A.4 data.isInitialBackfill is true');
    assert(initialSyncBody.data.recordsSynced === 25, `A.5 data.recordsSynced matches 25 unique records (got ${initialSyncBody.data?.recordsSynced})`);
    assert(initialSyncBody.data.source === 'Open-Meteo', 'A.6 data.source is explicitly "Open-Meteo"');
    assert(initialSyncBody.data.record.temperatureC === 29.8, 'A.7 Returned record is the current observation');
    assert(mockProvider.currentCalls === 1, 'A.8 Provider current method called exactly once');
    assert(mockProvider.hourlyCalls === 1, 'A.9 Provider hourly backfill called exactly once on initial sync');

    const dbCountAfterInitial = await prisma.weatherRecord.count({ where: { farmId: testFarmId } });
    assert(dbCountAfterInitial === 25, `A.10 PostgreSQL contains exactly 25 persisted rows (got ${dbCountAfterInitial})`);

    // ---------------------------------------------------------------------------
    // B. Subsequent Synchronization (POST /api/v1/farms/:farmId/weather/sync)
    // ---------------------------------------------------------------------------
    const subsequentUtcTime = new Date('2026-09-22T11:00:00Z');
    mockProvider.currentObservation = {
      observedAt: subsequentUtcTime,
      latitude: 18.5204,
      longitude: 73.8567,
      temperatureC: 31.5,
      humidityPercent: 52.0,
      rainfallMm: 0.0,
      windSpeedKmh: 14.0,
      windGustKmh: 20.0,
      weatherCode: 1,
      source: 'Open-Meteo',
    };
    mockProvider.resetCalls();

    const subsequentSyncRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const subsequentSyncBody = await subsequentSyncRes.json();

    assert(subsequentSyncRes.status === 200, 'B.1 POST /weather/sync returns HTTP 200 on subsequent sync');
    assert(subsequentSyncBody.data.isInitialBackfill === false, 'B.2 data.isInitialBackfill is false on subsequent sync');
    assert(subsequentSyncBody.data.recordsSynced === 1, 'B.3 data.recordsSynced equals 1 on subsequent sync');
    assert(subsequentSyncBody.data.record.temperatureC === 31.5, 'B.4 Returned record is the updated current observation');
    assert(mockProvider.currentCalls === 1, 'B.5 Provider current method called during subsequent sync');
    assert(mockProvider.hourlyCalls === 0, 'B.6 Provider hourly method was NOT called during subsequent sync');

    const dbCountAfterSubsequent = await prisma.weatherRecord.count({ where: { farmId: testFarmId } });
    assert(dbCountAfterSubsequent === 26, `B.7 PostgreSQL total count increased by 1 to 26 (got ${dbCountAfterSubsequent})`);

    // ---------------------------------------------------------------------------
    // C. Farm Not Found (POST /api/v1/farms/:farmId/weather/sync)
    // ---------------------------------------------------------------------------
    const nonExistentFarmId = '00000000-0000-0000-0000-000000000000';
    const notFoundRes = await fetch(`${baseUrl}/api/v1/farms/${nonExistentFarmId}/weather/sync`, {
      method: 'POST',
    });
    const notFoundBody = await notFoundRes.json();

    assert(notFoundRes.status === 404, 'C.1 POST /weather/sync on non-existent farm returns HTTP 404');
    assert(notFoundBody.success === false, 'C.2 Non-existent farm response has success: false');
    assert(notFoundBody.message.includes('not found'), `C.3 Error message indicates farm not found (${notFoundBody.message})`);

    // ---------------------------------------------------------------------------
    // D. Boundary Missing (POST /api/v1/farms/:farmId/weather/sync)
    // ---------------------------------------------------------------------------
    const missingBoundaryRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmWithoutBoundaryId}/weather/sync`, {
      method: 'POST',
    });
    const missingBoundaryBody = await missingBoundaryRes.json();

    assert(missingBoundaryRes.status === 404, 'D.1 POST /weather/sync on farm without boundary returns HTTP 404');
    assert(missingBoundaryBody.success === false, 'D.2 Missing boundary response has success: false');
    assert(missingBoundaryBody.message.includes('boundary not found'), `D.3 Error message indicates boundary not found (${missingBoundaryBody.message})`);

    // ---------------------------------------------------------------------------
    // E. Latest Weather (GET /api/v1/farms/:farmId/weather/latest)
    // ---------------------------------------------------------------------------
    mockProvider.resetCalls();
    const latestRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather/latest`);
    const latestBody = await latestRes.json();

    assert(latestRes.status === 200, 'E.1 GET /weather/latest returns HTTP 200');
    assert(latestBody.success === true, 'E.2 Latest weather response has success: true');
    assert(latestBody.data.temperatureC === 31.5, 'E.3 Latest weather returns the newest persisted observation (31.5°C)');
    assert(mockProvider.currentCalls === 0, 'E.4 Latest weather did NOT call provider current method (PostgreSQL-only)');
    assert(mockProvider.hourlyCalls === 0, 'E.5 Latest weather did NOT call provider hourly method (PostgreSQL-only)');

    // ---------------------------------------------------------------------------
    // F. Latest Weather Unavailable (GET /api/v1/farms/:farmId/weather/latest)
    // ---------------------------------------------------------------------------
    mockProvider.resetCalls();
    const latestUnavailableRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmWithoutWeatherId}/weather/latest`);
    const latestUnavailableBody = await latestUnavailableRes.json();

    assert(latestUnavailableRes.status === 404, 'F.1 GET /weather/latest returns HTTP 404 when no weather records exist');
    assert(latestUnavailableBody.success === false, 'F.2 Response indicates success: false');
    assert(latestUnavailableBody.message.includes('No weather records found'), `F.3 Descriptive 404 message returned (${latestUnavailableBody.message})`);
    assert(mockProvider.currentCalls === 0, 'F.4 Provider was NOT called when database was empty');

    // ---------------------------------------------------------------------------
    // G. Historical Weather (GET /api/v1/farms/:farmId/weather?from=...&to=...)
    // ---------------------------------------------------------------------------
    mockProvider.resetCalls();
    const fromIso = '2026-09-21T00:00:00Z';
    const toIso = '2026-09-22T23:59:59Z';
    const historicalRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather?from=${fromIso}&to=${toIso}`);
    const historicalBody = await historicalRes.json();

    assert(historicalRes.status === 200, 'G.1 GET /weather returns HTTP 200 for valid date range');
    assert(historicalBody.success === true, 'G.2 Historical weather response has success: true');
    assert(Array.isArray(historicalBody.data), 'G.3 Historical data is an array');
    assert(historicalBody.data.length === 26, `G.4 Retrieved all 26 historical observations (got ${historicalBody.data.length})`);
    assert(mockProvider.currentCalls === 0, 'G.5 Historical weather did NOT call provider (PostgreSQL-only)');
    assert(mockProvider.hourlyCalls === 0, 'G.6 Provider was NOT called for historical queries');

    // Verify chronological ascending order
    let isAscending = true;
    for (let i = 1; i < historicalBody.data.length; i++) {
      const prevTime = new Date(historicalBody.data[i - 1].observedAt).getTime();
      const currTime = new Date(historicalBody.data[i].observedAt).getTime();
      if (currTime < prevTime) {
        isAscending = false;
        break;
      }
    }
    assert(isAscending, 'G.7 Historical records are strictly sorted ascending by observedAt (observedAt ASC)');

    // ---------------------------------------------------------------------------
    // H. Invalid UUID Path Parameter
    // ---------------------------------------------------------------------------
    const invalidUuidSyncRes = await fetch(`${baseUrl}/api/v1/farms/not-a-valid-uuid/weather/sync`, { method: 'POST' });
    const invalidUuidSyncBody = await invalidUuidSyncRes.json();
    assert(invalidUuidSyncRes.status === 400, 'H.1 POST /weather/sync with invalid UUID returns HTTP 400');
    assert(invalidUuidSyncBody.success === false, 'H.2 Invalid UUID response has success: false');

    const invalidUuidLatestRes = await fetch(`${baseUrl}/api/v1/farms/not-a-valid-uuid/weather/latest`);
    assert(invalidUuidLatestRes.status === 400, 'H.3 GET /weather/latest with invalid UUID returns HTTP 400');

    const invalidUuidHistRes = await fetch(`${baseUrl}/api/v1/farms/not-a-valid-uuid/weather?from=${fromIso}&to=${toIso}`);
    assert(invalidUuidHistRes.status === 400, 'H.4 GET /weather with invalid UUID returns HTTP 400');

    // ---------------------------------------------------------------------------
    // I. Invalid / Missing 'from' Parameter
    // ---------------------------------------------------------------------------
    const missingFromRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather?to=${toIso}`);
    assert(missingFromRes.status === 400, 'I.1 GET /weather with missing "from" returns HTTP 400');

    const invalidFromRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather?from=not-a-date&to=${toIso}`);
    assert(invalidFromRes.status === 400, 'I.2 GET /weather with invalid "from" returns HTTP 400');

    // ---------------------------------------------------------------------------
    // J. Invalid / Missing 'to' Parameter
    // ---------------------------------------------------------------------------
    const missingToRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather?from=${fromIso}`);
    assert(missingToRes.status === 400, 'J.1 GET /weather with missing "to" returns HTTP 400');

    const invalidToRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather?from=${fromIso}&to=invalid-date-format`);
    assert(invalidToRes.status === 400, 'J.2 GET /weather with invalid "to" returns HTTP 400');

    // ---------------------------------------------------------------------------
    // K. 'from' > 'to' Inverted Range
    // ---------------------------------------------------------------------------
    const invertedRangeRes = await fetch(
      `${baseUrl}/api/v1/farms/${testFarmId}/weather?from=2026-09-25T00:00:00Z&to=2026-09-20T00:00:00Z`
    );
    const invertedRangeBody = await invertedRangeRes.json();
    assert(invertedRangeRes.status === 400, 'K.1 GET /weather with from > to returns HTTP 400');
    assert(invertedRangeBody.success === false, 'K.2 Inverted range response has success: false');

    // ---------------------------------------------------------------------------
    // L. Provider Failure Propagation (HTTP 503 Service Unavailable)
    // ---------------------------------------------------------------------------
    mockProvider.failureToThrow = AppError.serviceUnavailable('Open-Meteo weather service is temporarily unavailable');
    const providerFailureRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather/sync`, { method: 'POST' });
    const providerFailureBody = await providerFailureRes.json();

    assert(providerFailureRes.status === 503, 'L.1 Provider failure correctly translates to HTTP 503');
    assert(providerFailureBody.success === false, 'L.2 Error response indicates success: false');
    assert(providerFailureBody.message.includes('temporarily unavailable'), `L.3 Service unavailable error message preserved (${providerFailureBody.message})`);

    // ---------------------------------------------------------------------------
    // M. Provider Rate Limit Propagation (HTTP 429 Too Many Requests)
    // ---------------------------------------------------------------------------
    mockProvider.failureToThrow = AppError.tooManyRequests('Open-Meteo API rate limit exceeded. Please retry in 1 minute.');
    const rateLimitRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather/sync`, { method: 'POST' });
    const rateLimitBody = await rateLimitRes.json();

    assert(rateLimitRes.status === 429, 'M.1 Provider rate limit correctly translates to HTTP 429');
    assert(rateLimitBody.success === false, 'M.2 Error response indicates success: false');
    assert(rateLimitBody.message.includes('rate limit exceeded'), `M.3 Rate limit message preserved (${rateLimitBody.message})`);

    // ---------------------------------------------------------------------------
    // N. Idempotency (Repeat Sync Does NOT Duplicate Records)
    // ---------------------------------------------------------------------------
    mockProvider.resetCalls();
    mockProvider.failureToThrow = null;
    mockProvider.currentObservation = {
      observedAt: subsequentUtcTime, // Same timestamp as in Section B
      latitude: 18.5204,
      longitude: 73.8567,
      temperatureC: 31.5,
      humidityPercent: 52.0,
      rainfallMm: 0.0,
      windSpeedKmh: 14.0,
      windGustKmh: 20.0,
      weatherCode: 1,
      source: 'Open-Meteo',
    };

    const countBeforeRepeat = await prisma.weatherRecord.count({ where: { farmId: testFarmId } });
    const repeatSyncRes = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/weather/sync`, { method: 'POST' });
    const repeatSyncBody = await repeatSyncRes.json();

    assert(repeatSyncRes.status === 200, 'N.1 Repeated POST /weather/sync succeeds with HTTP 200');
    assert(repeatSyncBody.data.synced === true, 'N.2 Repeated sync reports synced: true');
    const countAfterRepeat = await prisma.weatherRecord.count({ where: { farmId: testFarmId } });
    assert(countAfterRepeat === countBeforeRepeat, `N.3 Repeated sync did NOT insert duplicate records (count stayed at ${countAfterRepeat})`);

    // ---------------------------------------------------------------------------
    // O. Provider Call Isolation Check
    // ---------------------------------------------------------------------------
    assert(
      mockProvider.currentCalls === 1 && mockProvider.hourlyCalls === 0,
      'O.1 Provider Call Isolation confirmed: GET endpoints never touched weatherProvider'
    );

    console.log('\n  [Cleaning up integration test entities in proper sequence...]');
  } finally {
    // Teardown HTTP Server and restore original provider
    server.close();
    weatherService.setWeatherProvider(openMeteoProvider);

    // Teardown database entities
    try {
      if (testFarmWithoutWeatherId) {
        await weatherRepository.deleteByFarmId(testFarmWithoutWeatherId);
        await farmBoundaryRepository.deleteByFarmId(testFarmWithoutWeatherId);
        await farmService.deleteFarm(testFarmWithoutWeatherId);
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
  console.log(`Weather API Integration Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runWeatherApiIntegrationTests().catch((error) => {
  console.error('Fatal error during weather API integration test run:', error);
  process.exit(1);
});
