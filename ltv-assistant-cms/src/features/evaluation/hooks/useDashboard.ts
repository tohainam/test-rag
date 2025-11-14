/**
 * React hooks for dashboard and results
 * Handles latest run, metrics overview, results listing, and export
 */

import { useCallback, useEffect, useState } from 'react';
import { evaluationApi } from '../api/evaluation.api';
import type {
  DashboardLatestResponse,
  ExportParams,
  ResultDetailResponse,
  ResultFilterParams,
  ResultListResponse,
  RunOverviewResponse,
} from '../types/evaluation.types';

/**
 * Hook to get latest completed run for dashboard auto-load
 */
export const useLatestRun = (autoFetch = true) => {
  const [latestRun, setLatestRun] = useState<DashboardLatestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchLatestRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await evaluationApi.dashboard.getLatestRun();
      setLatestRun(data);
      return data;
    } catch (err) {
      const error = err as Error;
      setError(error);
      // Don't throw - allow component to handle null state
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch) {
      fetchLatestRun();
    }
  }, [autoFetch, fetchLatestRun]);

  return {
    latestRun,
    loading,
    error,
    refetch: fetchLatestRun,
  };
};

/**
 * Hook to get run overview with metrics
 */
export const useRunOverview = (runId?: string, useCache = true) => {
  const [overview, setOverview] = useState<RunOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchOverview = useCallback(
    async (id?: string, cache = true) => {
      const targetId = id || runId;
      if (!targetId) {
        return null;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await evaluationApi.dashboard.getRunOverview(targetId, cache);
        setOverview(data);
        return data;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [runId]
  );

  // Auto-fetch when runId changes
  useEffect(() => {
    if (runId) {
      fetchOverview(runId, useCache);
    }
  }, [runId, useCache, fetchOverview]);

  return {
    overview,
    loading,
    error,
    refetch: fetchOverview,
  };
};

/**
 * Hook to get paginated results with filters
 */
export const useRunResults = (runId?: string, initialParams?: ResultFilterParams) => {
  const [results, setResults] = useState<ResultListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [params, setParams] = useState<ResultFilterParams | undefined>(initialParams);

  const fetchResults = useCallback(
    async (id?: string, filterParams?: ResultFilterParams) => {
      const targetId = id || runId;
      if (!targetId) {
        return null;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await evaluationApi.dashboard.getRunResults(targetId, filterParams || params);
        setResults(data);
        return data;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [runId, params]
  );

  // Auto-fetch when runId or params change
  useEffect(() => {
    if (runId) {
      fetchResults(runId, params);
    }
  }, [runId, params, fetchResults]);

  const updateParams = useCallback((newParams: ResultFilterParams) => {
    setParams(newParams);
  }, []);

  return {
    results,
    loading,
    error,
    params,
    updateParams,
    refetch: fetchResults,
  };
};

/**
 * Hook to get single result detail
 */
export const useResultDetail = (resultId?: string) => {
  const [result, setResult] = useState<ResultDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchResult = useCallback(
    async (id?: string) => {
      const targetId = id || resultId;
      if (!targetId) {
        return null;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await evaluationApi.dashboard.getResultDetail(targetId);
        setResult(data);
        return data;
      } catch (err) {
        const error = err as Error;
        setError(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [resultId]
  );

  // Auto-fetch when resultId changes
  useEffect(() => {
    if (resultId) {
      fetchResult(resultId);
    }
  }, [resultId, fetchResult]);

  return {
    result,
    loading,
    error,
    refetch: fetchResult,
  };
};

/**
 * Hook to export results (opens download)
 */
export const useExportResults = () => {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const exportResults = useCallback((runId: string, params: ExportParams) => {
    setExporting(true);
    setError(null);
    try {
      evaluationApi.dashboard.exportResults(runId, params);
      // Give some time for download to start
      setTimeout(() => setExporting(false), 1000);
    } catch (err) {
      const error = err as Error;
      setError(error);
      setExporting(false);
      throw error;
    }
  }, []);

  return {
    exportResults,
    exporting,
    error,
  };
};
