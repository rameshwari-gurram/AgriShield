export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
  correlationId?: string;
}

export interface DatabaseHealth {
  connected: boolean;
  latencyMs?: number;
  error?: string;
}

export interface MlServiceHealth {
  reachable: boolean;
  latencyMs?: number;
  status?: string;
  error?: string;
}

export interface SystemHealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  version: string;
  database: DatabaseHealth;
  mlService: MlServiceHealth;
}
