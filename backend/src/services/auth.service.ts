/**
 * Module 8/9: Producer Authentication Domain Service
 * Ephemeral Mobile & Email OTP Verification, JWT Issuance & Safe Email Association
 *
 * Security Invariants:
 * 1. Cryptographic randomness (crypto.randomInt) preserving 6 digits including leading zeros.
 * 2. In-memory HMAC-SHA256 salted hash storage; plain-text OTP is never stored.
 * 3. Strict 5-minute (300s) TTL expiration per challenge.
 * 4. Maximum 3 verification attempts per challenge; burned on failure threshold.
 * 5. One-time use: Challenge burned immediately upon successful verification.
 * 6. 60-second resend cooldown and rolling-window rate limiting per identifier and client IP.
 * 7. Non-enumerating response on OTP send to prevent identifier discovery.
 * 8. Authenticated farmer ID derived exclusively from PostgreSQL record matched to verified identifier.
 * 9. Cryptographic JWT signed with env.JWT_SECRET, 24-hour expiration.
 * 10. Development terminal logging active ONLY in non-production; never logged in production.
 * 11. Email delivery via Gmail SMTP / Nodemailer with atomic rollback on delivery failure.
 * 12. Safe email linking and verification: requires authenticated session and verified OTP.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Farmer } from '@prisma/client';
import { env } from '../config/env.config.js';
import { logger } from '../config/logger.js';
import { farmerRepository } from '../repositories/farmer.repository.js';
import { IFarmerRepository } from '../types/farmer.types.js';
import { emailProvider, IEmailProvider } from '../providers/email.provider.js';
import { AppError } from '../utils/apiError.js';
import { isEmailIdentifier } from '../validators/auth.validator.js';

interface OtpChallenge {
  hashedOtp: string;
  salt: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
}

interface EmailLinkChallenge extends OtpChallenge {
  targetEmail: string;
}

interface RateLimitTracker {
  timestamps: number[];
}

export class AuthService {
  private farmerRepo: IFarmerRepository;
  private emailProvider: IEmailProvider;

  // In-memory challenge store: Map<normalizedIdentifier, OtpChallenge>
  private challenges: Map<string, OtpChallenge> = new Map();

  // In-memory challenge store for email linking: Map<farmerId, EmailLinkChallenge>
  private emailLinkChallenges: Map<string, EmailLinkChallenge> = new Map();

  // In-memory rate limiters: Map<identifier, RateLimitTracker>
  private identifierRateLimits: Map<string, RateLimitTracker> = new Map();
  private ipRateLimits: Map<string, RateLimitTracker> = new Map();

  // Configuration constants
  private readonly OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes (300 seconds)
  private readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
  private readonly MAX_VERIFY_ATTEMPTS = 3;
  private readonly MAX_SENDS_PER_HOUR_IDENTIFIER = 5;
  private readonly MAX_SENDS_PER_15MIN_IP = 10;

  constructor(
    repository: IFarmerRepository = farmerRepository,
    emailSvc: IEmailProvider = emailProvider
  ) {
    this.farmerRepo = repository;
    this.emailProvider = emailSvc;
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
   * Determine identifier type and normalize accordingly.
   */
  public normalizeIdentifier(raw: string): { normalized: string; type: 'mobile' | 'email' } {
    const trimmed = raw.trim();
    if (isEmailIdentifier(trimmed)) {
      return { normalized: trimmed.toLowerCase(), type: 'email' };
    }
    return { normalized: this.normalizeMobileNumber(trimmed), type: 'mobile' };
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
   * Mask email address for non-enumerating responses (e.g. "a***e@example.com")
   */
  public maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '******';
    const [local, domain] = parts;
    if (local.length <= 2) {
      return `${local.charAt(0)}***@${domain}`;
    }
    return `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
  }

  /**
   * Mask identifier based on its detected type.
   */
  public maskIdentifier(normalized: string, type: 'mobile' | 'email'): string {
    return type === 'email' ? this.maskEmail(normalized) : this.maskMobileNumber(normalized);
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
  private hashOtp(normalizedIdentifier: string, otp: string, salt: string): string {
    return crypto
      .createHmac('sha256', salt)
      .update(`${normalizedIdentifier}:${otp}`)
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
   * Send ephemeral OTP to a mobile number or registered email address.
   * Employs non-enumerating responses to protect registered producer privacy.
   */
  async sendOtp(
    rawIdentifier: string,
    clientIp?: string
  ): Promise<{
    message: string;
    maskedMobile: string;
    maskedEmail?: string;
    maskedIdentifier: string;
    identifierType: 'mobile' | 'email';
    cooldownSeconds: number;
    expiresInSeconds: number;
  }> {
    const { normalized, type } = this.normalizeIdentifier(rawIdentifier);

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

    // 2. Enforce identifier hourly rate limit
    this.enforceRateLimit(
      this.identifierRateLimits,
      normalized,
      60 * 60 * 1000,
      this.MAX_SENDS_PER_HOUR_IDENTIFIER,
      type === 'email' ? 'email address' : 'mobile number'
    );

    // 3. Enforce 60-second cooldown on existing active challenge
    const existing = this.challenges.get(normalized);
    const now = Date.now();
    if (existing && now - existing.createdAt < this.RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((this.RESEND_COOLDOWN_MS - (now - existing.createdAt)) / 1000);
      throw AppError.tooManyRequests(
        `Please wait ${waitSeconds} second(s) before requesting another verification code.`
      );
    }

    // 4. Verify whether farmer exists in PostgreSQL
    const farmer =
      type === 'email'
        ? await this.farmerRepo.findByEmail(normalized)
        : await this.farmerRepo.findByMobileNumber(normalized);

    if (farmer) {
      // 5. Generate secure 6-digit OTP
      const plainOtp = this.generateSixDigitOtp();
      const salt = crypto.randomBytes(16).toString('hex');
      const hashedOtp = this.hashOtp(normalized, plainOtp, salt);

      // 6. Store ephemeral challenge
      this.challenges.set(normalized, {
        hashedOtp,
        salt,
        createdAt: now,
        expiresAt: now + this.OTP_TTL_MS,
        attempts: 0,
      });

      // 7. Dispatch verification code via appropriate transport
      if (type === 'email') {
        const sendResult = await this.emailProvider.sendOtpEmail({
          to: normalized,
          otp: plainOtp,
          recipientName: farmer.fullName,
        });

        if (!sendResult.success) {
          // If SMTP delivery fails, immediately burn the unusable challenge
          this.challenges.delete(normalized);
          throw AppError.internal(
            'Failed to dispatch email verification code. Please check configuration or try again shortly.'
          );
        }

        if (this.isDevLoggingEnabled()) {
          logger.info(
            `[DEV AUTH] Verification OTP for Producer ${farmer.fullName} (${normalized}): ${plainOtp} (Expires in 5 minutes)`
          );
        }
      } else {
        // Mobile OTP development logging
        if (this.isDevLoggingEnabled()) {
          logger.info(
            `[DEV AUTH] Verification OTP for Producer ${farmer.fullName} (+91 ${normalized}): ${plainOtp} (Expires in 5 minutes)`
          );
        }
      }
    } else {
      // Non-enumerating behavior: If identifier is not registered, do not create challenge,
      // but do not throw 404 to avoid disclosing whether an account is registered.
      if (env.NODE_ENV !== 'production') {
        logger.debug(
          `[AUTH] OTP requested for unregistered ${type} ${normalized} (Non-enumerating response returned)`
        );
      }
    }

    const masked = this.maskIdentifier(normalized, type);

    // 8. Return identical standardized response (non-enumerating)
    return {
      message:
        type === 'email'
          ? 'If this email address is registered with AgriShield, a 6-digit verification code has been dispatched.'
          : 'If this mobile number is registered with AgriShield, a 6-digit verification code has been dispatched.',
      maskedMobile: type === 'mobile' ? masked : this.maskMobileNumber('0000000000'),
      maskedEmail: type === 'email' ? masked : undefined,
      maskedIdentifier: masked,
      identifierType: type,
      cooldownSeconds: 60,
      expiresInSeconds: 300,
    };
  }

  /**
   * Verify 6-digit OTP and issue authenticated JWT for the matched farmer.
   * Enforces 3 failed attempts max, 5-min TTL, timing-safe equality, and one-time burning.
   */
  async verifyOtp(
    rawIdentifier: string,
    inputOtp: string
  ): Promise<{
    token: string;
    farmer: {
      id: string;
      role: 'FARMER';
      fullName: string;
      mobileNumber: string;
      email?: string | null;
      preferredLanguage: string;
      farmerReferenceNumber: string | null;
    };
  }> {
    const { normalized, type } = this.normalizeIdentifier(rawIdentifier);
    const challenge = this.challenges.get(normalized);
    const now = Date.now();

    // 1. Verify challenge exists and has not expired
    if (!challenge || now > challenge.expiresAt) {
      if (challenge) {
        this.challenges.delete(normalized);
      }
      throw AppError.badRequest(
        'Invalid or expired verification code. Please request a new verification code.'
      );
    }

    // 2. Verify attempts threshold has not been exceeded
    if (challenge.attempts >= this.MAX_VERIFY_ATTEMPTS) {
      this.challenges.delete(normalized);
      throw AppError.badRequest(
        'Too many failed attempts. This verification code has been invalidated. Please request a new code.'
      );
    }

    // 3. Compute hash and execute timing-safe comparison
    const candidateHash = this.hashOtp(normalized, inputOtp.trim(), challenge.salt);
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const targetBuf = Buffer.from(challenge.hashedOtp, 'hex');

    const isMatch =
      candidateBuf.length === targetBuf.length &&
      crypto.timingSafeEqual(candidateBuf, targetBuf);

    if (!isMatch) {
      challenge.attempts += 1;
      const remainingAttempts = this.MAX_VERIFY_ATTEMPTS - challenge.attempts;

      if (remainingAttempts <= 0) {
        this.challenges.delete(normalized);
        throw AppError.badRequest(
          'Too many failed attempts. This verification code has been invalidated. Please request a new code.'
        );
      }

      throw AppError.badRequest(
        `Invalid verification code. ${remainingAttempts} attempt(s) remaining.`
      );
    }

    // 4. One-time use: Burn challenge immediately upon success
    this.challenges.delete(normalized);

    // 5. Look up verified farmer from PostgreSQL
    const farmer =
      type === 'email'
        ? await this.farmerRepo.findByEmail(normalized)
        : await this.farmerRepo.findByMobileNumber(normalized);

    if (!farmer) {
      throw AppError.notFound('Registered producer account could not be found.');
    }

    // 6. Sign cryptographic JWT Bearer token
    // Exclusively signs role: 'FARMER' from authenticated database record, ignoring any client-supplied input
    const token = jwt.sign(
      {
        id: farmer.id,
        role: 'FARMER',
        mobileNumber: farmer.mobileNumber,
        email: farmer.email || undefined,
        fullName: farmer.fullName,
      },
      env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return {
      token,
      farmer: {
        id: farmer.id,
        role: 'FARMER',
        fullName: farmer.fullName,
        mobileNumber: farmer.mobileNumber,
        email: farmer.email || null,
        preferredLanguage: farmer.preferredLanguage,
        farmerReferenceNumber: farmer.farmerReferenceNumber,
      },
    };
  }

  /**
   * Request linking a new email address to an authenticated farmer account.
   * Dispatches an OTP to the target email to prove email ownership before linking.
   */
  async requestEmailLink(
    farmerId: string,
    rawEmail: string,
    clientIp?: string
  ): Promise<{
    message: string;
    maskedEmail: string;
    cooldownSeconds: number;
    expiresInSeconds: number;
  }> {
    const normalizedEmail = rawEmail.trim().toLowerCase();
    if (!isEmailIdentifier(normalizedEmail)) {
      throw AppError.badRequest('Invalid email address format.');
    }

    // 1. Verify farmer exists
    const farmer = await this.farmerRepo.findById(farmerId);
    if (!farmer) {
      throw AppError.notFound('Producer account not found.');
    }

    // 2. Verify email is not already associated with another account
    const existing = await this.farmerRepo.findByEmail(normalizedEmail);
    if (existing && existing.id !== farmerId) {
      throw AppError.conflict('This email address is already associated with another producer account.');
    }

    // 3. Enforce rate limiting
    if (clientIp) {
      this.enforceRateLimit(this.ipRateLimits, clientIp, 15 * 60 * 1000, this.MAX_SENDS_PER_15MIN_IP, 'network client');
    }
    this.enforceRateLimit(this.identifierRateLimits, normalizedEmail, 60 * 60 * 1000, this.MAX_SENDS_PER_HOUR_IDENTIFIER, 'email address');

    // 4. Enforce cooldown on active link challenge
    const existingChallenge = this.emailLinkChallenges.get(farmerId);
    const now = Date.now();
    if (existingChallenge && now - existingChallenge.createdAt < this.RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((this.RESEND_COOLDOWN_MS - (now - existingChallenge.createdAt)) / 1000);
      throw AppError.tooManyRequests(
        `Please wait ${waitSeconds} second(s) before requesting another email verification code.`
      );
    }

    // 5. Generate secure OTP
    const plainOtp = this.generateSixDigitOtp();
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedOtp = this.hashOtp(normalizedEmail, plainOtp, salt);

    this.emailLinkChallenges.set(farmerId, {
      targetEmail: normalizedEmail,
      hashedOtp,
      salt,
      createdAt: now,
      expiresAt: now + this.OTP_TTL_MS,
      attempts: 0,
    });

    // 6. Dispatch email via Nodemailer
    const sendResult = await this.emailProvider.sendOtpEmail({
      to: normalizedEmail,
      otp: plainOtp,
      recipientName: farmer.fullName,
    });

    if (!sendResult.success) {
      this.emailLinkChallenges.delete(farmerId);
      throw AppError.internal(
        'Failed to dispatch email verification code. Please check configuration or try again shortly.'
      );
    }

    if (this.isDevLoggingEnabled()) {
      logger.info(
        `[DEV AUTH] Email Association OTP for Producer ${farmer.fullName} (${normalizedEmail}): ${plainOtp} (Expires in 5 minutes)`
      );
    }

    return {
      message: 'Verification code dispatched to the specified email address.',
      maskedEmail: this.maskEmail(normalizedEmail),
      cooldownSeconds: 60,
      expiresInSeconds: 300,
    };
  }

  /**
   * Confirm email linking with the 6-digit OTP received in the inbox.
   * Atomically associates the email with the farmer in PostgreSQL.
   */
  async confirmEmailLink(
    farmerId: string,
    rawEmail: string,
    inputOtp: string
  ): Promise<{
    message: string;
    farmer: {
      id: string;
      fullName: string;
      mobileNumber: string;
      email: string | null;
      preferredLanguage: string;
      farmerReferenceNumber: string | null;
    };
  }> {
    const normalizedEmail = rawEmail.trim().toLowerCase();
    const challenge = this.emailLinkChallenges.get(farmerId);
    const now = Date.now();

    if (!challenge || challenge.targetEmail !== normalizedEmail || now > challenge.expiresAt) {
      if (challenge) {
        this.emailLinkChallenges.delete(farmerId);
      }
      throw AppError.badRequest('Invalid or expired email verification code. Please request a new code.');
    }

    if (challenge.attempts >= this.MAX_VERIFY_ATTEMPTS) {
      this.emailLinkChallenges.delete(farmerId);
      throw AppError.badRequest('Too many failed attempts. This verification code has been invalidated.');
    }

    const candidateHash = this.hashOtp(normalizedEmail, inputOtp.trim(), challenge.salt);
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const targetBuf = Buffer.from(challenge.hashedOtp, 'hex');

    const isMatch = candidateBuf.length === targetBuf.length && crypto.timingSafeEqual(candidateBuf, targetBuf);

    if (!isMatch) {
      challenge.attempts += 1;
      const remaining = this.MAX_VERIFY_ATTEMPTS - challenge.attempts;
      if (remaining <= 0) {
        this.emailLinkChallenges.delete(farmerId);
        throw AppError.badRequest('Too many failed attempts. This verification code has been invalidated.');
      }
      throw AppError.badRequest(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    }

    // Burn challenge immediately
    this.emailLinkChallenges.delete(farmerId);

    // Double check email not taken
    const existing = await this.farmerRepo.findByEmail(normalizedEmail);
    if (existing && existing.id !== farmerId) {
      throw AppError.conflict('This email address is already associated with another producer account.');
    }

    // Update farmer email in repository with concurrency conflict handling
    let updated: Farmer;
    try {
      updated = await this.farmerRepo.updateEmail(farmerId, normalizedEmail);
    } catch (err: unknown) {
      if (
        (err as any)?.code === 'P2002' ||
        (err instanceof AppError && err.statusCode === 409)
      ) {
        throw AppError.conflict(
          'This email address is already associated with another producer account.'
        );
      }
      throw err;
    }

    return {
      message: 'Email address verified and successfully associated with your producer account.',
      farmer: {
        id: updated.id,
        fullName: updated.fullName,
        mobileNumber: updated.mobileNumber,
        email: updated.email,
        preferredLanguage: updated.preferredLanguage,
        farmerReferenceNumber: updated.farmerReferenceNumber,
      },
    };
  }

  /**
   * Helper methods for unit/integration testing
   */
  public _getChallengeForTest(normalizedIdentifier: string): OtpChallenge | undefined {
    return this.challenges.get(normalizedIdentifier);
  }

  public _getEmailLinkChallengeForTest(farmerId: string): EmailLinkChallenge | undefined {
    return this.emailLinkChallenges.get(farmerId);
  }

  public _clearAllForTest(): void {
    this.challenges.clear();
    this.emailLinkChallenges.clear();
    this.identifierRateLimits.clear();
    this.ipRateLimits.clear();
  }
}

export const authService = new AuthService();
