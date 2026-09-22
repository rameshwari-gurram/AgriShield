/**
 * Module 5: Weather Data Types & Interfaces
 * Represents domain DTOs, provider contracts, repository interfaces, and raw external provider types.
 */

import { WeatherRecord } from '@prisma/client';

export interface NormalizedWeatherDTO {
  observedAt: Date;
  latitude: number;
  longitude: number;
  temperatureC: number;
  humidityPercent: number;
  rainfallMm: number;
  windSpeedKmh: number;
  windGustKmh: number;
  weatherCode: number;
  source: string;
}

export interface WeatherRecordResponseDTO {
  id: string;
  farmId: string;
  observedAt: string;
  latitude: number;
  longitude: number;
  temperatureC: number;
  humidityPercent: number;
  rainfallMm: number;
  windSpeedKmh: number;
  windGustKmh: number;
  weatherCode: number;
  weatherDescription: string;
  source: string;
  createdAt: string;
}

export interface WeatherSyncResultDTO {
  synced: boolean;
  isInitialBackfill: boolean;
  recordsSynced: number;
  source: string;
  record: WeatherRecordResponseDTO;
}

export interface HistoricalWeatherQueryDTO {
  from?: Date | string;
  to?: Date | string;
  limit?: number;
}

export interface IWeatherRepository {
  countByFarmId(farmId: string): Promise<number>;
  upsert(farmId: string, observation: NormalizedWeatherDTO): Promise<WeatherRecord>;
  upsertMany(farmId: string, observations: NormalizedWeatherDTO[]): Promise<WeatherRecord[]>;
  findLatestByFarmId(farmId: string): Promise<WeatherRecord | null>;
  findHistoricalByFarmId(
    farmId: string,
    from?: Date,
    to?: Date,
    limit?: number
  ): Promise<WeatherRecord[]>;
  deleteByFarmId?(farmId: string): Promise<number>;
}

export interface IWeatherProvider {
  readonly providerName: string;
  fetchCurrentWeather(latitude: number, longitude: number): Promise<NormalizedWeatherDTO>;
  fetchRecentHourlyWeather(
    latitude: number,
    longitude: number,
    referenceNow?: Date
  ): Promise<NormalizedWeatherDTO[]>;
}

/**
 * Raw Open-Meteo Current Response Payload Structure
 */
export interface RawOpenMeteoCurrentPayload {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  precipitation: number;
  wind_speed_10m: number;
  wind_gusts_10m: number;
  weather_code: number;
}

export interface RawOpenMeteoCurrentResponse {
  latitude: number;
  longitude: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone?: string;
  elevation?: number;
  current?: RawOpenMeteoCurrentPayload;
}

/**
 * Raw Open-Meteo Hourly Response Payload Structure
 */
export interface RawOpenMeteoHourlyPayload {
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  precipitation: number[];
  wind_speed_10m: number[];
  wind_gusts_10m: number[];
  weather_code: number[];
}

export interface RawOpenMeteoHourlyResponse {
  latitude: number;
  longitude: number;
  generationtime_ms?: number;
  utc_offset_seconds?: number;
  timezone?: string;
  elevation?: number;
  hourly?: RawOpenMeteoHourlyPayload;
}
