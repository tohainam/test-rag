/**
 * React hooks for evaluation job management
 * Handles job creation, status polling, and job listing
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { evaluationApi } from '../api/evaluation.api';
import type {
  JobCreateRequest,
  JobCreateResponse,
  JobListResponse,
  JobStatusResponse,
  PaginationParams,
} from '../types/evaluation.types';

/**
 * Hook to create and start evaluation job
 */
export const useStartEvaluation = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startEvaluation = useCallback(
    async (request: JobCreateRequest): Promise<JobCreateResponse> => {
      setLoading(true);
      setError(null);
      try {
        const response = await evaluationApi.jobs.create(request);
        return response;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    startEvaluation,
    loading,
    error,
  };
};

/**
 * Hook to get job status with automatic polling
 */
export const useJobStatus = (
  jobId?: string,
  options?: {
    pollInterval?: number; // Default: 5000ms
    enabled?: boolean; // Default: true
    stopOnComplete?: boolean; // Default: true
  }
) => {
  const { pollInterval = 5000, enabled = true, stopOnComplete = true } = options || {};

  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(
    async (id?: string) => {
      const targetId = id || jobId;
      if (!targetId) {
        return null;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await evaluationApi.jobs.getStatus(targetId);
        setStatus(data);
        return data;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [jobId]
  );

  // Setup polling
  useEffect(() => {
    if (!jobId || !enabled) {
      return;
    }

    // Initial fetch
    fetchStatus(jobId);

    // Setup interval for polling
    intervalRef.current = setInterval(() => {
      fetchStatus(jobId).then((data) => {
        // Stop polling if job is completed or failed
        if (stopOnComplete && data && (data.status === 'completed' || data.status === 'failed')) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      });
    }, pollInterval);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, enabled, pollInterval, stopOnComplete, fetchStatus]);

  // Manual stop function
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Manual resume function
  const resumePolling = useCallback(() => {
    if (!intervalRef.current && jobId && enabled) {
      intervalRef.current = setInterval(() => {
        fetchStatus(jobId);
      }, pollInterval);
    }
  }, [jobId, enabled, pollInterval, fetchStatus]);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
    stopPolling,
    resumePolling,
    isPolling: intervalRef.current !== null,
  };
};

/**
 * Hook to list jobs with pagination and filters
 */
export const useJobsList = (
  initialParams?: PaginationParams & { status?: string; dataset_id?: string }
) => {
  const [jobs, setJobs] = useState<JobListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [params, setParams] = useState(initialParams);

  const fetchJobs = useCallback(
    async (filterParams?: PaginationParams & { status?: string; dataset_id?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const data = await evaluationApi.jobs.list(filterParams || params);
        setJobs(data);
        return data;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [params]
  );

  // Auto-fetch on mount
  useEffect(() => {
    fetchJobs(params);
  }, [params, fetchJobs]);

  const updateParams = useCallback(
    (newParams: PaginationParams & { status?: string; dataset_id?: string }) => {
      setParams(newParams);
    },
    []
  );

  return {
    jobs,
    loading,
    error,
    params,
    updateParams,
    refetch: fetchJobs,
  };
};
