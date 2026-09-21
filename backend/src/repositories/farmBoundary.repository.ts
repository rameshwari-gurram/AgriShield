import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../config/db.js';
import {
  IFarmBoundaryRepository,
  RawBoundaryResult,
  GeometryValidationResult,
} from '../types/farmBoundary.types.js';

interface RawSqlBoundaryRow {
  id: string;
  farmId: string;
  geojson: string;
  calculatedAreaSqM: string | number;
  calculatedAreaHectares: string | number;
  calculatedAreaAcres: string | number;
  centroidLatitude: string | number;
  centroidLongitude: string | number;
  createdAt: Date;
  updatedAt: Date;
}

export class FarmBoundaryRepository implements IFarmBoundaryRepository {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = prisma) {
    this.db = dbClient;
  }

  /**
   * Validate geometry using PostGIS ST_IsValid and ST_IsValidReason.
   * Also computes ST_Area(geom::geography) and centroid coordinates.
   */
  async validateGeometry(geojsonStr: string): Promise<GeometryValidationResult> {
    try {
      const rows = await this.db.$queryRaw<
        Array<{
          isValid: boolean;
          reason: string;
          areaSqM: number | string | null;
          centroidLon: number | string | null;
          centroidLat: number | string | null;
        }>
      >`
        SELECT 
          ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)) AS "isValid",
          ST_IsValidReason(ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)) AS "reason",
          ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326)::geography) AS "areaSqM",
          ST_X(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326))) AS "centroidLon",
          ST_Y(ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326))) AS "centroidLat"
      `;

      if (!rows || rows.length === 0) {
        return { isValid: false, reason: 'Unable to evaluate geometry' };
      }

      const row = rows[0];
      const area = row.areaSqM !== null ? Number(row.areaSqM) : 0;

      if (!row.isValid) {
        return {
          isValid: false,
          reason: row.reason || 'Invalid geometry (self-intersecting or malformed ring)',
        };
      }

      if (area <= 0) {
        return {
          isValid: false,
          reason: 'Polygon calculated area must be greater than 0',
        };
      }

      return {
        isValid: true,
        reason: null,
        areaSqM: area,
        centroidLon: row.centroidLon !== null ? Number(row.centroidLon) : undefined,
        centroidLat: row.centroidLat !== null ? Number(row.centroidLat) : undefined,
      };
    } catch (err: any) {
      return {
        isValid: false,
        reason: err.message || 'Malformed GeoJSON or unsupported geometry structure',
      };
    }
  }

  /**
   * Insert farm boundary with spatial geometry and computed fields.
   */
  async create(farmId: string, geojsonStr: string): Promise<RawBoundaryResult> {
    const id = crypto.randomUUID();

    const rows = await this.db.$queryRaw<RawSqlBoundaryRow[]>`
      WITH geom_data AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326) AS g
      ),
      calc_data AS (
        SELECT 
          g,
          ST_Area(g::geography) AS area_sqm,
          ST_Centroid(g) AS centroid_pt
        FROM geom_data
      )
      INSERT INTO "farm_boundaries" (
        "id",
        "farmId",
        "geom",
        "calculatedAreaSqM",
        "calculatedAreaHectares",
        "calculatedAreaAcres",
        "centroidLatitude",
        "centroidLongitude",
        "createdAt",
        "updatedAt"
      )
      SELECT 
        ${id}::uuid,
        ${farmId}::uuid,
        g,
        ROUND(area_sqm::numeric, 2),
        ROUND((area_sqm / 10000.0)::numeric, 4),
        ROUND((area_sqm / 4046.8564224)::numeric, 4),
        ROUND(ST_Y(centroid_pt)::numeric, 6),
        ROUND(ST_X(centroid_pt)::numeric, 6),
        NOW(),
        NOW()
      FROM calc_data
      RETURNING
        "id",
        "farmId",
        ST_AsGeoJSON("geom") AS "geojson",
        "calculatedAreaSqM",
        "calculatedAreaHectares",
        "calculatedAreaAcres",
        "centroidLatitude",
        "centroidLongitude",
        "createdAt",
        "updatedAt"
    `;

    return this.mapRow(rows[0]);
  }

  /**
   * Find boundary by farm ID.
   */
  async findByFarmId(farmId: string): Promise<RawBoundaryResult | null> {
    const rows = await this.db.$queryRaw<RawSqlBoundaryRow[]>`
      SELECT
        "id",
        "farmId",
        ST_AsGeoJSON("geom") AS "geojson",
        "calculatedAreaSqM",
        "calculatedAreaHectares",
        "calculatedAreaAcres",
        "centroidLatitude",
        "centroidLongitude",
        "createdAt",
        "updatedAt"
      FROM "farm_boundaries"
      WHERE "farmId" = ${farmId}::uuid
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return null;
    }

    return this.mapRow(rows[0]);
  }

  /**
   * Update existing farm boundary.
   */
  async update(farmId: string, geojsonStr: string): Promise<RawBoundaryResult> {
    const rows = await this.db.$queryRaw<RawSqlBoundaryRow[]>`
      WITH geom_data AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326) AS g
      ),
      calc_data AS (
        SELECT 
          g,
          ST_Area(g::geography) AS area_sqm,
          ST_Centroid(g) AS centroid_pt
        FROM geom_data
      )
      UPDATE "farm_boundaries"
      SET
        "geom" = calc_data.g,
        "calculatedAreaSqM" = ROUND(calc_data.area_sqm::numeric, 2),
        "calculatedAreaHectares" = ROUND((calc_data.area_sqm / 10000.0)::numeric, 4),
        "calculatedAreaAcres" = ROUND((calc_data.area_sqm / 4046.8564224)::numeric, 4),
        "centroidLatitude" = ROUND(ST_Y(calc_data.centroid_pt)::numeric, 6),
        "centroidLongitude" = ROUND(ST_X(calc_data.centroid_pt)::numeric, 6),
        "updatedAt" = NOW()
      FROM calc_data
      WHERE "farmId" = ${farmId}::uuid
      RETURNING
        "id",
        "farmId",
        ST_AsGeoJSON("geom") AS "geojson",
        "calculatedAreaSqM",
        "calculatedAreaHectares",
        "calculatedAreaAcres",
        "centroidLatitude",
        "centroidLongitude",
        "createdAt",
        "updatedAt"
    `;

    return this.mapRow(rows[0]);
  }

  /**
   * Delete farm boundary by farm ID.
   */
  async deleteByFarmId(farmId: string): Promise<boolean> {
    const count = await this.db.$executeRaw`
      DELETE FROM "farm_boundaries"
      WHERE "farmId" = ${farmId}::uuid
    `;
    return count > 0;
  }

  private mapRow(row: RawSqlBoundaryRow): RawBoundaryResult {
    return {
      id: row.id,
      farmId: row.farmId,
      geojson: row.geojson,
      calculatedAreaSqM: Number(row.calculatedAreaSqM),
      calculatedAreaHectares: Number(row.calculatedAreaHectares),
      calculatedAreaAcres: Number(row.calculatedAreaAcres),
      centroidLatitude: Number(row.centroidLatitude),
      centroidLongitude: Number(row.centroidLongitude),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export const farmBoundaryRepository = new FarmBoundaryRepository();
