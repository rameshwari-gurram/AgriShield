import { useState, useEffect, useCallback } from 'react';
import { healthService } from '../services/healthService';
import { SystemHealthData } from '../types';
import { POLLING_INTERVAL_MS } from '../utils/constants';

interface UseHealthCheckResult {
  data: SystemHealthData | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refetch: () => Promise<void>;
}

export const useHealthCheck = (autoPoll: boolean = true): UseHealthCheckResult => {
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading((prev) => (data ? false : prev));
      const res = await healthService.getSystemHealth();
      setData(res.data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to backend server';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    fetchHealth();

    if (!autoPoll) return;

    const interval = setInterval(() => {
      fetchHealth();
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchHealth, autoPoll]);

  return { data, loading, error, lastUpdated, refetch: fetchHealth };
};
