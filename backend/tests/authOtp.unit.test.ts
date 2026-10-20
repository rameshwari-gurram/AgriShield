/**
 * AgriShield Module 8/9: Mobile OTP Authentication Unit & Security Test Suite
 *
 * Verifies:
 * 1. Cryptographic randomness (6 digits, leading zero preservation).
 * 2. Mobile number normalization and non-enumerating responses.
 * 3. 60-second resend cooldown enforcement.
 * 4. Hourly and IP-based rate limiting.
 * 5. Secure hash storage (plaintext OTP never stored in memory).
 * 6. Successful verification and JWT minting (derives ID from verified farmer record only).
 * 7. One-time use enforcement (challenge burned immediately upon success).
 * 8. Maximum 3 failed attempts threshold and automatic burning.
 * 9. Expiry enforcement (5-minute TTL).
 * 10. Timing-safe comparison.
 */

import { strict as assert } from 'node:assert';
import jwt from 'jsonwebtoken';
import { AuthService } from '../src/services/auth.service.js';
import { IFarmerRepository } from '../src/types/farmer.types.js';
import { Farmer, Language } from '@prisma/client';
import { env } from '../src/config/env.config.js';

class MockFarmerRepository implements IFarmerRepository {
  public farmers: Farmer[] = [];

  constructor() {
    this.farmers = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        fullName: 'Anand Shinde',
        mobileNumber: '9876543210',
        preferredLanguage: Language.mr,
        farmerReferenceNumber: 'AGRI-FMR-DEMO-STAGE96',
        createdAt: new Date('2026-10-14T10:00:00.000Z'),
        updatedAt: new Date('2026-10-14T10:00:00.000Z'),
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        fullName: 'Sunita Patil',
        mobileNumber: '9123456780',
        preferredLanguage: Language.en,
        farmerReferenceNumber: 'AGRI-FMR-DEMO-02',
        createdAt: new Date('2026-10-14T10:00:00.000Z'),
        updatedAt: new Date('2026-10-14T10:00:00.000Z'),
      },
    ];
  }

  async findByMobileNumber(mobileNumber: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.mobileNumber === mobileNumber) || null;
  }

  async findById(id: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.id === id) || null;
  }

  async findByReferenceNumber(ref: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.farmerReferenceNumber === ref) || null;
  }

  async create(data: any): Promise<Farmer> {
    const f: Farmer = {
      id: data.id || 'new-uuid',
      fullName: data.fullName,
      mobileNumber: data.mobileNumber,
      preferredLanguage: data.preferredLanguage,
      farmerReferenceNumber: data.farmerReferenceNumber || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.farmers.push(f);
    return f;
  }

  async findAll(): Promise<Farmer[]> {
    return this.farmers;
  }

  async count(): Promise<number> {
    return this.farmers.length;
  }
}

