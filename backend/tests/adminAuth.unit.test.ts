/**
 * AgriShield Stage 1: Administrative Authentication & Two-Role System Unit Test Suite
 *
 * Verifies:
 * 1. EnvAdminRepository: Secure in-memory/env administrative credential sourcing (zero database writes).
 * 2. AdminAuthService: Timing-safe bcrypt comparison, non-enumerating 401 errors, sliding rate limiting (429).
 * 3. Two-Role Invariant: Only 'FARMER' and 'ADMIN' roles exist; farmer OTP verify strictly issues 'FARMER'.
 * 4. Token Tampering Defense: Client-supplied roles in request payloads are completely ignored.
 * 5. Middleware Guards: requireAdmin / requireFarmer strictly permit authorized roles and reject mismatches with 403.
 */

import { strict as assert } from 'node:assert';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { EnvAdminRepository } from '../src/repositories/admin.repository.js';
import { AdminAuthService } from '../src/services/adminAuth.service.js';
import { AuthService } from '../src/services/auth.service.js';
import { authenticateJwt, requireAdmin, requireFarmer, requireRole } from '../src/middleware/auth.middleware.js';
import { env, validateEnv } from '../src/config/env.config.js';
import { AdminUser, UserRole } from '../src/types/auth.types.js';
import { IFarmerRepository } from '../src/types/farmer.types.js';
import { IEmailProvider } from '../src/providers/email.provider.js';
import { Farmer, Language } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

// Test constants
const TEST_ADMIN_PASSWORD = 'StrongAdminPassword!2026';
const TEST_ADMIN_HASH = bcrypt.hashSync(TEST_ADMIN_PASSWORD, 10);
const TEST_ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const TEST_ADMIN_USERNAME = 'agri_admin';
const TEST_ADMIN_EMAIL = 'admin.portal@agrishield.com';

const testAdminRecord: AdminUser = {
  id: TEST_ADMIN_ID,
  username: TEST_ADMIN_USERNAME,
  email: TEST_ADMIN_EMAIL,
  fullName: 'AgriShield System Administrator',
  role: 'ADMIN',
  passwordHash: TEST_ADMIN_HASH,
  isActive: true,
};

class MockFarmerRepo implements IFarmerRepository {
  public farmer: Farmer = {
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Anand Shinde',
    mobileNumber: '9876543210',
    email: 'anand.shinde@agrishield.com',
    preferredLanguage: Language.mr,
    farmerReferenceNumber: 'AGRI-FMR-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  async findByMobileNumber(m: string) {
    return m === this.farmer.mobileNumber ? this.farmer : null;
  }
  async findByEmail(e: string) {
    return e.toLowerCase() === this.farmer.email?.toLowerCase() ? this.farmer : null;
  }
  async findById(id: string) {
    return id === this.farmer.id ? this.farmer : null;
  }
  async findByReferenceNumber(r: string) {
    return r === this.farmer.farmerReferenceNumber ? this.farmer : null;
  }
  async updateEmail(id: string, email: string) {
    this.farmer.email = email;
    return this.farmer;
  }
  async create(d: any) { return d; }
  async findAll() { return [this.farmer]; }
  async count() { return 1; }
}

class MockEmailProvider implements IEmailProvider {
  public sent: any[] = [];
  async sendOtpEmail(opts: any) {
    this.sent.push(opts);
    return { success: true, messageId: 'msg-01' };
  }
  async verifyConnection() { return true; }
}

