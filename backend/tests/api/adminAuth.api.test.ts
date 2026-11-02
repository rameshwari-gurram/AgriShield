/**
 * AgriShield Stage 1: Administrative Authentication & Two-Role System HTTP API Integration Test Suite
 *
 * Verifies live Express HTTP dispatch:
 * 1. POST /api/v1/auth/admin/login:
 *    - Schema validation (missing fields, short passwords)
 *    - Successful admin authentication with username or email
 *    - JWT verification (role: 'ADMIN')
 *    - Client role forgery immunity (strips client-supplied roles)
 *    - Generic 401 unauthorized responses for wrong password or unknown admin
 *    - Sliding-window rate limiting (HTTP 429 on excessive failed logins)
 * 2. Cross-Role Authorization over HTTP:
 *    - requireAdmin strictly permits ADMIN and rejects FARMER with HTTP 403
 *    - requireFarmer strictly permits FARMER and rejects ADMIN with HTTP 403
 * 3. Farmer OTP Authentication Non-Regression:
 *    - Existing farmer login functions properly and issues JWT with role: 'FARMER'
 */

import http from 'http';
import { strict as assert } from 'node:assert';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import express from 'express';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.config.js';
import { adminRepository } from '../../src/repositories/admin.repository.js';
import { adminAuthService } from '../../src/services/adminAuth.service.js';
import { farmerRepository } from '../../src/repositories/farmer.repository.js';
import { authService } from '../../src/services/auth.service.js';
import { Farmer, Language } from '@prisma/client';
import { IFarmerRepository } from '../../src/types/farmer.types.js';
import { authenticateJwt, requireAdmin, requireFarmer } from '../../src/middleware/auth.middleware.js';
import { errorMiddleware } from '../../src/middleware/error.middleware.js';

// Test credentials
const TEST_PASSWORD = 'SecureAdminPassword!2026';
const TEST_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);
const TEST_ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const TEST_USERNAME = 'stage1_admin';
const TEST_EMAIL = 'admin.stage1@agrishield.com';

const FARMER_ID = '11111111-1111-4111-8111-111111111111';

class MockFarmerRepo implements IFarmerRepository {
  public farmer: Farmer = {
    id: FARMER_ID,
    fullName: 'Anand Shinde',
    mobileNumber: '9876543210',
    email: 'anand.shinde@agrishield.com',
    preferredLanguage: Language.mr,
    farmerReferenceNumber: 'AGRI-FMR-DEMO-001',
    createdAt: new Date('2026-10-14T10:00:00.000Z'),
    updatedAt: new Date('2026-10-14T10:00:00.000Z'),
  };

  async findByMobileNumber(m: string) { return m === this.farmer.mobileNumber ? this.farmer : null; }
  async findByEmail(e: string) { return e.toLowerCase() === this.farmer.email?.toLowerCase() ? this.farmer : null; }
  async findById(id: string) { return id === this.farmer.id ? this.farmer : null; }
  async findByReferenceNumber(r: string) { return r === this.farmer.farmerReferenceNumber ? this.farmer : null; }
  async updateEmail(id: string, email: string) { this.farmer.email = email; return this.farmer; }
  async create(d: any) { return d; }
  async findAll() { return [this.farmer]; }
  async count() { return 1; }
}

