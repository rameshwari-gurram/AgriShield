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
   */
  async persistBatch(
    farmId: string,
    observations: NormalizedNdviObservationDTO[]
  ): Promise<{
    satelliteObservations: SatelliteObservationResponseDTO[];
    ndviObservations: NdviObservationResponseDTO[];
  }> {
    const validFarmId = validateFarmId(farmId);

    // Verify farm exists
    const farm = await this.farmRepo.findById(validFarmId);
    if (!farm) {
      throw AppError.notFound(`Farm with ID ${validFarmId} not found.`);
    }

    if (!observations || observations.length === 0) {
      return { satelliteObservations: [], ndviObservations: [] };
    }

    const validatedBatch = observations.map((obs) => validateNormalizedObservationPair(obs));

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
   * 5. Validate observations.
   * 6. Transactionally persist into database.
   * 7. Return normalized response DTOs.
   */
  async syncSatelliteObservations(
    farmId: string,
    dateRange: { from: Date; to: Date }
  ): Promise<{
    farmId: string;
    syncedCount: number;
    observations: NdviObservationResponseDTO[];
  }> {
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
    const normalizedObservations = await this.provider.fetchNdviObservations(polygon, dateRange);

    // 4. Atomically persist observations
    const { ndviObservations } = await this.persistBatch(validFarmId, normalizedObservations);

    return {
      farmId: validFarmId,
      syncedCount: ndviObservations.length,
      observations: ndviObservations,
    };
  }
}

export const satelliteService = new SatelliteService();
