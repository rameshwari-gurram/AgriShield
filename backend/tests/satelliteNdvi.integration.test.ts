/**
 * Module 7 Stage 7.1: Satellite & NDVI Database Integration Test Suite
 * Live PostgreSQL + PostGIS verification.
 * Tests:
 * - Table existence (satellite_observations, ndvi_observations)
 * - Farm relationship and spatial boundary linkage
 * - Satellite observation persistence (all conceptual fields)
 * - NDVI observation persistence (linked via satelliteObservationId)
 * - Foreign-key cascade behavior (Farm -> SatelliteObservation -> NdviObservation)
 * - Uniqueness constraints (farmId + productId, farmId + observedAt, satelliteObservationId)
 * - Decimal precision (NDVI 4 decimals, Cloud & Pixel 2 decimals)
 * - Database-level transactional rollback
 * - SatelliteService integration with spatial boundary input
 */

import { prisma } from '../src/config/db.js';
import { farmerService } from '../src/services/farmer.service.js';
import { farmService } from '../src/services/farm.service.js';
import { farmBoundaryRepository } from '../src/repositories/farmBoundary.repository.js';
import { satelliteRepository } from '../src/repositories/satellite.repository.js';
import { SatelliteService } from '../src/services/satellite.service.js';
import {
  ISatelliteProvider,
  GeoJSONPolygon,
  NormalizedNdviObservationDTO,
} from '../src/types/satellite.types.js';
import { AppError } from '../src/utils/apiError.js';

class MockIntegrationSatelliteProvider implements ISatelliteProvider {
  public readonly providerName = 'Copernicus Data Space Ecosystem';
  public callCount: number = 0;
  public lastBoundary: GeoJSONPolygon | null = null;
  public observationsToReturn: NormalizedNdviObservationDTO[] = [];

  async fetchNdviObservations(
    boundary: GeoJSONPolygon,
    _dateRange: { from: Date; to: Date }
  ): Promise<NormalizedNdviObservationDTO[]> {
    this.callCount++;
    this.lastBoundary = boundary;
    return this.observationsToReturn;
  }
}

