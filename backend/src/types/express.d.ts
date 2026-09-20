// Extend Express Request interface for future contextual properties (e.g. auth user, correlationId)

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      user?: {
        id: string;
        email?: string;
        role?: string;
      };
    }
  }
}

export {};
