/**
 * React hooks for file management
 * Handles file upload, listing, download, and deletion
 */

import { useCallback, useEffect, useState } from 'react';
import { evaluationApi } from '../api/evaluation.api';
import type {
  FileDownloadResponse,
  FileListResponse,
  FileUploadResponse,
} from '../types/evaluation.types';

interface UseFilesListParams {
  page?: number;
  limit?: number;
  uploaded_by?: number;
  content_type?: string;
}

/**
 * Hook to manage file list state and operations
 */
export const useFilesList = (initialParams?: UseFilesListParams) => {
  const [files, setFiles] = useState<FileListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [params, setParams] = useState<UseFilesListParams>(initialParams || { page: 1, limit: 20 });

  const fetchFiles = useCallback(
    async (fetchParams?: UseFilesListParams) => {
      setLoading(true);
      setError(null);
      try {
        const data = await evaluationApi.files.list(fetchParams || params);
        setFiles(data);
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

  const updateParams = useCallback(
    (newParams: UseFilesListParams) => {
      setParams(newParams);
      fetchFiles(newParams);
    },
    [fetchFiles]
  );

  // Auto-fetch on mount
  useEffect(() => {
    fetchFiles();
  }, []);

  return {
    files,
    loading,
    error,
    params,
    updateParams,
    refetch: fetchFiles,
  };
};

/**
 * Hook to upload files
 */
export const useFileUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const upload = useCallback(async (file: File): Promise<FileUploadResponse> => {
    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Simulate progress for user feedback
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await evaluationApi.files.upload(file);

      clearInterval(progressInterval);
      setUploadProgress(100);

      return response;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  }, []);

  return {
    upload,
    uploading,
    uploadProgress,
    error,
  };
};

/**
 * Hook to delete files
 */
export const useFileDelete = () => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteFile = useCallback(async (fileId: string) => {
    setDeleting(true);
    setError(null);
    try {
      const result = await evaluationApi.files.delete(fileId);
      return result;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setDeleting(false);
    }
  }, []);

  return {
    deleteFile,
    deleting,
    error,
  };
};

/**
 * Hook to download files
 */
export const useFileDownload = () => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const download = useCallback(async (fileId: string): Promise<FileDownloadResponse> => {
    setDownloading(true);
    setError(null);
    try {
      const response = await evaluationApi.files.download(fileId);
      // Open download URL in new tab
      window.open(response.download_url, '_blank');
      return response;
    } catch (err) {
      const error = err as Error;
      setError(error);
      throw error;
    } finally {
      setDownloading(false);
    }
  }, []);

  return {
    download,
    downloading,
    error,
  };
};
