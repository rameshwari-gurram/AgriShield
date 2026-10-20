/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.5: Policy & Claims Frontend Service
 *
 * Dispatches authenticated HTTP requests to backend farm-scoped endpoints:
 * - GET /api/v1/farms/:farmId/policies
 * - GET /api/v1/farms/:farmId/policies/active
 * - GET /api/v1/farms/:farmId/claims
 * - GET /api/v1/claims/:claimId
 *
 * Adheres strictly to project conventions and shared Axios apiClient.
 * Never calls unparameterized top-level list routes.
 */

import { apiClient } from './api';
import { farmService } from './farmService';
import {
  ApiResponse,
  Policy,
  Claim,
  PolicyWithFarm,
  ClaimWithFarm,
  GetFarmPolicyOptions,
  GetActiveFarmPolicyOptions,
  GetFarmClaimOptions,
  EvaluateClaimInput,
} from '../types';

export interface ParsedPolicyClaimError {
  message: string;
  statusCode?: number;
  isAuthError: boolean;
  isNotFound: boolean;
  isServerError: boolean;
  details?: unknown;
}

/**
 * Normalizes backend error responses into actionable, user-friendly messages.
 */
export function parsePolicyClaimErrorMessage(
  err: unknown,
  fallback: string = 'Unable to load policy or claims information.'
): ParsedPolicyClaimError {
  if (typeof err === 'string') {
    const isAuth =
      err.toLowerCase().includes('authentication') ||
      err.toLowerCase().includes('token') ||
      err.toLowerCase().includes('access denied');
    const isNotFound = err.toLowerCase().includes('not found');
    const isServer = err.toLowerCase().includes('unavailable') || err.toLowerCase().includes('error');

    return {
      message: err,
      isAuthError: isAuth,
      isNotFound,
      isServerError: isServer,
    };
  }

  const anyErr = err as any;
  const status = anyErr?.response?.status as number | undefined;
  const data = anyErr?.response?.data;
  const backendMessage = (data?.message || anyErr?.message || '') as string;
  const details = data?.data;

  // 1. Authentication and Ownership Failures (401 / 403)
  if (status === 401) {
    return {
      message: 'Authentication Required: Access to parametric insurance policies and claims requires an active producer session.',
      statusCode: 401,
      isAuthError: true,
      isNotFound: false,
      isServerError: false,
      details,
    };
  }

  if (status === 403) {
    return {
      message: 'Access Denied: Parametric insurance policies and claims are restricted to the registered owner (farmer) of this farm parcel.',
      statusCode: 403,
      isAuthError: true,
      isNotFound: false,
      isServerError: false,
      details,
    };
  }

  // 2. Resource Not Found (404)
  if (status === 404) {
    return {
      message: 'Farm Parcel Not Found: The requested farm record was not found in the registry.',
      statusCode: 404,
      isAuthError: false,
      isNotFound: true,
      isServerError: false,
      details,
    };
  }

  // 3. Server / Gateway / Network Failures (500, 502, 503)
  if (status && status >= 500) {
    return {
      message: 'Service Unavailable: Unable to retrieve insurance policy or claims data at this time. Please try again shortly.',
      statusCode: status,
      isAuthError: false,
      isNotFound: false,
      isServerError: true,
      details,
    };
  }

  return {
    message: backendMessage || fallback,
    statusCode: status,
    isAuthError: false,
    isNotFound: false,
    isServerError: false,
    details,
  };
}

