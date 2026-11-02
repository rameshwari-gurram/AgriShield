/**
 * AgriShield Authentication & Authorization Type Definitions
 * Strictly enforces a two-role model: 'FARMER' and 'ADMIN'.
 * No other roles (staff, underwriter, etc.) are permitted.
 */

export type UserRole = 'FARMER' | 'ADMIN';

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'ADMIN';
  passwordHash: string;
  isActive: boolean;
}

export interface AdminProfile {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'ADMIN';
}

export interface AdminAuthResult {
  token: string;
  user: AdminProfile;
}

export interface FarmerAuthProfile {
  id: string;
  role: 'FARMER';
  fullName: string;
  mobileNumber: string;
  email: string | null;
  preferredLanguage: string;
  farmerReferenceNumber: string | null;
}

export interface FarmerAuthResult {
  token: string;
  farmer: FarmerAuthProfile;
}

export interface AuthTokenPayload {
  id: string;
  role: UserRole;
  username?: string;
  email?: string;
  mobileNumber?: string;
  fullName?: string;
}
