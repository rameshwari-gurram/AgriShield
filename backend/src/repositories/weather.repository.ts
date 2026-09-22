/**
 * Module 5: Weather Repository
 * Implements isolated database access for WeatherRecord model using Prisma Client.
 * Guarantees transactional all-or-nothing batch persistence and idempotent upserts.
 */

import { PrismaClient, WeatherRecord, Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { IWeatherRepository, NormalizedWeatherDTO } from '../types/weather.types.js';

export class WeatherRepository implements IWeatherRepository {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.db = dbClient;
  }

  /**
   * Count persisted weather records for a farm parcel.
   * Used to distinguish initial synchronization (count === 0) from subsequent syncs.
   */
  async countByFarmId(farmId: string): Promise<number> {
    return this.db.weatherRecord.count({
      where: { farmId },
    });
  }

  /**
   * Idempotently upsert a single weather record.
   */
  async upsert(farmId: string, observation: NormalizedWeatherDTO): Promise<WeatherRecord> {
    const results = await this.upsertMany(farmId, [observation]);
    return results[0];
  }

  /**
   * Atomically upsert a batch of weather records using a PostgreSQL transaction.
   * For the initial 24-hour backfill, this method MUST use a Prisma $transaction
   * so the complete weather batch is all-or-nothing: if any record fails, the entire
   * transaction rolls back and zero records from the failed batch remain persisted.
   */
  async upsertMany(farmId: string, observations: NormalizedWeatherDTO[]): Promise<WeatherRecord[]> {
    if (!observations || observations.length === 0) {
      return [];
    }

    return this.db.$transaction(async (tx) => {
      const records: WeatherRecord[] = [];
      for (const obs of observations) {
        const record = await tx.weatherRecord.upsert({
          where: {
            farm_observation_unique: {
              farmId,
              observedAt: obs.observedAt,
            },
          },
          update: {
            latitude: obs.latitude,
            longitude: obs.longitude,
            temperatureC: obs.temperatureC,
            humidityPercent: obs.humidityPercent,
            rainfallMm: obs.rainfallMm,
            windSpeedKmh: obs.windSpeedKmh,
            windGustKmh: obs.windGustKmh,
            weatherCode: obs.weatherCode,
            source: obs.source,
          },
          create: {
            farmId,
            observedAt: obs.observedAt,
            latitude: obs.latitude,
            longitude: obs.longitude,
            temperatureC: obs.temperatureC,
            humidityPercent: obs.humidityPercent,
            rainfallMm: obs.rainfallMm,
            windSpeedKmh: obs.windSpeedKmh,
            windGustKmh: obs.windGustKmh,
            weatherCode: obs.weatherCode,
            source: obs.source,
          },
        });
        records.push(record);
      }
      return records;
    });
  }

  /**
   * Retrieve the newest persisted weather observation for a farm.
   * Orders by observedAt DESC.
   */
  async findLatestByFarmId(farmId: string): Promise<WeatherRecord | null> {
    return this.db.weatherRecord.findFirst({
      where: { farmId },
      orderBy: { observedAt: 'desc' },
    });
  }

  /**
   * Retrieve historical weather observations from PostgreSQL within a time window.
   * Orders results chronologically ascending (observedAt ASC) for chart visualization.
   * Reads PostgreSQL only; does NOT call external weather providers.
   */
  async findHistoricalByFarmId(
    farmId: string,
    from?: Date,
    to?: Date,
    limit: number = 100
  ): Promise<WeatherRecord[]> {
    const where: Prisma.WeatherRecordWhereInput = { farmId };

    if (from || to) {
      where.observedAt = {};
      if (from) {
        where.observedAt.gte = from;
      }
      if (to) {
        where.observedAt.lte = to;
      }
    }

    return this.db.weatherRecord.findMany({
      where,
      orderBy: { observedAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Delete weather records for a farm parcel.
   * Used for isolated integration test setup and teardown.
   */
  async deleteByFarmId(farmId: string): Promise<number> {
    const { count } = await this.db.weatherRecord.deleteMany({
      where: { farmId },
    });
    return count;
  }
}

export const weatherRepository = new WeatherRepository();
