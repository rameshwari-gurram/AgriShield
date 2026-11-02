import { UserRole } from './auth.types.js';

// Extend Express Request interface for contextual properties (e.g. auth user, correlationId)
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      user?: {
        id: string;
        role?: UserRole | string;
        username?: string;
        email?: string;
        mobileNumber?: string;
        fullName?: string;
      };
    }
  }
}

export {};
