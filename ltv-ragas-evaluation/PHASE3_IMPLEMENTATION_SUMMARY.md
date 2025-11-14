# Phase 3: Evaluation Engine Implementation Summary

## Overview
Phase 3 implements the core evaluation engine that processes questions sequentially, retrieves contexts from the retrieval service, evaluates them using RAGAS metrics, and tracks progress in real-time.

## Components Implemented

### 1. RAGAS Evaluator Service (`src/services/ragas_evaluator.py`)
- **Purpose**: Integrates RAGAS 0.3.8 metrics for evaluating retrieval quality
- **Metrics Computed**:
  - Context Precision: Measures ranking quality of relevant chunks
  - Context Recall: Measures completeness of retrieval
  - Context Relevancy: Measures relevance to query
- **Key Methods**:
  - `evaluate_single()`: Evaluates a single question with retrieved contexts
  - Returns scores as dict with all three metrics (0.0-1.0 range)
- **Error Handling**: Catches and logs RAGAS exceptions with detailed error messages

### 2. Retrieval Service Client (`src/services/retrieval_client.py`)
- **Purpose**: HTTP client for querying the LTV Assistant Retrieval service
- **Features**:
  - Automatic retry logic (3 attempts, exponential backoff: 2-10 seconds)
  - 60-second timeout per request
  - Supports multiple context response formats (string, object with text/content fields)
  - Tracks retrieval timing and cache status
- **Key Methods**:
  - `query()`: Queries retrieval service and returns contexts with metadata
- **Error Handling**: Custom `RetrievalServiceError` exception for better error tracking

### 3. Statistics Service (`src/services/statistics_service.py`)
- **Purpose**: Calculates aggregate statistics for evaluation runs
- **Statistics Computed**:
  - Mean, Median, Standard Deviation
  - Min, Max, Count
  - Calculated separately for each RAGAS metric
- **Key Methods**:
  - `calculate_run_statistics()`: Full statistics for all metrics
  - `calculate_average_scores()`: Simple averages for each metric

### 4. Job Management APIs (`src/routes/jobs.py`)
Three new endpoints for job management:

#### POST /evaluation/jobs
- Creates new evaluation job
- Validates dataset exists and has questions
- Creates EvaluationJob and EvaluationRun records
- Enqueues job to Redis Queue for processing
- Returns job_id and run_id

#### GET /evaluation/jobs/:jobId
- Gets real-time job status and progress
- Polls Redis cache for fast updates (falls back to database)
- Returns:
  - Status (pending, processing, completed, failed)
  - Progress percentage and current step
  - Question counts (total, completed, failed)
  - Statistics and scores (when completed)

#### GET /evaluation/jobs
- Lists all jobs with pagination
- Filters: status, dataset_id
- Pagination: page, limit (1-100)
- Ordered by creation date (newest first)

### 5. Sequential Evaluation Worker (`src/workers/evaluation_worker.py`)

#### Critical Feature: Sequential Processing
**MOST IMPORTANT**: Questions are processed ONE AT A TIME using `order_index` to avoid overloading the retrieval service.

```python
# ✅ CORRECT IMPLEMENTATION
for question in questions.order_by(order_index):
    test_question()      # Sequential
    save_result()
    update_progress()
```

#### Worker Flow:
1. **Initialization** (5-10% progress)
   - Load job and run from database
   - Fetch all questions ordered by `order_index`
   - Set status to 'processing'

2. **Sequential Processing Loop** (10-90% progress)
   For each question:
   - Update current_question_index and current_question_id
   - Query retrieval service with retry logic
   - Run RAGAS evaluation with all 3 metrics
   - Save EvaluationResult to database
   - Update progress in Redis (fast) and database (persistent)
   - Continue to next question even if current fails

3. **Statistics Calculation** (90-95% progress)
   - Calculate average scores for all metrics
   - Calculate full statistics (mean, median, std_dev, min, max)
   - Update run with final results

4. **Completion** (100% progress)
   - Set job status to 'completed'
   - Record completion timestamp
   - Calculate total processing time

#### Progress Tracking (Dual-Layer):
- **Redis Cache**: Fast polling for real-time updates (1-hour TTL)
  - Key format: `eval_progress:{job_id}`
  - Fields: progress_percent, current_step, updated_at