async function request(
  server: http.Server,
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any }> {
  const addr = server.address() as any;
  const url = `http://127.0.0.1:${addr.port}${path}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const resBody = await res.json().catch(() => ({}));
  return { status: res.status, body: resBody };
}

async function runApiTests() {
  console.log('\n================================================================================');
  console.log('🧪 AgriShield Stage 1: Administrative Authentication API Test Suite');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  const check = (condition: boolean, message: string) => {
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
    }
  };

  // Configure in-memory test admin in admin repository
  adminRepository.setAdminRecord({
    id: TEST_ADMIN_ID,
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    fullName: 'Stage 1 Test Administrator',
    role: 'ADMIN',
    passwordHash: TEST_HASH,
    isActive: true,
  });

  // Mock farmer repository
  const mockFarmerRepo = new MockFarmerRepo();
  (farmerRepository as any).findByMobileNumber = mockFarmerRepo.findByMobileNumber.bind(mockFarmerRepo);
  (farmerRepository as any).findByEmail = mockFarmerRepo.findByEmail.bind(mockFarmerRepo);
  (farmerRepository as any).findById = mockFarmerRepo.findById.bind(mockFarmerRepo);

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  // Guard test server for isolated role-based authorization verification
  const guardApp = express();
  guardApp.use(express.json());
  guardApp.get('/test/admin-only', authenticateJwt, requireAdmin, (_req, res) => {
    res.status(200).json({ success: true, message: 'Welcome Admin' });
  });
  guardApp.get('/test/farmer-only', authenticateJwt, requireFarmer, (_req, res) => {
    res.status(200).json({ success: true, message: 'Welcome Farmer' });
  });
  guardApp.use(errorMiddleware);

  const guardServer = http.createServer(guardApp);
  await new Promise<void>((resolve) => guardServer.listen(0, '127.0.0.1', () => resolve()));

  try {
    // --- TEST 1: Admin Login Validation ---
    console.log('--- TEST 1: POST /api/v1/auth/admin/login Input Validation ---');

    const resEmpty = await request(server, 'POST', '/api/v1/auth/admin/login', {});
    check(resEmpty.status === 400, '1.1 Missing credentials rejected with HTTP 400');

    const resShortPass = await request(server, 'POST', '/api/v1/auth/admin/login', {
      username: TEST_USERNAME,
      password: '123',
    });
    check(resShortPass.status === 400, '1.2 Short password (<8 chars) rejected with HTTP 400');

    // --- TEST 2: Successful Admin Login ---
    console.log('\n--- TEST 2: Successful Administrative Login & Role Claims ---');

    const resSuccess = await request(server, 'POST', '/api/v1/auth/admin/login', {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    check(resSuccess.status === 200, '2.1 Valid admin credentials return HTTP 200');
    check(Boolean(resSuccess.body?.data?.token), '2.2 Returns JWT bearer token');
    check(resSuccess.body?.data?.user?.role === 'ADMIN', '2.3 Response user role is strictly ADMIN');
    check(resSuccess.body?.data?.user?.username === TEST_USERNAME, '2.4 Response contains correct username');
    check(resSuccess.body?.data?.user?.passwordHash === undefined, '2.5 Password hash strictly omitted from response');

    const adminToken = resSuccess.body.data.token;
    const decodedAdminJwt = jwt.verify(adminToken, env.JWT_SECRET) as any;
    check(decodedAdminJwt.role === 'ADMIN', '2.6 Cryptographic JWT payload contains role: ADMIN');
    check(decodedAdminJwt.id === TEST_ADMIN_ID, '2.7 JWT payload contains correct admin ID');

    // Email login
    const resEmailLogin = await request(server, 'POST', '/api/v1/auth/admin/login', {
      username: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    check(resEmailLogin.status === 200, '2.8 Admin login with email succeeds with HTTP 200');

    // Case-insensitivity
    const resCaseInsensitive = await request(server, 'POST', '/api/v1/auth/admin/login', {
      username: TEST_USERNAME.toUpperCase(),
      password: TEST_PASSWORD,
    });
    check(resCaseInsensitive.status === 200, '2.9 Admin login with uppercase username succeeds with HTTP 200');

    // --- TEST 3: Role Forgery Defense ---
    console.log('\n--- TEST 3: Client Role Forgery Immunity ---');

    const resForgedRole = await request(server, 'POST', '/api/v1/auth/admin/login', {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      role: 'SUPER_ROOT_OVERLORD',
    });
    check(resForgedRole.status === 200, '3.1 Request with injected role accepted');
    check(resForgedRole.body?.data?.user?.role === 'ADMIN', '3.2 Injected role ignored; response role is ADMIN');
    const decodedForged = jwt.verify(resForgedRole.body.data.token, env.JWT_SECRET) as any;
    check(decodedForged.role === 'ADMIN', '3.3 Injected role ignored; JWT token role is ADMIN');

    // --- TEST 4: Invalid Credentials & Timing Non-Enumeration ---
    console.log('\n--- TEST 4: Invalid Credentials & Non-Enumerating Errors ---');

    const resWrongPass = await request(server, 'POST', '/api/v1/auth/admin/login', {
      username: TEST_USERNAME,
      password: 'WrongPassword123!',
    });
    check(resWrongPass.status === 401, '4.1 Wrong password rejected with HTTP 401');
    check(resWrongPass.body?.message === 'Invalid administrative credentials', '4.2 Generic non-enumerating error message');

    const resUnknownUser = await request(server, 'POST', '/api/v1/auth/admin/login', {
      username: 'nonexistent_admin_account',
      password: TEST_PASSWORD,
    });
    check(resUnknownUser.status === 401, '4.3 Unknown admin rejected with HTTP 401');
    check(resUnknownUser.body?.message === 'Invalid administrative credentials', '4.4 Identical generic message returned for unknown user');

    // --- TEST 5: Rate Limiting Lockout ---
    console.log('\n--- TEST 5: Excessive Failed Logins Rate Limiting (HTTP 429) ---');

    // Clear failed attempts first
    adminAuthService.resetRateLimits();

    for (let i = 0; i < 5; i++) {
      await request(server, 'POST', '/api/v1/auth/admin/login', {
        username: TEST_USERNAME,
        password: 'BadPassword!',
      });
    }

    const resRateLimited = await request(server, 'POST', '/api/v1/auth/admin/login', {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    });
    check(resRateLimited.status === 429, '5.1 6th failed attempt rejected with HTTP 429 Too Many Requests');
    check(resRateLimited.body?.message?.includes('Too many failed login attempts'), '5.2 Rate limit message informs caller');

    // Reset rate limits for remaining tests
    adminAuthService.resetRateLimits();

    // --- TEST 6: Cross-Role HTTP Authorization Guards ---
    console.log('\n--- TEST 6: Cross-Role HTTP Authorization Enforcement ---');

    // Create a farmer token
    const farmerToken = jwt.sign(
      { id: FARMER_ID, role: 'FARMER', mobileNumber: '9876543210', fullName: 'Anand Shinde' },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Test unauthenticated access
    const resNoToken = await request(guardServer, 'GET', '/test/admin-only');
    check(resNoToken.status === 401, '6.1 Unauthenticated access to admin route rejected with HTTP 401');

    // Test Farmer accessing Admin route
    const resFarmerOnAdmin = await request(guardServer, 'GET', '/test/admin-only', undefined, farmerToken);
    check(resFarmerOnAdmin.status === 403, '6.2 Farmer accessing admin route rejected with HTTP 403 Forbidden');
    check(resFarmerOnAdmin.body?.message?.includes('Access denied'), '6.3 Descriptive 403 access denied message');

    // Test Admin accessing Admin route
    const resAdminOnAdmin = await request(guardServer, 'GET', '/test/admin-only', undefined, adminToken);
    check(resAdminOnAdmin.status === 200, '6.4 Admin accessing admin route succeeds with HTTP 200');

    // Test Admin accessing Farmer route
    const resAdminOnFarmer = await request(guardServer, 'GET', '/test/farmer-only', undefined, adminToken);
    check(resAdminOnFarmer.status === 403, '6.5 Admin accessing farmer route rejected with HTTP 403 Forbidden');

    // Test Farmer accessing Farmer route
    const resFarmerOnFarmer = await request(guardServer, 'GET', '/test/farmer-only', undefined, farmerToken);
    check(resFarmerOnFarmer.status === 200, '6.6 Farmer accessing farmer route succeeds with HTTP 200');

    // --- TEST 7: Farmer OTP Flow Non-Regression & Role Verification ---
    console.log('\n--- TEST 7: Farmer OTP Flow Non-Regression & Role Enforcement ---');

    // Send OTP
    const resSendOtp = await request(server, 'POST', '/api/v1/auth/otp/send', {
      mobileNumber: '9876543210',
    });
    check(resSendOtp.status === 200, '7.1 Farmer OTP send succeeds with HTTP 200');

    // Insert known challenge into authService
    const salt = 'testsalt123';
    const plainOtp = '123456';
    const hash = (authService as any).hashOtp('9876543210', plainOtp, salt);
    (authService as any).challenges.set('9876543210', {
      hashedOtp: hash,
      salt,
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
      attempts: 0,
    });

    // Verify OTP with client-forged role
    const resVerifyOtp = await request(server, 'POST', '/api/v1/auth/otp/verify', {
      mobileNumber: '9876543210',
      otp: plainOtp,
      role: 'ADMIN', // Client forgery attempt
    });
    check(resVerifyOtp.status === 200, '7.2 Farmer OTP verify succeeds with HTTP 200');
    check(resVerifyOtp.body?.data?.farmer?.role === 'FARMER', '7.3 Farmer response profile role is strictly FARMER');

    const decodedFarmerJwt = jwt.verify(resVerifyOtp.body.data.token, env.JWT_SECRET) as any;
    check(decodedFarmerJwt.role === 'FARMER', '7.4 Farmer JWT signed role is strictly FARMER');
    check(decodedFarmerJwt.role !== 'ADMIN', '7.5 Farmer token never gains ADMIN privilege despite client injection');

  } finally {
    await Promise.all([
      new Promise<void>((resolve) => server.close(() => resolve())),
      new Promise<void>((resolve) => guardServer.close(() => resolve())),
    ]);
  }

  console.log('\n================================================================================');
  console.log(`Admin Auth API Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runApiTests().catch((e) => {
  console.error('API test runner fatal error:', e);
  process.exit(1);
});
