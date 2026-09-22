/**
 * Module 5: Weather Data Types
 * Represents domain DTOs and query types for weather integration.
 *
 * Traceability & Attribution:
 * Stores the centroid coordinates used for the weather query, preserving query-location traceability.
 * Model-derived weather data for the farm centroid coordinates.
 * Not an on-site physical weather-station measurement.
 * Data source attributed to "Open-Meteo".
 */

export interface WeatherRecord {
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

export interface WeatherSyncResult {
  synced: boolean;
  isInitialBackfill: boolean;
  recordsSynced: number;
  source: string;
  record: WeatherRecord;
}

export interface HistoricalWeatherQuery {
  from: string;
  to: string;
  limit?: number;
}
