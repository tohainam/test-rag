/**
 * API client for RAGAS Evaluation System
 * All endpoints communicate through API Gateway at /evaluation/*
 */

import apiClient from '@/shared/api/axios';
import type {
  DashboardLatestResponse,
  DatasetCreateRequest,
  DatasetDetailResponse,
  DatasetListResponse,
  DatasetResponse,
  ExportParams,
  FileDownloadResponse,
  FileListResponse,
  FileUploadResponse,
  JobCreateRequest,
  JobCreateResponse,
  JobListResponse,
  JobStatusResponse,
  PaginationParams,
  QuestionBulkAddRequest,
  QuestionReorderRequest,
  QuestionResponse,
  ResultDetailResponse,
  ResultFilterParams,
  ResultListResponse,
  RunOverviewResponse,
} from '../types/evaluation.types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:50050';

// ==================== File Management APIs ====================

export const filesApi = {
  /**
   * Upload a file to MinIO evaluation bucket
   */
  upload: async (file: File): Promise<FileUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<FileUploadResponse>(
      '/evaluation/files/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  /**
   * List files with pagination
   */
  list: async (params?: PaginationParams): Promise<FileListResponse> => {
    const response = await apiClient.get<FileListResponse>('/evaluation/files', { params });
    return response.data;
  },

  /**
   * Delete a file
   */
  delete: async (fileId: string): Promise<void> => {
    await apiClient.delete(`/evaluation/files/${fileId}`);
  },

  /**
   * Download a file
   */
  download: async (fileId: string): Promise<FileDownloadResponse> => {
    const response = await apiClient.get<FileDownloadResponse>(
      `/evaluation/files/${fileId}/download`
    );
    return response.data;
  },
};

// ==================== Dataset Management APIs ====================

export const datasetsApi = {
  /**
   * Create a new dataset
   */
  create: async (data: DatasetCreateRequest): Promise<DatasetResponse> => {
    const response = await apiClient.post<DatasetResponse>('/evaluation/datasets', data);
    return response.data;
  },

  /**
   * List datasets with pagination
   */
  list: async (params?: PaginationParams): Promise<DatasetListResponse> => {
    const response = await apiClient.get<DatasetListResponse>('/evaluation/datasets', { params });
    return response.data;
  },

  /**
   * Get dataset details with questions and files
   */
  get: async (datasetId: string): Promise<DatasetDetailResponse> => {
    const response = await apiClient.get<DatasetDetailResponse>(
      `/evaluation/datasets/${datasetId}`
    );
    return response.data;
  },

  /**
   * Update dataset
   */
  update: async (
    datasetId: string,
    data: Partial<DatasetCreateRequest>
  ): Promise<DatasetResponse> => {
    const response = await apiClient.patch<DatasetResponse>(
      `/evaluation/datasets/${datasetId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete dataset
   */
  delete: async (datasetId: string): Promise<void> => {
    await apiClient.delete(`/evaluation/datasets/${datasetId}`);
  },

  /**
   * Add files to dataset
   */
  addFiles: async (datasetId: string, fileIds: string[]): Promise<DatasetResponse> => {
    const response = await apiClient.post<DatasetResponse>(
      `/evaluation/datasets/${datasetId}/files`,
      {
        file_ids: fileIds,
      }
    );
    return response.data;
  },

  /**
   * Remove file from dataset
   */
  removeFile: async (datasetId: string, fileId: string): Promise<void> => {
    await apiClient.delete(`/evaluation/datasets/${datasetId}/files/${fileId}`);
  },
};

// ==================== Question Management APIs ====================

export const questionsApi = {
  /**
   * Bulk add questions to a dataset
   */
  bulkAdd: async (datasetId: string, data: QuestionBulkAddRequest): Promise<QuestionResponse[]> => {
    const response = await apiClient.post<QuestionResponse[]>(
      `/evaluation/datasets/${datasetId}/questions/bulk`,
      data
    );
    return response.data;
  },

  /**
   * Update a question
   */
  update: async (
    questionId: string,
    data: Partial<QuestionBulkAddRequest['questions'][0]>
  ): Promise<QuestionResponse> => {
    const response = await apiClient.patch<QuestionResponse>(
      `/evaluation/questions/${questionId}`,
      data
    );
    return response.data;
  },

  /**
   * Delete a question
   */
  delete: async (questionId: string): Promise<void> => {
    await apiClient.delete(`/evaluation/questions/${questionId}`);
  },

  /**
   * Reorder questions in a dataset
   */
  reorder: async (datasetId: string, data: QuestionReorderRequest): Promise<void> => {
    await apiClient.post(`/evaluation/datasets/${datasetId}/questions/reorder`, data);
  },
};

// ==================== Job Management APIs ====================

export const jobsApi = {
  /**
   * Create and start an evaluation job
   */
  create: async (data: JobCreateRequest): Promise<JobCreateResponse> => {
    const response = await apiClient.post<JobCreateResponse>('/evaluation/jobs', data);
    return response.data;
  },

  /**
   * Get job status
   */
  getStatus: async (jobId: string): Promise<JobStatusResponse> => {
    const response = await apiClient.get<JobStatusResponse>(`/evaluation/jobs/${jobId}`);
    return response.data;
  },

  /**
   * List jobs with pagination and filters
   */
  list: async (
    params?: PaginationParams & { status?: string; dataset_id?: string }
  ): Promise<JobListResponse> => {
    const response = await apiClient.get<JobListResponse>('/evaluation/jobs', { params });
    return response.data;
  },
};

// ==================== Dashboard & Results APIs ====================

export const dashboardApi = {
  /**
   * Get latest completed evaluation run (auto-load)
   */
  getLatestRun: async (): Promise<DashboardLatestResponse> => {
    const response = await apiClient.get<DashboardLatestResponse>('/evaluation/dashboard/latest');
    return response.data;
  },

  /**
   * Get run metrics overview
   */
  getRunOverview: async (runId: string, useCache = true): Promise<RunOverviewResponse> => {
    const response = await apiClient.get<RunOverviewResponse>(
      `/evaluation/runs/${runId}/overview`,
      {
        params: { use_cache: useCache },
      }
    );
    return response.data;
  },

  /**
   * Get run results with pagination and filters
   */
  getRunResults: async (
    runId: string,
    params?: ResultFilterParams
  ): Promise<ResultListResponse> => {
    const response = await apiClient.get<ResultListResponse>(`/evaluation/runs/${runId}/results`, {
      params,
    });
    return response.data;
  },

  /**
   * Get detailed result for a question
   */
  getResultDetail: async (resultId: string): Promise<ResultDetailResponse> => {
    const response = await apiClient.get<ResultDetailResponse>(`/evaluation/results/${resultId}`);
    return response.data;
  },

  /**
   * Export results (opens download URL in new tab)
   */
  exportResults: (runId: string, params: ExportParams): void => {
    const queryString = new URLSearchParams({
      format: params.format,
      ...(params.type && { type: params.type }),
    }).toString();

    const url = `${API_URL}/evaluation/runs/${runId}/export?${queryString}`;
    window.open(url, '_blank');
  },
};

// ==================== Question Generation API ====================

export const generationApi = {
  /**
   * Trigger question generation for a dataset
   */
  triggerGeneration: async (
    datasetId: string,
    data: import('../types/evaluation.types').TriggerGenerationRequest
  ): Promise<import('../types/evaluation.types').TriggerGenerationResponse> => {
    const response = await apiClient.post(`/evaluation/datasets/${datasetId}/generate`, data);
    return response.data;
  },

  /**
   * Get status of a generation job
   */
  getJobStatus: async (
    jobId: string
  ): Promise<import('../types/evaluation.types').QuestionGenerationJob> => {
    const response = await apiClient.get(`/evaluation/generation-jobs/${jobId}`);
    return response.data;
  },

  /**
   * List generation jobs for a dataset
   */
  listJobs: async (
    datasetId: string,
    params?: {
      status?: import('../types/evaluation.types').GenerationStatus;
      page?: number;
      limit?: number;
    }
  ): Promise<import('../types/evaluation.types').GenerationJobListResponse> => {
    const response = await apiClient.get(`/evaluation/datasets/${datasetId}/generation-jobs`, {
      params,
    });
    return response.data;
  },
};

// ==================== Unified Export ====================

export const evaluationApi = {
  files: filesApi,
  datasets: datasetsApi,
  questions: questionsApi,
  jobs: jobsApi,
  dashboard: dashboardApi,
  generation: generationApi,
};
