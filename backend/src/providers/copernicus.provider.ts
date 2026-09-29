/**
 * Copernicus Data Space Ecosystem (Sentinel Hub API) Provider Implementation
 * Module 7: Satellite Data + NDVI Provider Abstraction
 *
 * Satellite Source:
 * - Constellation: Copernicus Sentinel-2 (S2A / S2B)
 * - Sensor: MultiSpectral Instrument (MSI)
 * - Level: Level-2A (Bottom-of-Atmosphere surface reflectance)
 * - Key Bands:
 *   - B04: Red (665 nm)
 *   - B08: Near-Infrared / NIR (842 nm)
 * - NDVI Calculation:
 *   NDVI = (B08 - B04) / (B08 + B04)
 *
 * Architecture & Integration Boundary:
 * - Spatial input: FarmBoundary polygon geometry (EPSG:4326)
 * - Planned provider API: Copernicus Data Space Statistical API (evalscript with B04 & B08)
 * - External network calls are deferred to Stage 7.2.
 * - Credentials remain strictly backend-only (never exposed to frontend).
 * - Zero fabricated satellite data in production stubs.
 */

import { env } from '../config/env.config.js';
import { AppError } from '../utils/apiError.js';
import {
  ISatelliteProvider,
  GeoJSONPolygon,
  NormalizedNdviObservationDTO,
  NormalizedSatelliteObservationDTO,
  NormalizedNdviMetricsDTO,
  RawCopernicusStatisticalResponse,
} from '../types/satellite.types.js';
import { CopernicusAuthService, copernicusAuthService } from '../services/copernicusAuth.service.js';
import { CopernicusHttpClient, copernicusHttpClient } from './copernicusHttp.client.js';

import { buildCopernicusStatisticalRequest, SENTINEL2_NDVI_EVALSCRIPT } from '../utils/copernicusEvalscript.js';

export class CopernicusSatelliteProvider implements ISatelliteProvider {
  public readonly providerName = 'Copernicus Data Space Ecosystem';
  public readonly evalscript = SENTINEL2_NDVI_EVALSCRIPT;
  private httpClient: CopernicusHttpClient;
  private authService: CopernicusAuthService;
  private baseUrl: string;
  private authUrl: string;
  private timeoutMs: number;

  constructor(
    httpClient?: CopernicusHttpClient,
    options?: {
      authService?: CopernicusAuthService;
      baseUrl?: string;
      authUrl?: string;
      clientId?: string;
      clientSecret?: string;
      timeoutMs?: number;
    }
  ) {
    this.baseUrl = options?.baseUrl || env.COPERNICUS_BASE_URL;
    this.authUrl = options?.authUrl || env.COPERNICUS_AUTH_URL;
    this.timeoutMs = options?.timeoutMs || env.SATELLITE_REQUEST_TIMEOUT_MS;

    this.authService =
      options?.authService ||
      (options?.clientId !== undefined || options?.clientSecret !== undefined || options?.authUrl !== undefined
        ? new CopernicusAuthService({
            authUrl: this.authUrl,
            clientId: options?.clientId,
            clientSecret: options?.clientSecret,
            timeoutMs: this.timeoutMs,
          })
        : copernicusAuthService);

    this.httpClient =
      httpClient ||
      (options?.baseUrl || options?.timeoutMs
        ? new CopernicusHttpClient(this.authService, undefined, {
            baseUrl: this.baseUrl,
            timeoutMs: this.timeoutMs,
          })
        : copernicusHttpClient);
  }

  public getHttpClient(): CopernicusHttpClient {
    return this.httpClient;
  }

  public getAuthService(): CopernicusAuthService {
    return this.authService;
  }

