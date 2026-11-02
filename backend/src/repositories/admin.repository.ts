/**
 * AgriShield Stage 1: Administrative Repository
 * Zero-Database Architecture: Safely sources administrator configuration from environment
 * without requiring database migrations, writes, or seeds.
 */

import { AdminUser } from '../types/auth.types.js';
import { env } from '../config/env.config.js';

export interface IAdminRepository {
  findByUsername(username: string): Promise<AdminUser | null>;
  findByEmail(email: string): Promise<AdminUser | null>;
  findById(id: string): Promise<AdminUser | null>;
  findByUsernameOrEmail(identifier: string): Promise<AdminUser | null>;
}

export class EnvAdminRepository implements IAdminRepository {
  private customConfig?: AdminUser | null;

  constructor(customConfig?: AdminUser | null) {
    this.customConfig = customConfig;
  }

  /**
   * Resolve currently configured admin record from environment or injected config.
   */
  private getAdminRecord(): AdminUser | null {
    if (this.customConfig !== undefined) {
      return this.customConfig;
    }

    const username = env.ADMIN_USERNAME || process.env.ADMIN_USERNAME;
    const passwordHash = env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH;

    if (!username || !passwordHash) {
      return null;
    }

    const email = env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@agrishield.com';
    const id = env.ADMIN_ID || process.env.ADMIN_ID || '00000000-0000-4000-8000-000000000001';
    const fullName = env.ADMIN_FULL_NAME || process.env.ADMIN_FULL_NAME || 'AgriShield Administrator';

    return {
      id: id.trim(),
      username: username.trim(),
      email: email.trim().toLowerCase(),
      fullName: fullName.trim(),
      role: 'ADMIN',
      passwordHash: passwordHash.trim(),
      isActive: true,
    };
  }

  /**
   * Set or override admin record in-memory (useful for testing)
   */
  public setAdminRecord(admin: AdminUser | null): void {
    this.customConfig = admin;
  }

  async findByUsername(username: string): Promise<AdminUser | null> {
    const admin = this.getAdminRecord();
    if (!admin || !admin.isActive) return null;

    if (admin.username.toLowerCase() === username.trim().toLowerCase()) {
      return { ...admin };
    }
    return null;
  }

  async findByEmail(email: string): Promise<AdminUser | null> {
    const admin = this.getAdminRecord();
    if (!admin || !admin.isActive) return null;

    if (admin.email.toLowerCase() === email.trim().toLowerCase()) {
      return { ...admin };
    }
    return null;
  }

  async findById(id: string): Promise<AdminUser | null> {
    const admin = this.getAdminRecord();
    if (!admin || !admin.isActive) return null;

    if (admin.id === id.trim()) {
      return { ...admin };
    }
    return null;
  }

  async findByUsernameOrEmail(identifier: string): Promise<AdminUser | null> {
    const admin = this.getAdminRecord();
    if (!admin || !admin.isActive) return null;

    const normalized = identifier.trim().toLowerCase();
    if (
      admin.username.toLowerCase() === normalized ||
      admin.email.toLowerCase() === normalized
    ) {
      return { ...admin };
    }
    return null;
  }
}

export const adminRepository = new EnvAdminRepository();
