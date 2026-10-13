/**
 * Module 8 Stage 8.3-E: ML Risk Advisory Frontend Presentation & Explainability Test Suite
 *
 * Comprehensive tests covering:
 * - API client request dispatch, query parameters (?forceRefresh), and response envelope parsing
 * - Calibrated probability formatting and binary predicted-class presentation (Class 0 vs Class 1)
 * - Cache status pill (isCached true vs false) and input fingerprint display
 * - Preservation of all 17 feature values and all 17 SHAP attributions in canonical order
 * - SHAP direction semantics (positive = pushes toward elevated risk, negative = protective factor)
 * - Full verbatim backend legal disclaimer presentation
 * - Additivity verification display (base_value + sum(shap) ≈ reconstructed_margin)
 * - Error mapping: 400 Insufficient Weather Data, 401 Auth, 403 Forbidden, 404 Not Found, 502, 503
 * - Orchestrating container component (FarmMlRiskSection) states: loading, empty, populated, tabs
 * - FarmDetailPage mounting and section ordering
 * - Strict isolation from Module 6 (climateRiskRuleEngine) and claims/payouts
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
  console.log('================================================================================');
  console.log('🧪 Running Module 8 Stage 8.3-E: ML Risk Frontend Presentation Tests');
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
  const { apiClient } = await import('../src/services/api.js');
  const { mlRiskService, parseMlRiskErrorMessage } = await import('../src/services/mlRiskService.js');
  const { CANONICAL_FEATURE_NAMES } = await import('../src/types/mlRisk.js');
  const { MlRiskScoreCard } = await import('../src/components/mlRisk/MlRiskScoreCard.js');
  const { ShapExplanationChart } = await import('../src/components/mlRisk/ShapExplanationChart.js');
  const { FarmMlRiskSection } = await import('../src/components/mlRisk/FarmMlRiskSection.js');

  const FARM_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const createSample17Features = (overrides: Record<string, any> = {}) => ({
    precipitation_sum_30d: 75.0,
    precipitation_sum_14d: 35.0,
    precipitation_std_30d: 2.12,
    consecutive_dry_days_max: 14,
    temp_max_30d: 42.0,
    temp_mean_30d: 33.5,
    temp_amplitude_mean_30d: 11.0,
    heat_wave_hours_30d: 12,
    relative_humidity_mean_30d: 42.0,
    vpd_mean_30d: 2.4,
    wind_speed_mean_30d: 15.0,
    wind_gust_max_30d: 29.0,
    ndvi_latest: 0.42,
    ndvi_trend_30d: -0.008,
    calculated_area_ha: 2.0,
    is_ndvi_available: 1,
    is_ndvi_trend_available: 1,
    ...overrides,
  });

  const createSamplePredictionDTO = (isCached: boolean = false, predictedClass: 0 | 1 = 0) => {
    const attributions = CANONICAL_FEATURE_NAMES.map((name, i) => {
      const shap_value = i % 2 === 0 ? 0.045 : -0.021;
      return {
        feature_name: name,
        feature_value: i === 12 ? 0.42 : i === 13 ? -0.008 : 10.0,
        shap_value,
        direction: shap_value > 0 ? 'pushes model toward class 1' : 'pushes model toward class 0',
        contribution_magnitude: Math.abs(shap_value),
      };
    });

    return {
      id: 'pred-7f8e3a2b-1c4d-4e5f-8a9b-0c1d2e3f4a5b',
      farmId: FARM_A_ID,
      assessedAt: '2026-09-20T12:00:00.000Z',
      inputFingerprint: '9f83c60518b44905fed020c049a31bb7520414600a6e0fa5bda5ac764bc59b8f',
      predictedClass,
      calibratedProbability: predictedClass === 1 ? 0.7425 : 0.3245,
      rawDecisionMargin: predictedClass === 1 ? 0.8521 : -0.4521,
      featureSnapshot: createSample17Features(),
      shapExplanation: {
        base_value: -1.3021,
        reconstructed_margin: predictedClass === 1 ? 0.8521 : -0.4521,
        additivity_error: 1.11e-15,
        attributions,
      },
      model: {
        modelName: 'AgriShield-Risk-HGB-Prototype',
        modelVersion: '1.0.0',
        featureContractVersion: 'v1.1',
      },
      disclaimer:
        'This prediction and SHAP explanation are generated by a prototype machine learning model trained on parameterized synthetic agronomic simulation data. They do not constitute validated real-world insurance claim determinations, payout guarantees, or actuarial risk assessments.',
      createdAt: '2026-10-12T07:45:00.000Z',
      isCached,
    };
  };

  // ==========================================================================
  console.log('--- Part 1: mlRiskService API Client Contract & Dispatch ---');
  // ==========================================================================
  {
    let calledUrl = '';
    let calledConfig: any = null;
    const originalGet = apiClient.get;

    apiClient.get = (async (url: string, config?: any) => {
      calledUrl = url;
      calledConfig = config;
      return {
        data: {
          success: true,
          message: 'Evaluation retrieved',
          data: createSamplePredictionDTO(false),
          timestamp: new Date().toISOString(),
        },
      };
    }) as any;

    try {
      // 1.1 Standard GET without forceRefresh
      const res1 = await mlRiskService.getFarmRisk(FARM_A_ID);
      assert(calledUrl === `/farms/${FARM_A_ID}/ml-risk`, '1.1 Calls endpoint /farms/:farmId/ml-risk');
      assert(calledConfig?.params === undefined, '1.1 Omits forceRefresh query param when omitted');
      assert(res1.data.farmId === FARM_A_ID, '1.1 Returns typed MlRiskPredictionDTO');

      // 1.2 Force refresh query param (?forceRefresh=true)
      await mlRiskService.getFarmRisk(FARM_A_ID, { forceRefresh: true });
      assert(calledConfig?.params?.forceRefresh === true, '1.2 Dispatches ?forceRefresh=true parameter');

      // 1.3 Authorization header forwarding
      await mlRiskService.getFarmRisk(FARM_A_ID, { token: 'mock-jwt-token' });
      assert(
        calledConfig?.headers?.Authorization === 'Bearer mock-jwt-token',
        '1.3 Forwards Authorization Bearer header when token is supplied'
      );
    } finally {
      apiClient.get = originalGet;
    }
  }

  // ==========================================================================
  console.log('\n--- Part 2: Error Normalization & Translation ---');
  // ==========================================================================
  {
    // 2.1 Insufficient weather data (HTTP 400)
    const err400Weather = {
      response: {
        status: 400,
        data: {
          success: false,
          message: 'INSUFFICIENT_WEATHER_DATA: Weather records count (710) does not match required 720 hours',
        },
      },
    };
    const parsed400Weather = parseMlRiskErrorMessage(err400Weather);
    assert(parsed400Weather.isInsufficientData === true, '2.1 Detects INSUFFICIENT_WEATHER_DATA on HTTP 400');
    assert(parsed400Weather.message.includes('continuous 30-day (720-hour)'), '2.1 Provides clear 720h guidance');

    // 2.2 Generic 400 Bad Request
    const err400Generic = {
      response: {
        status: 400,
        data: { success: false, message: 'Invalid query parameter' },
      },
    };
    const parsed400Generic = parseMlRiskErrorMessage(err400Generic);
    assert(parsed400Generic.isInsufficientData === false, '2.2 Generic 400 does NOT flag insufficient data');
    assert(parsed400Generic.message === 'Invalid query parameter', '2.2 Preserves backend error message');

    // 2.3 Authentication Required (HTTP 401)
    const err401 = { response: { status: 401, data: { message: 'Token missing' } } };
    const parsed401 = parseMlRiskErrorMessage(err401);
    assert(parsed401.isAuthError === true, '2.3 Flags 401 as isAuthError');
    assert(parsed401.message.includes('Authentication Required'), '2.3 Provides authentication notice');

    // 2.4 Access Denied / Ownership (HTTP 403)
    const err403 = { response: { status: 403, data: { message: 'Access denied' } } };
    const parsed403 = parseMlRiskErrorMessage(err403);
    assert(parsed403.isAuthError === true, '2.4 Flags 403 as isAuthError');
    assert(parsed403.message.includes('Access Denied'), '2.4 Provides access denied notice');

    // 2.5 Farm Not Found (HTTP 404)
    const err404 = { response: { status: 404, data: { message: 'Farm not found' } } };
    const parsed404 = parseMlRiskErrorMessage(err404);
    assert(parsed404.isNotFound === true, '2.5 Flags 404 as isNotFound');

    // 2.6 ML Microservice Unavailable / Timeout (HTTP 503)
    const err503 = { response: { status: 503, data: { message: 'Service timed out' } } };
    const parsed503 = parseMlRiskErrorMessage(err503);
    assert(parsed503.isServiceUnavailable === true, '2.6 Flags 503 as isServiceUnavailable');
    assert(parsed503.message.includes('8000ms bound'), '2.6 Mentions 8000ms service bound');

    // 2.7 Bad Gateway (HTTP 502)
    const err502 = { response: { status: 502, data: { message: 'Invalid upstream response' } } };
    const parsed502 = parseMlRiskErrorMessage(err502);
    assert(parsed502.statusCode === 502, '2.7 Preserves HTTP 502 status');
    assert(parsed502.message.includes('ML Gateway Error'), '2.7 Prefixes with ML Gateway Error');
  }

  // ==========================================================================
  console.log('\n--- Part 3: MlRiskScoreCard Component Presentation ---');
  // ==========================================================================
  {
    const sampleClass0 = createSamplePredictionDTO(false, 0); // Normal Risk
    const htmlClass0 = renderToStaticMarkup(
      React.createElement(MlRiskScoreCard, { prediction: sampleClass0 })
    );

    // 3.1 Probability & Classification
    assert(htmlClass0.includes('32.5%'), '3.1 Probability 0.3245 formatted as 32.5%');
    assert(htmlClass0.includes('Normal Agronomic Risk (Class 0)'), '3.1 Class 0 rendered as Normal Agronomic Risk');
    assert(htmlClass0.includes('bg-emerald'), '3.1 Class 0 styled with emerald theme');

    // 3.2 Decision Margin
    assert(htmlClass0.includes('-0.4521'), '3.2 Raw decision margin rendered with sign (-0.4521)');

    // 3.3 Cache Status: Fresh
    assert(htmlClass0.includes('Fresh Evaluation'), '3.3 isCached: false renders Fresh Evaluation pill');

    // 3.4 Model Metadata
    assert(htmlClass0.includes('AgriShield-Risk-HGB-Prototype'), '3.4 Displays modelName');
    assert(htmlClass0.includes('v1.0.0'), '3.4 Displays modelVersion');
    assert(htmlClass0.includes('Contract v1.1'), '3.4 Displays featureContractVersion');
    assert(htmlClass0.includes('9f83c60518b44905fed020c049a31bb7520414600a6e0fa5bda5ac764bc59b8f'), '3.4 Displays input fingerprint');

    // 3.5 Verbatim Backend Disclaimer
    assert(htmlClass0.includes('parameterized synthetic agronomic simulation data'), '3.5 Renders verbatim backend disclaimer');
    assert(htmlClass0.includes('governed exclusively by statutory weather threshold rules (Module 6)'), '3.5 Renders statutory insurance separation notice');

    // 3.6 Class 1 (Elevated Risk) presentation
    const sampleClass1 = createSamplePredictionDTO(true, 1); // Cached, Elevated
    const htmlClass1 = renderToStaticMarkup(
      React.createElement(MlRiskScoreCard, { prediction: sampleClass1 })
    );
    assert(htmlClass1.includes('74.3%'), '3.6 Probability 0.7425 formatted as 74.3%');
    assert(htmlClass1.includes('Elevated Stress Risk (Class 1)'), '3.6 Class 1 rendered as Elevated Stress Risk');
    assert(htmlClass1.includes('bg-rose'), '3.6 Class 1 styled with rose theme');
    assert(htmlClass1.includes('+0.8521'), '3.6 Positive margin rendered with explicit plus sign (+0.8521)');
    assert(htmlClass1.includes('Cached Evaluation'), '3.6 isCached: true renders Cached Evaluation pill');
  }

  // ==========================================================================
  console.log('\n--- Part 4: ShapExplanationChart Component Presentation ---');
  // ==========================================================================
  {
    const samplePred = createSamplePredictionDTO(false, 0);
    const htmlChart = renderToStaticMarkup(
      React.createElement(ShapExplanationChart, {
        explanation: samplePred.shapExplanation,
        featureSnapshot: samplePred.featureSnapshot,
      })
    );

    // 4.1 All 17 features present
    for (const name of CANONICAL_FEATURE_NAMES) {
      assert(htmlChart.includes(`data-testid="attribution-row-${name}"`), `4.1 Attribution row rendered for ${name}`);
    }

    // 4.2 Mathematical Additivity Banner
    assert(htmlChart.includes('Mathematical Additivity Verified'), '4.2 Renders Additivity Verified banner');
    assert(htmlChart.includes('-1.3021'), '4.2 Renders expected base score φ₀');
    assert(htmlChart.includes('-0.4521'), '4.2 Renders reconstructed decision margin');

    // 4.3 Directional Badges
    assert(htmlChart.includes('+0.0450'), '4.3 Formats positive SHAP value with plus sign (+0.0450)');
    assert(htmlChart.includes('-0.0210'), '4.3 Formats negative SHAP value (-0.0210)');
    assert(htmlChart.includes('Increases risk probability'), '4.3 Explains positive SHAP pushes decision margin higher');
    assert(htmlChart.includes('Decreases risk probability'), '4.3 Explains negative SHAP decreases risk probability');

    // 4.4 Human-readable labels
    assert(htmlChart.includes('30-Day Cumulative Precipitation'), '4.4 Displays human label for precipitation_sum_30d');
    assert(htmlChart.includes('Latest Sentinel-2 Mean NDVI'), '4.4 Displays human label for ndvi_latest');

    // 4.5 Missing/Null NDVI handling
    const nullNdviFeatures = createSample17Features({
      ndvi_latest: null,
      ndvi_trend_30d: null,
      is_ndvi_available: 0,
      is_ndvi_trend_available: 0,
    });
    const htmlChartNullNdvi = renderToStaticMarkup(
      React.createElement(ShapExplanationChart, {
        explanation: samplePred.shapExplanation,
        featureSnapshot: nullNdviFeatures,
      })
    );
    assert(htmlChartNullNdvi.includes('Missing / Null (Native NaN)'), '4.5 Displays Missing / Null for null remote sensing features');
  }

  // ==========================================================================
  console.log('\n--- Part 5: FarmMlRiskSection Orchestrator Lifecycle ---');
  // ==========================================================================
  {
    // 5.1 Populated dashboard
    const samplePred = createSamplePredictionDTO(false, 0);
    const htmlPopulated = renderToStaticMarkup(
      React.createElement(FarmMlRiskSection, {
        farmId: FARM_A_ID,
        initialPrediction: samplePred,
        initialLoading: false,
      })
    );
    assert(htmlPopulated.includes('data-testid="farm-ml-risk-section"'), '5.1 Renders farm-ml-risk-section container');
    assert(htmlPopulated.includes('Module 8 — Advisory ML'), '5.1 Renders Module 8 — Advisory ML badge');
    assert(htmlPopulated.includes('data-testid="ml-risk-populated-dashboard"'), '5.1 Renders populated dashboard container');
    assert(htmlPopulated.includes('data-testid="ml-refresh-button"'), '5.1 Renders ML refresh button');

    // 5.2 Loading state
    const htmlLoading = renderToStaticMarkup(
      React.createElement(FarmMlRiskSection, {
        farmId: FARM_A_ID,
        initialLoading: true,
      })
    );
    assert(htmlLoading.includes('data-testid="ml-risk-loading"'), '5.2 Renders ml-risk-loading container');

    // 5.3 Empty state
    const htmlEmpty = renderToStaticMarkup(
      React.createElement(FarmMlRiskSection, {
        farmId: FARM_A_ID,
        initialPrediction: null,
        initialLoading: false,
      })
    );
    assert(htmlEmpty.includes('data-testid="ml-risk-empty-state"'), '5.3 Renders ml-risk-empty-state container');
    assert(htmlEmpty.includes('Run Initial ML Risk Evaluation'), '5.3 Renders initial evaluation button in empty state');

    // 5.4 Error state: Insufficient weather data
    const htmlErrWeather = renderToStaticMarkup(
      React.createElement(FarmMlRiskSection, {
        farmId: FARM_A_ID,
        initialError: 'INSUFFICIENT_WEATHER_DATA: Weather records count (710) does not match required 720 hours',
        initialLoading: false,
      })
    );
    assert(htmlErrWeather.includes('data-testid="ml-risk-insufficient-data-alert"'), '5.4 Renders specialized insufficient weather alert');

    // 5.5 Error state: Authentication required
    const htmlErrAuth = renderToStaticMarkup(
      React.createElement(FarmMlRiskSection, {
        farmId: FARM_A_ID,
        initialError: 'Authentication Required: Access to advisory machine learning risk predictions requires an authenticated producer session.',
        initialLoading: false,
      })
    );
    assert(htmlErrAuth.includes('data-testid="ml-risk-auth-alert"'), '5.5 Renders specialized authentication required alert');

    // 5.6 Error state: Service unavailable
    const htmlErrUnavailable = renderToStaticMarkup(
      React.createElement(FarmMlRiskSection, {
        farmId: FARM_A_ID,
        initialError: 'ML Service Unavailable: The machine learning inference worker is currently unreachable or timed out (8000ms bound).',
        initialLoading: false,
      })
    );
    assert(htmlErrUnavailable.includes('data-testid="ml-risk-service-unavailable-alert"'), '5.6 Renders specialized 503 service unavailable alert');
  }

  // ==========================================================================
  console.log('\n--- Part 6: FarmDetailPage Integration Verification ---');
  // ==========================================================================
  {
    const fs = await import('fs');
    const path = await import('path');
    const pagePath = path.resolve('src/pages/farms/FarmDetailPage.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf-8');

    assert(pageContent.includes("import { FarmMlRiskSection } from '../../components/mlRisk/FarmMlRiskSection'"), '6.1 FarmMlRiskSection imported in FarmDetailPage');
    assert(pageContent.includes('<FarmMlRiskSection farmId={farm.id} />'), '6.2 FarmMlRiskSection mounted with farm.id prop');

    // Verify page order
    const riskSectionIdx = pageContent.indexOf('<FarmRiskSection farmId={farm.id} />');
    const mlRiskSectionIdx = pageContent.indexOf('<FarmMlRiskSection farmId={farm.id} />');
    assert(riskSectionIdx !== -1, '6.3 Module 6 FarmRiskSection exists on FarmDetailPage');
    assert(mlRiskSectionIdx !== -1, '6.4 Module 8 FarmMlRiskSection exists on FarmDetailPage');
    assert(riskSectionIdx < mlRiskSectionIdx, '6.5 Page order: Module 6 FarmRiskSection is placed BEFORE Module 8 FarmMlRiskSection');
  }

  // ==========================================================================
  console.log('\n--- Part 7: Module 6 & Claims/Payout Decoupling Audit ---');
  // ==========================================================================
  {
    const fs = await import('fs');
    const path = await import('path');

    const scoreCardCode = fs.readFileSync(path.resolve('src/components/mlRisk/MlRiskScoreCard.tsx'), 'utf-8');
    const chartCode = fs.readFileSync(path.resolve('src/components/mlRisk/ShapExplanationChart.tsx'), 'utf-8');
    const sectionCode = fs.readFileSync(path.resolve('src/components/mlRisk/FarmMlRiskSection.tsx'), 'utf-8');
    const serviceCode = fs.readFileSync(path.resolve('src/services/mlRiskService.ts'), 'utf-8');

    const combinedModule8Code = scoreCardCode + chartCode + sectionCode + serviceCode;

    assert(!combinedModule8Code.includes('climateRiskRuleEngine'), '7.1 Zero reference to climateRiskRuleEngine');
    assert(!combinedModule8Code.includes('riskAssessmentService'), '7.2 Zero reference to Module 6 riskAssessmentService');
    assert(!combinedModule8Code.includes('createRiskAssessment'), '7.3 Zero trigger of Module 6 rule assessment');
    assert(!combinedModule8Code.includes('payoutAmount') && !combinedModule8Code.includes('claimStatus'), '7.4 Zero payout or claim authorization logic');
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed across all checkpoints`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('❌ Test suite execution failed:', err);
  process.exit(1);
});
