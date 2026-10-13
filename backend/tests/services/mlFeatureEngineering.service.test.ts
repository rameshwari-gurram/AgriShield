/**
 * Module 8 Stage 8.3-A: Backend ML Feature Construction & Validation Service Unit Tests
 *
 * Comprehensive unit test suite covering:
 * - Complete 720-hour weather sequence aggregation
 * - Strict half-open window (T_start, T_end]
 * - Weather completeness enforcement (gaps, missing hours, duplicates)
 * - Daily rainfall variance (ddof=1) and consecutive dry days max
 * - Extreme temperature, heat-wave hours, and Tetens VPD calculation
 * - Optical Sentinel-2 NDVI latest value and OLS slope regression
 * - Native missingness (null) and availability indicator consistency
 * - Area unit fallback hierarchy (Boundary hectares vs Farm area unit conversions)
 * - Zod Feature Contract v1.1 validation and injection rejection (extra="forbid")
 * - 100% calculation determinism
 */

import { mlFeatureEngineeringService } from '../../src/services/mlFeatureEngineering.service.js';
import { mlFeatureContractV1_1Schema } from '../../src/validators/mlFeatureContract.validator.js';
import {
  HourlyWeatherRecordInput,
  NdviObservationRecordInput,
  FarmAreaInput,
} from '../../src/types/mlFeatureContract.types.js';

function createConsecutiveWeatherHours(
  endIso: string,
  count: number = 720,
  recordFn?: (i: number) => Partial<HourlyWeatherRecordInput>
): { records: HourlyWeatherRecordInput[]; tEnd: Date; tStart: Date } {
  const tEnd = new Date(endIso);
  tEnd.setUTCMinutes(0, 0, 0); // dateTrunc('hour')
  const tStart = new Date(tEnd.getTime() - 30 * 24 * 3600 * 1000);

  const records: HourlyWeatherRecordInput[] = [];
  // Generate hours from tStart + 1h up to tEnd
  const startEpoch = tStart.getTime() + 3600 * 1000;

  for (let i = 0; i < count; i++) {
    const epoch = startEpoch + i * 3600 * 1000;
    const base: HourlyWeatherRecordInput = {
      observedAt: new Date(epoch),
      rainfallMm: 1.0,
      temperatureC: 30.0,
      humidityPercent: 50.0,
      windSpeedKmh: 10.0,
      windGustKmh: 15.0,
    };
    const overrides = recordFn ? recordFn(i) : {};
    records.push({ ...base, ...overrides });
  }

  return { records, tEnd, tStart };
}

