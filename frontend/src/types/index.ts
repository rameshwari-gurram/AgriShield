export * from './api';
export * from './farmer';
export * from './farm';
export * from './boundary';

export type ServiceStatusType = 'healthy' | 'degraded' | 'unhealthy' | 'loading' | 'offline';

export interface ServiceCardProps {
  name: string;
  role: string;
  status: ServiceStatusType;
  latency?: number;
  details?: Record<string, string | number | boolean | undefined>;
  error?: string;
}