  public getAuthUrl(): string {
    return this.authUrl;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Validates that the spatial input is a valid closed GeoJSON polygon in WGS84 (EPSG:4326).
   */
  public validatePolygon(boundary: GeoJSONPolygon): void {
    if (!boundary || typeof boundary !== 'object') {
      throw AppError.badRequest('Invalid spatial input: Polygon GeoJSON is required.');
    }

    if (boundary.type !== 'Polygon') {
      throw AppError.badRequest(
        `Invalid spatial geometry type: '${boundary.type}'. Expected 'Polygon'.`
      );
    }

    if (!Array.isArray(boundary.coordinates) || boundary.coordinates.length === 0) {
      throw AppError.badRequest('Invalid spatial polygon: Coordinates array is empty.');
    }

    const outerRing = boundary.coordinates[0];
    if (!Array.isArray(outerRing) || outerRing.length < 4) {
      throw AppError.badRequest(
        'Invalid polygon: Outer ring must contain at least 4 coordinate positions (closed loop).'
      );
    }

    // Verify coordinates are finite numbers within EPSG:4326 bounds
    for (let i = 0; i < outerRing.length; i++) {
      const coord = outerRing[i];
      if (!Array.isArray(coord) || coord.length < 2) {
        throw AppError.badRequest(`Invalid coordinate at ring index ${i}. Expected [longitude, latitude].`);
      }
      const [lon, lat] = coord;
      if (typeof lon !== 'number' || !isFinite(lon) || lon < -180 || lon > 180) {
        throw AppError.badRequest(`Invalid longitude ${lon} at ring index ${i}. Must be between -180 and 180.`);
      }
      if (typeof lat !== 'number' || !isFinite(lat) || lat < -90 || lat > 90) {
        throw AppError.badRequest(`Invalid latitude ${lat} at ring index ${i}. Must be between -90 and 90.`);
      }
    }

    // Verify ring is closed: first position must match last position
    const first = outerRing[0];
    const last = outerRing[outerRing.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      throw AppError.badRequest(
        `Invalid polygon: First coordinate [${first[0]}, ${first[1]}] must match last coordinate [${last[0]}, ${last[1]}].`
      );
    }
  }

  /**
   * Validates date range for satellite observation query.
   * Ensures from is strictly before to (from < to).
   */
  public validateDateRange(dateRange: { from: Date; to: Date }): void {
    if (!dateRange || !(dateRange.from instanceof Date) || !(dateRange.to instanceof Date)) {
      throw AppError.badRequest('Invalid date range: Both from and to Date instances are required.');
    }

    if (isNaN(dateRange.from.getTime()) || isNaN(dateRange.to.getTime())) {
      throw AppError.badRequest('Invalid date range: Unparseable date timestamp.');
    }

    if (dateRange.from >= dateRange.to) {
      throw AppError.badRequest(
        `Invalid date range: 'from' (${dateRange.from.toISOString()}) must be before or equal to 'to' (${dateRange.to.toISOString()}).`
      );
    }

    const maxFuture = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (dateRange.to > maxFuture) {
      throw AppError.badRequest(
        `Invalid date range: 'to' (${dateRange.to.toISOString()}) cannot query future satellite passes.`
      );
    }
  }

  /**
   * Normalizes raw Copernicus Sentinel Hub Statistical API output into domain DTOs.
   * Isolates provider payload structure from the application domain.
   * Skips no-data intervals and invalid observations cleanly without fabricating data.
   */
  public normalizeStatisticalResponse(
    response: RawCopernicusStatisticalResponse,
    metadata?: {
      productId?: string;
      satellite?: string;
      productType?: string;
      cloudCoverage?: number | null;
      sourceReference?: string;
    }
  ): NormalizedNdviObservationDTO[] {
    if (!response || !Array.isArray(response.data)) {
      throw AppError.badGateway('Malformed Copernicus response: Missing statistical data array.');
    }

    const results: NormalizedNdviObservationDTO[] = [];

    for (let idx = 0; idx < response.data.length; idx++) {
      const item = response.data[idx];
      if (!item.interval || !item.interval.from) {
        throw AppError.badGateway(`Malformed Copernicus response: Missing interval timestamp at index ${idx}.`);
      }

      const observedAt = new Date(item.interval.from);
      if (isNaN(observedAt.getTime())) {
        throw AppError.badGateway(`Malformed Copernicus response: Invalid interval date '${item.interval.from}'.`);
      }

      const outputs = item.outputs as any;
      if (!outputs || typeof outputs !== 'object') {
        continue;
      }

      const dataBands = outputs.data?.bands;
      const ndviBands = outputs.NDVI?.bands;

      // Extract statistical metrics for NDVI
      let stats: any =
        dataBands?.NDVI?.stats ||
        dataBands?.B0?.stats ||
        dataBands?.default?.stats ||
        ndviBands?.B0?.stats ||
        ndviBands?.default?.stats ||
        ndviBands?.NDVI?.stats;

      let meanNdvi: number;
      let minNdvi: number;
      let maxNdvi: number;

      if (stats && (stats.sampleCount === undefined || stats.sampleCount > 0)) {
        if (typeof stats.mean !== 'number' || isNaN(stats.mean) || !isFinite(stats.mean)) {
          throw AppError.badGateway(
            `Invalid NDVI value derived from Copernicus: ${stats.mean}. Must be a finite number in [-1.0, 1.0].`
          );
        }
        meanNdvi = stats.mean;
        minNdvi = typeof stats.min === 'number' && !isNaN(stats.min) ? stats.min : stats.mean;
        maxNdvi = typeof stats.max === 'number' && !isNaN(stats.max) ? stats.max : stats.mean;
      } else {
        // Missing, malformed, or 0-sample NDVI statistics: treat as unusable / no-data.
        // In accordance with mathematical integrity, we DO NOT synthesize or approximate
        // mean NDVI from separate band means (e.g. (mean(B08) - mean(B04)) / (mean(B08) + mean(B04))),
        // because the expectation of a quotient is not mathematically equivalent to the quotient of expectations.
        continue;
      }

      // Mathematical range validation [-1.0, 1.0] and finiteness
      if (isNaN(meanNdvi) || !isFinite(meanNdvi) || meanNdvi < -1.0 || meanNdvi > 1.0) {
        throw AppError.badGateway(
          `Invalid NDVI value derived from Copernicus: ${meanNdvi}. Must be in [-1.0, 1.0].`
        );
      }
      if (isNaN(minNdvi) || !isFinite(minNdvi) || minNdvi < -1.0 || minNdvi > 1.0) {
        throw AppError.badGateway(
          `Invalid minNdvi value derived from Copernicus: ${minNdvi}. Must be in [-1.0, 1.0].`
        );
      }
      if (isNaN(maxNdvi) || !isFinite(maxNdvi) || maxNdvi < -1.0 || maxNdvi > 1.0) {
        throw AppError.badGateway(
          `Invalid maxNdvi value derived from Copernicus: ${maxNdvi}. Must be in [-1.0, 1.0].`
        );
      }
      if (minNdvi > maxNdvi) {
        throw AppError.badGateway(
          `Invalid NDVI metrics from Copernicus: minNdvi (${minNdvi}) > maxNdvi (${maxNdvi}).`
        );
      }

      // Valid pixel percentage derivation
      let validPixelPercentage = 100.0;
      const dataMaskStats =
        outputs.dataMask?.bands?.B0?.stats ||
        outputs.dataMask?.bands?.default?.stats;

      if (dataMaskStats && typeof dataMaskStats.sampleCount === 'number') {
        const samples = dataMaskStats.sampleCount;
        const noData = typeof dataMaskStats.noDataCount === 'number' ? dataMaskStats.noDataCount : 0;
        const total = samples + noData;
        if (samples === 0) {
          // Zero valid pixels: skip interval
          continue;
        }
        if (total > 0) {
          validPixelPercentage = Number(((samples / total) * 100).toFixed(2));
        }
      } else if (typeof stats.sampleCount === 'number') {
        if (stats.sampleCount === 0) {
          continue;
        }
        if (typeof stats.noDataCount === 'number') {
          const total = stats.sampleCount + stats.noDataCount;
          if (total > 0) {
            validPixelPercentage = Number(((stats.sampleCount / total) * 100).toFixed(2));
          }
        }
      }

      // Observation / aggregation identifier semantics:
      // When a real Copernicus product ID is supplied (e.g. from catalog metadata), preserve it.
      // If none is provided (because the Statistical API aggregates over daily intervals rather
      // than returning a single physical Sentinel-2 granule/scene product ID), assign an explicit
      // aggregation identifier 'STAT_AGG_S2L2A_<timestamp>' to guarantee database idempotency
      // without misleadingly masquerading as an actual physical Sentinel-2 scene granule ID.
      let productId = metadata?.productId;
      if (!productId) {
        const dateStr = observedAt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        productId = `STAT_AGG_S2L2A_${dateStr}`;
      }

      const satelliteMetadata: NormalizedSatelliteObservationDTO = {
        observedAt,
        provider: this.providerName,
        satellite: metadata?.satellite || 'Sentinel-2',
        productType: metadata?.productType || 'S2MSI2A',
        productId,
        cloudCoverage: metadata?.cloudCoverage !== undefined ? metadata.cloudCoverage : null,
        sourceReference:
          metadata?.sourceReference ||
          'Copernicus Data Space Ecosystem - Sentinel-2 MSI Level-2A Statistical API',
      };

      const ndviMetrics: NormalizedNdviMetricsDTO = {
        meanNdvi: Number(meanNdvi.toFixed(4)),
        minNdvi: Number(minNdvi.toFixed(4)),
        maxNdvi: Number(maxNdvi.toFixed(4)),
        validPixelPercentage: Number(validPixelPercentage.toFixed(2)),
      };

      results.push({
        observedAt,
        satellite: satelliteMetadata,
        ndvi: ndviMetrics,
      });
    }

    return results;
  }

  /**
   * Fetches normalized NDVI observations for a farm polygon over a specified time window
   * using the official Copernicus Sentinel Hub Statistical API (POST /statistics/v1).
   */
  async fetchNdviObservations(
    boundary: GeoJSONPolygon,
    dateRange: { from: Date; to: Date },
    options?: { maxCloudCoverage?: number }
  ): Promise<NormalizedNdviObservationDTO[]> {
    this.validatePolygon(boundary);
    this.validateDateRange(dateRange);

    if (!this.authService.hasCredentials()) {
      throw AppError.serviceUnavailable(
        'Copernicus satellite provider credentials not configured (COPERNICUS_CLIENT_ID / COPERNICUS_CLIENT_SECRET). ' +
          'Stage 7.1 integration boundary: Live external API calls require backend credentials or MockSatelliteProvider test fixture.'
      );
    }

    // Build official Sentinel Hub Statistical API request payload
    const requestBody = buildCopernicusStatisticalRequest(boundary, dateRange, options);

    // Dispatch via CopernicusHttpClient
    const response = await this.httpClient.post<RawCopernicusStatisticalResponse>(
      '/statistics/v1',
      requestBody
    );

    // Normalize Statistical API response
    return this.normalizeStatisticalResponse(response.data);
  }
}

export const copernicusSatelliteProvider = new CopernicusSatelliteProvider();
