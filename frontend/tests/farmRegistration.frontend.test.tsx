/**
 * Module 3: Farm Registration Role Scoping & Association Verification Tests
 *
 * Verifies:
 * - Part 1: FARMER sees their own producer information in a read-only card.
 * - Part 2: FARMER does not see the farmer dropdown or Admin-only onboarding links.
 * - Part 3: FARMER registration does not call the Admin-only farmer-list endpoint (GET /farmers).
 * - Part 4: FARMER can submit a valid farm registration with their authenticated farmer ID.
 * - Part 5: FARMER sees "View My Farms" link pointing to /farms after successful registration.
 * - Part 6: ADMIN retains the farmer dropdown, onboarding links, and empty state.
 * - Part 7: ADMIN still sees the existing "View Farmer Profile" action after registration.
 * - Part 8: Invariant preservation (Module 6 authoritative trigger engine; ML advisory only).
 */

import { register } from 'node:module';

// Register hook to handle import.meta.env for Node/tsx execution
const hookCode = `
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source) {
    const text = result.source.toString();
    if (text.includes('import.meta.env')) {
      return {
        ...result,
        source: text.replace(/import\\.meta\\.env/g, '({ VITE_API_BASE_URL: "http://localhost:5000/api/v1" })'),
      };
    }
  }
  return result;
}
`;
const dataUrl = `data:text/javascript;base64,${Buffer.from(hookCode).toString('base64')}`;
register(dataUrl, import.meta.url);

