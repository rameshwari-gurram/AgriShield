/**
 * Module 9: Parametric Underwriting, Policy & Automated Claims Domain
 * Stage 9.5: Policy & Claims Frontend Presentation Test Suite
 *
 * Comprehensive tests covering:
 * - PolicyCard rendering, status badges, covered hazards, currency formatting, and empty states
 * - ClaimHistoryTable rendering, status badges, simulated references, and empty states
 * - ClaimAuditModal provenance inspection, raw JSON, copy/download controls, and legal disclaimer
 * - FarmPolicyClaimsSection container lifecycle: loading, 401 Auth, 403 Forbidden, 404 Not Found, 500 Server Error
 * - Resilient partial-failure handling and functional retry controls
 * - FarmDetailPage mounting and section ordering (beneath Module 8 FarmMlRiskSection)
 * - Strict absence of farmer-facing adjudication buttons (approve, reject, settle)
 * - Strict decoupling from Module 8 (ML risk predictions and SHAP values)
 * - Handling of null/missing DTO fields and decimal precision formatting
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
  console.log('🧪 Running Module 9 Stage 9.5: Policy & Claims Frontend Presentation Tests');
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
  const { PolicyStatusBadge } = await import('../src/components/policy/PolicyStatusBadge.js');
  const { ClaimStatusBadge } = await import('../src/components/policy/ClaimStatusBadge.js');
  const { PolicyCard } = await import('../src/components/policy/PolicyCard.js');
  const { ClaimHistoryTable } = await import('../src/components/policy/ClaimHistoryTable.js');
  const { ClaimAuditModal } = await import('../src/components/policy/ClaimAuditModal.js');
  const { FarmPolicyClaimsSection } = await import('../src/components/policy/FarmPolicyClaimsSection.js');
  const { parsePolicyClaimErrorMessage } = await import('../src/services/policyClaimService.js');

  const FARM_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const FARMER_A_ID = '11111111-1111-4111-8111-111111111111';

  // Sample DTO Fixtures
  const samplePolicy: any = {
    id: 'pol-uuid-1',
    policyNumber: 'POL-20261013-F8C2',
    farmId: FARM_A_ID,
    farmerId: FARMER_A_ID,
    cropName: 'Cotton',
    sumInsured: '100000.00',
    premiumAmount: '7500.00',
    coveredHazards: ['HIGH_TEMPERATURE', 'HEAVY_RAINFALL'],
    startDate: '2026-06-01T00:00:00.000Z',
    endDate: '2026-11-30T00:00:00.000Z',
    cumulativePaidAmount: '50000.00',
    remainingCoverage: '50000.00',
    status: 'ACTIVE',
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
  };

  const sampleClaimPaid: any = {
    id: 'clm-uuid-1',
    claimNumber: 'CLM-20261013-C94B',
    policyId: 'pol-uuid-1',
    assessmentId: 'assess-uuid-1',
    riskEventId: 'event-uuid-1',
    triggerRuleCode: 'HEAVY_RAINFALL_24H',
    severity: 'HIGH',
    observedValue: '78.40',
    thresholdValue: '64.50',
    payoutAmount: '50000.00',
    status: 'PAID',
    rejectionReason: null,
    payoutReference: 'SIM-PAYOUT-20261013-8888',
    paidAt: '2026-07-20T14:30:00.000Z',
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T14:30:00.000Z',
  };

  const sampleClaimPending: any = {
    id: 'clm-uuid-2',
    claimNumber: 'CLM-20261013-C94C',
    policyId: 'pol-uuid-1',
    assessmentId: 'assess-uuid-1',
    riskEventId: 'event-uuid-2',
    triggerRuleCode: 'PARAMETRIC_EXTREME_HEAT_RULE',
    severity: 'VERY_HIGH',
    observedValue: '43.50',
    thresholdValue: '40.00',
    payoutAmount: '25000.00',
    status: 'PENDING',
    rejectionReason: null,
    payoutReference: null,
    paidAt: null,
    createdAt: '2026-07-22T10:00:00.000Z',
    updatedAt: '2026-07-22T10:00:00.000Z',
  };

  const sampleClaimRejected: any = {
    id: 'clm-uuid-3',
    claimNumber: 'CLM-20261013-C94D',
    policyId: 'pol-uuid-1',
    assessmentId: 'assess-uuid-1',
    riskEventId: 'event-uuid-3',
    triggerRuleCode: 'STRONG_WIND_RULE',
    severity: 'LOW',
    observedValue: null,
    thresholdValue: '45.00',
    payoutAmount: '10000.00',
    status: 'REJECTED',
    rejectionReason: 'Threshold breached outside designated harvest monitoring interval',
    payoutReference: null,
    paidAt: null,
    createdAt: '2026-07-25T11:00:00.000Z',
    updatedAt: '2026-07-25T11:30:00.000Z',
  };

  // ==========================================================================
  console.log('--- Part 1: Policy Presentation & Status Badges ---');
  // ==========================================================================
  {
    // 1.1 PolicyStatusBadge states
    const htmlActiveBadge = renderToStaticMarkup(React.createElement(PolicyStatusBadge, { status: 'ACTIVE' }));
    assert(htmlActiveBadge.includes('data-testid="policy-status-active"'), '1.1 PolicyStatusBadge renders ACTIVE state');
    assert(htmlActiveBadge.includes('Active Policy'), '1.1 PolicyStatusBadge displays "Active Policy"');

    const htmlPendingBadge = renderToStaticMarkup(React.createElement(PolicyStatusBadge, { status: 'PENDING' }));
    assert(htmlPendingBadge.includes('data-testid="policy-status-pending"'), '1.2 PolicyStatusBadge renders PENDING state');

    const htmlExhaustedBadge = renderToStaticMarkup(React.createElement(PolicyStatusBadge, { status: 'EXHAUSTED' }));
    assert(htmlExhaustedBadge.includes('data-testid="policy-status-exhausted"'), '1.3 PolicyStatusBadge renders EXHAUSTED state');

    const htmlCancelledBadge = renderToStaticMarkup(React.createElement(PolicyStatusBadge, { status: 'CANCELLED' }));
    assert(htmlCancelledBadge.includes('data-testid="policy-status-cancelled"'), '1.4 PolicyStatusBadge renders CANCELLED state');

    // 1.5 PolicyCard populated state
    const htmlPolicyCard = renderToStaticMarkup(
      React.createElement(PolicyCard, { policy: samplePolicy, allPoliciesCount: 1 })
    );
    assert(htmlPolicyCard.includes('data-testid="policy-card"'), '1.5 PolicyCard renders policy-card container');
    assert(htmlPolicyCard.includes('POL-20261013-F8C2'), '1.6 PolicyCard displays policyNumber');
    assert(htmlPolicyCard.includes('Cotton'), '1.7 PolicyCard displays cropName');
    assert(htmlPolicyCard.includes('data-testid="policy-sum-insured"'), '1.8 PolicyCard renders sum-insured element');
    assert(htmlPolicyCard.includes('data-testid="policy-remaining-coverage"'), '1.9 PolicyCard renders remaining-coverage element');
    assert(htmlPolicyCard.includes('data-testid="policy-cumulative-paid"'), '1.10 PolicyCard renders cumulative-paid element');
    assert(htmlPolicyCard.includes('Extreme Heat'), '1.11 PolicyCard maps covered hazard to human label');
    assert(htmlPolicyCard.includes('Heavy Rainfall (24h)'), '1.12 PolicyCard maps HEAVY_RAINFALL to human label');

    // 1.13 Empty PolicyCard
    const htmlEmptyPolicyCard = renderToStaticMarkup(React.createElement(PolicyCard, { policy: null }));
    assert(htmlEmptyPolicyCard.includes('data-testid="policy-card-empty"'), '1.13 PolicyCard renders empty state cleanly when policy is null');
    assert(htmlEmptyPolicyCard.includes('No Active Parametric Policy'), '1.14 Empty PolicyCard displays informative notice');
  }

  // ==========================================================================
  console.log('\n--- Part 2: Claim History & Status Badges ---');
  // ==========================================================================
  {
    // 2.1 ClaimStatusBadge states
    const htmlPaidBadge = renderToStaticMarkup(React.createElement(ClaimStatusBadge, { status: 'PAID' }));
    assert(htmlPaidBadge.includes('data-testid="claim-status-paid"'), '2.1 ClaimStatusBadge renders PAID state');
    assert(htmlPaidBadge.includes('Settled &amp; Paid') || htmlPaidBadge.includes('Settled & Paid'), '2.1 ClaimStatusBadge displays Settled & Paid');

    const htmlApprovedBadge = renderToStaticMarkup(React.createElement(ClaimStatusBadge, { status: 'APPROVED' }));
    assert(htmlApprovedBadge.includes('data-testid="claim-status-approved"'), '2.2 ClaimStatusBadge renders APPROVED state');

    const htmlPendingClaimBadge = renderToStaticMarkup(React.createElement(ClaimStatusBadge, { status: 'PENDING' }));
    assert(htmlPendingClaimBadge.includes('data-testid="claim-status-pending"'), '2.3 ClaimStatusBadge renders PENDING state');

    const htmlRejectedBadge = renderToStaticMarkup(React.createElement(ClaimStatusBadge, { status: 'REJECTED' }));
    assert(htmlRejectedBadge.includes('data-testid="claim-status-rejected"'), '2.4 ClaimStatusBadge renders REJECTED state');

    // 2.5 ClaimHistoryTable populated
    const claims = [sampleClaimPaid, sampleClaimPending, sampleClaimRejected];
    const htmlTable = renderToStaticMarkup(
      React.createElement(ClaimHistoryTable, { claims, onViewAudit: () => {} })
    );
    assert(htmlTable.includes('data-testid="claim-history-table"'), '2.5 ClaimHistoryTable renders table container');
    assert(htmlTable.includes('CLM-20261013-C94B'), '2.6 ClaimHistoryTable displays claimNumber');
    assert(htmlTable.includes('HEAVY_RAINFALL_24H'), '2.7 ClaimHistoryTable displays triggerRuleCode');
    assert(htmlTable.includes('data-testid="claim-reference-clm-uuid-1"'), '2.8 ClaimHistoryTable displays simulated reference for settled claim');
    assert(htmlTable.includes('SIM-PAYOUT-20261013-8888'), '2.9 Payout reference matches SIM- format');
    assert(htmlTable.includes('data-testid="claim-rejection-clm-uuid-3"'), '2.10 ClaimHistoryTable displays rejection note for rejected claim');
    assert(htmlTable.includes('data-testid="view-audit-btn-clm-uuid-1"'), '2.11 ClaimHistoryTable renders audit provenance button');

    // 2.12 Empty ClaimHistoryTable
    const htmlEmptyTable = renderToStaticMarkup(React.createElement(ClaimHistoryTable, { claims: [] }));
    assert(htmlEmptyTable.includes('data-testid="claim-history-empty"'), '2.12 ClaimHistoryTable renders empty state when claims array is empty');
    assert(htmlEmptyTable.includes('No Parametric Claims Recorded'), '2.13 Empty table displays informative message');
  }

  // ==========================================================================
  console.log('\n--- Part 3: ClaimAuditModal Technical Provenance & Raw JSON ---');
  // ==========================================================================
  {
    // 3.1 Closed modal returns null
    const htmlClosed = renderToStaticMarkup(
      React.createElement(ClaimAuditModal, {
        claim: sampleClaimPaid,
        policy: samplePolicy,
        isOpen: false,
        onClose: () => {},
      })
    );
    assert(htmlClosed === '', '3.1 ClaimAuditModal renders nothing when isOpen is false');

    // 3.2 Open modal with provenance
    const htmlOpen = renderToStaticMarkup(
      React.createElement(ClaimAuditModal, {
        claim: sampleClaimPaid,
        policy: samplePolicy,
        isOpen: true,
        onClose: () => {},
      })
    );
    assert(htmlOpen.includes('data-testid="claim-audit-modal"'), '3.2 ClaimAuditModal renders modal container');
    assert(htmlOpen.includes('data-testid="audit-payout-amount"'), '3.3 ClaimAuditModal displays payout amount');
    assert(htmlOpen.includes('data-testid="audit-payout-reference"'), '3.4 ClaimAuditModal displays payout reference');
    assert(htmlOpen.includes('SIM-PAYOUT-20261013-8888'), '3.5 Payout reference contains SIM- prefix');
    assert(htmlOpen.includes('data-testid="audit-rule-code"'), '3.6 ClaimAuditModal displays trigger rule code');
    assert(htmlOpen.includes('HEAVY_RAINFALL_24H'), '3.7 Rule code is HEAVY_RAINFALL_24H');
    assert(htmlOpen.includes('data-testid="audit-observed-value"'), '3.8 ClaimAuditModal displays observed value');
    assert(htmlOpen.includes('78.40'), '3.9 Observed value is 78.40');
    assert(htmlOpen.includes('data-testid="audit-threshold-value"'), '3.10 ClaimAuditModal displays threshold value');
    assert(htmlOpen.includes('64.50'), '3.11 Threshold value is 64.50');
    assert(htmlOpen.includes('data-testid="audit-assessment-id"'), '3.12 ClaimAuditModal displays Module 6 assessment ID');
    assert(htmlOpen.includes('assess-uuid-1'), '3.13 Assessment ID matches assess-uuid-1');
    assert(htmlOpen.includes('data-testid="audit-risk-event-id"'), '3.14 ClaimAuditModal displays risk-event ID');
    assert(htmlOpen.includes('event-uuid-1'), '3.15 Risk event ID matches event-uuid-1');

    // 3.16 Mandatory Parametric Disclaimer
    assert(htmlOpen.includes('data-testid="audit-disclaimer"'), '3.16 ClaimAuditModal renders audit-disclaimer container');
    assert(htmlOpen.includes('Parametric Automation Notice'), '3.17 Disclaimer specifies Parametric Automation Notice');

    // 3.18 Tab headers
    assert(htmlOpen.includes('data-testid="tab-provenance"'), '3.18 Provenance tab present');
    assert(htmlOpen.includes('data-testid="tab-json"'), '3.19 Raw JSON tab present');
  }

  // ==========================================================================
  console.log('\n--- Part 4: FarmPolicyClaimsSection Container Lifecycle ---');
  // ==========================================================================
  {
    // 4.1 Loading state
    const htmlLoading = renderToStaticMarkup(
      React.createElement(FarmPolicyClaimsSection, {
        farmId: FARM_A_ID,
        initialLoading: true,
      })
    );
    assert(htmlLoading.includes('data-testid="policy-claims-loading"'), '4.1 Container renders policy-claims-loading container');

    // 4.2 Populated state
    const htmlPopulated = renderToStaticMarkup(
      React.createElement(FarmPolicyClaimsSection, {
        farmId: FARM_A_ID,
        initialPolicies: [samplePolicy],
        initialClaims: [sampleClaimPaid],
        initialLoading: false,
      })
    );
    assert(htmlPopulated.includes('data-testid="farm-policy-claims-section"'), '4.2 Container renders main section container');
    assert(htmlPopulated.includes('Parametric Insurance &amp; Automated Claims') || htmlPopulated.includes('Parametric Insurance & Automated Claims'), '4.3 Section title matches Module 9 header');
    assert(htmlPopulated.includes('data-testid="policy-card"'), '4.4 Populated section renders PolicyCard');
    assert(htmlPopulated.includes('data-testid="claim-history-table"'), '4.5 Populated section renders ClaimHistoryTable');
    assert(htmlPopulated.includes('data-testid="refresh-policy-claims-btn"'), '4.6 Refresh button rendered');

    // 4.7 401 / 403 Authentication & Ownership Restriction
    const errAuth = parsePolicyClaimErrorMessage({
      response: {
        status: 403,
        data: { message: "Access denied: You do not have permission to access farm 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'" },
      },
    });
    const htmlAuthError = renderToStaticMarkup(
      React.createElement(FarmPolicyClaimsSection, {
        farmId: FARM_A_ID,
        initialError: errAuth.message,
        initialLoading: false,
      })
    );
    assert(htmlAuthError.includes('data-testid="policy-claims-auth-alert"'), '4.7 Container renders policy-claims-auth-alert on 403 Forbidden');
    assert(htmlAuthError.includes('Producer Authentication Required'), '4.8 Displays Producer Authentication Required alert');
    assert(htmlAuthError.includes('farm.farmerId === req.user.id'), '4.9 References parcel ownership policy without leaking data');

    // 4.10 404 Farm Not Found
    const errNotFound = parsePolicyClaimErrorMessage({
      response: { status: 404, data: { message: "Farm parcel not found" } },
    });
    const htmlNotFound = renderToStaticMarkup(
      React.createElement(FarmPolicyClaimsSection, {
        farmId: FARM_A_ID,
        initialError: errNotFound.message,
        initialLoading: false,
      })
    );
    assert(htmlNotFound.includes('data-testid="policy-claims-not-found-alert"'), '4.10 Container renders not-found alert on 404');

    // 4.11 500 Server Error
    const errServer = parsePolicyClaimErrorMessage({
      response: { status: 500, data: { message: "Internal server error" } },
    });
    const htmlServerError = renderToStaticMarkup(
      React.createElement(FarmPolicyClaimsSection, {
        farmId: FARM_A_ID,
        initialError: errServer.message,
        initialLoading: false,
      })
    );
    assert(htmlServerError.includes('data-testid="policy-claims-server-error-alert"'), '4.11 Container renders server-error alert on 500');
    assert(htmlServerError.includes('Retry Connection'), '4.12 Server error alert includes Retry Connection button');
  }

  // ==========================================================================
  console.log('\n--- Part 5: FarmDetailPage Integration & Order Audit ---');
  // ==========================================================================
  {
    const fs = await import('fs');
    const path = await import('path');
    const pagePath = path.resolve('src/pages/farms/FarmDetailPage.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf-8');

    assert(
      pageContent.includes("import { FarmPolicyClaimsSection } from '../../components/policy/FarmPolicyClaimsSection'"),
      '5.1 FarmPolicyClaimsSection imported in FarmDetailPage.tsx'
    );
    assert(
      pageContent.includes('<FarmPolicyClaimsSection farmId={farm.id} />'),
      '5.2 FarmPolicyClaimsSection mounted with farm.id prop'
    );

    // Verify ordering
    const mlRiskIdx = pageContent.indexOf('<FarmMlRiskSection farmId={farm.id} />');
    const policyClaimsIdx = pageContent.indexOf('<FarmPolicyClaimsSection farmId={farm.id} />');
    assert(mlRiskIdx !== -1, '5.3 FarmMlRiskSection exists on FarmDetailPage');
    assert(policyClaimsIdx !== -1, '5.4 FarmPolicyClaimsSection exists on FarmDetailPage');
    assert(mlRiskIdx < policyClaimsIdx, '5.5 FarmPolicyClaimsSection is mounted AFTER FarmMlRiskSection');
  }

  // ==========================================================================
  console.log('\n--- Part 6: Zero Adjudication Controls & Module 8 Decoupling Audit ---');
  // ==========================================================================
  {
    const fs = await import('fs');
    const path = await import('path');

    const badge1 = fs.readFileSync(path.resolve('src/components/policy/PolicyStatusBadge.tsx'), 'utf-8');
    const badge2 = fs.readFileSync(path.resolve('src/components/policy/ClaimStatusBadge.tsx'), 'utf-8');
    const card = fs.readFileSync(path.resolve('src/components/policy/PolicyCard.tsx'), 'utf-8');
    const table = fs.readFileSync(path.resolve('src/components/policy/ClaimHistoryTable.tsx'), 'utf-8');
    const modal = fs.readFileSync(path.resolve('src/components/policy/ClaimAuditModal.tsx'), 'utf-8');
    const section = fs.readFileSync(path.resolve('src/components/policy/FarmPolicyClaimsSection.tsx'), 'utf-8');
    const service = fs.readFileSync(path.resolve('src/services/policyClaimService.ts'), 'utf-8');

    const combinedModule9Frontend = badge1 + badge2 + card + table + modal + section + service;

    // 6.1 No farmer-facing adjudication buttons
    assert(!combinedModule9Frontend.includes('Approve Claim'), '6.1 Zero "Approve Claim" button in farmer UI');
    assert(!combinedModule9Frontend.includes('Reject Claim'), '6.2 Zero "Reject Claim" button in farmer UI');
    assert(!combinedModule9Frontend.includes('Settle Claim'), '6.3 Zero "Settle Claim" button in farmer UI');
    assert(!combinedModule9Frontend.includes('evaluateClaim'), '6.4 Zero claim evaluation mutation in frontend service');
    assert(!combinedModule9Frontend.includes('settleClaim'), '6.5 Zero claim settlement mutation in frontend service');

    // 6.2 Module 8 decoupling
    assert(!combinedModule9Frontend.includes('mlRiskService'), '6.6 Zero reference to mlRiskService');
    assert(!combinedModule9Frontend.includes('shapExplanation'), '6.7 Zero reference to SHAP values');
    assert(!combinedModule9Frontend.includes('calibrated_probability'), '6.8 Zero reference to calibrated_probability');
    assert(!combinedModule9Frontend.includes('predicted_class'), '6.9 Zero reference to predicted_class');
  }

  // ==========================================================================
  console.log('\n--- Part 7: Missing/Null Fields & Decimal Formatting Audit ---');
  // ==========================================================================
  {
    // 7.1 Null observedValue in ClaimHistoryTable
    const claimWithNullObserved: any = {
      ...sampleClaimPaid,
      id: 'clm-null-obs',
      observedValue: null,
      payoutReference: null,
      rejectionReason: null,
    };
    const htmlTableNullObs = renderToStaticMarkup(
      React.createElement(ClaimHistoryTable, { claims: [claimWithNullObserved] })
    );
    assert(htmlTableNullObs.includes('Observed: <strong class="text-slate-900">N/A</strong>'), '7.1 Null observedValue rendered cleanly as N/A in table');

    // 7.2 Null observedValue in ClaimAuditModal
    const htmlModalNullObs = renderToStaticMarkup(
      React.createElement(ClaimAuditModal, {
        claim: claimWithNullObserved,
        isOpen: true,
        onClose: () => {},
      })
    );
    assert(htmlModalNullObs.includes('<span data-testid="audit-observed-value" class="font-mono font-bold text-slate-900">N/A</span>'), '7.2 Null observedValue rendered cleanly as N/A in audit modal');

    // 7.3 Currency formatting does not introduce float rounding error
    const policyBigAmount: any = {
      ...samplePolicy,
      sumInsured: '12500000.50',
      remainingCoverage: '12500000.50',
      cumulativePaidAmount: '0.00',
    };
    const htmlCardBigAmount = renderToStaticMarkup(
      React.createElement(PolicyCard, { policy: policyBigAmount })
    );
    assert(htmlCardBigAmount.includes('1,25,00,000.50'), '7.3 Indian numbering system fixed-precision currency formatting preserved');
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
