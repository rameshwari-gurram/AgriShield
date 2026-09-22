/**
 * Module 5: Weather Service Unit Test Suite (Stage 3)
 * Tests service orchestration, farm & boundary validation, centroid usage,
 * initial 24h backfill vs subsequent current sync branching, idempotency,
 * historical retrieval, and error propagation with 100% mocked dependencies.
 */

import { WeatherService, getWeatherDescription } from '../src/services/weather.service.js';
import {
  IWeatherRepository,
  IWeatherProvider,
  NormalizedWeatherDTO,
} from '../types/weather.types.js';
import { IFarmRepository } from '../types/farm.types.js';
import { IFarmBoundaryRepository, RawBoundaryResult } from '../types/farmBoundary.types.js';
import { WeatherRecord, Farm, Farmer, AreaUnit, FarmStatus } from '@prisma/client';
import { AppError } from '../src/utils/apiError.js';

class MockWeatherRepository implements IWeatherRepository {
  public records: Map<string, WeatherRecord> = new Map();

  private makeKey(farmId: string, observedAt: Date): string {
    return `${farmId}::${observedAt.toISOString()}`;
  }

  async countByFarmId(farmId: string): Promise<number> {
    return Array.from(this.records.values()).filter((r) => r.farmId === farmId).length;
  }

  async upsert(farmId: string, observation: NormalizedWeatherDTO): Promise<WeatherRecord> {
    const results = await this.upsertMany(farmId, [observation]);
    return results[0];
  }

  async upsertMany(farmId: string, observations: NormalizedWeatherDTO[]): Promise<WeatherRecord[]> {
    const results: WeatherRecord[] = [];
    for (const obs of observations) {
      const key = this.makeKey(farmId, obs.observedAt);
      const existing = this.records.get(key);
      const record: WeatherRecord = {
        id: existing ? existing.id : `mock-rec-${Math.random().toString(36).substring(2, 9)}`,
        farmId,
        observedAt: obs.observedAt,
        latitude: obs.latitude as any,
        longitude: obs.longitude as any,
        temperatureC: obs.temperatureC as any,
        humidityPercent: obs.humidityPercent as any,
        rainfallMm: obs.rainfallMm as any,
        windSpeedKmh: obs.windSpeedKmh as any,
        windGustKmh: obs.windGustKmh as any,
        weatherCode: obs.weatherCode,
        source: obs.source,
        createdAt: existing ? existing.createdAt : new Date(),
      };
      this.records.set(key, record);
      results.push(record);
    }
    return results;
  }

  async findLatestByFarmId(farmId: string): Promise<WeatherRecord | null> {
    const farmRecords = Array.from(this.records.values()).filter((r) => r.farmId === farmId);
    if (farmRecords.length === 0) return null;
    return farmRecords.reduce((latest, r) => (r.observedAt.getTime() > latest.observedAt.getTime() ? r : latest), farmRecords[0]);
  }

  async findHistoricalByFarmId(
    farmId: string,
    from?: Date,
    to?: Date,
    limit: number = 100
  ): Promise<WeatherRecord[]> {
    let farmRecords = Array.from(this.records.values()).filter((r) => r.farmId === farmId);
    if (from) {
      farmRecords = farmRecords.filter((r) => r.observedAt.getTime() >= from.getTime());
    }
    if (to) {
      farmRecords = farmRecords.filter((r) => r.observedAt.getTime() <= to.getTime());
    }
    farmRecords.sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
    return farmRecords.slice(0, limit);
  }
}

class MockFarmRepository implements IFarmRepository {
  public farms: Map<string, Farm & { farmer?: Farmer }> = new Map();

  async findById(id: string): Promise<(Farm & { farmer?: Farmer }) | null> {
    return this.farms.get(id) || null;
  }
  async create(): Promise<any> { throw new Error('Not implemented'); }
  async findByReferenceNumber(): Promise<any> { return null; }
  async findByFarmerId(): Promise<any> { return []; }
  async findAll(): Promise<any> { return []; }
  async count(): Promise<number> { return this.farms.size; }
  async update(): Promise<any> { throw new Error('Not implemented'); }
  async delete(): Promise<any> { throw new Error('Not implemented'); }
}

