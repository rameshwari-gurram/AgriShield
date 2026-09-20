import { Farm, Farmer, AreaUnit, FarmStatus } from '@prisma/client';
import crypto from 'crypto';
import { farmRepository } from '../repositories/farm.repository.js';
import { farmerRepository } from '../repositories/farmer.repository.js';
import {
  CreateFarmDTO,
  UpdateFarmDTO,
  FarmResponseDTO,
  FarmQueryDTO,
  FarmListResponseDTO,
  IFarmRepository,
} from '../types/farm.types.js';
import { IFarmerRepository } from '../types/farmer.types.js';
import { AppError } from '../utils/apiError.js';

export class FarmService {
  private repo: IFarmRepository;
  private farmerRepo: IFarmerRepository;

  constructor(
    repository: IFarmRepository = farmRepository,
    farmerRepo: IFarmerRepository = farmerRepository
  ) {
    this.repo = repository;
    this.farmerRepo = farmerRepo;
  }

  /**
   * Safely generate a unique internal AgriShield farm reference number.
   * Format: AGRI-FRM-<YYYYMMDD>-<HEX4>
   * Example: AGRI-FRM-20260920-F8C2
   * Strictly an internal platform reference, not a legal/government ID or title.
   */
  public async generateUniqueReferenceNumber(): Promise<string> {
    const maxRetries = 3;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const entropy = crypto.randomBytes(2).toString('hex').toUpperCase();
      const candidateRef = `AGRI-FRM-${dateStr}-${entropy}`;

      const existing = await this.repo.findByReferenceNumber(candidateRef);
      if (!existing) {
        return candidateRef;
      }
    }

