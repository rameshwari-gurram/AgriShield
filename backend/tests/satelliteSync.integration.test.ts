/**
 * Module 7 Stage 7.2-D: Satellite Database Persistence & Idempotent Sync Integration Tests
 * AgriShield Parametric Insurance Platform
 *
 * Test Matrix (Required by Stage 7.2-D Specification):
 * 1. Test 1 — First synchronization creates SatelliteObservation and NdviObservation with 1:1 relationship
 * 2. Test 2 — Repeat synchronization performs idempotent upsert (row counts do not double, farmId + productId)
 * 3. Test 3 — NDVI relationship: NdviObservation.satelliteObservationId points to parent scene, exactly one NDVI record
 * 4. Test 4 — NO_DATA handling: NO_DATA observation skipped from persistence, skippedNoDataCount incremented, valid persist
 * 5. Test 5 — Multiple observations: persists multiple valid observations with distinct product IDs
 * 6. Test 6 — Existing data remains idempotent on repeated sync runs (zero duplicate records)
 * 7. Test 7 — Transaction rollback: database-level failure rolls back batch atomically without partial records
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

class MockSyncSatelliteProvider implements ISatelliteProvider {
  public readonly providerName = 'Copernicus Data Space Ecosystem';
  public callCount: number = 0;
  public observationsToReturn: NormalizedNdviObservationDTO[] = [];

  async fetchNdviObservations(
    _boundary: GeoJSONPolygon,
    _dateRange: { from: Date; to: Date }
  ): Promise<NormalizedNdviObservationDTO[]> {
    this.callCount++;
    return this.observationsToReturn;
  }
}

async function runSatelliteSyncIntegrationTests() {
  console.log('================================================================');
  console.log('🧪 Running Module 7 Stage 7.2-D: Satellite Sync Integration Tests');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, detail?: string) => {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  };

  const testMobile = '9999900074';
  let testFarmerId: string | null = null;
  let testFarmId: string | null = null;
  let testRollbackFarmId: string | null = null;

  const mockProvider = new MockSyncSatelliteProvider();
  const testSatelliteService = new SatelliteService(
    satelliteRepository,
    farmBoundaryRepository,
    undefined,
    mockProvider
  );

  const samplePolygon: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [74.5800, 18.1500],
        [74.5850, 18.1500],
        [74.5850, 18.1550],
        [74.5800, 18.1550],
        [74.5800, 18.1500],
      ],
    ],
  };

  const syncDateRange = {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-09-30T00:00:00.000Z'),
  };

  try {
    // ---------------------------------------------------------------------------
    // Setup: Clean existing test data and create test farm with boundary
    // ---------------------------------------------------------------------------
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

    const farmer = await farmerService.registerFarmer({
      fullName: 'Ramesh Patel',
      mobileNumber: testMobile,
      preferredLanguage: 'mr',
    });
    testFarmerId = farmer.id;

    const farm = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Idempotent Satellite Test Plot',
      cropName: 'Sugarcane',
      sowingDate: '2026-05-15',
      farmArea: 3.5,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testFarmId = farm.id;

    // Create authoritative spatial boundary
    await farmBoundaryRepository.create(testFarmId, JSON.stringify(samplePolygon));

    console.log('--- Test 1: First Synchronization ---');
    // ===========================================================================
    // Test 1 — First synchronization
    // ===========================================================================
    const obsTime1 = new Date('2026-09-10T05:30:00.000Z');
    const obs1: NormalizedNdviObservationDTO = {
      observedAt: obsTime1,
      satellite: {
        observedAt: obsTime1,
        provider: 'Copernicus Data Space Ecosystem',
        satellite: 'Sentinel-2A',
        productType: 'S2MSI2A',
        productId: 'STAT_AGG_S2L2A_20260910T053000Z',
        cloudCoverage: 5.5,
        sourceReference: 'Copernicus Sentinel Hub Statistical API v1',
      },
      ndvi: {
        meanNdvi: 0.6124,
        minNdvi: 0.2311,
        maxNdvi: 0.8123,
        validPixelPercentage: 98.5,
      },
    };

    mockProvider.observationsToReturn = [obs1];

    const syncResult1 = await testSatelliteService.syncSatelliteObservations(
      testFarmId,
      syncDateRange
    );

    assert(syncResult1.syncedCount === 1, '1.1 syncSatelliteObservations reports syncedCount = 1');
    assert(syncResult1.skippedNoDataCount === 0, '1.2 skippedNoDataCount is 0');
    assert(syncResult1.totalFetched === 1, '1.3 totalFetched is 1');
    assert(syncResult1.observations.length === 1, '1.4 returns 1 observation in response DTO');

    const satRecord1 = await prisma.satelliteObservation.findFirst({
      where: { farmId: testFarmId, productId: 'STAT_AGG_S2L2A_20260910T053000Z' },
    });
    assert(satRecord1 !== null, '1.5 SatelliteObservation row persisted in PostgreSQL');
    assert(satRecord1?.productId === 'STAT_AGG_S2L2A_20260910T053000Z', '1.6 Product ID stored correctly');

    const ndviRecord1 = await prisma.ndviObservation.findFirst({
      where: { farmId: testFarmId, satelliteObservationId: satRecord1!.id },
    });
    assert(ndviRecord1 !== null, '1.7 NdviObservation row persisted in PostgreSQL');
    assert(Number(ndviRecord1?.meanNdvi) === 0.6124, '1.8 meanNdvi decimal precision (0.6124) preserved');
    assert(Number(ndviRecord1?.validPixelPercentage) === 98.5, '1.9 validPixelPercentage (98.50%) preserved');

    console.log('\n--- Test 2: Repeat Synchronization (Idempotency) ---');
    // ===========================================================================
    // Test 2 — Repeat synchronization: row counts do not double, uses farmId + productId
    // ===========================================================================
    const countsBeforeResync = await satelliteRepository.countByFarmId(testFarmId);
    assert(countsBeforeResync.satelliteCount === 1 && countsBeforeResync.ndviCount === 1, '2.1 Initial count is 1 sat, 1 ndvi');

    // Updated observation with same farmId and productId, but updated cloudCoverage and meanNdvi
    const updatedObs1: NormalizedNdviObservationDTO = {
      observedAt: obsTime1,
      satellite: {
        observedAt: obsTime1,
        provider: 'Copernicus Data Space Ecosystem',
        satellite: 'Sentinel-2A',
        productType: 'S2MSI2A',
        productId: 'STAT_AGG_S2L2A_20260910T053000Z', // Same productId
        cloudCoverage: 4.2, // Updated
        sourceReference: 'Copernicus Sentinel Hub Statistical API v1',
      },
      ndvi: {
        meanNdvi: 0.6150, // Updated
        minNdvi: 0.2311,
        maxNdvi: 0.8123,
        validPixelPercentage: 99.0,
      },
    };

    mockProvider.observationsToReturn = [updatedObs1];

    const syncResult2 = await testSatelliteService.syncSatelliteObservations(
      testFarmId,
      syncDateRange
    );

    assert(syncResult2.syncedCount === 1, '2.2 Resync reports syncedCount = 1');

    const countsAfterResync = await satelliteRepository.countByFarmId(testFarmId);
    assert(
      countsAfterResync.satelliteCount === 1,
      `2.3 SatelliteObservation row count remains 1 (got: ${countsAfterResync.satelliteCount}, DID NOT DOUBLE)`
    );
    assert(
      countsAfterResync.ndviCount === 1,
      `2.4 NdviObservation row count remains 1 (got: ${countsAfterResync.ndviCount}, DID NOT DOUBLE)`
    );

    const satRecordAfterResync = await prisma.satelliteObservation.findFirst({
      where: { farmId: testFarmId, productId: 'STAT_AGG_S2L2A_20260910T053000Z' },
    });
    assert(Number(satRecordAfterResync?.cloudCoverage) === 4.2, '2.5 Resync updated existing row cloudCoverage to 4.20%');

    const ndviRecordAfterResync = await prisma.ndviObservation.findFirst({
      where: { farmId: testFarmId, satelliteObservationId: satRecordAfterResync!.id },
    });
    assert(Number(ndviRecordAfterResync?.meanNdvi) === 0.615, '2.6 Resync updated existing row meanNdvi to 0.6150');

    console.log('\n--- Test 3: NDVI 1:1 Relationship ---');
    // ===========================================================================
    // Test 3 — NDVI relationship: satelliteObservationId 1:1 link
    // ===========================================================================
    const ndviLinked = await prisma.ndviObservation.findUnique({
      where: { satelliteObservationId: satRecord1!.id },
      include: { satelliteObservation: true },
    });

    assert(ndviLinked !== null, '3.1 NdviObservation resolvable via satelliteObservationId');
    assert(ndviLinked?.satelliteObservation.id === satRecord1!.id, '3.2 Parent SatelliteObservation matches');
    assert(ndviLinked?.satelliteObservation.farmId === testFarmId, '3.3 Linked farmId matches');

    // Verify exactly one NDVI record exists for this satellite observation ID
    const ndviCountForSat = await prisma.ndviObservation.count({
      where: { satelliteObservationId: satRecord1!.id },
    });
    assert(ndviCountForSat === 1, '3.4 Exactly one NdviObservation linked to SatelliteObservation');

    console.log('\n--- Test 4: NO_DATA Handling Policy ---');
    // ===========================================================================
    // Test 4 — NO_DATA: skipped from persistence, skippedNoDataCount incremented
    // ===========================================================================
    const obsTimeValid = new Date('2026-09-15T05:30:00.000Z');
    const validObs: NormalizedNdviObservationDTO = {
      observedAt: obsTimeValid,
      satellite: {
        observedAt: obsTimeValid,
        provider: 'Copernicus Data Space Ecosystem',
        satellite: 'Sentinel-2B',
        productType: 'S2MSI2A',
        productId: 'STAT_AGG_S2L2A_20260915T053000Z',
        cloudCoverage: 10.0,
        sourceReference: 'Copernicus Sentinel Hub Statistical API v1',
      },
      ndvi: {
        meanNdvi: 0.5234,
        minNdvi: 0.1845,
        maxNdvi: 0.7412,
        validPixelPercentage: 92.0,
      },
    };

    // Observation with NO_DATA (e.g. 100% thick cloud or 0 valid pixels)
    const obsTimeNoData = new Date('2026-09-18T05:30:00.000Z');
    const noDataObs: any = {
      observedAt: obsTimeNoData,
      status: 'NO_DATA',
      satellite: {
        observedAt: obsTimeNoData,
        provider: 'Copernicus Data Space Ecosystem',
        satellite: 'Sentinel-2A',
        productType: 'S2MSI2A',
        productId: 'STAT_AGG_S2L2A_20260918T053000Z',
        cloudCoverage: 100.0,
        sourceReference: 'Copernicus Sentinel Hub Statistical API v1',
      },
      ndvi: {
        meanNdvi: null,
        minNdvi: null,
        maxNdvi: null,
        validPixelPercentage: 0.0,
      },
    };

    mockProvider.observationsToReturn = [validObs, noDataObs];

    const syncResult4 = await testSatelliteService.syncSatelliteObservations(
      testFarmId,
      syncDateRange
    );

    assert(syncResult4.totalFetched === 2, '4.1 Total fetched is 2');
    assert(syncResult4.syncedCount === 1, '4.2 Synced count is 1 (valid observation persisted)');
    assert(syncResult4.skippedNoDataCount === 1, '4.3 skippedNoDataCount incremented to 1');
    assert(syncResult4.observations.length === 1, '4.4 Observations array contains only the valid record');

    // Confirm in database that NO_DATA record was NOT persisted
    const noDataSatRecord = await prisma.satelliteObservation.findFirst({
      where: { farmId: testFarmId, productId: 'STAT_AGG_S2L2A_20260918T053000Z' },
    });
    assert(noDataSatRecord === null, '4.5 NO_DATA SatelliteObservation was NOT persisted');

    // Confirm that valid observation WAS persisted
    const validSatRecord = await prisma.satelliteObservation.findFirst({
      where: { farmId: testFarmId, productId: 'STAT_AGG_S2L2A_20260915T053000Z' },
    });
    assert(validSatRecord !== null, '4.6 Valid observation was persisted');

    console.log('\n--- Test 5: Multiple Observations Persistence ---');
    // ===========================================================================
    // Test 5 — Multiple observations: persists multiple valid observations with distinct product IDs
    // ===========================================================================
    const obsTime20 = new Date('2026-09-20T05:30:00.000Z');
    const obsTime25 = new Date('2026-09-25T05:30:00.000Z');

    const multiObs1: NormalizedNdviObservationDTO = {
      observedAt: obsTime20,
      satellite: {
        observedAt: obsTime20,
        provider: 'Copernicus Data Space Ecosystem',
        satellite: 'Sentinel-2A',
        productType: 'S2MSI2A',
        productId: 'STAT_AGG_S2L2A_20260920T053000Z',
        cloudCoverage: 0.0,
        sourceReference: 'ESA CDSE',
      },
      ndvi: {
        meanNdvi: 0.7012,
        minNdvi: 0.3124,
        maxNdvi: 0.8845,
        validPixelPercentage: 100.0,
      },
    };

    const multiObs2: NormalizedNdviObservationDTO = {
      observedAt: obsTime25,
      satellite: {
        observedAt: obsTime25,
        provider: 'Copernicus Data Space Ecosystem',
        satellite: 'Sentinel-2B',
        productType: 'S2MSI2A',
        productId: 'STAT_AGG_S2L2A_20260925T053000Z',
        cloudCoverage: 2.5,
        sourceReference: 'ESA CDSE',
      },
      ndvi: {
        meanNdvi: 0.6845,
        minNdvi: 0.2950,
        maxNdvi: 0.8620,
        validPixelPercentage: 99.5,
      },
    };

    mockProvider.observationsToReturn = [multiObs1, multiObs2];

    const syncResult5 = await testSatelliteService.syncSatelliteObservations(
      testFarmId,
      syncDateRange
    );

    assert(syncResult5.syncedCount === 2, '5.1 Multi-sync persisted 2 observations');
    assert(syncResult5.skippedNoDataCount === 0, '5.2 Multi-sync skipped 0 observations');

    const totalSatNow = await prisma.satelliteObservation.count({ where: { farmId: testFarmId } });
    const totalNdviNow = await prisma.ndviObservation.count({ where: { farmId: testFarmId } });
    assert(totalSatNow === 4, `5.3 Total satellite observations is 4 (got: ${totalSatNow})`);
    assert(totalNdviNow === 4, `5.4 Total NDVI observations is 4 (got: ${totalNdviNow})`);

    console.log('\n--- Test 6: Idempotent Re-Synchronization ---');
    // ===========================================================================
    // Test 6 — Existing data remains idempotent on repeated sync
    // ===========================================================================
    mockProvider.observationsToReturn = [multiObs1, multiObs2];

    const syncResult6 = await testSatelliteService.syncSatelliteObservations(
      testFarmId,
      syncDateRange
    );

    assert(syncResult6.syncedCount === 2, '6.1 Re-sync reports syncedCount = 2');

    const totalSatAfter = await prisma.satelliteObservation.count({ where: { farmId: testFarmId } });
    const totalNdviAfter = await prisma.ndviObservation.count({ where: { farmId: testFarmId } });
    assert(totalSatAfter === 4, `6.2 Satellite count remains 4 (zero duplicates created)`);
    assert(totalNdviAfter === 4, `6.3 NDVI count remains 4 (zero duplicates created)`);

    console.log('\n--- Test 7: Transaction Rollback on Database Failure ---');
    // ===========================================================================
    // Test 7 — Transaction rollback: database error rolls back batch atomically
    // ===========================================================================
    const rollbackFarm = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Rollback Isolation Plot',
      cropName: 'Cotton',
      sowingDate: '2026-06-01',
      farmArea: 2.0,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testRollbackFarmId = rollbackFarm.id;

    await farmBoundaryRepository.create(testRollbackFarmId, JSON.stringify(samplePolygon));

    const initialCounts = await satelliteRepository.countByFarmId(testRollbackFarmId);
    assert(initialCounts.satelliteCount === 0 && initialCounts.ndviCount === 0, '7.1 Rollback farm has 0 records initially');

    // Create a batch where the 2nd record causes a VARCHAR(50) length violation on provider
    const failingBatch: NormalizedNdviObservationDTO[] = [
      {
        observedAt: new Date('2026-09-01T00:00:00.000Z'),
        satellite: {
          observedAt: new Date('2026-09-01T00:00:00.000Z'),
          provider: 'Copernicus Data Space Ecosystem',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'ROLLBACK_PROD_1',
          cloudCoverage: 0,
        },
        ndvi: {
          meanNdvi: 0.5,
          minNdvi: 0.2,
          maxNdvi: 0.8,
          validPixelPercentage: 100,
        },
      },
      {
        observedAt: new Date('2026-09-02T00:00:00.000Z'),
        satellite: {
          observedAt: new Date('2026-09-02T00:00:00.000Z'),
          provider: 'X'.repeat(120), // Exceeds VARCHAR(50) limit in PostgreSQL!
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'ROLLBACK_PROD_2_FAIL',
          cloudCoverage: 0,
        },
        ndvi: {
          meanNdvi: 0.5,
          minNdvi: 0.2,
          maxNdvi: 0.8,
          validPixelPercentage: 100,
        },
      },
    ];

    mockProvider.observationsToReturn = failingBatch;

    let transactionFailed = false;
    try {
      await testSatelliteService.syncSatelliteObservations(testRollbackFarmId, syncDateRange);
    } catch (err: any) {
      transactionFailed = true;
    }

    assert(transactionFailed, '7.2 Synchronization failed due to VARCHAR limit violation');

    const countsAfterRollback = await satelliteRepository.countByFarmId(testRollbackFarmId);
    assert(
      countsAfterRollback.satelliteCount === 0,
      `7.3 Full rollback: 0 satellite records persisted (got: ${countsAfterRollback.satelliteCount})`
    );
    assert(
      countsAfterRollback.ndviCount === 0,
      `7.4 Full rollback: 0 NDVI records persisted (got: ${countsAfterRollback.ndviCount})`
    );
  } finally {
    console.log('\n[Cleaning up test entities...]');
    if (testFarmId) {
      await satelliteRepository.deleteByFarmId(testFarmId);
      await farmBoundaryRepository.deleteByFarmId(testFarmId);
      await farmService.deleteFarm(testFarmId);
    }
    if (testRollbackFarmId) {
      await satelliteRepository.deleteByFarmId(testRollbackFarmId);
      await farmBoundaryRepository.deleteByFarmId(testRollbackFarmId);
      await farmService.deleteFarm(testRollbackFarmId);
    }
    if (testFarmerId) {
      await prisma.farmer.delete({ where: { id: testFarmerId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSatelliteSyncIntegrationTests().catch((err) => {
  console.error('Fatal error in satelliteSync.integration.test.ts:', err);
  process.exit(1);
});
