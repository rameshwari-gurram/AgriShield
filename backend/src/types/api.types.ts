export interface ApiResponseEnvelope<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  timestamp: string;
  correlationId?: string;
}

export interface ServiceHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  version: string;
  database: {
    connected: boolean;
    latencyMs?: number;
    error?: string;
  };
  mlService: {
    reachable: boolean;
    latencyMs?: number;
    status?: string;
    error?: string;
  };
}

export interface ReadyStatus {
  ready: boolean;
  checks: {
    database: boolean;
  };
  timestamp: string;
}
