/**
 * Module 8: Machine Learning Risk Prediction & Explainability
 * NDVI 7-Day Ahead Vegetation Forecasting Service
 *
 * Responsibilities:
 * - Aggregates farm spatial coordinates, latest Sentinel-2 NDVI, and recent weather telemetry.
 * - Encodes cyclical calendar features (sine/cosine of week and month).
 * - Dispatches prediction request to Python ML microservice POST /predict/ndvi.
 * - Handles missing satellite data or weather telemetry cleanly without fabricating data.
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/apiError.js';
import { MLHttpClient, mlHttpClient } from '../providers/mlHttp.client.js';
import {
  NdviFeaturePayload,
  NdviPredictionResponse,
} from '../types/ndviPrediction.types.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

interface WindowMetrics {
  rainfall: number;
  temperature: number;
  missingHours: number;
}

/**
 * Validates uninterrupted hourly coverage for an exact time window (startMs, endMs]
 * and computes rainfall sum and arithmetic mean temperature.
 *
 * Invariant: Every expected hourly boundary timestamp must be present in hourlyMap.
 * If any hourly slot is missing, returns null (cannot be satisfied by sub-hourly records).
 */
function evaluateHourlyWindow(
  hourlyMap: Map<number, { rainfallMm: number; temperatureC: number }>,
  startMs: number,
  endMs: number,
  expectedHours: number
): WindowMetrics | null {
  if (endMs - startMs !== expectedHours * ONE_HOUR_MS) {
    throw new Error(`Window interval (${endMs - startMs}ms) does not match expected hours (${expectedHours * ONE_HOUR_MS}ms)`);
  }

  let totalRainfall = 0.0;
  let totalTemp = 0.0;
  let missingCount = 0;

  for (let k = 0; k < expectedHours; k++) {
    const expectedTime = endMs - k * ONE_HOUR_MS;
    const obs = hourlyMap.get(expectedTime);
    if (!obs) {
      missingCount++;
    } else {
      totalRainfall += obs.rainfallMm;
      totalTemp += obs.temperatureC;
    }
  }

  if (missingCount > 0) {
    return null;
  }

  return {
    rainfall: Number(Math.max(0.0, totalRainfall).toFixed(2)),
    temperature: Number((totalTemp / expectedHours).toFixed(2)),
    missingHours: 0,
  };
}

export class NdviForecastService {
  private prisma: PrismaClient;
  private mlClient: MLHttpClient;

  constructor(
    dbClient: PrismaClient = prisma,
    mlClient: MLHttpClient = mlHttpClient
  ) {
    this.prisma = dbClient;
    this.mlClient = mlClient;
  }

