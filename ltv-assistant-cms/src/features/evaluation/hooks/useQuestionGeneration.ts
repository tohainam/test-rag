/**
 * React hooks for question generation functionality
 */

import { useEffect, useRef, useState } from 'react';
import { evaluationApi } from '../api/evaluation.api';
import type {
  GenerationJobListResponse,
  GenerationStatus,
  QuestionGenerationJob,
  TriggerGenerationRequest,
  TriggerGenerationResponse,
} from '../types/evaluation.types';

// ==================== Trigger Generation Hook ====================

export function useTriggerGeneration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerGeneration = async (
    datasetId: string,
    data: TriggerGenerationRequest = {}
  ): Promise<TriggerGenerationResponse | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await evaluationApi.generation.triggerGeneration(datasetId, data);
      return response;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to trigger generation';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { triggerGeneration, loading, error };
}

// ==================== Generation Job Status Hook with Polling ====================

interface UseGenerationJobStatusOptions {
  pollInterval?: number; // in milliseconds
  enabled?: boolean;
  stopOnComplete?: boolean; // Stop polling when job is completed/failed
}

export function useGenerationJobStatus(
  jobId: string | null,
  options: UseGenerationJobStatusOptions = {}
) {
  const {
    pollInterval = 5000, // 5 seconds default
    enabled = true,
    stopOnComplete = true,
  } = options;

  const [job, setJob] = useState<QuestionGenerationJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const fetchJobStatus = async () => {
    if (!jobId) {
      return;
    }

    try {
      const response = await evaluationApi.generation.getJobStatus(jobId);
      if (isMountedRef.current) {
        setJob(response);
        setError(null);

        // Stop polling if job is complete/failed and stopOnComplete is true
        if (stopOnComplete && (response.status === 'completed' || response.status === 'failed')) {
          stopPolling();
        }
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch job status';
        setError(errorMessage);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const startPolling = () => {
    if (!jobId || !enabled) {
      return;
    }

    setIsPolling(true);
    setLoading(true);

    // Initial fetch
    fetchJobStatus();

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      fetchJobStatus();
    }, pollInterval);
  };

  const stopPolling = () => {
    setIsPolling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const resumePolling = () => {
    if (!isPolling && enabled) {
      startPolling();
    }
  };

  // Start/stop polling based on dependencies
  useEffect(() => {
    if (jobId && enabled) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [jobId, enabled, pollInterval, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, []);

  const refetch = () => fetchJobStatus();

  return {
    job,
    loading,
    error,
    refetch,
    stopPolling,
    resumePolling,
    isPolling,
  };
}

// ==================== List Generation Jobs Hook ====================

interface UseGenerationJobsListOptions {
  status?: GenerationStatus;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

export function useGenerationJobsList(
  datasetId: string | null,
  options: UseGenerationJobsListOptions = {}
) {
  const { status, page = 1, limit = 20, enabled = true } = options;

  const [response, setResponse] = useState<GenerationJobListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    if (!datasetId || !enabled) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await evaluationApi.generation.listJobs(datasetId, {
        status,
        page,
        limit,
      });
      setResponse(data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch generation jobs';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (datasetId && enabled) {
      fetchJobs();
    }
  }, [datasetId, status, page, limit, enabled, fetchJobs]);

  return {
    jobs: response?.jobs || [],
    total: response?.total || 0,
    page: response?.page || 1,
    limit: response?.limit || 20,
    totalPages: response?.total_pages || 0,
    loading,
    error,
    refetch: fetchJobs,
  };
}

// ==================== Active Generation Job Hook ====================

/**
 * Hook to get the active (pending/processing) generation job for a dataset
 */
export function useActiveGenerationJob(datasetId: string | null) {
  const { jobs, loading, error, refetch } = useGenerationJobsList(datasetId, {
    status: undefined, // Get all jobs
    limit: 10, // Get recent jobs
    enabled: !!datasetId,
  });

  // Find the most recent active job (pending or processing)
  const activeJob = jobs.find((job) => job.status === 'pending' || job.status === 'processing');

  return {
    activeJob: activeJob || null,
    loading,
    error,
    refetch,
  };
}
