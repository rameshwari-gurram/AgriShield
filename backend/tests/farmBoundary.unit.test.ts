/**
 * Module 4: Farm Boundary Unit Test Suite (Mocked Repository & Validator)
 * Tests Zod validations, distinct 404s, 409 conflict, 400 geometry rejection,
 * area calculations, and CRUD lifecycle.
 */

import {
  geoJsonPolygonSchema,
  createFarmBoundarySchema,
  updateFarmBoundarySchema,
  farmIdParamForBoundarySchema,
} from '../src/validators/farmBoundary.validator.js';
import { FarmBoundaryService } from '../src/services/farmBoundary.service.js';
import {
  IFarmBoundaryRepository,
  RawBoundaryResult,
  GeometryValidationResult,
  GeoJSONPolygon,
} from '../src/types/farmBoundary.types.js';
import { IFarmRepository } from '../src/types/farm.types.js';
import { Farm, Farmer, AreaUnit, FarmStatus } from '@prisma/client';
import { AppError } from '../src/utils/apiError.js';

class MockFarmRepository implements IFarmRepository {
  public farms: (Farm & { farmer?: Farmer })[] = [];

  constructor(initialFarms: (Farm & { farmer?: Farmer })[] = []) {
    this.farms = [...initialFarms];
  }

  async findById(id: string): Promise<(Farm & { farmer?: Farmer }) | null> {
    return this.farms.find((f) => f.id === id) || null;
  }

  async create(data: any): Promise<Farm & { farmer?: Farmer }> {
    throw new Error('Not implemented');
  }
  async findByReferenceNumber(farmReferenceNumber: string): Promise<Farm | null> {
    return null;
  }
  async findByFarmerId(farmerId: string): Promise<(Farm & { farmer?: Farmer })[]> {
    return [];
  }
  async findAll(): Promise<(Farm & { farmer?: Farmer })[]> {
    return [];
  }
  async count(): Promise<number> {
    return 0;
  }
  async update(): Promise<Farm & { farmer?: Farmer }> {
    throw new Error('Not implemented');
  }
  async delete(): Promise<Farm> {
    throw new Error('Not implemented');
  }
}

class MockFarmBoundaryRepository implements IFarmBoundaryRepository {
  public boundaries: Map<string, RawBoundaryResult> = new Map();
  public mockValidationOverride?: GeometryValidationResult;

  async validateGeometry(geojsonStr: string): Promise<GeometryValidationResult> {
    if (this.mockValidationOverride) {
      return this.mockValidationOverride;
    }

    try {
      const parsed = JSON.parse(geojsonStr);
      if (parsed.type !== 'Polygon') {
        return { isValid: false, reason: 'Type is not Polygon' };
      }
      return {
        isValid: true,
        reason: null,
        areaSqM: 10000,
        centroidLon: 73.8572,
        centroidLat: 18.5209,
      };
    } catch {
      return { isValid: false, reason: 'Invalid JSON' };
    }
  }

  async create(farmId: string, geojsonStr: string): Promise<RawBoundaryResult> {
    const boundary: RawBoundaryResult = {
      id: 'b1111111-1111-1111-1111-111111111111',
      farmId,
      geojson: geojsonStr,
      calculatedAreaSqM: 10000.0,
      calculatedAreaHectares: 1.0,
      calculatedAreaAcres: 2.4711,
      centroidLatitude: 18.5209,
      centroidLongitude: 73.8572,
      createdAt: new Date('2026-09-21T10:00:00.000Z'),
      updatedAt: new Date('2026-09-21T10:00:00.000Z'),
    };
    this.boundaries.set(farmId, boundary);
    return boundary;
  }

  async findByFarmId(farmId: string): Promise<RawBoundaryResult | null> {
    return this.boundaries.get(farmId) || null;
  }

  async update(farmId: string, geojsonStr: string): Promise<RawBoundaryResult> {
    const existing = this.boundaries.get(farmId);
    if (!existing) throw new Error('Not found');

    const updated: RawBoundaryResult = {
      ...existing,
      geojson: geojsonStr,
      calculatedAreaSqM: 15000.0,
      calculatedAreaHectares: 1.5,
      calculatedAreaAcres: 3.7066,
      centroidLatitude: 18.5215,
      centroidLongitude: 73.8575,
      updatedAt: new Date('2026-09-21T11:00:00.000Z'),
    };
    this.boundaries.set(farmId, updated);
    return updated;
  }

  async deleteByFarmId(farmId: string): Promise<boolean> {
    return this.boundaries.delete(farmId);
  }
}

async function runFarmBoundaryUnitTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  console.log('=== Running Module 4 Farm Boundary Unit Tests ===\n');

  const validPolygon: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [73.8567, 18.5204],
        [73.8577, 18.5204],
        [73.8577, 18.5214],
        [73.8567, 18.5214],
        [73.8567, 18.5204],
      ],
    ],
  };

  const sampleFarm: Farm = {
    id: 'f2222222-2222-2222-2222-222222222222',
    farmerId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    farmName: 'Pune Test Farm',
    farmReferenceNumber: 'AGRI-FRM-20260921-A1B2',
    cropName: 'Sugarcane',
    cropVariety: 'Co 86032',
    sowingDate: new Date('2026-06-01'),
    expectedHarvestDate: new Date('2027-04-01'),
    farmArea: 2.5 as any,
    farmAreaUnit: AreaUnit.ACRE,
    village: 'Baramati',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '413102',
    status: FarmStatus.ACTIVE,
    createdAt: new Date('2026-09-21T09:00:00.000Z'),
    updatedAt: new Date('2026-09-21T09:00:00.000Z'),
  };

  // ---------------------------------------------------------------------------
  // 1. Zod Schema Validation Tests
  // ---------------------------------------------------------------------------
  console.log('--- 1. Zod Schema Validation ---');

  // 1.1 Valid GeoJSON polygon
  const r1_1 = geoJsonPolygonSchema.safeParse(validPolygon);
  assert(r1_1.success, '1.1 Valid GeoJSON polygon passes validation');

  // 1.2 Invalid geometry type
  const r1_2 = geoJsonPolygonSchema.safeParse({
    type: 'Point',
    coordinates: [73.8567, 18.5204],
  });
  assert(!r1_2.success, '1.2 Non-Polygon type rejected');

  // 1.3 Unclosed linear ring (first !== last)
  const unclosedPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [73.8567, 18.5204],
        [73.8577, 18.5204],
        [73.8577, 18.5214],
        [73.8567, 18.5214], // not closed
      ],
    ],
  };
  const r1_3 = geoJsonPolygonSchema.safeParse(unclosedPolygon);
  assert(!r1_3.success, '1.3 Unclosed linear ring rejected');

  // 1.4 Ring with fewer than 4 coordinates
  const tooFewCoords = {
    type: 'Polygon',
    coordinates: [
      [
        [73.8567, 18.5204],
        [73.8577, 18.5204],
        [73.8567, 18.5204],
      ],
    ],
  };
  const r1_4 = geoJsonPolygonSchema.safeParse(tooFewCoords);
  assert(!r1_4.success, '1.4 Linear ring with fewer than 4 coordinates rejected');

  // 1.5 Ring with fewer than 3 distinct vertices (e.g. collapsed line)
  const collapsedLine = {
    type: 'Polygon',
    coordinates: [
      [
        [73.8567, 18.5204],
        [73.8577, 18.5204],
        [73.8567, 18.5204],
        [73.8567, 18.5204],
      ],
    ],
  };
  const r1_5 = geoJsonPolygonSchema.safeParse(collapsedLine);
  assert(!r1_5.success, '1.5 Polygon with fewer than 3 distinct vertices rejected');

  // 1.6 Longitude outside [-180, 180]
  const invalidLon = {
    type: 'Polygon',
    coordinates: [
      [
        [185.0, 18.5204],
        [73.8577, 18.5204],
        [73.8577, 18.5214],
        [185.0, 18.5214],
        [185.0, 18.5204],
      ],
    ],
  };
  const r1_6 = geoJsonPolygonSchema.safeParse(invalidLon);
  assert(!r1_6.success, '1.6 Longitude > 180 rejected');

  // 1.7 Latitude outside [-90, 90]
  const invalidLat = {
    type: 'Polygon',
    coordinates: [
      [
        [73.8567, 95.0],
        [73.8577, 95.0],
        [73.8577, 96.0],
        [73.8567, 96.0],
        [73.8567, 95.0],
      ],
    ],
  };
  const r1_7 = geoJsonPolygonSchema.safeParse(invalidLat);
  assert(!r1_7.success, '1.7 Latitude > 90 rejected');

  // 1.8 Farm ID param validation
  const r1_8_valid = farmIdParamForBoundarySchema.safeParse({ farmId: sampleFarm.id });
  const r1_8_invalid = farmIdParamForBoundarySchema.safeParse({ farmId: 'not-a-uuid' });
  assert(r1_8_valid.success, '1.8 Valid UUID param passes');
  assert(!r1_8_invalid.success, '1.8 Invalid UUID param rejected');

  // ---------------------------------------------------------------------------
  // 2. Service Layer Tests with Mock Repositories
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Service Layer & Business Logic ---');

  const farmRepo = new MockFarmRepository([sampleFarm]);
  const boundaryRepo = new MockFarmBoundaryRepository();
  const service = new FarmBoundaryService(boundaryRepo, farmRepo);

  // 2.1 POST on non-existent farm -> 404
  let missingFarmCaught = false;
  let missingFarmMsg = '';
  try {
    await service.createBoundary('99999999-9999-9999-9999-999999999999', {
      boundary: validPolygon,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      missingFarmCaught = true;
      missingFarmMsg = err.message;
    }
  }
  assert(
    missingFarmCaught && missingFarmMsg === "Farm with ID '99999999-9999-9999-9999-999999999999' not found",
    "2.1 Non-existent farm returns 404 with exact message: Farm with ID '...' not found"
  );

  // 2.2 POST valid boundary -> 201 DTO
  const created = await service.createBoundary(sampleFarm.id, { boundary: validPolygon });
  assert(created.farmId === sampleFarm.id, '2.2 Boundary created with correct farmId');
  assert(created.calculatedAreaSqM === 10000, '2.2 Boundary has calculatedAreaSqM');
  assert(created.calculatedAreaHectares === 1.0, '2.2 Boundary has calculatedAreaHectares');
  assert(created.calculatedAreaAcres === 2.4711, '2.2 Boundary has calculatedAreaAcres');
  assert(created.centroidLatitude === 18.5209, '2.2 Boundary has centroidLatitude');
  assert(created.centroidLongitude === 73.8572, '2.2 Boundary has centroidLongitude');

  // 2.3 POST duplicate boundary -> 409 Conflict
  let duplicateCaught = false;
  let duplicateMsg = '';
  try {
    await service.createBoundary(sampleFarm.id, { boundary: validPolygon });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 409) {
      duplicateCaught = true;
      duplicateMsg = err.message;
    }
  }
  assert(
    duplicateCaught && duplicateMsg.includes('already exists'),
    '2.3 Duplicate boundary returns 409 Conflict'
  );

  // 2.4 GET existing boundary
  const fetched = await service.getBoundary(sampleFarm.id);
  assert(fetched.id === created.id, '2.4 GET retrieves existing boundary');
  assert(fetched.boundary.type === 'Polygon', '2.4 GET returns GeoJSON Polygon');

  // 2.5 GET boundary on existing farm with no boundary -> distinct 404
  const farmWithoutBoundary: Farm = {
    ...sampleFarm,
    id: 'f3333333-3333-3333-3333-333333333333',
  };
  farmRepo.farms.push(farmWithoutBoundary);

  let noBoundaryCaught = false;
  let noBoundaryMsg = '';
  try {
    await service.getBoundary(farmWithoutBoundary.id);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      noBoundaryCaught = true;
      noBoundaryMsg = err.message;
    }
  }
  assert(
    noBoundaryCaught &&
      noBoundaryMsg === `Farm boundary not found for farm '${farmWithoutBoundary.id}'`,
    "2.5 Farm without boundary returns distinct 404: Farm boundary not found for farm '...'"
  );

  // 2.6 PATCH with invalid geometry (e.g. self-intersecting bowtie) -> 400
  boundaryRepo.mockValidationOverride = {
    isValid: false,
    reason: 'Self-intersection[73.857 18.521]',
  };
  let invalidGeomCaught = false;
  let invalidGeomMsg = '';
  try {
    await service.updateBoundary(sampleFarm.id, { boundary: validPolygon });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 400) {
      invalidGeomCaught = true;
      invalidGeomMsg = err.message;
    }
  }
  assert(
    invalidGeomCaught && invalidGeomMsg.includes('Self-intersection'),
    '2.6 Invalid geometry returns 400 with ST_IsValidReason details'
  );
  boundaryRepo.mockValidationOverride = undefined; // Reset override

  // 2.7 PATCH valid boundary -> 200 updated DTO
  const updated = await service.updateBoundary(sampleFarm.id, { boundary: validPolygon });
  assert(updated.calculatedAreaSqM === 15000, '2.7 PATCH updates calculatedAreaSqM');
  assert(updated.calculatedAreaHectares === 1.5, '2.7 PATCH updates calculatedAreaHectares');

  // 2.8 PATCH on farm without boundary -> 404
  let patchNoBoundaryCaught = false;
  try {
    await service.updateBoundary(farmWithoutBoundary.id, { boundary: validPolygon });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      patchNoBoundaryCaught = true;
    }
  }
  assert(patchNoBoundaryCaught, '2.8 PATCH on farm without boundary returns 404');

  // 2.9 DELETE boundary on existing farm
  await service.deleteBoundary(sampleFarm.id);
  const afterDelete = await boundaryRepo.findByFarmId(sampleFarm.id);
  assert(afterDelete === null, '2.9 DELETE removes boundary from repository');

  // 2.10 GET after DELETE -> 404
  let getAfterDeleteCaught = false;
  try {
    await service.getBoundary(sampleFarm.id);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      getAfterDeleteCaught = true;
    }
  }
  assert(getAfterDeleteCaught, '2.10 Boundary is no longer retrievable after DELETE (404)');

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Farm Boundary Unit Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runFarmBoundaryUnitTests().catch((error) => {
  console.error('Fatal error during test run:', error);
  process.exit(1);
});
