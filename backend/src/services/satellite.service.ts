/**
 * Module 7: Satellite & NDVI Service
 * Coordinates spatial farm boundary resolution, provider fetching, domain validation,
 * transactional persistence, and formatted retrieval of satellite observations.
 */

import { SatelliteObservation, NdviObservation } from '@prisma/client';
import { AppError } from '../utils/apiError.js';
import {
  ISatelliteRepository,
  ISatelliteProvider,
  NormalizedNdviObservationDTO,
  SatelliteObservationResponseDTO,
  NdviObservationResponseDTO,
  SatelliteSyncResultDTO,
  SatelliteTimeRangeQueryDTO,
  GeoJSONPolygon,
} from '../types/satellite.types.js';
import { IFarmBoundaryRepository } from '../types/farmBoundary.types.js';
import { IFarmRepository } from '../types/farm.types.js';
import { satelliteRepository } from '../repositories/satellite.repository.js';
import { farmBoundaryRepository } from '../repositories/farmBoundary.repository.js';
import { farmRepository } from '../repositories/farm.repository.js';
import { copernicusSatelliteProvider } from '../providers/copernicus.provider.js';
import {
  validateFarmId,
  validateNormalizedObservationPair,
  validateObservationTimestamp,
} from '../validators/satellite.validator.js';

/**
 * Stage 7.2-D: Checks whether an observation represents NO_DATA / unusable observation.
 * In accordance with Stage 7.2-D requirements:
 * Observations with status 'NO_DATA', zero valid pixels, missing/null NDVI metrics,
 * or non-finite values are filtered out before persistence to maintain database integrity
 * without fabricating false numbers.
 */
export function isNoDataObservation(obs: any): boolean {
  if (!obs) return true;
  if (obs.status === 'NO_DATA') return true;
  if (!obs.ndvi) return true;
  if (obs.ndvi.meanNdvi === null || obs.ndvi.meanNdvi === undefined) return true;
  if (typeof obs.ndvi.meanNdvi === 'number' && (isNaN(obs.ndvi.meanNdvi) || !isFinite(obs.ndvi.meanNdvi))) return true;
  if (obs.ndvi.minNdvi === null || obs.ndvi.minNdvi === undefined) return true;
  if (obs.ndvi.maxNdvi === null || obs.ndvi.maxNdvi === undefined) return true;
  if (obs.ndvi.validPixelPercentage === 0 || obs.ndvi.validPixelPercentage === null || obs.ndvi.validPixelPercentage === undefined) return true;
  return false;
}

export class SatelliteService {
  private satRepo: ISatelliteRepository;
  private boundaryRepo: IFarmBoundaryRepository;
  private farmRepo: IFarmRepository;
  private provider: ISatelliteProvider;

  constructor(
    satRepo: ISatelliteRepository = satelliteRepository,
    boundaryRepo: IFarmBoundaryRepository = farmBoundaryRepository,
    farmRepo: IFarmRepository = farmRepository,
    provider: ISatelliteProvider = copernicusSatelliteProvider
  ) {
    this.satRepo = satRepo;
    this.boundaryRepo = boundaryRepo;
    this.farmRepo = farmRepo;
    this.provider = provider;
  }

  /**
   * Sets or swaps the satellite provider instance (e.g. for testing with mock provider fixtures).
   */
  public setProvider(provider: ISatelliteProvider): void {
    this.provider = provider;
  }

  /**
   * Format Prisma SatelliteObservation record into domain response DTO.
   */
  public formatSatelliteResponse(record: SatelliteObservation): SatelliteObservationResponseDTO {
    return {
      id: record.id,
      farmId: record.farmId,
      observedAt: record.observedAt.toISOString(),
      provider: record.provider,
      satellite: record.satellite,
      productType: record.productType,
      productId: record.productId,
      cloudCoverage: record.cloudCoverage !== null && record.cloudCoverage !== undefined ? Number(record.cloudCoverage) : null,
      sourceReference: record.sourceReference,
      createdAt: record.createdAt.toISOString(),
    };
  }

