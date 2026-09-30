/**
 * Module 7: Satellite Data & NDVI Types
 * Defines frontend DTOs and query types matching the backend Stage 7.2-E API contract.
 *
 * Satellite Source:
 * - Copernicus Sentinel-2 MSI Level-2A surface reflectance
 * - Spectral Bands: B04 (Red, 665 nm), B08 (NIR, 842 nm)
 * - NDVI = (B08 - B04) / (B08 + B04)
 */

/**
 * Satellite observation granule/scene metadata DTO.
 * Corresponds to backend `SatelliteObservationResponseDTO`.
 */
export interface SatelliteObservationDTO {
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
 * Farm parcel aggregate NDVI observation DTO.
 * Corresponds to backend `NdviObservationResponseDTO`.
 */
export interface NdviObservationDTO {
  id: string;
  farmId: string;
  satelliteObservationId: string;
  observedAt: string;
  meanNdvi: number;
  minNdvi: number;
  maxNdvi: number;
  validPixelPercentage: number;
  createdAt: string;
  satelliteObservation?: SatelliteObservationDTO;
}

/**
 * Satellite synchronization result DTO.
 * Corresponds to backend `SatelliteSyncResultDTO`.
 */
export interface SatelliteSyncResultDTO {
  farmId: string;
  syncedCount: number;
  skippedNoDataCount: number;
  totalFetched: number;
  observations: NdviObservationDTO[];
}

/**
 * Request payload for triggering satellite synchronization.
 * Corresponds to backend `syncSatelliteSchema`.
 */
export interface SatelliteSyncRequest {
  from: string;
  to: string;
  maxCloudCoverage?: number;
}

/**
 * Query parameters for historical NDVI observations time series.
 * Corresponds to backend `historicalSatelliteQuerySchema`.
 */
export interface SatelliteTimeRangeQuery {
  from?: string;
  to?: string;
  limit?: number;
}
