/**
 * Module 7: Satellite Data & NDVI Types and Interfaces
 * Defines domain DTOs, provider abstraction contracts, repository interfaces,
 * and isolated external provider response structures.
 */

import { SatelliteObservation, NdviObservation } from '@prisma/client';

/**
 * GeoJSON Polygon representation for spatial farm boundaries.
 * Authoritative spatial input for satellite processing.
 */
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

/**
 * Normalized Satellite Observation DTO.
 * Represents metadata for a satellite overpass/granule.
 */
export interface NormalizedSatelliteObservationDTO {
  observedAt: Date;
  provider: string;
  satellite: string;
  productType: string;
  productId: string;
  cloudCoverage?: number | null;
  sourceReference?: string | null;
}

/**
 * Normalized NDVI Metrics DTO.
 * Represents mathematically calculated NDVI aggregate statistics over a farm polygon.
 */
export interface NormalizedNdviMetricsDTO {
  meanNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  validPixelPercentage: number;
}

/**
 * Composite Normalized NDVI Observation DTO.
 * Links satellite scene metadata with the computed NDVI metrics for a given observation pass.
 */
export interface NormalizedNdviObservationDTO {
  observedAt: Date;
  satellite: NormalizedSatelliteObservationDTO;
  ndvi: NormalizedNdviMetricsDTO;
}

/**
 * API Response DTO for Satellite Observation.
 */
export interface SatelliteObservationResponseDTO {
  id: string;
  farmId: string;
  observedAt: string;
  provider: string;
  satellite: string;
  productType: string;
  productId: string;
  cloudCoverage: number | null;
  sourceReference: string | null;
  createdAt: string;
}

/**
 * API Response DTO for NDVI Observation.
 */
export interface NdviObservationResponseDTO {
  id: string;
  farmId: string;
  satelliteObservationId: string;
  observedAt: string;
  meanNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  validPixelPercentage: number;
  createdAt: string;
  satelliteObservation?: SatelliteObservationResponseDTO;
}

/**
 * Stage 7.2-D: Satellite Synchronization Result DTO.
 * Exposes synchronization audit metrics including total fetched observations,
 * successfully persisted count, skipped NO_DATA count, and formatted NDVI observations.
 */
export interface SatelliteSyncResultDTO {
  farmId: string;
  syncedCount: number;
  skippedNoDataCount: number;
  totalFetched: number;
  observations: NdviObservationResponseDTO[];
}

/**
 * Time range filter for historical satellite and NDVI queries.
 */
export interface SatelliteTimeRangeQueryDTO {
  from?: Date | string;
  to?: Date | string;
  limit?: number;
}

/**
 * Satellite Provider Abstraction Contract.
 * Decouples external satellite imagery vendors (Copernicus Data Space, Sentinel Hub, Planet, etc.)
 * from AgriShield domain services.
 */
export interface ISatelliteProvider {
  readonly providerName: string;
  fetchNdviObservations(
    boundary: GeoJSONPolygon,
    dateRange: { from: Date; to: Date },
    options?: { maxCloudCoverage?: number }
  ): Promise<NormalizedNdviObservationDTO[]>;
}

/**
 * Satellite and NDVI Repository Contract.
 * Manages atomic database persistence and query operations for satellite records.
 */
export interface ISatelliteRepository {
  createSatelliteObservation(
    farmId: string,
    data: NormalizedSatelliteObservationDTO
  ): Promise<SatelliteObservation>;

  createNdviObservation(
    farmId: string,
    satelliteObservationId: string,
    data: NormalizedNdviMetricsDTO,
    observedAt: Date
  ): Promise<NdviObservation>;

  persistObservation(
    farmId: string,
    observation: NormalizedNdviObservationDTO
  ): Promise<{
    satelliteObservation: SatelliteObservation;
    ndviObservation: NdviObservation;
  }>;

  persistBatch(
    farmId: string,
    observations: NormalizedNdviObservationDTO[]
  ): Promise<{
    satelliteObservations: SatelliteObservation[];
    ndviObservations: NdviObservation[];
  }>;

  findSatelliteObservationsByFarmId(
    farmId: string,
    from?: Date,
    to?: Date,
    limit?: number
  ): Promise<SatelliteObservation[]>;

  findNdviObservationsByFarmId(
    farmId: string,
    from?: Date,
    to?: Date,
    limit?: number
  ): Promise<NdviObservation[]>;