async function runSatelliteIntegrationTests() {
  console.log('🧪 Running Module 7 Stage 7.1: Satellite & NDVI Integration Tests (Live PostgreSQL)...\n');

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

  const testMobile = '9999900007';
  let testFarmerId: string | null = null;
  let testFarmId: string | null = null;
  let testFarmWithoutBoundaryId: string | null = null;
  let testRollbackFarmId: string | null = null;

  const mockProvider = new MockIntegrationSatelliteProvider();
  const testSatelliteService = new SatelliteService(
    satelliteRepository,
    farmBoundaryRepository,
    undefined,
    mockProvider
  );

  try {
    // ---------------------------------------------------------------------------
    // 1. Live Connection & Table Verification
    // ---------------------------------------------------------------------------
    const satTableCheck: any[] = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'satellite_observations';
    `;
    assert(satTableCheck.length > 0, '1.1 Live PostgreSQL contains satellite_observations table');

    const ndviTableCheck: any[] = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'ndvi_observations';
    `;
    assert(ndviTableCheck.length > 0, '1.2 Live PostgreSQL contains ndvi_observations table');

    // Cleanup lingering test records from previous runs
    const existingFarmer = await prisma.farmer.findFirst({ where: { mobileNumber: testMobile } });
    if (existingFarmer) {
      const existingFarms = await prisma.farm.findMany({ where: { farmerId: existingFarmer.id } });
      for (const f of existingFarms) {
        await satelliteRepository.deleteByFarmId(f.id);
        await farmBoundaryRepository.deleteByFarmId(f.id);
        await farmService.deleteFarm(f.id);
      }
      await prisma.farmer.delete({ where: { id: existingFarmer.id } });
    }

    // ---------------------------------------------------------------------------
    // Setup Test Entities (Farmer, Farm, Boundary)
    // ---------------------------------------------------------------------------
    const farmer = await farmerService.registerFarmer({
      fullName: 'Ramesh Patil',
      mobileNumber: testMobile,
      preferredLanguage: 'mr' as any,
    });
    testFarmerId = farmer.id;

    const farm = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Satellite NDVI Test Farm',
      cropName: 'Soybean',
      sowingDate: '2026-06-15',
      farmArea: 5.5,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testFarmId = farm.id;

    // Digitize boundary (EPSG:4326)
    const polygonGeoJson: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [74.5800, 18.1500],
          [74.5820, 18.1500],
          [74.5820, 18.1520],
          [74.5800, 18.1520],
          [74.5800, 18.1500],
        ],
      ],
    };
    await farmBoundaryRepository.create(testFarmId, JSON.stringify(polygonGeoJson));

    // Farm without boundary
    const farmWithoutBoundary = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Unmapped Boundary Plot',
      cropName: 'Cotton',
      sowingDate: '2026-06-20',
      farmArea: 3.2,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testFarmWithoutBoundaryId = farmWithoutBoundary.id;

    // ---------------------------------------------------------------------------
    // 2. Satellite Observation Persistence
    // ---------------------------------------------------------------------------
    console.log('\n--- 2. Satellite Observation Persistence Tests ---');

    const satObsTime = new Date('2026-09-05T05:36:41.000Z');
    const createdSatObs = await satelliteRepository.createSatelliteObservation(testFarmId, {
      observedAt: satObsTime,
      provider: 'Copernicus Data Space Ecosystem',
      satellite: 'Sentinel-2A',
      productType: 'S2MSI2A',
      productId: 'S2A_MSIL2A_20260905T053641_N0500_R005_T43QDA',
      cloudCoverage: 3.5,
      sourceReference: 'ESA Copernicus CDSE Process API',
    });

    assert(createdSatObs.id !== undefined, '2.1 SatelliteObservation row inserted with UUID');
    assert(createdSatObs.farmId === testFarmId, '2.2 farmId correctly associated');
    assert(createdSatObs.provider === 'Copernicus Data Space Ecosystem', '2.3 provider matches input');
    assert(createdSatObs.satellite === 'Sentinel-2A', '2.4 satellite constellation matches input');
    assert(createdSatObs.productType === 'S2MSI2A', '2.5 productType matches input');
    assert(createdSatObs.productId === 'S2A_MSIL2A_20260905T053641_N0500_R005_T43QDA', '2.6 productId matches input');
    assert(Number(createdSatObs.cloudCoverage) === 3.5, '2.7 cloudCoverage matches input (3.50%)');
    assert(createdSatObs.sourceReference === 'ESA Copernicus CDSE Process API', '2.8 sourceReference preserved');
    assert(createdSatObs.createdAt instanceof Date, '2.9 createdAt timestamp generated');

    // ---------------------------------------------------------------------------
    // 3. NDVI Observation Persistence
    // ---------------------------------------------------------------------------
    console.log('\n--- 3. NDVI Observation Persistence Tests ---');

    const createdNdviObs = await satelliteRepository.createNdviObservation(
      testFarmId,
      createdSatObs.id,
      {
        meanNdvi: 0.6543,
        minNdvi: 0.2104,
        maxNdvi: 0.8521,
        validPixelPercentage: 99.5,
      },
      satObsTime
    );

    assert(createdNdviObs.id !== undefined, '3.1 NdviObservation row inserted with UUID');
    assert(createdNdviObs.farmId === testFarmId, '3.2 farmId correctly associated');
    assert(createdNdviObs.satelliteObservationId === createdSatObs.id, '3.3 satelliteObservationId foreign key linked');
    assert(Number(createdNdviObs.meanNdvi) === 0.6543, '3.4 meanNdvi matches input (0.6543)');
    assert(Number(createdNdviObs.minNdvi) === 0.2104, '3.5 minNdvi matches input (0.2104)');
    assert(Number(createdNdviObs.maxNdvi) === 0.8521, '3.6 maxNdvi matches input (0.8521)');
    assert(Number(createdNdviObs.validPixelPercentage) === 99.5, '3.7 validPixelPercentage matches input (99.50%)');

    // ---------------------------------------------------------------------------
    // 4. Farm Relationship & Prisma Navigation
    // ---------------------------------------------------------------------------
    console.log('\n--- 4. Farm Relationship & Navigation Tests ---');

    const farmWithObservations = await prisma.farm.findUnique({
      where: { id: testFarmId },
      include: {
        satelliteObservations: true,
        ndviObservations: {
          include: { satelliteObservation: true },
        },
      },
    });

    assert(farmWithObservations !== null, '4.1 Farm found with relations');
    assert(farmWithObservations?.satelliteObservations.length === 1, '4.2 farm.satelliteObservations relation navigable');
    assert(farmWithObservations?.ndviObservations.length === 1, '4.3 farm.ndviObservations relation navigable');
    assert(
      farmWithObservations?.ndviObservations[0].satelliteObservation.productId === createdSatObs.productId,
      '4.4 NdviObservation.satelliteObservation relation navigable to parent scene'
    );

    // ---------------------------------------------------------------------------
    // 5. Decimal Precision Verification (NDVI 4 decimals, Percentages 2 decimals)
    // ---------------------------------------------------------------------------
    console.log('\n--- 5. Decimal Precision Tests ---');

    // Verify 4-decimal precision on negative and positive NDVI values
    const satObsTime2 = new Date('2026-09-10T05:36:41.000Z');
    const pairResult = await satelliteRepository.persistObservation(testFarmId, {
      observedAt: satObsTime2,
      satellite: {
        observedAt: satObsTime2,
        provider: 'Copernicus Data Space Ecosystem',
        satellite: 'Sentinel-2B',
        productType: 'S2MSI2A',
        productId: 'S2B_MSIL2A_20260910T053641_N0500_R005_T43QDA',
        cloudCoverage: 12.75, // 2 decimals
        sourceReference: 'ESA CDSE',
      },
      ndvi: {
        meanNdvi: -0.1234, // 4 decimals negative
        minNdvi: -0.4567,
        maxNdvi: 0.1234,
        validPixelPercentage: 88.25, // 2 decimals
      },
    });

    const readBackNdvi = await prisma.ndviObservation.findUnique({
      where: { id: pairResult.ndviObservation.id },
    });
    assert(Number(readBackNdvi?.meanNdvi) === -0.1234, '5.1 Negative NDVI -0.1234 preserved with exact 4 decimals');
    assert(Number(readBackNdvi?.minNdvi) === -0.4567, '5.2 minNdvi -0.4567 preserved with exact 4 decimals');
    assert(Number(readBackNdvi?.maxNdvi) === 0.1234, '5.3 maxNdvi 0.1234 preserved with exact 4 decimals');
    assert(Number(readBackNdvi?.validPixelPercentage) === 88.25, '5.4 validPixelPercentage 88.25% preserved with exact 2 decimals');

    const readBackSat = await prisma.satelliteObservation.findUnique({
      where: { id: pairResult.satelliteObservation.id },
    });
    assert(Number(readBackSat?.cloudCoverage) === 12.75, '5.5 cloudCoverage 12.75% preserved with exact 2 decimals');

    // 5.6 Null cloud coverage persistence
    const nullCloudResult = await satelliteRepository.persistObservation(testFarmId, {
      observedAt: new Date('2026-09-12T05:36:41.000Z'),
      satellite: {
        observedAt: new Date('2026-09-12T05:36:41.000Z'),
        provider: 'Copernicus Data Space Ecosystem',
        satellite: 'Sentinel-2B',
        productType: 'S2MSI2A',
        productId: 'S2B_MSIL2A_20260912T053641_NULLCLOUD',
        cloudCoverage: null,
        sourceReference: 'ESA CDSE',
      },
      ndvi: {
        meanNdvi: 0.5555,
        minNdvi: 0.2222,
        maxNdvi: 0.7777,
        validPixelPercentage: 100.0,
      },
    });

    const readBackNullSat = await prisma.satelliteObservation.findUnique({
      where: { id: nullCloudResult.satelliteObservation.id },
    });
    assert(readBackNullSat?.cloudCoverage === null, '5.6 Null cloudCoverage stored in PostgreSQL as NULL without coercion');
    const formattedNullSat = testSatelliteService.formatSatelliteResponse(readBackNullSat!);
    assert(formattedNullSat.cloudCoverage === null, '5.7 Formatted response DTO preserves cloudCoverage as null');

    // ---------------------------------------------------------------------------
    // 6. Uniqueness Constraints Tests
    // ---------------------------------------------------------------------------
    console.log('\n--- 6. Uniqueness Constraints Tests ---');

    // 6.1 Duplicate (farmId, productId) in satellite_observations
    let duplicateProductCaught = false;
    try {
      await prisma.satelliteObservation.create({
        data: {
          farmId: testFarmId,
          observedAt: new Date('2026-09-06T05:36:41.000Z'), // Different timestamp
          provider: 'Copernicus',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'S2A_MSIL2A_20260905T053641_N0500_R005_T43QDA', // Same productId as createdSatObs!
          cloudCoverage: 0,
        },
      });
    } catch (err: any) {
      duplicateProductCaught = true;
      assert(err.code === 'P2002', '6.1 Prisma returns P2002 on duplicate (farmId, productId)');
    }
    assert(duplicateProductCaught, '6.2 Duplicate (farmId, productId) rejected by unique constraint');

    // 6.2 Duplicate (farmId, observedAt) in satellite_observations
    let duplicateSatObsTimeCaught = false;
    try {
      await prisma.satelliteObservation.create({
        data: {
          farmId: testFarmId,
          observedAt: satObsTime, // Same observedAt as createdSatObs!
          provider: 'Copernicus',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'DISTINCT_PRODUCT_ID_SAME_TIME',
          cloudCoverage: 0,
        },
      });
    } catch (err: any) {
      duplicateSatObsTimeCaught = true;
      assert(err.code === 'P2002', '6.3 Prisma returns P2002 on duplicate (farmId, observedAt)');
    }
    assert(duplicateSatObsTimeCaught, '6.4 Duplicate satellite (farmId, observedAt) rejected by unique constraint');

    // 6.3 Duplicate satelliteObservationId in ndvi_observations
    let duplicateSatIdInNdviCaught = false;
    try {
      await prisma.ndviObservation.create({
        data: {
          farmId: testFarmId,
          satelliteObservationId: createdSatObs.id, // Already used by createdNdviObs!
          observedAt: new Date('2026-09-22T05:36:41.000Z'),
          meanNdvi: 0.5,
          minNdvi: 0.3,
          maxNdvi: 0.7,
          validPixelPercentage: 100,
        },
      });
    } catch (err: any) {
      duplicateSatIdInNdviCaught = true;
      assert(err.code === 'P2002', '6.5 Prisma returns P2002 on duplicate satelliteObservationId in ndvi_observations');
    }
    assert(duplicateSatIdInNdviCaught, '6.6 Duplicate satelliteObservationId in NDVI observation rejected');

    // 6.4 Duplicate (farmId, observedAt) in ndvi_observations
    let duplicateNdviObsTimeCaught = false;
    try {
      // Create a temporary third satellite observation with distinct productId
      const tempSat = await prisma.satelliteObservation.create({
        data: {
          farmId: testFarmId,
          observedAt: new Date('2026-09-27T05:36:41.000Z'),
          provider: 'Copernicus',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'TEMP_SAT_DISTINCT_FOR_NDVI_TEST',
          cloudCoverage: 0,
        },
      });

      await prisma.ndviObservation.create({
        data: {
          farmId: testFarmId,
          satelliteObservationId: tempSat.id,
          observedAt: satObsTime, // Reusing satObsTime which was used in createdNdviObs!
          meanNdvi: 0.5,
          minNdvi: 0.3,
          maxNdvi: 0.7,
          validPixelPercentage: 100,
        },
      });
    } catch (err: any) {
      duplicateNdviObsTimeCaught = true;
      assert(err.code === 'P2002', '6.7 Prisma returns P2002 on duplicate (farmId, observedAt) in ndvi_observations');
    }
    assert(duplicateNdviObsTimeCaught, '6.8 Duplicate (farmId, observedAt) in NDVI observations rejected');

    // Clean up temporary satellite observation
    await prisma.satelliteObservation.deleteMany({
      where: { productId: 'TEMP_SAT_DISTINCT_FOR_NDVI_TEST' },
    });

    // ---------------------------------------------------------------------------
    // 7. Foreign-Key Behavior & Cascade Deletion
    // ---------------------------------------------------------------------------
    console.log('\n--- 7. Foreign-Key Behavior & Cascade Deletion Tests ---');

    // 7.1 Non-existent farmId foreign key rejection
    let nonExistentFarmSatCaught = false;
    try {
      await prisma.satelliteObservation.create({
        data: {
          farmId: '00000000-0000-0000-0000-000000000000',
          observedAt: new Date(),
          provider: 'Copernicus',
          satellite: 'Sentinel-2',
          productType: 'S2MSI2A',
          productId: 'NON_EXISTENT_FARM_PROD',
          cloudCoverage: 0,
        },
      });
    } catch (err: any) {
      nonExistentFarmSatCaught = true;
      assert(err.code === 'P2003', '7.1 Foreign key constraint P2003 on non-existent farmId');
    }
    assert(nonExistentFarmSatCaught, '7.2 Foreign key rejects non-existent farmId');

    // 7.2 Non-existent satelliteObservationId in ndvi_observations
    let nonExistentSatIdCaught = false;
    try {
      await prisma.ndviObservation.create({
        data: {
          farmId: testFarmId,
          satelliteObservationId: '00000000-0000-0000-0000-000000000000',
          observedAt: new Date(),
          meanNdvi: 0.5,
          minNdvi: 0.3,
          maxNdvi: 0.7,
          validPixelPercentage: 100,
        },
      });
    } catch (err: any) {
      nonExistentSatIdCaught = true;
      assert(err.code === 'P2003', '7.3 Foreign key constraint P2003 on non-existent satelliteObservationId');
    }
    assert(nonExistentSatIdCaught, '7.4 Foreign key rejects non-existent satelliteObservationId');

    // 7.3 Cascade deletion: Deleting a SatelliteObservation cascades to its NdviObservation
    await prisma.satelliteObservation.delete({
      where: { id: pairResult.satelliteObservation.id },
    });
    const ndviAfterSatDelete = await prisma.ndviObservation.findUnique({
      where: { id: pairResult.ndviObservation.id },
    });
    assert(ndviAfterSatDelete === null, '7.5 Deleting SatelliteObservation cascade-deleted its NdviObservation');

    // ---------------------------------------------------------------------------
    // 8. Transactional Batch Persistence & Database Rollback
    // ---------------------------------------------------------------------------
    console.log('\n--- 8. Database-Level Transaction Rollback Tests ---');

    const rollbackFarm = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Satellite Rollback Plot',
      cropName: 'Maize',
      sowingDate: '2026-06-01',
      farmArea: 2.0,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testRollbackFarmId = rollbackFarm.id;

    const initialRollbackCounts = await satelliteRepository.countByFarmId(testRollbackFarmId);
    assert(
      initialRollbackCounts.satelliteCount === 0 && initialRollbackCounts.ndviCount === 0,
      '8.1 Rollback farm has 0 observations initially'
    );

    // Create a batch of 3 observations where the 2nd record causes a REAL database constraint violation
    // (violating VARCHAR(50) on 'provider' column with 100 characters)
    const failingBatch: NormalizedNdviObservationDTO[] = [
      {
        observedAt: new Date('2026-09-01T05:00:00Z'),
        satellite: {
          observedAt: new Date('2026-09-01T05:00:00Z'),
          provider: 'Copernicus',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'ROLLBACK_PROD_1',
          cloudCoverage: 0,
        },
        ndvi: {
          meanNdvi: 0.5,
          minNdvi: 0.3,
          maxNdvi: 0.7,
          validPixelPercentage: 100,
        },
      },
      {
        observedAt: new Date('2026-09-02T05:00:00Z'),
        satellite: {
          observedAt: new Date('2026-09-02T05:00:00Z'),
          // DELIBERATE DATABASE CONSTRAINT ERROR: Exceeds VARCHAR(50)
          provider: 'DELIBERATE_OVERFLOW_STRING_EXCEEDING_VARCHAR_50_LIMIT_TRIGGERING_POSTGRESQL_ERROR_CODE_22001',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'ROLLBACK_PROD_2',
          cloudCoverage: 0,
        },
        ndvi: {
          meanNdvi: 0.5,
          minNdvi: 0.3,
          maxNdvi: 0.7,
          validPixelPercentage: 100,
        },
      },
      {
        observedAt: new Date('2026-09-03T05:00:00Z'),
        satellite: {
          observedAt: new Date('2026-09-03T05:00:00Z'),
          provider: 'Copernicus',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'ROLLBACK_PROD_3',
          cloudCoverage: 0,
        },
        ndvi: {
          meanNdvi: 0.5,
          minNdvi: 0.3,
          maxNdvi: 0.7,
          validPixelPercentage: 100,
        },
      },
    ];

    let batchFailedCaught = false;
    try {
      await satelliteRepository.persistBatch(testRollbackFarmId, failingBatch);
    } catch {
      batchFailedCaught = true;
    }
    assert(batchFailedCaught, '8.2 Database rejected batch due to VARCHAR constraint violation');

    const countsAfterFailure = await satelliteRepository.countByFarmId(testRollbackFarmId);
    assert(
      countsAfterFailure.satelliteCount === 0 && countsAfterFailure.ndviCount === 0,
      `8.3 Full transactional rollback: EXACTLY 0 satellite & 0 NDVI records persisted (got sat: ${countsAfterFailure.satelliteCount}, ndvi: ${countsAfterFailure.ndviCount})`
    );

    // ---------------------------------------------------------------------------
    // 9. SatelliteService End-to-End Orchestration & Spatial Boundary Linkage
    // ---------------------------------------------------------------------------
    console.log('\n--- 9. SatelliteService Orchestration Tests ---');

    // 9.1 Boundary validation: sync on farm without boundary throws 404
    let missingBoundaryCaught = false;
    try {
      await testSatelliteService.syncSatelliteObservations(testFarmWithoutBoundaryId, {
        from: new Date('2026-09-01'),
        to: new Date('2026-09-20'),
      });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404 && err.message.includes('Farm boundary not found')) {
        missingBoundaryCaught = true;
      }
    }
    assert(missingBoundaryCaught, '9.1 Sync on farm without boundary throws 404 Not Found');

    // 9.2 Sync on farm with boundary passes spatial polygon to provider
    mockProvider.observationsToReturn = [
      {
        observedAt: new Date('2026-09-25T05:36:41.000Z'),
        satellite: {
          observedAt: new Date('2026-09-25T05:36:41.000Z'),
          provider: 'Copernicus Data Space Ecosystem',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'S2A_MSIL2A_20260925T053641_N0500_R005_T43QDA',
          cloudCoverage: 1.2,
        },
        ndvi: {
          meanNdvi: 0.7123,
          minNdvi: 0.3541,
          maxNdvi: 0.8876,
          validPixelPercentage: 100.0,
        },
      },
    ];

    const syncResult = await testSatelliteService.syncSatelliteObservations(testFarmId, {
      from: new Date('2026-09-01'),
      to: new Date('2026-09-25'),
    });

    assert(syncResult.syncedCount === 1, '9.2 syncSatelliteObservations synced 1 observation');
    assert(mockProvider.callCount === 1, '9.3 Provider was called once with farm boundary polygon');
    assert(mockProvider.lastBoundary?.type === 'Polygon', '9.4 Authoritative FarmBoundary passed to provider as GeoJSON polygon');
    assert(
      JSON.stringify(mockProvider.lastBoundary?.coordinates) === JSON.stringify(polygonGeoJson.coordinates),
      '9.5 Exact farm boundary coordinates supplied to satellite provider'
    );

    // 9.3 getLatestNdvi reads newest observation from PostgreSQL
    const latestNdvi = await testSatelliteService.getLatestNdvi(testFarmId);
    assert(latestNdvi !== null, '9.6 getLatestNdvi returned latest observation from database');
    assert(latestNdvi?.meanNdvi === 0.7123, '9.7 Latest meanNdvi matches newest synced observation (0.7123)');
    assert(latestNdvi?.satelliteObservation?.satellite === 'Sentinel-2A', '9.8 Attached satellite observation metadata returned');

    // 9.4 getHistoricalNdvi returns chronological observations
    const history = await testSatelliteService.getHistoricalNdvi(testFarmId);
    assert(history.length >= 2, `9.9 Historical query returned all persisted observations (got ${history.length})`);
    let isAscending = true;
    for (let i = 1; i < history.length; i++) {
      if (new Date(history[i].observedAt).getTime() < new Date(history[i - 1].observedAt).getTime()) {
        isAscending = false;
        break;
      }
    }
    assert(isAscending, '9.10 Historical observations ordered chronologically ascending (observedAt ASC)');

    // ---------------------------------------------------------------------------
    // 10. Farm Cascade Deletion Integrity
    // ---------------------------------------------------------------------------
    console.log('\n--- 10. Farm Cascade Deletion Tests ---');

    // Deleting the Farm must cascade delete all its SatelliteObservation and NdviObservation records
    const farmToDeleteId = testFarmId;
    await farmService.deleteFarm(farmToDeleteId);
    testFarmId = null; // Mark cleaned up

    const satRemaining = await prisma.satelliteObservation.count({ where: { farmId: farmToDeleteId } });
    const ndviRemaining = await prisma.ndviObservation.count({ where: { farmId: farmToDeleteId } });
    assert(satRemaining === 0 && ndviRemaining === 0, '10.1 Deleting Farm cascade-deleted all satellite and NDVI records');

    console.log('\n  [Cleaning up remaining test entities...]');
  } finally {
    try {
      if (testRollbackFarmId) {
        await satelliteRepository.deleteByFarmId(testRollbackFarmId);
        await farmService.deleteFarm(testRollbackFarmId);
      }
      if (testFarmWithoutBoundaryId) {
        await farmService.deleteFarm(testFarmWithoutBoundaryId);
      }
      if (testFarmId) {
        await satelliteRepository.deleteByFarmId(testFarmId);
        await farmBoundaryRepository.deleteByFarmId(testFarmId);
        await farmService.deleteFarm(testFarmId);
      }
      if (testFarmerId) {
        await prisma.farmer.delete({ where: { id: testFarmerId } });
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
  }

  // ===========================================================================
  // Summary
  // ===========================================================================
  console.log(`\n========================================`);
  console.log(`Satellite & NDVI Integration Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSatelliteIntegrationTests().catch((error) => {
  console.error('Fatal error during satellite NDVI integration test run:', error);
  process.exit(1);
});
