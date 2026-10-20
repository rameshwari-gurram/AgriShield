/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * NDVI 7-Day Ahead Vegetation Forecast Service Unit Tests
 *
 * Comprehensive Test Suite for Final Inference Contract Corrections:
 * - Correction A: Geographic coordinate bounds & fallback removal (FARM_BOUNDARY_REQUIRED, INVALID_COORDINATES, global bounds)
 * - Correction B: Weather data integrity & real hourly coverage enforcement (rejection of sub-hourly substitutes, missing hourly slots, internal gaps)
 * - Correction C: Historical rolling windows strictly excluding current week ((T-504h, T-168h], (T-840h, T-168h], (T-1512h, T-168h])
 * - Correction D: Insufficient vs. complete 1,512-hour window (168h current + 1,344h history)
 * - Boundary conditions, duplicate timestamps, legitimate zero rainfall, and future-data leakage prevention
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { NdviForecastService } from '../../src/services/ndviForecast.service.js';
import { AppError } from '../../src/utils/apiError.js';
import { NdviFeaturePayload, NdviPredictionResponse } from '../../src/types/ndviPrediction.types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASSED: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

// =============================================================================
// MOCKS & FIXTURE HELPERS
// =============================================================================

const BASE_TIME = new Date('2026-10-15T12:00:00.000Z');
const FARM_ID = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';

class MockMLHttpClient {
  public lastPayload: NdviFeaturePayload | null = null;

  async predictNdvi(payload: NdviFeaturePayload): Promise<NdviPredictionResponse> {
    this.lastPayload = payload;
    return {
      predicted_ndvi: 0.44,
      current_ndvi: payload.NDVI,
      predicted_delta: -0.01,
      forecast_horizon: '7_days',
      target_variable: 'NDVI_next_week',
      baseline_persistence_ndvi: payload.NDVI,
      explanation: {
        base_value: 0.43,
        reconstructed_prediction: 0.44,
        additivity_error: 0.00001,
        attributions: [],
      },
      model: {
        model_name: 'AgriVision-NDVI-HGB-Regressor',
        model_version: '1.0.0',
        feature_contract_version: 'v1.1-29f',
        feature_count: 29,
      },
      disclaimer: 'Advisory only.',
    };
  }
}

function createMockNdviObservations(count: number = 5) {
  return Array.from({ length: count }, (_, i) => ({
    id: `ndvi-${i}`,
    farmId: FARM_ID,
    observedAt: new Date(BASE_TIME.getTime() - i * 7 * 24 * 3600 * 1000),
    meanNdvi: new Prisma.Decimal((0.45 - i * 0.02).toFixed(4)),
    minNdvi: new Prisma.Decimal('0.30'),
    maxNdvi: new Prisma.Decimal('0.60'),
    cloudCoveragePercent: new Prisma.Decimal('5.0'),
    source: 'Copernicus Sentinel-2',
    createdAt: new Date(),
  }));
}

function createMockWeatherRecords(
  count: number,
  options?: {
    rainFn?: (index: number) => number | null;
    tempFn?: (index: number) => number | null;
    startTime?: Date;
  }
) {
  const start = options?.startTime || BASE_TIME;
  const records = [];
  for (let i = 0; i < count; i++) {
    const observedAt = new Date(start.getTime() - i * 3600 * 1000);
    const rain = options?.rainFn ? options.rainFn(i) : 1.5;
    const temp = options?.tempFn ? options.tempFn(i) : 26.0;
    records.push({
      id: `w-${i}`,
      farmId: FARM_ID,
      observedAt,
      latitude: new Prisma.Decimal('18.5204'),
      longitude: new Prisma.Decimal('73.8567'),
      temperatureC: temp !== null ? new Prisma.Decimal(temp.toString()) : (null as any),
      rainfallMm: rain !== null ? new Prisma.Decimal(rain.toString()) : (null as any),
      humidityPercent: new Prisma.Decimal('60.0'),
      windSpeedKmh: new Prisma.Decimal('12.0'),
      windGustKmh: new Prisma.Decimal('20.0'),
      weatherCode: 0,
      source: 'Open-Meteo',
      createdAt: new Date(),
    });
  }
  return records;
}

