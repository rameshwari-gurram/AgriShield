/**
 * Module 10: System Integration & Architectural Verification
 * Frontend Documentation & Roadmap Presentation Test Suite
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
  console.log('🧪 Running Module 10: DocsPage Architecture & Roadmap Verification Test');
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
  const { DocsPage } = await import('../src/pages/docs/DocsPage.js');

  const html = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(DocsPage, null)
    )
  );

  // 1. Overall Page Header
  assert(html.includes('System Architecture &amp; Documentation') || html.includes('System Architecture & Documentation'), '1.1 Renders page title');
  assert(html.includes('Development Roadmap &amp; Implementation Modules') || html.includes('Development Roadmap & Implementation Modules'), '1.2 Renders development roadmap section');

  // 2. All 10 Modules Present in Roadmap
  assert(html.includes('Module 1') && html.includes('Monorepo &amp; Diagnostic Foundation'), '2.1 Module 1 listed as Monorepo & Diagnostic Foundation');
  assert(html.includes('Module 2') && html.includes('Farmer Registration &amp; Identification'), '2.2 Module 2 listed as Farmer Registration & Identification');
  assert(html.includes('Module 3 &amp; 4') && html.includes('Farm Management &amp; Spatial Boundaries'), '2.3 Module 3 & 4 listed as Farm Management & Spatial Boundaries');
  assert(html.includes('Module 5') && html.includes('Weather Telemetry &amp; Aggregation'), '2.4 Module 5 listed as Weather Telemetry & Aggregation');
  assert(html.includes('Module 6 (Stage 1-5)') && html.includes('Climate Risk Rule Engine &amp; Provenance'), '2.5 Module 6 listed as Climate Risk Rule Engine & Provenance');
  assert(html.includes('Module 6 (Stage 6)') && html.includes('Portfolio Risk Summary &amp; Rule Transparency'), '2.6 Module 6 Stage 6 listed');
  assert(html.includes('Module 7') && html.includes('Copernicus Sentinel-2 Satellite &amp; NDVI Tracking'), '2.7 Module 7 listed as Copernicus Sentinel-2 Satellite & NDVI Tracking');
  assert(html.includes('Module 8') && html.includes('Advisory ML Risk Prediction &amp; SHAP Explainability'), '2.8 Module 8 listed as Advisory ML Risk Prediction & SHAP Explainability');
  assert(html.includes('Module 9') && html.includes('Parametric Policy Underwriting &amp; Claims Settlement'), '2.9 Module 9 listed as Parametric Policy Underwriting & Claims Settlement');
  assert(html.includes('Module 10') && html.includes('End-to-End System Integration &amp; Audit'), '2.10 Module 10 listed as End-to-End System Integration & Audit');

  // 3. Technical Reference Files
  assert(html.includes('docs/architecture.md'), '3.1 Lists docs/architecture.md');
  assert(html.includes('docs/api_weather.md'), '3.2 Lists docs/api_weather.md');
  assert(html.includes('docs/module6_risk_rules.md'), '3.3 Lists docs/module6_risk_rules.md');
  assert(html.includes('docs/module6_portfolio_alerts.md'), '3.4 Lists docs/module6_portfolio_alerts.md');
  assert(html.includes('docs/module9_parametric_policy_claims.md'), '3.5 Lists docs/module9_parametric_policy_claims.md');
  assert(html.includes('docs/module9_demo_runbook.md'), '3.6 Lists docs/module9_demo_runbook.md');

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed across all checkpoints`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
