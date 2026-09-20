import { prisma } from '../config/db.js';

export interface DatabaseHealthCheckResult {
  connected: boolean;
  latencyMs?: number;
  error?: string;
}

export class HealthRepository {
  /**
   * Ping database via Prisma using raw SQL heartbeat query
   */
  async checkDatabaseConnection(): Promise<DatabaseHealthCheckResult> {
    const start = Date.now();
    try {
      // Direct raw query that does not depend on any specific tables/models
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;
      return {
        connected: true,
        latencyMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      return {
        connected: false,
        error: errorMessage,
      };
    }
  }
}

export const healthRepository = new HealthRepository();