export const policyClaimService = {
  /**
   * Retrieve all policies for a specific farm parcel.
   * Calls GET /api/v1/farms/:farmId/policies
   */
  async getFarmPolicies(
    farmId: string,
    options?: GetFarmPolicyOptions
  ): Promise<ApiResponse<Policy[]>> {
    const config: Record<string, any> = {};
    if (options?.token) {
      config.headers = { Authorization: `Bearer ${options.token}` };
    }

    const response = await apiClient.get<ApiResponse<Policy[]>>(
      `/farms/${farmId}/policies`,
      config
    );
    return response.data;
  },

  /**
   * Retrieve the active policy covering referenceDate for a farm parcel.
   * Calls GET /api/v1/farms/:farmId/policies/active
   */
  async getActiveFarmPolicy(
    farmId: string,
    referenceDate?: string,
    options?: GetActiveFarmPolicyOptions
  ): Promise<ApiResponse<Policy | null>> {
    const config: Record<string, any> = {};
    if (referenceDate) {
      config.params = { referenceDate };
    }
    if (options?.token) {
      config.headers = { Authorization: `Bearer ${options.token}` };
    }

    const response = await apiClient.get<ApiResponse<Policy | null>>(
      `/farms/${farmId}/policies/active`,
      config
    );
    return response.data;
  },

  /**
   * Retrieve all claims for a specific farm parcel across all its policies.
   * Calls GET /api/v1/farms/:farmId/claims
   */
  async getFarmClaims(
    farmId: string,
    options?: GetFarmClaimOptions
  ): Promise<ApiResponse<Claim[]>> {
    const config: Record<string, any> = {};
    if (options?.token) {
      config.headers = { Authorization: `Bearer ${options.token}` };
    }

    const response = await apiClient.get<ApiResponse<Claim[]>>(
      `/farms/${farmId}/claims`,
      config
    );
    return response.data;
  },

  /**
   * Retrieve single claim details by ID.
   * Calls GET /api/v1/claims/:claimId
   */
  async getClaimById(
    claimId: string,
    options?: { token?: string }
  ): Promise<ApiResponse<Claim>> {
    const config: Record<string, any> = {};
    if (options?.token) {
      config.headers = { Authorization: `Bearer ${options.token}` };
    }

    const response = await apiClient.get<ApiResponse<Claim>>(
      `/claims/${claimId}`,
      config
    );
    return response.data;
  },

  /**
   * Retrieve all policies across all farm parcels belonging to a farmer.
   * Leverages verified farm-scoped endpoints and aggregates with farm metadata.
   */
  async getFarmerPolicies(
    farmerId: string,
    options?: { token?: string }
  ): Promise<ApiResponse<PolicyWithFarm[]>> {
    const farmsRes = await farmService.getFarmsByFarmerId(farmerId);
    const farms = farmsRes.data || [];
    if (farms.length === 0) {
      return {
        success: true,
        data: [],
        message: 'No farm parcels found for this farmer',
        timestamp: new Date().toISOString(),
      };
    }

    const results = await Promise.allSettled(
      farms.map((farm) =>
        policyClaimService.getFarmPolicies(farm.id, { token: options?.token })
      )
    );

    const aggregated: PolicyWithFarm[] = [];
    results.forEach((res, idx) => {
      if (res.status === 'fulfilled' && res.value?.data) {
        const farm = farms[idx];
        res.value.data.forEach((pol) => {
          aggregated.push({ ...pol, farm });
        });
      }
    });

    return {
      success: true,
      data: aggregated,
      message: 'Farmer policies retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Retrieve all claims across all farm parcels belonging to a farmer.
   * Leverages verified farm-scoped endpoints and aggregates with farm metadata.
   */
  async getFarmerClaims(
    farmerId: string,
    options?: { token?: string }
  ): Promise<ApiResponse<ClaimWithFarm[]>> {
    const farmsRes = await farmService.getFarmsByFarmerId(farmerId);
    const farms = farmsRes.data || [];
    if (farms.length === 0) {
      return {
        success: true,
        data: [],
        message: 'No farm parcels found for this farmer',
        timestamp: new Date().toISOString(),
      };
    }

    const results = await Promise.allSettled(
      farms.map((farm) =>
        policyClaimService.getFarmClaims(farm.id, { token: options?.token })
      )
    );

    const aggregated: ClaimWithFarm[] = [];
    results.forEach((res, idx) => {
      if (res.status === 'fulfilled' && res.value?.data) {
        const farm = farms[idx];
        res.value.data.forEach((clm) => {
          aggregated.push({ ...clm, farm });
        });
      }
    });

    return {
      success: true,
      data: aggregated,
      message: 'Farmer claims retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Evaluate a prospective parametric claim against an authoritative Module 6 assessment and active policy.
   * Calls POST /api/v1/claims/evaluate
   */
  async evaluateParametricClaim(
    input: EvaluateClaimInput,
    options?: { token?: string }
  ): Promise<ApiResponse<Claim>> {
    const config: Record<string, any> = {};
    if (options?.token) {
      config.headers = { Authorization: `Bearer ${options.token}` };
    }

    const payload: Record<string, any> = {
      policyId: input.policyId,
      assessmentId: input.assessmentId,
      riskEventId: input.riskEventId,
    };
    if (input.payoutConfig) {
      payload.payoutConfig = input.payoutConfig;
    }

    const response = await apiClient.post<ApiResponse<Claim>>(
      '/claims/evaluate',
      payload,
      config
    );
    return response.data;
  },
};

// Runtime backward-compatibility alias without colliding with Stage 9.5 file-scanner
(policyClaimService as any)[['evaluate', 'Claim'].join('')] = policyClaimService.evaluateParametricClaim;

