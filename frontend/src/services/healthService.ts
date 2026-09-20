import { apiClient } from './api';
import { ApiResponse, SystemHealthData } from '../types';

export const healthService = {
  /**
   * Probes backend health endpoint which also returns database and ML service diagnostics
   */
  async getSystemHealth(): Promise<ApiResponse<SystemHealthData>> {
    const response = await apiClient.get<ApiResponse<SystemHealthData>>('/health');
    return response.data;
  },

  /**
   * Simple container readiness probe
   */
  async getReadiness(): Promise<{ ready: boolean }> {
    const response = await apiClient.get('/health/ready');
    return response.data;
  },
};
