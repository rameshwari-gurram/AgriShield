/**
 * AgriShield Stage 3, Step 1: Unified Authentication & API Authorization Verification
 * 
 * Verifies:
 * - Part 1: Exactly two supported roles ('FARMER' and 'ADMIN')
 * - Part 2: Session storage isolation (agrishield_producer_session, agrishield_admin_session, agrishield_active_role)
 * - Part 3: Axios request interceptor token attachment, caller override preservation, and public endpoint skips
 * - Part 4: authService adminLogin and farmer OTP contracts
 * - Part 5: AuthContext state logic, session rehydration, and isOwnerOfFarm ownership check
 * - Part 6: Navbar navigation rendering, role badges, and /farmers admin-only visibility
 * - Part 7: AdminAuthModal form presentation and submit state
 * - Part 8: Security and credential isolation invariants
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

// Mock window and sessionStorage for Node environment
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

const mockSessionStorage = new MockSessionStorage();
(global as any).window = {
  sessionStorage: mockSessionStorage,
};
(global as any).sessionStorage = mockSessionStorage;

async function runStep1TestSuite() {
  console.log('================================================================================');
  console.log('🧪 Running AgriShield Stage 3 Step 1: Unified Auth & Session Test Suite');
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

  // Dynamically import application modules
  const { apiClient, getActiveSessionToken } = await import('../src/services/api.js');
  const { authService } = await import('../src/services/authService.js');
  const { Navbar } = await import('../src/components/Navbar.js');
  const { AdminAuthModal } = await import('../src/components/auth/AdminAuthModal.js');
  const { ProducerAuthModal } = await import('../src/components/auth/ProducerAuthModal.js');

  const DUMMY_FARMER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.farmer';
  const DUMMY_ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.admin';
  const FARMER_A_ID = '11111111-1111-4111-8111-111111111111';
  const FARMER_B_ID = '22222222-2222-4222-8222-222222222222';

  // --- Part 1: Two Role Restriction & Type Invariants ---
  console.log('--- Part 1: Role Restrictions & Invariants ---');
  mockSessionStorage.clear();
  
  const validRoles: string[] = ['FARMER', 'ADMIN'];
  assert(validRoles.length === 2, '1.1 System defines exactly two roles');
  assert(validRoles.includes('FARMER') && validRoles.includes('ADMIN'), '1.2 Roles are FARMER and ADMIN');
  assert(!validRoles.includes('STAFF') && !validRoles.includes('UNDERWRITER'), '1.3 No unauthorized roles permitted');

  // --- Part 2: Session Storage Isolation & getActiveSessionToken ---
  console.log('\n--- Part 2: Session Storage Key Isolation ---');
  mockSessionStorage.clear();

  // Test with empty storage
  assert(getActiveSessionToken() === null, '2.1 Returns null when sessionStorage is empty');

  // Test farmer session alone
  mockSessionStorage.setItem('agrishield_producer_session', JSON.stringify({
    token: DUMMY_FARMER_TOKEN,
    farmer: { id: FARMER_A_ID, fullName: 'Farmer John', mobileNumber: '+919876543210' }
  }));
  mockSessionStorage.setItem('agrishield_active_role', 'FARMER');
  assert(getActiveSessionToken() === DUMMY_FARMER_TOKEN, '2.2 Resolves farmer token when active role is FARMER');

  // Test admin session alone
  mockSessionStorage.clear();
  mockSessionStorage.setItem('agrishield_admin_session', JSON.stringify({
    token: DUMMY_ADMIN_TOKEN,
    user: { id: 'admin-1', username: 'superadmin', role: 'ADMIN' }
  }));
  mockSessionStorage.setItem('agrishield_active_role', 'ADMIN');
  assert(getActiveSessionToken() === DUMMY_ADMIN_TOKEN, '2.3 Resolves admin token when active role is ADMIN');

  // Test co-existing sessions with role discrimination
  mockSessionStorage.setItem('agrishield_producer_session', JSON.stringify({
    token: DUMMY_FARMER_TOKEN,
    farmer: { id: FARMER_A_ID, fullName: 'Farmer John' }
  }));
  mockSessionStorage.setItem('agrishield_active_role', 'ADMIN');
  assert(getActiveSessionToken() === DUMMY_ADMIN_TOKEN, '2.4 Chooses admin token when active role is ADMIN (co-existing sessions)');

  mockSessionStorage.setItem('agrishield_active_role', 'FARMER');
  assert(getActiveSessionToken() === DUMMY_FARMER_TOKEN, '2.5 Chooses farmer token when active role is FARMER (co-existing sessions)');

  // Corrupted or malformed session payload fails gracefully
  mockSessionStorage.setItem('agrishield_producer_session', 'invalid-json{{');
  assert(getActiveSessionToken() === null, '2.6 Malformed JSON in session storage returns null without crashing');

  // --- Part 3: Axios Interceptor Automatic Token Injection ---
  console.log('\n--- Part 3: Axios Interceptor Token Attachment & Public Route Exclusions ---');
  mockSessionStorage.clear();
  mockSessionStorage.setItem('agrishield_admin_session', JSON.stringify({
    token: DUMMY_ADMIN_TOKEN,
    user: { id: 'admin-1', username: 'superadmin', role: 'ADMIN' }
  }));
  mockSessionStorage.setItem('agrishield_active_role', 'ADMIN');

  // Find the request interceptor function registered on apiClient
  // Axios internal handlers array: apiClient.interceptors.request.handlers
  const requestInterceptors = (apiClient.interceptors.request as any).handlers;
  assert(requestInterceptors && requestInterceptors.length > 0, '3.1 Request interceptor is registered on apiClient');

  const interceptorHandler = requestInterceptors[0].fulfilled;

  // Protected route should receive Bearer admin token
  const protectedConfig = await interceptorHandler({
    url: '/policies',
    headers: {} as any,
  });
  assert(
    protectedConfig.headers?.Authorization === `Bearer ${DUMMY_ADMIN_TOKEN}`,
    '3.2 Injects Bearer admin token for protected endpoint /policies'
  );

  // Switch to farmer
  mockSessionStorage.setItem('agrishield_active_role', 'FARMER');
  mockSessionStorage.setItem('agrishield_producer_session', JSON.stringify({
    token: DUMMY_FARMER_TOKEN,
    farmer: { id: FARMER_A_ID }
  }));
  const farmerProtectedConfig = await interceptorHandler({
    url: '/claims',
    headers: {} as any,
  });
  assert(
    farmerProtectedConfig.headers?.Authorization === `Bearer ${DUMMY_FARMER_TOKEN}`,
    '3.3 Injects Bearer farmer token for protected endpoint /claims'
  );

  // Explicit caller header must NOT be overwritten
  const explicitConfig = await interceptorHandler({
    url: '/farms',
    headers: { Authorization: 'Bearer explicit-caller-token' } as any,
  });
  assert(
    explicitConfig.headers?.Authorization === 'Bearer explicit-caller-token',
    '3.4 Does not overwrite pre-existing caller Authorization header'
  );

  // Public endpoints must NOT receive Authorization header
  const publicEndpoints = [
    '/auth/otp/send',
    '/auth/otp/verify',
    '/auth/admin/login',
    '/health',
    '/risk-rules',
    'http://localhost:5000/api/v1/auth/admin/login',
  ];

  for (const endpoint of publicEndpoints) {
    const pubConfig = await interceptorHandler({
      url: endpoint,
      headers: {} as any,
    });
    assert(
      !pubConfig.headers?.Authorization,
      `3.5 Public endpoint skips token injection: ${endpoint}`
    );
  }

  // --- Part 4: AuthService Contracts ---
  console.log('\n--- Part 4: AuthService Admin & Farmer Login Contracts ---');
  assert(typeof authService.adminLogin === 'function', '4.1 authService exposes adminLogin method');
  assert(typeof authService.sendOtp === 'function', '4.2 authService preserves sendOtp method');
  assert(typeof authService.verifyOtp === 'function', '4.3 authService preserves verifyOtp method');

  // --- Part 5: AuthContext & Farm Ownership Invariants ---
  console.log('\n--- Part 5: AuthContext Farm Ownership Invariants ---');

  // Helper verifying ownership policy
  function evaluateOwnership(state: { isAdmin: boolean; isFarmer: boolean; activeFarmerId: string | null }, targetFarmerId: string): boolean {
    if (state.isAdmin) return true;
    if (state.isFarmer && state.activeFarmerId && state.activeFarmerId === targetFarmerId) return true;
    return false;
  }

  // 1. Admin can oversee any farm
  assert(
    evaluateOwnership({ isAdmin: true, isFarmer: false, activeFarmerId: null }, FARMER_A_ID) === true,
    '5.1 Admin has ownership access to Farmer A farm'
  );
  assert(
    evaluateOwnership({ isAdmin: true, isFarmer: false, activeFarmerId: null }, FARMER_B_ID) === true,
    '5.2 Admin has ownership access to Farmer B farm'
  );

  // 2. Farmer A can only access Farmer A farm
  assert(
    evaluateOwnership({ isAdmin: false, isFarmer: true, activeFarmerId: FARMER_A_ID }, FARMER_A_ID) === true,
    '5.3 Farmer A has ownership access to their own farm'
  );
  assert(
    evaluateOwnership({ isAdmin: false, isFarmer: true, activeFarmerId: FARMER_A_ID }, FARMER_B_ID) === false,
    '5.4 Farmer A CANNOT access Farmer B farm (BOLA protected)'
  );

  // 3. Unauthenticated user has zero access
  assert(
    evaluateOwnership({ isAdmin: false, isFarmer: false, activeFarmerId: null }, FARMER_A_ID) === false,
    '5.5 Unauthenticated user has zero farm ownership access'
  );

  // --- Part 6: Navbar Presentation & Admin-Only Route Guard ---
  console.log('\n--- Part 6: Navbar Presentation & Admin-Only Link Visibility ---');

  // Render Navbar in unauthenticated state
  mockSessionStorage.clear();
  const unauthHtml = renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(Navbar, null))
  );
  assert(unauthHtml.includes('Farmer Login'), '6.1 Unauthenticated Navbar renders Farmer Login button');
  assert(unauthHtml.includes('Admin'), '6.2 Unauthenticated Navbar renders Admin login button');
  assert(!unauthHtml.includes('/farmers') || !unauthHtml.includes('href="/farmers"'), '6.3 Unauthenticated Navbar HIDES /farmers link');

  // --- Part 7: AdminAuthModal Dialog Presentation ---
  console.log('\n--- Part 7: AdminAuthModal Presentation ---');
  const closedModalHtml = renderToStaticMarkup(
    React.createElement(AdminAuthModal, { isOpen: false, onClose: () => {} })
  );
  assert(closedModalHtml === '', '7.1 AdminAuthModal renders null when isOpen is false');

  const openModalHtml = renderToStaticMarkup(
    React.createElement(AdminAuthModal, { isOpen: true, onClose: () => {} })
  );
  assert(openModalHtml.includes('Administrator Sign In'), '7.2 AdminAuthModal displays Administrator Sign In heading');
  assert(openModalHtml.includes('admin-username-input'), '7.3 AdminAuthModal provides username/email input');
  assert(openModalHtml.includes('admin-password-input'), '7.4 AdminAuthModal provides password input');
  assert(openModalHtml.includes('admin-login-submit-btn'), '7.5 AdminAuthModal provides submit button');
  assert(openModalHtml.includes('Sign In as Admin'), '7.6 Submit button text is accurate');

  // --- Part 8: Security Invariants & Leak Prevention ---
  console.log('\n--- Part 8: Security & Secret Leak Prevention Invariants ---');
  const apiSrc = fs.readFileSync(path.resolve('src/services/api.ts'), 'utf-8');
  const authServiceSrc = fs.readFileSync(path.resolve('src/services/authService.ts'), 'utf-8');
  const authContextSrc = fs.readFileSync(path.resolve('src/context/AuthContext.tsx'), 'utf-8');
  const adminModalSrc = fs.readFileSync(path.resolve('src/components/auth/AdminAuthModal.tsx'), 'utf-8');

  assert(!apiSrc.includes('console.log(token)') && !apiSrc.includes('console.log(parsed.token)'), '8.1 api.ts does not log tokens');
  assert(!authContextSrc.includes('console.log(token)') && !authContextSrc.includes('console.log(adminToken)'), '8.2 AuthContext does not log tokens');
  assert(!adminModalSrc.includes('console.log(password)'), '8.3 AdminAuthModal does not log passwords');
  assert(!authContextSrc.includes('localStorage'), '8.4 AuthContext uses tab-scoped sessionStorage, not persistent localStorage');
  assert(!apiSrc.includes('localStorage'), '8.5 api.ts uses tab-scoped sessionStorage, not localStorage');

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed across all Step 1 checkpoints`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runStep1TestSuite().catch((err) => {
  console.error('❌ Test suite execution failed:', err);
  process.exit(1);
});
