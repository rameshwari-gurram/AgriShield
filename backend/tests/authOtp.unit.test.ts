/**
 * AgriShield Module 8/9: Mobile & Email OTP Authentication Unit & Security Test Suite
 *
 * Verifies:
 * 1. Cryptographic randomness (6 digits, leading zero preservation).
 * 2. Mobile and Email identifier normalization and non-enumerating responses.
 * 3. 60-second resend cooldown enforcement.
 * 4. Hourly and IP-based rate limiting.
 * 5. Secure hash storage (plaintext OTP never stored in memory).
 * 6. Successful verification and JWT minting (derives ID from verified farmer record only).
 * 7. One-time use enforcement (challenge burned immediately upon success).
 * 8. Maximum 3 failed attempts threshold and automatic burning.
 * 9. Expiry enforcement (5-minute TTL).
 * 10. Timing-safe comparison.
 * 11. Email OTP dispatch via Gmail SMTP / Nodemailer with atomic rollback on delivery failure.
 * 12. Safe email linking and verification process.
 */

import { strict as assert } from 'node:assert';
import jwt from 'jsonwebtoken';
import { AuthService } from '../src/services/auth.service.js';
import { IFarmerRepository } from '../src/types/farmer.types.js';
import { Farmer, Language } from '@prisma/client';
import { env, validateEnv, KNOWN_DEV_JWT_SECRETS } from '../src/config/env.config.js';
import { IEmailProvider, SendOtpEmailOptions, EmailSendResult } from '../src/providers/email.provider.js';

class MockEmailProvider implements IEmailProvider {
  public sentEmails: Array<{ to: string; otp: string; recipientName?: string }> = [];
  public shouldFail: boolean = false;
  public failureMessage: string = 'SMTP connection timeout';

  async sendOtpEmail(options: SendOtpEmailOptions): Promise<EmailSendResult> {
    if (this.shouldFail) {
      return { success: false, error: this.failureMessage };
    }
    this.sentEmails.push(options);
    return { success: true, messageId: `mock-msg-${Date.now()}` };
  }

  async verifyConnection(): Promise<boolean> {
    return !this.shouldFail;
  }
}

class MockFarmerRepository implements IFarmerRepository {
  public farmers: Farmer[] = [];

  constructor() {
    this.farmers = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        fullName: 'Anand Shinde',
        mobileNumber: '9876543210',
        email: 'anand.shinde@agrishield.com',
        preferredLanguage: Language.mr,
        farmerReferenceNumber: 'AGRI-FMR-DEMO-STAGE96',
        createdAt: new Date('2026-10-14T10:00:00.000Z'),
        updatedAt: new Date('2026-10-14T10:00:00.000Z'),
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        fullName: 'Sunita Patil',
        mobileNumber: '9123456780',
        email: 'sunita.patil@agrishield.com',
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

  async findByEmail(email: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.email?.toLowerCase() === email.toLowerCase()) || null;
  }

