import { PrismaClient, Prisma, Farmer, Language } from '@prisma/client';
import { prisma } from '../config/db.js';
import { IFarmerRepository } from '../types/farmer.types.js';
import { AppError } from '../utils/apiError.js';

export class FarmerRepository implements IFarmerRepository {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.db = dbClient;
  }

  async create(data: {
    fullName: string;
    mobileNumber: string;
    email?: string | null;
    preferredLanguage: Language;
    farmerReferenceNumber?: string | null;
  }): Promise<Farmer> {
    return this.db.farmer.create({
      data: {
        fullName: data.fullName,
        mobileNumber: data.mobileNumber,
        email: data.email || null,
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

  async findByEmail(email: string): Promise<Farmer | null> {
    return this.db.farmer.findUnique({
      where: { email },
    });
  }

  async findByReferenceNumber(farmerReferenceNumber: string): Promise<Farmer | null> {
    return this.db.farmer.findUnique({
      where: { farmerReferenceNumber },
    });
  }

  async updateEmail(id: string, email: string): Promise<Farmer> {
    try {
      return await this.db.farmer.update({
        where: { id },
        data: { email },
      });
    } catch (err: unknown) {
      if (
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') ||
        (err as any)?.code === 'P2002'
      ) {
        throw AppError.conflict(
          'This email address is already associated with another producer account.'
        );
      }
      throw err;
    }
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
              { email: { contains: search, mode: 'insensitive' } },
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
              { email: { contains: search, mode: 'insensitive' } },
              { farmerReferenceNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
    });
  }
}

export const farmerRepository = new FarmerRepository();
