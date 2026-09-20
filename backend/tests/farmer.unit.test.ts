/**
 * Module 2: Farmer Unit Test Suite (Mocked Repository)
 * Tests all 8 required scenarios covering validation, business logic, duplicate handling, and error codes.
 */

import { Language, Farmer } from '@prisma/client';
import { FarmerService } from '../src/services/farmer.service.js';
import { createFarmerSchema, farmerIdParamSchema } from '../src/validators/farmer.validator.js';
import { IFarmerRepository } from '../src/types/farmer.types.js';
import { AppError } from '../src/utils/apiError.js';

class MockFarmerRepository implements IFarmerRepository {
  public farmers: Farmer[] = [];

  async create(data: {
    fullName: string;
    mobileNumber: string;
    preferredLanguage: Language;
    farmerReferenceNumber?: string | null;
  }): Promise<Farmer> {
    const newFarmer: Farmer = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      fullName: data.fullName,
      mobileNumber: data.mobileNumber,
      preferredLanguage: data.preferredLanguage,
      farmerReferenceNumber: data.farmerReferenceNumber || null,
      createdAt: new Date('2026-09-20T10:00:00.000Z'),
      updatedAt: new Date('2026-09-20T10:00:00.000Z'),
    };
    this.farmers.push(newFarmer);
    return newFarmer;
  }

  async findById(id: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.id === id) || null;
  }

  async findByMobileNumber(mobileNumber: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.mobileNumber === mobileNumber) || null;
  }

  async findByReferenceNumber(ref: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.farmerReferenceNumber === ref) || null;
  }

  async findAll(options: { skip: number; take: number; search?: string }): Promise<Farmer[]> {
    let result = [...this.farmers];
    if (options.search) {
      const s = options.search.toLowerCase();
      result = result.filter(
        (f) =>
          f.fullName.toLowerCase().includes(s) ||
          f.mobileNumber.includes(s) ||
          (f.farmerReferenceNumber && f.farmerReferenceNumber.toLowerCase().includes(s))
      );
    }
    return result.slice(options.skip, options.skip + options.take);
  }

  async count(search?: string): Promise<number> {
    if (!search) return this.farmers.length;
    const s = search.toLowerCase();
    return this.farmers.filter(
      (f) =>
        f.fullName.toLowerCase().includes(s) ||
        f.mobileNumber.includes(s) ||
        (f.farmerReferenceNumber && f.farmerReferenceNumber.toLowerCase().includes(s))
    ).length;
  }
}