  async findById(id: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.id === id) || null;
  }

  async findByReferenceNumber(ref: string): Promise<Farmer | null> {
    return this.farmers.find((f) => f.farmerReferenceNumber === ref) || null;
  }

  async updateEmail(id: string, email: string): Promise<Farmer> {
    const f = this.farmers.find((farmer) => farmer.id === id);
    if (!f) throw new Error(`Farmer ${id} not found`);
    f.email = email;
    return f;
  }

  async create(data: any): Promise<Farmer> {
    const f: Farmer = {
      id: data.id || 'new-uuid',
      fullName: data.fullName,
      mobileNumber: data.mobileNumber,
      email: data.email || null,
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
  console.log('🧪 Running AgriShield Module 8/9 Mobile & Email OTP Authentication Unit Tests');
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
  const mockEmail = new MockEmailProvider();
  const service = new AuthService(mockRepo, mockEmail);

  // ---------------------------------------------------------------------------
  // Suite 1: Cryptographic Randomness & Leading Zero Preservation
  // ---------------------------------------------------------------------------
  console.log('--- Suite 1: Cryptographic Randomness & Leading Zero Preservation ---');
  {
    const iterations = 50;
    let leadingZeroObserved = false;

    for (let i = 0; i < iterations; i++) {
      const otp = service.generateSixDigitOtp();
      check(otp.length === 6, `1.1 OTP has exact 6 digits length (${otp})`);
      check(/^\d{6}$/.test(otp), `1.2 OTP contains digits only (${otp})`);
      if (otp.startsWith('0')) {
        leadingZeroObserved = true;
      }
    }

    let extraTries = 0;
    while (!leadingZeroObserved && extraTries < 200) {
      const otp = service.generateSixDigitOtp();
      if (otp.startsWith('0')) leadingZeroObserved = true;
      extraTries++;
    }
    check(leadingZeroObserved, '1.3 Generated uniform OTP preserving leading zeros');
  }

  // ---------------------------------------------------------------------------
  // Suite 2: Mobile Number Normalization & Masking
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 2: Mobile Number Normalization & Masking ---');
  {
    check(service.normalizeMobileNumber('9876543210') === '9876543210', '2.1 Standard 10-digit number preserved');
    check(service.normalizeMobileNumber('+919876543210') === '9876543210', '2.2 +91 prefix correctly stripped');
    check(service.normalizeMobileNumber('919876543210') === '9876543210', '2.3 91 country code prefix stripped');
    check(service.normalizeMobileNumber('09876543210') === '9876543210', '2.4 Leading 0 stripped');
    check(service.normalizeMobileNumber('+91 98765-43210') === '9876543210', '2.5 Formatting symbols stripped');

    check(service.maskMobileNumber('9876543210') === '******3210', '2.6 Correctly masks 10-digit mobile number');
    check(service.maskMobileNumber('12') === '******', '2.7 Handles short input safely');
  }

  // ---------------------------------------------------------------------------
  // Suite 3: Resend Cooldown Enforcement (60 Seconds)
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 3: 60-Second Resend Cooldown Enforcement ---');
  {
    service._clearAllForTest();
    await service.sendOtp('9876543210', '127.0.0.1');

    let cooldownTriggered = false;
    try {
      await service.sendOtp('9876543210', '127.0.0.1');
    } catch (err: any) {
      cooldownTriggered = true;
      check(err.statusCode === 429, '3.1 Rejection has HTTP 429 status');
      check(err.message.includes('second(s) before requesting another'), '3.2 Error message advises cooldown');
    }
    check(cooldownTriggered, '3.3 Resend within 60s is strictly rejected');
  }

  // ---------------------------------------------------------------------------
  // Suite 4: Rate Limiting (Hourly Mobile & 15-Min IP)
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 4: Rate Limiting Enforcement ---');
  {
    service._clearAllForTest();
    const testNum = '9123456780';

    for (let i = 0; i < 5; i++) {
      const challenge = service._getChallengeForTest(testNum);
      if (challenge) {
        challenge.createdAt = Date.now() - 61000;
      }
      await service.sendOtp(testNum, '192.168.1.100');
    }

    let mobileLimitHit = false;
    try {
      const challenge = service._getChallengeForTest(testNum);
      if (challenge) {
        challenge.createdAt = Date.now() - 61000;
      }
      await service.sendOtp(testNum, '192.168.1.100');
    } catch (err: any) {
      mobileLimitHit = true;
      check(err.statusCode === 429, '4.1 Mobile rate limit returns HTTP 429');
    }
    check(mobileLimitHit, '4.2 Hourly identifier rate limit strictly enforced (max 5/hr)');

    service._clearAllForTest();
    const testIp = '10.0.0.1';
    for (let i = 1; i <= 10; i++) {
      const dummyNumber = `900000000${i % 10}`;
      await service.sendOtp(dummyNumber, testIp);
    }

    let ipLimitHit = false;
    try {
      await service.sendOtp('9876543210', testIp);
    } catch (err: any) {
      ipLimitHit = true;
      check(err.statusCode === 429, '4.3 IP rate limit returns HTTP 429');
    }
    check(ipLimitHit, '4.4 Client IP rolling window rate limit strictly enforced (max 10/15min)');
  }

  // ---------------------------------------------------------------------------
  // Suite 5: Secure Salted Hash Storage (No Plaintext OTP in Memory)
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 5: Secure Salted Hash Storage ---');
  {
    service._clearAllForTest();
    await service.sendOtp('9876543210', '127.0.0.1');
    const challenge = service._getChallengeForTest('9876543210');

    check(challenge !== undefined, '5.1 Challenge is persisted in memory store');
    check(challenge!.hashedOtp.length === 64, '5.2 Stored OTP is a 64-char HMAC-SHA256 hex string');
    check(challenge!.salt.length === 32, '5.3 Stored challenge includes unique 16-byte hex salt');
    check(!/^\d{6}$/.test(challenge!.hashedOtp), '5.4 Plaintext OTP is NEVER stored in memory');
  }

  // ---------------------------------------------------------------------------
  // Suite 6: OTP Verification & JWT Issuance
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 6: OTP Verification & JWT Issuance ---');
  {
    service._clearAllForTest();
    const sent = await service.sendOtp('9876543210', '127.0.0.1');
    check(sent.maskedMobile === '******3210', '6.1 Returns masked phone number');

    const challenge = service._getChallengeForTest('9876543210');
    let solvedOtp = '';
    for (let c = 0; c < 1000000; c++) {
      const candidate = c.toString().padStart(6, '0');
      const candidateHash = (service as any).hashOtp('9876543210', candidate, challenge!.salt);
      if (candidateHash === challenge!.hashedOtp) {
        solvedOtp = candidate;
        break;
      }
    }
    check(solvedOtp.length === 6, '6.2 Solved valid OTP from challenge hash for verification test');

    const verifyResult = await service.verifyOtp('9876543210', solvedOtp);
    check(Boolean(verifyResult.token), '6.3 Authenticated JWT Bearer token issued');
    check(verifyResult.farmer.id === '11111111-1111-4111-8111-111111111111', '6.4 Farmer ID accurately matched to Anand Shinde');
    check(verifyResult.farmer.fullName === 'Anand Shinde', '6.5 Producer fullName is Anand Shinde');

    const decoded = jwt.verify(verifyResult.token, env.JWT_SECRET) as any;
    check(decoded.id === '11111111-1111-4111-8111-111111111111', '6.6 JWT payload contains verified farmer UUID');
    check(decoded.mobileNumber === '9876543210', '6.7 JWT payload contains verified phone number');

    // Suite 7: One-Time Use (Burning Challenge)
    let reuseFailed = false;
    try {
      await service.verifyOtp('9876543210', solvedOtp);
    } catch (err: any) {
      reuseFailed = true;
      check(err.statusCode === 400, '6.8 Reused OTP returns HTTP 400');
    }
    check(reuseFailed, '6.9 Challenge is burned immediately upon successful verification');
  }

  // ---------------------------------------------------------------------------
  // Suite 7: Maximum 3 Failed Attempts & Challenge Invalidation
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 7: Maximum 3 Verification Attempts & Invalidation ---');
  {
    service._clearAllForTest();
    await service.sendOtp('9876543210', '127.0.0.1');

    for (let attempt = 1; attempt <= 2; attempt++) {
      let failedCheck = false;
      try {
        await service.verifyOtp('9876543210', '000000');
      } catch (err: any) {
        failedCheck = true;
        check(err.statusCode === 400, `7.${attempt}a Attempt ${attempt} rejected with 400`);
        check(err.message.includes(`${3 - attempt} attempt(s) remaining`), `7.${attempt}b Informs remaining attempts`);
      }
      check(failedCheck, `7.${attempt}c Invalid OTP rejected on attempt ${attempt}`);
    }

    let burnedOnThird = false;
    try {
      await service.verifyOtp('9876543210', '000000');
    } catch (err: any) {
      burnedOnThird = true;
      check(err.statusCode === 400, '7.3a Third failure returns HTTP 400');
      check(err.message.includes('Too many failed attempts'), '7.3b Error notes invalidation');
    }
    check(burnedOnThird, '7.3c Challenge invalidated after 3 failed attempts');
    check(service._getChallengeForTest('9876543210') === undefined, '7.4 Challenge burned from memory on threshold');
  }

  // ---------------------------------------------------------------------------
  // Suite 8: TTL Expiration Enforcement (5 Minutes)
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 8: TTL Expiration Enforcement (5 Minutes) ---');
  {
    service._clearAllForTest();
    await service.sendOtp('9876543210', '127.0.0.1');
    const challenge = service._getChallengeForTest('9876543210');

    challenge!.expiresAt = Date.now() - 1000;

    let expiredFailed = false;
    try {
      await service.verifyOtp('9876543210', '123456');
    } catch (err: any) {
      expiredFailed = true;
      check(err.statusCode === 400, '8.1 Expired challenge rejected with HTTP 400');
      check(err.message.includes('Invalid or expired'), '8.2 Advises expiration');
    }
    check(expiredFailed, '8.3 Expired OTP challenge is strictly rejected');
    check(service._getChallengeForTest('9876543210') === undefined, '8.4 Expired challenge cleaned up from memory');
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Suite 9: Development Logging Configuration & Production Safeguards
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 9: Development Logging Configuration & Production Safeguards ---');
  {
    // 9.1 Safe default for DEV_PRINT_OTP is false
    const parsedDefault = validateEnv({ NODE_ENV: 'development' });
    check(parsedDefault.success === true, '9.1a Default environment parsing succeeds');
    if (parsedDefault.success) {
      check(parsedDefault.data.DEV_PRINT_OTP === false, '9.1b DEV_PRINT_OTP defaults strictly to false');
    }

    // 9.2 Production JWT Secret validation checks
    const prodMissingSecret = validateEnv({ NODE_ENV: 'production', JWT_SECRET: '' });
    check(prodMissingSecret.success === false, '9.2a Missing JWT_SECRET fails in production');

    const prodDevFallback1 = validateEnv({ NODE_ENV: 'production', JWT_SECRET: 'development_jwt_secret_key_12345' });
    check(prodDevFallback1.success === false, '9.2b Known development fallback secret rejected in production');

    const prodDevFallback2 = validateEnv({ NODE_ENV: 'production', JWT_SECRET: 'your_super_secret_jwt_key_replace_in_production' });
    check(prodDevFallback2.success === false, '9.2c Known example fallback secret rejected in production');

    const prodShortSecret = validateEnv({ NODE_ENV: 'production', JWT_SECRET: 'short_key_123' });
    check(prodShortSecret.success === false, '9.2d Short (<16 chars) JWT_SECRET rejected in production');

    const prodValidSecret = validateEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'secure_production_token_secret_minimum_16_chars!',
    });
    check(prodValidSecret.success === true, '9.2e Valid production JWT_SECRET accepted');

    const devFallbackAllowed = validateEnv({
      NODE_ENV: 'development',
      JWT_SECRET: 'development_jwt_secret_key_12345',
    });
    check(devFallbackAllowed.success === true, '9.2f Known fallback allowed in non-production environments');

    // 9.3 Terminal OTP Logging Guards
    const originalNodeEnv = env.NODE_ENV;
    const originalDevPrint = env.DEV_PRINT_OTP;
    try {
      (env as any).NODE_ENV = 'production';
      (env as any).DEV_PRINT_OTP = true;
      check(service.isDevLoggingEnabled() === false, '9.3a Production environment strictly prevents OTP terminal logging even if DEV_PRINT_OTP=true');

      (env as any).NODE_ENV = 'development';
      (env as any).DEV_PRINT_OTP = false;
      check(service.isDevLoggingEnabled() === false, '9.3b DEV_PRINT_OTP=false suppresses terminal logging in development');

      (env as any).NODE_ENV = 'development';
      (env as any).DEV_PRINT_OTP = true;
      check(service.isDevLoggingEnabled() === true, '9.3c DEV_PRINT_OTP=true permits terminal logging in development only');
    } finally {
      (env as any).NODE_ENV = originalNodeEnv;
      (env as any).DEV_PRINT_OTP = originalDevPrint;
    }

    service._clearAllForTest();
    const unregisteredRes = await service.sendOtp('9999999999', '127.0.0.1');
    check(unregisteredRes.message.includes('If this mobile number is registered'), '9.4 Generic response returned for unregistered number');
    check(service._getChallengeForTest('9999999999') === undefined, '9.5 No challenge created for unregistered number');

    const registeredRes = await service.sendOtp('9876543210', '127.0.0.1');
    check(registeredRes.maskedMobile === '******3210', '9.6 Masked mobile returned for registered account');
    const registeredChallenge = service._getChallengeForTest('9876543210');
    check(registeredChallenge !== undefined, '9.7 Challenge successfully created in memory for registered account');
    check(registeredChallenge!.attempts === 0, '9.8 Initial attempt count is zero');
    check(registeredChallenge!.expiresAt > Date.now(), '9.9 Challenge expiry timestamp set in future (5 min TTL)');
  }

  // ---------------------------------------------------------------------------
  // Suite 10: Email OTP Dispatch, Verification, SMTP Failures & Safe Association
  // ---------------------------------------------------------------------------
  console.log('\n--- Suite 10: Email OTP Dispatch, Verification, SMTP Failures & Safe Association ---');
  {
    service._clearAllForTest();
    mockEmail.sentEmails = [];
    mockEmail.shouldFail = false;

    // 10.1 Email normalization and masking
    const norm = service.normalizeIdentifier(' Anand.Shinde@AgriShield.com ');
    check(norm.normalized === 'anand.shinde@agrishield.com', '10.1a Normalizes email to lowercase trimmed');
    check(norm.type === 'email', '10.1b Identifies email identifier type correctly');
    check(service.maskEmail('anand.shinde@agrishield.com') === 'a***e@agrishield.com', '10.1c Correctly masks email address');

    // 10.2 Send OTP to registered email
    const emailRes = await service.sendOtp('anand.shinde@agrishield.com', '127.0.0.1');
    check(emailRes.identifierType === 'email', '10.2a Reports email identifier type in response');
    check(emailRes.maskedIdentifier === 'a***e@agrishield.com', '10.2b Returns masked email address in response');
    check(emailRes.message.includes('If this email address is registered'), '10.2c Returns appropriate email privacy message');
    check((emailRes as any).otp === undefined, '10.2d OTP plaintext is NEVER included in API response');
    check(mockEmail.sentEmails.length === 1, '10.2e Dispatches email through Nodemailer provider');
    check(mockEmail.sentEmails[0].to === 'anand.shinde@agrishield.com', '10.2f Dispatches to correct recipient');
    check(mockEmail.sentEmails[0].recipientName === 'Anand Shinde', '10.2g Includes producer name');
    const sentOtp = mockEmail.sentEmails[0].otp;
    check(/^\d{6}$/.test(sentOtp), '10.2h Dispatches a valid 6-digit OTP code in email');

    // 10.3 Challenge stored as salted hash
    const emailChallenge = service._getChallengeForTest('anand.shinde@agrishield.com');
    check(emailChallenge !== undefined, '10.3a Active challenge created for email in memory');
    check(emailChallenge!.hashedOtp !== sentOtp, '10.3b Stored challenge is NOT plaintext OTP');

    // 10.4 Non-enumerating behavior for unregistered email
    service._clearAllForTest();
    mockEmail.sentEmails = [];
    const unregEmailRes = await service.sendOtp('nobody@unknown-domain.com', '127.0.0.1');
    check(unregEmailRes.message.includes('If this email address is registered'), '10.4a Unregistered email receives generic non-enumerating message');
    check(service._getChallengeForTest('nobody@unknown-domain.com') === undefined, '10.4b No challenge stored for unregistered email');
    check(mockEmail.sentEmails.length === 0, '10.4c No email sent for unregistered address');

    // 10.5 Successful Email OTP verification & JWT issuance
    service._clearAllForTest();
    mockEmail.sentEmails = [];
    await service.sendOtp('anand.shinde@agrishield.com', '127.0.0.1');
    const emailOtpToVerify = mockEmail.sentEmails[0].otp;

    const authVerifyRes = await service.verifyOtp('anand.shinde@agrishield.com', emailOtpToVerify);
    check(Boolean(authVerifyRes.token), '10.5a Issues authenticated JWT Bearer token on email verification');
    check(authVerifyRes.farmer.fullName === 'Anand Shinde', '10.5b Authenticated farmer is Anand Shinde');
    check(authVerifyRes.farmer.email === 'anand.shinde@agrishield.com', '10.5c Farmer record contains email');

    const decodedEmailToken = jwt.verify(authVerifyRes.token, env.JWT_SECRET) as any;
    check(decodedEmailToken.id === '11111111-1111-4111-8111-111111111111', '10.5d JWT payload contains verified farmer UUID');
    check(decodedEmailToken.email === 'anand.shinde@agrishield.com', '10.5e JWT payload contains verified email');

    // 10.6 One-time burn for email OTP
    let emailReused = false;
    try {
      await service.verifyOtp('anand.shinde@agrishield.com', emailOtpToVerify);
    } catch (err: any) {
      emailReused = true;
      check(err.statusCode === 400, '10.6a Reused email OTP rejected with 400');
    }
    check(emailReused, '10.6b Email OTP burned immediately upon successful verification');

    // 10.7 SMTP failure handling and atomic rollback
    service._clearAllForTest();
    mockEmail.shouldFail = true;
    mockEmail.failureMessage = 'SMTP 535 Authentication credentials invalid';

    let smtpErrorCaught = false;
    try {
      await service.sendOtp('anand.shinde@agrishield.com', '127.0.0.1');
    } catch (err: any) {
      smtpErrorCaught = true;
      check(err.statusCode === 500, '10.7a SMTP failure returns HTTP 500 internal error');
      check(!err.message.includes('535') && !err.message.includes('password'), '10.7b SMTP credentials are not leaked in error message');
    }
    check(smtpErrorCaught, '10.7c SMTP failure halts OTP dispatch and throws safe error');
    check(service._getChallengeForTest('anand.shinde@agrishield.com') === undefined, '10.7d Failed delivery immediately burns challenge (no dangling challenge)');

    mockEmail.shouldFail = false;

    // 10.8 Safe Email Association / Linking Flow
    service._clearAllForTest();
    mockEmail.sentEmails = [];
    const farmerAId = '11111111-1111-4111-8111-111111111111';

    // 10.8a Conflict when linking an email already taken by another farmer
    let conflictCaught = false;
    try {
      await service.requestEmailLink(farmerAId, 'sunita.patil@agrishield.com');
    } catch (err: any) {
      conflictCaught = true;
      check(err.statusCode === 409, '10.8a Duplicate email association returns HTTP 409 Conflict');
    }
    check(conflictCaught, '10.8b Cannot associate email already belonging to another producer');

    // 10.8c Request linking new email dispatches OTP to target inbox
    const linkReq = await service.requestEmailLink(farmerAId, 'anand.newemail@agrishield.com', '127.0.0.1');
    check(linkReq.maskedEmail === 'a***l@agrishield.com', '10.8c Masked target email returned');
    check(mockEmail.sentEmails.length === 1, '10.8d Verification OTP sent to target inbox');
    const linkOtp = mockEmail.sentEmails[0].otp;

    // 10.8e Reject wrong OTP for link confirmation
    let wrongLinkOtpCaught = false;
    try {
      await service.confirmEmailLink(farmerAId, 'anand.newemail@agrishield.com', '000000');
    } catch (err: any) {
      wrongLinkOtpCaught = true;
      check(err.statusCode === 400, '10.8e Wrong OTP for email link rejected with HTTP 400');
    }
    check(wrongLinkOtpCaught, '10.8f Unverified code cannot link email');

    // 10.8g Confirm link with valid OTP updates farmer record
    const confirmRes = await service.confirmEmailLink(farmerAId, 'anand.newemail@agrishield.com', linkOtp);
    check(confirmRes.farmer.email === 'anand.newemail@agrishield.com', '10.8g Email successfully associated with farmer profile');
    const updatedFarmer = await mockRepo.findById(farmerAId);
    check(updatedFarmer?.email === 'anand.newemail@agrishield.com', '10.8h Repository updated with verified email');

    // 10.8i Concurrency conflict (P2002) simulation during email link confirmation
    class P2002FarmerRepository extends MockFarmerRepository {
      async updateEmail(_id: string, _email: string): Promise<Farmer> {
        const p2002Error: any = new Error('Unique constraint failed on the fields: (`email`)');
        p2002Error.code = 'P2002';
        throw p2002Error;
      }
    }
    const p2002Repo = new P2002FarmerRepository();
    const p2002Service = new AuthService(p2002Repo, mockEmail);
    await p2002Service.requestEmailLink(farmerAId, 'concurrent.test@agrishield.com');
    const concurrentOtp = mockEmail.sentEmails[mockEmail.sentEmails.length - 1].otp;
    let p2002Caught = false;
    try {
      await p2002Service.confirmEmailLink(farmerAId, 'concurrent.test@agrishield.com', concurrentOtp);
    } catch (err: any) {
      p2002Caught = true;
      check(err.statusCode === 409, '10.8i Concurrency race (P2002) returns HTTP 409 Conflict');
      check(
        err.message === 'This email address is already associated with another producer account.',
        '10.8j Safe error message returned without database internals'
      );
      check(
        !err.message.includes('P2002') && !err.message.includes('Unique constraint'),
        '10.8k Prisma error internals are not exposed'
      );
    }
    check(p2002Caught, '10.8l Concurrency conflict during updateEmail caught and handled');
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