  /**
   * Forecasts next-week Sentinel-2 NDVI vegetation health for a farm parcel.
   */
  public async forecastFarmNdvi(farmId: string): Promise<NdviPredictionResponse> {
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

    // 2. Resolve Farm Coordinates
    if (
      !farm.boundary ||
      farm.boundary.centroidLatitude === undefined ||
      farm.boundary.centroidLatitude === null ||
      farm.boundary.centroidLongitude === undefined ||
      farm.boundary.centroidLongitude === null
    ) {
      throw AppError.badRequest(
        'FARM_BOUNDARY_REQUIRED: Farm parcel boundary is missing centroid coordinates. Please define the farm boundary polygon before requesting an NDVI vegetation forecast.',
        { code: 'FARM_BOUNDARY_REQUIRED' }
      );
    }

    const latitude = Number(farm.boundary.centroidLatitude);
    const longitude = Number(farm.boundary.centroidLongitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90.0 ||
      latitude > 90.0 ||
      longitude < -180.0 ||
      longitude > 180.0
    ) {
      throw AppError.badRequest(
        'INVALID_COORDINATES: Farm centroid coordinates are out of valid geographic range [-90 to 90 lat, -180 to 180 lon].',
        { code: 'INVALID_COORDINATES' }
      );
    }

    // 3. Query Sentinel-2 NDVI observations
    const ndviObservations = await this.prisma.ndviObservation.findMany({
      where: { farmId },
      orderBy: { observedAt: 'desc' },
      take: 10,
    });

    if (!ndviObservations || ndviObservations.length === 0) {
      throw AppError.badRequest(
        'NO_SATELLITE_DATA: No Sentinel-2 satellite NDVI observations recorded for this farm yet. Please sync satellite observations first to generate a vegetation forecast.'
      );
    }

    const currentNdvi = Number(ndviObservations[0].meanNdvi);
    const ndviLag1 = ndviObservations.length > 1 ? Number(ndviObservations[1].meanNdvi) : null;
    const ndviLag2 = ndviObservations.length > 2 ? Number(ndviObservations[2].meanNdvi) : null;
    const ndviLag3 = ndviObservations.length > 3 ? Number(ndviObservations[3].meanNdvi) : null;
    const ndviLag4 = ndviObservations.length > 4 ? Number(ndviObservations[4].meanNdvi) : null;
    const ndviLag8 = ndviObservations.length > 8 ? Number(ndviObservations[8].meanNdvi) : null;

    const ndviChange1w = ndviLag1 !== null ? Number((currentNdvi - ndviLag1).toFixed(4)) : null;
    const ndviChange2w = ndviLag2 !== null ? Number((currentNdvi - ndviLag2).toFixed(4)) : null;
    const ndviChange4w = ndviLag4 !== null ? Number((currentNdvi - ndviLag4).toFixed(4)) : null;

    // 4. Query Weather Records (covering current week + 8-week history: 1,512 hours)
    const weatherRecords = await this.prisma.weatherRecord.findMany({
      where: { farmId },
      orderBy: { observedAt: 'desc' },
      take: 1600,
    });

    if (!weatherRecords || weatherRecords.length === 0) {
      throw AppError.badRequest(
        'NO_WEATHER_DATA: No hourly weather observations recorded for this farm. Sync weather data before requesting an NDVI vegetation forecast.',
        { code: 'NO_WEATHER_DATA' }
      );
    }

    // Index valid hourly observations by exact timestamp (rejecting non-hourly and non-finite)
    const validHourlyMap = new Map<number, { rainfallMm: number; temperatureC: number }>();

    for (const r of weatherRecords) {
      const t = new Date(r.observedAt).getTime();
      if (isNaN(t) || t % ONE_HOUR_MS !== 0) {
        continue; // Exclude non-hourly or invalid timestamps
      }
      if (r.rainfallMm === null || r.rainfallMm === undefined) continue;
      if (r.temperatureC === null || r.temperatureC === undefined) continue;
      const rain = Number(r.rainfallMm);
      const temp = Number(r.temperatureC);
      if (!Number.isFinite(rain) || rain < 0 || !Number.isFinite(temp)) continue;

      // Deduplicate preserving single record per hourly slot (latest if duplicates exist)
      if (!validHourlyMap.has(t)) {
        validHourlyMap.set(t, { rainfallMm: rain, temperatureC: temp });
      }
    }

    const latestWeatherRecord = weatherRecords[0];
    const latestRecordTime = new Date(latestWeatherRecord.observedAt).getTime();
    const tEndMs =
      latestRecordTime % ONE_HOUR_MS === 0
        ? latestRecordTime
        : Math.floor(latestRecordTime / ONE_HOUR_MS) * ONE_HOUR_MS;

    // Current 7-day window: (tEndMs - 168h, tEndMs] (168 continuous hourly boundaries)
    const currentMetrics = evaluateHourlyWindow(
      validHourlyMap,
      tEndMs - 168 * ONE_HOUR_MS,
      tEndMs,
      168
    );

    if (!currentMetrics) {
      let presentCount = 0;
      for (let k = 0; k < 168; k++) {
        if (validHourlyMap.has(tEndMs - k * ONE_HOUR_MS)) {
          presentCount++;
        }
      }
      throw AppError.badRequest(
        `INSUFFICIENT_WEATHER_DATA: Recent weather records do not form a complete 7-day (168-hour) observation window. Found ${presentCount} of 168 required hourly observations.`,
        { code: 'INSUFFICIENT_WEATHER_DATA', details: { required: 168, found: presentCount, missing: 168 - presentCount } }
      );
    }

    const rainfallCurrent = currentMetrics.rainfall;
    const temperatureCurrent = currentMetrics.temperature;

    // Historical week lags (each 168 hours):
    // Week 1 prior: (tEndMs - 336h, tEndMs - 168h]
    const lag1Metrics = evaluateHourlyWindow(
      validHourlyMap,
      tEndMs - 336 * ONE_HOUR_MS,
      tEndMs - 168 * ONE_HOUR_MS,
      168
    );
    // Week 2 prior: (tEndMs - 504h, tEndMs - 336h]
    const lag2Metrics = evaluateHourlyWindow(
      validHourlyMap,
      tEndMs - 504 * ONE_HOUR_MS,
      tEndMs - 336 * ONE_HOUR_MS,
      168
    );
    // Week 4 prior: (tEndMs - 840h, tEndMs - 672h]
    const lag4Metrics = evaluateHourlyWindow(
      validHourlyMap,
      tEndMs - 840 * ONE_HOUR_MS,
      tEndMs - 672 * ONE_HOUR_MS,
      168
    );

    // Historical rolling windows (strictly PRECEDING the current week, ending at tEndMs - 168h):
    // Rolling 2-week: 336 hours over (tEndMs - 504h, tEndMs - 168h] (lags 1 + 2)
    const rolling2wMetrics = evaluateHourlyWindow(
      validHourlyMap,
      tEndMs - 504 * ONE_HOUR_MS,
      tEndMs - 168 * ONE_HOUR_MS,
      336
    );
    // Rolling 4-week: 672 hours over (tEndMs - 840h, tEndMs - 168h] (lags 1 through 4)
    const rolling4wMetrics = evaluateHourlyWindow(
      validHourlyMap,
      tEndMs - 840 * ONE_HOUR_MS,
      tEndMs - 168 * ONE_HOUR_MS,
      672
    );
    // Rolling 8-week: 1,344 hours over (tEndMs - 1512h, tEndMs - 168h] (lags 1 through 8)
    const rolling8wMetrics = evaluateHourlyWindow(
      validHourlyMap,
      tEndMs - 1512 * ONE_HOUR_MS,
      tEndMs - 168 * ONE_HOUR_MS,
      1344
    );

    const rainfallLag1 = lag1Metrics ? lag1Metrics.rainfall : null;
    const rainfallLag2 = lag2Metrics ? lag2Metrics.rainfall : null;
    const rainfallLag4 = lag4Metrics ? lag4Metrics.rainfall : null;
    const rainfallRolling2w = rolling2wMetrics ? rolling2wMetrics.rainfall : null;
    const rainfallRolling4w = rolling4wMetrics ? rolling4wMetrics.rainfall : null;
    const rainfallRolling8w = rolling8wMetrics ? rolling8wMetrics.rainfall : null;

    const tempLag1 = lag1Metrics ? lag1Metrics.temperature : null;
    const tempLag2 = lag2Metrics ? lag2Metrics.temperature : null;
    const tempLag4 = lag4Metrics ? lag4Metrics.temperature : null;
    const tempRolling2w = rolling2wMetrics ? rolling2wMetrics.temperature : null;
    const tempRolling4w = rolling4wMetrics ? rolling4wMetrics.temperature : null;
    const tempRolling8w = rolling8wMetrics ? rolling8wMetrics.temperature : null;

    // 5. Cyclical Calendar Features
    const refDate = ndviObservations[0].observedAt || new Date();
    const startOfYear = new Date(Date.UTC(refDate.getUTCFullYear(), 0, 1));
    const dayOfYear = Math.floor(
      (refDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    const weekOfYear = Math.min(52, Math.max(1, Math.ceil(dayOfYear / 7)));
    const month = refDate.getUTCMonth() + 1;

    const weekSin = Number(Math.sin((2 * Math.PI * weekOfYear) / 52).toFixed(4));
    const weekCos = Number(Math.cos((2 * Math.PI * weekOfYear) / 52).toFixed(4));
    const monthSin = Number(Math.sin((2 * Math.PI * month) / 12).toFixed(4));
    const monthCos = Number(Math.cos((2 * Math.PI * month) / 12).toFixed(4));

    // 6. Build Payload
    const payload: NdviFeaturePayload = {
      NDVI: currentNdvi,
      Rainfall_Current: Math.max(0.0, rainfallCurrent),
      Temperature_Current: temperatureCurrent,
      NDVI_lag_1: ndviLag1,
      NDVI_lag_2: ndviLag2,
      NDVI_lag_3: ndviLag3,
      NDVI_lag_4: ndviLag4,
      NDVI_lag_8: ndviLag8,
      NDVI_change_1w: ndviChange1w,
      NDVI_change_2w: ndviChange2w,
      NDVI_change_4w: ndviChange4w,
      Rainfall_lag_1: rainfallLag1,
      Rainfall_lag_2: rainfallLag2,
      Rainfall_lag_4: rainfallLag4,
      Rainfall_rolling_2w: rainfallRolling2w,
      Rainfall_rolling_4w: rainfallRolling4w,
      Rainfall_rolling_8w: rainfallRolling8w,
      Temperature_lag_1: tempLag1,
      Temperature_lag_2: tempLag2,
      Temperature_lag_4: tempLag4,
      Temperature_rolling_2w: tempRolling2w,
      Temperature_rolling_4w: tempRolling4w,
      Temperature_rolling_8w: tempRolling8w,
      Week_Sin: weekSin,
      Week_Cos: weekCos,
      Month_Sin: monthSin,
      Month_Cos: monthCos,
      Latitude: Number(latitude.toFixed(4)),
      Longitude: Number(longitude.toFixed(4)),
    };

    // 7. Dispatch to ML microservice
    return await this.mlClient.predictNdvi(payload);
  }
}

export const ndviForecastService = new NdviForecastService();
