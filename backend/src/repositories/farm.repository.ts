import { PrismaClient, Farm, Farmer, AreaUnit, FarmStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { IFarmRepository } from '../types/farm.types.js';

export class FarmRepository implements IFarmRepository {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.db = dbClient;
  }

  private buildWhereClause(filters?: {
    search?: string;
    cropName?: string;
    state?: string;
    status?: FarmStatus;
    farmerId?: string;
  }): Prisma.FarmWhereInput | undefined {
    if (!filters) return undefined;

    const conditions: Prisma.FarmWhereInput[] = [];

    if (filters.farmerId) {
      conditions.push({ farmerId: filters.farmerId });
    }

    if (filters.cropName) {
      conditions.push({ cropName: { contains: filters.cropName, mode: 'insensitive' } });
    }

    if (filters.state) {
      conditions.push({ state: { contains: filters.state, mode: 'insensitive' } });
    }

    if (filters.status) {
      conditions.push({ status: filters.status });
    }

    if (filters.search) {
      const s = filters.search;
      conditions.push({
        OR: [
          { farmName: { contains: s, mode: 'insensitive' } },
          { cropName: { contains: s, mode: 'insensitive' } },
          { village: { contains: s, mode: 'insensitive' } },
          { district: { contains: s, mode: 'insensitive' } },
          { farmReferenceNumber: { contains: s, mode: 'insensitive' } },
        ],
      });
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  async create(data: {
    farmerId: string;
    farmName: string;
    farmReferenceNumber: string;
    cropName: string;
    cropVariety?: string | null;
    sowingDate: Date;
    expectedHarvestDate?: Date | null;
    farmArea: number;
    farmAreaUnit: AreaUnit;
    village: string;
    district: string;
    state: string;
    pincode: string;
    status: FarmStatus;
  }): Promise<Farm & { farmer?: Farmer }> {
    return this.db.farm.create({
      data: {
        farmerId: data.farmerId,
        farmName: data.farmName,
        farmReferenceNumber: data.farmReferenceNumber,
        cropName: data.cropName,
        cropVariety: data.cropVariety || null,
        sowingDate: data.sowingDate,
        expectedHarvestDate: data.expectedHarvestDate || null,
        farmArea: new Prisma.Decimal(data.farmArea),
        farmAreaUnit: data.farmAreaUnit,
        village: data.village,
        district: data.district,
        state: data.state,
        pincode: data.pincode,
        status: data.status,
      },
      include: {
        farmer: true,
      },
    });
  }

  async findById(id: string, includeFarmer: boolean = true): Promise<(Farm & { farmer?: Farmer }) | null> {
    return this.db.farm.findUnique({
      where: { id },
      include: {
        farmer: includeFarmer,
      },
    });
  }

  async findByReferenceNumber(farmReferenceNumber: string): Promise<Farm | null> {
    return this.db.farm.findUnique({
      where: { farmReferenceNumber },
    });
  }

  async findByFarmerId(farmerId: string): Promise<(Farm & { farmer?: Farmer })[]> {
    return this.db.farm.findMany({
      where: { farmerId },
      include: {
        farmer: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(options: {
    skip: number;
    take: number;
    search?: string;
    cropName?: string;
    state?: string;
    status?: FarmStatus;
    farmerId?: string;
    includeFarmer?: boolean;
  }): Promise<(Farm & { farmer?: Farmer })[]> {
    const { skip, take, search, cropName, state, status, farmerId, includeFarmer = true } = options;
    const where = this.buildWhereClause({ search, cropName, state, status, farmerId });

    return this.db.farm.findMany({
      where,
      skip,
      take,
      include: {
        farmer: includeFarmer,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(filters?: {
    search?: string;
    cropName?: string;
    state?: string;
    status?: FarmStatus;
    farmerId?: string;
  }): Promise<number> {
    const where = this.buildWhereClause(filters);
    return this.db.farm.count({ where });
  }

  async update(
    id: string,
    data: {
      farmName?: string;
      cropName?: string;
      cropVariety?: string | null;
      sowingDate?: Date;
      expectedHarvestDate?: Date | null;
      farmArea?: number;
      farmAreaUnit?: AreaUnit;
      village?: string;
      district?: string;
      state?: string;
      pincode?: string;
      status?: FarmStatus;
    }
  ): Promise<Farm & { farmer?: Farmer }> {
    const updateData: Prisma.FarmUpdateInput = {};

    if (data.farmName !== undefined) updateData.farmName = data.farmName;
    if (data.cropName !== undefined) updateData.cropName = data.cropName;
    if (data.cropVariety !== undefined) updateData.cropVariety = data.cropVariety;
    if (data.sowingDate !== undefined) updateData.sowingDate = data.sowingDate;
    if (data.expectedHarvestDate !== undefined) updateData.expectedHarvestDate = data.expectedHarvestDate;
    if (data.farmArea !== undefined) updateData.farmArea = new Prisma.Decimal(data.farmArea);
    if (data.farmAreaUnit !== undefined) updateData.farmAreaUnit = data.farmAreaUnit;
    if (data.village !== undefined) updateData.village = data.village;
    if (data.district !== undefined) updateData.district = data.district;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.pincode !== undefined) updateData.pincode = data.pincode;
    if (data.status !== undefined) updateData.status = data.status;

    return this.db.farm.update({
      where: { id },
      data: updateData,
      include: {
        farmer: true,
      },
    });
  }

  async delete(id: string): Promise<Farm> {
    return this.db.farm.delete({
      where: { id },
    });
  }
}

export const farmRepository = new FarmRepository();
