import axios from 'axios';
import { healthRepository } from '../repositories/health.repository.js';
import { ServiceHealthStatus, ReadyStatus } from '../types/api.types.js';
import { env } from '../config/env.config.js';
import { logger } from '../config/logger.js';

export class HealthService {
  /**
   * Check ML service health over HTTP
   */
  private async checkMlServiceHealth(): Promise<{ reachable: boolean; latencyMs?: number; status?: string; error?: string }> {
    const start = Date.now();
    try {
      const response = await axios.get(`${env.ML_SERVICE_URL}/api/v1/health`, {
        timeout: 2000,
      });

      return {
        reachable: true,
        latencyMs: Date.now() - start,
        status: response.data?.status || 'ok',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to connect to ML service';
      logger.debug(`ML service health check failed: ${msg}`);
      return {
        reachable: false,
        error: msg,
      };
    }
  }

  /**
   * Aggregate overall system health
   */
  async getSystemHealth(): Promise<ServiceHealthStatus> {
    const uptime = process.uptime();
    const dbHealth = await healthRepository.checkDatabaseConnection();
    const mlHealth = await this.checkMlServiceHealth();

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!dbHealth.connected && !mlHealth.reachable) {
      overallStatus = 'degraded';
    } else if (!dbHealth.connected || !mlHealth.reachable) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      uptime: Math.floor(uptime),
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: dbHealth,
      mlService: mlHealth,
    };
  }

  /**
   * Readiness probe for container orchestration
   */
  async getReadiness(): Promise<ReadyStatus> {
    const dbHealth = await healthRepository.checkDatabaseConnection();

    return {
      ready: dbHealth.connected,
      checks: {
        database: dbHealth.connected,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const healthService = new HealthService();
