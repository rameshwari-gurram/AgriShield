import { apiClient } from './api';
import {
  ApiResponse,
  Farm,
  CreateFarmInput,
  UpdateFarmInput,
  FarmListResponse,
  FarmQueryParams,
} from '../types';

export const farmService = {
  /**
   * Register a new farm parcel
   */
  async registerFarm(input: CreateFarmInput): Promise<ApiResponse<Farm>> {
    const response = await apiClient.post<ApiResponse<Farm>>('/farms', input);
    return response.data;
  },

  /**
   * Retrieve paginated list of farms with filters
   */
  async getFarms(params?: FarmQueryParams): Promise<ApiResponse<FarmListResponse>> {
    const response = await apiClient.get<ApiResponse<FarmListResponse>>('/farms', {
      params,
    });
    return response.data;
  },

  /**
   * Retrieve single farm by UUID
   */
  async getFarmById(id: string): Promise<ApiResponse<Farm>> {
    const response = await apiClient.get<ApiResponse<Farm>>(`/farms/${id}`);
    return response.data;
  },

  /**
   * Retrieve all farms belonging to a specific farmer
   */
  async getFarmsByFarmerId(farmerId: string): Promise<ApiResponse<Farm[]>> {
    const response = await apiClient.get<ApiResponse<Farm[]>>(`/farmers/${farmerId}/farms`);
    return response.data;
  },

  /**
   * Partially update a farm parcel
   */
  async updateFarm(id: string, input: UpdateFarmInput): Promise<ApiResponse<Farm>> {
    const response = await apiClient.patch<ApiResponse<Farm>>(`/farms/${id}`, input);
    return response.data;
  },

  /**
   * Delete a farm record
   */
  async deleteFarm(id: string): Promise<ApiResponse<{ id: string; farmReferenceNumber: string }>> {
    const response = await apiClient.delete<ApiResponse<{ id: string; farmReferenceNumber: string }>>(
      `/farms/${id}`
    );
    return response.data;
  },
};
