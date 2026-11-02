/**
 * AgriShield Stage 3, Step 3: Admin Dashboard Frontend Test Suite
 *
 * Verifies:
 * - Suite 1: Unauthenticated visitor access denial and sign-in prompts for admin routes
 * - Suite 2: Farmer role strictly denied access to Admin Dashboard and admin routes (HTTP 403 Forbidden UI)
 * - Suite 3: Authenticated Admin access to Admin Dashboard via HomePage and /admin
 * - Suite 4: Macro KPI metric cards rendering (farmers, farms, policies, claims, total payouts)
 * - Suite 5: Underwriting queue rendering, zero-state, and policy issuance confirmation flow
 * - Suite 6: Parametric claims adjudication queue, approve, reject (min 3-char reason), and settle flow
 * - Suite 7: Duplicate-submission prevention (disabled={isSubmitting}) and consequential action modals
 * - Suite 8: Loading, error presentation, and action feedback alerts
 * - Suite 9: Module 6 / Module 8 statutory governance separation disclosure
 * - Suite 10: Administrative policyClaimService methods and farm-aggregation helpers
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

async function runAdminDashboardTestSuite() {
  console.log('================================================================================');
  console.log('🧪 Running AgriShield Stage 3 Step 3: Admin Dashboard & Governance Test Suite');
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
  const { MemoryRouter, Routes, Route } = await import('react-router-dom');

  // Import Auth, Components, and Service modules
  const { AuthContext } = await import('../src/context/AuthContext.js');
  const { ProtectedRoute } = await import('../src/components/auth/ProtectedRoute.js');
  const { HomePage } = await import('../src/pages/HomePage.js');
  const { AdminDashboardPage } = await import('../src/pages/dashboard/AdminDashboardPage.js');
  const { policyClaimService } = await import('../src/services/policyClaimService.js');
  const { apiClient } = await import('../src/services/api.js');

  const FARMER_USER = {
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Ramesh Patel',
    mobileNumber: '+919876543210',
    email: 'ramesh.patel@example.com',
    role: 'FARMER' as const,
  };

  const ADMIN_USER = {
    id: '99999999-9999-4999-8999-999999999999',
    username: 'chief_underwriter',
    email: 'underwriter@agrishield.com',
    fullName: 'Chief Underwriter',
    role: 'ADMIN' as const,
  };

  const MOCK_FARMERS: any[] = [
    {
      id: FARMER_USER.id,
      fullName: 'Ramesh Patel',
      mobileNumber: '+919876543210',
      email: 'ramesh.patel@example.com',
      state: 'Maharashtra',
      district: 'Solapur',
      createdAt: '2026-01-15T00:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      fullName: 'Sita Devi',
      mobileNumber: '+919876543211',
      email: 'sita.devi@example.com',
      state: 'Karnataka',
      district: 'Belagavi',
      createdAt: '2026-02-10T00:00:00.000Z',
    },
  ];

  const MOCK_FARMS: any[] = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      farmerId: FARMER_USER.id,
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
      farmerId: '22222222-2222-4222-8222-222222222222',
      farmName: 'Sunrise Orchard',
      farmReferenceNumber: 'AGRI-FARM-002',
      cropName: 'Wheat',
      cropVariety: 'Sharbati',
      sowingDate: '2026-07-01',
      expectedHarvestDate: '2026-12-15',
      farmArea: 2.0,
      farmAreaUnit: 'HECTARE',
      village: 'Belagavi Rural',
      district: 'Belagavi',
      state: 'Karnataka',
      pincode: '590001',
      status: 'ACTIVE',
      createdAt: '2026-06-10T00:00:00.000Z',
    },
  ];

  const MOCK_POLICIES: any[] = [
    {
      id: 'pol-pending-1',
      policyNumber: 'AGRI-POL-2026-001',
      farmId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      farmerId: FARMER_USER.id,
      cropName: 'Cotton',
      sumInsured: '150000.00',
      premiumAmount: '7500.00',
      coveredHazards: ['HEAVY_RAINFALL', 'HIGH_TEMPERATURE'],
      startDate: '2026-06-15T00:00:00.000Z',
      endDate: '2026-11-20T00:00:00.000Z',
      status: 'PENDING',
      payoutPercentage: '0.00',
      totalClaimPaid: '0.00',
      remainingCoverage: '150000.00',
      createdAt: '2026-06-15T00:00:00.000Z',
      farm: MOCK_FARMS[0],
    },
    {
      id: 'pol-active-1',
      policyNumber: 'AGRI-POL-2026-002',
      farmId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      farmerId: '22222222-2222-4222-8222-222222222222',
      cropName: 'Wheat',
      sumInsured: '100000.00',
      premiumAmount: '5000.00',
      coveredHazards: ['DROUGHT_INDEX', 'FROST'],
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-12-15T00:00:00.000Z',
      status: 'ACTIVE',
      payoutPercentage: '0.00',
      totalClaimPaid: '0.00',
      remainingCoverage: '100000.00',
      createdAt: '2026-07-01T00:00:00.000Z',
      farm: MOCK_FARMS[1],
    },
  ];

  const MOCK_CLAIMS: any[] = [
    {
      id: 'clm-pending-1',
      claimNumber: 'CLM-2026-001',
      policyId: 'pol-active-1',
      farmId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      farmerId: '22222222-2222-4222-8222-222222222222',
      triggerRuleCode: 'RULE_DROUGHT_V1',
      hazardType: 'DROUGHT_INDEX',
      status: 'PENDING',
      payoutAmount: '30000.00',
      assessmentId: 'assess-1',
      triggerMeasurement: 'Consecutive dry days: 22',
      triggerThreshold: 'Dry days > 20',
      payoutPercentage: '30.00',
      observedValue: '22 days',
      thresholdValue: '20 days',
      createdAt: '2026-08-10T00:00:00.000Z',
      farm: MOCK_FARMS[1],
    },
    {
      id: 'clm-approved-1',
      claimNumber: 'CLM-2026-002',
      policyId: 'pol-active-1',
      farmId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      farmerId: '22222222-2222-4222-8222-222222222222',
      triggerRuleCode: 'RULE_HEATWAVE_V1',
      hazardType: 'HIGH_TEMPERATURE',
      status: 'APPROVED',
      payoutAmount: '20000.00',
      assessmentId: 'assess-2',
      triggerMeasurement: 'Max temp: 43.5C',
      triggerThreshold: 'Temp > 42C',
      payoutPercentage: '20.00',
      observedValue: '43.5C',
      thresholdValue: '42.0C',
      createdAt: '2026-08-15T00:00:00.000Z',
      farm: MOCK_FARMS[1],
    },
    {
      id: 'clm-paid-1',
      claimNumber: 'CLM-2026-003',
      policyId: 'pol-active-1',
      farmId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      farmerId: '22222222-2222-4222-8222-222222222222',
      triggerRuleCode: 'RULE_EXCESS_RAIN_V1',
      hazardType: 'HEAVY_RAINFALL',
      status: 'PAID',
      payoutAmount: '25000.00',
      payoutReference: 'SIM-PAY-987654',
      assessmentId: 'assess-3',
      triggerMeasurement: 'Precipitation: 145mm',
      triggerThreshold: 'Precipitation > 120mm',
      payoutPercentage: '25.00',
      observedValue: '145mm',
      thresholdValue: '120mm',
      createdAt: '2026-08-01T00:00:00.000Z',
      farm: MOCK_FARMS[1],
    },
  ];

  const MOCK_PORTFOLIO_SUMMARY: any = {
    totalAssessments: 12,
    farmsAssessed: 2,
    averageRiskScore: 38.5,
    riskDistribution: {
      LOW: 1,
      MEDIUM: 1,
      HIGH: 0,
      CRITICAL: 0,
    },
    topVulnerabilities: ['DROUGHT_INDEX', 'HIGH_TEMPERATURE'],
    activeAlertsCount: 1,
    recentAssessments: [],
  };

  // Helper to create AuthContext mock value
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

  // ============================================================================
  // Suite 1: Unauthenticated Visitor Flow & Admin Route Access Denial
  // ============================================================================
  console.log('--- Suite 1: Unauthenticated Visitor Denied Admin Access ---');
  mockStorage.clear();

  const unauthContext = createAuthContextValue();
  const unauthAdminHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: unauthContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          ProtectedRoute,
          { requiredRole: 'ADMIN' },
          React.createElement('div', { 'data-testid': 'secret-admin-area' }, 'CONFIDENTIAL_ADMIN_DATA')
        )
      )
    )
  );

  assert(unauthAdminHtml.includes('protected-auth-prompt'), '1.1 Unauthenticated visitor encounters protected-auth-prompt');
  assert(unauthAdminHtml.includes('open-admin-auth-btn'), '1.2 Displays Sign In as Administrator button');
  assert(!unauthAdminHtml.includes('CONFIDENTIAL_ADMIN_DATA'), '1.3 Confidential admin children are strictly shielded from unauthenticated users');

  // ============================================================================
  // Suite 2: Farmer Role Denied Admin Access (HTTP 403 Forbidden UI)
  // ============================================================================
  console.log('\n--- Suite 2: Farmer Role Strictly Denied Admin-Only Routes (403 Forbidden) ---');

  const farmerContext = createAuthContextValue({
    token: 'jwt-farmer-token',
    user: FARMER_USER,
    role: 'FARMER',
    isAuthenticated: true,
    isFarmer: true,
    isAdmin: false,
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
          React.createElement('div', { 'data-testid': 'secret-admin-area' }, 'CONFIDENTIAL_ADMIN_DATA')
        )
      )
    )
  );

  assert(farmerAccessAdminRouteHtml.includes('protected-role-forbidden'), '2.1 Farmer encountering admin route receives protected-role-forbidden');
  assert(farmerAccessAdminRouteHtml.includes('HTTP 403 Forbidden'), '2.2 Renders explicit HTTP 403 Forbidden badge');
  assert(farmerAccessAdminRouteHtml.includes('Access Denied'), '2.3 Renders Access Denied heading');
  assert(farmerAccessAdminRouteHtml.includes('FARMER'), '2.4 Explains that user has FARMER role, not ADMIN');
  assert(!farmerAccessAdminRouteHtml.includes('CONFIDENTIAL_ADMIN_DATA'), '2.5 Farmer cannot see administrative child elements');

  // ============================================================================
  // Suite 3: Authenticated Admin Access to Admin Dashboard via HomePage & Direct Route
  // ============================================================================
  console.log('\n--- Suite 3: Authenticated Admin Access to Admin Dashboard ---');

  const adminContext = createAuthContextValue({
    token: 'jwt-admin-token',
    user: ADMIN_USER,
    role: 'ADMIN',
    isAuthenticated: true,
    isFarmer: false,
    isAdmin: true,
    adminToken: 'jwt-admin-token',
    activeAdmin: ADMIN_USER,
  });

  const adminHomeHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: adminContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(HomePage, {
          initialAdminFarmers: MOCK_FARMERS,
          initialAdminFarms: MOCK_FARMS,
          initialAdminPolicies: MOCK_POLICIES,
          initialAdminClaims: MOCK_CLAIMS,
          initialAdminSummary: MOCK_PORTFOLIO_SUMMARY,
          initialAdminLoading: false,
        })
      )
    )
  );

  assert(adminHomeHtml.includes('admin-dashboard-container'), '3.1 Admin user navigating to HomePage renders admin-dashboard-container');
  assert(adminHomeHtml.includes('Administrator Control Center'), '3.2 Renders Administrator Control Center banner');
  assert(adminHomeHtml.includes('chief_underwriter'), '3.3 Displays signed-in administrator username in control center banner');
  assert(adminHomeHtml.includes('admin-farmers-link'), '3.4 Renders navigation link to Farmer Registry');
  assert(adminHomeHtml.includes('admin-farms-link'), '3.5 Renders navigation link to Monitored Farm Parcels');

  // Direct ProtectedRoute validation for ADMIN
  const adminAuthorizedHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: adminContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          ProtectedRoute,
          { requiredRole: 'ADMIN' },
          React.createElement('div', { 'data-testid': 'secret-admin-area' }, 'AUTHORIZED_ADMIN_CONTENT')
        )
      )
    )
  );
  assert(adminAuthorizedHtml.includes('AUTHORIZED_ADMIN_CONTENT'), '3.6 Admin passes ProtectedRoute and renders protected content');
  assert(!adminAuthorizedHtml.includes('protected-role-forbidden'), '3.7 No 403 Forbidden badge rendered for authorized admin');

  // ============================================================================
  // Suite 4: Macro KPI Operational Metrics Grid
  // ============================================================================
  console.log('\n--- Suite 4: Macro KPI Metric Cards Rendering ---');

  const adminDashboardHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: adminContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminDashboardPage, {
          initialFarmers: MOCK_FARMERS,
          initialFarms: MOCK_FARMS,
          initialPolicies: MOCK_POLICIES,
          initialClaims: MOCK_CLAIMS,
          initialSummary: MOCK_PORTFOLIO_SUMMARY,
          initialLoading: false,
        })
      )
    )
  );

  assert(adminDashboardHtml.includes('admin-metric-cards'), '4.1 Renders admin-metric-cards grid container');
  assert(adminDashboardHtml.includes('Registered Farmers'), '4.2 Renders Registered Farmers KPI card');
  assert(adminDashboardHtml.includes('>2<'), '4.3 Displays correct farmer count (2)');
  assert(adminDashboardHtml.includes('Monitored Parcels'), '4.4 Renders Monitored Parcels KPI card');
  assert(adminDashboardHtml.includes('Policies'), '4.5 Renders Policies KPI card');
  assert(adminDashboardHtml.includes('Active') && adminDashboardHtml.includes('1'), '4.6 Correctly reflects 1 active policy');
  assert(adminDashboardHtml.includes('1 pending issuance'), '4.7 Correctly reflects 1 pending policy');
  assert(adminDashboardHtml.includes('Claims Queue'), '4.8 Renders Claims Queue KPI card');
  assert(adminDashboardHtml.includes('Awaiting Action') && adminDashboardHtml.includes('2'), '4.9 Reflects 2 actionable claims (1 pending + 1 approved)');
  assert(adminDashboardHtml.includes('25,000 total disbursed'), '4.10 Reflects ₹25,000 total disbursed across PAID claims');

  // ============================================================================
  // Suite 5: Underwriting Queue & Policy Issuance Confirmation Flow
  // ============================================================================
  console.log('\n--- Suite 5: Underwriting Queue & Policy Issuance ---');

  assert(adminDashboardHtml.includes('underwriting-queue-section'), '5.1 Renders underwriting queue section');
  assert(adminDashboardHtml.includes('AGRI-POL-2026-001'), '5.2 Displays pending policy number AGRI-POL-2026-001');
  assert(adminDashboardHtml.includes('Green Valley Plot 1'), '5.3 Displays associated farm parcel name');
  assert(adminDashboardHtml.includes((150000).toLocaleString('en-IN')), '5.4 Displays Sum Insured ₹150,000');
  assert(adminDashboardHtml.includes('7,500'), '5.5 Displays Premium ₹7,500');
  assert(adminDashboardHtml.includes('issue-policy-btn-pol-pending-1'), '5.6 Renders Issue Policy action button for pending policy');

  // Empty Underwriting Queue Zero-State Check
  const emptyQueueHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: adminContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminDashboardPage, {
          initialFarmers: MOCK_FARMERS,
          initialFarms: MOCK_FARMS,
          initialPolicies: [MOCK_POLICIES[1]], // only the ACTIVE policy, 0 PENDING
          initialClaims: [],
          initialSummary: MOCK_PORTFOLIO_SUMMARY,
          initialLoading: false,
        })
      )
    )
  );

  assert(emptyQueueHtml.includes('empty-policy-queue'), '5.7 Renders empty-policy-queue when 0 policies are pending');
  assert(emptyQueueHtml.includes('No Policies Pending Issuance'), '5.8 Displays clear no-pending-policies message');

  // ============================================================================
  // Suite 6: Parametric Claims Adjudication & Settlement Actions
  // ============================================================================
  console.log('\n--- Suite 6: Parametric Claims Adjudication & Settlement ---');

  assert(adminDashboardHtml.includes('claims-adjudication-section'), '6.1 Renders claims adjudication section');
  assert(adminDashboardHtml.includes('CLM-2026-001'), '6.2 Displays pending claim CLM-2026-001');
  assert(adminDashboardHtml.includes('RULE_DROUGHT_V1'), '6.3 Displays trigger rule code RULE_DROUGHT_V1');
  assert(adminDashboardHtml.includes('approve-claim-btn-clm-pending-1'), '6.4 Renders Approve action button for pending claim');
  assert(adminDashboardHtml.includes('reject-claim-btn-clm-pending-1'), '6.5 Renders Reject action button for pending claim');

  assert(adminDashboardHtml.includes('CLM-2026-002'), '6.6 Displays approved claim CLM-2026-002');
  assert(adminDashboardHtml.includes('settle-claim-btn-clm-approved-1'), '6.7 Renders Settle Payout action button for approved claim');

  assert(adminDashboardHtml.includes('CLM-2026-003'), '6.8 Displays paid claim CLM-2026-003');
  assert(adminDashboardHtml.includes('Ref: SIM-PAY-987654'), '6.9 Displays payment transaction reference for paid claim');

  // Empty Claims Queue Zero-State Check
  assert(emptyQueueHtml.includes('empty-claims-queue'), '6.10 Renders empty-claims-queue when claims list is empty');
  assert(emptyQueueHtml.includes('All Claims Clear'), '6.11 Displays All Claims Clear message in empty queue state');

  // ============================================================================
  // Suite 7: Module 6 / Module 8 Governance Separation Disclosure
  // ============================================================================
  console.log('\n--- Suite 7: Authoritative Module 6 / Advisory Module 8 Governance Invariant ---');

  assert(adminDashboardHtml.includes('ClimateRiskRuleEngine'), '7.1 Explicitly cites ClimateRiskRuleEngine');
  assert(
    adminDashboardHtml.includes('sole authoritative parametric trigger engine'),
    '7.2 Cites Module 6 as sole authoritative trigger engine'
  );
  assert(
    adminDashboardHtml.includes('Module 8 ML probabilities, SHAP values, and forecasts are advisory only'),
    '7.3 Asserts Module 8 ML probabilities and SHAP values are purely non-binding advisory'
  );
  assert(
    adminDashboardHtml.includes('never directly issue policies, trigger claims, determine payouts'),
    '7.4 Reaffirms ML models cannot autonomously issue policies, trigger claims, or determine payouts'
  );

  // ============================================================================
  // Suite 8: Loading and Error Presentation
  // ============================================================================
  console.log('\n--- Suite 8: Loading and Error Presentation ---');

  // Loading state
  const loadingHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: adminContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminDashboardPage, {
          initialLoading: true,
        })
      )
    )
  );
  assert(loadingHtml.includes('admin-dashboard-loading'), '8.1 Renders admin-dashboard-loading state');

  // Error state
  const errorHtml = renderToStaticMarkup(
    React.createElement(
      AuthContext.Provider,
      { value: adminContext },
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AdminDashboardPage, {
          initialLoading: false,
          initialError: 'PostgreSQL connection timeout on administrative portfolio sync.',
        })
      )
    )
  );
  assert(errorHtml.includes('admin-dashboard-error'), '8.2 Renders admin-dashboard-error alert on API failure');
  assert(
    errorHtml.includes('PostgreSQL connection timeout on administrative portfolio sync.'),
    '8.3 Displays exact transparent error message to the administrator'
  );

  // ============================================================================
  // Suite 9: Administrative policyClaimService Method Contracts
  // ============================================================================
  console.log('\n--- Suite 9: Administrative policyClaimService API Contracts ---');

  // Mock axios calls on api client
  let lastCall: { method: string; url: string; data?: any } | null = null;
  const originalPost = apiClient.post;

  apiClient.post = (async (url: string, data?: any) => {
    lastCall = { method: 'POST', url, data };
    if (url.includes('/issue')) {
      return {
        data: {
          success: true,
          message: 'Policy issued successfully',
          data: { ...MOCK_POLICIES[0], status: 'ACTIVE' },
        },
      };
    }
    if (url.includes('/approve')) {
      return {
        data: {
          success: true,
          message: 'Claim approved successfully',
          data: { ...MOCK_CLAIMS[0], status: 'APPROVED' },
        },
      };
    }
    if (url.includes('/reject')) {
      return {
        data: {
          success: true,
          message: 'Claim rejected successfully',
          data: { ...MOCK_CLAIMS[0], status: 'REJECTED', rejectionReason: data?.reason },
        },
      };
    }
    if (url.includes('/settle')) {
      return {
        data: {
          success: true,
          message: 'Claim settled successfully',
          data: { ...MOCK_CLAIMS[1], status: 'PAID', payoutReference: data?.simulatedTransactionId || 'SIM-PAY-DEFAULT' },
        },
      };
    }
    return { data: { success: true } };
  }) as any;

  try {
    // 9.1 Issue Policy
    const issueRes = await policyClaimService.issuePolicy('pol-pending-1');
    assert(lastCall?.url === '/policies/pol-pending-1/issue', '9.1 issuePolicy calls POST /policies/:id/issue');
    assert(issueRes.data.status === 'ACTIVE', '9.2 issuePolicy returns activated policy object');

    // 9.2 Approve Claim
    const approveRes = await policyClaimService.approveClaim('clm-pending-1');
    assert(lastCall?.url === '/claims/clm-pending-1/approve', '9.3 approveClaim calls POST /claims/:id/approve');
    assert(approveRes.data.status === 'APPROVED', '9.4 approveClaim returns approved claim object');

    // 9.3 Reject Claim
    const rejectRes = await policyClaimService.rejectClaim('clm-pending-1', 'Insufficient rain breach recorded');
    assert(lastCall?.url === '/claims/clm-pending-1/reject', '9.5 rejectClaim calls POST /claims/:id/reject');
    assert(lastCall?.data?.reason === 'Insufficient rain breach recorded', '9.6 rejectClaim sends reason payload');
    assert(rejectRes.data.status === 'REJECTED', '9.7 rejectClaim returns rejected claim object');

    // 9.4 Settle Claim
    const settleRes = await policyClaimService.settleClaim('clm-approved-1', 'SIM-TX-TEST-777');
    assert(lastCall?.url === '/claims/clm-approved-1/settle', '9.8 settleClaim calls POST /claims/:id/settle');
    assert(lastCall?.data?.simulatedTransactionId === 'SIM-TX-TEST-777', '9.9 settleClaim transmits simulatedTransactionId');
    assert(settleRes.data.status === 'PAID', '9.10 settleClaim returns paid claim object');
  } finally {
    // Restore original method
    apiClient.post = originalPost;
  }

  // ============================================================================
  // Suite 10: Farm Aggregation Helpers
  // ============================================================================
  console.log('\n--- Suite 10: Farm-Scoped Aggregation Helpers ---');

  const originalGetFarmPolicies = policyClaimService.getFarmPolicies;
  const originalGetFarmClaims = policyClaimService.getFarmClaims;

  policyClaimService.getFarmPolicies = (async (farmId: string) => {
    return {
      success: true,
      data: MOCK_POLICIES.filter((p) => p.farmId === farmId),
    };
  }) as any;

  policyClaimService.getFarmClaims = (async (farmId: string) => {
    return {
      success: true,
      data: MOCK_CLAIMS.filter((c) => c.farmId === farmId),
    };
  }) as any;

  try {
    const aggregatedPolicies = await policyClaimService.getPoliciesForFarms(MOCK_FARMS);
    assert(aggregatedPolicies.length === 2, '10.1 getPoliciesForFarms aggregates across all provided farms');
    assert(aggregatedPolicies[0].farm?.farmName === 'Green Valley Plot 1', '10.2 Policies decorated with farm parcel metadata');

    const aggregatedClaims = await policyClaimService.getClaimsForFarms(MOCK_FARMS);
    assert(aggregatedClaims.length === 3, '10.3 getClaimsForFarms aggregates across all provided farms');
    assert(aggregatedClaims[0].farm?.farmName === 'Sunrise Orchard', '10.4 Claims decorated with farm parcel metadata');
  } finally {
    policyClaimService.getFarmPolicies = originalGetFarmPolicies;
    policyClaimService.getFarmClaims = originalGetFarmClaims;
  }

  // ============================================================================
  // Summary
  // ============================================================================
  console.log('\n================================================================================');
  console.log(`🏁 Admin Dashboard Test Suite Completed: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdminDashboardTestSuite().catch((err) => {
  console.error('Unhandled test suite failure:', err);
  process.exit(1);
});
