/**
 * Module 5: Weather Service
 * Orchestrates weather data synchronization, latest observation retrieval,
 * and historical time-series queries.
 *
 * Data Semantics:
 * - Weather data is model-derived for the farm centroid coordinates.
 * - The stored latitude/longitude represent the centroid coordinates used for the weather query.
 * - These coordinates provide query-location traceability.
 * - The data is not an on-site physical weather-station measurement.
 * - observedAt stores the weather observation timestamp as a UTC timestamp using PostgreSQL TIMESTAMPTZ(6) precision.
 * - source identifies the weather provider (default: Open-Meteo).
 */

import { WeatherRecord } from '@prisma/client';
import { farmRepository } from '../repositories/farm.repository.js';
import { farmBoundaryRepository } from '../repositories/farmBoundary.repository.js';
import { weatherRepository } from '../repositories/weather.repository.js';
import { openMeteoProvider } from '../providers/openmeteo.provider.js';
import {
  IWeatherRepository,
  IWeatherProvider,
  NormalizedWeatherDTO,
  WeatherRecordResponseDTO,
  WeatherSyncResultDTO,
} from '../types/weather.types.js';
import { IFarmRepository } from '../types/farm.types.js';
import { IFarmBoundaryRepository } from '../types/farmBoundary.types.js';
import { AppError } from '../utils/apiError.js';

/**
 * Maps WMO weather interpretation codes (0-99) to human-readable condition descriptions.
 * Strictly presentation/data-layer functionality (not risk/climate assessment logic).
 */
export function getWeatherDescription(code: number): string {
  switch (code) {
    case 0:
      return 'Clear sky';
    case 1:
      return 'Mainly clear';
    case 2:
      return 'Partly cloudy';
    case 3:
      return 'Overcast';
    case 45:
      return 'Foggy';
    case 48:
      return 'Depositing rime fog';
    case 51:
      return 'Light drizzle';
    case 53:
      return 'Moderate drizzle';
    case 55:
      return 'Dense drizzle';
    case 56:
      return 'Light freezing drizzle';
    case 57:
      return 'Dense freezing drizzle';
    case 61:
      return 'Slight rain';
    case 63:
      return 'Moderate rain';
    case 65:
      return 'Heavy rain';
    case 66:
      return 'Light freezing rain';
    case 67:
      return 'Heavy freezing rain';
    case 71:
      return 'Slight snow fall';
    case 73:
      return 'Moderate snow fall';
    case 75:
      return 'Heavy snow fall';
    case 77:
      return 'Snow grains';
    case 80:
      return 'Slight rain showers';
    case 81:
      return 'Moderate rain showers';
    case 82:
      return 'Violent rain showers';
    case 85:
      return 'Slight snow showers';
    case 86:
      return 'Heavy snow showers';
    case 95:
      return 'Thunderstorm';
    case 96:
      return 'Thunderstorm with slight hail';
    case 99:
      return 'Thunderstorm with heavy hail';
    default:
      return 'Unknown weather condition';
  }
}

export class WeatherService {
  private weatherRepo: IWeatherRepository;
  private farmRepo: IFarmRepository;
  private boundaryRepo: IFarmBoundaryRepository;
  private weatherProvider: IWeatherProvider;

  constructor(
    weatherRepo: IWeatherRepository = weatherRepository,
    farmRepo: IFarmRepository = farmRepository,
    boundaryRepo: IFarmBoundaryRepository = farmBoundaryRepository,
    weatherProvider: IWeatherProvider = openMeteoProvider
  ) {
    this.weatherRepo = weatherRepo;
    this.farmRepo = farmRepo;
    this.boundaryRepo = boundaryRepo;
    this.weatherProvider = weatherProvider;
  }

  /**
   * Set or swap the weather provider (e.g. for testing with mock provider).
   */
  public setWeatherProvider(provider: IWeatherProvider): void {
    this.weatherProvider = provider;
  }

