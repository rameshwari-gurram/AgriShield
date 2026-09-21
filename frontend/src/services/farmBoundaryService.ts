import { apiClient } from './api';
import { ApiResponse, FarmBoundary, GeoJSONPolygon } from '../types';

export const farmBoundaryService = {
  /**
   * Retrieve farm boundary by farm ID
   */
  async getBoundary(farmId: string): Promise<ApiResponse<FarmBoundary>> {
    const response = await apiClient.get<ApiResponse<FarmBoundary>>(`/farms/${farmId}/boundary`);
    return response.data;
  },

  /**
   * Register a new farm boundary
   */
  async createBoundary(
    farmId: string,
    boundary: GeoJSONPolygon
  ): Promise<ApiResponse<FarmBoundary>> {
    const response = await apiClient.post<ApiResponse<FarmBoundary>>(`/farms/${farmId}/boundary`, {
      boundary,
    });
    return response.data;
  },

  /**
   * Update an existing farm boundary
   */
  async updateBoundary(
    farmId: string,
    boundary: GeoJSONPolygon
  ): Promise<ApiResponse<FarmBoundary>> {
    const response = await apiClient.patch<ApiResponse<FarmBoundary>>(`/farms/${farmId}/boundary`, {
      boundary,
    });
    return response.data;
  },

  /**
   * Delete farm boundary
   */
  async deleteBoundary(farmId: string): Promise<ApiResponse<null>> {
    const response = await apiClient.delete<ApiResponse<null>>(`/farms/${farmId}/boundary`);
    return response.data;
  },
};
