/**
 * Module 8/9: Producer Authentication Domain Service
 * Ephemeral Mobile OTP Verification & JWT Issuance
 *
 * Security Invariants:
 * 1. Cryptographic randomness (crypto.randomInt) preserving 6 digits including leading zeros.
 * 2. In-memory HMAC-SHA256 salted hash storage; plain-text OTP is never stored.
 * 3. Strict 5-minute (300s) TTL expiration per challenge.
 * 4. Maximum 3 verification attempts per challenge; burned on failure threshold.
 * 5. One-time use: Challenge burned immediately upon successful verification.
 * 6. 60-second resend cooldown and rolling-window rate limiting per number and client IP.
 * 7. Non-enumerating response on OTP send to prevent phone number discovery.
 * 8. Authenticated farmer ID derived exclusively from PostgreSQL record matched to verified phone.
 * 9. Cryptographic JWT signed with env.JWT_SECRET, 24-hour expiration.
 * 10. Development terminal logging active ONLY in non-production; never logged in production.
 *
 * NOTE ON HORIZONTAL SCALING & IN-MEMORY RATE LIMITING:
 * In-memory rate limiting and challenge maps are designed for single-node prototype and development
 * environments. In production environments deploying clustered Express processes behind a reverse
 * proxy (Nginx / AWS ALB), the OTP challenges and rate limiter counters must be backed by a shared
 * distributed cache (such as Redis or Memcached) to enforce global rate limits across worker threads.
 *
 * PRODUCTION SMS INTEGRATION NOTICE:
 * This prototype features console/terminal OTP delivery for development and demonstration purposes.
 * Direct telecommunication carrier SMS gateway dispatch (via Twilio, Gupshup, or Fast2SMS) is
 * designated for production deployment and is intentionally not faked in this implementation.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config.js';
import { logger } from '../config/logger.js';
import { farmerRepository } from '../repositories/farmer.repository.js';
import { IFarmerRepository } from '../types/farmer.types.js';
import { AppError } from '../utils/apiError.js';

interface OtpChallenge {
  hashedOtp: string;
  salt: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
}

interface RateLimitTracker {
  timestamps: number[];
}

export class AuthService {
  private farmerRepo: IFarmerRepository;

  // In-memory challenge store: Map<normalizedMobileNumber, OtpChallenge>
  private challenges: Map<string, OtpChallenge> = new Map();

  // In-memory rate limiters: Map<identifier, RateLimitTracker>
  private mobileRateLimits: Map<string, RateLimitTracker> = new Map();
  private ipRateLimits: Map<string, RateLimitTracker> = new Map();

  // Configuration constants
  private readonly OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes (300 seconds)
  private readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
  private readonly MAX_VERIFY_ATTEMPTS = 3;
  private readonly MAX_SENDS_PER_HOUR_MOBILE = 5;
  private readonly MAX_SENDS_PER_15MIN_IP = 10;

  constructor(repository: IFarmerRepository = farmerRepository) {
    this.farmerRepo = repository;
  }

  /**
   * Normalize 10-digit mobile number by removing non-digits, country code (+91), or leading zeros.
   */
  public normalizeMobileNumber(rawNumber: string): string {
    const digitsOnly = rawNumber.replace(/\D/g, '');
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      return digitsOnly.substring(2);
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      return digitsOnly.substring(1);
    }
    return digitsOnly;
  }

  /**
   * Mask mobile number for non-enumerating responses (e.g. "******3210")
   */
  public maskMobileNumber(normalizedMobile: string): string {
    if (normalizedMobile.length < 4) return '******';
    const last4 = normalizedMobile.slice(-4);
    return '******' + last4;
  }

  /**
   * Cryptographically generate a uniform 6-digit OTP preserving leading zeros.
   */
  public generateSixDigitOtp(): string {
    const randomInt = crypto.randomInt(0, 1000000);
    return randomInt.toString().padStart(6, '0');
  }

  /**
   * Determine if OTP development terminal logging is enabled.
   * STRICT SAFEGUARD: Never enabled in production under any circumstance.
   */
  public isDevLoggingEnabled(): boolean {
    return env.NODE_ENV !== 'production' && env.DEV_PRINT_OTP === true;
  }

  /**
   * Compute HMAC-SHA256 salted hash of OTP.
   */
  private hashOtp(normalizedMobile: string, otp: string, salt: string): string {
    return crypto
      .createHmac('sha256', salt)
      .update(`${normalizedMobile}:${otp}`)
      .digest('hex');
  }

  /**
   * Check and update rate limits for an identifier (rolling window).
   */
  private enforceRateLimit(
    map: Map<string, RateLimitTracker>,
    key: string,
    windowMs: number,
    maxRequests: number,
    limitType: string
  ): void {
    const now = Date.now();
    const tracker = map.get(key) || { timestamps: [] };

    // Prune timestamps older than window
    const recent = tracker.timestamps.filter((ts) => now - ts < windowMs);

    if (recent.length >= maxRequests) {
      throw AppError.tooManyRequests(
        `Too many verification code requests for this ${limitType}. Please wait before requesting another code.`
      );
    }

    recent.push(now);
    map.set(key, { timestamps: recent });
  }

  /**
   * Send ephemeral OTP to a mobile number.
   * Employs non-enumerating responses to protect registered producer privacy.
   */
  async sendOtp(
    rawMobileNumber: string,
    clientIp?: string
  ): Promise<{
    message: string;
    maskedMobile: string;
    cooldownSeconds: number;
    expiresInSeconds: number;
  }> {
    const normalizedMobile = this.normalizeMobileNumber(rawMobileNumber);

    // 1. Enforce IP rate limiting (if client IP provided)
    if (clientIp) {
      this.enforceRateLimit(
        this.ipRateLimits,
        clientIp,
        15 * 60 * 1000,
        this.MAX_SENDS_PER_15MIN_IP,
        'network client'
      );
    }

    // 2. Enforce mobile number hourly rate limit
    this.enforceRateLimit(
      this.mobileRateLimits,
      normalizedMobile,
      60 * 60 * 1000,
      this.MAX_SENDS_PER_HOUR_MOBILE,
      'mobile number'
    );

    // 3. Enforce 60-second cooldown on existing active challenge
    const existing = this.challenges.get(normalizedMobile);
    const now = Date.now();
    if (existing && now - existing.createdAt < this.RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((this.RESEND_COOLDOWN_MS - (now - existing.createdAt)) / 1000);
      throw AppError.tooManyRequests(
        `Please wait ${waitSeconds} second(s) before requesting another verification code.`
      );
    }

    // 4. Verify whether farmer exists in PostgreSQL
    const farmer = await this.farmerRepo.findByMobileNumber(normalizedMobile);

    if (farmer) {
      // 5. Generate secure 6-digit OTP
      const plainOtp = this.generateSixDigitOtp();
      const salt = crypto.randomBytes(16).toString('hex');
      const hashedOtp = this.hashOtp(normalizedMobile, plainOtp, salt);

      // 6. Store ephemeral challenge
      this.challenges.set(normalizedMobile, {
        hashedOtp,
        salt,
        createdAt: now,
        expiresAt: now + this.OTP_TTL_MS,
        attempts: 0,
      });

      // 7. Development-only terminal logging
      if (this.isDevLoggingEnabled()) {
        logger.info(
          `[DEV AUTH] Verification OTP for Producer ${farmer.fullName} (+91 ${normalizedMobile}): ${plainOtp} (Expires in 5 minutes)`
        );
      }
    } else {
      // Non-enumerating behavior: If phone is not registered, do not create challenge,
      // but do not throw 404 to avoid disclosing whether a phone number is registered.
      if (env.NODE_ENV !== 'production') {
        logger.debug(
          `[AUTH] OTP requested for unregistered number +91 ${normalizedMobile} (Non-enumerating response returned)`
        );
      }
    }

    // 8. Return identical standardized response (non-enumerating)
    return {
      message:
        'If this mobile number is registered with AgriShield, a 6-digit verification code has been dispatched.',
      maskedMobile: this.maskMobileNumber(normalizedMobile),
      cooldownSeconds: 60,
      expiresInSeconds: 300,
    };
  }

  /**
   * Verify 6-digit OTP and issue authenticated JWT for the matched farmer.
   * Enforces 3 failed attempts max, 5-min TTL, timing-safe equality, and one-time burning.
   */
  async verifyOtp(
    rawMobileNumber: string,
    inputOtp: string
  ): Promise<{
    token: string;
    farmer: {
      id: string;
      fullName: string;
      mobileNumber: string;
      preferredLanguage: string;
      farmerReferenceNumber: string | null;
    };
  }> {
    const normalizedMobile = this.normalizeMobileNumber(rawMobileNumber);
    const challenge = this.challenges.get(normalizedMobile);
    const now = Date.now();

    // 1. Verify challenge exists and has not expired
    if (!challenge || now > challenge.expiresAt) {
      if (challenge) {
        this.challenges.delete(normalizedMobile);
      }
      throw AppError.badRequest(
        'Invalid or expired verification code. Please request a new verification code.'
      );
    }

    // 2. Verify attempts threshold has not been exceeded
    if (challenge.attempts >= this.MAX_VERIFY_ATTEMPTS) {
      this.challenges.delete(normalizedMobile);
      throw AppError.badRequest(
        'Too many failed attempts. This verification code has been invalidated. Please request a new code.'
      );
    }

    // 3. Compute hash and execute timing-safe comparison
    const candidateHash = this.hashOtp(normalizedMobile, inputOtp.trim(), challenge.salt);
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const targetBuf = Buffer.from(challenge.hashedOtp, 'hex');

    const isMatch =
      candidateBuf.length === targetBuf.length &&
      crypto.timingSafeEqual(candidateBuf, targetBuf);

    if (!isMatch) {
      challenge.attempts += 1;
      const remainingAttempts = this.MAX_VERIFY_ATTEMPTS - challenge.attempts;

      if (remainingAttempts <= 0) {
        this.challenges.delete(normalizedMobile);
        throw AppError.badRequest(
          'Too many failed attempts. This verification code has been invalidated. Please request a new code.'
        );
      }

      throw AppError.badRequest(
        `Invalid verification code. ${remainingAttempts} attempt(s) remaining.`
      );
    }

    // 4. One-time use: Burn challenge immediately upon success
    this.challenges.delete(normalizedMobile);

    // 5. Look up verified farmer from PostgreSQL
    const farmer = await this.farmerRepo.findByMobileNumber(normalizedMobile);
    if (!farmer) {
      throw AppError.notFound('Registered producer account could not be found.');
    }

    // 6. Sign cryptographic JWT Bearer token
    // Uses existing env.JWT_SECRET and 24-hour expiry
    const token = jwt.sign(
      {
        id: farmer.id,
        mobileNumber: farmer.mobileNumber,
        fullName: farmer.fullName,
      },
      env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return {
      token,
      farmer: {
        id: farmer.id,
        fullName: farmer.fullName,
        mobileNumber: farmer.mobileNumber,
        preferredLanguage: farmer.preferredLanguage,
        farmerReferenceNumber: farmer.farmerReferenceNumber,
      },
    };
  }

  /**
   * Helper method for testing: inspect active challenge state or clear store.
   */
  public _getChallengeForTest(normalizedMobile: string): OtpChallenge | undefined {
    return this.challenges.get(normalizedMobile);
  }

  public _clearAllForTest(): void {
    this.challenges.clear();
    this.mobileRateLimits.clear();
    this.ipRateLimits.clear();
  }
}

export const authService = new AuthService();
