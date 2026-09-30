/**
 * Module 7: Satellite API Service
 * Handles HTTP communication with the AgriShield Backend Satellite & NDVI APIs.
 *
 * Satellite Source:
 * - Copernicus Sentinel-2 MSI Level-2A surface reflectance
 * - Calculated and persisted server-side via the Copernicus Data Space Statistical API
 * - The browser NEVER calls Copernicus directly.
 * - All requests route strictly through the AgriShield backend API gateway.
 */

import { apiClient } from './api';
import {
  ApiResponse,
  SatelliteSyncResultDTO,
  NdviObservationDTO,
  SatelliteSyncRequest,
  SatelliteTimeRangeQuery,
} from '../types';

export const satelliteService = {
  /**
   * Synchronize satellite NDVI observations for a farm parcel over a specified date range.
   * Calls POST /api/v1/farms/:farmId/satellite/sync
   */
  async syncSatellite(
    farmId: string,
    payload: SatelliteSyncRequest
  ): Promise<ApiResponse<SatelliteSyncResultDTO>> {
    const response = await apiClient.post<ApiResponse<SatelliteSyncResultDTO>>(
      `/farms/${farmId}/satellite/sync`,
      payload
    );
    return response.data;
  },

  /**
   * Retrieve the newest persisted satellite NDVI observation for a farm parcel.
   * Calls GET /api/v1/farms/:farmId/satellite/latest
   * Reads from PostgreSQL only; throws 404 when no observations exist yet for the farm.
   */
  async getLatestNdvi(farmId: string): Promise<ApiResponse<NdviObservationDTO>> {
    const response = await apiClient.get<ApiResponse<NdviObservationDTO>>(
      `/farms/${farmId}/satellite/latest`
    );
    return response.data;
  },

  /**
   * Retrieve historical satellite NDVI observations for a farm parcel within a date range.
   * Calls GET /api/v1/farms/:farmId/satellite?from=...&to=...&limit=...
   * Reads from PostgreSQL only; observations are returned chronologically ascending (observedAt ASC).
   */
  async getHistoricalNdvi(
    farmId: string,
    query?: SatelliteTimeRangeQuery
  ): Promise<ApiResponse<NdviObservationDTO[]>> {
    const response = await apiClient.get<ApiResponse<NdviObservationDTO[]>>(
      `/farms/${farmId}/satellite`,
      {
        params: query,
      }
    );
    return response.data;
  },
};