class MockFarmBoundaryRepository implements IFarmBoundaryRepository {
  public boundaries: Map<string, RawBoundaryResult> = new Map();

  async findByFarmId(farmId: string): Promise<RawBoundaryResult | null> {
    return this.boundaries.get(farmId) || null;
  }
  async validateGeometry(): Promise<any> { return { isValid: true, reason: null }; }
  async create(): Promise<any> { throw new Error('Not implemented'); }
  async update(): Promise<any> { throw new Error('Not implemented'); }
  async deleteByFarmId(): Promise<boolean> { return true; }
}

class MockWeatherProvider implements IWeatherProvider {
  public readonly providerName = 'Open-Meteo';
  public currentCalls: { lat: number; lon: number }[] = [];
  public hourlyCalls: { lat: number; lon: number }[] = [];
  public mockCurrent: NormalizedWeatherDTO | null = null;
  public mockHourly: NormalizedWeatherDTO[] = [];

  async fetchCurrentWeather(latitude: number, longitude: number): Promise<NormalizedWeatherDTO> {
    this.currentCalls.push({ lat: latitude, lon: longitude });
    if (this.mockCurrent) {
      return this.mockCurrent;
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
    this.hourlyCalls.push({ lat: latitude, lon: longitude });
    return this.mockHourly;
  }
}

async function runWeatherServiceUnitTests() {
  console.log('🧪 Running Module 5 Stage 3: Weather Service & Repository Unit Tests...\n');

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

  const weatherRepo = new MockWeatherRepository();
  const farmRepo = new MockFarmRepository();
  const boundaryRepo = new MockFarmBoundaryRepository();
  const weatherProvider = new MockWeatherProvider();

  const service = new WeatherService(weatherRepo, farmRepo, boundaryRepo, weatherProvider);

  const sampleFarmId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  const sampleFarm: Farm = {
    id: sampleFarmId,
    farmerId: 'f0000000-0000-0000-0000-000000000001',
    farmName: 'Green Valley Plot 1',
    farmReferenceNumber: 'AGRISHIELD-FARM-12345678',
    cropName: 'Soybean',
    cropVariety: 'JS-335',
    sowingDate: new Date('2026-06-15'),
    expectedHarvestDate: new Date('2026-10-15'),
    farmArea: 5.5 as any,
    farmAreaUnit: AreaUnit.ACRE,
    village: 'Baramati',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '413102',
    status: FarmStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  farmRepo.farms.set(sampleFarmId, sampleFarm);

  const sampleBoundary: RawBoundaryResult = {
    id: 'b0000000-0000-0000-0000-000000000001',
    farmId: sampleFarmId,
    geojson: '{"type":"Polygon","coordinates":[]}',
    calculatedAreaSqM: 20000,
    calculatedAreaHectares: 2.0,
    calculatedAreaAcres: 4.94,
    centroidLatitude: 18.5204,
    centroidLongitude: 73.8567,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  boundaryRepo.boundaries.set(sampleFarmId, sampleBoundary);

  // ---------------------------------------------------------------------------
  // 1. Farm & Boundary Validation
  // ---------------------------------------------------------------------------
  let farmNotFoundCaught = false;
  try {
    await service.syncWeather('00000000-0000-0000-0000-000000000000');
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404 && err.message.includes('not found')) {
      farmNotFoundCaught = true;
    }
  }
  assert(farmNotFoundCaught, '1.1 Non-existent farm throws 404 Not Found error');

  const farmWithoutBoundaryId = 'f0000000-0000-0000-0000-000000000099';
  farmRepo.farms.set(farmWithoutBoundaryId, { ...sampleFarm, id: farmWithoutBoundaryId });
  let boundaryNotFoundCaught = false;
  try {
    await service.syncWeather(farmWithoutBoundaryId);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404 && err.message.includes('boundary not found')) {
      boundaryNotFoundCaught = true;
    }
  }
  assert(boundaryNotFoundCaught, '1.2 Farm without boundary throws 404 Not Found error');

  // ---------------------------------------------------------------------------
  // 2. Initial Sync Branching (count === 0)
  // ---------------------------------------------------------------------------
  // Prepare 24 hourly observations
  const baseTime = new Date('2026-09-22T12:00:00Z');
  weatherProvider.mockHourly = [];
  for (let i = 24; i >= 1; i--) {
    weatherProvider.mockHourly.push({
      observedAt: new Date(baseTime.getTime() - i * 3600 * 1000),
      latitude: 18.5204,
      longitude: 73.8567,
      temperatureC: 22 + (i % 6),
      humidityPercent: 60 + (i % 20),
      rainfallMm: i % 4 === 0 ? 1.0 : 0,
      windSpeedKmh: 10 + i,
      windGustKmh: 15 + i,
      weatherCode: 1,
      source: 'Open-Meteo',
    });
  }
  weatherProvider.mockCurrent = {
    observedAt: baseTime,
    latitude: 18.5204,
    longitude: 73.8567,
    temperatureC: 29.5,
    humidityPercent: 55,
    rainfallMm: 0,
    windSpeedKmh: 15,
    windGustKmh: 22,
    weatherCode: 0,
    source: 'Open-Meteo',
  };

  const initialSyncResult = await service.syncWeather(sampleFarmId);
  assert(initialSyncResult.synced === true, '2.1 Initial sync reports synced: true');
  assert(initialSyncResult.isInitialBackfill === true, '2.2 Initial sync sets isInitialBackfill: true');
  assert(initialSyncResult.recordsSynced === 25, `2.3 Initial sync recordsSynced reflects 25 unique records (got ${initialSyncResult.recordsSynced})`);
  assert(initialSyncResult.source === 'Open-Meteo', '2.4 Initial sync attributes source to Open-Meteo');
  assert(initialSyncResult.record.temperatureC === 29.5, '2.5 Response record represents the current observation (temperatureC: 29.5)');
  assert(initialSyncResult.record.weatherDescription === 'Clear sky', '2.6 Weather description mapped from WMO code 0 ("Clear sky")');
  assert(weatherProvider.currentCalls.length === 1, '2.7 Current weather provider called once');
  assert(weatherProvider.hourlyCalls.length === 1, '2.8 Hourly weather provider called once during initial sync');

  // Verify boundary centroid coordinates were passed to provider
  assert(weatherProvider.currentCalls[0].lat === 18.5204 && weatherProvider.currentCalls[0].lon === 73.8567, '2.9 Centroid coordinates from boundary forwarded to weather provider');

  // ---------------------------------------------------------------------------
  // 3. Subsequent Sync Branching (count > 0)
  // ---------------------------------------------------------------------------
  weatherProvider.currentCalls = [];
  weatherProvider.hourlyCalls = [];

  // Update current observation timestamp
  const nextTime = new Date('2026-09-22T13:00:00Z');
  weatherProvider.mockCurrent = {
    observedAt: nextTime,
    latitude: 18.5204,
    longitude: 73.8567,
    temperatureC: 30.2,
    humidityPercent: 52,
    rainfallMm: 0,
    windSpeedKmh: 16,
    windGustKmh: 24,
    weatherCode: 1,
    source: 'Open-Meteo',
  };

  const subsequentSyncResult = await service.syncWeather(sampleFarmId);
  assert(subsequentSyncResult.synced === true, '3.1 Subsequent sync reports synced: true');
  assert(subsequentSyncResult.isInitialBackfill === false, '3.2 Subsequent sync sets isInitialBackfill: false');
  assert(subsequentSyncResult.recordsSynced === 1, '3.3 Subsequent sync recordsSynced equals 1');
  assert(subsequentSyncResult.record.temperatureC === 30.2, '3.4 Subsequent sync record contains latest observation (30.2)');
  assert(weatherProvider.currentCalls.length === 1, '3.5 Current weather provider called during subsequent sync');
  assert(weatherProvider.hourlyCalls.length === 0, '3.6 Hourly weather provider was NOT called during subsequent sync');

  // ---------------------------------------------------------------------------
  // 4. Idempotency on Repeated Synchronization
  // ---------------------------------------------------------------------------
  const countBefore = await weatherRepo.countByFarmId(sampleFarmId);
  // Re-sync with identical observation (same observedAt)
  const repeatedSyncResult = await service.syncWeather(sampleFarmId);
  const countAfter = await weatherRepo.countByFarmId(sampleFarmId);
  assert(countAfter === countBefore, `4.1 Repeated sync does not create duplicate records (count remained ${countAfter})`);
  assert(repeatedSyncResult.synced === true, '4.2 Repeated sync completes successfully with idempotency');

  // ---------------------------------------------------------------------------
  // 5. Latest Weather Retrieval
  // ---------------------------------------------------------------------------
  weatherProvider.currentCalls = [];
  const latestWeather = await service.getLatestWeather(sampleFarmId);
  assert(latestWeather !== null, '5.1 getLatestWeather returns latest record');
  assert(latestWeather?.temperatureC === 30.2, '5.2 Returned latest observation matches most recent (30.2)');
  assert(latestWeather?.weatherDescription === 'Mainly clear', '5.3 Weather code 1 mapped to "Mainly clear"');
  assert(weatherProvider.currentCalls.length === 0, '5.4 getLatestWeather read PostgreSQL only (zero external provider calls)');

  // ---------------------------------------------------------------------------
  // 6. Historical Data Retrieval (Chronological Ordering & Filtering)
  // ---------------------------------------------------------------------------
  const history = await service.getHistoricalWeather(sampleFarmId);
  assert(Array.isArray(history) && history.length > 0, '6.1 getHistoricalWeather returns observation array');
  assert(weatherProvider.currentCalls.length === 0 && weatherProvider.hourlyCalls.length === 0, '6.2 Historical retrieval read PostgreSQL only (zero provider calls)');

  // Verify chronological ascending order (observedAt ASC)
  let isChronological = true;
  for (let i = 1; i < history.length; i++) {
    if (new Date(history[i].observedAt).getTime() < new Date(history[i - 1].observedAt).getTime()) {
      isChronological = false;
      break;
    }
  }
  assert(isChronological, '6.3 Historical observations are ordered chronologically ascending (observedAt ASC)');

  // ---------------------------------------------------------------------------
  // 7. Historical Date Range Validation
  // ---------------------------------------------------------------------------
  let invalidRangeCaught = false;
  try {
    await service.getHistoricalWeather(
      sampleFarmId,
      '2026-09-22T15:00:00Z',
      '2026-09-22T10:00:00Z' // from > to
    );
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400 && err.message.includes("Invalid date range")) {
      invalidRangeCaught = true;
    }
  }
  assert(invalidRangeCaught, '7.1 Reversed date range (from > to) throws 400 Bad Request');

  // ---------------------------------------------------------------------------
  // 8. WMO Description Lookup Coverage
  // ---------------------------------------------------------------------------
  assert(getWeatherDescription(0) === 'Clear sky', '8.1 Code 0 translates to "Clear sky"');
  assert(getWeatherDescription(61) === 'Slight rain', '8.2 Code 61 translates to "Slight rain"');
  assert(getWeatherDescription(95) === 'Thunderstorm', '8.3 Code 95 translates to "Thunderstorm"');
  assert(getWeatherDescription(999) === 'Unknown weather condition', '8.4 Unmapped code translates to "Unknown weather condition"');

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Weather Service Unit Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runWeatherServiceUnitTests().catch((error) => {
  console.error('Fatal error during weather service unit test run:', error);
  process.exit(1);
});