  /**
   * Format raw Prisma WeatherRecord to API response DTO.
   */
  public formatRecord(raw: WeatherRecord): WeatherRecordResponseDTO {
    return {
      id: raw.id,
      farmId: raw.farmId,
      observedAt: raw.observedAt instanceof Date ? raw.observedAt.toISOString() : String(raw.observedAt),
      latitude: typeof raw.latitude === 'number' ? raw.latitude : Number(raw.latitude),
      longitude: typeof raw.longitude === 'number' ? raw.longitude : Number(raw.longitude),
      temperatureC: typeof raw.temperatureC === 'number' ? raw.temperatureC : Number(raw.temperatureC),
      humidityPercent: typeof raw.humidityPercent === 'number' ? raw.humidityPercent : Number(raw.humidityPercent),
      rainfallMm: typeof raw.rainfallMm === 'number' ? raw.rainfallMm : Number(raw.rainfallMm),
      windSpeedKmh: typeof raw.windSpeedKmh === 'number' ? raw.windSpeedKmh : Number(raw.windSpeedKmh),
      windGustKmh: typeof raw.windGustKmh === 'number' ? raw.windGustKmh : Number(raw.windGustKmh),
      weatherCode: raw.weatherCode,
      weatherDescription: getWeatherDescription(raw.weatherCode),
      source: raw.source,
      createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt),
    };
  }

  /**
   * Verify that the parent farm exists in the database.
   */
  private async ensureFarmExists(farmId: string): Promise<void> {
    const farm = await this.farmRepo.findById(farmId);
    if (!farm) {
      throw AppError.notFound(`Farm with ID '${farmId}' not found`);
    }
  }

  /**
   * Retrieve authoritative centroid coordinates stored on the FarmBoundary.
   * Does NOT calculate a new centroid; reuses the PostGIS centroid from Module 4.
   */
  private async getFarmCentroid(farmId: string): Promise<{ latitude: number; longitude: number }> {
    const boundary = await this.boundaryRepo.findByFarmId(farmId);
    if (!boundary) {
      throw AppError.notFound(
        `Farm boundary not found for farm '${farmId}'. A mapped boundary with centroid coordinates is required for weather synchronization.`
      );
    }

    const latitude = Number(boundary.centroidLatitude);
    const longitude = Number(boundary.centroidLongitude);

    if (
      isNaN(latitude) ||
      isNaN(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw AppError.badRequest(
        `Invalid farm centroid coordinates: latitude [${boundary.centroidLatitude}] and longitude [${boundary.centroidLongitude}] must be valid WGS84 coordinates`
      );
    }

    return { latitude, longitude };
  }

  /**
   * Synchronize weather for a farm parcel.
   *
   * Orchestration Flow:
   * 1. Verify Farm exists
   * 2. Verify FarmBoundary exists & extract authoritative Centroid
   * 3. Determine if this is the initial synchronization (weather count === 0)
   *    - IF count === 0 (INITIAL SYNC):
   *      a. Fetch current weather from provider
   *      b. Fetch preceding 24 hours of hourly observations from provider
   *      c. Combine and deduplicate observations by observedAt
   *      d. Atomically persist batch via Prisma $transaction
   *      e. Return current/latest observation + actual recordsSynced count
   *    - IF count > 0 (SUBSEQUENT SYNC):
   *      a. Fetch current weather only from provider
   *      b. Idempotently upsert observation via (farmId, observedAt)
   *      c. Return current observation + recordsSynced = 1
   */
  async syncWeather(farmId: string): Promise<WeatherSyncResultDTO> {
    await this.ensureFarmExists(farmId);
    const { latitude, longitude } = await this.getFarmCentroid(farmId);

    const existingCount = await this.weatherRepo.countByFarmId(farmId);

    if (existingCount === 0) {
      // -----------------------------------------------------------------------
      // Initial Sync: Fetch current weather + 24h hourly backfill
      // -----------------------------------------------------------------------
      const current = await this.weatherProvider.fetchCurrentWeather(latitude, longitude);
      const hourly = await this.weatherProvider.fetchRecentHourlyWeather(latitude, longitude);

      // Deduplicate overlapping timestamps in memory; current observation is authoritative for its hour
      const observationMap = new Map<number, NormalizedWeatherDTO>();
      for (const h of hourly) {
        observationMap.set(h.observedAt.getTime(), h);
      }
      observationMap.set(current.observedAt.getTime(), current);

      const uniqueObservations = Array.from(observationMap.values());

      // Persist atomically using Prisma $transaction
      const persistedRecords = await this.weatherRepo.upsertMany(farmId, uniqueObservations);

      // Identify the latest observation among persisted records
      const latestRecord = persistedRecords.reduce(
        (latest, r) => (r.observedAt.getTime() > latest.observedAt.getTime() ? r : latest),
        persistedRecords[0]
      );

      return {
        synced: true,
        isInitialBackfill: true,
        recordsSynced: persistedRecords.length,
        source: current.source,
        record: this.formatRecord(latestRecord),
      };
    } else {
      // -----------------------------------------------------------------------
      // Subsequent Sync: Fetch current weather only
      // -----------------------------------------------------------------------
      const current = await this.weatherProvider.fetchCurrentWeather(latitude, longitude);
      const persistedRecord = await this.weatherRepo.upsert(farmId, current);

      return {
        synced: true,
        isInitialBackfill: false,
        recordsSynced: 1,
        source: current.source,
        record: this.formatRecord(persistedRecord),
      };
    }
  }

  /**
   * Retrieve the latest persisted weather observation for a farm.
   * Reads from PostgreSQL only; does NOT invoke external weather providers.
   */
  async getLatestWeather(farmId: string): Promise<WeatherRecordResponseDTO | null> {
    await this.ensureFarmExists(farmId);

    const record = await this.weatherRepo.findLatestByFarmId(farmId);
    if (!record) {
      return null;
    }

    return this.formatRecord(record);
  }

  /**
   * Retrieve historical weather observations from PostgreSQL within a time window.
   * Results are sorted chronologically ascending (observedAt ASC) for chart visualization.
   * Reads from PostgreSQL only; does NOT invoke external weather providers.
   */
  async getHistoricalWeather(
    farmId: string,
    from?: string | Date,
    to?: string | Date,
    limit: number = 100
  ): Promise<WeatherRecordResponseDTO[]> {
    await this.ensureFarmExists(farmId);

    const fromDate = from ? (from instanceof Date ? from : new Date(from)) : undefined;
    const toDate = to ? (to instanceof Date ? to : new Date(to)) : undefined;

    if (fromDate && isNaN(fromDate.getTime())) {
      throw AppError.badRequest(`Invalid 'from' date parameter: '${from}'`);
    }
    if (toDate && isNaN(toDate.getTime())) {
      throw AppError.badRequest(`Invalid 'to' date parameter: '${to}'`);
    }
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw AppError.badRequest("Invalid date range: 'from' must be before or equal to 'to'");
    }

    const records = await this.weatherRepo.findHistoricalByFarmId(farmId, fromDate, toDate, limit);
    return records.map((r) => this.formatRecord(r));
  }
}

export const weatherService = new WeatherService();
