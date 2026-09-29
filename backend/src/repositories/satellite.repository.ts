/**
 * Module 7: Satellite & NDVI Repository
 * Implements isolated database persistence for SatelliteObservation and NdviObservation models
 * using Prisma Client. Guarantees transactional all-or-nothing batch persistence,
 * strict foreign-key integrity, and idempotent upserts.
 */

import { PrismaClient, SatelliteObservation, NdviObservation, Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import {
  ISatelliteRepository,
  NormalizedSatelliteObservationDTO,
  NormalizedNdviMetricsDTO,
  NormalizedNdviObservationDTO,
} from '../types/satellite.types.js';

export class SatelliteRepository implements ISatelliteRepository {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.db = dbClient;
  }

  /**
   * Directly creates or updates a single SatelliteObservation record.
   */
  async createSatelliteObservation(
    farmId: string,
    data: NormalizedSatelliteObservationDTO
  ): Promise<SatelliteObservation> {
    return this.db.satelliteObservation.upsert({
      where: {
        farm_satellite_product_unique: {
          farmId,
          productId: data.productId,
        },
      },
      update: {
        observedAt: data.observedAt,
        provider: data.provider,
        satellite: data.satellite,
        productType: data.productType,
        cloudCoverage: data.cloudCoverage,
        sourceReference: data.sourceReference,
      },
      create: {
        farmId,
        observedAt: data.observedAt,
        provider: data.provider,
        satellite: data.satellite,
        productType: data.productType,
        productId: data.productId,
        cloudCoverage: data.cloudCoverage,
        sourceReference: data.sourceReference,
      },
    });
  }

  /**
   * Directly creates or updates a single NdviObservation record.
   */
  async createNdviObservation(
    farmId: string,
    satelliteObservationId: string,
    data: NormalizedNdviMetricsDTO,
    observedAt: Date
  ): Promise<NdviObservation> {
    return this.db.ndviObservation.upsert({
      where: {
        satelliteObservationId,
      },
      update: {
        observedAt,
        meanNdvi: data.meanNdvi,
        minNdvi: data.minNdvi,
        maxNdvi: data.maxNdvi,
        validPixelPercentage: data.validPixelPercentage,
      },
      create: {
        farmId,
        satelliteObservationId,
        observedAt,
        meanNdvi: data.meanNdvi,
        minNdvi: data.minNdvi,
        maxNdvi: data.maxNdvi,
        validPixelPercentage: data.validPixelPercentage,
      },
    });
  }

  /**
   * Atomically persists a paired SatelliteObservation and its computed NdviObservation
   * inside an isolated database transaction.
   */
  async persistObservation(
    farmId: string,
    observation: NormalizedNdviObservationDTO
  ): Promise<{
    satelliteObservation: SatelliteObservation;
    ndviObservation: NdviObservation;
  }> {
    const batchResult = await this.persistBatch(farmId, [observation]);
    return {
      satelliteObservation: batchResult.satelliteObservations[0],
      ndviObservation: batchResult.ndviObservations[0],
    };
  }

  /**
   * Atomically persists a batch of normalized satellite + NDVI observation pairs using a
   * Prisma $transaction. If any observation fails constraint checks or database limits,
   * the entire transaction rolls back and zero records from the batch remain persisted.
   */
  async persistBatch(
    farmId: string,
    observations: NormalizedNdviObservationDTO[]
  ): Promise<{
    satelliteObservations: SatelliteObservation[];
    ndviObservations: NdviObservation[];
  }> {
    if (!observations || observations.length === 0) {
      return { satelliteObservations: [], ndviObservations: [] };
    }

    return this.db.$transaction(async (tx) => {
      const satRecords: SatelliteObservation[] = [];
      const ndviRecords: NdviObservation[] = [];

      for (const obs of observations) {
        // 1. Upsert satellite observation record
        const satRecord = await tx.satelliteObservation.upsert({
          where: {
            farm_satellite_product_unique: {
              farmId,
              productId: obs.satellite.productId,
            },
          },
          update: {
            observedAt: obs.satellite.observedAt,
            provider: obs.satellite.provider,
            satellite: obs.satellite.satellite,
            productType: obs.satellite.productType,
            cloudCoverage: obs.satellite.cloudCoverage,
            sourceReference: obs.satellite.sourceReference,
          },
          create: {
            farmId,
            observedAt: obs.satellite.observedAt,
            provider: obs.satellite.provider,
            satellite: obs.satellite.satellite,
            productType: obs.satellite.productType,
            productId: obs.satellite.productId,
            cloudCoverage: obs.satellite.cloudCoverage,
            sourceReference: obs.satellite.sourceReference,
          },
        });
        satRecords.push(satRecord);

        // 2. Upsert NDVI observation linked to satellite observation
        const ndviRecord = await tx.ndviObservation.upsert({
          where: {
            satelliteObservationId: satRecord.id,
          },
          update: {
            observedAt: obs.observedAt,
            meanNdvi: obs.ndvi.meanNdvi,
            minNdvi: obs.ndvi.minNdvi,
            maxNdvi: obs.ndvi.maxNdvi,
            validPixelPercentage: obs.ndvi.validPixelPercentage,
          },
          create: {
            farmId,
            satelliteObservationId: satRecord.id,
            observedAt: obs.observedAt,
            meanNdvi: obs.ndvi.meanNdvi,
            minNdvi: obs.ndvi.minNdvi,
            maxNdvi: obs.ndvi.maxNdvi,
            validPixelPercentage: obs.ndvi.validPixelPercentage,
          },
        });
        ndviRecords.push(ndviRecord);
      }

      return {
        satelliteObservations: satRecords,
        ndviObservations: ndviRecords,
      };
    });
  }

  /**
   * Retrieves satellite observations for a farm, ordered by observedAt DESC.
   */
  async findSatelliteObservationsByFarmId(
    farmId: string,
    from?: Date,
    to?: Date,
    limit: number = 100
  ): Promise<SatelliteObservation[]> {
    const where: Prisma.SatelliteObservationWhereInput = { farmId };

    if (from || to) {
      where.observedAt = {};
      if (from) where.observedAt.gte = from;
      if (to) where.observedAt.lte = to;
    }

    return this.db.satelliteObservation.findMany({
      where,
      orderBy: { observedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Retrieves NDVI observations for a farm with attached satellite observation metadata,
   * ordered chronologically ascending (observedAt ASC) for chart visualization.
   */
  async findNdviObservationsByFarmId(
    farmId: string,
    from?: Date,
    to?: Date,
    limit: number = 100
  ): Promise<NdviObservation[]> {
    const where: Prisma.NdviObservationWhereInput = { farmId };

    if (from || to) {
      where.observedAt = {};
      if (from) where.observedAt.gte = from;
      if (to) where.observedAt.lte = to;
    }

    return this.db.ndviObservation.findMany({
      where,
      include: {
        satelliteObservation: true,
      },
      orderBy: { observedAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Retrieves the newest persisted NDVI observation for a farm.
   */
  async findLatestNdviByFarmId(farmId: string): Promise<NdviObservation | null> {
    return this.db.ndviObservation.findFirst({
      where: { farmId },
      include: {
        satelliteObservation: true,
      },
      orderBy: { observedAt: 'desc' },
    });
  }

  /**
   * Counts persisted satellite and NDVI records for a farm parcel.
   */
  async countByFarmId(farmId: string): Promise<{ satelliteCount: number; ndviCount: number }> {
    const [satelliteCount, ndviCount] = await Promise.all([
      this.db.satelliteObservation.count({ where: { farmId } }),
      this.db.ndviObservation.count({ where: { farmId } }),
    ]);

    return { satelliteCount, ndviCount };
  }

  /**
   * Deletes satellite and NDVI records for a farm parcel.
   * Used for isolated integration test setup and teardown.
   */
  async deleteByFarmId(farmId: string): Promise<{ satelliteCount: number; ndviCount: number }> {
    // Due to ON DELETE CASCADE on satelliteObservationId, deleting satellite_observations cascades to ndvi_observations
    const { count: ndviCount } = await this.db.ndviObservation.deleteMany({
      where: { farmId },
    });

    const { count: satelliteCount } = await this.db.satelliteObservation.deleteMany({
      where: { farmId },
    });

    return { satelliteCount, ndviCount };
  }
}

export const satelliteRepository = new SatelliteRepository();
