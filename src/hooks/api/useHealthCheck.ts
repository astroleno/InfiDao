import { useState, useCallback, useEffect } from 'react';
import { HealthCheckResponse, ApiResponse } from '@/types';

interface UseHealthCheckOptions {
  interval?: number; // ms
  onSuccess?: (health: HealthCheckResponse) => void;
  onError?: (error: Error) => void;
  autoStart?: boolean;
}

interface UseHealthCheckReturn {
  checkHealth: () => Promise<HealthCheckResponse | null>;
  isHealthy: boolean;
  isLoading: boolean;
  error: Error | null;
  lastCheck: HealthCheckResponse | null;
  uptime: number;
}

export function useHealthCheck(options: UseHealthCheckOptions = {}): UseHealthCheckReturn {
  const [isHealthy, setIsHealthy] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastCheck, setLastCheck] = useState<HealthCheckResponse | null>(null);
  const [uptime, setUptime] = useState(0);

  const {
    interval = 30000, // 30 seconds
    onSuccess,
    onError,
    autoStart = true
  } = options;

  const checkHealth = useCallback(async (): Promise<HealthCheckResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add cache busting
        cache: 'no-cache',
      });

      if (!response.ok) {
        throw new Error(`健康检查失败: ${response.statusText}`);
      }

      const data: ApiResponse<HealthCheckResponse> = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || '健康检查失败');
      }

      const healthData = data.data;

      if (!healthData) {
        throw new Error('健康检查数据为空');
      }

      setLastCheck(healthData);
      setIsHealthy(healthData.status === 'healthy');
      setUptime(healthData.uptime);

      onSuccess?.(healthData);
      return healthData;

    } catch (err) {
      const error = err instanceof Error ? err : new Error('健康检查失败');
      setError(error);
      setIsHealthy(false);
      onError?.(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [onSuccess, onError]);

  // Auto-check on mount
  useEffect(() => {
    if (autoStart) {
      checkHealth();
    }
  }, [autoStart, checkHealth]);

  // Set up interval for periodic checks
  useEffect(() => {
    if (!interval || interval <= 0) {
      return;
    }

    const intervalId = setInterval(() => {
      checkHealth();
    }, interval);

    return () => {
      clearInterval(intervalId);
    };
  }, [interval, checkHealth]);

  return {
    checkHealth,
    isHealthy,
    isLoading,
    error,
    lastCheck,
    uptime
  };
}