  /**
   * Format Prisma NdviObservation record into domain response DTO.
   */
  public formatNdviResponse(
    record: NdviObservation & { satelliteObservation?: SatelliteObservation | null }
  ): NdviObservationResponseDTO {
    return {
      id: record.id,
      farmId: record.farmId,
      satelliteObservationId: record.satelliteObservationId,
      observedAt: record.observedAt.toISOString(),
      meanNdvi: Number(record.meanNdvi),
      minNdvi: Number(record.minNdvi),
      maxNdvi: Number(record.maxNdvi),
      validPixelPercentage: Number(record.validPixelPercentage),
      createdAt: record.createdAt.toISOString(),
      satelliteObservation: record.satelliteObservation
        ? this.formatSatelliteResponse(record.satelliteObservation)
        : undefined,
    };
  }

  /**
   * Validate and persist a single normalized observation pair.
   */
  async persistNormalizedObservation(
    farmId: string,
    observation: NormalizedNdviObservationDTO
  ): Promise<{
    satelliteObservation: SatelliteObservationResponseDTO;
    ndviObservation: NdviObservationResponseDTO;
  }> {
    if (isNoDataObservation(observation)) {
      throw AppError.badRequest(
        'Cannot persist observation with NO_DATA status or null/zero NDVI metrics.'
      );
    }

    const validFarmId = validateFarmId(farmId);
    const validatedObs = validateNormalizedObservationPair(observation);

    // Verify farm exists
    const farm = await this.farmRepo.findById(validFarmId);
    if (!farm) {
      throw AppError.notFound(`Farm with ID ${validFarmId} not found.`);
    }

    const { satelliteObservation, ndviObservation } = await this.satRepo.persistObservation(
      validFarmId,
      validatedObs
    );

    return {
      satelliteObservation: this.formatSatelliteResponse(satelliteObservation),
      ndviObservation: this.formatNdviResponse({
        ...ndviObservation,
        satelliteObservation,
      }),
    };
  }

  /**
   * Validate and persist a batch of normalized observation pairs atomically.
   * Filters out NO_DATA observations according to Stage 7.2-D policy.
   */
  async persistBatch(
    farmId: string,
    observations: NormalizedNdviObservationDTO[]
  ): Promise<{
    satelliteObservations: SatelliteObservationResponseDTO[];
    ndviObservations: NdviObservationResponseDTO[];
    skippedNoDataCount: number;
  }> {
    const validFarmId = validateFarmId(farmId);

    // Verify farm exists
    const farm = await this.farmRepo.findById(validFarmId);
    if (!farm) {
      throw AppError.notFound(`Farm with ID ${validFarmId} not found.`);
    }

    if (!observations || observations.length === 0) {
      return { satelliteObservations: [], ndviObservations: [], skippedNoDataCount: 0 };
    }

    // Filter NO_DATA observations
    const validBatch: NormalizedNdviObservationDTO[] = [];
    let skippedNoDataCount = 0;

    for (const obs of observations) {
      if (isNoDataObservation(obs)) {
        skippedNoDataCount++;
      } else {
        validBatch.push(obs);
      }
    }

    if (validBatch.length === 0) {
      return { satelliteObservations: [], ndviObservations: [], skippedNoDataCount };
    }

    const validatedBatch = validBatch.map((obs) => validateNormalizedObservationPair(obs));

    const { satelliteObservations, ndviObservations } = await this.satRepo.persistBatch(
      validFarmId,
      validatedBatch
    );

    const satMap = new Map(satelliteObservations.map((s) => [s.id, s]));

    return {
      satelliteObservations: satelliteObservations.map((s) => this.formatSatelliteResponse(s)),
      ndviObservations: ndviObservations.map((n) =>
        this.formatNdviResponse({
          ...n,
          satelliteObservation: satMap.get(n.satelliteObservationId),
        })
      ),
      skippedNoDataCount,
    };
  }