async function runUnitTests() {
  console.log('🧪 Running Module 2 Farmer Unit Test Suite...\n');
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
  // Test 1: Valid farmer registration
  // ---------------------------------------------------------------------------
  try {
    const mockRepo = new MockFarmerRepository();
    const service = new FarmerService(mockRepo);

    const result = await service.registerFarmer({
      fullName: 'Ramesh Patil',
      mobileNumber: '+919876543210',
      preferredLanguage: Language.mr,
      farmerReferenceNumber: 'AGRI-FMR-MH-001',
    });

    assert(result.fullName === 'Ramesh Patil', '1.1 Farmer registered with correct full name');
    assert(result.mobileNumber === '9876543210', '1.2 Mobile number normalized to 10 digits');
    assert(result.preferredLanguage === 'mr', '1.3 Preferred language set to Marathi');
    assert(result.farmerReferenceNumber === 'AGRI-FMR-MH-001', '1.4 Internal reference number saved');
    assert(typeof result.id === 'string' && result.id.length > 0, '1.5 Farmer UUID generated');
  } catch (err) {
    assert(false, `1. Valid farmer registration threw an unexpected error: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // Test 2: Validation - Missing full name
  // ---------------------------------------------------------------------------
  try {
    const parseResult = createFarmerSchema.safeParse({
      mobileNumber: '9876543210',
      preferredLanguage: 'en',
    });
    assert(!parseResult.success, '2.1 Schema rejects missing full name');
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors[0]?.message;
      assert(errorMsg?.includes('Full name is required'), '2.2 Error message confirms missing full name');
    }
  } catch (err) {
    assert(false, `2. Missing full name test error: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // Test 3: Validation - Invalid mobile number
  // ---------------------------------------------------------------------------
  try {
    // 3a. Too short
    const shortMobile = createFarmerSchema.safeParse({
      fullName: 'Ramesh Patil',
      mobileNumber: '12345',
    });
    assert(!shortMobile.success, '3.1 Rejects short mobile number (12345)');

    // 3b. Starts with invalid digit (5 instead of 6-9)
    const invalidStart = createFarmerSchema.safeParse({
      fullName: 'Ramesh Patil',
      mobileNumber: '5876543210',
    });
    assert(!invalidStart.success, '3.2 Rejects number not starting with 6-9');

    // 3c. Contains letters
    const nonNumeric = createFarmerSchema.safeParse({
      fullName: 'Ramesh Patil',
      mobileNumber: '98765abcde',
    });
    assert(!nonNumeric.success, '3.3 Rejects alphanumeric mobile number');
  } catch (err) {
    assert(false, `3. Invalid mobile number test error: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // Test 4: Validation - Invalid language
  // ---------------------------------------------------------------------------
  try {
    const invalidLang = createFarmerSchema.safeParse({
      fullName: 'Ramesh Patil',
      mobileNumber: '9876543210',
      preferredLanguage: 'fr', // French is not in supported languages
    });
    assert(!invalidLang.success, '4.1 Rejects unsupported language code');
    if (!invalidLang.success) {
      assert(invalidLang.error.errors[0]?.message.includes('Invalid language'), '4.2 Rejection error specifies supported languages');
    }
  } catch (err) {
    assert(false, `4. Invalid language test error: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // Test 5: Duplicate mobile number detection
  // ---------------------------------------------------------------------------
  try {
    const mockRepo = new MockFarmerRepository();
    const service = new FarmerService(mockRepo);

    // Initial registration
    await service.registerFarmer({
      fullName: 'First Farmer',
      mobileNumber: '9876543210',
    });

    // Attempt duplicate registration with formatted mobile number (+91 prefix)
    let caughtConflict = false;
    try {
      await service.registerFarmer({
        fullName: 'Second Farmer',
        mobileNumber: '+919876543210', // Should normalize to same 9876543210
      });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 409) {
        caughtConflict = true;
        assert(err.message.includes('already registered'), '5.1 Conflict error message correctly identifies duplicate mobile');
      }
    }
    assert(caughtConflict, '5.2 Throws 409 Conflict error on duplicate mobile number');
  } catch (err) {
    assert(false, `5. Duplicate mobile number test error: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // Test 6: Retrieving farmer list
  // ---------------------------------------------------------------------------
  try {
    const mockRepo = new MockFarmerRepository();
    const service = new FarmerService(mockRepo);

    await service.registerFarmer({ fullName: 'Farmer One', mobileNumber: '9876543201' });
    await service.registerFarmer({ fullName: 'Farmer Two', mobileNumber: '9876543202' });

    const listResult = await service.getAllFarmers({ page: 1, limit: 10 });
    assert(listResult.farmers.length === 2, '6.1 Retrieved list contains 2 farmers');
    assert(listResult.pagination.total === 2, '6.2 Pagination total correctly reports 2');
    assert(listResult.pagination.page === 1, '6.3 Pagination page is 1');
  } catch (err) {
    assert(false, `6. Retrieving farmer list test error: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // Test 7: Retrieving farmer by ID
  // ---------------------------------------------------------------------------
  try {
    const mockRepo = new MockFarmerRepository();
    const service = new FarmerService(mockRepo);

    const created = await service.registerFarmer({
      fullName: 'Suresh Kumar',
      mobileNumber: '9876543211',
      preferredLanguage: Language.hi,
    });

    const fetched = await service.getFarmerById(created.id);
    assert(fetched.id === created.id, '7.1 Retrieved farmer ID matches registered ID');
    assert(fetched.fullName === 'Suresh Kumar', '7.2 Retrieved farmer name matches');
    assert(fetched.preferredLanguage === 'hi', '7.3 Retrieved farmer language matches');
  } catch (err) {
    assert(false, `7. Retrieving farmer by ID test error: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // Test 8: Farmer not found error
  // ---------------------------------------------------------------------------
  try {
    const mockRepo = new MockFarmerRepository();
    const service = new FarmerService(mockRepo);
    const nonExistentUuid = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22';

    // Verify UUID validation
    const paramValidation = farmerIdParamSchema.safeParse({ id: nonExistentUuid });
    assert(paramValidation.success, '8.1 Valid UUID passes route param validation');

    let caughtNotFound = false;
    try {
      await service.getFarmerById(nonExistentUuid);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) {
        caughtNotFound = true;
        assert(err.message.includes('not found'), '8.2 Error message confirms farmer not found');
      }
    }
    assert(caughtNotFound, '8.3 Throws 404 Not Found error for missing farmer UUID');
  } catch (err) {
    assert(false, `8. Farmer not found test error: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`Unit Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runUnitTests().catch((error) => {
  console.error('Fatal error during test run:', error);
  process.exit(1);
});