- **Database**: Persistent storage
  - Fields: progress_percent, current_step, current_question_index, current_question_id

#### Error Handling:
- Individual question failures don't stop the run
- Failed questions are saved with error messages
- Full run failures update job status to 'failed'
- All errors logged with stack traces

### 6. Job Management Schemas (`src/schemas/job.py`)
Pydantic models for request/response validation:
- `JobCreateRequest`: Validation for job creation (dataset_id, top_k, metadata)
- `JobCreateResponse`: Response after job creation
- `JobStatusResponse`: Detailed status with progress and statistics
- `JobListItem`: Summary for job list
- `JobListResponse`: Paginated job list

## Dependencies Added
```
tenacity==9.0.0         # Retry logic for retrieval client
datasets==3.2.0          # Required by RAGAS for data handling
```

## Database Integration
- Uses existing models: EvaluationJob, EvaluationRun, EvaluationResult, DatasetQuestion
- Sequential processing relies on `order_index` field in DatasetQuestion
- Real-time progress stored in Redis + database for redundancy

## API Gateway Integration
All endpoints require `super_admin` role (enforced at API Gateway level):
- POST /evaluation/jobs
- GET /evaluation/jobs/:jobId
- GET /evaluation/jobs

## Configuration
New environment variables (in `.env`):
```bash
# Retrieval Service
RETRIEVAL_SERVICE_URL=http://ltv-assistant-retrieval:50057

# Redis Queue
RQ_QUEUE_NAME=ragas-queue
RQ_JOB_TIMEOUT=7200        # 2 hours
RQ_WORKER_TIMEOUT=7200     # 2 hours
RQ_MAX_RETRIES=3
```

## Docker Setup
- **Main Service** (`ltv-ragas-evaluation`): Flask app on port 50059
- **Worker Service** (`ltv-ragas-worker`): RQ worker processing jobs
- Both services share same codebase, different commands
- Entrypoint script runs migrations on startup

## Testing Requirements

### Prerequisites:
1. MySQL database running with `ltv_assistant` database
2. Redis running (for job queue and progress cache)
3. MinIO running (for file storage)
4. Retrieval service running at configured URL
5. Dataset created with questions (order_index must be set)

### Test Scenarios:

#### 1. Job Creation
```bash
POST /evaluation/jobs
{
  "dataset_id": "uuid",
  "top_k": 5,
  "metadata": {"test": "phase3"}
}

Expected: 201 Created with job_id and run_id
```

#### 2. Progress Polling
```bash
GET /evaluation/jobs/{job_id}

Expected: Real-time progress updates
- Status transitions: pending → processing → completed
- Progress: 0% → 10% → ... → 100%
- Current step updates for each question
```

#### 3. Sequential Processing Verification
- Check logs: Questions processed in order_index sequence
- Verify timing: No parallel processing (one at a time)
- Confirm: current_question_index increments sequentially

#### 4. Error Handling
- Test with invalid dataset_id: Should return 404
- Test with empty dataset: Should return 400
- Test with retrieval service down: Questions fail but run continues
- Test with RAGAS evaluation error: Question fails but run continues

#### 5. Statistics Calculation
- After completion, verify average_scores contains all 3 metrics
- Verify statistics contains mean, median, std_dev for each metric
- Check processing_time_ms is recorded

## Key Files Modified/Created

### Created:
- `src/services/ragas_evaluator.py` (109 lines)
- `src/services/retrieval_client.py` (162 lines)
- `src/services/statistics_service.py` (108 lines)
- `src/routes/jobs.py` (290 lines)
- `src/schemas/job.py` (68 lines)
- `entrypoint.sh` (6 lines)

### Modified:
- `src/workers/evaluation_worker.py` (added 250 lines)
- `src/app.py` (registered jobs_bp)
- `requirements.txt` (added tenacity, datasets)
- `Dockerfile` (added entrypoint script)

## Total Implementation
- **New Files**: 6
- **Modified Files**: 4
- **Total Lines of Code**: ~1,000 lines
- **API Endpoints**: 3 new endpoints
- **Time Estimate**: Week 5-6 of implementation plan

## Next Steps (Phase 4)
- Dashboard UI for creating and monitoring evaluations
- Results visualization with charts
- Export functionality (CSV, JSON)
- Run comparison features