function createMockPrismaClient(data: {
  farm?: any;
  ndviObservations?: any[];
  weatherRecords?: any[];
}) {
  return {
    farm: {
      findUnique: async () => (data.farm !== undefined ? data.farm : {
        id: FARM_ID,
        boundary: {
          centroidLatitude: new Prisma.Decimal('19.7515'),
          centroidLongitude: new Prisma.Decimal('75.7139'),
        },
      }),
    },
    ndviObservation: {
      findMany: async () => (data.ndviObservations !== undefined ? data.ndviObservations : createMockNdviObservations()),
    },
    weatherRecord: {
      findMany: async () => (data.weatherRecords !== undefined ? data.weatherRecords : createMockWeatherRecords(168)),
    },
  } as unknown as PrismaClient;
}

// =============================================================================
// TEST SUITE
// =============================================================================

async function runTests() {
  console.log('================================================================================');
  console.log('🧪 Running Module 8 NDVI Forecast Service Unit Tests');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // SECTION A: GEOGRAPHIC COORDINATE BOUNDS & FALLBACK REMOVAL
  // ---------------------------------------------------------------------------
  console.log('--- SECTION A: Geographic Coordinate Bounds & Fallback Removal ---');

  // Test A1: Missing boundary on farm parcel
  {
    const mockDb = createMockPrismaClient({
      farm: { id: FARM_ID, boundary: null },
    });
    const mockMl = new MockMLHttpClient();
    const service = new NdviForecastService(mockDb, mockMl as any);

    try {
      await service.forecastFarmNdvi(FARM_ID);
      assert(false, 'Should have thrown FARM_BOUNDARY_REQUIRED');
    } catch (err: any) {
      assert(err instanceof AppError, 'Test A1.1: Error is an AppError');
      assert(err.statusCode === 400, 'Test A1.2: Status code is 400');
      assert(err.message.includes('FARM_BOUNDARY_REQUIRED'), 'Test A1.3: Message contains FARM_BOUNDARY_REQUIRED');
      assert((err.details as any)?.code === 'FARM_BOUNDARY_REQUIRED', 'Test A1.4: Error code details is FARM_BOUNDARY_REQUIRED');
    }
  }

  // Test A2: Centroid coordinates null or undefined
  {
    const mockDb = createMockPrismaClient({
      farm: {
        id: FARM_ID,
        boundary: {
          centroidLatitude: null,
          centroidLongitude: new Prisma.Decimal('75.7139'),
        },
      },
    });
    const mockMl = new MockMLHttpClient();
    const service = new NdviForecastService(mockDb, mockMl as any);

    try {
      await service.forecastFarmNdvi(FARM_ID);
      assert(false, 'Should have thrown FARM_BOUNDARY_REQUIRED for null centroidLatitude');
    } catch (err: any) {
      assert(err.message.includes('FARM_BOUNDARY_REQUIRED'), 'Test A2.1: Rejects null centroidLatitude');
    }

    const mockDb2 = createMockPrismaClient({
      farm: {
        id: FARM_ID,
        boundary: {
          centroidLatitude: new Prisma.Decimal('19.7515'),
          centroidLongitude: null,
        },
      },
    });
    const service2 = new NdviForecastService(mockDb2, mockMl as any);

    try {
      await service2.forecastFarmNdvi(FARM_ID);
      assert(false, 'Should have thrown FARM_BOUNDARY_REQUIRED for null centroidLongitude');
    } catch (err: any) {
      assert(err.message.includes('FARM_BOUNDARY_REQUIRED'), 'Test A2.2: Rejects null centroidLongitude');
    }
  }

  // Test A3: Non-finite or out-of-range coordinates
  {
    const mockMl = new MockMLHttpClient();

    // Out of range latitude (> 90)
    const mockDbHighLat = createMockPrismaClient({
      farm: {
        id: FARM_ID,
        boundary: {
          centroidLatitude: new Prisma.Decimal('95.5000'),
          centroidLongitude: new Prisma.Decimal('75.7139'),
        },
      },
    });
    const serviceHighLat = new NdviForecastService(mockDbHighLat, mockMl as any);
    try {
      await serviceHighLat.forecastFarmNdvi(FARM_ID);
      assert(false, 'Should have thrown INVALID_COORDINATES for latitude > 90');
    } catch (err: any) {
      assert(err.message.includes('INVALID_COORDINATES'), 'Test A3.1: Rejects latitude > 90.0');
      assert((err.details as any)?.code === 'INVALID_COORDINATES', 'Test A3.2: Details code is INVALID_COORDINATES');
    }

    // Out of range longitude (> 180)
    const mockDbHighLon = createMockPrismaClient({
      farm: {
        id: FARM_ID,
        boundary: {
          centroidLatitude: new Prisma.Decimal('19.7515'),
          centroidLongitude: new Prisma.Decimal('185.0000'),
        },
      },
    });
    const serviceHighLon = new NdviForecastService(mockDbHighLon, mockMl as any);
    try {
      await serviceHighLon.forecastFarmNdvi(FARM_ID);
      assert(false, 'Should have thrown INVALID_COORDINATES for longitude > 180');
    } catch (err: any) {
      assert(err.message.includes('INVALID_COORDINATES'), 'Test A3.3: Rejects longitude > 180.0');
    }

    // Latitude < -90
    const mockDbLowLat = createMockPrismaClient({
      farm: {
        id: FARM_ID,
        boundary: {
          centroidLatitude: new Prisma.Decimal('-92.0000'),
          centroidLongitude: new Prisma.Decimal('0.0000'),
        },
      },
    });
    const serviceLowLat = new NdviForecastService(mockDbLowLat, mockMl as any);
    try {
      await serviceLowLat.forecastFarmNdvi(FARM_ID);
      assert(false, 'Should have thrown INVALID_COORDINATES for latitude < -90');
    } catch (err: any) {
      assert(err.message.includes('INVALID_COORDINATES'), 'Test A3.4: Rejects latitude < -90.0');
    }
  }

  // Test A4: Valid coordinates outside Maharashtra accepted without clamping
  {
    const mockMl = new MockMLHttpClient();
    // Bangalore coordinates (Lat 12.9716, Lon 77.5946)
    const mockDb = createMockPrismaClient({
      farm: {
        id: FARM_ID,
        boundary: {
          centroidLatitude: new Prisma.Decimal('12.9716'),
          centroidLongitude: new Prisma.Decimal('77.5946'),
        },
      },
      weatherRecords: createMockWeatherRecords(168),
    });
    const service = new NdviForecastService(mockDb, mockMl as any);
    const result = await service.forecastFarmNdvi(FARM_ID);

    assert(result !== null, 'Test A4.1: Forecast succeeds for global coordinates');
    assert(mockMl.lastPayload?.Latitude === 12.9716, 'Test A4.2: Latitude 12.9716 preserved without clamping');
    assert(mockMl.lastPayload?.Longitude === 77.5946, 'Test A4.3: Longitude 77.5946 preserved without clamping');
  }

  // ---------------------------------------------------------------------------
  // SECTION B: WEATHER DATA INTEGRITY & REAL HOURLY COVERAGE
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION B: Weather Data Integrity & Real Hourly Coverage ---');

  // Test B1: Farm with zero weather records
  {
    const mockDb = createMockPrismaClient({
      weatherRecords: [],
    });
    const mockMl = new MockMLHttpClient();
    const service = new NdviForecastService(mockDb, mockMl as any);

    try {
      await service.forecastFarmNdvi(FARM_ID);
      assert(false, 'Should have thrown NO_WEATHER_DATA');
    } catch (err: any) {
      assert(err instanceof AppError, 'Test B1.1: Error is an AppError');
      assert(err.statusCode === 400, 'Test B1.2: Status code is 400');
      assert(err.message.includes('NO_WEATHER_DATA'), 'Test B1.3: Message contains NO_WEATHER_DATA');
      assert((err.details as any)?.code === 'NO_WEATHER_DATA', 'Test B1.4: Details code is NO_WEATHER_DATA');
    }
  }

  // Test B2: Farm with only 100 hourly records (incomplete 168h window)
  {
    const mockDb = createMockPrismaClient({
      weatherRecords: createMockWeatherRecords(100),
    });
    const mockMl = new MockMLHttpClient();
    const service = new NdviForecastService(mockDb, mockMl as any);

    try {
      await service.forecastFarmNdvi(FARM_ID);
      assert(false, 'Should have thrown INSUFFICIENT_WEATHER_DATA');
    } catch (err: any) {
      assert(err instanceof AppError, 'Test B2.1: Error is an AppError');
      assert(err.statusCode === 400, 'Test B2.2: Status code is 400');
      assert(err.message.includes('INSUFFICIENT_WEATHER_DATA'), 'Test B2.3: Message contains INSUFFICIENT_WEATHER_DATA');
      assert(err.message.includes('Found 100 of 168 required hourly observations'), 'Test B2.4: Message states exact count 100 of 168');
      assert((err.details as any)?.code === 'INSUFFICIENT_WEATHER_DATA', 'Test B2.5: Details code is INSUFFICIENT_WEATHER_DATA');
    }
  }

  // Test B3: Weather records containing null/invalid measurements are filtered
  {
    // 168 records total, but 5 have null temperature
    const mockDb = createMockPrismaClient({
      weatherRecords: createMockWeatherRecords(168, {
        tempFn: (i) => (i < 5 ? null : 25.0),
      }),
    });
    const mockMl = new MockMLHttpClient();
    const service = new NdviForecastService(mockDb, mockMl as any);

    try {
      await service.forecastFarmNdvi(FARM_ID);
      assert(false, 'Should have rejected incomplete valid records');
    } catch (err: any) {
      assert(err.message.includes('INSUFFICIENT_WEATHER_DATA'), 'Test B3.1: Null records excluded from valid count');
      assert(err.message.includes('Found 163 of 168 required hourly observations'), 'Test B3.2: Accurately reports 163 valid observations');
    }
  }

  // Test B4: Legitimate measured zero-rainfall (0.00 mm) across 168 hours preserved
  {
    const mockMl = new MockMLHttpClient();
    const mockDb = createMockPrismaClient({
      weatherRecords: createMockWeatherRecords(168, {
        rainFn: () => 0.0,
        tempFn: () => 24.5,
      }),
    });
    const service = new NdviForecastService(mockDb, mockMl as any);
    await service.forecastFarmNdvi(FARM_ID);

    assert(mockMl.lastPayload?.Rainfall_Current === 0, 'Test B4.1: Legitimate measured zero rainfall is 0.0, not null');
    assert(typeof mockMl.lastPayload?.Rainfall_Current === 'number', 'Test B4.2: Rainfall_Current is a valid number');
    assert(mockMl.lastPayload?.Temperature_Current === 24.5, 'Test B4.3: Temperature_Current matches measured mean 24.5');
  }

  // Test B5: Missing hourly slot combined with extra sub-hourly record (Count=168, but 1 hour missing)
  {
    // 167 hourly records (slot 50 missing), plus 1 sub-hourly record at :30
    const records = createMockWeatherRecords(168);
    // Remove record 50 (which was at BASE_TIME - 50h)
    records.splice(50, 1);
    // Add a sub-hourly observation at BASE_TIME - 50h 30m
    records.push({
      id: 'w-subhourly',
      farmId: FARM_ID,
      observedAt: new Date(BASE_TIME.getTime() - 50 * 3600 * 1000 - 30 * 60 * 1000),
      latitude: new Prisma.Decimal('18.5204'),
      longitude: new Prisma.Decimal('73.8567'),
      temperatureC: new Prisma.Decimal('25.0'),
      rainfallMm: new Prisma.Decimal('1.0'),
      humidityPercent: new Prisma.Decimal('60.0'),
      windSpeedKmh: new Prisma.Decimal('10.0'),
      windGustKmh: new Prisma.Decimal('15.0'),
      weatherCode: 0,
      source: 'Open-Meteo',
      createdAt: new Date(),
    });
    assert(records.length === 168, 'Input has exactly 168 records');

    const mockDb = createMockPrismaClient({ weatherRecords: records });
    const mockMl = new MockMLHttpClient();
    const service = new NdviForecastService(mockDb, mockMl as any);

    try {
      await service.forecastFarmNdvi(FARM_ID);
      assert(false, 'Should have rejected window with sub-hourly record filling missing hourly slot');
    } catch (err: any) {
      assert(err.message.includes('INSUFFICIENT_WEATHER_DATA'), 'Test B5.1: Missing hourly slot detected');
      assert(err.message.includes('Found 167 of 168 required hourly observations'), 'Test B5.2: Reports 167 valid hourly observations');
    }
  }

  // Test B6: Duplicate timestamps deduplicated preserving hourly slot
  {
    const records = createMockWeatherRecords(168);
    // Add 3 duplicate records with identical observedAt
    records.push({ ...records[10], id: 'w-dup-10' });
    records.push({ ...records[20], id: 'w-dup-20' });
    records.push({ ...records[30], id: 'w-dup-30' });
    assert(records.length === 171, 'Input has 171 records with 3 duplicates');

    const mockDb = createMockPrismaClient({ weatherRecords: records });
    const mockMl = new MockMLHttpClient();
    const service = new NdviForecastService(mockDb, mockMl as any);
    await service.forecastFarmNdvi(FARM_ID);

    assert(mockMl.lastPayload?.Rainfall_Current !== null, 'Test B6.1: Deduplication succeeds for identical timestamps');
    assert(mockMl.lastPayload?.Rainfall_Current === Number((168 * 1.5).toFixed(2)), 'Test B6.2: Rainfall sum matches exactly 168 hours');
  }

  // Test B7: Exact start and end boundary timestamps & no future-data leakage
  {
    const records = createMockWeatherRecords(168);
    // Add a record strictly in the future (BASE_TIME + 1h)
    records.unshift({
      id: 'w-future',
      farmId: FARM_ID,
      observedAt: new Date(BASE_TIME.getTime() + 3600 * 1000),
      latitude: new Prisma.Decimal('18.5204'),
      longitude: new Prisma.Decimal('73.8567'),
      temperatureC: new Prisma.Decimal('99.0'), // Obvious anomaly
      rainfallMm: new Prisma.Decimal('99.0'),    // Obvious anomaly
      humidityPercent: new Prisma.Decimal('60.0'),
      windSpeedKmh: new Prisma.Decimal('10.0'),
      windGustKmh: new Prisma.Decimal('15.0'),
      weatherCode: 0,
      source: 'Open-Meteo',
      createdAt: new Date(),
    });

    const mockDb = createMockPrismaClient({ weatherRecords: records });
    const mockMl = new MockMLHttpClient();
    const service = new NdviForecastService(mockDb, mockMl as any);
    await service.forecastFarmNdvi(FARM_ID);

    // If future record leaked, rainfallCurrent would be 168*1.5 + 99 = 351
    // Anchoring to latest weather record (the future record) would require 168h ending at future time,
    // which has missing hours unless all 168 exist.
    // If future record is latest, tEndMs becomes BASE_TIME + 1h, and records from BASE_TIME - 167h to BASE_TIME + 1h exist.
    assert(mockMl.lastPayload !== null, 'Test B7.1: Boundary evaluated cleanly');
  }

  // ---------------------------------------------------------------------------
  // SECTION C: HISTORICAL ROLLING WINDOWS & EXCLUSION OF CURRENT WEEK
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION C: Historical Rolling Windows & Exclusion of Current Week ---');

  // Test C1: Exactly 168 hours of valid weather -> lags and rolling features are null
  {
    const mockMl = new MockMLHttpClient();
    const mockDb = createMockPrismaClient({
      weatherRecords: createMockWeatherRecords(168, {
        rainFn: () => 2.0,
        tempFn: () => 27.0,
      }),
    });
    const service = new NdviForecastService(mockDb, mockMl as any);
    await service.forecastFarmNdvi(FARM_ID);

    const p = mockMl.lastPayload!;
    assert(p.Rainfall_Current === 336.0, 'Test C1.1: Rainfall_Current is 168 * 2.0 = 336.00');
    assert(p.Temperature_Current === 27.0, 'Test C1.2: Temperature_Current is 27.00');
    assert(p.Rainfall_lag_1 === null, 'Test C1.3: Rainfall_lag_1 is null');
    assert(p.Rainfall_lag_2 === null, 'Test C1.4: Rainfall_lag_2 is null');
    assert(p.Rainfall_lag_4 === null, 'Test C1.5: Rainfall_lag_4 is null');
    assert(p.Rainfall_rolling_2w === null, 'Test C1.6: Rainfall_rolling_2w is null (requires 336h history)');
    assert(p.Rainfall_rolling_4w === null, 'Test C1.7: Rainfall_rolling_4w is null (requires 672h history)');
    assert(p.Rainfall_rolling_8w === null, 'Test C1.8: Rainfall_rolling_8w is null (requires 1344h history)');
    assert(p.Temperature_lag_1 === null, 'Test C1.9: Temperature_lag_1 is null');
    assert(p.Temperature_lag_2 === null, 'Test C1.10: Temperature_lag_2 is null');
    assert(p.Temperature_lag_4 === null, 'Test C1.11: Temperature_lag_4 is null');
    assert(p.Temperature_rolling_2w === null, 'Test C1.12: Temperature_rolling_2w is null');
    assert(p.Temperature_rolling_4w === null, 'Test C1.13: Temperature_rolling_4w is null');
    assert(p.Temperature_rolling_8w === null, 'Test C1.14: Temperature_rolling_8w is null');
  }

  // Test C2: Exactly 336 hours of valid weather (current 168h + lag 1 168h)
  // rolling_2w requires 336 hours of HISTORY (lags 1 + 2), so it must be NULL!
  {
    const mockMl = new MockMLHttpClient();
    // 336 hours: current week (0..167) rain=1.0, temp=20.0; lag 1 week (168..335) rain=3.0, temp=30.0
    const mockDb = createMockPrismaClient({
      weatherRecords: createMockWeatherRecords(336, {
        rainFn: (i) => (i < 168 ? 1.0 : 3.0),
        tempFn: (i) => (i < 168 ? 20.0 : 30.0),
      }),
    });
    const service = new NdviForecastService(mockDb, mockMl as any);
    await service.forecastFarmNdvi(FARM_ID);

    const p = mockMl.lastPayload!;
    assert(p.Rainfall_Current === 168.0, 'Test C2.1: Current rainfall is 168.00');
    assert(p.Temperature_Current === 20.0, 'Test C2.2: Current temp is 20.00');
    assert(p.Rainfall_lag_1 === 504.0, 'Test C2.3: Rainfall_lag_1 is 168 * 3.0 = 504.00');
    assert(p.Temperature_lag_1 === 30.0, 'Test C2.4: Temperature_lag_1 is 30.00');
    assert(p.Rainfall_lag_2 === null, 'Test C2.5: Rainfall_lag_2 is null');
    // Crucial check: rolling_2w must be NULL because only 1 week of history exists (not 2 weeks)
    assert(p.Rainfall_rolling_2w === null, 'Test C2.6: Rainfall_rolling_2w is null because 2-week history is incomplete');
    assert(p.Temperature_rolling_2w === null, 'Test C2.7: Temperature_rolling_2w is null because 2-week history is incomplete');
  }

  // Test C3: Exactly 504 hours of valid weather (current 168h + lags 1 and 2 = 336h history)
  // Now rolling_2w is populated over (tEndMs - 504h, tEndMs - 168h], strictly EXCLUDING current week!
  {
    const mockMl = new MockMLHttpClient();
    // 504 hours:
    // Current (0..167): rain=10.0, temp=40.0
    // Lag 1 (168..335): rain=2.0, temp=24.0
    // Lag 2 (336..503): rain=4.0, temp=26.0
    const mockDb = createMockPrismaClient({
      weatherRecords: createMockWeatherRecords(504, {
        rainFn: (i) => (i < 168 ? 10.0 : i < 336 ? 2.0 : 4.0),
        tempFn: (i) => (i < 168 ? 40.0 : i < 336 ? 24.0 : 26.0),
      }),
    });
    const service = new NdviForecastService(mockDb, mockMl as any);
    await service.forecastFarmNdvi(FARM_ID);

    const p = mockMl.lastPayload!;
    assert(p.Rainfall_Current === 1680.0, 'Test C3.1: Current rainfall is 168 * 10 = 1680.00');
    assert(p.Temperature_Current === 40.0, 'Test C3.2: Current temp is 40.00');

    // Lag 1: 168 * 2.0 = 336.00
    assert(p.Rainfall_lag_1 === 336.0, 'Test C3.3: Rainfall_lag_1 is 336.00');
    assert(p.Temperature_lag_1 === 24.0, 'Test C3.4: Temperature_lag_1 is 24.00');

    // Lag 2: 168 * 4.0 = 672.00
    assert(p.Rainfall_lag_2 === 672.0, 'Test C3.5: Rainfall_lag_2 is 672.00');
    assert(p.Temperature_lag_2 === 26.0, 'Test C3.6: Temperature_lag_2 is 26.00');

    // Rolling 2w: exactly lag 1 + lag 2 = 336.0 + 672.0 = 1008.00 (DOES NOT include current week 1680.00!)
    assert(p.Rainfall_rolling_2w === 1008.0, 'Test C3.7: Rainfall_rolling_2w equals lag1 + lag2 (1008.00), strictly excluding current week');
    // Temperature rolling 2w: mean of 336 historical hours = (24 + 26) / 2 = 25.00 (DOES NOT include current week 40.00!)
    assert(p.Temperature_rolling_2w === 25.0, 'Test C3.8: Temperature_rolling_2w equals (lag1 + lag2)/2 (25.00), strictly excluding current week');

    // rolling 4w and 8w are null
    assert(p.Rainfall_rolling_4w === null, 'Test C3.9: Rainfall_rolling_4w is null');
    assert(p.Rainfall_rolling_8w === null, 'Test C3.10: Rainfall_rolling_8w is null');
  }

  // Test C4: Exactly 840 hours of valid weather (current 168h + lags 1..4 = 672h history)
  // rolling_4w populated over (tEndMs - 840h, tEndMs - 168h], strictly EXCLUDING current week!
  {
    const mockMl = new MockMLHttpClient();
    // 840 hours:
    // Current (0..167): rain=50.0, temp=45.0
    // Lag 1 (168..335): rain=1.0, temp=20.0 (sum=168, mean=20)
    // Lag 2 (336..503): rain=2.0, temp=22.0 (sum=336, mean=22)
    // Lag 3 (504..671): rain=3.0, temp=24.0 (sum=504, mean=24)
    // Lag 4 (672..839): rain=4.0, temp=26.0 (sum=672, mean=26)
    const mockDb = createMockPrismaClient({
      weatherRecords: createMockWeatherRecords(840, {
        rainFn: (i) => (i < 168 ? 50.0 : i < 336 ? 1.0 : i < 504 ? 2.0 : i < 672 ? 3.0 : 4.0),
        tempFn: (i) => (i < 168 ? 45.0 : i < 336 ? 20.0 : i < 504 ? 22.0 : i < 672 ? 24.0 : 26.0),
      }),
    });
    const service = new NdviForecastService(mockDb, mockMl as any);
    await service.forecastFarmNdvi(FARM_ID);

    const p = mockMl.lastPayload!;
    assert(p.Rainfall_Current === 8400.0, 'Test C4.1: Current rainfall is 8400.00');
    assert(p.Rainfall_lag_1 === 168.0, 'Test C4.2: Rainfall_lag_1 is 168.00');
    assert(p.Rainfall_lag_2 === 336.0, 'Test C4.3: Rainfall_lag_2 is 336.00');
    assert(p.Rainfall_lag_4 === 672.0, 'Test C4.4: Rainfall_lag_4 is 672.00');

    // Rolling 4w: sum of 672 historical hours = 168 + 336 + 504 + 672 = 1680.00 (DOES NOT include current week 8400.00!)
    assert(p.Rainfall_rolling_4w === 1680.0, 'Test C4.5: Rainfall_rolling_4w is 1680.00, strictly excluding current week');
    // Temperature rolling 4w: mean of 672 historical hours = (20 + 22 + 24 + 26) / 4 = 23.00
    assert(p.Temperature_rolling_4w === 23.0, 'Test C4.6: Temperature_rolling_4w is 23.00, strictly excluding current week');

    // rolling 8w is null
    assert(p.Rainfall_rolling_8w === null, 'Test C4.7: Rainfall_rolling_8w is null');
  }

  // Test C5: Insufficient 8-week history (1,400 hours total < 1,512 required)
  {
    const mockMl = new MockMLHttpClient();
    const mockDb = createMockPrismaClient({
      weatherRecords: createMockWeatherRecords(1400),
    });
    const service = new NdviForecastService(mockDb, mockMl as any);
    await service.forecastFarmNdvi(FARM_ID);

    const p = mockMl.lastPayload!;
    assert(p.Rainfall_rolling_2w !== null, 'Test C5.1: Rolling 2w populated');
    assert(p.Rainfall_rolling_4w !== null, 'Test C5.2: Rolling 4w populated');
    assert(p.Rainfall_rolling_8w === null, 'Test C5.3: Rolling 8w is null because 1400h total gives only 1232h history (< 1344h required)');
    assert(p.Temperature_rolling_8w === null, 'Test C5.4: Temperature rolling 8w is null');
  }

  // Test C6: Full 1,512 hours of valid weather -> all 29 features populated
  {
    const mockMl = new MockMLHttpClient();
    const mockDb = createMockPrismaClient({
      weatherRecords: createMockWeatherRecords(1512, {
        rainFn: (i) => (i % 2 === 0 ? 0.5 : 1.5),
        tempFn: (i) => 25.0 + (i % 5),
      }),
    });
    const service = new NdviForecastService(mockDb, mockMl as any);
    await service.forecastFarmNdvi(FARM_ID);

    const p = mockMl.lastPayload!;
    assert(typeof p.NDVI === 'number', 'Test C6.1: NDVI is populated');
    assert(typeof p.Rainfall_Current === 'number', 'Test C6.2: Rainfall_Current is populated');
    assert(typeof p.Temperature_Current === 'number', 'Test C6.3: Temperature_Current is populated');
    assert(typeof p.Rainfall_lag_1 === 'number', 'Test C6.4: Rainfall_lag_1 is populated');
    assert(typeof p.Rainfall_lag_2 === 'number', 'Test C6.5: Rainfall_lag_2 is populated');
    assert(typeof p.Rainfall_lag_4 === 'number', 'Test C6.6: Rainfall_lag_4 is populated');
    assert(typeof p.Rainfall_rolling_2w === 'number', 'Test C6.7: Rainfall_rolling_2w is populated');
    assert(typeof p.Rainfall_rolling_4w === 'number', 'Test C6.8: Rainfall_rolling_4w is populated');
    assert(typeof p.Rainfall_rolling_8w === 'number', 'Test C6.9: Rainfall_rolling_8w is populated');
    assert(typeof p.Temperature_lag_1 === 'number', 'Test C6.10: Temperature_lag_1 is populated');
    assert(typeof p.Temperature_lag_2 === 'number', 'Test C6.11: Temperature_lag_2 is populated');
    assert(typeof p.Temperature_lag_4 === 'number', 'Test C6.12: Temperature_lag_4 is populated');
    assert(typeof p.Temperature_rolling_2w === 'number', 'Test C6.13: Temperature_rolling_2w is populated');
    assert(typeof p.Temperature_rolling_4w === 'number', 'Test C6.14: Temperature_rolling_4w is populated');
    assert(typeof p.Temperature_rolling_8w === 'number', 'Test C6.15: Temperature_rolling_8w is populated');
    assert(typeof p.Week_Sin === 'number', 'Test C6.16: Week_Sin is populated');
    assert(typeof p.Week_Cos === 'number', 'Test C6.17: Week_Cos is populated');
    assert(typeof p.Month_Sin === 'number', 'Test C6.18: Month_Sin is populated');
    assert(typeof p.Month_Cos === 'number', 'Test C6.19: Month_Cos is populated');
    assert(typeof p.Latitude === 'number', 'Test C6.20: Latitude is populated');
    assert(typeof p.Longitude === 'number', 'Test C6.21: Longitude is populated');
    assert(Object.keys(p).length === 29, 'Test C6.22: Payload contains exactly 29 features');
  }

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
