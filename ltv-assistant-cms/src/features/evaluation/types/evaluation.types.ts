/**
 * TypeScript types for RAGAS Evaluation System
 * Matches backend Pydantic schemas
 */

// ==================== File Types ====================

export interface FileUploadResponse {
  file_id: string;
  filename: string;
  original_filename: string;
  content_type: string;
  filesize: number;
  created_at: string;
}

export interface FileListItem {
  file_id: string;
  filename: string;
  original_filename: string;
  content_type: string;
  filesize: number;
  uploaded_by_user_id: number;
  created_at: string;
}

export interface FileListResponse {
  items: FileListItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface FileDownloadResponse {
  download_url: string;
  expires_in: number;
  filename: string;
}

// ==================== Dataset Types ====================

export type DatasetSource = 'manual' | 'llm_generated';

export interface DatasetCreateRequest {
  name: string;
  description?: string;
  source: DatasetSource;
  file_ids?: string[];
}

export interface DatasetUpdateRequest {
  name?: string;
  description?: string;
  file_ids?: string[];
}

export interface DatasetResponse {
  dataset_id: string;
  name: string;
  description?: string;
  source: DatasetSource;
  total_questions: number;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
  generation_job_id?: string; // Present if generation was triggered
}

export interface DatasetListItem {
  dataset_id: string;
  name: string;
  description?: string;
  source: DatasetSource;
  total_questions: number;
  question_count?: number;
  file_count?: number;
  created_at: string;
  generation_job?: {
    job_id: string;
    status: GenerationStatus;
    progress_percent: number;
    processed_files: number;
    total_files: number;
    total_questions_generated: number;
  };
}

export interface DatasetListResponse {
  items: DatasetListItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface DatasetDetailResponse {
  dataset: DatasetResponse;
  questions: QuestionResponse[];
  files: FileListItem[];
}

// ==================== Question Types ====================

export interface QuestionInput {
  question: string;
  expected_context: string;
  metadata?: Record<string, any>;
}

export interface QuestionBulkAddRequest {
  questions: QuestionInput[];
}

export interface QuestionResponse {
  question_id: string;
  dataset_id: string;
  question: string;
  expected_context: string;
  order_index: number;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface QuestionReorderItem {
  question_id: string;
  order_index: number;
}

export interface QuestionReorderRequest {
  question_orders: QuestionReorderItem[];
}

// ==================== Job Types ====================

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobCreateRequest {
  dataset_id: string;
  top_k?: number;
  metadata?: Record<string, any>;
}

export interface JobCreateResponse {
  job_id: string;
  run_id: string;
  dataset_id: string;
  status: JobStatus;
  created_at: string;
  message: string;
}

export interface JobStatusResponse {
  job_id: string;
  run_id: string;
  status: JobStatus;
  progress_percent: number;
  current_step?: string;
  total_questions: number;
  completed_questions: number;
  failed_questions: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  average_scores?: AverageScores;
  statistics?: RunStatistics;
  processing_time_ms?: number;
}

export interface JobListItem {
  job_id: string;
  run_id: string;
  dataset_id: string;
  dataset_name: string;
  status: JobStatus;
  phase?: string;
  progress_percent: number;
  total_questions: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export interface JobListResponse {
  items: JobListItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ==================== Dashboard & Result Types ====================

export interface AverageScores {
  context_precision: number;
  context_recall: number;
  context_relevancy: number;
}

export interface MetricStatistics {
  mean: number;
  median: number;
  std_dev: number;
  min: number;
  max: number;
  count: number;
}

export interface RunStatistics {
  context_precision?: MetricStatistics;
  context_recall?: MetricStatistics;
  context_relevancy?: MetricStatistics;
}

export interface DashboardLatestResponse {
  run_id: string;
  dataset_id: string;
  dataset_name: string;
  job_id: string;
  total_questions: number;
  completed_questions: number;
  failed_questions: number;
  average_scores?: AverageScores;
  statistics?: RunStatistics;
  processing_time_ms?: number;
  created_at: string;
  completed_at?: string;
}

export interface RunOverviewResponse {
  run_id: string;
  dataset_id: string;
  dataset_name: string;
  job_id: string;
  total_questions: number;
  completed_questions: number;
  failed_questions: number;
  success_rate: number;
  avg_context_precision: number;
  avg_context_recall: number;
  avg_context_relevancy: number;
  overall_score: number;
  precision_stats?: MetricStatistics;
  recall_stats?: MetricStatistics;
  relevancy_stats?: MetricStatistics;
  processing_time_ms?: number;
  avg_time_per_question_ms?: number;
  created_at: string;
  completed_at?: string;
}

export type ResultStatus = 'completed' | 'failed';

export interface ResultListItem {
  result_id: string;
  question_id: string;
  question_text: string;
  context_precision?: number;
  context_recall?: number;
  context_relevancy?: number;
  status: ResultStatus;
  created_at: string;
}

export interface ResultListResponse {
  items: ResultListItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ResultDetailResponse {
  result_id: string;
  run_id: string;
  question_id: string;
  question_text: string;
  expected_context: string;
  retrieved_contexts: string[];
  context_precision?: number;
  context_recall?: number;
  context_relevancy?: number;
  status: ResultStatus;
  error_message?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

// ==================== Question Generation Job Types ====================

export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface QuestionGenerationJob {
  job_id: string;
  dataset_id: string;
  status: GenerationStatus;
  progress_percent: number;
  current_file: string | null;
  total_files: number;
  processed_files: number;
  failed_files: number;
  total_questions_generated: number;
  config?: Record<string, any>;
  error_messages?: string[];
  file_results?: Record<
    string,
    {
      status: 'success' | 'failed';
      filename: string;
      questions_count?: number;
      error?: string;
    }
  >;
  processing_time_ms?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  updated_at: string;
}

export interface GenerationJobListResponse {
  jobs: QuestionGenerationJob[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface TriggerGenerationRequest {
  file_ids?: string[];
  config?: Record<string, any>;
}

export interface TriggerGenerationResponse {
  success: boolean;
  job_id: string;
  dataset_id: string;
  total_files: number;
  message: string;
}

// ==================== Utility Types ====================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface ResultFilterParams extends PaginationParams {
  search?: string;
  min_precision?: number;
  min_recall?: number;
  min_relevancy?: number;
  sort_by?: 'context_precision' | 'context_recall' | 'context_relevancy' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

export type ExportFormat = 'csv' | 'json';
export type ExportType = 'summary' | 'detailed';

export interface ExportParams {
  format: ExportFormat;
  type?: ExportType;
}

// ==================== API Error Types ====================

export interface ApiError {
  error: string;
  message: string;
}
