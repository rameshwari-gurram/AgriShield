/**
 * Copernicus Sentinel Hub Reusable HTTP Client
 * Module 7 Stage 7.2-A: Transport & Resilience Layer
 *
 * Responsibilities:
 * - Injects OAuth2 Bearer token from CopernicusAuthService into outgoing requests.
 * - Handles 401 Unauthorized with token cache invalidation and exact single retry.
 * - Enforces timeout bounds (SATELLITE_REQUEST_TIMEOUT_MS).
 * - Maps HTTP errors (400, 401, 403, 404, 408, 429, 5xx) to domain AppErrors.
 * - Preserves rate-limit Retry-After headers without uncontrolled retry loops.
 * - Protects credentials: Authorization headers and client secrets are never exposed in errors or logs.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { env } from '../config/env.config.js';
import { AppError } from '../utils/apiError.js';
import { CopernicusAuthService, copernicusAuthService } from '../services/copernicusAuth.service.js';
import { CopernicusHttpClientConfig } from '../types/satellite.types.js';

export interface InternalRequestConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

export class CopernicusHttpClient {
  private client: AxiosInstance;
  private authService: CopernicusAuthService;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(
    authService: CopernicusAuthService = copernicusAuthService,
    client?: AxiosInstance,
    options?: CopernicusHttpClientConfig
  ) {
    this.authService = authService;
    this.baseUrl = options?.baseUrl || env.COPERNICUS_BASE_URL;
    this.timeoutMs = options?.timeoutMs || env.SATELLITE_REQUEST_TIMEOUT_MS;

    this.client =
      client ||
      axios.create({
        baseURL: this.baseUrl,
        timeout: this.timeoutMs,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'AgriShield-Parametric/1.0',
        },
      });
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getTimeoutMs(): number {
    return this.timeoutMs;
  }

  public getAuthService(): CopernicusAuthService {
    return this.authService;
  }

  /**
   * Executes an authenticated HTTP request to Copernicus Sentinel Hub.
   * Injects Bearer token.
   * If a 401 Unauthorized is encountered, invalidates the token, fetches a fresh one,
   * and retries the request exactly once.
   */
  public async request<T = unknown>(config: InternalRequestConfig): Promise<AxiosResponse<T>> {
    // 1. Obtain access token from auth service
    const token = await this.authService.getAccessToken();

    // 2. Prepare request configuration with Authorization Bearer header
    const requestHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'AgriShield-Parametric/1.0',
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };

    const mergedConfig: InternalRequestConfig = {
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      ...config,
      headers: requestHeaders,
    };

    try {
      return await this.client.request<T>(mergedConfig);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // If not already retried, perform token refresh and single retry
        if (!config._retry) {
          // Invalidate cached token
          this.authService.clearCachedToken();

          // Obtain fresh token
          const freshToken = await this.authService.getAccessToken();

          // Retry exactly once with fresh token
          const retryConfig: InternalRequestConfig = {
            ...mergedConfig,
            _retry: true,
            headers: {
              ...mergedConfig.headers,
              Authorization: `Bearer ${freshToken}`,
            },
          };

          try {
            return await this.client.request<T>(retryConfig);
          } catch (retryError) {
            // Second failure with 401 or other error: do NOT retry again
            this.authService.clearCachedToken();
            if (axios.isAxiosError(retryError)) {
              return this.handleHttpError(retryError, true);
            }
            if (retryError instanceof AppError) throw retryError;
            throw AppError.unauthorized('Copernicus API request failed with 401 Unauthorized after token refresh retry.');
          }
        }
      }

      if (error instanceof AppError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        return this.handleHttpError(error, Boolean(config._retry));
      }

      throw AppError.serviceUnavailable(
        `Copernicus HTTP client error: ${error instanceof Error ? error.message : 'Unknown communication error'}`
      );
    }
  }

  public async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  public async post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  /**
   * Sanitizes and maps Axios errors to appropriate domain AppErrors.
   */
  private handleHttpError(err: AxiosError, wasRetried: boolean = false): never {
    // 1. Timeout detection (ECONNABORTED, 408, or timeout message)
    if (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout') || err.response?.status === 408) {
      throw AppError.serviceUnavailable(
        `Copernicus API request timed out after ${this.timeoutMs}ms.`
      );
    }

    // 2. HTTP response received
    if (err.response) {
      const status = err.response.status;
      const responseData = err.response.data as any;
      const providerMsg = responseData?.error?.message || responseData?.message || responseData?.detail || '';
      const cleanDetails = typeof providerMsg === 'string' && providerMsg.trim() ? `: ${providerMsg.trim()}` : '';

      switch (status) {
        case 400:
          throw AppError.badRequest(`Copernicus API bad request (HTTP 400)${cleanDetails}`);
        case 401:
          throw AppError.unauthorized(
            wasRetried
              ? `Copernicus API authentication failed: 401 Unauthorized persisted after token refresh retry${cleanDetails}`
              : `Copernicus API unauthorized (HTTP 401)${cleanDetails}`
          );
        case 403:
          throw AppError.forbidden(`Copernicus API forbidden (HTTP 403): Access to resource denied${cleanDetails}`);
        case 404:
          throw AppError.notFound(`Copernicus API resource not found (HTTP 404)${cleanDetails}`);
        case 429: {
          const retryAfter = err.response.headers?.['retry-after'];
          const retryMsg = retryAfter ? ` Retry-After: ${retryAfter}s.` : ' Rate limit exceeded. Please retry shortly.';
          throw AppError.tooManyRequests(
            `Copernicus API rate limit exceeded (HTTP 429).${retryMsg}`,
            { retryAfter: retryAfter ? String(retryAfter) : undefined }
          );
        }
        default:
          if (status >= 500) {
            throw AppError.serviceUnavailable(
              `Copernicus API server failure (HTTP ${status})${cleanDetails}`
            );
          }
          throw AppError.badGateway(
            `Copernicus API unexpected response (HTTP ${status})${cleanDetails}`
          );
      }
    }

    // 3. Network connection failure (no response received)
    if (err.request) {
      throw AppError.serviceUnavailable(
        `Copernicus API unreachable: Connection failed (${err.code || 'Network failure'}).`
      );
    }

    throw AppError.serviceUnavailable(
      `Copernicus API request failed: ${err.message}`
    );
  }
}

export const copernicusHttpClient = new CopernicusHttpClient();
