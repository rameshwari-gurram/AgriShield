/**
 * Module 7 Stage 7.2-E: Satellite API Integration Test Suite
 * (Express + Live PostgreSQL + PostGIS)
 *
 * Verifies real HTTP request dispatch, Zod validation middleware, error middleware,
 * controller orchestration, provider isolation, idempotency, NO_DATA skip policy,
 * latest observation retrieval, and historical time-series queries.
 *
 * Test Scenarios:
 * 1.  Successful synchronization (POST /api/v1/farms/:farmId/satellite/sync)
 * 2.  Repeat synchronization idempotency (zero row duplication on farmId + productId)
 * 3.  NO_DATA observation skip policy (skippedNoDataCount = 1, valid observation persisted)
 * 4.  Invalid farmId UUID format on sync -> 400 Bad Request
 * 5.  Nonexistent farmId on sync -> 404 Not Found
 * 6.  Missing FarmBoundary on sync -> 404 Not Found
 * 7.  Invalid date strings in sync request body -> 400 Bad Request
 * 8.  Inverted date range (from > to) in sync request body -> 400 Bad Request
 * 9.  Future 'to' date in sync request body -> 400 Bad Request
 * 10. GET /api/v1/farms/:farmId/satellite/latest -> 200 OK with newest observation
 * 11. GET /api/v1/farms/:farmId/satellite/latest on farm with no observations -> 404 Not Found
 * 12. GET /api/v1/farms/not-a-uuid/satellite/latest -> 400 Bad Request
 * 13. GET /api/v1/farms/:nonexistentId/satellite/latest -> 404 Not Found
 * 14. GET /api/v1/farms/:farmId/satellite (historical) -> 200 OK (chronological ASC)
 * 15. GET /api/v1/farms/:farmId/satellite?limit=1 -> 200 OK with limited count
 * 16. GET /api/v1/farms/:farmId/satellite with invalid date range -> 400 Bad Request
 * 17. GET /api/v1/farms/not-a-uuid/satellite -> 400 Bad Request
 */

import http from 'http';
import { prisma } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { farmerService } from '../src/services/farmer.service.js';
import { farmService } from '../src/services/farm.service.js';
import { farmBoundaryRepository } from '../src/repositories/farmBoundary.repository.js';
import { satelliteRepository } from '../src/repositories/satellite.repository.js';
import { satelliteService } from '../src/services/satellite.service.js';
import {
  ISatelliteProvider,
  GeoJSONPolygon,
  NormalizedNdviObservationDTO,
} from '../src/types/satellite.types.js';

class MockApiSatelliteProvider implements ISatelliteProvider {
  public readonly providerName = 'Copernicus Data Space Ecosystem';
  public callCount: number = 0;
  public observationsToReturn: NormalizedNdviObservationDTO[] = [];
  public failureToThrow: Error | null = null;

  async fetchNdviObservations(
    _boundary: GeoJSONPolygon,
    _dateRange: { from: Date; to: Date },
    _options?: { maxCloudCoverage?: number }
  ): Promise<NormalizedNdviObservationDTO[]> {
    this.callCount++;
    if (this.failureToThrow) {
      throw this.failureToThrow;
    }
    return this.observationsToReturn;
  }

  reset(): void {
    this.callCount = 0;
    this.observationsToReturn = [];
    this.failureToThrow = null;
  }
}

