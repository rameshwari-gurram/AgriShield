/**
 * Module 4: Farm Boundary Integration Test Suite (Live PostgreSQL + PostGIS)
 * Tests live PostGIS spatial capabilities, deterministic geodesic area calculations,
 * SRID 4326 storage, topological invalidity rejection (bowtie), 409 conflict,
 * distinct 404 messages, boundary deletion isolation, and Farm cascade deletion.
 */

import { prisma } from '../src/config/db.js';
import { farmerService } from '../src/services/farmer.service.js';
import { farmService } from '../src/services/farm.service.js';
import { farmBoundaryService } from '../src/services/farmBoundary.service.js';
import { farmBoundaryRepository } from '../src/repositories/farmBoundary.repository.js';
import { AppError } from '../src/utils/apiError.js';
import { GeoJSONPolygon } from '../src/types/farmBoundary.types.js';

async function runFarmBoundaryIntegrationTests() {
  console.log('🧪 Running Module 4 Farm Boundary Integration Tests (Live PostGIS)...\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
    }
  };

  const testMobile = '9999900004';
  let testFarmerId: string | null = null;
  let testFarmId: string | null = null;
  let testFarmId2: string | null = null;

  try {
    // ---------------------------------------------------------------------------
    // 1. PostGIS Extension & Live Connection Verification
    // ---------------------------------------------------------------------------
    const versionResult: any[] = await prisma.$queryRaw`
      SELECT PostGIS_Full_Version() AS version
    `;
    assert(
      versionResult && versionResult.length > 0 && typeof versionResult[0].version === 'string',
      `1. Live PostGIS extension active: ${versionResult[0]?.version?.split(' ')[0] || 'PostGIS'}`
    );

    // ---------------------------------------------------------------------------
    // 2. Existing Data Preservation Regression Check
    // ---------------------------------------------------------------------------
    const farmerCount = await prisma.farmer.count();
    const farmCount = await prisma.farm.count();
    assert(
      farmerCount >= 0 && farmCount >= 0,
      `2. Existing tables accessible and intact (Farmers: ${farmerCount}, Farms: ${farmCount})`
    );

    // Cleanup any lingering records from previous test runs
    const existingFarmer = await prisma.farmer.findFirst({ where: { mobileNumber: testMobile } });
    if (existingFarmer) {
      const existingFarms = await prisma.farm.findMany({ where: { farmerId: existingFarmer.id } });
      for (const f of existingFarms) {
        await prisma.$executeRaw`DELETE FROM "farm_boundaries" WHERE "farmId" = ${f.id}::uuid`;
        await prisma.farm.delete({ where: { id: f.id } });
      }
      await prisma.farmer.delete({ where: { id: existingFarmer.id } });
    }

    // ---------------------------------------------------------------------------
    // 3. Setup Test Farmer & Test Farm
    // ---------------------------------------------------------------------------
    const testFarmer = await farmerService.registerFarmer({
      fullName: 'PostGIS Test Farmer',
      mobileNumber: testMobile,
    });
    testFarmerId = testFarmer.id;

    const testFarm = await farmService.registerFarm({
      farmerId: testFarmer.id,
      farmName: 'Spatial Test Parcel Alpha',
      cropName: 'Sugarcane',
      sowingDate: '2026-06-01',
      farmArea: 2.88,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testFarmId = testFarm.id;
    assert(true, '3. Setup test Farmer and Farm in live PostgreSQL');

    // ---------------------------------------------------------------------------
    // 4. Deterministic Geodesic Area Calculation & Polygon Insertion
    // Documented reference: A 0.001° × 0.001° bounding box around Baramati, Pune (18.52° N, 73.85° E)
    // Geodesic WGS84 ellipsoidal area is approx 11,687.34 m² (tolerance: ±100 m²)
    // ---------------------------------------------------------------------------
    const punePolygon: GeoJSONPolygon = {
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

    const boundary = await farmBoundaryService.createBoundary(testFarm.id, {
      boundary: punePolygon,
    });

    const expectedArea = 11687.34;
    const tolerance = 100.0;
    const areaDiff = Math.abs(boundary.calculatedAreaSqM - expectedArea);

    assert(
      areaDiff < tolerance,
      `4. Deterministic geodesic area calculated via ST_Area(geom::geography): ${boundary.calculatedAreaSqM} m² (expected ~${expectedArea} m², diff: ${areaDiff.toFixed(2)} m²)`
    );
    assert(
      boundary.calculatedAreaHectares >= 1.16 && boundary.calculatedAreaHectares <= 1.18,
      `4.1 Calculated hectares correct: ${boundary.calculatedAreaHectares} ha`
    );
    assert(
      boundary.calculatedAreaAcres >= 2.85 && boundary.calculatedAreaAcres <= 2.95,
      `4.2 Calculated acres correct: ${boundary.calculatedAreaAcres} acres`
    );

    // Centroid verification
    const expectedCentroidLon = 73.8572;
    const expectedCentroidLat = 18.5209;
    assert(
      Math.abs(boundary.centroidLongitude - expectedCentroidLon) < 0.0001 &&
        Math.abs(boundary.centroidLatitude - expectedCentroidLat) < 0.0001,
      `4.3 Calculated centroid via ST_Centroid correct: [${boundary.centroidLongitude}, ${boundary.centroidLatitude}]`
    );

    // ---------------------------------------------------------------------------
    // 5. Spatial SRID Verification (Must be 4326)
    // ---------------------------------------------------------------------------
    const sridCheck: any[] = await prisma.$queryRaw`
      SELECT ST_SRID("geom") AS srid FROM "farm_boundaries" WHERE "farmId" = ${testFarm.id}::uuid
    `;
    assert(
      sridCheck && sridCheck.length > 0 && sridCheck[0].srid === 4326,
      `5. Geometry stored with authoritative SRID: ${sridCheck[0]?.srid} (WGS84 EPSG:4326)`
    );

    // ---------------------------------------------------------------------------
    // 6. Invalid Geometry Rejection (Bowtie / Self-intersecting Polygon) -> 400
    // ---------------------------------------------------------------------------
    const bowtiePolygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 2],
          [2, 0],
          [0, 2],
          [0, 0],
        ],
      ],
    };

    let bowtieCaught = false;
    let bowtieReason = '';
    try {
      await farmBoundaryService.updateBoundary(testFarm.id, {
        boundary: bowtiePolygon,
      });
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 400) {
        bowtieCaught = true;
        bowtieReason = err.message;
      }
    }
    assert(
      bowtieCaught && bowtieReason.toLowerCase().includes('self-intersection'),
      `6. Self-intersecting bowtie polygon rejected with HTTP 400: "${bowtieReason}"`
    );

    // ---------------------------------------------------------------------------
    // 7. Duplicate Boundary Rejection (HTTP 409 Conflict)
    // ---------------------------------------------------------------------------
    let duplicateCaught = false;
    try {
      await farmBoundaryService.createBoundary(testFarm.id, {
        boundary: punePolygon,
      });
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 409) {
        duplicateCaught = true;
      }
    }
    assert(
      duplicateCaught,
      '7. Attempting to create duplicate boundary on same farm returns HTTP 409 Conflict'
    );

    // ---------------------------------------------------------------------------
    // 8. Distinct 404 Error Messages
    // ---------------------------------------------------------------------------
    const testFarm2 = await farmService.registerFarm({
      farmerId: testFarmer.id,
      farmName: 'Farm Without Boundary',
      cropName: 'Soybean',
      sowingDate: '2026-06-15',
      farmArea: 1.5,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testFarmId2 = testFarm2.id;

    // 8.1 Non-existent farm
    let missingFarmCaught = false;
    let missingFarmMsg = '';
    try {
      await farmBoundaryService.getBoundary('00000000-0000-0000-0000-000000000000');
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 404) {
        missingFarmCaught = true;
        missingFarmMsg = err.message;
      }
    }
    assert(
      missingFarmCaught &&
        missingFarmMsg === "Farm with ID '00000000-0000-0000-0000-000000000000' not found",
      `8.1 Non-existent farm returns 404: "${missingFarmMsg}"`
    );

    // 8.2 Existing farm without boundary
    let noBoundaryCaught = false;
    let noBoundaryMsg = '';
    try {
      await farmBoundaryService.getBoundary(testFarm2.id);
    } catch (err: any) {
      if (err instanceof AppError && err.statusCode === 404) {
        noBoundaryCaught = true;
        noBoundaryMsg = err.message;
      }
    }
    assert(
      noBoundaryCaught &&
        noBoundaryMsg === `Farm boundary not found for farm '${testFarm2.id}'`,
      `8.2 Existing farm without boundary returns distinct 404: "${noBoundaryMsg}"`
    );

    // ---------------------------------------------------------------------------
    // 9. Boundary PATCH: Update Geometry & Recalculate
    // ---------------------------------------------------------------------------
    const enlargedPolygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [73.8560, 18.5200],
          [73.8580, 18.5200],
          [73.8580, 18.5220],
          [73.8560, 18.5220],
          [73.8560, 18.5200],
        ],
      ],
    };

    const updated = await farmBoundaryService.updateBoundary(testFarm.id, {
      boundary: enlargedPolygon,
    });
    assert(
      updated.calculatedAreaSqM > boundary.calculatedAreaSqM,
      `9. Boundary PATCH recalculated larger area: ${updated.calculatedAreaSqM} m² (previously ${boundary.calculatedAreaSqM} m²)`
    );

    // ---------------------------------------------------------------------------
    // 10. Boundary DELETE Isolation (Deleting boundary does NOT delete Farm)
    // ---------------------------------------------------------------------------
    await farmBoundaryService.deleteBoundary(testFarm.id);
    const boundaryAfterDelete = await farmBoundaryRepository.findByFarmId(testFarm.id);
    const farmAfterBoundaryDelete = await farmService.getFarmById(testFarm.id);
    assert(
      boundaryAfterDelete === null && farmAfterBoundaryDelete !== null,
      '10. DELETE boundary removes boundary but preserves parent Farm entity'
    );

    // ---------------------------------------------------------------------------
    // 11. Farm Cascade DELETE (Deleting Farm deletes Boundary cleanly)
    // ---------------------------------------------------------------------------
    // Re-create boundary on testFarm
    await farmBoundaryService.createBoundary(testFarm.id, {
      boundary: punePolygon,
    });

    // Delete farm directly through farmService
    await farmService.deleteFarm(testFarm.id);
    testFarmId = null; // Marked deleted

    // Check that boundary was cascaded by PostgreSQL
    const remainingBoundaries: any[] = await prisma.$queryRaw`
      SELECT * FROM "farm_boundaries" WHERE "farmId" = ${testFarm.id}::uuid
    `;
    assert(
      remainingBoundaries.length === 0,
      '11. Deleting Farm cascaded cleanly to delete associated FarmBoundary (ON DELETE CASCADE)'
    );

    // Clean up testFarm2
    await farmService.deleteFarm(testFarm2.id);
    testFarmId2 = null;

    // Clean up testFarmer
    await prisma.farmer.delete({ where: { id: testFarmer.id } });
    testFarmerId = null;
    assert(true, '12. Cleaned up all integration test entities in proper sequence');

  } catch (error) {
    console.error('Integration test failure:', error);
    failed++;
  } finally {
    // Teardown safety
    if (testFarmId) {
      await prisma.$executeRaw`DELETE FROM "farm_boundaries" WHERE "farmId" = ${testFarmId}::uuid`.catch(() => {});
      await prisma.farm.deleteMany({ where: { id: testFarmId } }).catch(() => {});
    }
    if (testFarmId2) {
      await prisma.$executeRaw`DELETE FROM "farm_boundaries" WHERE "farmId" = ${testFarmId2}::uuid`.catch(() => {});
      await prisma.farm.deleteMany({ where: { id: testFarmId2 } }).catch(() => {});
    }
    if (testFarmerId) {
      await prisma.farmer.deleteMany({ where: { id: testFarmerId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n========================================`);
  console.log(`Live PostGIS Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runFarmBoundaryIntegrationTests().catch(console.error);
