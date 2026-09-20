import { PrismaClient, Farmer, Language } from '@prisma/client';
import { prisma } from '../config/db.js';
import { IFarmerRepository } from '../types/farmer.types.js';

export class FarmerRepository implements IFarmerRepository {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.db = dbClient;
  }

  async create(data: {
    fullName: string;
    mobileNumber: string;
    preferredLanguage: Language;
    farmerReferenceNumber?: string | null;
  }): Promise<Farmer> {
    return this.db.farmer.create({
      data: {
        fullName: data.fullName,
        mobileNumber: data.mobileNumber,
        preferredLanguage: data.preferredLanguage,
        farmerReferenceNumber: data.farmerReferenceNumber || null,
      },
    });
  }

  async findById(id: string): Promise<Farmer | null> {
    return this.db.farmer.findUnique({
      where: { id },
    });
  }

  async findByMobileNumber(mobileNumber: string): Promise<Farmer | null> {
    return this.db.farmer.findUnique({
      where: { mobileNumber },
    });
  }

  async findByReferenceNumber(farmerReferenceNumber: string): Promise<Farmer | null> {
    return this.db.farmer.findUnique({
      where: { farmerReferenceNumber },
    });
  }

  async findAll(options: {
    skip: number;
    take: number;
    search?: string;
  }): Promise<Farmer[]> {
    const { skip, take, search } = options;

    return this.db.farmer.findMany({
      where: search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { mobileNumber: { contains: search } },
              { farmerReferenceNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(search?: string): Promise<number> {
    return this.db.farmer.count({
      where: search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { mobileNumber: { contains: search } },
              { farmerReferenceNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
    });
  }
}

export const farmerRepository = new FarmerRepository();