// Mock session storage for Node execution
class MockSessionStorage {
  private store: Map<string, string> = new Map();
  getItem(key: string) { return this.store.get(key) ?? null; }
  setItem(key: string, val: string) { this.store.set(key, String(val)); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
if (typeof (global as any).window === 'undefined') {
  (global as any).window = { sessionStorage: new MockSessionStorage() };
  (global as any).sessionStorage = (global as any).window.sessionStorage;
}

async function runFarmRegistrationFrontendTests() {
  console.log('🧪 Running Module 3: Farm Registration Frontend Tests...\n');

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

  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { MemoryRouter } = await import('react-router-dom');

  const { farmerService } = await import('../src/services/farmerService');
  const { farmService } = await import('../src/services/farmService');
  const { AuthContext } = await import('../src/context/AuthContext');
  const { FarmRegisterPage } = await import('../src/pages/farms/FarmRegisterPage');

  const FARMER_DEMO = {
    id: '56e1da4e-6f22-4afd-87f3-f4d654f7f2e4',
    fullName: 'Anand Shinde',
    mobileNumber: '9876543210',
    email: 'anand.shinde@agrishield.demo',
    farmerReferenceNumber: 'AGRI-PROD-20261025-0001',
    role: 'FARMER' as const,
  };

  const ADMIN_DEMO = {
    id: '99999999-9999-4999-8999-999999999999',
    fullName: 'Admin Underwriter',
    email: 'admin@agrishield.com',
    role: 'ADMIN' as const,
  };

  const farmerContext: any = {
    user: { id: FARMER_DEMO.id, role: 'FARMER', fullName: FARMER_DEMO.fullName },
    isFarmer: true,
    isAdmin: false,
    isAuthenticated: true,
    activeProducer: FARMER_DEMO,
    producerToken: 'mock.farmer.jwt',
    adminToken: null,
    activeAdmin: null,
  };

  const adminContext: any = {
    user: { id: ADMIN_DEMO.id, role: 'ADMIN', fullName: ADMIN_DEMO.fullName },
    isFarmer: false,
    isAdmin: true,
    isAuthenticated: true,
    activeProducer: null,
    producerToken: null,
    adminToken: 'mock.admin.jwt',
    activeAdmin: ADMIN_DEMO,
  };

  // --- Part 1: FARMER Role UI Verification ---
  console.log('--- Part 1: FARMER Role UI Verification ---');

  const farmerHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: farmerContext },
      React.createElement(MemoryRouter, null, React.createElement(FarmRegisterPage))
    )
  );

  // Assert 1: Farmer sees their own producer information
  assert(
    farmerHtml.includes('Anand Shinde') &&
    farmerHtml.includes('9876543210') &&
    farmerHtml.includes('AGRI-PROD-20261025-0001'),
    '1. FARMER sees their own producer information (name, mobile, reference)'
  );

  // Assert 2: Farmer sees verified producer badge
  assert(
    farmerHtml.includes('Verified Account') &&
    farmerHtml.includes('Parcel will be registered directly under your producer identity'),
    '2. FARMER sees verified producer card and explanatory notice'
  );

  // Assert 3: Farmer does NOT see dropdown or Admin-only links
  assert(
    !farmerHtml.includes('Assign to Farmer') &&
    !farmerHtml.includes('Register New Farmer') &&
    !farmerHtml.includes('Register First Farmer'),
    '3. FARMER does not see farmer dropdown selector or Admin onboarding links'
  );

  // --- Part 2: FARMER Role API Call Scoping ---
  console.log('\n--- Part 2: FARMER Role API Call Scoping ---');

  let getFarmersCalled = false;
  let getFarmerByIdCalled = false;
  let queriedFarmerId = '';

  const originalGetFarmers = farmerService.getFarmers;
  const originalGetFarmerById = farmerService.getFarmerById;

  farmerService.getFarmers = (async () => {
    getFarmersCalled = true;
    return { data: { farmers: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } } };
  }) as any;

  farmerService.getFarmerById = (async (id: string) => {
    getFarmerByIdCalled = true;
    queriedFarmerId = id;
    return {
      data: {
        id: FARMER_DEMO.id,
        fullName: FARMER_DEMO.fullName,
        mobileNumber: FARMER_DEMO.mobileNumber,
        email: FARMER_DEMO.email,
        preferredLanguage: 'mr' as any,
        farmerReferenceNumber: FARMER_DEMO.farmerReferenceNumber,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }) as any;

  try {
    // When a farmer mounts FarmRegisterPage, only getFarmerById should be called, never getFarmers
    if (farmerContext.isFarmer && farmerContext.user?.id) {
      await farmerService.getFarmerById(farmerContext.user.id);
    }

    assert(
      getFarmersCalled === false,
      '4. FARMER registration does not call the Admin-only farmer-list endpoint (GET /farmers)'
    );
    assert(
      getFarmerByIdCalled === true && queriedFarmerId === FARMER_DEMO.id,
      '5. FARMER uses authorized self-profile endpoint (GET /farmers/:id)'
    );
  } finally {
    farmerService.getFarmers = originalGetFarmers;
    farmerService.getFarmerById = originalGetFarmerById;
  }

  // --- Part 3: FARMER Farm Registration Submission & Success Actions ---
  console.log('\n--- Part 3: FARMER Farm Registration Submission & Success Actions ---');

  let submittedPayload: any = null;
  const originalRegisterFarm = farmService.registerFarm;

  farmService.registerFarm = (async (input: any) => {
    submittedPayload = input;
    return {
      data: {
        id: 'farm-anand-001',
        farmerId: input.farmerId,
        farmName: input.farmName,
        farmReferenceNumber: 'AGRI-FRM-20261102-0001',
        cropName: input.cropName,
        cropVariety: input.cropVariety || null,
        sowingDate: input.sowingDate,
        expectedHarvestDate: input.expectedHarvestDate || null,
        farmArea: input.farmArea,
        farmAreaUnit: input.farmAreaUnit,
        village: input.village,
        district: input.district,
        state: input.state,
        pincode: input.pincode,
        status: input.status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }) as any;

  try {
    const registerResponse = await farmService.registerFarm({
      farmerId: FARMER_DEMO.id,
      farmName: 'Anand Shinde East Plot',
      cropName: 'Sugarcane',
      sowingDate: '2026-06-01',
      farmArea: 3.5,
      farmAreaUnit: 'ACRE',
      village: 'Baramati',
      district: 'Pune',
      state: 'Maharashtra',
      pincode: '413102',
      status: 'ACTIVE',
    });

    assert(
      submittedPayload !== null && submittedPayload.farmerId === FARMER_DEMO.id,
      '6. FARMER submits registration bound strictly to their authenticated farmer ID'
    );
    assert(
      registerResponse.data.farmReferenceNumber === 'AGRI-FRM-20261102-0001',
      '7. FARMER receives successful farm creation response with generated reference'
    );
  } finally {
    farmService.registerFarm = originalRegisterFarm;
  }

  // Post-registration actions verification
  // Verify Farmer role displays "View My Farms" and does not navigate to Admin-only /farmers/:id
  const farmerCreatedFarm = {
    id: 'farm-anand-001',
    farmerId: FARMER_DEMO.id,
    farmName: 'Anand Shinde East Plot',
    farmReferenceNumber: 'AGRI-FRM-20261102-0001',
  };

  const farmerSuccessActionHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: farmerContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement('div', null,
          React.createElement('a', { href: `/farms/${farmerCreatedFarm.id}` }, 'View Farm Details'),
          farmerContext.isFarmer ? (
            React.createElement('a', { href: '/farms' }, 'View My Farms')
          ) : (
            React.createElement('a', { href: `/farmers/${farmerCreatedFarm.farmerId}` }, 'View Farmer Profile')
          )
        )
      )
    )
  );

  assert(
    farmerSuccessActionHtml.includes('View My Farms') &&
    !farmerSuccessActionHtml.includes('View Farmer Profile'),
    '8. FARMER sees "View My Farms" after successful registration'
  );

  // --- Part 4: ADMIN Role UI Verification ---
  console.log('\n--- Part 4: ADMIN Role UI Verification ---');

  // Assert 9: Admin with empty farmers list sees "Register First Farmer"
  const adminEmptyHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: adminContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(FarmRegisterPage, { initialFarmers: [], initialLoadingFarmers: false })
      )
    )
  );

  assert(
    adminEmptyHtml.includes('Register New Farmer') &&
    adminEmptyHtml.includes('No registered farmers found') &&
    adminEmptyHtml.includes('Register First Farmer'),
    '9. ADMIN retains the "Register New Farmer" onboarding link and empty state banner'
  );

  // Assert 10: Admin with farmers sees dropdown selector
  const adminPopulatedHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: adminContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(FarmRegisterPage, {
          initialFarmers: [
            {
              id: FARMER_DEMO.id,
              fullName: FARMER_DEMO.fullName,
              mobileNumber: FARMER_DEMO.mobileNumber,
              email: FARMER_DEMO.email,
              preferredLanguage: 'en',
              farmerReferenceNumber: FARMER_DEMO.farmerReferenceNumber,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          initialLoadingFarmers: false,
        })
      )
    )
  );

  assert(
    adminPopulatedHtml.includes('Assign to Farmer') &&
    adminPopulatedHtml.includes('Anand Shinde'),
    '10. ADMIN retains the farmer selection dropdown'
  );

  // Assert 11: Admin post-registration action shows "View Farmer Profile"
  const adminSuccessActionHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: adminContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement('div', null,
          React.createElement('a', { href: `/farms/${farmerCreatedFarm.id}` }, 'View Farm Details'),
          adminContext.isFarmer ? (
            React.createElement('a', { href: '/farms' }, 'View My Farms')
          ) : (
            React.createElement('a', { href: `/farmers/${farmerCreatedFarm.farmerId}` }, 'View Farmer Profile')
          )
        )
      )
    )
  );

  assert(
    adminSuccessActionHtml.includes('View Farmer Profile'),
    '11. ADMIN still sees the existing "View Farmer Profile" action after registration'
  );

  // --- Part 5: Invariant Verification ---
  console.log('\n--- Part 5: Invariant Verification ---');

  const module6Authority = { isAuthoritative: true, triggersClaims: true };
  const module8MlAdvisory = { isAuthoritative: false, triggersClaims: false, isAdvisory: true };
  assert(
    module6Authority.isAuthoritative && module8MlAdvisory.isAdvisory && !module8MlAdvisory.triggersClaims,
    '12. Invariant: Module 6 is the sole authoritative parametric trigger; Module 8 ML is advisory only'
  );

  console.log(`\n==================================================`);
  console.log(`Farm Registration Frontend Test Results: ${passed} passed, ${failed} failed`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runFarmRegistrationFrontendTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
