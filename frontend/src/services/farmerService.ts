import { apiClient } from './api';
import {
  ApiResponse,
  Farmer,
  CreateFarmerInput,
  FarmerListResponse,
  FarmerQueryParams,
} from '../types';

export const farmerService = {
  /**
   * Register a new farmer
   */
  async registerFarmer(input: CreateFarmerInput): Promise<ApiResponse<Farmer>> {
    const response = await apiClient.post<ApiResponse<Farmer>>('/farmers', input);
    return response.data;
  },

  /**
   * Retrieve paginated list of farmers with optional search query
   */
  async getFarmers(params?: FarmerQueryParams): Promise<ApiResponse<FarmerListResponse>> {
    const response = await apiClient.get<ApiResponse<FarmerListResponse>>('/farmers', {
      params,
    });
    return response.data;
  },

  /**
   * Retrieve farmer by UUID
   */
  async getFarmerById(id: string): Promise<ApiResponse<Farmer>> {
    const response = await apiClient.get<ApiResponse<Farmer>>(`/farmers/${id}`);
    return response.data;
  },
};
