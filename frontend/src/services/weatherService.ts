/**
 * Module 5: Weather API Service
 * Handles HTTP communication with the AgriShield Backend Weather APIs.
 *
 * Traceability & Attribution:
 * Stores the centroid coordinates used for the weather query, preserving query-location traceability.
 * Model-derived weather data for the farm centroid coordinates.
 * Not an on-site physical weather-station measurement.
 * Data source attributed to "Open-Meteo".
 *
 * NOTE: The browser NEVER calls Open-Meteo directly.
 * All requests route strictly through the AgriShield backend API gateway.
 */

import { apiClient } from './api';
import { ApiResponse, WeatherRecord, WeatherSyncResult } from '../types';

export const weatherService = {
  /**
   * Synchronize weather for a farm parcel.
   * Calls POST /api/v1/farms/:farmId/weather/sync
   */
  async syncWeather(farmId: string): Promise<ApiResponse<WeatherSyncResult>> {
    const response = await apiClient.post<ApiResponse<WeatherSyncResult>>(
      `/farms/${farmId}/weather/sync`
    );
    return response.data;
  },

  /**
   * Retrieve latest persisted weather observation for a farm parcel.
   * Calls GET /api/v1/farms/:farmId/weather/latest
   * Reads from PostgreSQL only.
   */
  async getLatestWeather(farmId: string): Promise<ApiResponse<WeatherRecord>> {
    const response = await apiClient.get<ApiResponse<WeatherRecord>>(
      `/farms/${farmId}/weather/latest`
    );
    return response.data;
  },

  /**
   * Retrieve historical weather observations for a farm parcel within a date range.
   * Calls GET /api/v1/farms/:farmId/weather?from=...&to=...&limit=...
   * Reads from PostgreSQL only; observations ordered chronologically ascending.
   */
  async getHistoricalWeather(
    farmId: string,
    from: string,
    to: string,
    limit: number = 100
  ): Promise<ApiResponse<WeatherRecord[]>> {
    const response = await apiClient.get<ApiResponse<WeatherRecord[]>>(
      `/farms/${farmId}/weather`,
      {
        params: {
          from,
          to,
          limit,
        },
      }
    );
    return response.data;
  },
};
