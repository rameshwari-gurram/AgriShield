/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * Stage 8.3-A: Deterministic Backend Feature Engineering Service
 *
 * Transforms raw PostgreSQL farm telemetry into the exact 17-feature
 * Module 8 Feature Contract v1.1 payload expected by the ML inference microservice.
 *
 * Architectural Invariants:
 * - 100% deterministic mathematical aggregation.
 * - Strict half-open 720-hour window (T_start, T_end].
 * - Strict 720-hour completeness check: NO interpolation, zero-fill, forward-fill, or fabricated data.
 * - Native missingness (null) for optical Sentinel-2 indicators when clouded out.
 * - Zero coupling with Module 6 deterministic risk engine or claims/payouts.
 */

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../config/db.js';
import { AppError } from '../utils/apiError.js';
import { mlFeatureContractV1_1Schema } from '../validators/mlFeatureContract.validator.js';
import {
  MLFeatureContractV1_1,
  HourlyWeatherRecordInput,
  NdviObservationRecordInput,
  FarmAreaInput,
  FeatureEngineeringOptions,
} from '../types/mlFeatureContract.types.js';

export class MLFeatureEngineeringService {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.prisma = prismaClient;
  }

  /**
   * Helper: Round number to fixed decimal places for clean floating-point transport.
   */
  private round(val: number, decimals: number = 4): number {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  /**
   * Helper: Calculates hourly vapor pressure deficit (VPD) in kPa via Tetens equation.
   * Tetens formula:
   * e_s = 0.61078 * exp((17.27 * T) / (T + 237.3))
   * e_a = e_s * (RH / 100.0)
   * VPD = max(0.0, e_s - e_a)
   */
  public calculateHourlyVpd(temperatureC: number, humidityPercent: number): number {
    const t = Number(temperatureC);
    const rh = Number(humidityPercent);
    const es = 0.61078 * Math.exp((17.27 * t) / (t + 237.3));
    const ea = es * (rh / 100.0);
    return Math.max(0.0, es - ea);
  }

  /**
   * Helper: Truncates a Date object down to the start of the hour (UTC).
   */
  public dateTruncHour(date: Date): Date {
    const d = new Date(date);
    d.setUTCMinutes(0, 0, 0);
    return d;
  }

  /**
   * Helper: Converts farmArea into hectares using standardized unit constants.
   *
   * Precedence Hierarchy:
   * 1. Boundary calculatedAreaHectares (authoritative geodesic PostGIS calculation)
   * 2. Farm declared area conversion (HECTARE, ACRE, GUNTHA)
   * 3. Explicit unsupported-unit error (BIGHA has no state-agnostic conversion; unknown units rejected)
   */
  public convertAreaToHectares(farmArea: number, unit: string): number {
    const u = (unit || '').toUpperCase();
    const area = Number(farmArea);
    if (isNaN(area) || area <= 0) {
      throw AppError.badRequest(
        `INVALID_FARM_AREA: Farm area must be a positive number (> 0), received '${farmArea}'.`
      );
    }

    switch (u) {
      case 'HECTARE':
        return area * 1.0;
      case 'ACRE':
        // Standard international acre (4046.8564224 m² / 10000 m² = 0.40468564224 ha)
        // Matches PostGIS conversion in farmBoundary.repository.ts
        return area * 0.404686;
      case 'GUNTHA':
        // Defined in project domain (frontend/src/types/farm.ts) as 1/40th acre
        // 0.40468564224 ha / 40 = 0.01011714 ha
        return area * (0.40468564224 / 40);
      case 'BIGHA':
        throw AppError.badRequest(
          "UNSUPPORTED_AREA_CONVERSION: Farm declared area unit 'BIGHA' cannot be converted to hectares without an authoritative boundary polygon (regional Indian measure is state-dependent)."
        );
      default:
        throw AppError.badRequest(
          `UNSUPPORTED_AREA_UNIT: Unsupported or unknown farm area unit '${unit}'. Supported conversion units: HECTARE, ACRE, GUNTHA.`
        );
    }
  }

  /**
   * Helper: Calculates ordinary least squares (OLS) linear regression slope (ΔNDVI / day).
   */
  public calculateNdviOlsSlope(observations: { observedAt: Date; meanNdvi: number }[]): number | null {
    if (observations.length < 2) {
      return null;
    }

    const t0 = observations[0].observedAt.getTime();
    const points = observations.map((obs) => ({
      // elapsed time in days
      x: (obs.observedAt.getTime() - t0) / (24 * 3600 * 1000),
      y: Number(obs.meanNdvi),
    }));

    const n = points.length;
    const meanX = points.reduce((acc, p) => acc + p.x, 0) / n;
    const meanY = points.reduce((acc, p) => acc + p.y, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (const p of points) {
      const dx = p.x - meanX;
      const dy = p.y - meanY;
      numerator += dx * dy;
      denominator += dx * dx;
    }

    if (denominator <= 1e-9) {
      // All observations at the same timestamp: zero slope
      return 0.0;
    }

    return numerator / denominator;
  }

  /**
   * Pure computational method: Constructs and validates the 17-feature vector
   * from pre-fetched in-memory telemetry inputs.
   *
   * Enforces:
   * 1. Exactly 720 distinct, consecutive hourly weather observations.
   * 2. Strict half-open window (T_start, T_end].
   * 3. Native NDVI missingness handling.
   * 4. OLS NDVI trend.
   * 5. Area resolution hierarchy.
   * 6. Zod Contract v1.1 validation.
   */
  public computeFeaturesFromTelemetry(
    farmAreaInput: FarmAreaInput,
    weatherRecords: HourlyWeatherRecordInput[],
    ndviObservations: NdviObservationRecordInput[],
    tEnd: Date
  ): MLFeatureContractV1_1 {
    const tEndTruncated = this.dateTruncHour(tEnd);
    const tStart = new Date(tEndTruncated.getTime() - 30 * 24 * 3600 * 1000);

    // 1. Weather Window & Completeness Validation
    if (!weatherRecords || weatherRecords.length === 0) {
      throw AppError.badRequest(
        'INSUFFICIENT_WEATHER_DATA: No weather records provided for feature construction.'
      );
    }

    // Filter strictly to half-open window (T_start, T_end] and exact hourly boundary timestamps
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const windowRecords = weatherRecords.filter((r) => {
      const t = new Date(r.observedAt).getTime();
      return t > tStart.getTime() && t <= tEndTruncated.getTime() && t % ONE_HOUR_MS === 0;
    });

    if (windowRecords.length !== 720) {
      throw AppError.badRequest(
        `INSUFFICIENT_WEATHER_DATA: Expected exactly 720 hourly records in window (${tStart.toISOString()}, ${tEndTruncated.toISOString()}], found ${windowRecords.length}.`
      );
    }

    // Sort ascending by observedAt
    windowRecords.sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());

    // Verify distinctness and strict 1-hour consecutive progression
    const expectedStartEpoch = tStart.getTime() + 3600 * 1000; // First hour after T_start
    for (let i = 0; i < 720; i++) {
      const currentEpoch = new Date(windowRecords[i].observedAt).getTime();
      const expectedEpoch = expectedStartEpoch + i * 3600 * 1000;

      if (currentEpoch !== expectedEpoch) {
        throw AppError.badRequest(
          `INSUFFICIENT_WEATHER_DATA: Hourly sequence gap or mismatch at index ${i}. Expected ${new Date(
            expectedEpoch
          ).toISOString()}, got ${new Date(currentEpoch).toISOString()}.`
        );
      }
    }

    // 2. Weather Feature Calculations (12 features)
    const rainfalls = windowRecords.map((r) => Number(r.rainfallMm));
    const temps = windowRecords.map((r) => Number(r.temperatureC));
    const humidities = windowRecords.map((r) => Number(r.humidityPercent));
    const windSpeeds = windowRecords.map((r) => Number(r.windSpeedKmh));
    const windGusts = windowRecords.map((r) => Number(r.windGustKmh));

    // 2.1 precipitation_sum_30d: Sum across all 720 hours
    const precip_sum_30d = rainfalls.reduce((a, b) => a + b, 0);

    // 2.2 precipitation_sum_14d: Sum over the last 336 hours (14 days x 24 hours)
    const precip_sum_14d = rainfalls.slice(720 - 336).reduce((a, b) => a + b, 0);

    // Group into 30 daily buckets (24 hours per day)
    const dailyRain: number[] = [];
    const dailyDtr: number[] = [];

    for (let day = 0; day < 30; day++) {
      const daySliceRain = rainfalls.slice(day * 24, (day + 1) * 24);
      const daySliceTemps = temps.slice(day * 24, (day + 1) * 24);

      const dRain = daySliceRain.reduce((a, b) => a + b, 0);
      dailyRain.push(dRain);

      const dMaxT = Math.max(...daySliceTemps);
      const dMinT = Math.min(...daySliceTemps);
      dailyDtr.push(dMaxT - dMinT);
    }

    // 2.3 precipitation_std_30d: Sample standard deviation (ddof = 1) across 30 daily rain totals
    const meanDailyRain = dailyRain.reduce((a, b) => a + b, 0) / 30;
    const varianceDailyRain =
      dailyRain.reduce((acc, val) => acc + Math.pow(val - meanDailyRain, 2), 0) / 29;
    const precip_std_30d = Math.sqrt(Math.max(0, varianceDailyRain));

    // 2.4 consecutive_dry_days_max: Maximum consecutive run of daily rainfall < 1.0 mm
    let maxDryDays = 0;
    let currentDryRun = 0;
    for (let d = 0; d < 30; d++) {
      if (dailyRain[d] < 1.0) {
        currentDryRun++;
        if (currentDryRun > maxDryDays) {
          maxDryDays = currentDryRun;
        }
      } else {
        currentDryRun = 0;
      }
    }
    const cdd_max = maxDryDays;

    // 2.5 temp_max_30d: Maximum hourly temperature
    const temp_max_30d = Math.max(...temps);

    // 2.6 temp_mean_30d: Mean hourly temperature
    const temp_mean_30d = temps.reduce((a, b) => a + b, 0) / 720;

    // 2.7 temp_amplitude_mean_30d: Mean of daily diurnal temperature ranges
    const temp_amp_mean_30d = dailyDtr.reduce((a, b) => a + b, 0) / 30;

    // 2.8 heat_wave_hours_30d: Total hours where temperature >= 40.0°C
    const heat_wave_hours_30d = temps.filter((t) => t >= 40.0).length;

    // 2.9 relative_humidity_mean_30d: Mean relative humidity (%)
    const rh_mean_30d = humidities.reduce((a, b) => a + b, 0) / 720;

    // 2.10 vpd_mean_30d: Mean hourly vapor pressure deficit (kPa)
    let vpdSum = 0;
    for (let i = 0; i < 720; i++) {
      vpdSum += this.calculateHourlyVpd(temps[i], humidities[i]);
    }
    const vpd_mean_30d = vpdSum / 720;

    // 2.11 wind_speed_mean_30d: Mean wind speed (km/h)
    const wind_speed_mean_30d = windSpeeds.reduce((a, b) => a + b, 0) / 720;

    // 2.12 wind_gust_max_30d: Peak wind gust (km/h)
    const wind_gust_max_30d = Math.max(...windGusts);

    // 3. Optical NDVI Feature Extraction (4 features)
    // Filter to observations inside half-open window (T_start, T_end]
    const windowNdvi = (ndviObservations || []).filter((obs) => {
      const t = new Date(obs.observedAt).getTime();
      return t > tStart.getTime() && t <= tEndTruncated.getTime();
    });

    // Filter valid, cloud-permissible NDVI observations within valid physical range [-0.2, 1.0]
    const validNdviObs = windowNdvi
      .filter((obs) => {
        const val = Number(obs.meanNdvi);
        if (obs.meanNdvi === null || obs.meanNdvi === undefined || isNaN(val)) {
          return false;
        }
        if (val < -0.2 || val > 1.0) {
          return false;
        }
        if (obs.validPixelPercentage !== undefined && Number(obs.validPixelPercentage) <= 0) {
          return false;
        }
        return true;
      })
      .map((obs) => ({
        observedAt: new Date(obs.observedAt),
        meanNdvi: Number(obs.meanNdvi),
      }))
      .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

    let ndvi_latest: number | null = null;
    let is_ndvi_available: 0 | 1 = 0;
    let ndvi_trend_30d: number | null = null;
    let is_ndvi_trend_available: 0 | 1 = 0;

    if (validNdviObs.length > 0) {
      ndvi_latest = validNdviObs[validNdviObs.length - 1].meanNdvi;
      is_ndvi_available = 1;
    }

    if (validNdviObs.length >= 2) {
      const slope = this.calculateNdviOlsSlope(validNdviObs);
      if (slope !== null && !isNaN(slope)) {
        ndvi_trend_30d = slope;
        is_ndvi_trend_available = 1;
      }
    }

    // 4. Farm Area Feature Extraction (1 feature)
    let calculated_area_ha: number = 0;
    if (
      farmAreaInput.boundary?.calculatedAreaHectares !== undefined &&
      farmAreaInput.boundary?.calculatedAreaHectares !== null &&
      Number(farmAreaInput.boundary.calculatedAreaHectares) > 0
    ) {
      calculated_area_ha = Number(farmAreaInput.boundary.calculatedAreaHectares);
    } else {
      calculated_area_ha = this.convertAreaToHectares(
        farmAreaInput.farmArea,
        farmAreaInput.farmAreaUnit
      );
    }

    // 5. Structure Exact Canonical 17-Feature Payload
    const rawPayload = {
      precipitation_sum_30d: this.round(precip_sum_30d, 4),
      precipitation_sum_14d: this.round(precip_sum_14d, 4),
      precipitation_std_30d: this.round(precip_std_30d, 4),
      consecutive_dry_days_max: cdd_max,
      temp_max_30d: this.round(temp_max_30d, 4),
      temp_mean_30d: this.round(temp_mean_30d, 4),
      temp_amplitude_mean_30d: this.round(temp_amp_mean_30d, 4),
      heat_wave_hours_30d: heat_wave_hours_30d,
      relative_humidity_mean_30d: this.round(rh_mean_30d, 4),
      vpd_mean_30d: this.round(vpd_mean_30d, 4),
      wind_speed_mean_30d: this.round(wind_speed_mean_30d, 4),
      wind_gust_max_30d: this.round(wind_gust_max_30d, 4),
      ndvi_latest: ndvi_latest !== null ? this.round(ndvi_latest, 4) : null,
      ndvi_trend_30d: ndvi_trend_30d !== null ? this.round(ndvi_trend_30d, 6) : null,
      calculated_area_ha: this.round(calculated_area_ha, 4),
      is_ndvi_available: is_ndvi_available,
      is_ndvi_trend_available: is_ndvi_trend_available,
    };

    // 6. Contract Validation via Zod
    const validationResult = mlFeatureContractV1_1Schema.safeParse(rawPayload);
    if (!validationResult.success) {
      throw AppError.badRequest(
        `ML Feature Contract v1.1 validation failed: ${validationResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`
      );
    }

    return validationResult.data;
  }

  /**
   * Database-driven method: Fetches real farm records from PostgreSQL and
   * constructs the 17-feature vector.
   *
   * @param farmId UUID of the farm parcel
   * @param options Optional overrides (e.g. referenceTime for historical replay)
   */
  public async constructFeaturesFromFarmId(
    farmId: string,
    options?: FeatureEngineeringOptions
  ): Promise<MLFeatureContractV1_1> {
    // 1. Fetch Farm with Boundary
    const farm = await this.prisma.farm.findUnique({
      where: { id: farmId },
      include: {
        boundary: true,
      },
    });

    if (!farm) {
      throw AppError.notFound(`Farm with ID '${farmId}' not found.`);
    }

    // 2. Determine Reference Timestamp T_ref
    let tRef: Date;
    if (options?.referenceTime) {
      tRef = options.referenceTime;
    } else {
      const latestWeather = await this.prisma.weatherRecord.findFirst({
        where: { farmId },
        orderBy: { observedAt: 'desc' },
      });

      if (!latestWeather) {
        throw AppError.badRequest(
          `INSUFFICIENT_WEATHER_DATA: No weather records found in database for farm '${farmId}'.`
        );
      }
      tRef = latestWeather.observedAt;
    }

    const tEnd = this.dateTruncHour(tRef);
    const tStart = new Date(tEnd.getTime() - 30 * 24 * 3600 * 1000);

    // 3. Query Weather Records in (T_start, T_end]
    const weatherRecords = await this.prisma.weatherRecord.findMany({
      where: {
        farmId,
        observedAt: {
          gt: tStart,
          lte: tEnd,
        },
      },
      orderBy: { observedAt: 'asc' },
    });

    // 4. Query NDVI Observations in (T_start, T_end]
    const ndviRecords = await this.prisma.ndviObservation.findMany({
      where: {
        farmId,
        observedAt: {
          gt: tStart,
          lte: tEnd,
        },
      },
      include: {
        satelliteObservation: true,
      },
      orderBy: { observedAt: 'asc' },
    });

    // 5. Delegate to pure computation & Zod validation
    return this.computeFeaturesFromTelemetry(
      {
        farmArea: Number(farm.farmArea),
        farmAreaUnit: farm.farmAreaUnit,
        boundary: farm.boundary
          ? {
              calculatedAreaHectares: farm.boundary.calculatedAreaHectares
                ? Number(farm.boundary.calculatedAreaHectares)
                : null,
            }
          : null,
      },
      weatherRecords.map((w) => ({
        observedAt: w.observedAt,
        rainfallMm: Number(w.rainfallMm),
        temperatureC: Number(w.temperatureC),
        humidityPercent: Number(w.humidityPercent),
        windSpeedKmh: Number(w.windSpeedKmh),
        windGustKmh: Number(w.windGustKmh),
      })),
      ndviRecords.map((n) => ({
        observedAt: n.observedAt,
        meanNdvi: Number(n.meanNdvi),
        validPixelPercentage: Number(n.validPixelPercentage),
        cloudCoverage: n.satelliteObservation?.cloudCoverage
          ? Number(n.satelliteObservation.cloudCoverage)
          : null,
      })),
      tEnd
    );
  }
}

export const mlFeatureEngineeringService = new MLFeatureEngineeringService();