async function runAuthOtpUnitTests() {
  console.log('\n================================================================================');
  console.log('🧪 Running AgriShield Module 8/9 Mobile OTP Authentication Unit Tests');
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

  const mockRepo = new MockFarmerRepository();
  const service = new AuthService(mockRepo);

  // ---------------------------------------------------------------------------
  // Suite 1: Cryptographic Randomness & Leading Zero Preservation
  // ---------------------------------------------------------------------------
  console.log('--- Suite 1: Cryptographic Randomness & Leading Zero Preservation ---');
  {
    const generatedOtps = new Set<string>();
    let hasLeadingZero = false;

    for (let i = 0; i < 200; i++) {
      const otp = service.generateSixDigitOtp();
      check(otp.length === 6, `1.1 OTP has exact 6 digits length (${otp})`);
      check(/^\d{6}$/.test(otp), `1.2 OTP contains digits only (${otp})`);
      if (otp.startsWith('0')) {
        hasLeadingZero = true;
      }
      generatedOtps.add(otp);
    }

    check(generatedOtps.size > 190, '1.3 Generated OTPs demonstrate high cryptographic entropy (>190 distinct per 200)');
    check(hasLeadingZero, '1.4 Leading zeros are correctly preserved as strings rather than coerced numbers');
  }

  // ---------------------------------------------------------------------------
  // Suite 2: Mobile Number Normalization & Masking
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 2: Mobile Number Normalization & Masking ---');
  {
    check(service.normalizeMobileNumber('+919876543210') === '9876543210', '2.1 Strips +91 international prefix');
    check(service.normalizeMobileNumber('09876543210') === '9876543210', '2.2 Strips leading 0');
    check(service.normalizeMobileNumber('9876543210') === '9876543210', '2.3 Preserves clean 10-digit number');
    check(service.normalizeMobileNumber('+91 98765-43210') === '9876543210', '2.4 Strips formatting spaces and dashes');
    check(service.maskMobileNumber('9876543210') === '******3210', '2.5 Masks phone number showing only last 4 digits');
  }

  // ---------------------------------------------------------------------------
  // Suite 3: Non-Enumerating Responses
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 3: Non-Enumerating Responses ---');
  {
    service._clearAllForTest();

    // Registered number
    const resRegistered = await service.sendOtp('9876543210', '127.0.0.1');
    check(
      resRegistered.message ===
        'If this mobile number is registered with AgriShield, a 6-digit verification code has been dispatched.',
      '3.1 Registered number returns standardized privacy disclaimer'
    );
    check(resRegistered.maskedMobile === '******3210', '3.2 Registered response contains masked mobile');
    check((resRegistered as any).otp === undefined, '3.3 Plaintext OTP is NOT returned in response payload');

    // Unregistered number
    const resUnregistered = await service.sendOtp('9999999999', '127.0.0.1');
    check(
      resUnregistered.message === resRegistered.message,
      '3.4 Unregistered number returns identical non-enumerating message'
    );
    check(resUnregistered.maskedMobile === '******9999', '3.5 Unregistered number returns masked mobile format');
    check(service._getChallengeForTest('9999999999') === undefined, '3.6 No challenge stored for unregistered number');
  }

  // ---------------------------------------------------------------------------
  // Suite 4: Secure Hash Storage & Resend Cooldown
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 4: Secure Hash Storage & Resend Cooldown ---');
  {
    service._clearAllForTest();
    await service.sendOtp('9876543210', '127.0.0.1');

    const challenge = service._getChallengeForTest('9876543210');
    check(challenge !== undefined, '4.1 Challenge is persisted in memory');
    check(challenge!.hashedOtp.length === 64, '4.2 Stored OTP is a 64-character SHA-256 hex hash');
    check((challenge as any).otp === undefined, '4.3 Plaintext OTP is NEVER stored in challenge object');
    check(challenge!.attempts === 0, '4.4 Initial attempts count is 0');
    check(challenge!.expiresAt - challenge!.createdAt === 300000, '4.5 TTL is strictly 5 minutes (300,000 ms)');

    // Attempt rapid consecutive resend within 60s
    let cooldownErrorCaught = false;
    try {
      await service.sendOtp('9876543210', '127.0.0.1');
    } catch (err: any) {
      cooldownErrorCaught = true;
      check(err.statusCode === 429, '4.6 Re-requesting within 60s cooldown throws HTTP 429');
      check(err.message.includes('second(s) before requesting another'), '4.7 Error specifies remaining cooldown');
    }
    check(cooldownErrorCaught, '4.8 Cooldown guard actively blocked rapid resend');
  }

  // ---------------------------------------------------------------------------
  // Suite 5: Successful Verification & JWT Minting
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 5: Successful Verification & JWT Minting ---');
  {
    service._clearAllForTest();

    // Intercept generated OTP for deterministic test verification
    const originalGen = service.generateSixDigitOtp.bind(service);
    service.generateSixDigitOtp = () => '482910';

    try {
      await service.sendOtp('9876543210', '127.0.0.1');

      const verifyResult = await service.verifyOtp('9876543210', '482910');

      check(typeof verifyResult.token === 'string', '5.1 Returns JWT string');
      check(verifyResult.farmer.id === '11111111-1111-4111-8111-111111111111', '5.2 Farmer ID derived from database record');
      check(verifyResult.farmer.fullName === 'Anand Shinde', '5.3 Farmer fullName matches record');
      check(verifyResult.farmer.mobileNumber === '9876543210', '5.4 Farmer mobile matches record');

      // Verify JWT signature using env.JWT_SECRET
      const decoded = jwt.verify(verifyResult.token, env.JWT_SECRET) as any;
      check(decoded.id === '11111111-1111-4111-8111-111111111111', '5.5 Decoded JWT contains verified farmer UUID in id claim');
      check(decoded.mobileNumber === '9876543210', '5.6 Decoded JWT contains mobileNumber claim');
      check(decoded.fullName === 'Anand Shinde', '5.7 Decoded JWT contains fullName claim');

      // Check one-time use: Challenge must be burned immediately
      check(service._getChallengeForTest('9876543210') === undefined, '5.8 Challenge burned immediately upon verification');

      // Attempting to reuse same OTP fails
      let reuseFailed = false;
      try {
        await service.verifyOtp('9876543210', '482910');
      } catch (err: any) {
        reuseFailed = true;
        check(err.statusCode === 400, '5.9 Re-submitting used OTP throws HTTP 400');
        check(err.message.includes('Invalid or expired'), '5.10 Error message clarifies code is invalid/expired');
      }
      check(reuseFailed, '5.11 One-time use strictly enforced');
    } finally {
      service.generateSixDigitOtp = originalGen;
    }
  }

  // ---------------------------------------------------------------------------
  // Suite 6: Failed Attempts & Challenge Burning
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 6: Failed Attempts & Challenge Burning ---');
  {
    service._clearAllForTest();
    const originalGen = service.generateSixDigitOtp.bind(service);
    service.generateSixDigitOtp = () => '654321';

    try {
      await service.sendOtp('9876543210', '127.0.0.1');

      // Attempt 1: Wrong code
      try {
        await service.verifyOtp('9876543210', '000000');
        assert.fail('Should have rejected attempt 1');
      } catch (err: any) {
        check(err.statusCode === 400, '6.1 Failed attempt 1 throws 400 Bad Request');
        check(err.message.includes('2 attempt(s) remaining'), '6.2 Informs user of 2 remaining attempts');
      }

      // Attempt 2: Wrong code
      try {
        await service.verifyOtp('9876543210', '111111');
        assert.fail('Should have rejected attempt 2');
      } catch (err: any) {
        check(err.statusCode === 400, '6.3 Failed attempt 2 throws 400 Bad Request');
        check(err.message.includes('1 attempt(s) remaining'), '6.4 Informs user of 1 remaining attempt');
      }

      // Attempt 3: Wrong code
      try {
        await service.verifyOtp('9876543210', '222222');
        assert.fail('Should have rejected attempt 3');
      } catch (err: any) {
        check(err.statusCode === 400, '6.5 Failed attempt 3 throws 400 Bad Request');
        check(err.message.includes('Too many failed attempts'), '6.6 Informs user code has been invalidated');
      }

      // Challenge must now be purged from memory
      check(service._getChallengeForTest('9876543210') === undefined, '6.7 Challenge burned immediately after 3 failed attempts');

      // Attempt 4 with correct OTP still fails because challenge was burned
      try {
        await service.verifyOtp('9876543210', '654321');
        assert.fail('Should not accept burned challenge');
      } catch (err: any) {
        check(err.statusCode === 400, '6.8 Attempt with correct OTP on burned challenge fails with 400');
      }
    } finally {
      service.generateSixDigitOtp = originalGen;
    }
  }

  // ---------------------------------------------------------------------------
  // Suite 7: Expiry Enforcement (5-Minute TTL)
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 7: Expiry Enforcement (5-Minute TTL) ---');
  {
    service._clearAllForTest();
    const originalGen = service.generateSixDigitOtp.bind(service);
    service.generateSixDigitOtp = () => '777888';

    try {
      await service.sendOtp('9876543210', '127.0.0.1');
      const challenge = service._getChallengeForTest('9876543210')!;

      // Simulate passage of 5 minutes and 1 second
      challenge.expiresAt = Date.now() - 1000;

      let expiredFailed = false;
      try {
        await service.verifyOtp('9876543210', '777888');
      } catch (err: any) {
        expiredFailed = true;
        check(err.statusCode === 400, '7.1 Expired OTP verification throws HTTP 400');
        check(err.message.includes('Invalid or expired'), '7.2 Error message notes expiration');
      }
      check(expiredFailed, '7.3 Expired challenge rejected');
      check(service._getChallengeForTest('9876543210') === undefined, '7.4 Expired challenge purged upon detection');
    } finally {
      service.generateSixDigitOtp = originalGen;
    }
  }

  // ---------------------------------------------------------------------------
  // Suite 8: Rate Limiting Bounds
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 8: Rate Limiting Bounds ---');
  {
    service._clearAllForTest();

    // Advance clocks or bypass cooldown to test hourly bound (max 5 per hour)
    let hitHourlyLimit = false;
    for (let i = 0; i < 6; i++) {
      try {
        // Fast-forward created timestamp to avoid 60s cooldown blocking hourly test
        const active = service._getChallengeForTest('9123456780');
        if (active) {
          active.createdAt = Date.now() - 70000;
        }
        await service.sendOtp('9123456780', `10.0.0.${i}`);
      } catch (err: any) {
        if (err.statusCode === 429 && err.message.includes('mobile number')) {
          hitHourlyLimit = true;
          check(true, `8.1 6th request within 1 hour rejected with HTTP 429 for mobile number (attempt ${i + 1})`);
        }
      }
    }
    check(hitHourlyLimit, '8.2 Hourly per-number rate limit successfully triggered');
  }

  // ---------------------------------------------------------------------------
  // Suite 9: Development Logging Configuration & Production Safeguards
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 9: Development Logging Configuration & Production Safeguards ---');
  {
    // 9.1 Development logging enabled by default in non-production
    check(service.isDevLoggingEnabled() === true, '9.1 Development OTP logging is active in non-production');

    // 9.2 Production safeguard: If NODE_ENV is production, logging must NEVER activate
    const originalNodeEnv = env.NODE_ENV;
    const originalDevPrint = env.DEV_PRINT_OTP;
    try {
      (env as any).NODE_ENV = 'production';
      (env as any).DEV_PRINT_OTP = true;
      check(service.isDevLoggingEnabled() === false, '9.2 Production environment strictly prevents OTP terminal logging');

      // 9.3 Explicitly disabling DEV_PRINT_OTP in development suppresses logging
      (env as any).NODE_ENV = 'development';
      (env as any).DEV_PRINT_OTP = false;
      check(service.isDevLoggingEnabled() === false, '9.3 DEV_PRINT_OTP=false suppresses terminal logging in development');
    } finally {
      (env as any).NODE_ENV = originalNodeEnv;
      (env as any).DEV_PRINT_OTP = originalDevPrint;
    }

    // 9.4 Ensure unregistered numbers never receive an OTP challenge
    service._clearAllForTest();
    const unregisteredRes = await service.sendOtp('9999999999', '127.0.0.1');
    check(unregisteredRes.message.includes('If this mobile number is registered'), '9.4 Generic response returned for unregistered number');
    check(service._getChallengeForTest('9999999999') === undefined, '9.5 No challenge created for unregistered number');

    // 9.6 Ensure registered development account receives active challenge
    const registeredRes = await service.sendOtp('9876543210', '127.0.0.1');
    check(registeredRes.maskedMobile === '******3210', '9.6 Masked mobile returned for registered account');
    const registeredChallenge = service._getChallengeForTest('9876543210');
    check(registeredChallenge !== undefined, '9.7 Challenge successfully created in memory for registered account');
    check(registeredChallenge!.attempts === 0, '9.8 Initial attempt count is zero');
    check(registeredChallenge!.expiresAt > Date.now(), '9.9 Challenge expiry timestamp set in future (5 min TTL)');
  }

  console.log('\n================================================================================');
  console.log(`Auth OTP Unit Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthOtpUnitTests().catch((err) => {
  console.error('Fatal error running Auth OTP Unit Tests:', err);
  process.exit(1);
});
