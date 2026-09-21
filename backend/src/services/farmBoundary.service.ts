import { farmRepository } from '../repositories/farm.repository.js';
import { farmBoundaryRepository } from '../repositories/farmBoundary.repository.js';
import {
  CreateFarmBoundaryDTO,
  UpdateFarmBoundaryDTO,
  FarmBoundaryResponseDTO,
  RawBoundaryResult,
  GeoJSONPolygon,
  IFarmBoundaryRepository,
} from '../types/farmBoundary.types.js';
import { IFarmRepository } from '../types/farm.types.js';
import { AppError } from '../utils/apiError.js';

export class FarmBoundaryService {
  private repo: IFarmBoundaryRepository;
  private farmRepo: IFarmRepository;

  constructor(
    repo: IFarmBoundaryRepository = farmBoundaryRepository,
    farmRepo: IFarmRepository = farmRepository
  ) {
    this.repo = repo;
    this.farmRepo = farmRepo;
  }

  /**
   * Format raw database result into typed FarmBoundaryResponseDTO.
   */
  public formatBoundary(raw: RawBoundaryResult): FarmBoundaryResponseDTO {
    let parsedGeojson: GeoJSONPolygon;
    try {
      parsedGeojson = typeof raw.geojson === 'string' ? JSON.parse(raw.geojson) : raw.geojson;
    } catch {
      throw AppError.internal('Failed to parse boundary GeoJSON geometry');
    }

    return {
      id: raw.id,
      farmId: raw.farmId,
      boundary: parsedGeojson,
      calculatedAreaSqM: raw.calculatedAreaSqM,
      calculatedAreaHectares: raw.calculatedAreaHectares,
      calculatedAreaAcres: raw.calculatedAreaAcres,
      centroidLatitude: raw.centroidLatitude,
      centroidLongitude: raw.centroidLongitude,
      createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt),
      updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : String(raw.updatedAt),
    };
  }

  /**
   * Ensure the parent farm exists. Throws 404 if not found.
   */
  private async ensureFarmExists(farmId: string): Promise<void> {
    const farm = await this.farmRepo.findById(farmId);
    if (!farm) {
      throw AppError.notFound(`Farm with ID '${farmId}' not found`);
    }
  }

  /**
   * POST /api/v1/farms/:farmId/boundary
   * Create boundary for a farm parcel.
   */
  async createBoundary(
    farmId: string,
    dto: CreateFarmBoundaryDTO
  ): Promise<FarmBoundaryResponseDTO> {
    await this.ensureFarmExists(farmId);

    const existing = await this.repo.findByFarmId(farmId);
    if (existing) {
      throw AppError.conflict('A boundary already exists for this farm. Use PATCH to update it.');
    }

    const geojsonStr = JSON.stringify(dto.boundary);
    const validation = await this.repo.validateGeometry(geojsonStr);

    if (!validation.isValid) {
      throw AppError.badRequest(`Invalid polygon geometry: ${validation.reason}`);
    }

    const created = await this.repo.create(farmId, geojsonStr);
    return this.formatBoundary(created);
  }

  /**
   * GET /api/v1/farms/:farmId/boundary
   * Get boundary for a farm parcel.
   */
  async getBoundary(farmId: string): Promise<FarmBoundaryResponseDTO> {
    await this.ensureFarmExists(farmId);

    const boundary = await this.repo.findByFarmId(farmId);
    if (!boundary) {
      throw AppError.notFound(`Farm boundary not found for farm '${farmId}'`);
    }

    return this.formatBoundary(boundary);
  }

  /**
   * PATCH /api/v1/farms/:farmId/boundary
   * Update boundary for a farm parcel.
   */
  async updateBoundary(
    farmId: string,
    dto: UpdateFarmBoundaryDTO
  ): Promise<FarmBoundaryResponseDTO> {
    await this.ensureFarmExists(farmId);

    const existing = await this.repo.findByFarmId(farmId);
    if (!existing) {
      throw AppError.notFound(`Farm boundary not found for farm '${farmId}'`);
    }

    const geojsonStr = JSON.stringify(dto.boundary);
    const validation = await this.repo.validateGeometry(geojsonStr);

    if (!validation.isValid) {
      throw AppError.badRequest(`Invalid polygon geometry: ${validation.reason}`);
    }

    const updated = await this.repo.update(farmId, geojsonStr);
    return this.formatBoundary(updated);
  }

  /**
   * DELETE /api/v1/farms/:farmId/boundary
   * Delete boundary for a farm parcel.
   */
  async deleteBoundary(farmId: string): Promise<void> {
    await this.ensureFarmExists(farmId);

    const existing = await this.repo.findByFarmId(farmId);
    if (!existing) {
      throw AppError.notFound(`Farm boundary not found for farm '${farmId}'`);
    }

    await this.repo.deleteByFarmId(farmId);
  }
}

export const farmBoundaryService = new FarmBoundaryService();