async function runSatelliteApiIntegrationTests() {
  console.log('================================================================');
  console.log('🧪 Running Module 7 Stage 7.2-E: Satellite REST API Integration Tests');
  console.log('================================================================\n');

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

  // Start real Express HTTP Server on ephemeral port
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Install mock satellite provider into satelliteService
  const mockProvider = new MockApiSatelliteProvider();
  satelliteService.setProvider(mockProvider);

  const testMobile = '9999900007';
  let testFarmerId: string | null = null;
  let testFarmId: string | null = null;
  let testFarmWithoutBoundaryId: string | null = null;
  let testFarmWithoutObservationsId: string | null = null;

  try {
    // ---------------------------------------------------------------------------
    // Initial Database Cleanup & Setup
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
      fullName: 'Sunil Gavaskar',
      mobileNumber: testMobile,
      preferredLanguage: 'mr' as any,
    });
    testFarmerId = farmer.id;

    // Farm 1: Primary farm with boundary
    const farm = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Satellite REST Test Farm',
      cropName: 'Sugarcane',
      sowingDate: '2026-05-15',
      farmArea: 4.5,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testFarmId = farm.id;

    const polygonGeoJson = {
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

    // Farm 2: Farm without boundary
    const farmWithoutBoundary = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'No Boundary Satellite Parcel',
      cropName: 'Jowar',
      sowingDate: '2026-06-01',
      farmArea: 3.0,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testFarmWithoutBoundaryId = farmWithoutBoundary.id;

    // Farm 3: Farm with boundary but 0 observations (for latest 404 test)
    const farmWithoutObs = await farmService.registerFarm({
      farmerId: testFarmerId,
      farmName: 'Empty Observations Parcel',
      cropName: 'Soybean',
      sowingDate: '2026-06-10',
      farmArea: 2.5,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
    });
    testFarmWithoutObservationsId = farmWithoutObs.id;
    await farmBoundaryRepository.create(testFarmWithoutObservationsId, JSON.stringify(polygonGeoJson));

    // ===========================================================================
    // PART 1: Synchronization Endpoint Tests (POST /api/v1/farms/:farmId/satellite/sync)
    // ===========================================================================
    console.log('--- Part 1: Synchronization Endpoint Tests ---');

    // Test 1: Successful Synchronization
    const obsDate1 = new Date('2026-09-20T10:30:00.000Z');
    mockProvider.observationsToReturn = [
      {
        observedAt: obsDate1,
        satellite: {
          observedAt: obsDate1,
          provider: 'Copernicus Data Space Ecosystem',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'STAT_AGG_S2L2A_20260920T103000Z',
          cloudCoverage: 5.25,
          sourceReference: 'Sentinel-2 MSI Level-2A',
        },
        ndvi: {
          meanNdvi: 0.6241,
          minNdvi: 0.2105,
          maxNdvi: 0.8412,
          validPixelPercentage: 98.5,
        },
      },
    ];

    const syncRes1 = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/satellite/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '2026-09-15T00:00:00.000Z',
        to: '2026-09-25T00:00:00.000Z',
        maxCloudCoverage: 80,
      }),
    });
    const syncBody1 = await syncRes1.json();

    assert(syncRes1.status === 200, '1.1 POST /satellite/sync returns HTTP 200');
    assert(syncBody1.success === true, '1.2 Envelope success is true');
    assert(syncBody1.data.syncedCount === 1, '1.3 data.syncedCount = 1');
    assert(syncBody1.data.skippedNoDataCount === 0, '1.4 data.skippedNoDataCount = 0');
    assert(syncBody1.data.totalFetched === 1, '1.5 data.totalFetched = 1');
    assert(syncBody1.data.observations.length === 1, '1.6 observations array has 1 record');
    assert(syncBody1.data.observations[0].meanNdvi === 0.6241, '1.7 meanNdvi matches 0.6241');

    // Verify DB persistence
    const dbSat1 = await prisma.satelliteObservation.findFirst({
      where: { farmId: testFarmId, productId: 'STAT_AGG_S2L2A_20260920T103000Z' },
    });
    assert(dbSat1 !== null, '1.8 SatelliteObservation row persisted in PostgreSQL');
    const dbNdvi1 = await prisma.ndviObservation.findFirst({
      where: { farmId: testFarmId, satelliteObservationId: dbSat1!.id },
    });
    assert(dbNdvi1 !== null, '1.9 NdviObservation row persisted in PostgreSQL');

    // Test 2: Idempotent Synchronization
    // Resync same observation with slightly updated stats
    mockProvider.observationsToReturn = [
      {
        observedAt: obsDate1,
        satellite: {
          observedAt: obsDate1,
          provider: 'Copernicus Data Space Ecosystem',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'STAT_AGG_S2L2A_20260920T103000Z',
          cloudCoverage: 4.8,
          sourceReference: 'Sentinel-2 MSI Level-2A',
        },
        ndvi: {
          meanNdvi: 0.6285,
          minNdvi: 0.2105,
          maxNdvi: 0.8412,
          validPixelPercentage: 99.0,
        },
      },
    ];

    const syncRes2 = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/satellite/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '2026-09-15T00:00:00.000Z',
        to: '2026-09-25T00:00:00.000Z',
      }),
    });
    const syncBody2 = await syncRes2.json();

    assert(syncRes2.status === 200, '2.1 Repeat POST /satellite/sync returns HTTP 200');
    assert(syncBody2.data.syncedCount === 1, '2.2 Repeat sync reports syncedCount = 1');
    const satCount2 = await prisma.satelliteObservation.count({ where: { farmId: testFarmId } });
    const ndviCount2 = await prisma.ndviObservation.count({ where: { farmId: testFarmId } });
    assert(satCount2 === 1, `2.3 SatelliteObservation row count remains 1 (got: ${satCount2})`);
    assert(ndviCount2 === 1, `2.4 NdviObservation row count remains 1 (got: ${ndviCount2})`);
    const dbNdvi2 = await prisma.ndviObservation.findFirst({ where: { farmId: testFarmId } });
    assert(Number(dbNdvi2?.meanNdvi) === 0.6285, '2.5 Resync updated existing row meanNdvi to 0.6285');

    // Test 3: NO_DATA Handling Policy
    const obsDateValid = new Date('2026-09-24T10:30:00.000Z');
    const obsDateNoData = new Date('2026-09-22T10:30:00.000Z');

    mockProvider.observationsToReturn = [
      {
        observedAt: obsDateValid,
        satellite: {
          observedAt: obsDateValid,
          provider: 'Copernicus Data Space Ecosystem',
          satellite: 'Sentinel-2B',
          productType: 'S2MSI2A',
          productId: 'STAT_AGG_S2L2A_20260924T103000Z',
          cloudCoverage: 10.0,
          sourceReference: 'Sentinel-2 MSI Level-2A',
        },
        ndvi: {
          meanNdvi: 0.5512,
          minNdvi: 0.1500,
          maxNdvi: 0.7200,
          validPixelPercentage: 92.0,
        },
      },
      {
        observedAt: obsDateNoData,
        satellite: {
          observedAt: obsDateNoData,
          provider: 'Copernicus Data Space Ecosystem',
          satellite: 'Sentinel-2A',
          productType: 'S2MSI2A',
          productId: 'STAT_AGG_S2L2A_20260922T103000Z',
          cloudCoverage: 100.0,
          sourceReference: 'Sentinel-2 MSI Level-2A',
        },
        ndvi: {
          meanNdvi: null as any,
          minNdvi: null as any,
          maxNdvi: null as any,
          validPixelPercentage: 0.0,
        },
      },
    ];

    const syncRes3 = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/satellite/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '2026-09-20T00:00:00.000Z',
        to: '2026-09-25T00:00:00.000Z',
      }),
    });
    const syncBody3 = await syncRes3.json();

    assert(syncRes3.status === 200, '3.1 Mixed sync returns HTTP 200');
    assert(syncBody3.data.totalFetched === 2, '3.2 totalFetched = 2');
    assert(syncBody3.data.syncedCount === 1, '3.3 syncedCount = 1 (valid observation only)');
    assert(syncBody3.data.skippedNoDataCount === 1, '3.4 skippedNoDataCount = 1');
    const noDataSatRow = await prisma.satelliteObservation.findFirst({
      where: { farmId: testFarmId, productId: 'STAT_AGG_S2L2A_20260922T103000Z' },
    });
    assert(noDataSatRow === null, '3.5 NO_DATA observation was NOT persisted to PostgreSQL');

    // Test 4: Invalid UUID in farmId
    const syncRes4 = await fetch(`${baseUrl}/api/v1/farms/not-a-uuid/satellite/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-20T00:00:00.000Z',
      }),
    });
    const syncBody4 = await syncRes4.json();
    assert(syncRes4.status === 400, '4.1 Invalid UUID returns HTTP 400');
    assert(syncBody4.success === false, '4.2 Invalid UUID success is false');

    // Test 5: Nonexistent farm
    const nonexistentFarmId = '00000000-0000-4000-8000-000000000099';
    const syncRes5 = await fetch(`${baseUrl}/api/v1/farms/${nonexistentFarmId}/satellite/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-20T00:00:00.000Z',
      }),
    });
    const syncBody5 = await syncRes5.json();
    assert(syncRes5.status === 404, '5.1 Nonexistent farm returns HTTP 404');
    assert(syncBody5.success === false, '5.2 Nonexistent farm success is false');

    // Test 6: Missing FarmBoundary
    const syncRes6 = await fetch(
      `${baseUrl}/api/v1/farms/${testFarmWithoutBoundaryId}/satellite/sync`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-20T00:00:00.000Z',
        }),
      }
    );
    const syncBody6 = await syncRes6.json();
    assert(syncRes6.status === 404, '6.1 Farm without boundary returns HTTP 404');
    assert(syncBody6.success === false, '6.2 Farm without boundary success is false');

    // Test 7: Invalid date format
    const syncRes7 = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/satellite/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'not-a-valid-date',
        to: '2026-09-20T00:00:00.000Z',
      }),
    });
    assert(syncRes7.status === 400, '7.1 Invalid date string returns HTTP 400');

    // Test 8: Inverted date range (from > to)
    const syncRes8 = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/satellite/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '2026-09-30T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      }),
    });
    assert(syncRes8.status === 400, '8.1 Inverted date range (from > to) returns HTTP 400');

    // Test 9: Future date (beyond clock-skew rule)
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const syncRes9 = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/satellite/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '2026-09-01T00:00:00.000Z',
        to: futureDate,
      }),
    });
    assert(syncRes9.status === 400, '9.1 Future to date returns HTTP 400');

    // ===========================================================================
    // PART 2: Latest Endpoint Tests (GET /api/v1/farms/:farmId/satellite/latest)
    // ===========================================================================
    console.log('\n--- Part 2: Latest Endpoint Tests ---');

    // Test 10: Latest observation returned
    const latestRes10 = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/satellite/latest`);
    const latestBody10 = await latestRes10.json();

    assert(latestRes10.status === 200, '10.1 GET /satellite/latest returns HTTP 200');
    assert(latestBody10.success === true, '10.2 Latest response success is true');
    assert(
      latestBody10.data.observedAt === obsDateValid.toISOString(),
      '10.3 Latest observation matches newest observedAt (2026-09-24)'
    );
    assert(latestBody10.data.meanNdvi === 0.5512, '10.4 Latest meanNdvi is 0.5512');
    assert(
      latestBody10.data.satelliteObservation !== undefined,
      '10.5 Satellite observation metadata attached'
    );

    // Test 11: Farm with no observations -> 404 Not Found
    const latestRes11 = await fetch(
      `${baseUrl}/api/v1/farms/${testFarmWithoutObservationsId}/satellite/latest`
    );
    const latestBody11 = await latestRes11.json();
    assert(latestRes11.status === 404, '11.1 Farm without observations returns HTTP 404');
    assert(latestBody11.success === false, '11.2 Farm without observations success is false');

    // Test 12: Invalid farmId UUID format
    const latestRes12 = await fetch(`${baseUrl}/api/v1/farms/not-a-uuid/satellite/latest`);
    assert(latestRes12.status === 400, '12.1 Invalid UUID on latest returns HTTP 400');

    // Test 13: Nonexistent farm
    const latestRes13 = await fetch(`${baseUrl}/api/v1/farms/${nonexistentFarmId}/satellite/latest`);
    assert(latestRes13.status === 404, '13.1 Nonexistent farm on latest returns HTTP 404');

    // ===========================================================================
    // PART 3: Historical Endpoint Tests (GET /api/v1/farms/:farmId/satellite)
    // ===========================================================================
    console.log('\n--- Part 3: Historical Endpoint Tests ---');

    // Test 14: Historical observations query
    const histRes14 = await fetch(
      `${baseUrl}/api/v1/farms/${testFarmId}/satellite?from=2026-09-15T00:00:00.000Z&to=2026-09-25T00:00:00.000Z`
    );
    const histBody14 = await histRes14.json();

    assert(histRes14.status === 200, '14.1 GET /satellite returns HTTP 200');
    assert(histBody14.success === true, '14.2 Historical response success is true');
    assert(Array.isArray(histBody14.data), '14.3 Historical data is an array');
    assert(histBody14.data.length === 2, `14.4 Returns all 2 persisted observations (got ${histBody14.data.length})`);
    assert(
      new Date(histBody14.data[0].observedAt) <= new Date(histBody14.data[1].observedAt),
      '14.5 Historical observations are sorted chronologically ascending (observedAt ASC)'
    );

    // Test 15: Limit query param
    const histRes15 = await fetch(`${baseUrl}/api/v1/farms/${testFarmId}/satellite?limit=1`);
    const histBody15 = await histRes15.json();
    assert(histRes15.status === 200, '15.1 Query with limit=1 returns HTTP 200');
    assert(histBody15.data.length === 1, `15.2 Result has exactly 1 element (got ${histBody15.data.length})`);

    // Test 16: Invalid date range on historical query (from > to)
    const histRes16 = await fetch(
      `${baseUrl}/api/v1/farms/${testFarmId}/satellite?from=2026-09-30T00:00:00.000Z&to=2026-09-01T00:00:00.000Z`
    );
    assert(histRes16.status === 400, '16.1 Inverted historical date range returns HTTP 400');

    // Test 17: Invalid UUID on historical query
    const histRes17 = await fetch(`${baseUrl}/api/v1/farms/not-a-uuid/satellite`);
    assert(histRes17.status === 400, '17.1 Invalid UUID on historical query returns HTTP 400');

    // ---------------------------------------------------------------------------
    // Final Test Cleanup
    // ---------------------------------------------------------------------------
    console.log('\n[Cleaning up integration test entities...]');
    if (testFarmId) {
      await satelliteRepository.deleteByFarmId(testFarmId);
      await farmBoundaryRepository.deleteByFarmId(testFarmId);
      await farmService.deleteFarm(testFarmId);
    }
    if (testFarmWithoutBoundaryId) {
      await farmService.deleteFarm(testFarmWithoutBoundaryId);
    }
    if (testFarmWithoutObservationsId) {
      await farmBoundaryRepository.deleteByFarmId(testFarmWithoutObservationsId);
      await farmService.deleteFarm(testFarmWithoutObservationsId);
    }
    if (testFarmerId) {
      await prisma.farmer.delete({ where: { id: testFarmerId } });
    }
  } catch (err: any) {
    console.error('Unhandled error in satellite API integration tests:', err);
    failed++;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n================================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSatelliteApiIntegrationTests().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
