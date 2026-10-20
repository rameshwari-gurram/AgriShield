/**
 * Module 10: System Integration & Architectural Verification
 * Route Exports and Gateway Symmetrical Structure Test
 */

import {
  v1Routes,
  healthRoutes,
  farmerRoutes,
  farmRoutes,
  farmBoundaryRoutes,
  weatherRoutes,
  riskAssessmentRoutes,
  farmRiskRoutes,
  riskRuleRoutes,
  satelliteRoutes,
  mlRiskRoutes,
  policyRoutes,
  farmPolicyRoutes,
  claimRoutes,
  farmClaimRoutes,
} from '../src/routes/v1/index.js';

function runTestSuite() {
  console.log('================================================================================');
  console.log('🧪 Running Module 10: V1 Route Gateway & Exports Integration Test');
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

  // 1. Primary V1 Router
  assert(typeof v1Routes === 'function', '1.1 v1Routes is a valid Express router function');

  // 2. Core Service Routes
  assert(typeof healthRoutes === 'function', '2.1 healthRoutes is exported');
  assert(typeof farmerRoutes === 'function', '2.2 farmerRoutes is exported');
  assert(typeof farmRoutes === 'function', '2.3 farmRoutes is exported');
  assert(typeof farmBoundaryRoutes === 'function', '2.4 farmBoundaryRoutes is exported');
  assert(typeof weatherRoutes === 'function', '2.5 weatherRoutes is exported');

  // 3. Risk & Climate Engine Routes
  assert(typeof riskAssessmentRoutes === 'function', '3.1 riskAssessmentRoutes is exported');
  assert(typeof farmRiskRoutes === 'function', '3.2 farmRiskRoutes is exported');
  assert(typeof riskRuleRoutes === 'function', '3.3 riskRuleRoutes is exported');

  // 4. Remote Sensing & Advisory ML Routes
  assert(typeof satelliteRoutes === 'function', '4.1 satelliteRoutes is exported');
  assert(typeof mlRiskRoutes === 'function', '4.2 mlRiskRoutes is exported');

  // 5. Parametric Policy & Claims Routes
  assert(typeof policyRoutes === 'function', '5.1 policyRoutes is exported');
  assert(typeof farmPolicyRoutes === 'function', '5.2 farmPolicyRoutes is exported');
  assert(typeof claimRoutes === 'function', '5.3 claimRoutes is exported');
  assert(typeof farmClaimRoutes === 'function', '5.4 farmClaimRoutes is exported');

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed across all checkpoints`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
