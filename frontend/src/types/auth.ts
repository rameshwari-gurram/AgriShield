export type UserRole = 'FARMER' | 'ADMIN';

export interface ProducerProfile {
  id: string;
  role?: 'FARMER';
  fullName: string;
  mobileNumber: string;
  email?: string | null;
  preferredLanguage?: string;
  farmerReferenceNumber?: string | null;
}

export interface AdminProfile {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'ADMIN';
}

export type AuthUser =
  | (ProducerProfile & { role: 'FARMER' })
  | AdminProfile;

export interface SendOtpResponseData {
  message: string;
  maskedMobile: string;
  maskedEmail?: string;
  maskedIdentifier?: string;
  identifierType?: 'mobile' | 'email';
  cooldownSeconds: number;
  expiresInSeconds: number;
}

export interface VerifyOtpResponseData {
  token: string;
  farmer: ProducerProfile;
}

export interface AdminLoginCredentials {
  username: string;
  password: string;
}

export interface AdminLoginResponseData {
  token: string;
  user: AdminProfile;
}

export interface AuthContextType {
  // Unified authentication state
  token: string | null;
  user: AuthUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isFarmer: boolean;

  // Farmer-specific session state (Preserved for 100% backward compatibility)
  producerToken: string | null;
  activeProducer: ProducerProfile | null;
  login: (token: string, farmer: ProducerProfile) => void;
  isOwnerOfFarm: (farmerId?: string | null) => boolean;

  // Admin-specific session state
  adminToken: string | null;
  activeAdmin: AdminProfile | null;
  adminLogin: (token: string, admin: AdminProfile) => void;

  // Unified logout
  logout: () => void;
}
