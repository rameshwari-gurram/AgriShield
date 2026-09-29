/**
 * Copernicus Data Space Ecosystem OAuth2 Authentication Service
 * Module 7 Stage 7.2-A: Authentication Layer
 *
 * Implements RFC 6749 OAuth2 client_credentials grant flow for Copernicus Data Space / Sentinel Hub.
 * Manages in-memory token caching, pre-expiration token refresh with a safety margin,
 * and secure credential handling.
 *
 * Security Invariants:
 * - Credentials remain strictly backend-only (never exposed to frontend/client).
 * - Client secrets are NEVER logged or interpolated into error messages.
 * - Access tokens are NEVER logged in full.
 * - Tokens are strictly cached in-memory (never persisted to PostgreSQL or disk).
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../config/env.config.js';
import { AppError } from '../utils/apiError.js';
import {
  CopernicusAuthConfig,
  CopernicusTokenResponse,
  CachedCopernicusToken,
} from '../types/satellite.types.js';

export class CopernicusAuthService {
  private authUrl: string;
  private clientId?: string;
  private clientSecret?: string;
  private timeoutMs: number;
  private safetyMarginMs: number;
  private client: AxiosInstance;
  private cachedToken: CachedCopernicusToken | null = null;

  constructor(
    options?: CopernicusAuthConfig,
    client?: AxiosInstance
  ) {
    this.authUrl = options?.authUrl || env.COPERNICUS_AUTH_URL;
    this.clientId = options?.clientId !== undefined ? options.clientId : env.COPERNICUS_CLIENT_ID;
    this.clientSecret = options?.clientSecret !== undefined ? options.clientSecret : env.COPERNICUS_CLIENT_SECRET;
    this.timeoutMs = options?.timeoutMs || env.SATELLITE_REQUEST_TIMEOUT_MS;
    // Default safety margin: 60 seconds (refresh token 60s before actual expiry)
    this.safetyMarginMs = options?.safetyMarginMs ?? 60 * 1000;

    this.client =
      client ||
      axios.create({
        timeout: this.timeoutMs,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'AgriShield-Parametric/1.0',
        },
      });
  }

  /**
   * Returns whether credentials are configured in the environment or options.
   */
  public hasCredentials(): boolean {
    return Boolean(this.clientId?.trim() && this.clientSecret?.trim());
  }

  /**
   * Retrieves a valid Copernicus access token.
   * If a cached token is valid and not nearing expiry (outside safety margin),
   * returns cached token without network dispatch.
   * Otherwise, fetches a fresh token via OAuth2 client_credentials grant.
   */
  public async getAccessToken(): Promise<string> {
    // 1. Check in-memory cache
    if (this.cachedToken) {
      const now = Date.now();
      const timeRemaining = this.cachedToken.expiresAt - now;

      // If token is still valid beyond safety margin, reuse it
      if (timeRemaining > this.safetyMarginMs) {
        return this.cachedToken.accessToken;
      }
    }

    // 2. Fetch fresh token
    return this.requestFreshToken();
  }

  /**
   * Invalidates / clears the in-memory cached token.
   * Called on 401 Unauthorized or manual reset.
   */
  public clearCachedToken(): void {
    this.cachedToken = null;
  }

  /**
   * Alias for clearCachedToken.
   */
  public invalidateToken(): void {
    this.clearCachedToken();
  }

  /**
   * Returns current cached token metadata (for diagnostic / unit testing purposes).
   * Does NOT return client_secret.
   */
  public getCachedTokenInfo(): { hasToken: boolean; expiresAt: number | null } {
    return {
      hasToken: Boolean(this.cachedToken),
      expiresAt: this.cachedToken?.expiresAt ?? null,
    };
  }

  /**
   * Directly sets the cached token (useful for deterministic unit tests).
   */
  public setCachedTokenForTesting(token: string, expiresAt: number): void {
    this.cachedToken = {
      accessToken: token,
      expiresAt,
    };
  }

  /**
   * Requests a new OAuth2 access token from the token endpoint using client_credentials grant.
   */
  private async requestFreshToken(): Promise<string> {
    if (!this.hasCredentials()) {
      throw AppError.serviceUnavailable(
        'Copernicus client credentials are not configured. Both COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET are required.'
      );
    }

    const payload = new URLSearchParams();
    payload.append('grant_type', 'client_credentials');
    payload.append('client_id', this.clientId!);
    payload.append('client_secret', this.clientSecret!);

    try {
      const response = await this.client.post<CopernicusTokenResponse>(
        this.authUrl,
        payload.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          timeout: this.timeoutMs,
        }
      );

      const data = response.data;
      if (!data || typeof data.access_token !== 'string' || !data.access_token.trim()) {
        throw AppError.badGateway('Malformed token response from Copernicus identity service: Missing access_token.');
      }

      // Parse expires_in (defaults to 300 seconds if not provided)
      const expiresInSec = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 300;
      const expiresAt = Date.now() + expiresInSec * 1000;

      this.cachedToken = {
        accessToken: data.access_token,
        expiresAt,
      };

      return this.cachedToken.accessToken;
    } catch (error) {
      // Ensure cached token is cleared on failure
      this.clearCachedToken();

      if (error instanceof AppError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        return this.handleAuthAxiosError(error);
      }

      throw AppError.serviceUnavailable(
        `Copernicus authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handles Axios errors from the OAuth2 token endpoint.
   * Strips any credential references and maps HTTP statuses to AppError.
   */
  private handleAuthAxiosError(err: AxiosError): never {
    if (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout')) {
      throw AppError.serviceUnavailable(
        `Copernicus authentication timed out after ${this.timeoutMs}ms.`
      );
    }

    if (err.response) {
      const status = err.response.status;
      if (status === 400 || status === 401) {
        throw AppError.unauthorized(
          'Copernicus authentication failed: Invalid client credentials or unauthorized client ID.'
        );
      }
      if (status === 403) {
        throw AppError.forbidden(
          'Copernicus authentication failed: Forbidden. Account or client does not have required permissions.'
        );
      }
      if (status === 429) {
        const retryAfter = err.response.headers?.['retry-after'];
        throw AppError.tooManyRequests(
          `Copernicus authentication rate limit exceeded (HTTP 429).${retryAfter ? ` Retry after ${retryAfter}s.` : ''}`,
          { retryAfter }
        );
      }
      if (status >= 500) {
        throw AppError.serviceUnavailable(
          `Copernicus identity service unavailable (HTTP ${status}).`
        );
      }
      throw AppError.badGateway(
        `Copernicus identity service error (HTTP ${status}).`
      );
    }

    if (err.request) {
      throw AppError.serviceUnavailable(
        `Copernicus identity service unreachable: ${err.code || 'Network failure'}.`
      );
    }

    throw AppError.serviceUnavailable(
      `Copernicus authentication network error: ${err.message}`
    );
  }
}

export const copernicusAuthService = new CopernicusAuthService();
