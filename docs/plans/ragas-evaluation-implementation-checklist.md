# RAGAS Evaluation System - Implementation Checklist

**Version:** 1.0
**Created:** 2025-11-10
**Base Document:** ragas-evaluation-implement-plan.md (PRD v5.0)
**Language:** Tiếng Việt
**Status:** Ready for Development

---

## Mục Lục

1. [Phase 0: Preparation & Setup](#phase-0-preparation--setup)
2. [Phase 1: Foundation (Week 1-2)](#phase-1-foundation-week-1-2)
3. [Phase 2: File & Dataset Management (Week 3-4)](#phase-2-file--dataset-management-week-3-4)
4. [Phase 3: Evaluation Engine (Week 5-6)](#phase-3-evaluation-engine-week-5-6)
5. [Phase 4: Dashboard & Results (Week 7-8)](#phase-4-dashboard--results-week-7-8)
6. [Phase 5: Testing & Polish](#phase-5-testing--polish)
7. [Phase 6: Deployment](#phase-6-deployment)
8. [Optional: LLM Generation Feature](#optional-llm-generation-feature)

---

## Phase 0: Preparation & Setup

### 0.1 Planning & Design Review
- [ ] Review PRD document với team
- [ ] Clarify unclear requirements với stakeholders
- [ ] Xác nhận technical stack và dependencies
- [ ] Set up project timeline và milestones
- [ ] Assign roles và responsibilities

### 0.2 Environment Setup
- [ ] Chuẩn bị development environment (Python 3.11+, Node.js)
- [ ] Install Docker và Docker Compose
- [ ] Setup IDE và extensions (Python, TypeScript)
- [ ] Configure linting tools (pylint, eslint)
- [ ] Setup version control (git branches)

### 0.3 Documentation & Communication
- [ ] Tạo project workspace (Slack channel, Notion, etc.)
- [ ] Setup daily standup schedule
- [ ] Tạo task board (Jira, Trello, GitHub Projects)
- [ ] Document team conventions (coding standards, commit messages)

---

## Phase 1: Foundation (Week 1-2)

### 1.1 Project Structure Setup

#### Backend Service (ltv-ragas-evaluation)
- [ ] Tạo thư mục `ltv-ragas-evaluation/` trong root project
- [ ] Initialize Python project structure:
  ```
  ltv-ragas-evaluation/
  ├── src/
  │   ├── __init__.py
  │   ├── app.py              # Flask application
  │   ├── config/
  │   ├── models/             # SQLAlchemy models
  │   ├── routes/             # API endpoints
  │   ├── services/           # Business logic
  │   ├── workers/            # RQ workers
  │   └── utils/
  ├── tests/
  ├── requirements.txt
  ├── Dockerfile
  ├── docker-compose.override.yml
  └── README.md
  ```
- [ ] Tạo `requirements.txt` với dependencies:
  - Flask
  - SQLAlchemy
  - redis
  - rq
  - ragas==0.3.8
  - minio
  - python-dotenv
  - requests
- [ ] Tạo `.env.example` file
- [ ] Tạo Dockerfile cho Python service (reference bge-reranker pattern)
- [ ] Setup logging configuration (JSON structured logs)

### 1.2 Database Schema Design

#### MySQL Schema
- [ ] Tạo migration folder structure (sử dụng Alembic)
- [ ] Design schema cho các tables:
  - [ ] `evaluation_files` table
    - file_id (UUID, PK)
    - filename, original_filename
    - content_type, filesize
    - minio_bucket, minio_object_name
    - uploaded_by_user_id
    - created_at, updated_at
    - indexes: uploaded_by_user_id, created_at

  - [ ] `evaluation_datasets` table
    - dataset_id (UUID, PK)
    - name (VARCHAR 255)
    - description (TEXT)
    - source (ENUM: 'manual', 'llm_generated')
    - config (JSON)
    - total_questions (INT)
    - created_by_user_id
    - created_at, updated_at
    - indexes: created_by_user_id, source, created_at

  - [ ] `dataset_questions` table
    - question_id (UUID, PK)
    - dataset_id (UUID, FK)
    - question (TEXT)
    - expected_context (TEXT)
    - order_index (INT) ← Important
    - metadata (JSON)
    - created_at, updated_at
    - indexes: dataset_id, order_index
    - unique constraint: (dataset_id, order_index)

  - [ ] `evaluation_jobs` table
    - job_id (UUID, PK)
    - status (ENUM: 'pending', 'processing', 'completed', 'failed')
    - phase (VARCHAR 100)
    - progress_percent (INT)
    - current_step (VARCHAR 255)
    - config (JSON)
    - created_by_user_id
    - error_message (TEXT)
    - created_at, started_at, completed_at
    - indexes: status, created_by_user_id, created_at

  - [ ] `evaluation_runs` table
    - run_id (UUID, PK)
    - dataset_id (UUID, FK)
    - job_id (UUID, FK)
    - status (ENUM: 'pending', 'running', 'completed', 'failed')
    - config (JSON)
    - total_questions (INT)
    - successful_questions (INT)
    - failed_questions (INT)
    - current_question_index (INT) ← Track progress
    - current_question_id (UUID) ← Track current question
    - average_scores (JSON)
    - statistics (JSON)
    - processing_time_ms (BIGINT)
    - created_at, completed_at
    - indexes: dataset_id, job_id, created_at DESC

  - [ ] `evaluation_results` table
    - result_id (UUID, PK)
    - run_id (UUID, FK)
    - question_id (UUID, FK)
    - question (TEXT)
    - retrieved_contexts (JSON)
    - expected_context (TEXT)
    - context_precision (FLOAT)
    - context_recall (FLOAT)
    - context_relevancy (FLOAT)
    - metadata (JSON)
    - created_at
    - indexes: run_id, question_id, created_at

  - [ ] `dataset_files` junction table (many-to-many)
    - dataset_id (UUID, FK)
    - file_id (UUID, FK)
    - created_at
    - primary key: (dataset_id, file_id)

- [ ] Write initial migration script
- [ ] Test migration locally

#### Redis Setup
- [ ] Configure Redis for RQ job queue
- [ ] Setup Redis key namespaces:
  - `ragas:job:{job_id}` - Job status cache
  - `ragas:latest_run` - Latest run_id cache
  - `ragas:progress:{run_id}` - Progress tracking
- [ ] Define TTL policies (job status: 7 days, latest run: no expiry)

### 1.3 MinIO Bucket Setup
- [ ] Tạo bucket "evaluation" trong MinIO
- [ ] Configure bucket policies (private, no public access)
- [ ] Setup lifecycle rules (optional: auto-delete after X days)
- [ ] Test upload/download operations
- [ ] Configure presigned URL expiry (1 hour)

### 1.4 Flask Application Setup
- [ ] Initialize Flask app với basic configuration
- [ ] Setup environment-based config (development, production)
- [ ] Configure CORS settings
- [ ] Setup error handlers (404, 500, custom errors)
- [ ] Implement health check endpoint: `GET /health`
- [ ] Setup SQLAlchemy connection với connection pooling
- [ ] Setup MinIO client configuration
- [ ] Test Flask app starts successfully

### 1.5 API Gateway Integration
- [ ] Update `api-gateway/src/main.ts`
- [ ] Add proxy configuration cho `/evaluation/*`:
  - Target: `http://ltv-ragas-evaluation:50059`
  - Forward headers: X-Gateway-Auth, X-User-Id, X-User-Email, X-User-Role
  - Remove unwanted headers
- [ ] Add role check middleware: only "super_admin" allowed
- [ ] Test proxy routing locally
- [ ] Update `PUBLIC_PATHS` nếu cần (health check)

### 1.6 Docker & Docker Compose
- [ ] Add service definition vào `docker-compose.yml`:
  ```yaml
  ltv-ragas-evaluation:
    build: ./ltv-ragas-evaluation
    ports:
      - "50059:50059"
    environment:
      - DATABASE_URL
      - REDIS_URL
      - MINIO_ENDPOINT
      - RETRIEVAL_SERVICE_URL
    depends_on:
      - mysql
      - redis
      - minio
  ```
- [ ] Add RQ worker service:
  ```yaml
  ltv-ragas-worker:
    build: ./ltv-ragas-evaluation
    command: rq worker ragas-queue
    environment: [same as above]
    depends_on:
      - redis
      - mysql
  ```
- [ ] Test `docker-compose up` builds successfully
- [ ] Test inter-service communication (gateway → evaluation service)

### 1.7 RQ Worker Setup
- [ ] Tạo worker entry point (`workers/evaluation_worker.py`)
- [ ] Configure RQ connection với Redis
- [ ] Setup job retry logic (max 3 retries)
- [ ] Implement job timeout (2 hours)
- [ ] Setup worker logging
- [ ] Test worker can process dummy jobs

---

## Phase 2: File & Dataset Management (Week 3-4)

### 2.1 File Management API

#### FR-FILE-001: Upload Files
- [ ] Create endpoint: `POST /evaluation/files/upload`
- [ ] Implement file validation:
  - [ ] Check file type whitelist (PDF, DOCX, TXT, MD)
  - [ ] Check file size limit (max 100MB)
  - [ ] Validate content type matches extension
- [ ] Implement MinIO upload:
  - [ ] Generate unique object name (UUID + extension)
  - [ ] Upload to "evaluation" bucket
  - [ ] Store metadata in MySQL
- [ ] Response với file_id và metadata
- [ ] Error handling: file too large, invalid type, MinIO errors
- [ ] Test upload với different file types

#### FR-FILE-002: List Files
- [ ] Create endpoint: `GET /evaluation/files`
- [ ] Implement pagination (query params: page, limit)
- [ ] Implement filtering:
  - [ ] Filter by uploaded_by (user_id)
  - [ ] Filter by file type
  - [ ] Filter by date range
- [ ] Return file list với metadata
- [ ] Test pagination và filtering

#### FR-FILE-003: Delete Files
- [ ] Create endpoint: `DELETE /evaluation/files/:fileId`
- [ ] Check if file is used in any dataset
- [ ] If used: return warning với dataset names
- [ ] If not used: delete from MinIO + MySQL
- [ ] Implement cascade check logic
- [ ] Test deletion scenarios

#### FR-FILE-004: Download Files
- [ ] Create endpoint: `GET /evaluation/files/:fileId/download`
- [ ] Generate presigned URL (1 hour expiry)
- [ ] Return URL trong response
- [ ] Test download URLs work correctly

### 2.2 Dataset Management API

#### FR-DS-001: Create Dataset
- [ ] Create endpoint: `POST /evaluation/datasets`
- [ ] Request validation:
  - [ ] name (required, max 255 chars)
  - [ ] description (optional, text)
  - [ ] source (required: 'manual' | 'llm_generated')
  - [ ] file_ids (optional array)
- [ ] Database operations:
  - [ ] Insert into evaluation_datasets
  - [ ] Link files trong dataset_files junction table
  - [ ] Set total_questions = 0 initially
- [ ] Response với dataset object
- [ ] Test với manual và llm_generated sources

#### FR-DS-002: List Datasets
- [ ] Create endpoint: `GET /evaluation/datasets`
- [ ] Implement pagination
- [ ] Implement sorting (by created_at, name, total_questions)
- [ ] Implement filtering:
  - [ ] Filter by source
  - [ ] Filter by created_by
  - [ ] Search by name
- [ ] Return list với summary info
- [ ] Test sorting và filtering

#### FR-DS-003: Get Dataset Details
- [ ] Create endpoint: `GET /evaluation/datasets/:datasetId`
- [ ] Fetch dataset info
- [ ] Fetch all questions (với order_index sorting)
- [ ] Fetch linked files
- [ ] Return complete dataset object
- [ ] Test response structure

#### FR-DS-004: Update Dataset
- [ ] Create endpoint: `PATCH /evaluation/datasets/:datasetId`
- [ ] Allow update: name, description
- [ ] Prevent update: source (immutable)
- [ ] Validate new values
- [ ] Update database
- [ ] Test update restrictions

#### FR-DS-005: Delete Dataset
- [ ] Create endpoint: `DELETE /evaluation/datasets/:datasetId`
- [ ] Implement cascade delete:
  - [ ] Delete all questions trong dataset
  - [ ] Delete junction table entries
  - [ ] Delete evaluation runs using this dataset
  - [ ] Delete dataset record
- [ ] Require confirmation (via query param hoặc header)
- [ ] Return success message
- [ ] Test cascade deletion

### 2.3 Question Management API

#### FR-Q-001: Add Questions (Bulk)
- [ ] Create endpoint: `POST /evaluation/datasets/:datasetId/questions/bulk`
- [ ] Request body: array of questions
  ```json
  {
    "questions": [
      {
        "question": "What is...",
        "expected_context": "...",
        "metadata": {}
      }
    ]
  }
  ```
- [ ] Auto-assign order_index:
  - [ ] Query max order_index trong dataset
  - [ ] Assign sequential indexes
- [ ] Bulk insert into database
- [ ] Update dataset.total_questions
- [ ] Return inserted questions
- [ ] Test bulk insert performance

#### FR-Q-002: Update Question
- [ ] Create endpoint: `PATCH /evaluation/questions/:questionId`
- [ ] Allow update: question, expected_context, metadata
- [ ] Validate values
- [ ] Update database
- [ ] Return updated question
- [ ] Test update operations

#### FR-Q-003: Delete Question
- [ ] Create endpoint: `DELETE /evaluation/questions/:questionId`
- [ ] Delete question
- [ ] Re-order remaining questions (decrement order_index)
- [ ] Update dataset.total_questions
- [ ] Return success
- [ ] Test re-ordering logic

#### FR-Q-004: Reorder Questions
- [ ] Create endpoint: `POST /evaluation/datasets/:datasetId/questions/reorder`
- [ ] Request body: array of {question_id, new_order_index}
- [ ] Validate no duplicates
- [ ] Update order_index cho all affected questions
- [ ] Transaction để ensure consistency
- [ ] Return success
- [ ] Test reordering scenarios

---

## Phase 3: Evaluation Engine (Week 5-6)

### 3.1 RAGAS Setup

#### Install & Configure RAGAS
- [ ] Install ragas==0.3.8 trong requirements.txt
- [ ] Research RAGAS API documentation
- [ ] Setup RAGAS evaluator configuration
- [ ] Configure metrics:
  - [ ] Context Precision
  - [ ] Context Recall
  - [ ] Context Relevancy
- [ ] Test RAGAS với sample data locally

#### Create RAGAS Service Class
- [ ] Create `services/ragas_evaluator.py`
- [ ] Implement evaluation function:
  - Input: question, retrieved_contexts, expected_context
  - Output: scores dict (precision, recall, relevancy)
- [ ] Handle RAGAS errors và exceptions
- [ ] Add logging cho evaluation steps
- [ ] Test evaluation với mock data

### 3.2 Retrieval Service Client

#### Create Retrieval Client
- [ ] Create `services/retrieval_client.py`
- [ ] Implement `query()` method:
  - [ ] POST request to retrieval service `/query`
  - [ ] Request body: {query, topK, mode: "retrieval_only", useCache: false}
  - [ ] Parse response contexts
  - [ ] Extract timing metrics
- [ ] Implement timeout (60 seconds)
- [ ] Implement retry logic (3 attempts, exponential backoff)
- [ ] Error handling: timeout, connection errors, 500 errors
- [ ] Test client với retrieval service

### 3.3 Evaluation Job Processing

#### FR-EVAL-001: Create Evaluation Job
- [ ] Create endpoint: `POST /evaluation/jobs`
- [ ] Request validation:
  - [ ] dataset_id (required)
  - [ ] config (optional: topK, metrics selection)
- [ ] Create job record trong evaluation_jobs table
- [ ] Create run record trong evaluation_runs table
- [ ] Enqueue job vào Redis Queue (RQ)
- [ ] Return job_id và status
- [ ] Test job creation

#### FR-EVAL-002: Sequential Testing Worker
- [ ] Create worker function: `process_evaluation_job(job_id)`
- [ ] Job flow:

  **Phase 1: Validation**
  - [ ] Load job và run records
  - [ ] Validate dataset exists
  - [ ] Load all questions (ordered by order_index)
  - [ ] Update job phase: "validating"

  **Phase 2: Loading Dataset**
  - [ ] Fetch questions từ database
  - [ ] Sort by order_index
  - [ ] Update job phase: "loading_dataset"
  - [ ] Update progress: 10%

  **Phase 3: Testing Questions (SEQUENTIAL)**
  - [ ] Update job phase: "testing_questions"
  - [ ] Loop through questions (KHÔNG parallel):
    ```
    for idx, question in enumerate(questions):
        # Update progress
        current_index = idx + 1
        update current_question_index = current_index
        update current_question_id = question.id
        update current_step = f"Testing question {current_index}/{total}"
        update progress_percent = (current_index / total) * 80 + 10

        # Call retrieval service
        retrieved_contexts = retrieval_client.query(question.question)

        # Evaluate với RAGAS
        scores = ragas_evaluator.evaluate(
            question=question.question,
            retrieved_contexts=retrieved_contexts,
            expected_context=question.expected_context
        )

        # Save result IMMEDIATELY
        save_result_to_db(run_id, question_id, contexts, scores)

        # Update run statistics
        increment successful_questions

        # Handle errors
        if error:
            log_error
            mark question as failed
            increment failed_questions
            continue to next question
    ```

  **Phase 4: Calculate Statistics**
  - [ ] Update job phase: "calculating_stats"
  - [ ] Aggregate scores từ all results
  - [ ] Calculate: avg, min, max, std
  - [ ] Update evaluation_run với statistics
  - [ ] Update progress: 100%

  **Phase 5: Complete Job**
  - [ ] Mark job status: "completed"
  - [ ] Set completed_at timestamp
  - [ ] Cache latest run_id trong Redis
  - [ ] Log completion

- [ ] Implement error handling:
  - [ ] Question-level errors: log, mark failed, continue
  - [ ] Critical errors: stop job, mark as failed
  - [ ] Save partial results
- [ ] Test worker với sample dataset (10 questions)
- [ ] Test worker với large dataset (100 questions)

#### FR-EVAL-003: Progress Tracking
- [ ] Update progress after each question
- [ ] Store progress trong Redis cache:
  - Key: `ragas:progress:{run_id}`
  - Value: JSON {current_index, total, current_step, percent}
  - TTL: 1 hour
- [ ] Update database fields:
  - [ ] evaluation_runs.current_question_index
  - [ ] evaluation_runs.current_question_id
  - [ ] evaluation_jobs.progress_percent
  - [ ] evaluation_jobs.current_step
- [ ] Test progress updates

#### FR-EVAL-004: Error Handling
- [ ] Implement retry logic per question (max 3 attempts)
- [ ] Log all errors với context (question_id, run_id, error message)
- [ ] Distinguish between:
  - [ ] Retrieval errors (timeout, connection)
  - [ ] RAGAS errors (evaluation failed)
  - [ ] Database errors
- [ ] Implement graceful degradation:
  - [ ] Skip failed questions
  - [ ] Continue với remaining questions
  - [ ] Mark job as "completed with errors" if partial success
- [ ] Test error scenarios

#### FR-EVAL-005: Results Storage
- [ ] Create function: `save_evaluation_result()`
- [ ] Store trong evaluation_results:
  - [ ] All fields from RAGAS output
  - [ ] Timing info (retrieval_time, evaluation_time)
  - [ ] Cache hit/miss info
  - [ ] Metadata JSON
- [ ] Commit immediately after each question
- [ ] Test result storage

### 3.4 Job Management API

#### FR-JOB-001: Get Job Status
- [ ] Create endpoint: `GET /evaluation/jobs/:jobId`
- [ ] Query job từ database
- [ ] Query progress từ Redis cache (nếu running)
- [ ] Return:
  - [ ] status, phase, progress_percent
  - [ ] current_step display string
  - [ ] error_message (if failed)
  - [ ] timestamps
- [ ] Test status polling

#### FR-JOB-002: List Jobs
- [ ] Create endpoint: `GET /evaluation/jobs`
- [ ] Implement pagination
- [ ] Implement filtering:
  - [ ] By status
  - [ ] By created_by_user_id
  - [ ] By date range
- [ ] Sort by created_at DESC
- [ ] Return job list với summary
- [ ] Test listing

---

## Phase 4: Dashboard & Results (Week 7-8)

### 4.1 Results API

#### FR-DASH-001: Auto-Load Latest Run
- [ ] Create endpoint: `GET /evaluation/dashboard/latest`
- [ ] Query logic:
  ```sql
  SELECT * FROM evaluation_runs
  WHERE status = 'completed'
  ORDER BY created_at DESC
  LIMIT 1
  ```
- [ ] Cache run_id trong Redis: `ragas:latest_run`
- [ ] Return complete run object với statistics
- [ ] Test auto-load logic

#### FR-DASH-002: Get Run Metrics Overview
- [ ] Create endpoint: `GET /evaluation/runs/:runId/overview`
- [ ] Aggregate metrics từ evaluation_results:
  - [ ] Average scores (precision, recall, relevancy)
  - [ ] Min, max scores
  - [ ] Standard deviation
  - [ ] Total questions, successful, failed
  - [ ] Processing time
- [ ] Cache kết quả trong Redis (TTL: 1 hour)
- [ ] Return metrics object
- [ ] Test aggregation logic

#### FR-DASH-003: Get Detailed Results
- [ ] Create endpoint: `GET /evaluation/runs/:runId/results`
- [ ] Implement pagination (query params: page, limit)
- [ ] Implement filtering:
  - [ ] Filter by score range (e.g., precision > 0.8)
  - [ ] Search by question text
- [ ] Implement sorting:
  - [ ] Sort by score (any metric)
  - [ ] Sort by order_index
- [ ] Return results list
- [ ] Test pagination, filtering, sorting

#### FR-DASH-004: Get Question Detail
- [ ] Create endpoint: `GET /evaluation/results/:resultId`
- [ ] Fetch complete result:
  - [ ] Full question text
  - [ ] All retrieved contexts (array)
  - [ ] Expected context
  - [ ] All RAGAS scores
  - [ ] Metadata (timing, cache info)
- [ ] Return detailed object
- [ ] Test response structure

#### FR-DASH-005: Export Results
- [ ] Create endpoint: `GET /evaluation/runs/:runId/export`
- [ ] Query params: format (csv | json), type (summary | detailed)
- [ ] Implement CSV export:
  - [ ] Headers: question, precision, recall, relevancy, etc.
  - [ ] Use streaming for large datasets
- [ ] Implement JSON export:
  - [ ] Complete run object với all results
- [ ] Set appropriate Content-Type headers
- [ ] Test exports với large datasets

### 4.2 CMS Frontend Implementation

#### Setup Feature Structure (Feature Sliced Design)
- [ ] Create feature folder: `ltv-assistant-cms/src/features/evaluation/`
- [ ] Structure:
  ```
  features/evaluation/
  ├── api/
  │   └── evaluation.api.ts     # API client
  ├── hooks/
  │   ├── useFiles.ts
  │   ├── useDatasets.ts
  │   ├── useEvaluation.ts
  │   └── useDashboard.ts
  ├── types/
  │   └── evaluation.types.ts
  ├── ui/
  │   ├── FileUploader.tsx
  │   ├── DatasetCard.tsx
  │   ├── QuestionList.tsx
  │   ├── MetricsCard.tsx
  │   ├── ResultsTable.tsx
  │   └── QuestionDetailModal.tsx
  └── utils/
      └── evaluation.utils.ts
  ```
- [ ] Create pages folder: `ltv-assistant-cms/src/pages/evaluation/`

#### API Client Implementation
- [ ] Create `evaluation.api.ts` với axios client
- [ ] Implement API methods:
  - [ ] Files: upload, list, delete, download
  - [ ] Datasets: CRUD operations
  - [ ] Questions: bulk add, update, delete, reorder
  - [ ] Jobs: create, get status, list
  - [ ] Dashboard: latest run, metrics, results, export
- [ ] Define TypeScript types cho all responses
- [ ] Setup error handling
- [ ] Test API client

#### Custom Hooks
- [ ] Create `useFiles.ts`:
  - [ ] useFileUpload (mutation)
  - [ ] useFilesList (query)
  - [ ] useFileDelete (mutation)
- [ ] Create `useDatasets.ts`:
  - [ ] useDatasets (query với pagination)
  - [ ] useDataset (single dataset query)
  - [ ] useCreateDataset (mutation)
  - [ ] useUpdateDataset (mutation)
  - [ ] useDeleteDataset (mutation)
- [ ] Create `useEvaluation.ts`:
  - [ ] useStartEvaluation (mutation)
  - [ ] useJobStatus (query với polling)
- [ ] Create `useDashboard.ts`:
  - [ ] useLatestRun (query)
  - [ ] useRunMetrics (query)
  - [ ] useRunResults (query với pagination)
  - [ ] useResultDetail (query)
  - [ ] useExportResults (mutation)
- [ ] Test hooks với React Query DevTools

#### Page 1: Files Management
- [ ] Create `FilesManagementPage.tsx`
- [ ] Implement UI components:
  - [ ] FileUploader với Dropzone
    - [ ] Drag-and-drop support
    - [ ] File type validation
    - [ ] Progress bar during upload
  - [ ] Files list table
    - [ ] Columns: filename, type, size, date, actions
    - [ ] Pagination controls
    - [ ] Filter dropdown
    - [ ] Delete confirmation modal
- [ ] Implement actions:
  - [ ] Upload files
  - [ ] View file details
  - [ ] Download file (open presigned URL)
  - [ ] Delete file
- [ ] Add Mantine components: Table, Button, Modal, FileButton
- [ ] Test page functionality

#### Page 2: Datasets Management
- [ ] Create `DatasetsPage.tsx`
- [ ] Implement UI:
  - [ ] "New Dataset" button
  - [ ] Datasets grid/list
    - [ ] DatasetCard component
    - [ ] Show: name, source badge, question count, created date
    - [ ] Actions: view, edit, run, delete
  - [ ] Pagination
  - [ ] Filter by source
  - [ ] Search by name
- [ ] Implement modals:
  - [ ] Create dataset modal
    - [ ] Form: name, description, source selection
    - [ ] File selection (optional)
  - [ ] Edit dataset modal
  - [ ] Delete confirmation
- [ ] Test CRUD operations

#### Page 3: Dataset Questions
- [ ] Create `DatasetQuestionsPage.tsx`
- [ ] Implement UI:
  - [ ] Dataset info header
  - [ ] "Add Questions" button
  - [ ] Questions list table
    - [ ] Columns: order, question preview, expected context preview, actions
    - [ ] Reorder controls (drag-and-drop với dnd-kit)
    - [ ] Edit/delete per question
  - [ ] Pagination
- [ ] Implement modals:
  - [ ] Bulk add questions modal
    - [ ] Textarea for multiple questions (JSON format)
    - [ ] Or form for single question
  - [ ] Edit question modal
  - [ ] Delete confirmation
- [ ] Implement reordering:
  - [ ] Drag-and-drop functionality
  - [ ] Save new order to backend
- [ ] Test questions management

#### Page 4: Run Evaluation
- [ ] Create `RunEvaluationPage.tsx`
- [ ] Implement form:
  - [ ] Dataset selection dropdown
    - [ ] Show dataset info (name, question count)
  - [ ] Configuration inputs:
    - [ ] Retrieval Top K (number input, default: 10)
    - [ ] Metrics selection (checkboxes, default: all)
  - [ ] "Start Evaluation" button
  - [ ] "Cancel" button
- [ ] Implement progress view:
  - [ ] Replace form với progress card khi started
  - [ ] Show job_id
  - [ ] Status badge
  - [ ] Phase indicator
  - [ ] Progress bar (animated)
  - [ ] Current step text: "Testing question 65/100"
  - [ ] Current question preview
  - [ ] Estimated time remaining
  - [ ] Auto-refresh every 5 seconds (useInterval hook)
  - [ ] "View Dashboard" button khi completed
- [ ] Test evaluation flow end-to-end

#### Page 5: Evaluation Dashboard (MAIN PAGE)
- [ ] Create `EvaluationDashboardPage.tsx`
- [ ] Implement auto-load logic:
  - [ ] useLatestRun hook loads on mount
  - [ ] Show loading state
  - [ ] Handle no runs case (empty state)
- [ ] Implement metrics overview section:
  - [ ] Header với run info: run_id, dataset name, date
  - [ ] Metrics cards grid:
    - [ ] Total questions card
    - [ ] Success/failed counts
    - [ ] Processing time
    - [ ] Context Precision với progress bar
    - [ ] Context Recall với progress bar
    - [ ] Context Relevancy với progress bar
    - [ ] Overall score badge (color-coded: green >80%, yellow 60-80%, red <60%)
- [ ] Implement action buttons:
  - [ ] "View All Runs" → navigate to job history
  - [ ] "Export CSV" button
  - [ ] "Export JSON" button
- [ ] Implement detailed results section:
  - [ ] Search input
  - [ ] ResultsTable component:
    - [ ] Columns: question preview, precision, recall, relevancy
    - [ ] Colored badges cho scores
    - [ ] Click row → open QuestionDetailModal
  - [ ] Pagination controls
  - [ ] Filter controls (score range sliders)
  - [ ] Sort dropdown
- [ ] Implement QuestionDetailModal:
  - [ ] Full question text
  - [ ] Expected context (expandable)
  - [ ] Retrieved contexts list (all 10):
    - [ ] Show score per context
    - [ ] Highlight relevant parts
  - [ ] RAGAS scores với explanations
  - [ ] Metadata (timing, cache hit)
  - [ ] Close button
- [ ] Test dashboard với real data

#### Page 6: Job History
- [ ] Create `JobHistoryPage.tsx`
- [ ] Implement UI:
  - [ ] Jobs list table
    - [ ] Columns: job_id, dataset, status, progress, created date, actions
    - [ ] Status badges với colors
  - [ ] Pagination
  - [ ] Filter by status
  - [ ] Date range filter
  - [ ] Click row → view job details hoặc results
- [ ] Test job history page

#### UI Components Library
- [ ] Create reusable components:
  - [ ] `MetricsCard.tsx`:
    - Props: title, value, color, progressBar
    - Mantine Card component
  - [ ] `ProgressBar.tsx`:
    - Props: percent, color, animated
    - Mantine Progress component
  - [ ] `StatusBadge.tsx`:
    - Props: status
    - Color mapping: pending → gray, running → blue, completed → green, failed → red
  - [ ] `DatasetCard.tsx`:
    - Props: dataset object, onView, onEdit, onRun, onDelete
  - [ ] `ResultsTable.tsx`:
    - Props: results, onRowClick, pagination
- [ ] Test components in Storybook (optional)

#### Routing Setup
- [ ] Update `ltv-assistant-cms/src/App.tsx`
- [ ] Add routes:
  ```typescript
  /evaluation/files
  /evaluation/datasets
  /evaluation/datasets/:id/questions
  /evaluation/run
  /evaluation/dashboard (default)
  /evaluation/jobs
  ```
- [ ] Add navigation menu items
- [ ] Add route guards: check super_admin role
- [ ] Test routing

#### Role-Based Access Control (Frontend)
- [ ] Check user role trong auth context
- [ ] Hide evaluation menu nếu không phải super_admin
- [ ] Show 403 page nếu unauthorized user tries to access
- [ ] Test role restrictions

---

## Phase 5: Testing & Polish

### 5.1 Backend Testing

#### Unit Tests
- [ ] Test file upload validation logic
- [ ] Test dataset CRUD operations
- [ ] Test question ordering logic
- [ ] Test RAGAS evaluator với mock data
- [ ] Test retrieval client với mock responses
- [ ] Test worker job processing logic
- [ ] Test error handling functions
- [ ] Run tests: `pytest tests/`

#### Integration Tests
- [ ] Test end-to-end evaluation flow:
  - [ ] Create dataset → add questions → run evaluation → verify results
- [ ] Test sequential processing:
  - [ ] Verify questions tested one at a time
  - [ ] Verify progress updates after each question
- [ ] Test error recovery:
  - [ ] Simulate retrieval service errors
  - [ ] Verify job continues với remaining questions
- [ ] Test database transactions
- [ ] Test Redis cache operations
- [ ] Test MinIO upload/download

#### Performance Tests
- [ ] Test evaluation với 100 questions:
  - [ ] Measure total time
  - [ ] Verify < 15 minutes
- [ ] Test large file upload (100MB)
- [ ] Test concurrent job processing (if applicable)
- [ ] Test dashboard load time
- [ ] Profile slow queries và optimize

### 5.2 Frontend Testing

#### Component Tests
- [ ] Test FileUploader component
- [ ] Test DatasetCard component
- [ ] Test MetricsCard component
- [ ] Test ResultsTable component
- [ ] Test QuestionDetailModal
- [ ] Run: `npm test`

#### Integration Tests
- [ ] Test complete user flows:
  - [ ] Upload file flow
  - [ ] Create dataset flow
  - [ ] Run evaluation flow
  - [ ] View results flow
- [ ] Test polling mechanism
- [ ] Test error states
- [ ] Test loading states

#### E2E Tests (Optional)
- [ ] Setup Playwright/Cypress
- [ ] Write E2E test scenarios:
  - [ ] Complete evaluation workflow
  - [ ] Dashboard auto-load
  - [ ] Export functionality
- [ ] Run E2E tests

### 5.3 Bug Fixes & Polish

#### Backend
- [ ] Fix any bugs found trong testing
- [ ] Optimize slow queries
- [ ] Improve error messages
- [ ] Add more logging
- [ ] Code cleanup và refactoring
- [ ] Update API documentation

#### Frontend
- [ ] Fix UI bugs
- [ ] Improve loading states
- [ ] Add error boundaries
- [ ] Improve responsive design
- [ ] Add tooltips và help text
- [ ] Polish animations
- [ ] Accessibility improvements (a11y)

#### UX Improvements
- [ ] Add confirmation dialogs cho destructive actions
- [ ] Add success/error notifications (toast messages)
- [ ] Add empty states với helpful messages
- [ ] Add loading skeletons
- [ ] Improve error messages (user-friendly)

---

## Phase 6: Deployment

### 6.1 Documentation

#### User Documentation
- [ ] Write user guide for Super Admin:
  - [ ] How to upload files
  - [ ] How to create datasets
  - [ ] How to run evaluations
  - [ ] How to interpret results
  - [ ] Troubleshooting common issues
- [ ] Add inline help trong CMS
- [ ] Create video tutorial (optional)

#### Technical Documentation
- [ ] Update README.md
- [ ] Document API endpoints (OpenAPI/Swagger)
- [ ] Document environment variables
- [ ] Document database schema
- [ ] Document deployment process
- [ ] Add architecture diagrams

### 6.2 Production Preparation

#### Configuration
- [ ] Create production `.env` file
- [ ] Configure production database credentials
- [ ] Configure production Redis URL
- [ ] Configure production MinIO endpoint
- [ ] Set appropriate timeouts và limits
- [ ] Configure logging levels (INFO for production)

#### Security Review
- [ ] Review all authentication checks
- [ ] Review authorization logic (super_admin only)
- [ ] Review file upload validation
- [ ] Review SQL injection protection
- [ ] Review XSS protection
- [ ] Review secrets management
- [ ] Scan for known vulnerabilities

#### Performance Optimization
- [ ] Add database indexes
- [ ] Configure connection pooling
- [ ] Configure Redis cache TTLs
- [ ] Optimize large queries
- [ ] Add CDN for static assets (if applicable)

### 6.3 Deployment Process

#### Database Migration
- [ ] Backup production database
- [ ] Run migration scripts
- [ ] Verify schema changes
- [ ] Rollback plan ready

#### Service Deployment
- [ ] Build Docker images
- [ ] Tag images với version numbers
- [ ] Push to container registry
- [ ] Update docker-compose.yml với new image tags
- [ ] Deploy to production server:
  ```bash
  docker-compose pull
  docker-compose up -d ltv-ragas-evaluation
  docker-compose up -d ltv-ragas-worker
  ```
- [ ] Verify services running
- [ ] Check logs for errors

#### Frontend Deployment
- [ ] Build CMS production bundle
- [ ] Deploy to production
- [ ] Verify routing works
- [ ] Test super_admin access

#### Smoke Tests
- [ ] Test health endpoint: `GET /evaluation/health`
- [ ] Test file upload
- [ ] Test create dataset
- [ ] Test run evaluation với small dataset (5 questions)
- [ ] Test dashboard loads
- [ ] Test export functionality

### 6.4 Monitoring Setup

#### Logging
- [ ] Configure centralized logging (if available)
- [ ] Set up log aggregation
- [ ] Set up alerts for errors
- [ ] Monitor evaluation job failures

#### Metrics (Optional)
- [ ] Track evaluation job success rate
- [ ] Track average evaluation time
- [ ] Track API response times
- [ ] Track file upload success rate

---

## Optional: LLM Generation Feature

### Phase 7: LLM Integration (2-3 weeks)

#### 7.1 LLM Provider Setup
- [ ] Choose LLM provider:
  - [ ] Ollama (local, free)
  - [ ] OpenAI API
  - [ ] Anthropic API
- [ ] Configure API credentials
- [ ] Test LLM connectivity

#### 7.2 File Text Extraction
- [ ] Install text extraction libraries:
  - [ ] PyPDF2 or pdfplumber for PDF
  - [ ] python-docx for DOCX
  - [ ] Built-in for TXT, MD
- [ ] Implement extraction functions:
  - [ ] Extract text từ file content
  - [ ] Clean và normalize text
  - [ ] Handle large files (chunking)
- [ ] Test extraction với different file types

#### 7.3 Question Generation
- [ ] Create `services/llm_generator.py`
- [ ] Implement chunking logic:
  - [ ] Split text into manageable chunks
  - [ ] Configurable chunk size (e.g., 1000 tokens)
  - [ ] Overlap between chunks
- [ ] Create prompts for question generation:
  ```
  Given this text:
  [chunk text]

  Generate N questions that can be answered using this text.
  For each question, also provide the expected context (excerpt from text).

  Format: JSON array of {question, expected_context}
  ```
- [ ] Implement generation function:
  - [ ] Call LLM with prompt
  - [ ] Parse JSON response
  - [ ] Validate questions
  - [ ] Deduplicate similar questions
- [ ] Test generation với sample documents

#### 7.4 Auto-Generation API
- [ ] Create endpoint: `POST /evaluation/datasets/:datasetId/generate-questions`
- [ ] Request params:
  - [ ] file_ids (required)
  - [ ] questions_per_chunk (default: 5)
  - [ ] max_questions (optional limit)
- [ ] Implement async job:
  - [ ] Extract text từ files
  - [ ] Split into chunks
  - [ ] Generate questions per chunk
  - [ ] Store questions trong dataset
  - [ ] Update progress
- [ ] Response với job_id
- [ ] Test generation end-to-end

#### 7.5 CMS Integration
- [ ] Update Create Dataset modal:
  - [ ] Add "Generate Questions with LLM" option
  - [ ] Show configuration fields (questions per chunk)
  - [ ] File selection required cho auto-generation
- [ ] Implement generation progress tracking:
  - [ ] Poll job status
  - [ ] Show "Generating question X of Y"
  - [ ] Show progress bar
- [ ] Implement review interface:
  - [ ] After generation completes, show questions
  - [ ] Allow edit/delete before saving
  - [ ] "Regenerate" button
- [ ] Test auto-generation flow

#### 7.6 Cost Management
- [ ] Add cost estimation:
  - [ ] Estimate tokens before generation
  - [ ] Show estimated cost to user
  - [ ] Require confirmation
- [ ] Track LLM usage:
  - [ ] Log tokens used per generation
  - [ ] Monitor monthly costs
- [ ] Implement rate limiting (optional)

---

## Post-Launch Tasks

### Monitoring & Maintenance
- [ ] Monitor evaluation job success rates
- [ ] Review logs for errors
- [ ] Track system performance
- [ ] Collect user feedback
- [ ] Create backlog for improvements

### Future Enhancements (Phase 3+)
- [ ] Scheduled evaluations
- [ ] A/B testing features
- [ ] Custom metrics definitions
- [ ] Multi-user collaboration
- [ ] Generation metrics (Faithfulness, Answer Relevancy)
- [ ] Advanced analytics dashboard
- [ ] API rate limiting
- [ ] Webhook notifications

---

## Success Criteria

### Phase 1 Complete When:
- [ ] Service runs in Docker independently
- [ ] Database schema deployed
- [ ] API Gateway proxies to evaluation service
- [ ] Health check endpoint responds
- [ ] Super admin role checking works

### Phase 2 Complete When:
- [ ] Files can be uploaded to MinIO "evaluation" bucket
- [ ] Datasets can be created (manual)
- [ ] Questions can be added/edited/deleted/reordered
- [ ] All CRUD operations tested

### Phase 3 Complete When:
- [ ] Evaluation can be started
- [ ] Questions tested sequentially (one at a time)
- [ ] Progress tracked: "Testing question X/Y"
- [ ] Results saved after each question
- [ ] RAGAS metrics calculated correctly
- [ ] Job completes successfully

### Phase 4 Complete When:
- [ ] Dashboard auto-loads latest run
- [ ] Metrics overview displays correctly
- [ ] Detailed results can be viewed
- [ ] Question detail modal works
- [ ] Export to CSV/JSON works
- [ ] All CMS pages functional

### Phase 5 Complete When:
- [ ] All tests passing
- [ ] No critical bugs
- [ ] Performance meets requirements (<10 min for 100 questions)
- [ ] UI polished và user-friendly

### Phase 6 Complete When:
- [ ] Deployed to production
- [ ] Documentation complete
- [ ] Smoke tests passing
- [ ] Super admin can use system

### Optional Phase Complete When:
- [ ] LLM can generate questions from files
- [ ] Auto-generation works end-to-end
- [ ] Cost tracking implemented
- [ ] User can review và edit generated questions

---

## Notes

### Sequential Testing Requirement
**CRITICAL:** Questions must be tested one at a time, NOT in parallel. This is to avoid overloading the retrieval service.

Implementation:
```python
# CORRECT: Sequential
for question in questions:
    test_question(question)
    save_result()
    update_progress()

# WRONG: Parallel
with ThreadPoolExecutor() as executor:
    executor.map(test_question, questions)  # DON'T DO THIS
```

### Dashboard Auto-Load Requirement
**CRITICAL:** Dashboard must automatically load the latest completed run without user selection.

Implementation:
```typescript
// On mount
useEffect(() => {
  const { data } = useLatestRun();
  setCurrentRun(data);
}, []);
```

### Role-Based Access
**CRITICAL:** Only super_admin role can access ALL evaluation features.

Check at:
1. API Gateway level (proxy middleware)
2. Backend service level (defense in depth)
3. Frontend level (hide menu, show 403)

---

**END OF CHECKLIST**

**Next Action:** Review this checklist với team, assign tasks, và start Phase 1.
