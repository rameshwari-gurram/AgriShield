/**
 * Module 6: Risk Assessment API Service
 * Handles HTTP communication with the AgriShield Backend Climate Risk APIs.
 *
 * NOTE: The frontend NEVER calculates thresholds, severity, or overall risk.
 * The backend is the single source of truth for risk determinations.
 */

import { apiClient } from './api';
import { ApiResponse, RiskAssessment } from '../types';

export const riskAssessmentService = {
  /**
   * Execute and persist an end-to-end climate risk assessment for a farm.
   * Calls POST /api/v1/farms/:farmId/risk-assessments
   * Sends NO business-result payload.
   */
  async createRiskAssessment(farmId: string): Promise<ApiResponse<RiskAssessment>> {
    const response = await apiClient.post<ApiResponse<RiskAssessment>>(
      `/farms/${farmId}/risk-assessments`,
      {}
    );
    return response.data;
  },

  /**
   * Retrieve newest persisted risk assessment for a farm parcel.
   * Calls GET /api/v1/farms/:farmId/risk-assessments/latest
   * Expected 404 when no assessments exist yet for the farm.
   */
  async getLatestRiskAssessment(farmId: string): Promise<ApiResponse<RiskAssessment>> {
    const response = await apiClient.get<ApiResponse<RiskAssessment>>(
      `/farms/${farmId}/risk-assessments/latest`
    );
    return response.data;
  },

  /**
   * Retrieve risk assessment history for a farm parcel ordered newest first.
   * Calls GET /api/v1/farms/:farmId/risk-assessments?limit=...
   */
  async getRiskAssessmentHistory(
    farmId: string,
    limit: number = 10
  ): Promise<ApiResponse<RiskAssessment[]>> {
    const response = await apiClient.get<ApiResponse<RiskAssessment[]>>(
      `/farms/${farmId}/risk-assessments`,
      {
        params: { limit },
      }
    );
    return response.data;
  },

  /**
   * Retrieve a single risk assessment with its populated risk events and rule definitions.
   * Calls GET /api/v1/risk-assessments/:assessmentId
   */
  async getRiskAssessmentById(assessmentId: string): Promise<ApiResponse<RiskAssessment>> {
    const response = await apiClient.get<ApiResponse<RiskAssessment>>(
      `/risk-assessments/${assessmentId}`
    );
    return response.data;
  },
};
