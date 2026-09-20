import { Language, Farmer } from '@prisma/client';
import crypto from 'crypto';
import { farmerRepository } from '../repositories/farmer.repository.js';
import {
  CreateFarmerDTO,
  FarmerResponseDTO,
  FarmerQueryDTO,
  FarmerListResponseDTO,
  IFarmerRepository,
} from '../types/farmer.types.js';
import { AppError } from '../utils/apiError.js';

export class FarmerService {
  private repo: IFarmerRepository;

  constructor(repository: IFarmerRepository = farmerRepository) {
    this.repo = repository;
  }

  /**
   * Normalize mobile numbers by stripping country code (+91) or leading zeros
   * to ensure consistent duplicate detection.
   */
  public normalizeMobileNumber(rawNumber: string): string {
    const digitsOnly = rawNumber.replace(/\D/g, '');
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      return digitsOnly.substring(2);
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      return digitsOnly.substring(1);
    }
    return digitsOnly;
  }

  /**
   * Safely generate a unique internal AgriShield farmer reference number.
   * Format: AGRI-FMR-<YYYYMMDD>-<HEX4>
   * Strictly an internal platform reference, not a legal/government ID.
   */
  private async generateUniqueReferenceNumber(): Promise<string> {
    const maxRetries = 3;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const entropy = crypto.randomBytes(3).toString('hex').toUpperCase();
      const candidateRef = `AGRI-FMR-${dateStr}-${entropy}`;

      const existing = await this.repo.findByReferenceNumber(candidateRef);
      if (!existing) {
        return candidateRef;
      }
    }

    // Fallback using high-resolution timestamp
    return `AGRI-FMR-${dateStr}-${Date.now().toString(36).toUpperCase()}`;
  }

  /**
   * Format Prisma Farmer entity into clean Response DTO
   */
  private formatFarmer(farmer: Farmer): FarmerResponseDTO {
    return {
      id: farmer.id,
      fullName: farmer.fullName,
      mobileNumber: farmer.mobileNumber,
      preferredLanguage: farmer.preferredLanguage,
      farmerReferenceNumber: farmer.farmerReferenceNumber,
      createdAt: farmer.createdAt.toISOString(),
      updatedAt: farmer.updatedAt.toISOString(),
    };
  }

  /**
   * Register a new farmer
   */
  async registerFarmer(dto: CreateFarmerDTO): Promise<FarmerResponseDTO> {
    const normalizedMobile = this.normalizeMobileNumber(dto.mobileNumber);

    // 1. Check for duplicate mobile number
    const existingMobile = await this.repo.findByMobileNumber(normalizedMobile);
    if (existingMobile) {
      throw AppError.conflict(`Farmer with mobile number ${normalizedMobile} is already registered`);
    }

    // 2. Handle internal farmer reference number
    let finalReferenceNumber: string;
    if (dto.farmerReferenceNumber && dto.farmerReferenceNumber.trim().length > 0) {
      const trimmedRef = dto.farmerReferenceNumber.trim();
      const existingRef = await this.repo.findByReferenceNumber(trimmedRef);
      if (existingRef) {
        throw AppError.conflict(`Farmer reference number '${trimmedRef}' is already in use`);
      }
      finalReferenceNumber = trimmedRef;
    } else {
      finalReferenceNumber = await this.generateUniqueReferenceNumber();
    }

    // 3. Persist farmer
    const createdFarmer = await this.repo.create({
      fullName: dto.fullName.trim(),
      mobileNumber: normalizedMobile,
      preferredLanguage: dto.preferredLanguage || Language.en,
      farmerReferenceNumber: finalReferenceNumber,
    });

    return this.formatFarmer(createdFarmer);
  }

  /**
   * Retrieve farmer by UUID
   */
  async getFarmerById(id: string): Promise<FarmerResponseDTO> {
    const farmer = await this.repo.findById(id);
    if (!farmer) {
      throw AppError.notFound(`Farmer with ID '${id}' not found`);
    }
    return this.formatFarmer(farmer);
  }

  /**
   * Retrieve paginated list of farmers
   */
  async getAllFarmers(query: FarmerQueryDTO): Promise<FarmerListResponseDTO> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const [farmers, total] = await Promise.all([
      this.repo.findAll({ skip, take: limit, search }),
      this.repo.count(search),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      farmers: farmers.map((f) => this.formatFarmer(f)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}

export const farmerService = new FarmerService();
