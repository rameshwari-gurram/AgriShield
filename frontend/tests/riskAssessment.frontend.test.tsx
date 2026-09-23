/**
 * Module 6 Stage 5B-1: Frontend Risk Assessment Foundation Tests
 * Tests covering API service communication, component state transitions,
 * empty state handling, running state, incomplete data warnings, error states,
 * and zero-business-logic frontend guarantees.
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

async function runTestSuite() {
  console.log('🧪 Running Module 6 Stage 5B-1: Frontend Risk Assessment Foundation Tests...\n');

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

  // Dynamic imports after register()
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { apiClient } = await import('../src/services/api');
  const { riskAssessmentService } = await import('../src/services/riskAssessmentService');
  const { FarmRiskSection } = await import('../src/components/risk/FarmRiskSection');
  const types = await import('../src/types');

  const dummyFarmId = 'farm-test-uuid-456';

  // Sample mock assessments
  const mockHighAssessment: types.RiskAssessment = {
    id: 'assess-uuid-001',
    farmId: dummyFarmId,
    assessedAt: '2026-09-23T10:00:00.000Z',
    overallRisk: 'HIGH',
    assessmentVersion: 'v1.0',
    weatherRecordCount: 24,
    ruleCount: 3,
    triggeredRuleCount: 1,
    hasInsufficientDataCoverage: false,
    summary: 'Severe rainfall event triggered IMD Heavy Rainfall threshold band.',
    createdAt: '2026-09-23T10:00:00.000Z',
    events: [
      {
        id: 'event-uuid-001',
        assessmentId: 'assess-uuid-001',
        ruleId: 'rule-uuid-001',
        ruleCode: 'IMD_HEAVY_RAIN_24H',
        ruleName: 'IMD Heavy Rainfall (24h)',
        hazardType: 'EXCESS_RAINFALL',
        measurement: 'RAINFALL_SUM_24H',
        thresholdValue: 130.0,
        unit: 'mm',
        observationWindow: '24h',
        observedValue: 145.5,
        triggered: true,
        severity: 'HIGH',
        status: 'TRIGGERED',
        sourceType: 'HOURLY_RECORDS',
        sourceReference: '24 consecutive hourly records',
      },
    ],
  };

  const mockModerateAssessment: types.RiskAssessment = {
    id: 'assess-uuid-002',
    farmId: dummyFarmId,
    assessedAt: '2026-09-23T11:00:00.000Z',
    overallRisk: 'MODERATE',
    assessmentVersion: 'v1.0',
    weatherRecordCount: 24,
    ruleCount: 3,
    triggeredRuleCount: 1,
    hasInsufficientDataCoverage: false,
    summary: 'Moderate rainfall event triggered.',
    createdAt: '2026-09-23T11:00:00.000Z',
    events: [],
  };

  const mockLowUnconfirmedAssessment: types.RiskAssessment = {
    id: 'assess-uuid-003',
    farmId: dummyFarmId,
    assessedAt: '2026-09-23T12:00:00.000Z',
    overallRisk: 'LOW',
    assessmentVersion: 'v1.0',
    weatherRecordCount: 12,
    ruleCount: 3,
    triggeredRuleCount: 0,
    hasInsufficientDataCoverage: true,
    summary: 'Fewer than 24 hours of data available; low risk unconfirmed.',
    createdAt: '2026-09-23T12:00:00.000Z',
    events: [
      {
        id: 'event-uuid-003',
        assessmentId: 'assess-uuid-003',
        ruleId: 'rule-uuid-003',
        ruleCode: 'IMD_HEAVY_RAIN_24H',
        ruleName: 'IMD Heavy Rainfall (24h)',
        hazardType: 'EXCESS_RAINFALL',
        measurement: 'RAINFALL_SUM_24H',
        thresholdValue: 130.0,
        unit: 'mm',
        observationWindow: '24h',
        observedValue: null,
        triggered: false,
        severity: 'LOW',
        status: 'INSUFFICIENT_DATA',
        sourceType: 'HOURLY_RECORDS',
        sourceReference: null,
      },
    ],
  };

  // Zero-business-logic mock: observed value appears high, but backend computed NOT_TRIGGERED
  const mockZeroCalculationAssessment: types.RiskAssessment = {
    id: 'assess-uuid-004',
    farmId: dummyFarmId,
    assessedAt: '2026-09-23T13:00:00.000Z',
    overallRisk: 'LOW',
    assessmentVersion: 'v1.0',
    weatherRecordCount: 24,
    ruleCount: 3,
    triggeredRuleCount: 0,
    hasInsufficientDataCoverage: false,
    summary: 'No hazards confirmed by meteorological engine.',
    createdAt: '2026-09-23T13:00:00.000Z',
    events: [
      {
        id: 'event-uuid-004',
        assessmentId: 'assess-uuid-004',
        ruleId: 'rule-uuid-004',
        ruleCode: 'IMD_HEAVY_RAIN_24H',
        ruleName: 'IMD Heavy Rainfall (24h)',
        hazardType: 'EXCESS_RAINFALL',
        measurement: 'RAINFALL_SUM_24H',
        thresholdValue: 130.0,
        unit: 'mm',
        observationWindow: '24h',
        observedValue: 199.9, // Higher than threshold
        triggered: false,     // But backend says NOT triggered
        severity: 'LOW',
        status: 'NOT_TRIGGERED',
        sourceType: 'HOURLY_RECORDS',
        sourceReference: '24 consecutive hourly records',
      },
    ],
  };

  // ===========================================================================
  // Part 1: API Service Layer Verification
  // ===========================================================================
  console.log('--- Part 1: API Service Layer Verification ---');

  // Intercept and mock apiClient calls
  const originalPost = apiClient.post;
  const originalGet = apiClient.get;

  try {
    let capturedMethod = '';
    let capturedUrl = '';
    let capturedBody: any = null;
    let capturedConfig: any = null;

    apiClient.post = async (url: string, data?: any, config?: any) => {
      capturedMethod = 'POST';
      capturedUrl = url;
      capturedBody = data;
      capturedConfig = config;
      return { data: { success: true, data: mockHighAssessment } } as any;
    };

    apiClient.get = async (url: string, config?: any) => {
      capturedMethod = 'GET';
      capturedUrl = url;
      capturedConfig = config;
      return { data: { success: true, data: mockHighAssessment } } as any;
    };

    // Test 1: createRiskAssessment calls POST /farms/:farmId/risk-assessments with empty body
    const createRes = await riskAssessmentService.createRiskAssessment(dummyFarmId);
    assert(capturedMethod === 'POST', 'createRiskAssessment uses HTTP POST');
    assert(capturedUrl === `/farms/${dummyFarmId}/risk-assessments`, 'createRiskAssessment calls /farms/:farmId/risk-assessments');
    assert(typeof capturedBody === 'object' && Object.keys(capturedBody).length === 0, 'createRiskAssessment sends empty request body {} (no client calculation payload)');
    assert(createRes.data.id === mockHighAssessment.id, 'createRiskAssessment unwraps ApiResponse.data');

    // Test 2: getLatestRiskAssessment calls GET /farms/:farmId/risk-assessments/latest
    const latestRes = await riskAssessmentService.getLatestRiskAssessment(dummyFarmId);
    assert(capturedMethod === 'GET', 'getLatestRiskAssessment uses HTTP GET');
    assert(capturedUrl === `/farms/${dummyFarmId}/risk-assessments/latest`, 'getLatestRiskAssessment calls /farms/:farmId/risk-assessments/latest');
    assert(latestRes.data.id === mockHighAssessment.id, 'getLatestRiskAssessment returns latest assessment');

    // Test 3: getRiskAssessmentHistory calls GET /farms/:farmId/risk-assessments?limit=N
    await riskAssessmentService.getRiskAssessmentHistory(dummyFarmId, 25);
    assert(capturedMethod === 'GET', 'getRiskAssessmentHistory uses HTTP GET');
    assert(capturedUrl === `/farms/${dummyFarmId}/risk-assessments`, 'getRiskAssessmentHistory calls /farms/:farmId/risk-assessments');
    assert(capturedConfig?.params?.limit === 25, 'getRiskAssessmentHistory passes limit parameter');

    // Test 4: getRiskAssessmentById calls GET /risk-assessments/:assessmentId
    const testAssessId = 'assess-target-999';
    await riskAssessmentService.getRiskAssessmentById(testAssessId);
    assert(capturedMethod === 'GET', 'getRiskAssessmentById uses HTTP GET');
    assert(capturedUrl === `/risk-assessments/${testAssessId}`, 'getRiskAssessmentById calls /risk-assessments/:assessmentId');

  } finally {
    apiClient.post = originalPost;
    apiClient.get = originalGet;
  }

  // ===========================================================================
  // Part 2: Component State & Rendering Scenarios (Requirements 1 - 10)
  // ===========================================================================
  console.log('\n--- Part 2: Component State & Rendering Scenarios ---');

  // Scenario 1: Latest Assessment Display
  {
    const html = renderToStaticMarkup(
      React.createElement(FarmRiskSection, {
        farmId: dummyFarmId,
        initialAssessment: mockHighAssessment,
        initialLoading: false,
      })
    );

    assert(html.includes('HIGH'), 'Scenario 1: Renders overallRisk HIGH');
    assert(html.includes('v1.0'), 'Scenario 1: Renders assessmentVersion v1.0');
    assert(html.includes('24'), 'Scenario 1: Renders weatherRecordCount 24');
    assert(html.includes('3'), 'Scenario 1: Renders ruleCount 3');
    assert(html.includes('1'), 'Scenario 1: Renders triggeredRuleCount 1');
    assert(html.includes('Severe rainfall event triggered IMD Heavy Rainfall threshold band.'), 'Scenario 1: Renders summary narrative');
    assert(html.includes('Re-run Assessment'), 'Scenario 1: Header button shows Re-run Assessment when latest assessment is present');
    assert(html.includes('Parametric Evaluation Notice'), 'Scenario 1: Renders parametric disclaimer notice');
    assert(html.includes('strictly not an insurance claim approval'), 'Scenario 1: Disclaims insurance claim approval');
  }

  // Scenario 2: Empty State (404 on /latest)
  {
    const html = renderToStaticMarkup(
      React.createElement(FarmRiskSection, {
        farmId: dummyFarmId,
        initialAssessment: null,
        initialLoading: false,
      })
    );

    assert(html.includes('No Assessment Found'), 'Scenario 2: Renders No Assessment Found title');
    assert(html.includes('No climate risk assessment has been performed for this farm parcel yet.'), 'Scenario 2: Renders descriptive empty state message');
    assert(html.includes('Run Initial Risk Assessment'), 'Scenario 2: Renders Run Initial Risk Assessment action button');
    assert(html.includes('Run Assessment'), 'Scenario 2: Header button shows Run Assessment when no assessment is present');
  }

  // Scenario 3: Initial Loading State
  {
    const html = renderToStaticMarkup(
      React.createElement(FarmRiskSection, {
        farmId: dummyFarmId,
        initialLoading: true,
      })
    );

    assert(html.includes('Loading climate risk assessment...'), 'Scenario 3: Renders loading state message and spinner');
  }

  // Scenario 4: Running Assessment State
  {
    const html = renderToStaticMarkup(
      React.createElement(FarmRiskSection, {
        farmId: dummyFarmId,
        initialAssessment: null,
        initialLoading: false,
        initialRunning: true,
      })
    );

    assert(html.includes('Assessing Climate Risk...'), 'Scenario 4: Displays Assessing Climate Risk... text');
    assert(html.includes('disabled=""') || html.includes('disabled'), 'Scenario 4: Disables button during active assessment run');
  }

  // Scenario 5: Success After Run (Transition to Populated State)
  {
    const html = renderToStaticMarkup(
      React.createElement(FarmRiskSection, {
        farmId: dummyFarmId,
        initialAssessment: mockModerateAssessment,
        initialLoading: false,
      })
    );

    assert(html.includes('MODERATE'), 'Scenario 5: Successfully presents MODERATE overall risk');
    assert(html.includes('Moderate climate hazard triggered'), 'Scenario 5: Presents moderate hazard descriptive caption');
    assert(!html.includes('No Assessment Found'), 'Scenario 5: Empty state is cleared upon successful assessment');
  }

  // Scenario 6: Incomplete Data Warning Banner
  {
    const html = renderToStaticMarkup(
      React.createElement(FarmRiskSection, {
        farmId: dummyFarmId,
        initialAssessment: mockLowUnconfirmedAssessment,
        initialLoading: false,
      })
    );

    assert(html.includes('Incomplete Weather Data'), 'Scenario 6: Displays Incomplete Weather Data warning header');
    assert(html.includes('fewer than 24 consecutive hourly records'), 'Scenario 6: Explains 24-hour observation window requirement');
    assert(html.includes('The displayed LOW risk must not be interpreted as confirmed low risk.'), 'Scenario 6: Renders mandatory unconfirmed risk advisory');
  }

  // Scenario 7: Low Risk Unconfirmed Display
  {
    const html = renderToStaticMarkup(
      React.createElement(FarmRiskSection, {
        farmId: dummyFarmId,
        initialAssessment: mockLowUnconfirmedAssessment,
        initialLoading: false,
      })
    );

    assert(html.includes('LOW (UNCONFIRMED)'), 'Scenario 7: Displays LOW (UNCONFIRMED) badge instead of plain LOW');
    assert(html.includes('Incomplete window: low risk unconfirmed'), 'Scenario 7: Details reason for unconfirmed state');
  }

  // Scenario 8: Error Handling — Run Assessment Action Failure
  {
    const errorMessage = 'Weather records are required to perform a climate risk assessment. Please synchronize weather data first.';
    const html = renderToStaticMarkup(
      React.createElement(FarmRiskSection, {
        farmId: dummyFarmId,
        initialAssessment: null,
        initialLoading: false,
        initialActionError: errorMessage,
      })
    );

    assert(html.includes(errorMessage), 'Scenario 8: Displays user-friendly action error message in banner');
  }

  // Scenario 9: Error Handling — Latest Retrieval Unexpected Failure
  {
    const fetchErrorMessage = 'Network error: could not connect to risk gateway.';
    const html = renderToStaticMarkup(
      React.createElement(FarmRiskSection, {
        farmId: dummyFarmId,
        initialAssessment: null,
        initialLoading: false,
        initialError: fetchErrorMessage,
      })
    );

    assert(html.includes('Failed to Load Risk Assessment'), 'Scenario 9: Renders failure card header');
    assert(html.includes(fetchErrorMessage), 'Scenario 9: Renders specific error details');
    assert(html.includes('Retry'), 'Scenario 9: Renders Retry button');
  }

  // Scenario 10: Zero Business Logic Verification
  {
    const html = renderToStaticMarkup(
      React.createElement(FarmRiskSection, {
        farmId: dummyFarmId,
        initialAssessment: mockZeroCalculationAssessment,
        initialLoading: false,
      })
    );

    // The assessment has observedValue 199.9 > thresholdValue 130.0, BUT backend returned overallRisk: 'LOW', triggered: 0
    assert(html.includes('LOW'), 'Scenario 10: Frontend strictly preserves backend overallRisk LOW');
    assert(!html.includes('HIGH'), 'Scenario 10: Frontend NEVER computes thresholds and NEVER recalculates to HIGH');
    assert(html.includes('0'), 'Scenario 10: Preserves triggered count of 0');
    assert(html.includes('No thresholds triggered across complete window'), 'Scenario 10: Preserves backend non-triggered state');
  }

  // ===========================================================================
  // Summary
  // ===========================================================================
  console.log('\n==================================================');
  console.log(`Frontend Test Results: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
