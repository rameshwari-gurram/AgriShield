/**
 * Module 3: Farm Integration Test Suite (Live PostgreSQL + Prisma)
 * Verifies real PostgreSQL database operations, Prisma schema mapping,
 * foreign key relationships, RESTRICT deletion constraints, and cleanup.
 */

import { AreaUnit, FarmStatus, Language, Prisma } from '@prisma/client';
import { prisma } from '../src/config/db.js';
import { farmerRepository } from '../src/repositories/farmer.repository.js';
import { farmerService } from '../src/services/farmer.service.js';
import { farmRepository } from '../src/repositories/farm.repository.js';
import { farmService } from '../src/services/farm.service.js';

async function runFarmIntegrationTests() {
  console.log('🧪 Running Module 3 Farm Integration Tests (PostgreSQL + Prisma)...\n');

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

  // ---------------------------------------------------------------------------
  // 1. PostgreSQL connection verification
  // ---------------------------------------------------------------------------
  try {
    await prisma.$queryRaw`SELECT 1`;
    assert(true, '1. PostgreSQL database connection verified');
  } catch (err) {
    assert(false, `1. PostgreSQL connection failed: ${(err as Error).message}`);
    console.log('  Aborting integration tests as database is unreachable.');
    return;
  }

  const testMobile = '9999900003';
  let testFarmerId: string | null = null;
  let testFarmId: string | null = null;

  try {
    // Initial cleanup if previous failed run left records
    const preExistingFarmer = await farmerRepository.findByMobileNumber(testMobile);
    if (preExistingFarmer) {
      // Delete any associated test farms first
      await prisma.farm.deleteMany({ where: { farmerId: preExistingFarmer.id } });
      await prisma.farmer.delete({ where: { id: preExistingFarmer.id } });
    }

    // ---------------------------------------------------------------------------
    // 2. Create Farmer in live PostgreSQL
    // ---------------------------------------------------------------------------
    const farmer = await farmerService.registerFarmer({
      fullName: 'Integration Test Farmer',
      mobileNumber: testMobile,
      preferredLanguage: Language.mr,
      farmerReferenceNumber: 'AGRI-FMR-INT-FARM-01',
    });
    testFarmerId = farmer.id;
    assert(typeof farmer.id === 'string' && farmer.id.length > 0, '2. Live PostgreSQL Farmer created');

    // ---------------------------------------------------------------------------
    // 3. Create Farm linked to Farmer
    // ---------------------------------------------------------------------------
    const farm = await farmService.registerFarm({
      farmerId: farmer.id,
      farmName: 'Sahyadri Organic Orchard',
      cropName: 'Pomegranate',
      cropVariety: 'Bhagwa',
      sowingDate: '2026-02-10',
      expectedHarvestDate: '2026-08-25',
      farmArea: 6.5,
      farmAreaUnit: AreaUnit.ACRE,
      village: 'Sangola',
      district: 'Solapur',
      state: 'Maharashtra',
      pincode: '413307',
      status: FarmStatus.ACTIVE,
    });
    testFarmId = farm.id;
    assert(typeof farm.id === 'string' && farm.id.length > 0, '3. Live PostgreSQL Farm created and linked to Farmer');

    // ---------------------------------------------------------------------------
    // 4. Verify Foreign-Key relationship and Decimal area
    // ---------------------------------------------------------------------------
    const rawFarmInDb = await prisma.farm.findUnique({ where: { id: farm.id } });
    assert(rawFarmInDb !== null && rawFarmInDb.farmerId === farmer.id, '4.1 Farm record in PostgreSQL has valid foreign key farmerId');
    assert(Number(rawFarmInDb?.farmArea) === 6.5, '4.2 Decimal(10, 2) area stored accurately without float loss');

    // ---------------------------------------------------------------------------
    // 5. Retrieve Farm with Farmer details (Prisma join)
    // ---------------------------------------------------------------------------
    const farmWithFarmer = await farmService.getFarmById(farm.id);
    assert(farmWithFarmer.id === farm.id, '5.1 Farm retrieved by ID');
    assert(farmWithFarmer.farmer?.id === farmer.id, '5.2 Linked Farmer included in retrieved farm');
    assert(farmWithFarmer.farmer?.fullName === 'Integration Test Farmer', '5.3 Linked Farmer name matches');

    // ---------------------------------------------------------------------------
    // 6. Retrieve Farms by Farmer ID
    // ---------------------------------------------------------------------------
    const farmerFarms = await farmService.getFarmsByFarmerId(farmer.id);
    assert(farmerFarms.length === 1, '6.1 Exactly 1 farm returned for test farmer');
    assert(farmerFarms[0].farmName === 'Sahyadri Organic Orchard', '6.2 Returned farm matches created farm name');

    // ---------------------------------------------------------------------------
    // 7. Update Farm via Service (partial update)
    // ---------------------------------------------------------------------------
    const updatedFarm = await farmService.updateFarm(farm.id, {
      farmArea: 7.25,
      status: FarmStatus.HARVESTED,
    });
    assert(updatedFarm.farmArea === 7.25, '7.1 Farm area updated to 7.25 in live database');
    assert(updatedFarm.status === FarmStatus.HARVESTED, '7.2 Farm status updated to HARVESTED in live database');

    // ---------------------------------------------------------------------------
    // 8. Invalid/non-existent Farmer rejected by service
    // ---------------------------------------------------------------------------
    let nonExistentFarmerCaught = false;
    try {
      await farmService.registerFarm({
        farmerId: '00000000-0000-0000-0000-000000000000',
        farmName: 'Ghost Plot',
        cropName: 'Cotton',
        sowingDate: '2026-06-01',
        farmArea: 2.0,
        village: 'Village',
        district: 'District',
        state: 'State',
        pincode: '413102',
      });
    } catch {
      nonExistentFarmerCaught = true;
    }
    assert(nonExistentFarmerCaught, '8. Attempting to create farm with non-existent farmer is rejected by service');

    // ---------------------------------------------------------------------------
    // 9. Database-level foreign key constraint enforcement
    // ---------------------------------------------------------------------------
    let dbFkErrorCaught = false;
    try {
      await prisma.farm.create({
        data: {
          farmerId: '00000000-0000-0000-0000-000000000000',
          farmName: 'Direct DB Bypass Plot',
          farmReferenceNumber: 'AGRI-FRM-TEST-BYPASS-001',
          cropName: 'Barley',
          sowingDate: new Date('2026-06-01'),
          farmArea: new Prisma.Decimal(2.0),
          farmAreaUnit: AreaUnit.ACRE,
          village: 'Village',
          district: 'District',
          state: 'State',
          pincode: '413102',
          status: FarmStatus.ACTIVE,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2003') {
        dbFkErrorCaught = true;
      }
    }
    assert(dbFkErrorCaught, '9. PostgreSQL database rejects direct insert with invalid farmerId (foreign key constraint P2003)');

    // ---------------------------------------------------------------------------
    // 10. Delete Farm
    // ---------------------------------------------------------------------------
    const deletedFarm = await farmService.deleteFarm(farm.id);
    testFarmId = null;
    assert(deletedFarm.id === farm.id, '10.1 Delete farm successful');
    const lookupAfterDelete = await prisma.farm.findUnique({ where: { id: farm.id } });
    assert(lookupAfterDelete === null, '10.2 Farm no longer exists in PostgreSQL database');

    // ---------------------------------------------------------------------------
    // 11. RESTRICT Foreign-Key: Deleting Farmer with an associated Farm is REJECTED
    // ---------------------------------------------------------------------------
    // Create a new farm linked to the farmer to verify RESTRICT behavior
    const guardFarm = await farmService.registerFarm({
      farmerId: farmer.id,
      farmName: 'Guard Plot for Foreign Key Restrict Test',
      cropName: 'Wheat',
      sowingDate: '2026-11-15',
      farmArea: 3.0,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '413102',
    });

    let deleteFarmerRejected = false;
    try {
      // Attempt to delete farmer while child farm exists
      await prisma.farmer.delete({ where: { id: farmer.id } });
    } catch (err: any) {
      // PostgreSQL onDelete: Restrict causes Prisma error code P2003
      if (err.code === 'P2003') {
        deleteFarmerRejected = true;
      }
    }
    assert(deleteFarmerRejected, '11. Attempting to delete Farmer with active Farm is REJECTED by PostgreSQL (onDelete: Restrict constraint P2003)');

    // ---------------------------------------------------------------------------
    // 12. Cleanup test records
    // ---------------------------------------------------------------------------
    // First delete child farm, then parent farmer
    await prisma.farm.delete({ where: { id: guardFarm.id } });
    await prisma.farmer.delete({ where: { id: farmer.id } });
    testFarmerId = null;
    assert(true, '12. Successfully cleaned up test Farm and Farmer records in proper sequence');

  } catch (error) {
    console.error('Integration test failure:', error);
    failed++;
  } finally {
    // Teardown safety cleanup
    if (testFarmId) {
      await prisma.farm.deleteMany({ where: { id: testFarmId } }).catch(() => {});
    }
    if (testFarmerId) {
      await prisma.farm.deleteMany({ where: { farmerId: testFarmerId } }).catch(() => {});
      await prisma.farmer.deleteMany({ where: { id: testFarmerId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n========================================`);
  console.log(`Live DB Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runFarmIntegrationTests().catch(console.error);
