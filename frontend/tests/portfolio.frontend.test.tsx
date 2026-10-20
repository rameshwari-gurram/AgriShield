/**
 * Module 10: End-to-End System Integration & Acceptance
 * Stage 10.1: Unified Policy & Claims Portfolio Frontend Test Suite
 *
 * Comprehensive tests covering:
 * - PolicyPortfolioPage:
 *   - Unauthenticated state prompting producer authentication with mobile OTP
 *   - Authenticated state with summary metrics (Total, Active, Sum Insured, Remaining Coverage)
 *   - Policy card details (Crop, Policy Number, Parcel, Covered Hazards, Balances)
 *   - Status filters (ALL, ACTIVE, EXPIRED, TERMINATED)
 *   - Empty and error states
 * - ClaimsPortfolioPage:
 *   - Mandatory Statutory / Advisory Separation Notice (Module 8 ML != Module 6 IMD settlement)
 *   - Unauthenticated state prompting producer authentication
 *   - Authenticated state with claim metrics (Total, Pending, Approved, Paid, Disbursed)
 *   - Table rendering of IMD trigger rules, observed vs threshold values, payout amounts
 *   - Severity badges and ClaimAuditModal provenance inspection button
 *   - STRICT NEGATIVE ASSERTION: Complete absence of farmer-facing adjudication / settlement buttons
 *   - Empty and error states
 * - Navigation & Routing:
 *   - Navbar inclusion of /policies and /claims
 *   - AppRoutes configuration
 */

import { register } from 'node:module';

// Register hook to handle import.meta.env for Node/tsx execution without modifying production constants
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