  /**
   * Retrieves the latest NDVI observation for a farm.
   */
  async getLatestNdvi(farmId: string): Promise<NdviObservationResponseDTO | null> {
    const validFarmId = validateFarmId(farmId);

    const farm = await this.farmRepo.findById(validFarmId);
    if (!farm) {
      throw AppError.notFound(`Farm with ID ${validFarmId} not found.`);
    }

    const latest = await this.satRepo.findLatestNdviByFarmId(validFarmId);
    if (!latest) {
      return null;
    }

    return this.formatNdviResponse(latest);
  }

  /**
   * Retrieves historical NDVI observations for a farm within a given date window.
   */
  async getHistoricalNdvi(
    farmId: string,
    query?: SatelliteTimeRangeQueryDTO
  ): Promise<NdviObservationResponseDTO[]> {
    const validFarmId = validateFarmId(farmId);

    const farm = await this.farmRepo.findById(validFarmId);
    if (!farm) {
      throw AppError.notFound(`Farm with ID ${validFarmId} not found.`);
    }

    const fromDate = query?.from ? validateObservationTimestamp(query.from) : undefined;
    const toDate = query?.to ? validateObservationTimestamp(query.to) : undefined;
    const limit = query?.limit && query.limit > 0 ? query.limit : 100;

    const records = await this.satRepo.findNdviObservationsByFarmId(
      validFarmId,
      fromDate,
      toDate,
      limit
    );

    return records.map((record) => this.formatNdviResponse(record));
  }

  /**
   * Synchronizes satellite NDVI observations for a farm parcel using its authoritative boundary.
   *
   * Flow:
   * 1. Validate farm ID.
   * 2. Confirm farm existence.
   * 3. Fetch FarmBoundary geometry (authoritative spatial input).
   * 4. Call satellite provider to fetch normalized NDVI observations.
   * 5. Filter out NO_DATA observations (Stage 7.2-D policy) and track skippedNoDataCount.
   * 6. Atomically persist valid observations using (farmId + productId) idempotency.
   * 7. Return SatelliteSyncResultDTO.
   */
  async syncSatelliteObservations(
    farmId: string,
    dateRange: { from: Date; to: Date },
    options?: { maxCloudCoverage?: number }
  ): Promise<SatelliteSyncResultDTO> {
    const validFarmId = validateFarmId(farmId);

    // 1. Verify farm exists
    const farm = await this.farmRepo.findById(validFarmId);
    if (!farm) {
      throw AppError.notFound(`Farm with ID ${validFarmId} not found.`);
    }

    // 2. Fetch authoritative spatial input (FarmBoundary)
    const boundaryRecord = await this.boundaryRepo.findByFarmId(validFarmId);
    if (!boundaryRecord || !boundaryRecord.geojson) {
      throw AppError.notFound(
        `Farm boundary not found for farm ID ${validFarmId}. Satellite processing requires an authoritative spatial polygon.`
      );
    }

    let polygon: GeoJSONPolygon;
    try {
      polygon = JSON.parse(boundaryRecord.geojson);
    } catch {
      throw AppError.badRequest('Malformed farm boundary GeoJSON stored for farm.');
    }

    // 3. Fetch observations from satellite provider
    const fetchedObservations = await this.provider.fetchNdviObservations(polygon, dateRange, options);
    const totalFetched = Array.isArray(fetchedObservations) ? fetchedObservations.length : 0;

    // 4. Atomically persist observations with NO_DATA filtering (Stage 7.2-D Policy)
    const { ndviObservations, skippedNoDataCount } = await this.persistBatch(
      validFarmId,
      fetchedObservations
    );

    return {
      farmId: validFarmId,
      syncedCount: ndviObservations.length,
      skippedNoDataCount,
      totalFetched,
      observations: ndviObservations,
    };
  }
}

export const satelliteService = new SatelliteService();
