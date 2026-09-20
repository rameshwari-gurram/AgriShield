/**
 * Module 3: Farm Unit Test Suite (Mocked Repository)
 * Tests all 15 required scenarios specified in Module 3 approval.
 */

import { AreaUnit, FarmStatus, Farm, Farmer, Prisma } from '@prisma/client';
import { FarmService } from '../src/services/farm.service.js';
import {
  createFarmSchema,
  updateFarmSchema,
  farmIdParamSchema,
  farmerIdParamForFarmsSchema,
} from '../src/validators/farm.validator.js';
import { IFarmRepository } from '../src/types/farm.types.js';
import { IFarmerRepository } from '../src/types/farmer.types.js';
import { AppError } from '../src/utils/apiError.js';

class MockFarmerRepository implements IFarmerRepository {
  public farmers: Farmer[] = [];

  constructor(initialFarmers: Farmer[] = []) {
    this.farmers = [...initialFarmers];
  }

  async create(data: {
    fullName: string;
    mobileNumber: string;
    preferredLanguage: any;
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

  async findAll(): Promise<Farmer[]> {
    return this.farmers;
  }

  async count(): Promise<number> {
    return this.farmers.length;
  }
}

class MockFarmRepository implements IFarmRepository {
  public farms: (Farm & { farmer?: Farmer })[] = [];
  public farmerRepo: MockFarmerRepository;

  constructor(farmerRepo: MockFarmerRepository) {
    this.farmerRepo = farmerRepo;
  }

  async create(data: {
    farmerId: string;
    farmName: string;
    farmReferenceNumber: string;
    cropName: string;
    cropVariety?: string | null;
    sowingDate: Date;
    expectedHarvestDate?: Date | null;
    farmArea: number;
    farmAreaUnit: AreaUnit;
    village: string;
    district: string;
    state: string;
    pincode: string;
    status: FarmStatus;
  }): Promise<Farm & { farmer?: Farmer }> {
    const farmer = await this.farmerRepo.findById(data.farmerId);
    const newFarm: Farm & { farmer?: Farmer } = {
      id: 'c1f7b622-5b92-4f1b-87b6-9f8e432a1099',
      farmerId: data.farmerId,
      farmName: data.farmName,
      farmReferenceNumber: data.farmReferenceNumber,
      cropName: data.cropName,
      cropVariety: data.cropVariety || null,
      sowingDate: data.sowingDate,
      expectedHarvestDate: data.expectedHarvestDate || null,
      farmArea: new Prisma.Decimal(data.farmArea),
      farmAreaUnit: data.farmAreaUnit,
      village: data.village,
      district: data.district,
      state: data.state,
      pincode: data.pincode,
      status: data.status,
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
      updatedAt: new Date('2026-09-20T12:00:00.000Z'),
      farmer: farmer || undefined,
    };
    this.farms.push(newFarm);
    return newFarm;
  }

  async findById(id: string, includeFarmer: boolean = true): Promise<(Farm & { farmer?: Farmer }) | null> {
    const farm = this.farms.find((f) => f.id === id);
    if (!farm) return null;
    if (includeFarmer && !farm.farmer) {
      const farmer = await this.farmerRepo.findById(farm.farmerId);
      return { ...farm, farmer: farmer || undefined };
    }
    return farm;
  }

  async findByReferenceNumber(ref: string): Promise<Farm | null> {
    return this.farms.find((f) => f.farmReferenceNumber === ref) || null;
  }

  async findByFarmerId(farmerId: string): Promise<(Farm & { farmer?: Farmer })[]> {
    return this.farms.filter((f) => f.farmerId === farmerId);
  }

  async findAll(options: {
    skip: number;
    take: number;
    search?: string;
    cropName?: string;
    state?: string;
    status?: FarmStatus;
    farmerId?: string;
    includeFarmer?: boolean;
  }): Promise<(Farm & { farmer?: Farmer })[]> {
    let result = [...this.farms];
    if (options.farmerId) {
      result = result.filter((f) => f.farmerId === options.farmerId);
    }
    if (options.cropName) {
      result = result.filter((f) => f.cropName.toLowerCase() === options.cropName!.toLowerCase());
    }
    if (options.state) {
      result = result.filter((f) => f.state.toLowerCase() === options.state!.toLowerCase());
    }
    if (options.status) {
      result = result.filter((f) => f.status === options.status);
    }
    if (options.search) {
      const s = options.search.toLowerCase();
      result = result.filter(
        (f) =>
          f.farmName.toLowerCase().includes(s) ||
          f.cropName.toLowerCase().includes(s) ||
          f.village.toLowerCase().includes(s) ||
          f.farmReferenceNumber.toLowerCase().includes(s)
      );
    }
    return result.slice(options.skip, options.skip + options.take);
  }

  async count(filters?: {
    search?: string;
    cropName?: string;
    state?: string;
    status?: FarmStatus;
    farmerId?: string;
  }): Promise<number> {
    let result = [...this.farms];
    if (filters?.farmerId) result = result.filter((f) => f.farmerId === filters.farmerId);
    if (filters?.cropName) result = result.filter((f) => f.cropName.toLowerCase() === filters.cropName!.toLowerCase());
    if (filters?.state) result = result.filter((f) => f.state.toLowerCase() === filters.state!.toLowerCase());
    if (filters?.status) result = result.filter((f) => f.status === filters.status);
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(
        (f) =>
          f.farmName.toLowerCase().includes(s) ||
          f.cropName.toLowerCase().includes(s) ||
          f.village.toLowerCase().includes(s)
      );
    }
    return result.length;
  }

  async update(
    id: string,
    data: {
      farmName?: string;
      cropName?: string;
      cropVariety?: string | null;
      sowingDate?: Date;
      expectedHarvestDate?: Date | null;
      farmArea?: number;
      farmAreaUnit?: AreaUnit;
      village?: string;
      district?: string;
      state?: string;
      pincode?: string;
      status?: FarmStatus;
    }
  ): Promise<Farm & { farmer?: Farmer }> {
    const index = this.farms.findIndex((f) => f.id === id);
    if (index === -1) throw new Error('Not found');
    const existing = this.farms[index];
    const updated: Farm & { farmer?: Farmer } = {
      ...existing,
      farmName: data.farmName !== undefined ? data.farmName : existing.farmName,
      cropName: data.cropName !== undefined ? data.cropName : existing.cropName,
      cropVariety: data.cropVariety !== undefined ? data.cropVariety : existing.cropVariety,
      sowingDate: data.sowingDate !== undefined ? data.sowingDate : existing.sowingDate,
      expectedHarvestDate: data.expectedHarvestDate !== undefined ? data.expectedHarvestDate : existing.expectedHarvestDate,
      farmArea: data.farmArea !== undefined ? new Prisma.Decimal(data.farmArea) : existing.farmArea,
      farmAreaUnit: data.farmAreaUnit !== undefined ? data.farmAreaUnit : existing.farmAreaUnit,
      village: data.village !== undefined ? data.village : existing.village,
      district: data.district !== undefined ? data.district : existing.district,
      state: data.state !== undefined ? data.state : existing.state,
      pincode: data.pincode !== undefined ? data.pincode : existing.pincode,
      status: data.status !== undefined ? data.status : existing.status,
      updatedAt: new Date('2026-09-20T13:00:00.000Z'),
    };
    this.farms[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<Farm> {
    const index = this.farms.findIndex((f) => f.id === id);
    if (index === -1) throw new Error('Not found');
    const deleted = this.farms.splice(index, 1)[0];
    return deleted;
  }
}

async function runFarmUnitTests() {
  console.log('🧪 Running Module 3 Farm Unit Test Suite...\n');
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

  const sampleFarmer: Farmer = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    fullName: 'Ramesh Patil',
    mobileNumber: '9876543210',
    preferredLanguage: 'mr' as any,
    farmerReferenceNumber: 'AGRI-FMR-20260920-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // ---------------------------------------------------------------------------
  // 1. Valid farm registration
  // ---------------------------------------------------------------------------
  try {
    const mockFarmerRepo = new MockFarmerRepository([sampleFarmer]);
    const mockFarmRepo = new MockFarmRepository(mockFarmerRepo);
    const service = new FarmService(mockFarmRepo, mockFarmerRepo);

    const result = await service.registerFarm({
      farmerId: sampleFarmer.id,
      farmName: 'Shivaji Nagar Plot',
      cropName: 'Soybean',
      cropVariety: 'JS 335',
      sowingDate: '2026-06-15',
      expectedHarvestDate: '2026-10-20',
      farmArea: 4.5,
      farmAreaUnit: AreaUnit.ACRE,
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
      status: FarmStatus.ACTIVE,
    });

    assert(result.farmName === 'Shivaji Nagar Plot', '1.1 Farm registered with correct farm name');
    assert(result.cropName === 'Soybean', '1.2 Farm crop name is Soybean');
    assert(result.farmArea === 4.5, '1.3 Farm area is 4.5');
    assert(result.farmAreaUnit === AreaUnit.ACRE, '1.4 Farm area unit is ACRE');
    assert(result.status === FarmStatus.ACTIVE, '1.5 Farm status is ACTIVE');
    assert(result.sowingDate === '2026-06-15', '1.6 Sowing date formatted correctly');
    assert(result.expectedHarvestDate === '2026-10-20', '1.7 Expected harvest date formatted correctly');
    assert(result.farmer?.id === sampleFarmer.id, '1.8 Farmer link populated on response');
  } catch (err) {
    assert(false, `1. Valid farm registration failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 2. Missing/Invalid farmer (404 Not Found)
  // ---------------------------------------------------------------------------
  try {
    const mockFarmerRepo = new MockFarmerRepository([]);
    const mockFarmRepo = new MockFarmRepository(mockFarmerRepo);
    const service = new FarmService(mockFarmRepo, mockFarmerRepo);

    let caught404 = false;
    try {
      await service.registerFarm({
        farmerId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22',
        farmName: 'Ghost Plot',
        cropName: 'Wheat',
        sowingDate: '2026-11-01',
        farmArea: 2.0,
        village: 'Koregaon',
        district: 'Satara',
        state: 'Maharashtra',
        pincode: '415501',
      });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) {
        caught404 = true;
        assert(err.message.includes('not found'), '2.1 Error message specifies farmer not found');
      }
    }
    assert(caught404, '2.2 Service throws 404 when farmerId does not exist');
  } catch (err) {
    assert(false, `2. Missing farmer check failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 3. Invalid farmer UUID
  // ---------------------------------------------------------------------------
  try {
    const parsed = createFarmSchema.safeParse({
      farmerId: 'not-a-valid-uuid',
      farmName: 'Test Plot',
      cropName: 'Rice',
      sowingDate: '2026-07-01',
      farmArea: 3,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '400001',
    });
    assert(!parsed.success, '3.1 Rejects invalid farmerId UUID string');
    if (!parsed.success) {
      assert(parsed.error.errors[0]?.message.includes('valid UUID'), '3.2 Error specifies valid UUID required');
    }
  } catch (err) {
    assert(false, `3. Invalid farmer UUID validation failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 4. Invalid farm name (<2 chars or missing)
  // ---------------------------------------------------------------------------
  try {
    const tooShort = createFarmSchema.safeParse({
      farmerId: sampleFarmer.id,
      farmName: 'A',
      cropName: 'Rice',
      sowingDate: '2026-07-01',
      farmArea: 3,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '400001',
    });
    assert(!tooShort.success, '4.1 Rejects farm name shorter than 2 characters');

    const missing = createFarmSchema.safeParse({
      farmerId: sampleFarmer.id,
      cropName: 'Rice',
      sowingDate: '2026-07-01',
      farmArea: 3,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '400001',
    });
    assert(!missing.success, '4.2 Rejects missing farm name');
  } catch (err) {
    assert(false, `4. Invalid farm name validation failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 5. Invalid crop name
  // ---------------------------------------------------------------------------
  try {
    const emptyCrop = createFarmSchema.safeParse({
      farmerId: sampleFarmer.id,
      farmName: 'My Farm',
      cropName: 'X',
      sowingDate: '2026-07-01',
      farmArea: 3,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '400001',
    });
    assert(!emptyCrop.success, '5.1 Rejects crop name shorter than 2 characters');
  } catch (err) {
    assert(false, `5. Invalid crop name validation failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 6. Invalid farm area (<=0 or >10000)
  // ---------------------------------------------------------------------------
  try {
    const zeroArea = createFarmSchema.safeParse({
      farmerId: sampleFarmer.id,
      farmName: 'My Farm',
      cropName: 'Wheat',
      sowingDate: '2026-07-01',
      farmArea: 0,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '400001',
    });
    assert(!zeroArea.success, '6.1 Rejects farm area of 0');

    const negativeArea = createFarmSchema.safeParse({
      farmerId: sampleFarmer.id,
      farmName: 'My Farm',
      cropName: 'Wheat',
      sowingDate: '2026-07-01',
      farmArea: -5,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '400001',
    });
    assert(!negativeArea.success, '6.2 Rejects negative farm area');

    const tooLarge = createFarmSchema.safeParse({
      farmerId: sampleFarmer.id,
      farmName: 'My Farm',
      cropName: 'Wheat',
      sowingDate: '2026-07-01',
      farmArea: 10001,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '400001',
    });
    assert(!tooLarge.success, '6.3 Rejects farm area exceeding 10,000 units');
  } catch (err) {
    assert(false, `6. Invalid farm area validation failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 7. Invalid area unit
  // ---------------------------------------------------------------------------
  try {
    const invalidUnit = createFarmSchema.safeParse({
      farmerId: sampleFarmer.id,
      farmName: 'My Farm',
      cropName: 'Wheat',
      sowingDate: '2026-07-01',
      farmArea: 5,
      farmAreaUnit: 'SQUARE_MILE',
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '400001',
    });
    assert(!invalidUnit.success, '7.1 Rejects unsupported area unit');
    if (!invalidUnit.success) {
      assert(invalidUnit.error.errors[0]?.message.includes('Invalid area unit'), '7.2 Error lists supported units');
    }
  } catch (err) {
    assert(false, `7. Invalid area unit validation failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 8. Invalid pincode (Indian PIN code format /^[1-9][0-9]{5}$/)
  // ---------------------------------------------------------------------------
  try {
    const invalidPins = ['012345', '40000', '4000001', '40000A'];
    let allRejected = true;
    for (const pin of invalidPins) {
      const res = createFarmSchema.safeParse({
        farmerId: sampleFarmer.id,
        farmName: 'My Farm',
        cropName: 'Wheat',
        sowingDate: '2026-07-01',
        farmArea: 5,
        village: 'Village',
        district: 'District',
        state: 'State',
        pincode: pin,
      });
      if (res.success) allRejected = false;
    }
    assert(allRejected, '8.1 Rejects non-6-digit or malformed Indian PIN codes');

    const validPin = createFarmSchema.safeParse({
      farmerId: sampleFarmer.id,
      farmName: 'My Farm',
      cropName: 'Wheat',
      sowingDate: '2026-07-01',
      farmArea: 5,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '413102',
    });
    assert(validPin.success, '8.2 Accepts valid 6-digit Indian PIN code (413102)');
  } catch (err) {
    assert(false, `8. Invalid pincode validation failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 9. Harvest date before sowing date
  // ---------------------------------------------------------------------------
  try {
    // 9a: Create validation schema rejection
    const invalidDateOrder = createFarmSchema.safeParse({
      farmerId: sampleFarmer.id,
      farmName: 'My Farm',
      cropName: 'Wheat',
      sowingDate: '2026-06-15',
      expectedHarvestDate: '2026-05-10', // Prior to sowing
      farmArea: 5,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '413102',
    });
    assert(!invalidDateOrder.success, '9.1 Schema rejects expectedHarvestDate prior to sowingDate');

    // 9b: Service level check during update
    const mockFarmerRepo = new MockFarmerRepository([sampleFarmer]);
    const mockFarmRepo = new MockFarmRepository(mockFarmerRepo);
    const service = new FarmService(mockFarmRepo, mockFarmerRepo);

    const farm = await service.registerFarm({
      farmerId: sampleFarmer.id,
      farmName: 'Date Test Farm',
      cropName: 'Cotton',
      sowingDate: '2026-06-01',
      farmArea: 2.0,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '413102',
    });

    let patchCaught = false;
    try {
      await service.updateFarm(farm.id, {
        expectedHarvestDate: '2026-05-01', // Earlier than existing sowingDate 2026-06-01
      });
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 400) {
        patchCaught = true;
        assert(err.message.includes('on or after sowing date'), '9.2 Service PATCH rejects harvest date before sowing date');
      }
    }
    assert(patchCaught, '9.3 Throws 400 Bad Request on cross-field date violation during PATCH');
  } catch (err) {
    assert(false, `9. Date order validation failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 10. Farm reference auto-generation
  // ---------------------------------------------------------------------------
  try {
    const mockFarmerRepo = new MockFarmerRepository([sampleFarmer]);
    const mockFarmRepo = new MockFarmRepository(mockFarmerRepo);
    const service = new FarmService(mockFarmRepo, mockFarmerRepo);

    const generatedRef = await service.generateUniqueReferenceNumber();
    const pattern = /^AGRI-FRM-\d{8}-[A-F0-9]{4}$/;
    assert(pattern.test(generatedRef), `10.1 Generated reference '${generatedRef}' matches AGRI-FRM-<YYYYMMDD>-<HEX4> pattern`);

    const farm = await service.registerFarm({
      farmerId: sampleFarmer.id,
      farmName: 'Ref Test Farm',
      cropName: 'Cotton',
      sowingDate: '2026-06-01',
      farmArea: 2.0,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '413102',
    });
    assert(pattern.test(farm.farmReferenceNumber), '10.2 Registered farm automatically assigned valid reference number');
  } catch (err) {
    assert(false, `10. Reference auto-generation failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 11. Duplicate farm reference conflict / collision retry
  // ---------------------------------------------------------------------------
  try {
    const mockFarmerRepo = new MockFarmerRepository([sampleFarmer]);
    const mockFarmRepo = new MockFarmRepository(mockFarmerRepo);
    const service = new FarmService(mockFarmRepo, mockFarmerRepo);

    // Mock existing reference collision on first lookup
    let lookups = 0;
    mockFarmRepo.findByReferenceNumber = async (ref: string) => {
      lookups++;
      if (lookups === 1) {
        // First candidate collided
        return { id: 'dummy-id', farmReferenceNumber: ref } as any;
      }
      return null;
    };

    const ref = await service.generateUniqueReferenceNumber();
    assert(lookups >= 2, '11.1 Reference generation retried upon finding an existing candidate');
    assert(typeof ref === 'string' && ref.startsWith('AGRI-FRM-'), '11.2 Valid reference generated following collision retry');
  } catch (err) {
    assert(false, `11. Duplicate reference collision test failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 12. Get farm by ID
  // ---------------------------------------------------------------------------
  try {
    const mockFarmerRepo = new MockFarmerRepository([sampleFarmer]);
    const mockFarmRepo = new MockFarmRepository(mockFarmerRepo);
    const service = new FarmService(mockFarmRepo, mockFarmerRepo);

    const created = await service.registerFarm({
      farmerId: sampleFarmer.id,
      farmName: 'Retrieve Plot',
      cropName: 'Maize',
      sowingDate: '2026-05-15',
      farmArea: 3.5,
      village: 'Khed',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '410501',
    });

    const retrieved = await service.getFarmById(created.id);
    assert(retrieved.id === created.id, '12.1 Retrieved farm matches registered UUID');
    assert(retrieved.farmName === 'Retrieve Plot', '12.2 Retrieved farm matches farm name');
    assert(retrieved.cropName === 'Maize', '12.3 Retrieved farm matches crop');
  } catch (err) {
    assert(false, `12. Get farm by ID failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 13. Get farmer farms
  // ---------------------------------------------------------------------------
  try {
    const mockFarmerRepo = new MockFarmerRepository([sampleFarmer]);
    const mockFarmRepo = new MockFarmRepository(mockFarmerRepo);
    const service = new FarmService(mockFarmRepo, mockFarmerRepo);

    await service.registerFarm({
      farmerId: sampleFarmer.id,
      farmName: 'Farm Alpha',
      cropName: 'Sugarcane',
      sowingDate: '2026-01-10',
      farmArea: 5.0,
      village: 'Village A',
      district: 'District',
      state: 'State',
      pincode: '413102',
    });

    const farmerFarms = await service.getFarmsByFarmerId(sampleFarmer.id);
    assert(farmerFarms.length >= 1, '13.1 Retrieved farms belonging to farmer');
    assert(farmerFarms[0].farmerId === sampleFarmer.id, '13.2 Returned farm belongs to queried farmerId');

    // Query for non-existent farmer
    let nonExistentFarmerCaught = false;
    try {
      await service.getFarmsByFarmerId('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22');
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) {
        nonExistentFarmerCaught = true;
      }
    }
    assert(nonExistentFarmerCaught, '13.3 Returns 404 when querying farms for non-existent farmer');
  } catch (err) {
    assert(false, `13. Get farmer farms failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 14. Patch/update farm
  // ---------------------------------------------------------------------------
  try {
    const mockFarmerRepo = new MockFarmerRepository([sampleFarmer]);
    const mockFarmRepo = new MockFarmRepository(mockFarmerRepo);
    const service = new FarmService(mockFarmRepo, mockFarmerRepo);

    const created = await service.registerFarm({
      farmerId: sampleFarmer.id,
      farmName: 'Initial Farm',
      cropName: 'Paddy',
      sowingDate: '2026-06-01',
      farmArea: 2.5,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '413102',
      status: FarmStatus.ACTIVE,
    });

    const updated = await service.updateFarm(created.id, {
      farmName: 'Updated Farm Name',
      farmArea: 3.0,
      status: FarmStatus.HARVESTED,
    });

    assert(updated.farmName === 'Updated Farm Name', '14.1 Farm name updated');
    assert(updated.farmArea === 3.0, '14.2 Farm area updated');
    assert(updated.status === FarmStatus.HARVESTED, '14.3 Farm status updated to HARVESTED');
    assert(updated.cropName === 'Paddy', '14.4 Unmodified crop name preserved');
  } catch (err) {
    assert(false, `14. Patch/update farm failed: ${(err as Error).message}`);
  }

  // ---------------------------------------------------------------------------
  // 15. Delete farm
  // ---------------------------------------------------------------------------
  try {
    const mockFarmerRepo = new MockFarmerRepository([sampleFarmer]);
    const mockFarmRepo = new MockFarmRepository(mockFarmerRepo);
    const service = new FarmService(mockFarmRepo, mockFarmerRepo);

    const created = await service.registerFarm({
      farmerId: sampleFarmer.id,
      farmName: 'To Be Deleted Farm',
      cropName: 'Wheat',
      sowingDate: '2026-06-01',
      farmArea: 1.0,
      village: 'Village',
      district: 'District',
      state: 'State',
      pincode: '413102',
    });

    const deleteResult = await service.deleteFarm(created.id);
    assert(deleteResult.id === created.id, '15.1 Delete returns deleted farm ID');

    let deletedLookupCaught = false;
    try {
      await service.getFarmById(created.id);
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 404) {
        deletedLookupCaught = true;
      }
    }
    assert(deletedLookupCaught, '15.2 Deleted farm is no longer retrievable (404)');
  } catch (err) {
    assert(false, `15. Delete farm failed: ${(err as Error).message}`);
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

runFarmUnitTests().catch((error) => {
  console.error('Fatal error during test run:', error);
  process.exit(1);
});