  findLatestNdviByFarmId(farmId: string): Promise<NdviObservation | null>;

  countByFarmId(farmId: string): Promise<{ satelliteCount: number; ndviCount: number }>;

  deleteByFarmId?(farmId: string): Promise<{ satelliteCount: number; ndviCount: number }>;
}

/**
 * Raw Copernicus Sentinel Hub Statistical API Response Structure.
 * Isolated here so vendor-specific payloads are never leaked across application layers.
 */
export interface RawCopernicusStatisticalInterval {
  from: string;
  to: string;
}

export interface RawCopernicusStatisticalOutput {
  interval: RawCopernicusStatisticalInterval;
  outputs: {
    data?: {
      bands?: {
        B04?: {
          stats?: {
            min: number;
            max: number;
            mean: number;
            stDev?: number;
            sampleCount?: number;
          };
        };
        B08?: {
          stats?: {
            min: number;
            max: number;
            mean: number;
            stDev?: number;
            sampleCount?: number;
          };
        };
        NDVI?: {
          stats?: {
            min: number;
            max: number;
            mean: number;
            stDev?: number;
            sampleCount?: number;
          };
        };
      };
    };
  };
}

export interface RawCopernicusStatisticalResponse {
  data: RawCopernicusStatisticalOutput[];
  status?: string;
}

/**
 * Stage 7.2-A: Copernicus OAuth2 Token Response Structure (RFC 6749)
 */
export interface CopernicusTokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

/**
 * Stage 7.2-A: In-memory cached token structure
 */
export interface CachedCopernicusToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

/**
 * Stage 7.2-A: Configuration options for CopernicusAuthService
 */
export interface CopernicusAuthConfig {
  authUrl?: string;
  clientId?: string;
  clientSecret?: string;
  timeoutMs?: number;
  safetyMarginMs?: number;
}

/**
 * Stage 7.2-A: Configuration options for CopernicusHttpClient
 */
export interface CopernicusHttpClientConfig {
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Stage 7.2-C: Pixel observation sample input for pure NDVI processing.
 * Represents raw surface reflectance values for Sentinel-2 MSI visible and NIR bands.
 */
export interface PixelObservationInput {
  red?: number | null; // Sentinel-2 B04 (665 nm)
  b04?: number | null; // Alias for Sentinel-2 B04
  nir?: number | null; // Sentinel-2 B08 (842 nm)
  b08?: number | null; // Alias for Sentinel-2 B08
  dataMask?: number | boolean | null; // 1 = valid/within parcel, 0 = no-data/outside parcel
  ndvi?: number | null; // Optional precomputed pixel NDVI
}

/**
 * Stage 7.2-C: Pixel validity / invalidity classification reasons.
 */
export type PixelNdviValidityReason =
  | 'VALID'
  | 'NO_DATA_MASK'
  | 'MISSING_BAND'
  | 'NON_FINITE_INPUT'
  | 'ZERO_DENOMINATOR'
  | 'OUT_OF_BOUNDS';

/**
 * Stage 7.2-C: Single-pixel NDVI calculation result.
 */
export interface PixelNdviResult {
  valid: boolean;
  ndvi: number | null;
  reason: PixelNdviValidityReason;
}

/**
 * Stage 7.2-C: Farm-level aggregate NDVI statistics.
 */
export interface FarmNdviStatistics {
  meanNdvi: number | null;
  minNdvi: number | null;
  maxNdvi: number | null;
  validPixelPercentage: number;
  validPixelCount: number;
  totalPixelCount: number;
  status: 'VALID' | 'NO_DATA' | 'INSUFFICIENT_DATA';
  reason?: string;
}

/**
 * Stage 7.2-C: Input payload for observation-level NDVI processing.
 */
export interface ProcessObservationInput {
  farmId?: string;
  observedAt: Date | string;
  provider?: string;
  satellite?: string;
  productType?: string;
  productId?: string;
  cloudCoverage?: number | null;
  sourceReference?: string | null;
  pixels: Array<PixelObservationInput | number>;
}

/**
 * Stage 7.2-C: Observation-level NDVI processing result.
 */
export interface ProcessedObservationNdviResult {
  farmId?: string;
  observedAt: Date;
  provider: string;
  satellite: string;
  productType: string;
  productId: string;
  cloudCoverage: number | null;
  sourceReference: string | null;
  statistics: FarmNdviStatistics;
  normalizedObservation: NormalizedNdviObservationDTO | null;
}

