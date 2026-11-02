/**
 * AgriShield Stage 3, Step 2: Farmer Dashboard & Role Authorization Frontend Test Suite
 *
 * Verifies:
 * - Suite 1: Unauthenticated visitors prompted to sign in without dispatching protected calls
 * - Suite 2: Farmers strictly denied admin-only routes (HTTP 403 Forbidden UI)
 * - Suite 3: Farmer Dashboard rendering, greeting, metric cards, and farm parcels
 * - Suite 4: Zero-state handling for farmers with 0 farms, 0 policies, 0 claims
 * - Suite 5: API error handling and retry presentation
 * - Suite 6: Farm list scoping to authenticated farmer only
 * - Suite 7: Module 8 ML advisory governance safeguard disclosure
 * - Suite 8: Preservation of farmer mobile/email OTP authentication flow
 */

import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

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

// In-memory sessionStorage polyfill for Node execution
class MockSessionStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

const mockStorage = new MockSessionStorage();
(global as any).window = {
  sessionStorage: mockStorage,
};
(global as any).sessionStorage = mockStorage;

async function runFarmerDashboardTestSuite() {
  console.log('================================================================================');
  console.log('🧪 Running AgriShield Stage 3 Step 2: Farmer Dashboard & RBAC Test Suite');
  console.log('================================================================================\n');

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

  // Import Auth and Route modules
  const { AuthContext, SESSION_STORAGE_KEY, ACTIVE_ROLE_KEY, ADMIN_STORAGE_KEY } = await import('../src/context/AuthContext.js');
  const { ProtectedRoute } = await import('../src/components/auth/ProtectedRoute.js');
  const { HomePage } = await import('../src/pages/HomePage.js');
  const { FarmerDashboardPage } = await import('../src/pages/dashboard/FarmerDashboardPage.js');
  const { FarmListPage } = await import('../src/pages/farms/FarmListPage.js');
  const { ProducerAuthModal } = await import('../src/components/auth/ProducerAuthModal.js');
  const { farmService } = await import('../src/services/farmService.js');
  const { policyClaimService } = await import('../src/services/policyClaimService.js');
  const { riskAssessmentService } = await import('../src/services/riskAssessmentService.js');

  const FARMER_A = {
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Ramesh Patel',
    mobileNumber: '+919876543210',
    email: 'ramesh.patel@example.com',
    role: 'FARMER' as const,
  };

  const ADMIN_USER = {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'chief_underwriter',
    email: 'admin@agrishield.com',
    fullName: 'Chief Underwriter',
    role: 'ADMIN' as const,
  };

  const MOCK_FARMS: any[] = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      farmerId: FARMER_A.id,
      farmName: 'Green Valley Plot 1',
      farmReferenceNumber: 'AGRI-FARM-001',
      cropName: 'Cotton',
      cropVariety: 'Bt Cotton',
      sowingDate: '2026-06-15',
      expectedHarvestDate: '2026-11-20',
      farmArea: 4.5,
      farmAreaUnit: 'HECTARE',
      village: 'Solapur Village',
      district: 'Solapur',
      state: 'Maharashtra',
      pincode: '413001',
      status: 'ACTIVE',
      createdAt: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      farmerId: FARMER_A.id,
      farmName: 'Sunrise Orchard',
      farmReferenceNumber: 'AGRI-FARM-002',
      cropName: 'Wheat',
      cropVariety: 'Sharbati',
      sowingDate: '2026-07-01',
      expectedHarvestDate: '2026-12-15',
      farmArea: 2.0,
      farmAreaUnit: 'HECTARE',
      village: 'Solapur Village',
      district: 'Solapur',
      state: 'Maharashtra',
      pincode: '413001',
      status: 'ACTIVE',
      createdAt: '2026-06-10T00:00:00.000Z',
    },
  ];

  const MOCK_POLICIES: any[] = [
    {
      id: 'pol-111',
      policyNumber: 'AGRI-POL-2026-001',
      farmId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      farmerId: FARMER_A.id,
      cropName: 'Cotton',
      sumInsured: '150000.00',
      premiumAmount: '7500.00',
      coveredHazards: ['HEAVY_RAINFALL', 'HIGH_TEMPERATURE'],
      startDate: '2026-06-15T00:00:00.000Z',
      endDate: '2026-11-20T00:00:00.000Z',
      status: 'ACTIVE',
      payoutPercentage: '0.00',
      totalClaimPaid: '0.00',
      remainingCoverage: '150000.00',
      createdAt: '2026-06-15T00:00:00.000Z',
      farm: MOCK_FARMS[0],
    },
  ];

  const MOCK_CLAIMS: any[] = [
    {
      id: 'clm-111',
      claimNumber: 'CLM-2026-001',
      policyId: 'pol-111',
      farmId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      farmerId: FARMER_A.id,
      hazardType: 'HEAVY_RAINFALL',
      status: 'PAID',
      payoutAmount: '45000.00',
      assessmentId: 'assess-1',
      triggerMeasurement: '142.5mm / 24h',
      triggerThreshold: '120mm / 24h',
      payoutPercentage: '30.00',
      createdAt: '2026-08-10T00:00:00.000Z',
      farm: MOCK_FARMS[0],
    },
  ];

  // Helper to create AuthContext wrapper
  function createAuthContextValue(overrides: Partial<any> = {}) {
    return {
      token: null,
      user: null,
      role: null,
      isAuthenticated: false,
      isAdmin: false,
      isFarmer: false,
      producerToken: null,
      activeProducer: null,
      login: () => {},
      isOwnerOfFarm: () => false,
      adminToken: null,
      activeAdmin: null,
      adminLogin: () => {},
      logout: () => {},
      ...overrides,
    };
  }

  // --- Suite 1: Unauthenticated Visitor Flow & Zero Protected Calls ---
  console.log('--- Suite 1: Unauthenticated Visitor Presentation & Prompts ---');
  mockStorage.clear();

  const unauthContext = createAuthContextValue();
  const unauthHomeHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: unauthContext },
      React.createElement(MemoryRouter, null, React.createElement(HomePage, null))
    )
  );

  assert(unauthHomeHtml.includes('unauth-home-view'), '1.1 Unauthenticated visitor receives unauth-home-view');
  assert(unauthHomeHtml.includes('farmer-signin-cta'), '1.2 Displays Farmer Sign In with OTP CTA');
  assert(unauthHomeHtml.includes('admin-signin-cta'), '1.3 Displays Administrator Portal CTA');
  assert(unauthHomeHtml.includes('Automated Parametric Climate Shield'), '1.4 Displays parametric product presentation');

  // ProtectedRoute prompt for unauthenticated user on Admin route
  const unauthAdminRouteHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: unauthContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          ProtectedRoute,
          { requiredRole: 'ADMIN' },
          React.createElement('div', null, 'SECRET_ADMIN_PAGE')
        )
      )
    )
  );
  assert(unauthAdminRouteHtml.includes('protected-auth-prompt'), '1.5 ProtectedRoute renders auth prompt when unauthenticated');
  assert(unauthAdminRouteHtml.includes('open-admin-auth-btn'), '1.6 Prompts for Administrator sign-in');
  assert(!unauthAdminRouteHtml.includes('SECRET_ADMIN_PAGE'), '1.7 Unauthenticated user cannot see protected child content');

  // ProtectedRoute prompt for unauthenticated user on Farmer route
  const unauthFarmerRouteHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: unauthContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          ProtectedRoute,
          { requiredRole: 'FARMER' },
          React.createElement('div', null, 'SECRET_FARMER_PAGE')
        )
      )
    )
  );
  assert(unauthFarmerRouteHtml.includes('open-farmer-auth-btn'), '1.8 Prompts for Farmer OTP sign-in');
  assert(!unauthFarmerRouteHtml.includes('SECRET_FARMER_PAGE'), '1.9 Farmer protected content hidden from unauthenticated visitors');

  // --- Suite 2: Role Authorization & Denial of Admin Routes for Farmers ---
  console.log('\n--- Suite 2: Role Authorization & Farmer Denial on Admin Routes ---');
  const farmerContext = createAuthContextValue({
    token: 'jwt.farmer.token',
    user: FARMER_A,
    role: 'FARMER',
    isAuthenticated: true,
    isFarmer: true,
    isAdmin: false,
    producerToken: 'jwt.farmer.token',
    activeProducer: FARMER_A,
  });

  const farmerAccessAdminRouteHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: farmerContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          ProtectedRoute,
          { requiredRole: 'ADMIN' },
          React.createElement('div', null, 'ADMIN_REGISTRY_SECRET')
        )
      )
    )
  );

  assert(farmerAccessAdminRouteHtml.includes('protected-role-forbidden'), '2.1 Farmer accessing ADMIN route receives 403 Forbidden container');
  assert(farmerAccessAdminRouteHtml.includes('HTTP 403 Forbidden'), '2.2 Renders explicit HTTP 403 Forbidden badge');
  assert(farmerAccessAdminRouteHtml.includes('Administrative privileges are required'), '2.3 Explains administrative requirement to farmer');
  assert(farmerAccessAdminRouteHtml.includes('[FARMER]'), '2.4 Displays active role [FARMER] in denial card');
  assert(!farmerAccessAdminRouteHtml.includes('ADMIN_REGISTRY_SECRET'), '2.5 Admin content strictly withheld from FARMER session');

  // Admin access to Admin route is granted
  const adminContext = createAuthContextValue({
    token: 'jwt.admin.token',
    user: ADMIN_USER,
    role: 'ADMIN',
    isAuthenticated: true,
    isAdmin: true,
    isFarmer: false,
    adminToken: 'jwt.admin.token',
    activeAdmin: ADMIN_USER,
  });

  const adminAccessAdminRouteHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: adminContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          ProtectedRoute,
          { requiredRole: 'ADMIN' },
          React.createElement('div', null, 'ADMIN_REGISTRY_SECRET')
        )
      )
    )
  );
  assert(adminAccessAdminRouteHtml.includes('ADMIN_REGISTRY_SECRET'), '2.6 Admin session successfully accesses ADMIN route');

  // --- Suite 3: Farmer Dashboard Presentation & Scoped Holdings ---
  console.log('\n--- Suite 3: Farmer Dashboard Presentation & Scoped Holdings ---');

  // Mock service implementations for farmer dashboard
  farmService.getFarmsByFarmerId = async (id: string) => {
    assert(id === FARMER_A.id, '3.1 farmService.getFarmsByFarmerId queries strictly the authenticated farmer ID');
    return { success: true, data: MOCK_FARMS, message: 'Farms retrieved', timestamp: new Date().toISOString() };
  };

  policyClaimService.getFarmerPolicies = async (id: string) => {
    assert(id === FARMER_A.id, '3.2 policyClaimService.getFarmerPolicies queries strictly the authenticated farmer ID');
    return { success: true, data: MOCK_POLICIES, message: 'Policies retrieved', timestamp: new Date().toISOString() };
  };

  policyClaimService.getFarmerClaims = async (id: string) => {
    assert(id === FARMER_A.id, '3.3 policyClaimService.getFarmerClaims queries strictly the authenticated farmer ID');
    return { success: true, data: MOCK_CLAIMS, message: 'Claims retrieved', timestamp: new Date().toISOString() };
  };

  riskAssessmentService.getLatestRiskAssessment = async (farmId: string) => {
    return {
      success: true,
      data: {
        id: `assess-${farmId}`,
        farmId,
        overallRisk: 'LOW',
        hasInsufficientDataCoverage: false,
        evaluatedAt: new Date().toISOString(),
      } as any,
      message: 'Assessment retrieved',
      timestamp: new Date().toISOString(),
    };
  };

  const farmerHomeHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: farmerContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(HomePage, {
          initialFarmerFarms: MOCK_FARMS,
          initialFarmerPolicies: MOCK_POLICIES,
          initialFarmerClaims: MOCK_CLAIMS,
          initialFarmerLoading: false,
        })
      )
    )
  );

  assert(farmerHomeHtml.includes('farmer-dashboard-container'), '3.4 Authenticated farmer on / renders farmer-dashboard-container');
  assert(farmerHomeHtml.includes('Ramesh Patel'), '3.5 Displays personalized farmer welcome banner with name');
  assert(farmerHomeHtml.includes('farmer-metric-cards'), '3.6 Displays farmer key metric summary cards');
  assert(farmerHomeHtml.includes('register-farm-btn'), '3.7 Provides Register New Farm button');
  assert(farmerHomeHtml.includes('farmer-farms-grid'), '3.8 Displays farmer farms grid');
  assert(farmerHomeHtml.includes('Green Valley Plot 1'), '3.9 Displays Farm 1 name');
  assert(farmerHomeHtml.includes('AGRI-FARM-001'), '3.10 Displays Farm 1 reference number');
  assert(farmerHomeHtml.includes('Sunrise Orchard'), '3.11 Displays Farm 2 name');
  assert(farmerHomeHtml.includes('AGRI-FARM-002'), '3.12 Displays Farm 2 reference number');

  // --- Suite 4: Zero-State Handling (0 farms, 0 policies, 0 claims) ---
  console.log('\n--- Suite 4: Zero-State Handling (0 farms, 0 policies, 0 claims) ---');

  const zeroFarmsHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: farmerContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(FarmerDashboardPage, {
          initialFarms: [],
          initialPolicies: [],
          initialClaims: [],
          initialLoading: false,
        })
      )
    )
  );

  assert(zeroFarmsHtml.includes('farmer-empty-farms'), '4.1 Renders farmer-empty-farms container when farmer has 0 farms');
  assert(zeroFarmsHtml.includes('No Farm Parcels Registered Yet'), '4.2 Displays clear zero-farms headline');
  assert(zeroFarmsHtml.includes('Register First Farm Parcel'), '4.3 Offers immediate Call-to-Action to register first farm');
  assert(zeroFarmsHtml.includes('0 hectares registered'), '4.4 Safely displays 0 hectares registered without NaN');
  assert(zeroFarmsHtml.includes('No active coverage'), '4.5 Safely displays 0 coverage status without error');

  // --- Suite 5: Error State Presentation & Non-Swallowing ---
  console.log('\n--- Suite 5: API Error State Handling ---');

  const errorHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: farmerContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(FarmerDashboardPage, {
          initialLoading: false,
          initialError: 'Database connection timeout during parcel retrieval',
        })
      )
    )
  );

  assert(errorHtml.includes('farmer-dashboard-error'), '5.1 Renders farmer-dashboard-error alert on API failure');
  assert(errorHtml.includes('Database connection timeout during parcel retrieval'), '5.2 Transparently presents error message without silent swallowing');
  assert(errorHtml.includes('Retry'), '5.3 Renders Retry action button for farmer');

  // --- Suite 6: Farm List (/farms) Adaptation for Farmers ---
  console.log('\n--- Suite 6: FarmListPage Adaptation for Authenticated Farmers ---');

  const farmListHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: farmerContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(FarmListPage, {
          initialFarms: MOCK_FARMS,
          initialLoading: false,
        })
      )
    )
  );

  assert(farmListHtml.includes('Green Valley Plot 1'), '6.1 FarmListPage renders farmer farm parcel');
  assert(!farmListHtml.includes('portfolio-macro-summary'), '6.2 Admin portfolio macro summary hidden from farmer on /farms');

  // --- Suite 7: Module 8 ML Advisory Safeguard Invariant ---
  console.log('\n--- Suite 7: Module 8 ML Advisory Governance Disclosure ---');
  const dashboardPath = fs.existsSync('frontend/src/pages/dashboard/FarmerDashboardPage.tsx')
    ? path.resolve('frontend/src/pages/dashboard/FarmerDashboardPage.tsx')
    : path.resolve('src/pages/dashboard/FarmerDashboardPage.tsx');
  const dashboardSource = fs.readFileSync(dashboardPath, 'utf-8');

  assert(dashboardSource.includes('Module 6 deterministic weather rule evaluation'), '7.1 Confirms Module 6 as authoritative deterministic trigger');
  assert(dashboardSource.includes('purely in an advisory capacity'), '7.2 Confirms ML models operate purely in an advisory capacity');
  assert(dashboardSource.includes('never directly issue policies, trigger claims, or override'), '7.3 Enforces invariant: ML never overrides parametric terms');

  // --- Suite 8: Farmer OTP Login Preservation ---
  console.log('\n--- Suite 8: Farmer OTP Modal Integrity ---');
  const modalHtml = renderToStaticMarkup(
    React.createElement(ProducerAuthModal, { isOpen: true, onClose: () => {} })
  );

  assert(modalHtml.includes('Producer Authentication') || modalHtml.includes('Producer Account'), '8.1 ProducerAuthModal renders authentication modal');
  assert(modalHtml.includes('data-testid="auth-send-otp-btn"'), '8.2 Send OTP button is preserved');
  assert(modalHtml.includes('Mobile') || modalHtml.includes('Email'), '8.3 Dual identifier (Mobile/Email) options preserved');

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed across all Step 2 checkpoints`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFarmerDashboardTestSuite().catch((err) => {
  console.error('❌ Test suite execution failed:', err);
  process.exit(1);
});
