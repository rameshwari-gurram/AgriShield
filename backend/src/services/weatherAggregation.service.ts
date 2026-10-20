/**
 * Module 6: Weather Aggregation Service
 * Converts time-series WeatherRecord observations into deterministic, calculated
 * physical weather measurements for risk evaluation.
 *
 * Data Semantics & Rules:
 * - Reads WeatherRecord data from PostgreSQL (or memory) in UTC.
 * - Sorts records strictly by observedAt ASC before windowing.
 * - Deduplicates overlapping timestamps if present.
 * - Calculates 24-hour total rainfall as the SUM (not average) over (observationEnd - 24h, observationEnd].
 * - Evaluates all continuous rolling 3-hour windows (strictly 1-hour consecutive intervals).
 * - Identifies maximum temperature, wind speed, and wind gust independently.
 * - Verifies continuous hourly coverage for 24-hour and 3-hour completeness.
 * - Does NOT evaluate risk rules or persist assessments/events.
 */

import {
  WeatherAggregationResult,
  WeatherRecordInput,
  IWeatherRepository,
} from '../types/weather.types.js';
import { IFarmRepository } from '../types/farm.types.js';
import { weatherRepository } from '../repositories/weather.repository.js';
import { farmRepository } from '../repositories/farm.repository.js';
import { AppError } from '../utils/apiError.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export class WeatherAggregationService {
  private weatherRepo: IWeatherRepository;
  private farmRepo: IFarmRepository;

  constructor(
    weatherRepo: IWeatherRepository = weatherRepository,
    farmRepo: IFarmRepository = farmRepository
  ) {
    this.weatherRepo = weatherRepo;
    this.farmRepo = farmRepo;
  }

  /**
   * Pure aggregation function that calculates weather metrics from a set of weather observations.
   * Deterministic and independent of database calls.
   *
   * Window Definition:
   * The 24-hour observation period ends at observationEnd (either explicitly provided referenceTime,
   * or the latest record's observedAt).
   * Because each WeatherRecord.rainfallMm represents precipitation for the preceding hour,
   * the 24 hourly periods strictly falling within the 24-hour window are those with
   * observedAt in (observationEnd - 24h, observationEnd].
   */
  public aggregateRecords(
    records: WeatherRecordInput[],
    farmId: string,
    referenceTime?: Date | string
  ): WeatherAggregationResult {
    let targetEndMs: number | null = null;

    if (referenceTime !== undefined) {
      const refDate = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);
      if (isNaN(refDate.getTime())) {
        throw AppError.badRequest(`Invalid reference time parameter: '${referenceTime}'`);
      }
      targetEndMs = refDate.getTime();
    }

    if (!records || records.length === 0) {
      return this.buildEmptyResult(farmId);
    }

    // 1. Sort records chronologically ascending (observedAt ASC)
    const sorted = [...records].sort(
      (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
    );

    // 2. Deduplicate records on identical observedAt timestamps (preserve latest)
    const dedupedMap = new Map<number, WeatherRecordInput>();
    for (const r of sorted) {
      const t = new Date(r.observedAt).getTime();
      if (!isNaN(t)) {
        dedupedMap.set(t, r);
      }
    }
    const sortedUnique = Array.from(dedupedMap.values());

    if (sortedUnique.length === 0) {
      return this.buildEmptyResult(farmId);
    }

    // 3. Establish observationEnd timestamp
    if (targetEndMs === null) {
      targetEndMs = new Date(sortedUnique[sortedUnique.length - 1].observedAt).getTime();
    }

    const windowStartMs = targetEndMs - TWENTY_FOUR_HOURS_MS;

    // 4. Filter records strictly within the 24-hour aggregation window:
    // (targetEndMs - 24h, targetEndMs]
    const windowRecords = sortedUnique.filter((r) => {
      const t = new Date(r.observedAt).getTime();
      return t > windowStartMs && t <= targetEndMs!;
    });

    if (windowRecords.length === 0) {
      return this.buildEmptyResult(farmId);
    }

    const recordCount = windowRecords.length;
    const observationStart = new Date(windowRecords[0].observedAt);
    const observationEnd = new Date(windowRecords[recordCount - 1].observedAt);

    // 5. Hourly Boundary Alignment & Hourly Precipitation Window
    // Accommodates the standard Open-Meteo pattern where the latest record may be a sub-hourly
    // current observation (e.g., 19:30 or 19:15) while historical precipitation records are hourly.
    // Anchors 24-hour completeness check to the latest complete hourly boundary at or before targetEndMs.
    const isHourlyBoundary = (t: number) => t % ONE_HOUR_MS === 0;

    const hourlyTargetEndMs = targetEndMs % ONE_HOUR_MS === 0
      ? targetEndMs
      : Math.floor(targetEndMs / ONE_HOUR_MS) * ONE_HOUR_MS;
    const hourlyWindowStartMs = hourlyTargetEndMs - TWENTY_FOUR_HOURS_MS;

    const hourlyRecords = sortedUnique.filter((r) => {
      const t = new Date(r.observedAt).getTime();
      return isHourlyBoundary(t) && t > hourlyWindowStartMs && t <= hourlyTargetEndMs;
    });

    // 24-hour rainfall total is calculated exclusively from valid hourly-boundary observations
    const rainfallRecords = hourlyRecords;

    // 6. Calculate 24-Hour Rainfall Total (sum of hourly precipitation records)
    const totalRainfall = rainfallRecords.reduce((acc, r) => {
      const val = Number(r.rainfallMm);
      return acc + (Number.isFinite(val) ? val : 0);
    }, 0);
    const totalRainfall24h = roundToTwoDecimals(totalRainfall);

    // 7. Check for Complete 24-Hour Continuous Window
    // When 24 consecutive hourly precipitation records exist spanning the 24 hours preceding
    // that hourly boundary, mark complete24hWindow = true.
    let complete24hWindow = false;
    const candidate24h = hourlyRecords;
    const targetFor24h = hourlyTargetEndMs;

    if (candidate24h.length >= 24) {
      const last24 = candidate24h.slice(-24);
      const endsAtTarget = new Date(last24[23].observedAt).getTime() === targetFor24h;
      let allContinuous = endsAtTarget;

      for (let i = 1; i < 24; i++) {
        const prevT = new Date(last24[i - 1].observedAt).getTime();
        const currT = new Date(last24[i].observedAt).getTime();
        if (currT - prevT !== ONE_HOUR_MS) {
          allContinuous = false;
          break;
        }
      }
      complete24hWindow = allContinuous;
    }

    // 8. Calculate Rolling 3-Hour Maximum Rainfall
    // Evaluates consecutive hourly records strictly
    let maxRolling3h = 0;
    let threeHourWindowEnd: Date | null = null;
    let complete3hWindow = false;

    const candidate3h = hourlyRecords;
    const count3h = candidate3h.length;

    if (count3h >= 3) {
      for (let i = 0; i <= count3h - 3; i++) {
        const t0 = new Date(candidate3h[i].observedAt).getTime();
        const t1 = new Date(candidate3h[i + 1].observedAt).getTime();
        const t2 = new Date(candidate3h[i + 2].observedAt).getTime();

        if (t1 - t0 === ONE_HOUR_MS && t2 - t1 === ONE_HOUR_MS) {
          complete3hWindow = true;
          const r0 = Number(candidate3h[i].rainfallMm);
          const r1 = Number(candidate3h[i + 1].rainfallMm);
          const r2 = Number(candidate3h[i + 2].rainfallMm);

          const sum3h = roundToTwoDecimals(
            (Number.isFinite(r0) ? r0 : 0) +
            (Number.isFinite(r1) ? r1 : 0) +
            (Number.isFinite(r2) ? r2 : 0)
          );

          if (threeHourWindowEnd === null || sum3h > maxRolling3h) {
            maxRolling3h = sum3h;
            threeHourWindowEnd = new Date(t2);
          }
        }
      }
    }

    // 8. Calculate Maximum Temperature, Wind Speed, and Wind Gust
    const validTemperatures = windowRecords
      .map((r) => Number(r.temperatureC))
      .filter(Number.isFinite);

    const validWindSpeeds = windowRecords
      .map((r) => Number(r.windSpeedKmh))
      .filter(Number.isFinite);

    const validWindGusts = windowRecords
      .map((r) => Number(r.windGustKmh))
      .filter(Number.isFinite);


    const maximumTemperatureC = validTemperatures.length > 0 ? roundToTwoDecimals(Math.max(...validTemperatures)) : null;
    const maximumWindSpeedKmh = validWindSpeeds.length > 0 ? roundToTwoDecimals(Math.max(...validWindSpeeds)) : null;
    const maximumWindGustKmh = validWindGusts.length > 0 ? roundToTwoDecimals(Math.max(...validWindGusts)) : null;

    return {
      farmId,
      observationStart,
      observationEnd,
      recordCount,
      totalRainfall24h,
      maximumRolling3hRainfall: complete3hWindow ? maxRolling3h : 0,
      maximumTemperatureC,
      maximumWindSpeedKmh,
      maximumWindGustKmh,
      complete24hWindow,
      complete3hWindow,
      threeHourWindowEnd,
    };
  }

  /**
   * Retrieves WeatherRecords from PostgreSQL and performs 24h weather aggregation for a farm parcel.
   */
  async aggregateFarmWeather(
    farmId: string,
    referenceTime?: Date | string
  ): Promise<WeatherAggregationResult> {
    const farm = await this.farmRepo.findById(farmId);
    if (!farm) {
      throw AppError.notFound(`Farm with ID '${farmId}' not found`);
    }

    let targetEnd: Date;
    if (referenceTime !== undefined) {
      const parsed = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);
      if (isNaN(parsed.getTime())) {
        throw AppError.badRequest(`Invalid reference time parameter: '${referenceTime}'`);
      }
      targetEnd = parsed;
    } else {
      const latest = await this.weatherRepo.findLatestByFarmId(farmId);
      if (!latest) {
        return this.buildEmptyResult(farmId);
      }
      targetEnd = latest.observedAt;
    }

    // Query records starting 25 hours prior to targetEnd to capture the full 24-hour window
    const queryStart = new Date(targetEnd.getTime() - (TWENTY_FOUR_HOURS_MS + ONE_HOUR_MS));
    const records = await this.weatherRepo.getRecordsForAggregation(farmId, queryStart, targetEnd);

    return this.aggregateRecords(records, farmId, targetEnd);
  }

  private buildEmptyResult(farmId: string): WeatherAggregationResult {
    return {
      farmId,
      observationStart: null,
      observationEnd: null,
      recordCount: 0,
      totalRainfall24h: 0,
      maximumRolling3hRainfall: 0,
      maximumTemperatureC: null,
      maximumWindSpeedKmh: null,
      maximumWindGustKmh: null,
      complete24hWindow: false,
      complete3hWindow: false,
      threeHourWindowEnd: null,
    };
  }
}

export const weatherAggregationService = new WeatherAggregationService();
