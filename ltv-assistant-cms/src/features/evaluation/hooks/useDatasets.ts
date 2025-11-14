/**
 * Datasets React Hooks
 * Hooks for managing datasets with axios (no React Query)
 */

import { useCallback, useEffect, useState } from 'react';
import { evaluationApi } from '../api/evaluation.api';
import type {
  DatasetCreateRequest,
  DatasetDetailResponse,
  DatasetListResponse,
  DatasetUpdateRequest,
  PaginationParams,
} from '../types/evaluation.types';

/**
 * Hook to fetch paginated list of datasets
 */
export const useDatasetsList = (initialParams?: PaginationParams) => {
  const [datasets, setDatasets] = useState<DatasetListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [params, setParams] = useState<PaginationParams>(initialParams || { page: 1, limit: 20 });

  const fetchDatasets = useCallback(
    async (fetchParams?: PaginationParams) => {
      setLoading(true);
      setError(null);
      try {
        const data = await evaluationApi.datasets.list(fetchParams || params);
        setDatasets(data);
        return data;
      } catch (err) {
        const error = err as Error;
        setError(error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [params]
  );

  const updateParams = useCallback(
    (newParams: PaginationParams) => {
      setParams(newParams);
      fetchDatasets(newParams);
    },
    [fetchDatasets]
  );

  // Auto-fetch on mount
  useEffect(() => {
    fetchDatasets();
  }, []);

  return {
    datasets,
    loading,
    error,
    params,
    updateParams,
    refetch: fetchDatasets,
  };
};

/**
 * Hook to fetch a single dataset by ID
 */
export const useDatasetDetail = (datasetId?: string) => {
  const [dataset, setDataset] = useState<DatasetDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDataset = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await evaluationApi.datasets.get(id);
      setDataset(data);
      return data;
    } catch (err) {
      const error = err as Error;
      setError(error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (datasetId) {
      fetchDataset(datasetId);
    }
  }, [datasetId, fetchDataset]);

  return {
    dataset,
    loading,
    error,
    refetch: () => datasetId && fetchDataset(datasetId),
  };
};

/**
 * Hook to create a new dataset
 */
export const useDatasetCreate = () => {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createDataset = useCallback(async (data: DatasetCreateRequest) => {
    setCreating(true);
    setError(null);
    try {
      const response = await evaluationApi.datasets.create(data);
      return response;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setCreating(false);
    }
  }, []);

  return { createDataset, creating, error };
};

/**
 * Hook to update an existing dataset
 */
export const useDatasetUpdate = () => {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateDataset = useCallback(async (datasetId: string, data: DatasetUpdateRequest) => {
    setUpdating(true);
    setError(null);
    try {
      const response = await evaluationApi.datasets.update(datasetId, data);
      return response;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setUpdating(false);
    }
  }, []);

  return { updateDataset, updating, error };
};

/**
 * Hook to delete a dataset
 */
export const useDatasetDelete = () => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteDataset = useCallback(async (datasetId: string): Promise<boolean> => {
    setDeleting(true);
    setError(null);
    try {
      await evaluationApi.datasets.delete(datasetId);
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setDeleting(false);
    }
  }, []);

  return { deleteDataset, deleting, error };
};

/**
 * Hook to add files to a dataset
 */
export const useDatasetAddFiles = () => {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addFiles = useCallback(async (datasetId: string, fileIds: string[]) => {
    setAdding(true);
    setError(null);
    try {
      const response = await evaluationApi.datasets.addFiles(datasetId, fileIds);
      return response;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setAdding(false);
    }
  }, []);

  return { addFiles, adding, error };
};

/**
 * Hook to remove a file from a dataset
 */
export const useDatasetRemoveFile = () => {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const removeFile = useCallback(async (datasetId: string, fileId: string) => {
    setRemoving(true);
    setError(null);
    try {
      await evaluationApi.datasets.removeFile(datasetId, fileId);
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setRemoving(false);
    }
  }, []);

  return { removeFile, removing, error };
};