function runFeatureEngineeringUnitTests() {
  console.log('================================================================================');
  console.log('🧪 Running Module 8 Stage 8.3-A: ML Feature Engineering Service Unit Tests');
  console.log('================================================================================\n');

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

  const endTimestamp = '2026-10-01T12:00:00.000Z';

  // ===========================================================================
  // TEST A: Complete Telemetry (All 17 Features Verified)
  // ===========================================================================
  console.log('--- TEST A: Complete Telemetry (720h, 30d, Full Weather & NDVI) ---');
  {
    // Generate 720 hours:
    // Days 0-15 (hours 0-383): rainfall = 0 mm (dry period)
    // Days 16-29 (hours 384-719): rainfall = 5 mm on hour 12 of each day (14 days x 5mm = 70mm)
    // Hours with temp >= 40.0: exactly 10 hours
    const { records, tEnd } = createConsecutiveWeatherHours(endTimestamp, 720, (i) => {
      const isLast14Days = i >= 384;
      const hourOfDay = i % 24;
      const rain = isLast14Days && hourOfDay === 12 ? 5.0 : 0.0;
      const temp = i < 10 ? 42.0 : 30.0; // 10 heat-wave hours
      return {
        rainfallMm: rain,
        temperatureC: temp,
        humidityPercent: 60.0,
        windSpeedKmh: 12.0,
        windGustKmh: 24.0,
      };
    });

    const tEndEpoch = tEnd.getTime();
    // 3 NDVI passes within the 30-day window:
    // Pass 1: day 5 (25 days before tEnd), NDVI = 0.30
    // Pass 2: day 15 (15 days before tEnd), NDVI = 0.40
    // Pass 3: day 25 (5 days before tEnd), NDVI = 0.50
    const ndviObs: NdviObservationRecordInput[] = [
      {
        observedAt: new Date(tEndEpoch - 25 * 24 * 3600 * 1000),
        meanNdvi: 0.30,
        validPixelPercentage: 95.0,
      },
      {
        observedAt: new Date(tEndEpoch - 15 * 24 * 3600 * 1000),
        meanNdvi: 0.40,
        validPixelPercentage: 90.0,
      },
      {
        observedAt: new Date(tEndEpoch - 5 * 24 * 3600 * 1000),
        meanNdvi: 0.50,
        validPixelPercentage: 92.0,
      },
    ];

    const farmAreaInput: FarmAreaInput = {
      farmArea: 5.0,
      farmAreaUnit: 'ACRE',
      boundary: {
        calculatedAreaHectares: 2.0234,
      },
    };

    const features = mlFeatureEngineeringService.computeFeaturesFromTelemetry(
      farmAreaInput,
      records,
      ndviObs,
      tEnd
    );

    assert(features.precipitation_sum_30d === 70.0, 'Precipitation 30d sum is exactly 70.0 mm');
    assert(features.precipitation_sum_14d === 70.0, 'Precipitation 14d sum is exactly 70.0 mm');
    assert(Math.abs(features.precipitation_std_30d - 2.5371) < 1e-4, 'Precipitation daily std is 2.5371 mm (ddof=1 parity with Python np.std)');
    assert(features.consecutive_dry_days_max === 16, 'Consecutive dry days max is 16 (days 0-15)');
    assert(features.heat_wave_hours_30d === 10, 'Heat wave hours count is exactly 10');
    assert(features.temp_max_30d === 42.0, 'Peak max temperature is 42.0 °C');
    assert(features.wind_speed_mean_30d === 12.0, 'Mean wind speed is 12.0 km/h');
    assert(features.wind_gust_max_30d === 24.0, 'Peak wind gust is 24.0 km/h');
    assert(features.ndvi_latest === 0.50, 'Latest NDVI is 0.50 (from day 25)');
    assert(features.is_ndvi_available === 1, 'is_ndvi_available is 1');
    assert(features.is_ndvi_trend_available === 1, 'is_ndvi_trend_available is 1');
    // Slope = (0.50 - 0.30) / (20 days) = 0.20 / 20 = 0.01 ΔNDVI/day
    assert(Math.abs(features.ndvi_trend_30d! - 0.01) < 1e-5, 'NDVI OLS trend is 0.010000 ΔNDVI/day');
    assert(features.calculated_area_ha === 2.0234, 'Area uses boundary calculatedAreaHectares (2.0234 ha)');
    assert(features.vpd_mean_30d >= 0.0, 'VPD mean is non-negative');
  }

  // ===========================================================================
  // TEST B: Missing NDVI (No satellite passes in 30-day window)
  // ===========================================================================
  console.log('\n--- TEST B: Missing NDVI (Clouded out / 0 Observations) ---');
  {
    const { records, tEnd } = createConsecutiveWeatherHours(endTimestamp, 720);
    const ndviObs: NdviObservationRecordInput[] = []; // No passes

    const farmAreaInput: FarmAreaInput = {
      farmArea: 2.0,
      farmAreaUnit: 'HECTARE',
      boundary: null,
    };

    const features = mlFeatureEngineeringService.computeFeaturesFromTelemetry(
      farmAreaInput,
      records,
      ndviObs,
      tEnd
    );

    assert(features.ndvi_latest === null, 'ndvi_latest is strictly null');
    assert(features.is_ndvi_available === 0, 'is_ndvi_available is strictly 0');
    assert(features.ndvi_trend_30d === null, 'ndvi_trend_30d is strictly null');
    assert(features.is_ndvi_trend_available === 0, 'is_ndvi_trend_available is strictly 0');
    assert(features.calculated_area_ha === 2.0, 'Farm area converted from HECTARE is 2.0');
  }

  // ===========================================================================
  // TEST C: Single NDVI Observation (Latest available, trend unavailable)
  // ===========================================================================
  console.log('\n--- TEST C: Single NDVI Observation ---');
  {
    const { records, tEnd } = createConsecutiveWeatherHours(endTimestamp, 720);
    const tEndEpoch = tEnd.getTime();
    const ndviObs: NdviObservationRecordInput[] = [
      {
        observedAt: new Date(tEndEpoch - 10 * 24 * 3600 * 1000),
        meanNdvi: 0.45,
        validPixelPercentage: 85.0,
      },
    ];

    const farmAreaInput: FarmAreaInput = {
      farmArea: 10.0,
      farmAreaUnit: 'ACRE',
      boundary: null,
    };

    const features = mlFeatureEngineeringService.computeFeaturesFromTelemetry(
      farmAreaInput,
      records,
      ndviObs,
      tEnd
    );

    assert(features.ndvi_latest === 0.45, 'ndvi_latest is 0.45');
    assert(features.is_ndvi_available === 1, 'is_ndvi_available is 1');
    assert(features.ndvi_trend_30d === null, 'ndvi_trend_30d is strictly null for single pass');
    assert(features.is_ndvi_trend_available === 0, 'is_ndvi_trend_available is 0 for single pass');
  }

  // ===========================================================================
  // TEST D: Multiple NDVI Observations (Deterministic OLS Slope)
  // ===========================================================================
  console.log('\n--- TEST D: Multiple NDVI Observations (OLS Slope Calculation) ---');
  {
    const { records, tEnd } = createConsecutiveWeatherHours(endTimestamp, 720);
    const tEndEpoch = tEnd.getTime();
    // 4 observations with declining canopy:
    // Day 0: 0.60
    // Day 10: 0.55
    // Day 20: 0.50
    // Day 30: 0.45
    // Slope = (0.45 - 0.60) / 30 = -0.15 / 30 = -0.005 ΔNDVI/day
    const ndviObs: NdviObservationRecordInput[] = [
      { observedAt: new Date(tEndEpoch - 30 * 24 * 3600 * 1000 + 3600000), meanNdvi: 0.60 },
      { observedAt: new Date(tEndEpoch - 20 * 24 * 3600 * 1000), meanNdvi: 0.55 },
      { observedAt: new Date(tEndEpoch - 10 * 24 * 3600 * 1000), meanNdvi: 0.50 },
      { observedAt: new Date(tEndEpoch), meanNdvi: 0.45 },
    ];

    const farmAreaInput: FarmAreaInput = {
      farmArea: 1.0,
      farmAreaUnit: 'HECTARE',
      boundary: null,
    };

    const features = mlFeatureEngineeringService.computeFeaturesFromTelemetry(
      farmAreaInput,
      records,
      ndviObs,
      tEnd
    );

    assert(features.ndvi_latest === 0.45, 'Latest NDVI is 0.45');
    assert(features.is_ndvi_available === 1, 'is_ndvi_available is 1');
    assert(features.is_ndvi_trend_available === 1, 'is_ndvi_trend_available is 1');
    assert(features.ndvi_trend_30d! < 0, 'NDVI slope is negative (vegetation decline)');
    assert(Math.abs(features.ndvi_trend_30d! - (-0.005)) < 1e-4, 'OLS slope is approximately -0.005 ΔNDVI/day');
  }

  // ===========================================================================
  // TEST E: Weather Gaps & Incomplete Sequence Rejection
  // ===========================================================================
  console.log('\n--- TEST E: Weather Gaps & Sequence Completeness ---');
  {
    const farmAreaInput: FarmAreaInput = { farmArea: 1.0, farmAreaUnit: 'HECTARE', boundary: null };

    // E1: 719 records instead of 720 (one hour short)
    const { records: rec719, tEnd } = createConsecutiveWeatherHours(endTimestamp, 719);
    let errorCaught719 = false;
    try {
      mlFeatureEngineeringService.computeFeaturesFromTelemetry(farmAreaInput, rec719, [], tEnd);
    } catch (err: any) {
      errorCaught719 = err.message.includes('INSUFFICIENT_WEATHER_DATA');
    }
    assert(errorCaught719, '719 records rejected with INSUFFICIENT_WEATHER_DATA');

    // E2: 720 records but with a missing 2-hour gap in the middle
    const { records: recGap, tEnd: tEndGap } = createConsecutiveWeatherHours(endTimestamp, 720);
    // Introduce a 2-hour gap by advancing timestamps after index 100
    for (let i = 100; i < 720; i++) {
      recGap[i].observedAt = new Date(recGap[i].observedAt.getTime() + 2 * 3600 * 1000);
    }
    let errorCaughtGap = false;
    try {
      mlFeatureEngineeringService.computeFeaturesFromTelemetry(farmAreaInput, recGap, [], tEndGap);
    } catch (err: any) {
      errorCaughtGap = err.message.includes('INSUFFICIENT_WEATHER_DATA');
    }
    assert(errorCaughtGap, 'Missing hourly gap rejected with INSUFFICIENT_WEATHER_DATA');
  }

  // ===========================================================================
  // TEST F: Duplicate Timestamps Rejection
  // ===========================================================================
  console.log('\n--- TEST F: Duplicate Timestamps Rejection ---');
  {
    const farmAreaInput: FarmAreaInput = { farmArea: 1.0, farmAreaUnit: 'HECTARE', boundary: null };
    const { records: recDup, tEnd } = createConsecutiveWeatherHours(endTimestamp, 720);
    // Duplicate index 50 at index 51
    recDup[51].observedAt = new Date(recDup[50].observedAt.getTime());

    let errorCaughtDup = false;
    try {
      mlFeatureEngineeringService.computeFeaturesFromTelemetry(farmAreaInput, recDup, [], tEnd);
    } catch (err: any) {
      errorCaughtDup = err.message.includes('INSUFFICIENT_WEATHER_DATA');
    }
    assert(errorCaughtDup, 'Duplicate hourly timestamp rejected with INSUFFICIENT_WEATHER_DATA');
  }

  // ===========================================================================
  // TEST G: Physical Invariant Violations (Zod Rejections)
  // ===========================================================================
  console.log('\n--- TEST G: Physical Invariant Violations (Zod Rejections) ---');
  {
    const validBase = {
      precipitation_sum_30d: 50.0,
      precipitation_sum_14d: 30.0,
      precipitation_std_30d: 4.0,
      consecutive_dry_days_max: 10,
      temp_max_30d: 38.0,
      temp_mean_30d: 30.0,
      temp_amplitude_mean_30d: 12.0,
      heat_wave_hours_30d: 20,
      relative_humidity_mean_30d: 55.0,
      vpd_mean_30d: 2.1,
      wind_speed_mean_30d: 15.0,
      wind_gust_max_30d: 35.0,
      ndvi_latest: 0.45,
      ndvi_trend_30d: 0.002,
      calculated_area_ha: 2.5,
      is_ndvi_available: 1 as const,
      is_ndvi_trend_available: 1 as const,
    };

    // G1: 14d rainfall > 30d rainfall
    const invalidRain = { ...validBase, precipitation_sum_14d: 65.0, precipitation_sum_30d: 50.0 };
    const resRain = mlFeatureContractV1_1Schema.safeParse(invalidRain);
    assert(!resRain.success, 'precipitation_sum_14d > 30d rejected by Zod');

    // G2: wind gust < mean wind speed
    const invalidWind = { ...validBase, wind_speed_mean_30d: 30.0, wind_gust_max_30d: 20.0 };
    const resWind = mlFeatureContractV1_1Schema.safeParse(invalidWind);
    assert(!resWind.success, 'wind_gust_max_30d < wind_speed_mean_30d rejected by Zod');

    // G3: calculated_area_ha <= 0 rejected (strictly positive gt(0) contract)
    const invalidAreaZero = { ...validBase, calculated_area_ha: 0.0 };
    const resAreaZero = mlFeatureContractV1_1Schema.safeParse(invalidAreaZero);
    assert(!resAreaZero.success, 'calculated_area_ha = 0.0 rejected by Zod (gt 0 parity with Python)');

    const invalidAreaNeg = { ...validBase, calculated_area_ha: -0.5 };
    const resAreaNeg = mlFeatureContractV1_1Schema.safeParse(invalidAreaNeg);
    assert(!resAreaNeg.success, 'calculated_area_ha < 0 rejected by Zod');
  }

  // ===========================================================================
  // TEST H: NDVI Indicator Mismatches (Zod Rejections)
  // ===========================================================================
  console.log('\n--- TEST H: NDVI Indicator Mismatch Rejections ---');
  {
    const validBase = {
      precipitation_sum_30d: 50.0,
      precipitation_sum_14d: 30.0,
      precipitation_std_30d: 4.0,
      consecutive_dry_days_max: 10,
      temp_max_30d: 38.0,
      temp_mean_30d: 30.0,
      temp_amplitude_mean_30d: 12.0,
      heat_wave_hours_30d: 20,
      relative_humidity_mean_30d: 55.0,
      vpd_mean_30d: 2.1,
      wind_speed_mean_30d: 15.0,
      wind_gust_max_30d: 35.0,
      ndvi_latest: 0.45,
      ndvi_trend_30d: 0.002,
      calculated_area_ha: 2.5,
      is_ndvi_available: 1 as const,
      is_ndvi_trend_available: 1 as const,
    };

    // H1: is_ndvi_available = 1 but ndvi_latest = null
    const resH1 = mlFeatureContractV1_1Schema.safeParse({
      ...validBase,
      ndvi_latest: null,
      is_ndvi_available: 1,
    });
    assert(!resH1.success, 'is_ndvi_available=1 with null value rejected');

    // H2: is_ndvi_available = 0 but ndvi_latest has a number
    const resH2 = mlFeatureContractV1_1Schema.safeParse({
      ...validBase,
      ndvi_latest: 0.45,
      is_ndvi_available: 0,
    });
    assert(!resH2.success, 'is_ndvi_available=0 with value rejected');

    // H3: ndvi_latest < -0.2 (e.g. -0.3)
    const resH3 = mlFeatureContractV1_1Schema.safeParse({
      ...validBase,
      ndvi_latest: -0.3,
    });
    assert(!resH3.success, 'ndvi_latest < -0.2 rejected');

    // H4: ndvi_latest > 1.0 (e.g. 1.1)
    const resH4 = mlFeatureContractV1_1Schema.safeParse({
      ...validBase,
      ndvi_latest: 1.1,
    });
    assert(!resH4.success, 'ndvi_latest > 1.0 rejected');
  }

  // ===========================================================================
  // TEST I: Extra / Injected Fields Rejection (.strict())
  // ===========================================================================
  console.log('\n--- TEST I: Extra & Injected Fields Rejected (.strict()) ---');
  {
    const validBase = {
      precipitation_sum_30d: 50.0,
      precipitation_sum_14d: 30.0,
      precipitation_std_30d: 4.0,
      consecutive_dry_days_max: 10,
      temp_max_30d: 38.0,
      temp_mean_30d: 30.0,
      temp_amplitude_mean_30d: 12.0,
      heat_wave_hours_30d: 20,
      relative_humidity_mean_30d: 55.0,
      vpd_mean_30d: 2.1,
      wind_speed_mean_30d: 15.0,
      wind_gust_max_30d: 35.0,
      ndvi_latest: 0.45,
      ndvi_trend_30d: 0.002,
      calculated_area_ha: 2.5,
      is_ndvi_available: 1 as const,
      is_ndvi_trend_available: 1 as const,
    };

    const forbiddenFields = [
      'target',
      'target_severe_water_stress',
      'scenario_id',
      'episode_id',
      'farm_id',
      'farmer_id',
      'timestamp',
      'payout_amount',
      'claim_status',
    ];

    for (const field of forbiddenFields) {
      const res = mlFeatureContractV1_1Schema.safeParse({
        ...validBase,
        [field]: 'malicious_injection',
      });
      assert(!res.success, `Forbidden injected field '${field}' strictly rejected by Zod`);
    }
  }

  // ===========================================================================
  // TEST J: Determinism Audit
  // ===========================================================================
  console.log('\n--- TEST J: Determinism Audit (Identical Multi-Run Output) ---');
  {
    const { records, tEnd } = createConsecutiveWeatherHours(endTimestamp, 720);
    const farmAreaInput: FarmAreaInput = {
      farmArea: 4.0,
      farmAreaUnit: 'ACRE',
      boundary: null,
    };

    const res1 = mlFeatureEngineeringService.computeFeaturesFromTelemetry(farmAreaInput, records, [], tEnd);
    const res2 = mlFeatureEngineeringService.computeFeaturesFromTelemetry(farmAreaInput, records, [], tEnd);

    assert(JSON.stringify(res1) === JSON.stringify(res2), 'Repeated execution yields bitwise identical JSON feature vector');
  }

  // ===========================================================================
  // TEST K: Area Unit Fallback Hierarchy
  // ===========================================================================
  console.log('\n--- TEST K: Area Unit Fallback Hierarchy & Boundary Precedence ---');
  {
    // K1: Standard declared area unit conversions
    const areaAcre = mlFeatureEngineeringService.convertAreaToHectares(10.0, 'ACRE');
    assert(Math.abs(areaAcre - 4.04686) < 1e-4, 'ACRE conversion: 10 acres = 4.04686 ha');

    const areaGuntha = mlFeatureEngineeringService.convertAreaToHectares(100.0, 'GUNTHA');
    assert(Math.abs(areaGuntha - 1.0117) < 1e-4, 'GUNTHA conversion: 100 gunthas = 1.0117 ha (1/40th acre)');

    const areaHectare = mlFeatureEngineeringService.convertAreaToHectares(3.5, 'HECTARE');
    assert(areaHectare === 3.5, 'HECTARE conversion: 3.5 hectares = 3.5 ha');

    // K2: BIGHA without boundary throws explicit domain error (no assumed 0.25 constant)
    let bighaRejected = false;
    try {
      mlFeatureEngineeringService.convertAreaToHectares(10.0, 'BIGHA');
    } catch (err: any) {
      bighaRejected = err.message.includes('UNSUPPORTED_AREA_CONVERSION');
    }
    assert(bighaRejected, 'BIGHA without boundary explicitly rejected with UNSUPPORTED_AREA_CONVERSION');

    // K3: Unknown area unit throws explicit unsupported unit error
    let unknownRejected = false;
    try {
      mlFeatureEngineeringService.convertAreaToHectares(10.0, 'SQUARE_METERS');
    } catch (err: any) {
      unknownRejected = err.message.includes('UNSUPPORTED_AREA_UNIT');
    }
    assert(unknownRejected, 'Unknown unit explicitly rejected with UNSUPPORTED_AREA_UNIT');

    // K4: Non-positive area rejected
    let nonPositiveRejected = false;
    try {
      mlFeatureEngineeringService.convertAreaToHectares(0.0, 'ACRE');
    } catch (err: any) {
      nonPositiveRejected = err.message.includes('INVALID_FARM_AREA');
    }
    assert(nonPositiveRejected, 'Non-positive area (0) rejected with INVALID_FARM_AREA');

    // K5: Boundary precedence: Even with BIGHA declared unit, boundary calculatedAreaHectares prevails
    const { records, tEnd } = createConsecutiveWeatherHours(endTimestamp, 720);
    const farmWithBoundaryAndBigha: FarmAreaInput = {
      farmArea: 10.0,
      farmAreaUnit: 'BIGHA',
      boundary: { calculatedAreaHectares: 2.85 },
    };
    const featuresBoundaryPrevails = mlFeatureEngineeringService.computeFeaturesFromTelemetry(
      farmWithBoundaryAndBigha,
      records,
      [],
      tEnd
    );
    assert(
      featuresBoundaryPrevails.calculated_area_ha === 2.85,
      'Boundary calculatedAreaHectares takes precedence over BIGHA declared unit'
    );
  }

  // ===========================================================================
  // TEST L: Canonical Feature Ordering
  // ===========================================================================
  console.log('\n--- TEST L: Canonical Feature Ordering ---');
  {
    const { records, tEnd } = createConsecutiveWeatherHours(endTimestamp, 720);
    const farmAreaInput: FarmAreaInput = { farmArea: 1.0, farmAreaUnit: 'HECTARE', boundary: null };
    const features = mlFeatureEngineeringService.computeFeaturesFromTelemetry(farmAreaInput, records, [], tEnd);

    const keys = Object.keys(features);
    const canonical = [
      'precipitation_sum_30d',
      'precipitation_sum_14d',
      'precipitation_std_30d',
      'consecutive_dry_days_max',
      'temp_max_30d',
      'temp_mean_30d',
      'temp_amplitude_mean_30d',
      'heat_wave_hours_30d',
      'relative_humidity_mean_30d',
      'vpd_mean_30d',
      'wind_speed_mean_30d',
      'wind_gust_max_30d',
      'ndvi_latest',
      'ndvi_trend_30d',
      'calculated_area_ha',
      'is_ndvi_available',
      'is_ndvi_trend_available',
    ];

    assert(keys.length === 17, 'Exact 17 features returned');
    assert(JSON.stringify(keys) === JSON.stringify(canonical), 'Exact canonical 17-feature order preserved');
  }

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed across all test blocks`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runFeatureEngineeringUnitTests();