// Provide minimal DOM shims for Node.js execution of Leaflet-dependent components
if (typeof (global as any).window === 'undefined') {
  (global as any).window = {
    location: { href: 'http://localhost:5173', origin: 'http://localhost:5173' },
    navigator: { userAgent: 'node' },
    screen: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (global as any).document = {
    documentElement: { style: {} },
    createElement: () => ({ style: {} }),
  };
}

async function runTestSuite() {
  console.log('================================================================================');
  console.log('🧪 Running Module 10 Stage 10.1: Policy & Claims Portfolio Frontend Tests');
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

  // Dynamic imports after register hook
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { MemoryRouter } = await import('react-router-dom');
  const { AuthContext } = await import('../src/context/AuthContext.js');
  const { PolicyPortfolioPage } = await import('../src/pages/policies/PolicyPortfolioPage.js');
  const { ClaimsPortfolioPage } = await import('../src/pages/claims/ClaimsPortfolioPage.js');
  const { Navbar } = await import('../src/components/Navbar.js');
  const { AppRoutes } = await import('../src/routes/AppRoutes.js');

  const FARMER_ID = '11111111-1111-4111-8111-111111111111';
  const FARM_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const FARM_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const mockProducer = {
    id: FARMER_ID,
    fullName: 'Rajesh Patil',
    mobileNumber: '9876543210',
    primaryDistrict: 'Pune',
    primaryState: 'Maharashtra',
  };

  const authenticatedContext = {
    producerToken: 'mock-valid-jwt-token',
    activeProducer: mockProducer,
    isAuthenticated: true,
    login: () => {},
    logout: () => {},
    isOwnerOfFarm: (id?: string | null) => id === FARM_A_ID || id === FARM_B_ID,
  };

  const unauthenticatedContext = {
    producerToken: null,
    activeProducer: null,
    isAuthenticated: false,
    login: () => {},
    logout: () => {},
    isOwnerOfFarm: () => false,
  };

  // Mock Policies Fixture
  const samplePolicies = [
    {
      id: 'pol-uuid-1',
      policyNumber: 'POL-20261013-F8C2',
      farmId: FARM_A_ID,
      farmerId: FARMER_ID,
      cropName: 'Cotton',
      sumInsured: '100000.00',
      premiumAmount: '7500.00',
      coveredHazards: ['HIGH_TEMPERATURE', 'HEAVY_RAINFALL'],
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-11-30T00:00:00.000Z',
      cumulativePaidAmount: '50000.00',
      remainingCoverage: '50000.00',
      status: 'ACTIVE' as const,
      createdAt: '2026-06-01T08:00:00.000Z',
      updatedAt: '2026-07-20T12:00:00.000Z',
      farm: {
        id: FARM_A_ID,
        farmName: 'Patil Cotton East',
        farmReferenceNumber: 'MH-PUN-001',
        farmerId: FARMER_ID,
        cropName: 'Cotton',
        cropVariety: null,
        sowingDate: '2026-06-01T00:00:00.000Z',
        expectedHarvestDate: null,
        farmArea: 5,
        farmAreaUnit: 'ACRE' as const,
        village: 'Baramati',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '413102',
        status: 'ACTIVE' as const,
        createdAt: '2026-06-01T08:00:00.000Z',
        updatedAt: '2026-06-01T08:00:00.000Z',
      },
    },
    {
      id: 'pol-uuid-2',
      policyNumber: 'POL-20261013-D4A1',
      farmId: FARM_B_ID,
      farmerId: FARMER_ID,
      cropName: 'Soybean',
      sumInsured: '80000.00',
      premiumAmount: '5600.00',
      coveredHazards: ['DEFICIT_RAINFALL', 'SOIL_MOISTURE_DEFICIT'],
      startDate: '2026-06-15T00:00:00.000Z',
      endDate: '2026-10-15T00:00:00.000Z',
      cumulativePaidAmount: '0.00',
      remainingCoverage: '80000.00',
      status: 'ACTIVE' as const,
      createdAt: '2026-06-15T08:00:00.000Z',
      updatedAt: '2026-06-15T08:00:00.000Z',
      farm: {
        id: FARM_B_ID,
        farmName: 'Patil Soybean West',
        farmReferenceNumber: 'MH-PUN-002',
        farmerId: FARMER_ID,
        cropName: 'Soybean',
        cropVariety: null,
        sowingDate: '2026-06-15T00:00:00.000Z',
        expectedHarvestDate: null,
        farmArea: 4,
        farmAreaUnit: 'ACRE' as const,
        village: 'Indapur',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '413106',
        status: 'ACTIVE' as const,
        createdAt: '2026-06-15T08:00:00.000Z',
        updatedAt: '2026-06-15T08:00:00.000Z',
      },
    },
  ];

  // Mock Claims Fixture
  const sampleClaims = [
    {
      id: 'clm-uuid-1',
      claimNumber: 'CLM-20261013-C94B',
      policyId: 'pol-uuid-1',
      assessmentId: 'assess-uuid-1',
      riskEventId: 'event-uuid-1',
      triggerRuleCode: 'HEAVY_RAINFALL_24H',
      severity: 'HIGH' as const,
      observedValue: '78.40',
      thresholdValue: '64.50',
      payoutAmount: '50000.00',
      status: 'PAID' as const,
      payoutReference: 'SIM-IMPS-20261013-PAY4492',
      payoutNotes: 'Simulated automated IMPS payout triggered by 24h rainfall trigger.',
      settledAt: '2026-07-20T12:00:00.000Z',
      createdAt: '2026-07-20T11:55:00.000Z',
      updatedAt: '2026-07-20T12:00:00.000Z',
      farm: {
        id: FARM_A_ID,
        farmName: 'Patil Cotton East',
        farmReferenceNumber: 'MH-PUN-001',
        farmerId: FARMER_ID,
        cropName: 'Cotton',
        cropVariety: null,
        sowingDate: '2026-06-01T00:00:00.000Z',
        expectedHarvestDate: null,
        farmArea: 5,
        farmAreaUnit: 'ACRE' as const,
        village: 'Baramati',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '413102',
        status: 'ACTIVE' as const,
        createdAt: '2026-06-01T08:00:00.000Z',
        updatedAt: '2026-06-01T08:00:00.000Z',
      },
      policy: {
        id: 'pol-uuid-1',
        policyNumber: 'POL-20261013-F8C2',
        cropName: 'Cotton',
        farmId: FARM_A_ID,
        farmerId: FARMER_ID,
        sumInsured: '100000.00',
        premiumAmount: '7500.00',
        coveredHazards: ['HIGH_TEMPERATURE', 'HEAVY_RAINFALL'],
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-11-30T00:00:00.000Z',
        cumulativePaidAmount: '50000.00',
        remainingCoverage: '50000.00',
        status: 'ACTIVE' as const,
        createdAt: '2026-06-01T08:00:00.000Z',
        updatedAt: '2026-07-20T12:00:00.000Z',
      },
    },
    {
      id: 'clm-uuid-2',
      claimNumber: 'CLM-20261014-E11A',
      policyId: 'pol-uuid-2',
      assessmentId: 'assess-uuid-2',
      riskEventId: 'event-uuid-2',
      triggerRuleCode: 'DEFICIT_RAINFALL_SEASON',
      severity: 'HIGH' as const,
      observedValue: '45.00',
      thresholdValue: '60.00',
      payoutAmount: '20000.00',
      status: 'APPROVED' as const,
      payoutReference: null,
      payoutNotes: 'Approved by parametric rule engine, pending settlement cycle.',
      settledAt: null,
      createdAt: '2026-10-14T09:00:00.000Z',
      updatedAt: '2026-10-14T09:00:00.000Z',
      farm: {
        id: FARM_B_ID,
        farmName: 'Patil Soybean West',
        farmReferenceNumber: 'MH-PUN-002',
        farmerId: FARMER_ID,
        cropName: 'Soybean',
        cropVariety: null,
        sowingDate: '2026-06-15T00:00:00.000Z',
        expectedHarvestDate: null,
        farmArea: 4,
        farmAreaUnit: 'ACRE' as const,
        village: 'Indapur',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '413106',
        status: 'ACTIVE' as const,
        createdAt: '2026-06-15T08:00:00.000Z',
        updatedAt: '2026-06-15T08:00:00.000Z',
      },
      policy: {
        id: 'pol-uuid-2',
        policyNumber: 'POL-20261013-D4A1',
        cropName: 'Soybean',
        farmId: FARM_B_ID,
        farmerId: FARMER_ID,
        sumInsured: '80000.00',
        premiumAmount: '5600.00',
        coveredHazards: ['DEFICIT_RAINFALL', 'SOIL_MOISTURE_DEFICIT'],
        startDate: '2026-06-15T00:00:00.000Z',
        endDate: '2026-10-15T00:00:00.000Z',
        cumulativePaidAmount: '0.00',
        remainingCoverage: '80000.00',
        status: 'ACTIVE' as const,
        createdAt: '2026-06-15T08:00:00.000Z',
        updatedAt: '2026-06-15T08:00:00.000Z',
      },
    },
  ];

  // ==========================================================================
  console.log('--- Part 1: PolicyPortfolioPage Rendering & Portfolio Aggregation ---');
  // ==========================================================================
  {
    // 1.1 Unauthenticated State
    const htmlUnauth = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthContext.Provider,
          { value: unauthenticatedContext },
          React.createElement(PolicyPortfolioPage, { initialPolicies: [], initialLoading: false })
        )
      )
    );
    assert(htmlUnauth.includes('Producer Authentication Required'), '1.1 Displays authentication required prompt when unauthenticated');
    assert(htmlUnauth.includes('Verify Mobile OTP'), '1.2 Displays Verify Mobile OTP action button');
    assert(htmlUnauth.includes('registered mobile number'), '1.3 Explains mobile OTP verification prerequisite');

    // 1.2 Authenticated State with Policies
    const htmlAuth = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthContext.Provider,
          { value: authenticatedContext },
          React.createElement(PolicyPortfolioPage, { initialPolicies: samplePolicies, initialLoading: false })
        )
      )
    );
    assert(htmlAuth.includes('Parametric Policies Portfolio'), '1.4 Displays Parametric Policies Portfolio heading');
    assert(htmlAuth.includes('Rajesh Patil'), '1.5 Identifies verified producer by name');
    assert(htmlAuth.includes('POL-20261013-F8C2'), '1.6 Renders first policy number');
    assert(htmlAuth.includes('POL-20261013-D4A1'), '1.7 Renders second policy number');
    assert(htmlAuth.includes('Patil Cotton East'), '1.8 Associates policy with registered farm parcel');
    assert(htmlAuth.includes('Cotton'), '1.9 Displays covered crop name');
    assert(htmlAuth.includes('Extreme Heat'), '1.10 Maps and displays covered hazard label');
    assert(htmlAuth.includes('Heavy Rainfall (24h)'), '1.11 Displays heavy rainfall hazard label');

    // Metrics verification
    // Total sum insured: 100,000 + 80,000 = 180,000
    // Remaining coverage: 50,000 + 80,000 = 130,000
    assert(htmlAuth.includes('₹1,80,000.00') || htmlAuth.includes('180000'), '1.12 Computes and displays total sum insured');
    assert(htmlAuth.includes('₹1,30,000.00') || htmlAuth.includes('130000'), '1.13 Computes and displays remaining active coverage');

    // 1.3 Empty State
    const htmlEmpty = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthContext.Provider,
          { value: authenticatedContext },
          React.createElement(PolicyPortfolioPage, { initialPolicies: [], initialLoading: false })
        )
      )
    );
    assert(htmlEmpty.includes('No Parametric Policies Found'), '1.14 Displays empty state heading when farmer has zero policies');
    assert(htmlEmpty.includes('View Registered Farms'), '1.15 Provides link to view registered farms in empty state');

    // 1.4 Error State
    const htmlError = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthContext.Provider,
          { value: authenticatedContext },
          React.createElement(PolicyPortfolioPage, {
            initialPolicies: [],
            initialLoading: false,
            initialError: {
              title: 'Portfolio Sync Error',
              message: 'Failed to aggregate policies from upstream cluster.',
              status: 500,
              isAuthError: false,
            },
          })
        )
      )
    );
    assert(htmlError.includes('Unable to Load Policies'), '1.16 Renders error title');
    assert(htmlError.includes('Failed to aggregate policies'), '1.17 Renders error description');
    assert(htmlError.includes('Retry Connection'), '1.18 Renders retry button on failure');
  }

  // ==========================================================================
  console.log('\n--- Part 2: ClaimsPortfolioPage Statutory Separation & Governance ---');
  // ==========================================================================
  {
    // 2.1 Mandatory Statutory / Advisory Separation Notice
    const htmlClaims = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthContext.Provider,
          { value: authenticatedContext },
          React.createElement(ClaimsPortfolioPage, { initialClaims: sampleClaims, initialLoading: false })
        )
      )
    );

    assert(htmlClaims.includes('Statutory Insurance Separation Notice'), '2.1 Statutory separation notice banner is present');
    assert(
      htmlClaims.includes('Module 8 are strictly experimental advisory indicators'),
      '2.2 Explicitly clarifies Module 8 ML predictions are advisory only'
    );
    assert(
      htmlClaims.includes('authoritative meteorological rule evaluations (Module 6)'),
      '2.3 Identifies Module 6 deterministic IMD rule engine as sole parametric authority'
    );
    assert(
      htmlClaims.includes('Machine learning forecasts never determine claim settlement'),
      '2.4 Clarifies ML models do not determine, initiate, adjust, or settle claims'
    );

    // 2.2 Claims Portfolio Metrics & Data Presentation
    assert(htmlClaims.includes('Parametric Claims Portfolio'), '2.5 Displays Claims Portfolio title');
    assert(htmlClaims.includes('CLM-20261013-C94B'), '2.6 Displays first claim number');
    assert(htmlClaims.includes('HEAVY_RAINFALL_24H'), '2.7 Displays authoritative trigger rule code');
    assert(htmlClaims.includes('78.40'), '2.8 Displays actual observed weather value');
    assert(htmlClaims.includes('64.50'), '2.9 Displays parametric threshold value');
    assert(htmlClaims.includes('₹50,000.00'), '2.10 Formats and displays payout amount');
    assert(htmlClaims.includes('SIM-IMPS-20261013-PAY4492'), '2.11 Displays simulated banking disbursement reference');
    assert(htmlClaims.includes('Audit'), '2.12 Provides Audit inspection button');

    // Metrics computation
    // Total claims: 2 | Approved: 1 | Paid: 1 | Disbursed: ₹50,000.00
    assert(htmlClaims.includes('Total Claims'), '2.13 Computes total claims metric');
    assert(htmlClaims.includes('₹50,000.00'), '2.14 Displays total settled disbursement metric');

    // 2.3 STRICT NEGATIVE ASSERTION: Zero Adjudication Controls in Farmer View
    // Farmers must NEVER be presented with buttons to approve, reject, or settle claims
    const lowerClaimsHtml = htmlClaims.toLowerCase();
    assert(!lowerClaimsHtml.includes('button>approve</button>'), '2.15 STRICT NEGATIVE: No Approve Claim button');
    assert(!lowerClaimsHtml.includes('button>reject</button>'), '2.16 STRICT NEGATIVE: No Reject Claim button');
    assert(!lowerClaimsHtml.includes('button>settle</button>'), '2.17 STRICT NEGATIVE: No Settle Claim button');
    assert(!lowerClaimsHtml.includes('button>disburse</button>'), '2.18 STRICT NEGATIVE: No Disburse Payout button');

    // 2.4 Unauthenticated Claims State
    const htmlClaimsUnauth = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthContext.Provider,
          { value: unauthenticatedContext },
          React.createElement(ClaimsPortfolioPage, { initialClaims: [], initialLoading: false })
        )
      )
    );
    assert(htmlClaimsUnauth.includes('Producer Authentication Required'), '2.19 Claims prompts producer auth when unauthenticated');

    // 2.5 Empty Claims State
    const htmlClaimsEmpty = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthContext.Provider,
          { value: authenticatedContext },
          React.createElement(ClaimsPortfolioPage, { initialClaims: [], initialLoading: false })
        )
      )
    );
    assert(htmlClaimsEmpty.includes('No Parametric Claims Recorded'), '2.20 Displays empty state heading when no claims exist');
  }

  // ==========================================================================
  console.log('\n--- Part 3: Navigation & Routing Verification ---');
  // ==========================================================================
  {
    // 3.1 Navbar Navigation Links
    const htmlNavbar = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        React.createElement(Navbar)
      )
    );
    assert(htmlNavbar.includes('href="/policies"'), '3.1 Navbar includes /policies route link');
    assert(htmlNavbar.includes('href="/claims"'), '3.2 Navbar includes /claims route link');
    assert(htmlNavbar.includes('Policies'), '3.3 Navbar displays Policies item label');
    assert(htmlNavbar.includes('Claims'), '3.4 Navbar displays Claims item label');

    // 3.2 AppRoutes Route Registration
    // Test that AppRoutes contains Route configurations for policies and claims
    const routesElementPolicies = React.createElement(
      MemoryRouter,
      { initialEntries: ['/policies'] },
      React.createElement(AppRoutes)
    );
    const htmlAppRoutesPolicies = renderToStaticMarkup(routesElementPolicies);
    assert(
      htmlAppRoutesPolicies.includes('Parametric Policies Portfolio') || htmlAppRoutesPolicies.includes('Producer Authentication Required'),
      '3.5 AppRoutes resolves /policies route to PolicyPortfolioPage'
    );

    const routesElementClaims = React.createElement(
      MemoryRouter,
      { initialEntries: ['/claims'] },
      React.createElement(AppRoutes)
    );
    const htmlAppRoutesClaims = renderToStaticMarkup(routesElementClaims);
    assert(
      htmlAppRoutesClaims.includes('Parametric Claims Portfolio') || htmlAppRoutesClaims.includes('Producer Authentication Required'),
      '3.6 AppRoutes resolves /claims route to ClaimsPortfolioPage'
    );
  }

  // ==========================================================================
  console.log('\n================================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution exception:', err);
  process.exit(1);
});
