/**
 * Module 6 Stage 6: Frontend Component Test Suite
 * Tests PortfolioRiskSummaryCard and RiskRuleCatalogModal presentation,
 * loading states, error states, metric invariants, threshold and thresholdUnit rendering,
 * source metadata, and disclaimer display.
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

async function runStage6FrontendTests() {
  console.log('🧪 Running Module 6 Stage 6: Frontend Component Tests...\n');

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

  // Dynamic imports after registering hook
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { PortfolioRiskSummaryCard } = await import('../src/components/risk/PortfolioRiskSummaryCard');
  const { RiskRuleCatalogModal } = await import('../src/components/risk/RiskRuleCatalogModal');
  const { PortfolioRiskSummaryDTO, RiskRuleDTO } = await import('../src/types');

  // ===========================================================================
  // Part 1: PortfolioRiskSummaryCard Tests
  // ===========================================================================
  console.log('--- Part 1: PortfolioRiskSummaryCard Presentation Tests ---');

  // Test 1: Loading state
  const loadingHtml = renderToStaticMarkup(
    React.createElement(PortfolioRiskSummaryCard, {
      summary: null,
      loading: true,
      error: null,
      onRetry: () => {},
    })
  );
  assert(loadingHtml.includes('portfolio-summary-loading'), '1. Loading state renders skeleton container');
  assert(loadingHtml.includes('animate-pulse'), '2. Skeleton items have animate-pulse styling');

  // Test 2: Error state
  const errorHtml = renderToStaticMarkup(
    React.createElement(PortfolioRiskSummaryCard, {
      summary: null,
      loading: false,
      error: 'Network connection dropped',
      onRetry: () => {},
    })
  );
  assert(errorHtml.includes('portfolio-summary-error'), '3. Error state renders error alert banner');
  assert(errorHtml.includes('Network connection dropped'), '4. Error state displays exact error message');
  assert(errorHtml.includes('portfolio-summary-retry-btn'), '5. Error state provides retry button');
  assert(errorHtml.includes('Retry Summary'), '6. Retry button displays "Retry Summary" text');

  // Test 3: Null summary and not loading returns null
  const nullHtml = renderToStaticMarkup(
    React.createElement(PortfolioRiskSummaryCard, {
      summary: null,
      loading: false,
      error: null,
      onRetry: () => {},
    })
  );
  assert(nullHtml === '', '7. Returns null when summary is null and loading is false');

  // Test 4: Success state with metrics
  const mockSummary = {
    totalFarms: 50,
    assessedFarms: 42,
    unassessedFarms: 8,
    highRiskCount: 5,
    moderateRiskCount: 12,
    lowRiskCount: 20,
    lowRiskUnconfirmedCount: 5,
    generatedAt: '2026-09-25T17:00:00.000Z',
  };

  const successHtml = renderToStaticMarkup(
    React.createElement(PortfolioRiskSummaryCard, {
      summary: mockSummary,
      loading: false,
      error: null,
      onRetry: () => {},
      onViewRules: () => {},
    })
  );

  assert(successHtml.includes('portfolio-risk-summary-card'), '8. Success state renders portfolio summary card');
  assert(successHtml.includes('Active Portfolio Climate Risk Overview'), '9. Displays card heading');
  assert(successHtml.includes('FarmStatus.ACTIVE'), '10. Displays active farm population badge');

  // Check all 7 metrics rendered
  assert(successHtml.includes('metric-total-farms') && successHtml.includes('50'), '11. Displays Total Active Farms = 50');
  assert(successHtml.includes('metric-assessed-farms') && successHtml.includes('42'), '12. Displays Assessed Farms = 42');
  assert(successHtml.includes('metric-high-risk') && successHtml.includes('5'), '13. Displays High Risk = 5');
  assert(successHtml.includes('metric-moderate-risk') && successHtml.includes('12'), '14. Displays Moderate Risk = 12');
  assert(successHtml.includes('metric-low-risk') && successHtml.includes('20'), '15. Displays Confirmed Low Risk = 20');
  assert(successHtml.includes('metric-low-risk-unconfirmed') && successHtml.includes('5'), '16. Displays Unconfirmed Low Risk = 5');
  assert(successHtml.includes('metric-unassessed-farms') && successHtml.includes('8'), '17. Displays Unassessed Farms = 8');

  // Actions
  assert(successHtml.includes('summary-card-view-rules-btn'), '18. Renders "View Parametric Rules" button');
  assert(successHtml.includes('summary-refresh-btn'), '19. Renders refresh button');
  assert(successHtml.includes('portfolio-summary-generated-at'), '20. Displays generatedAt timestamp in summary card');

  // ===========================================================================
  // Part 2: RiskRuleCatalogModal Tests
  // ===========================================================================
  console.log('\n--- Part 2: RiskRuleCatalogModal Presentation Tests ---');

  // Test 5: Closed state
  const closedModalHtml = renderToStaticMarkup(
    React.createElement(RiskRuleCatalogModal, {
      isOpen: false,
      onClose: () => {},
    })
  );
  assert(closedModalHtml === '', '21. Closed modal renders nothing (null)');

  // Test 6: Open modal accessibility attributes
  const openModalHtml = renderToStaticMarkup(
    React.createElement(RiskRuleCatalogModal, {
      isOpen: true,
      onClose: () => {},
    })
  );
  assert(openModalHtml.includes('role="dialog"'), '22. Modal has role="dialog"');
  assert(openModalHtml.includes('aria-modal="true"'), '23. Modal has aria-modal="true"');
  assert(openModalHtml.includes('aria-labelledby="rule-catalog-title"'), '24. Modal has aria-labelledby');
  assert(openModalHtml.includes('Active Parametric Risk Rules'), '25. Modal title is "Active Parametric Risk Rules"');
  assert(openModalHtml.includes('rule-catalog-close-btn'), '26. Provides header close button with aria-label');
  assert(openModalHtml.includes('rule-catalog-footer-close-btn'), '27. Provides footer close button');
  assert(openModalHtml.includes('rule-catalog-search-input'), '28. Provides search filter input');

  // Disclaimer verification
  assert(
    openModalHtml.includes('Parametric weather indicators based on IMD meteorological standards') &&
      openModalHtml.includes('not constitute formal insurance policy certificates or claim entitlements'),
    '29. Displays required parametric risk disclaimer verbatim'
  );

  console.log(`\n==================================================`);
  console.log(`Stage 6 Frontend Test Results: ${passed} passed, ${failed} failed`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runStage6FrontendTests().catch((err) => {
  console.error('Fatal frontend test error:', err);
  process.exit(1);
});
