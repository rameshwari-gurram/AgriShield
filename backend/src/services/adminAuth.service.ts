/**
 * AgriShield Stage 1: Administrative Authentication Domain Service
 * Secure Credential Verification, Timing Attack Defense, Sliding Rate-Limiting & ADMIN JWT Issuance
 *
 * Security Invariants:
 * 1. Strict Two-Role enforcement: Issues tokens bearing role: 'ADMIN' exclusively.
 * 2. Password verification with bcrypt.compare against securely stored hashes.
 * 3. Timing-safe comparison defense: Dummy hash evaluation on unknown identifiers to prevent enumeration.
 * 4. Generic non-enumerating error messages (401 Unauthorized: Invalid administrative credentials).
 * 5. Sliding-window rate limiting on both Client IP and Administrative Identifier (5 failed attempts / 15 min).
 * 6. Zero Database Writes: Validates against administrative repository.
 * 7. Cryptographic JWT signed with env.JWT_SECRET.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config.js';
import { logger } from '../config/logger.js';
import { adminRepository, IAdminRepository } from '../repositories/admin.repository.js';
import { AdminAuthResult, AuthTokenPayload } from '../types/auth.types.js';
import { AppError } from '../utils/apiError.js';

interface FailedAttemptTracker {
  timestamps: number[];
}

export class AdminAuthService {
  private adminRepo: IAdminRepository;

  // Rate limiting stores: Map<key, FailedAttemptTracker>
  private ipFailedAttempts: Map<string, FailedAttemptTracker> = new Map();
  private identifierFailedAttempts: Map<string, FailedAttemptTracker> = new Map();

  // Rate limiting parameters
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_TRACKED_ENTRIES = 5000; // Maximum allowed entries per in-memory rate-limit Map

  // Pre-computed dummy bcrypt hash (cost factor 10) to equalize response timing when admin is not found
  private readonly DUMMY_BCRYPT_HASH =
    '$2a$10$J0HwMmP78WDAEfG1Ps62j.3S.BjYq1F4nvNk40saItDNHaQoQnC.q';

  constructor(repository: IAdminRepository = adminRepository) {
    this.adminRepo = repository;
  }

  /**
   * Enforce sliding-window rate limit on failed login attempts.
   * Automatically deletes entries whose timestamps have all expired.
   */
  private checkRateLimit(
    trackerMap: Map<string, FailedAttemptTracker>,
    key: string,
    contextDescription: string
  ): void {
    const tracker = trackerMap.get(key);
    if (!tracker) return;

    const now = Date.now();
    // Prune entries outside the sliding lockout window
    tracker.timestamps = tracker.timestamps.filter((ts) => now - ts < this.LOCKOUT_WINDOW_MS);

    // If all timestamps have expired, remove the entry to prevent unbounded growth
    if (tracker.timestamps.length === 0) {
      trackerMap.delete(key);
      return;
    }

    if (tracker.timestamps.length >= this.MAX_FAILED_ATTEMPTS) {
      const oldestAttempt = tracker.timestamps[0];
      const retryAfterSeconds = Math.ceil((this.LOCKOUT_WINDOW_MS - (now - oldestAttempt)) / 1000);
      const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

      throw AppError.tooManyRequests(
        `Too many failed login attempts for this ${contextDescription}. Access temporarily locked. Please retry in ${minutes} minute(s).`
      );
    }
  }

  /**
   * Enforces the maximum size limit (5,000 entries) on the tracker map:
   * 1. First sweeps and deletes all fully expired entries.
   * 2. If size still meets or exceeds MAX_TRACKED_ENTRIES, evicts non-locked entries first.
   * 3. Falls back to oldest-entry eviction (FIFO) to strictly prevent unbounded heap growth.
   */
  private enforceCapacity(trackerMap: Map<string, FailedAttemptTracker>, now: number): void {
    if (trackerMap.size < this.MAX_TRACKED_ENTRIES) {
      return;
    }

    // Pass 1: Prune any expired entries
    for (const [entryKey, tracker] of trackerMap.entries()) {
      tracker.timestamps = tracker.timestamps.filter((ts) => now - ts < this.LOCKOUT_WINDOW_MS);
      if (tracker.timestamps.length === 0) {
        trackerMap.delete(entryKey);
      }
    }

    // Pass 2: If still at or above capacity, evict the oldest non-locked entry
    if (trackerMap.size >= this.MAX_TRACKED_ENTRIES) {
      for (const [entryKey, tracker] of trackerMap.entries()) {
        if (tracker.timestamps.length < this.MAX_FAILED_ATTEMPTS) {
          trackerMap.delete(entryKey);
          if (trackerMap.size < this.MAX_TRACKED_ENTRIES) break;
        }
      }
    }

    // Pass 3: In the edge case where all entries are locked out, evict the oldest entry (FIFO)
    if (trackerMap.size >= this.MAX_TRACKED_ENTRIES) {
      const oldestKey = trackerMap.keys().next().value;
      if (oldestKey !== undefined) {
        trackerMap.delete(oldestKey);
      }
    }
  }

  /**
   * Record a failed attempt under the given key.
   * Automatically enforces capacity boundaries before inserting new keys.
   */
  private recordFailedAttempt(trackerMap: Map<string, FailedAttemptTracker>, key: string): void {
    const now = Date.now();
    let tracker = trackerMap.get(key);
    if (!tracker) {
      this.enforceCapacity(trackerMap, now);
      tracker = { timestamps: [] };
      trackerMap.set(key, tracker);
    }
    tracker.timestamps = tracker.timestamps.filter((ts) => now - ts < this.LOCKOUT_WINDOW_MS);
    tracker.timestamps.push(now);
  }

  /**
   * Clear failed attempt history for a key upon successful authentication.
   */
  private clearFailedAttempts(trackerMap: Map<string, FailedAttemptTracker>, key: string): void {
    trackerMap.delete(key);
  }

  /**
   * Reset all rate limit stores (primarily for testing).
   */
  public resetRateLimits(): void {
    this.ipFailedAttempts.clear();
    this.identifierFailedAttempts.clear();
  }

  /**
   * Helper methods for focused rate limiter unit tests
   */
  public _getMapSize(type: 'ip' | 'identifier'): number {
    return type === 'ip' ? this.ipFailedAttempts.size : this.identifierFailedAttempts.size;
  }

  public _hasKey(key: string, type: 'ip' | 'identifier'): boolean {
    return type === 'ip' ? this.ipFailedAttempts.has(key) : this.identifierFailedAttempts.has(key);
  }

  public _setTrackerForTest(
    key: string,
    timestamps: number[],
    type: 'ip' | 'identifier'
  ): void {
    const map = type === 'ip' ? this.ipFailedAttempts : this.identifierFailedAttempts;
    map.set(key, { timestamps });
  }

  public _triggerCheckForTest(key: string, type: 'ip' | 'identifier'): void {
    const map = type === 'ip' ? this.ipFailedAttempts : this.identifierFailedAttempts;
    this.checkRateLimit(map, key, type);
  }

  public _triggerRecordForTest(key: string, type: 'ip' | 'identifier'): void {
    const map = type === 'ip' ? this.ipFailedAttempts : this.identifierFailedAttempts;
    this.recordFailedAttempt(map, key);
  }

  /**
   * Authenticate administrator using username or email and password.
   * Enforces timing resistance, failed attempt rate limits, and issues ADMIN JWT.
   */
  async login(
    rawIdentifier: string,
    rawPassword: string,
    clientIp?: string
  ): Promise<AdminAuthResult> {
    const identifier = rawIdentifier.trim();
    const normalizedKey = identifier.toLowerCase();

    // 1. Check IP rate limit (if IP is available)
    if (clientIp) {
      this.checkRateLimit(this.ipFailedAttempts, clientIp, 'network client');
    }

    // 2. Check identifier rate limit
    this.checkRateLimit(this.identifierFailedAttempts, normalizedKey, 'administrative account');

    // 3. Look up administrator in repository
    const admin = await this.adminRepo.findByUsernameOrEmail(identifier);

    // 4. Timing-safe password comparison:
    // If admin is not found or has no password hash, compare against the dummy hash to prevent timing attacks
    const hashToCompare = admin && admin.passwordHash ? admin.passwordHash : this.DUMMY_BCRYPT_HASH;
    let isPasswordValid = false;

    try {
      isPasswordValid = await bcrypt.compare(rawPassword, hashToCompare);
    } catch (bcryptErr) {
      logger.error('[ADMIN AUTH] Bcrypt comparison error:', bcryptErr);
      isPasswordValid = false;
    }

    // 5. Evaluate overall validity
    const isAuthenticated = Boolean(admin && admin.isActive && isPasswordValid);

    if (!isAuthenticated) {
      // Record failed attempt for rate limiting
      if (clientIp) {
        this.recordFailedAttempt(this.ipFailedAttempts, clientIp);
      }
      this.recordFailedAttempt(this.identifierFailedAttempts, normalizedKey);

      if (env.NODE_ENV !== 'production') {
        logger.warn(
          `[ADMIN AUTH] Failed administrative login attempt for identifier '${identifier}' from IP '${clientIp || 'unknown'}'`
        );
      }

      // Return generic non-enumerating unauthorized error
      throw AppError.unauthorized('Invalid administrative credentials');
    }

    // 6. On success: clear failed attempt history
    if (clientIp) {
      this.clearFailedAttempts(this.ipFailedAttempts, clientIp);
    }
    this.clearFailedAttempts(this.identifierFailedAttempts, normalizedKey);

    // 7. Generate cryptographic JWT Bearer token with role: 'ADMIN'
    const tokenPayload: AuthTokenPayload = {
      id: admin!.id,
      role: 'ADMIN',
      username: admin!.username,
      email: admin!.email,
      fullName: admin!.fullName,
    };

    const token = jwt.sign(tokenPayload, env.JWT_SECRET, {
      expiresIn: '8h',
    });

    logger.info(
      `[ADMIN AUTH] Administrator '${admin!.username}' (${admin!.id}) successfully authenticated from IP '${clientIp || 'unknown'}'`
    );

    return {
      token,
      user: {
        id: admin!.id,
        username: admin!.username,
        email: admin!.email,
        fullName: admin!.fullName,
        role: 'ADMIN',
      },
    };
  }
}

export const adminAuthService = new AdminAuthService();