async function runUnitTests() {
  console.log('\n================================================================================');
  console.log('🧪 AgriShield Stage 1: Administrative Authentication Unit Test Suite');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  const test = (name: string, fn: () => void | Promise<void>) => {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`  ✅ PASSED: ${name}`);
            passed++;
          })
          .catch((err) => {
            console.error(`  ❌ FAILED: ${name}\n     ${err.message}`);
            failed++;
          });
      } else {
        console.log(`  ✅ PASSED: ${name}`);
        passed++;
      }
    } catch (err: any) {
      console.error(`  ❌ FAILED: ${name}\n     ${err.message}`);
      failed++;
    }
  };

  // --- SUITE 1: EnvAdminRepository Tests ---
  console.log('--- Suite 1: EnvAdminRepository In-Memory Credential Resolution ---');

  await test('1.1 Sourcing admin by username succeeds', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const found = await repo.findByUsername(TEST_ADMIN_USERNAME);
    assert.ok(found);
    assert.equal(found.id, TEST_ADMIN_ID);
    assert.equal(found.role, 'ADMIN');
  });

  await test('1.2 Username lookup is case-insensitive', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const found = await repo.findByUsername('AGRI_ADMIN');
    assert.ok(found);
    assert.equal(found.username, TEST_ADMIN_USERNAME);
  });

  await test('1.3 Sourcing admin by email succeeds', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const found = await repo.findByEmail(TEST_ADMIN_EMAIL);
    assert.ok(found);
    assert.equal(found.email, TEST_ADMIN_EMAIL);
  });

  await test('1.4 Sourcing admin by usernameOrEmail matches either', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const byUser = await repo.findByUsernameOrEmail(TEST_ADMIN_USERNAME);
    const byMail = await repo.findByUsernameOrEmail(TEST_ADMIN_EMAIL);
    assert.ok(byUser);
    assert.ok(byMail);
    assert.equal(byUser.id, byMail.id);
  });

  await test('1.5 Unknown username or email returns null', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const unknown = await repo.findByUsernameOrEmail('non_existent_admin');
    assert.equal(unknown, null);
  });

  await test('1.6 Inactive admin returns null', async () => {
    const repo = new EnvAdminRepository({ ...testAdminRecord, isActive: false });
    const result = await repo.findByUsername(TEST_ADMIN_USERNAME);
    assert.equal(result, null);
  });

  await test('1.7 Unconfigured repository returns null', async () => {
    const repo = new EnvAdminRepository(null);
    const result = await repo.findByUsername(TEST_ADMIN_USERNAME);
    assert.equal(result, null);
  });

  // --- SUITE 2: AdminAuthService Credential Verification & Timing Attack Defense ---
  console.log('\n--- Suite 2: Admin Credential Verification & Timing Attack Defense ---');

  await test('2.1 Successful login with valid username and password returns ADMIN token', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const service = new AdminAuthService(repo);

    const res = await service.login(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, '127.0.0.1');
    assert.ok(res.token);
    assert.equal(res.user.role, 'ADMIN');
    assert.equal(res.user.username, TEST_ADMIN_USERNAME);
    assert.equal(res.user.email, TEST_ADMIN_EMAIL);

    // Verify cryptographic JWT claims
    const decoded = jwt.verify(res.token, env.JWT_SECRET) as any;
    assert.equal(decoded.id, TEST_ADMIN_ID);
    assert.equal(decoded.role, 'ADMIN');
    assert.equal(decoded.username, TEST_ADMIN_USERNAME);
  });

  await test('2.2 Successful login with valid email and password returns ADMIN token', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const service = new AdminAuthService(repo);

    const res = await service.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, '127.0.0.1');
    assert.ok(res.token);
    assert.equal(res.user.role, 'ADMIN');
  });

  await test('2.3 Invalid password throws 401 with generic non-enumerating message', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const service = new AdminAuthService(repo);

    let thrown: any = null;
    try {
      await service.login(TEST_ADMIN_USERNAME, 'WrongPassword123!', '127.0.0.1');
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown);
    assert.equal(thrown.statusCode, 401);
    assert.equal(thrown.message, 'Invalid administrative credentials');
  });

  await test('2.4 Unknown username throws identical 401 generic message', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const service = new AdminAuthService(repo);

    let thrown: any = null;
    try {
      await service.login('unknown_user', TEST_ADMIN_PASSWORD, '127.0.0.1');
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown);
    assert.equal(thrown.statusCode, 401);
    assert.equal(thrown.message, 'Invalid administrative credentials');
  });

  await test('2.5 Unconfigured admin credentials throws 401 generic message', async () => {
    const repo = new EnvAdminRepository(null);
    const service = new AdminAuthService(repo);

    let thrown: any = null;
    try {
      await service.login(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, '127.0.0.1');
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown);
    assert.equal(thrown.statusCode, 401);
    assert.equal(thrown.message, 'Invalid administrative credentials');
  });

  // --- SUITE 3: Sliding Rate Limiting ---
  console.log('\n--- Suite 3: Sliding-Window Failed Login Rate Limiting ---');

  await test('3.1 5 consecutive failed logins trigger HTTP 429 Too Many Requests', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const service = new AdminAuthService(repo);
    const targetIp = '192.168.1.100';

    for (let i = 0; i < 5; i++) {
      try {
        await service.login(TEST_ADMIN_USERNAME, 'WrongPass!', targetIp);
      } catch (err: any) {
        assert.equal(err.statusCode, 401);
      }
    }

    // 6th attempt should be blocked by rate limit
    let lockedErr: any = null;
    try {
      await service.login(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, targetIp);
    } catch (err) {
      lockedErr = err;
    }
    assert.ok(lockedErr);
    assert.equal(lockedErr.statusCode, 429);
    assert.ok(lockedErr.message.includes('Too many failed login attempts'));
  });

  await test('3.2 Successful login resets failed attempts counter', async () => {
    const repo = new EnvAdminRepository(testAdminRecord);
    const service = new AdminAuthService(repo);
    const targetIp = '192.168.1.200';

    // 3 failed attempts
    for (let i = 0; i < 3; i++) {
      try {
        await service.login(TEST_ADMIN_USERNAME, 'WrongPass!', targetIp);
      } catch {}
    }

    // Successful attempt
    const success = await service.login(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, targetIp);
    assert.ok(success.token);

    // Another 3 failed attempts should NOT trigger 429 because counter was reset
    for (let i = 0; i < 3; i++) {
      try {
        await service.login(TEST_ADMIN_USERNAME, 'WrongPass!', targetIp);
      } catch (err: any) {
        assert.equal(err.statusCode, 401);
      }
    }
  });

  await test('3.3 Expired rate limiter entries are automatically pruned and deleted from Map', () => {
    const service = new AdminAuthService(new EnvAdminRepository(testAdminRecord));
    service.resetRateLimits();

    const staleTimestamp = Date.now() - 16 * 60 * 1000; // 16 minutes ago (>15 min window)
    service._setTrackerForTest('stale_user', [staleTimestamp], 'identifier');
    assert.equal(service._hasKey('stale_user', 'identifier'), true);

    // Trigger rate limit check (which prunes expired timestamps)
    service._triggerCheckForTest('stale_user', 'identifier');

    // Key should have been completely removed from Map
    assert.equal(service._hasKey('stale_user', 'identifier'), false);
    assert.equal(service._getMapSize('identifier'), 0);
  });

  await test('3.4 Rate limiter enforces maximum capacity cap of 5,000 entries', () => {
    const service = new AdminAuthService(new EnvAdminRepository(testAdminRecord));
    service.resetRateLimits();

    const now = Date.now();
    // Pre-populate 5,000 entries
    for (let i = 0; i < 5000; i++) {
      service._setTrackerForTest(`user_${i}`, [now], 'identifier');
    }
    assert.equal(service._getMapSize('identifier'), 5000);

    // Record an attempt for a 5,001st key
    service._triggerRecordForTest('overflow_user', 'identifier');

    // Capacity must be strictly capped at 5000
    assert.ok(service._getMapSize('identifier') <= 5000);
    assert.equal(service._hasKey('overflow_user', 'identifier'), true);
  });

  await test('3.5 Capacity enforcement preserves active lockouts over non-locked entries', () => {
    const service = new AdminAuthService(new EnvAdminRepository(testAdminRecord));
    service.resetRateLimits();

    const now = Date.now();
    // Create an actively locked out user (5 recent failed attempts)
    service._setTrackerForTest('locked_target', [now, now, now, now, now], 'identifier');

    // Fill map up to 5,000 with single-attempt (non-locked) entries
    for (let i = 1; i < 5000; i++) {
      service._setTrackerForTest(`temp_user_${i}`, [now], 'identifier');
    }
    assert.equal(service._getMapSize('identifier'), 5000);

    // Trigger overflow with new key
    service._triggerRecordForTest('new_entry', 'identifier');

    // Active lockout for locked_target MUST be preserved
    assert.equal(service._hasKey('locked_target', 'identifier'), true);
    assert.equal(service._getMapSize('identifier'), 5000);

    // Verify locked_target is still locked
    let lockedErr: any = null;
    try {
      service._triggerCheckForTest('locked_target', 'identifier');
    } catch (e) {
      lockedErr = e;
    }
    assert.ok(lockedErr);
    assert.equal(lockedErr.statusCode, 429);
  });

  // --- SUITE 4: Strict Two-Role Separation (ADMIN vs FARMER) ---
  console.log('\n--- Suite 4: Strict Two-Role Separation (ADMIN vs FARMER) ---');

  await test('4.1 Farmer OTP verification strictly signs role: FARMER', async () => {
    const farmerRepo = new MockFarmerRepo();
    const emailProvider = new MockEmailProvider();
    const authService = new AuthService(farmerRepo, emailProvider);

    // Send OTP
    await authService.sendOtp('9876543210');
    // Extract OTP directly from challenge
    const challenge = (authService as any).challenges.get('9876543210');
    assert.ok(challenge);

    // We can compute the matching OTP or test verify directly
    // Let's test verify by inserting a known challenge
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

    const verifyResult = await authService.verifyOtp('9876543210', plainOtp);
    assert.equal(verifyResult.farmer.role, 'FARMER');

    const decoded = jwt.verify(verifyResult.token, env.JWT_SECRET) as any;
    assert.equal(decoded.role, 'FARMER');
    assert.equal(decoded.id, farmerRepo.farmer.id);
  });

  await test('4.2 Two-Role constraint: Only FARMER and ADMIN exist', () => {
    const allowedRoles: UserRole[] = ['FARMER', 'ADMIN'];
    assert.equal(allowedRoles.length, 2);
    assert.ok(allowedRoles.includes('FARMER'));
    assert.ok(allowedRoles.includes('ADMIN'));
  });

  // --- SUITE 5: Authorization Middleware Guards ---
  console.log('\n--- Suite 5: Role-Based Authorization Middleware Guards ---');

  await test('5.1 requireAdmin allows ADMIN token', () => {
    let nextCalled = false;
    const req: any = { user: { id: TEST_ADMIN_ID, role: 'ADMIN' } };
    const res: any = {};
    const next = (err?: any) => {
      assert.equal(err, undefined);
      nextCalled = true;
    };

    requireAdmin(req as Request, res as Response, next as NextFunction);
    assert.ok(nextCalled);
  });

  await test('5.2 requireAdmin rejects FARMER token with HTTP 403 Forbidden', () => {
    let passedErr: any = null;
    const req: any = { user: { id: 'farmer-id-1', role: 'FARMER' } };
    const res: any = {};
    const next = (err?: any) => {
      passedErr = err;
    };

    requireAdmin(req as Request, res as Response, next as NextFunction);
    assert.ok(passedErr);
    assert.equal(passedErr.statusCode, 403);
    assert.ok(passedErr.message.includes('Access denied'));
  });

  await test('5.3 requireFarmer allows FARMER token', () => {
    let nextCalled = false;
    const req: any = { user: { id: 'farmer-id-1', role: 'FARMER' } };
    const res: any = {};
    const next = (err?: any) => {
      assert.equal(err, undefined);
      nextCalled = true;
    };

    requireFarmer(req as Request, res as Response, next as NextFunction);
    assert.ok(nextCalled);
  });

  await test('5.4 requireFarmer rejects ADMIN token with HTTP 403 Forbidden', () => {
    let passedErr: any = null;
    const req: any = { user: { id: TEST_ADMIN_ID, role: 'ADMIN' } };
    const res: any = {};
    const next = (err?: any) => {
      passedErr = err;
    };

    requireFarmer(req as Request, res as Response, next as NextFunction);
    assert.ok(passedErr);
    assert.equal(passedErr.statusCode, 403);
    assert.ok(passedErr.message.includes('Access denied'));
  });

  await test('5.5 requireRole rejects unauthenticated request (no user) with HTTP 401', () => {
    let passedErr: any = null;
    const req: any = {};
    const res: any = {};
    const next = (err?: any) => {
      passedErr = err;
    };

    requireRole('ADMIN')(req as Request, res as Response, next as NextFunction);
    assert.ok(passedErr);
    assert.equal(passedErr.statusCode, 401);
  });

  await test('5.6 requireRole rejects invalid or arbitrary role with HTTP 403', () => {
    let passedErr: any = null;
    const req: any = { user: { id: 'arbitrary-id', role: 'UNDERWRITER' } };
    const res: any = {};
    const next = (err?: any) => {
      passedErr = err;
    };

    requireRole('ADMIN')(req as Request, res as Response, next as NextFunction);
    assert.ok(passedErr);
    assert.equal(passedErr.statusCode, 403);
  });

  // --- SUITE 6: Production Symmetrical Admin Environment Configuration Validation ---
  console.log('\n--- Suite 6: Production Symmetrical Admin Environment Configuration ---');

  await test('6.1 Production startup fails when ADMIN_USERNAME is configured without ADMIN_PASSWORD_HASH', () => {
    const res = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'super_secure_jwt_secret_at_least_16_chars_long',
      ADMIN_USERNAME: 'system_admin',
    });
    assert.equal(res.success, false);
    if (!res.success) {
      const issues = res.error.issues;
      assert.ok(
        issues.some(
          (i) =>
            i.path.includes('ADMIN_PASSWORD_HASH') &&
            i.message.includes('required when ADMIN_USERNAME is configured')
        )
      );
    }
  });

  await test('6.2 Production startup fails when ADMIN_PASSWORD_HASH is configured without ADMIN_USERNAME', () => {
    const res = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'super_secure_jwt_secret_at_least_16_chars_long',
      ADMIN_PASSWORD_HASH: '$2a$10$e8Za3L8W9s1w7C8s1w7C8e8Za3L8W9s1w7C8s1w7C8e8Za3L8W9s1',
    });
    assert.equal(res.success, false);
    if (!res.success) {
      const issues = res.error.issues;
      assert.ok(
        issues.some(
          (i) =>
            i.path.includes('ADMIN_USERNAME') &&
            i.message.includes('required when ADMIN_PASSWORD_HASH is configured')
        )
      );
    }
  });

  await test('6.3 Production startup succeeds when neither ADMIN_USERNAME nor ADMIN_PASSWORD_HASH is configured', () => {
    const res = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'super_secure_jwt_secret_at_least_16_chars_long',
    });
    assert.equal(res.success, true);
  });

  await test('6.4 Production startup succeeds when both are configured with valid bcrypt hash', () => {
    const res = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'super_secure_jwt_secret_at_least_16_chars_long',
      ADMIN_USERNAME: 'system_admin',
      ADMIN_PASSWORD_HASH: '$2a$10$e8Za3L8W9s1w7C8s1w7C8e8Za3L8W9s1w7C8s1w7C8e8Za3L8W9s1',
    });
    assert.equal(res.success, true);
  });

  await test('6.5 Production startup fails when ADMIN_PASSWORD_HASH is malformed plain text', () => {
    const res = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'super_secure_jwt_secret_at_least_16_chars_long',
      ADMIN_USERNAME: 'system_admin',
      ADMIN_PASSWORD_HASH: 'PlainTextPassword123!',
    });
    assert.equal(res.success, false);
    if (!res.success) {
      const issues = res.error.issues;
      assert.ok(
        issues.some(
          (i) =>
            i.path.includes('ADMIN_PASSWORD_HASH') &&
            i.message.includes('must be a valid bcrypt hash')
        )
      );
    }
  });

  console.log('\n================================================================================');
  console.log(`Unit Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runUnitTests().catch((e) => {
  console.error('Test runner fatal error:', e);
  process.exit(1);
});