    // Fallback using timestamp entropy
    return `AGRI-FRM-${dateStr}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  }

  /**
   * Format Prisma Farm entity into clean Response DTO
   */
  public formatFarm(farm: Farm & { farmer?: Farmer | null }): FarmResponseDTO {
    const sowingDateStr =
      farm.sowingDate instanceof Date
        ? farm.sowingDate.toISOString().split('T')[0]
        : String(farm.sowingDate).split('T')[0];

    const expectedHarvestDateStr = farm.expectedHarvestDate
      ? farm.expectedHarvestDate instanceof Date
        ? farm.expectedHarvestDate.toISOString().split('T')[0]
        : String(farm.expectedHarvestDate).split('T')[0]
      : null;

    return {
      id: farm.id,
      farmerId: farm.farmerId,
      farmName: farm.farmName,
      farmReferenceNumber: farm.farmReferenceNumber,
      cropName: farm.cropName,
      cropVariety: farm.cropVariety || null,
      sowingDate: sowingDateStr,
      expectedHarvestDate: expectedHarvestDateStr,
      farmArea: Number(farm.farmArea),
      farmAreaUnit: farm.farmAreaUnit,
      village: farm.village,
      district: farm.district,
      state: farm.state,
      pincode: farm.pincode,
      status: farm.status,
      createdAt: farm.createdAt instanceof Date ? farm.createdAt.toISOString() : String(farm.createdAt),
      updatedAt: farm.updatedAt instanceof Date ? farm.updatedAt.toISOString() : String(farm.updatedAt),
      farmer: farm.farmer
        ? {
            id: farm.farmer.id,
            fullName: farm.farmer.fullName,
            mobileNumber: farm.farmer.mobileNumber,
          }
        : undefined,
    };
  }

  /**
   * Register a new farm
   */
  async registerFarm(dto: CreateFarmDTO): Promise<FarmResponseDTO> {
    // 1. Verify farmer exists
    const farmer = await this.farmerRepo.findById(dto.farmerId);
    if (!farmer) {
      throw AppError.notFound(`Farmer with ID '${dto.farmerId}' not found`);
    }

    // 2. Validate sowing and expected harvest dates
    const sowingDateObj = new Date(dto.sowingDate);
    if (isNaN(sowingDateObj.getTime())) {
      throw AppError.badRequest('Sowing date must be a valid date');
    }

    let harvestDateObj: Date | null = null;
    if (dto.expectedHarvestDate) {
      harvestDateObj = new Date(dto.expectedHarvestDate);
      if (isNaN(harvestDateObj.getTime())) {
        throw AppError.badRequest('Expected harvest date must be a valid date');
      }
      if (harvestDateObj < sowingDateObj) {
        throw AppError.badRequest('Expected harvest date must be on or after sowing date');
      }
    }

    // 3. Generate unique farm reference number
    const farmReferenceNumber = await this.generateUniqueReferenceNumber();

    // 4. Persist farm
    const createdFarm = await this.repo.create({
      farmerId: dto.farmerId,
      farmName: dto.farmName.trim(),
      farmReferenceNumber,
      cropName: dto.cropName.trim(),
      cropVariety: dto.cropVariety ? dto.cropVariety.trim() : null,
      sowingDate: sowingDateObj,
      expectedHarvestDate: harvestDateObj,
      farmArea: dto.farmArea,
      farmAreaUnit: dto.farmAreaUnit || AreaUnit.ACRE,
      village: dto.village.trim(),
      district: dto.district.trim(),
      state: dto.state.trim(),
      pincode: dto.pincode.trim(),
      status: dto.status || FarmStatus.ACTIVE,
    });

    return this.formatFarm(createdFarm);
  }

  /**
   * Retrieve farm by UUID
   */
  async getFarmById(id: string): Promise<FarmResponseDTO> {
    const farm = await this.repo.findById(id, true);
    if (!farm) {
      throw AppError.notFound(`Farm with ID '${id}' not found`);
    }
    return this.formatFarm(farm);
  }

  /**
   * Retrieve all farms belonging to a specific farmer
   */
  async getFarmsByFarmerId(farmerId: string): Promise<FarmResponseDTO[]> {
    const farmer = await this.farmerRepo.findById(farmerId);
    if (!farmer) {
      throw AppError.notFound(`Farmer with ID '${farmerId}' not found`);
    }

    const farms = await this.repo.findByFarmerId(farmerId);
    return farms.map((f) => this.formatFarm(f));
  }

  /**
   * Retrieve paginated list of farms with filters
   */
  async getAllFarms(query: FarmQueryDTO): Promise<FarmListResponseDTO> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [farms, total] = await Promise.all([
      this.repo.findAll({
        skip,
        take: limit,
        search: query.search?.trim(),
        cropName: query.cropName?.trim(),
        state: query.state?.trim(),
        status: query.status,
        farmerId: query.farmerId,
        includeFarmer: true,
      }),
      this.repo.count({
        search: query.search?.trim(),
        cropName: query.cropName?.trim(),
        state: query.state?.trim(),
        status: query.status,
        farmerId: query.farmerId,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      farms: farms.map((f) => this.formatFarm(f)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Partial update for a farm (PATCH)
   */
  async updateFarm(id: string, dto: UpdateFarmDTO): Promise<FarmResponseDTO> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Farm with ID '${id}' not found`);
    }

    // Cross-field date consistency verification
    const effectiveSowing = dto.sowingDate ? new Date(dto.sowingDate) : existing.sowingDate;
    if (isNaN(effectiveSowing.getTime())) {
      throw AppError.badRequest('Sowing date must be a valid date');
    }

    let effectiveHarvest: Date | null = null;
    if (dto.expectedHarvestDate !== undefined) {
      effectiveHarvest = dto.expectedHarvestDate ? new Date(dto.expectedHarvestDate) : null;
    } else {
      effectiveHarvest = existing.expectedHarvestDate;
    }

    if (effectiveHarvest) {
      if (isNaN(effectiveHarvest.getTime())) {
        throw AppError.badRequest('Expected harvest date must be a valid date');
      }
      if (effectiveHarvest < effectiveSowing) {
        throw AppError.badRequest('Expected harvest date must be on or after sowing date');
      }
    }

    const updatedFarm = await this.repo.update(id, {
      farmName: dto.farmName?.trim(),
      cropName: dto.cropName?.trim(),
      cropVariety: dto.cropVariety !== undefined ? (dto.cropVariety ? dto.cropVariety.trim() : null) : undefined,
      sowingDate: dto.sowingDate ? new Date(dto.sowingDate) : undefined,
      expectedHarvestDate: dto.expectedHarvestDate !== undefined ? effectiveHarvest : undefined,
      farmArea: dto.farmArea,
      farmAreaUnit: dto.farmAreaUnit,
      village: dto.village?.trim(),
      district: dto.district?.trim(),
      state: dto.state?.trim(),
      pincode: dto.pincode?.trim(),
      status: dto.status,
    });

    return this.formatFarm(updatedFarm);
  }

  /**
   * Delete farm record
   */
  async deleteFarm(id: string): Promise<{ id: string; farmReferenceNumber: string }> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw AppError.notFound(`Farm with ID '${id}' not found`);
    }

    await this.repo.delete(id);

    return {
      id: existing.id,
      farmReferenceNumber: existing.farmReferenceNumber,
    };
  }
}

export const farmService = new FarmService();
