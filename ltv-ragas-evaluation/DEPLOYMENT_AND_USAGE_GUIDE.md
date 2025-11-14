# RAGAS Evaluation System - Deployment and Usage Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Running the System](#running-the-system)
6. [API Usage](#api-usage)
7. [Frontend Setup](#frontend-setup)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)
10. [Production Deployment](#production-deployment)

---

## System Overview

The RAGAS Evaluation System is a microservice for evaluating retrieval system quality using RAGAS metrics. It consists of:

- **Backend Service** (Python/Flask) - REST API on port 50059
- **RQ Worker** (Python) - Background job processor
- **Frontend** (React/TypeScript) - Dashboard UI
- **Dependencies**: MySQL, Redis, MinIO, Retrieval Service

**Key Features:**
- Sequential question testing (one at a time)
- Real-time progress tracking
- Auto-loading dashboard
- CSV/JSON export
- Super admin only access

---

## Prerequisites

### Required Software
- Docker & Docker Compose
- Python 3.11+
- Node.js 18+
- Git

### Required Services (via Docker Compose)
- MySQL 8.0
- Redis 7
- MinIO (S3-compatible storage)
- LTV Assistant Retrieval Service

### Required Access
- Super admin role in API Gateway
- Database access (ltv_assistant database)
- Redis access
- MinIO bucket access

---

## Installation

### 1. Clone Repository
```bash
cd /Users/tohainam/Desktop/work/ltv-assistant
```

### 2. Install Backend Dependencies
```bash
cd ltv-ragas-evaluation
pip install -r requirements.txt
```

### 3. Install Frontend Dependencies
```bash
cd ltv-assistant-cms
npm install
# Install additional evaluation dependencies
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## Configuration

### 1. Backend Configuration

Create `.env` file in `ltv-ragas-evaluation/`:

```bash
# Flask Configuration
FLASK_ENV=development
FLASK_DEBUG=True
PORT=50059
SERVICE_NAME=ltv-ragas-evaluation

# Database
DATABASE_URL=mysql+pymysql://root:root@mysql:3306/ltv_assistant

# Redis
REDIS_URL=redis://redis:6379/0

# MinIO
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=False
MINIO_BUCKET_EVALUATION=evaluation

# Retrieval Service
RETRIEVAL_SERVICE_URL=http://ltv-assistant-retrieval:50057

# RQ Worker Configuration
RQ_QUEUE_NAME=ragas-queue
RQ_JOB_TIMEOUT=7200  # 2 hours
RQ_WORKER_TIMEOUT=7200
RQ_MAX_RETRIES=3
```

### 2. Database Migration

Run Alembic migrations:

```bash
cd ltv-ragas-evaluation

# Check migration status
alembic current

# Run migrations
alembic upgrade head

# Verify tables created
mysql -h localhost -u root -p ltv_assistant -e "SHOW TABLES LIKE 'evaluation%';"
```

### 3. MinIO Setup

Create evaluation bucket:

```bash
# Using MinIO client (mc)
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/evaluation
mc policy set download local/evaluation
```

Or via MinIO console: http://localhost:9001

---

## Running the System

### Option 1: Docker Compose (Recommended)

```bash
# From project root
cd /Users/tohainam/Desktop/work/ltv-assistant

# Start all services
docker-compose up -d ltv-ragas-evaluation ltv-ragas-worker

# View logs
docker-compose logs -f ltv-ragas-evaluation
docker-compose logs -f ltv-ragas-worker

# Check health
curl http://localhost:50059/health
```

### Option 2: Local Development

**Terminal 1 - Flask API:**
```bash
cd ltv-ragas-evaluation
python -m src.app
```

**Terminal 2 - RQ Worker:**
```bash
cd ltv-ragas-evaluation
python -m src.workers.evaluation_worker
```

**Terminal 3 - Frontend:**
```bash
cd ltv-assistant-cms
npm run dev
```

---

## API Usage

### Base URL
- **Development**: `http://localhost:3000/evaluation`
- **Production**: `https://your-domain.com/evaluation`

### Authentication
All requests require:
- `X-User-Id` header
- `X-User-Role: super_admin` header
- Valid session cookie

### Core Endpoints

#### 1. Get Latest Run (Dashboard Auto-Load)
```bash
curl -X GET http://localhost:3000/evaluation/dashboard/latest \
  -H "X-User-Id: 1" \
  -H "X-User-Role: super_admin" \
  --cookie "session=your-session-cookie"
```

**Response:**
```json
{
  "run_id": "uuid",
  "dataset_id": "uuid",
  "dataset_name": "Test Dataset",
  "job_id": "uuid",
  "total_questions": 100,
  "completed_questions": 95,
  "failed_questions": 5,
  "average_scores": {
    "context_precision": 0.85,
    "context_recall": 0.78,
    "context_relevancy": 0.92
  },
  "processing_time_ms": 300000,
  "created_at": "2025-01-10T10:00:00Z",
  "completed_at": "2025-01-10T10:05:00Z"
}
```

#### 2. Upload File
```bash
curl -X POST http://localhost:3000/evaluation/files/upload \
  -H "X-User-Id: 1" \
  -H "X-User-Role: super_admin" \
  -F "file=@/path/to/document.pdf" \
  --cookie "session=your-session-cookie"
```

#### 3. Create Dataset
```bash
curl -X POST http://localhost:3000/evaluation/datasets \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" \
  -H "X-User-Role: super_admin" \
  --cookie "session=your-session-cookie" \
  -d '{
    "name": "Test Dataset",
    "description": "Evaluation test dataset",
    "source": "manual",
    "file_ids": ["file-uuid-1", "file-uuid-2"]
  }'
```

#### 4. Bulk Add Questions
```bash
curl -X POST http://localhost:3000/evaluation/datasets/{dataset_id}/questions/bulk \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" \
  --cookie "session=your-session-cookie" \
  -d '{
    "questions": [
      {
        "question": "What is RAGAS?",
        "expected_context": "RAGAS is a framework for evaluating RAG systems...",
        "metadata": {"difficulty": "easy"}
      },
      {
        "question": "How does context precision work?",
        "expected_context": "Context precision measures...",
        "metadata": {"difficulty": "medium"}
      }
    ]
  }'
```

#### 5. Start Evaluation
```bash
curl -X POST http://localhost:3000/evaluation/jobs \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" \
  --cookie "session=your-session-cookie" \
  -d '{
    "dataset_id": "uuid",
    "top_k": 5,
    "metadata": {"test_run": true}
  }'
```

**Response:**
```json
{
  "job_id": "uuid",
  "run_id": "uuid",
  "dataset_id": "uuid",
  "status": "pending",
  "created_at": "2025-01-10T10:00:00Z",
  "message": "Evaluation job created successfully. Processing 100 questions."
}
```

#### 6. Poll Job Status
```bash
# Poll every 5 seconds
curl -X GET http://localhost:3000/evaluation/jobs/{job_id} \
  -H "X-User-Id: 1" \
  --cookie "session=your-session-cookie"
```

**Response:**
```json
{
  "job_id": "uuid",
  "run_id": "uuid",
  "status": "processing",
  "progress_percent": 65,
  "current_step": "Testing question 65/100...",
  "total_questions": 100,
  "completed_questions": 64,
  "failed_questions": 1
}
```

#### 7. Export Results
```bash
# Export to CSV
curl -X GET "http://localhost:3000/evaluation/runs/{run_id}/export?format=csv&type=detailed" \
  -H "X-User-Id: 1" \
  --cookie "session=your-session-cookie" \
  --output results.csv

# Export to JSON
curl -X GET "http://localhost:3000/evaluation/runs/{run_id}/export?format=json&type=summary" \
  -H "X-User-Id: 1" \
  --cookie "session=your-session-cookie" \
  --output results.json
```

---

## Frontend Setup

### 1. Configure Environment

Create `.env` in `ltv-assistant-cms/`:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

### 2. Add Routes

Update `ltv-assistant-cms/src/App.tsx`:

```typescript
import { EvaluationDashboardPage } from './pages/evaluation/EvaluationDashboardPage';

// In your routes configuration
<Route path="/evaluation/dashboard" element={<EvaluationDashboardPage />} />
```

### 3. Add Navigation

Update sidebar navigation:

```typescript
{
  label: 'Evaluation',
  icon: IconChartBar,
  link: '/evaluation/dashboard',
  visible: user?.role === 'super_admin', // Only for super admin
}
```

### 4. Start Frontend

```bash
cd ltv-assistant-cms
npm run dev
# Visit: http://localhost:5173/evaluation/dashboard
```

---

## Testing

### Backend Tests

```bash
cd ltv-ragas-evaluation

# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html

# Test specific module
pytest tests/test_dashboard.py -v
```

### API Integration Tests

```bash
# Test health endpoint
curl http://localhost:50059/health

# Test latest run (requires data)
curl http://localhost:3000/evaluation/dashboard/latest \
  -H "X-User-Id: 1" \
  -H "X-User-Role: super_admin" \
  --cookie "session=your-session"

# Expected: 200 OK with run data OR 404 if no runs exist
```

### E2E Test Flow

1. **Upload file**: POST /evaluation/files/upload
2. **Create dataset**: POST /evaluation/datasets
3. **Add questions**: POST /evaluation/datasets/{id}/questions/bulk
4. **Start evaluation**: POST /evaluation/jobs
5. **Poll status**: GET /evaluation/jobs/{job_id} (every 5s)
6. **Wait for completion**: status becomes "completed"
7. **View dashboard**: GET /evaluation/dashboard/latest
8. **Export results**: GET /evaluation/runs/{run_id}/export

---

## Troubleshooting

### Issue: "No completed runs found"

**Cause**: No evaluations have been run yet

**Solution**:
1. Create a dataset with questions
2. Run an evaluation
3. Wait for completion
4. Refresh dashboard

### Issue: Worker not processing jobs

**Cause**: RQ worker not running or Redis connection failed

**Solution**:
```bash
# Check worker logs
docker-compose logs ltv-ragas-worker

# Restart worker
docker-compose restart ltv-ragas-worker

# Check Redis connection
redis-cli -h localhost -p 6379 ping
```

### Issue: "Dataset not found" when starting evaluation

**Cause**: Invalid dataset_id or dataset has no questions

**Solution**:
```bash
# List datasets
curl http://localhost:3000/evaluation/datasets

# Check dataset details
curl http://localhost:3000/evaluation/datasets/{dataset_id}

# Verify questions exist
```

### Issue: File upload fails

**Cause**: MinIO bucket not created or permissions issue

**Solution**:
```bash
# Create bucket
mc mb local/evaluation

# Check bucket exists
mc ls local/

# Set policy
mc policy set download local/evaluation
```

### Issue: Frontend can't connect to API

**Cause**: CORS issue or wrong API URL

**Solution**:
1. Check `.env` has correct `VITE_API_BASE_URL`
2. Verify API Gateway is running
3. Check browser console for CORS errors
4. Ensure super_admin role is set

---

## Production Deployment

### 1. Environment Configuration

**Backend `.env`:**
```bash
FLASK_ENV=production
FLASK_DEBUG=False
PORT=50059
DATABASE_URL=mysql+pymysql://user:pass@prod-mysql:3306/ltv_assistant
REDIS_URL=redis://prod-redis:6379/0
MINIO_ENDPOINT=prod-minio:9000
MINIO_SECURE=True
RETRIEVAL_SERVICE_URL=http://ltv-assistant-retrieval:50057
```

### 2. Build Docker Images

```bash
cd ltv-ragas-evaluation

# Build image
docker build -t ltv-ragas-evaluation:v1.0.0 .

# Tag for registry
docker tag ltv-ragas-evaluation:v1.0.0 your-registry/ltv-ragas-evaluation:v1.0.0

# Push to registry
docker push your-registry/ltv-ragas-evaluation:v1.0.0
```

### 3. Deploy Services

```bash
# Pull images
docker-compose pull

# Start services
docker-compose up -d ltv-ragas-evaluation ltv-ragas-worker

# Run migrations
docker-compose exec ltv-ragas-evaluation alembic upgrade head

# Verify
curl https://your-domain.com/evaluation/health
```

### 4. Monitoring

**Check Logs:**
```bash
docker-compose logs -f ltv-ragas-evaluation
docker-compose logs -f ltv-ragas-worker
```

**Monitor Redis Queue:**
```bash
redis-cli -h prod-redis
> KEYS ragas:*
> LLEN ragas-queue
```

**Monitor Database:**
```sql
-- Check active jobs
SELECT * FROM evaluation_jobs WHERE status IN ('pending', 'processing');

-- Check recent runs
SELECT * FROM evaluation_runs ORDER BY created_at DESC LIMIT 10;

-- Check result counts
SELECT run_id, COUNT(*) as total,
       SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
FROM evaluation_results
GROUP BY run_id;
```

### 5. Backup Strategy

**Database Backup:**
```bash
# Daily backup
mysqldump ltv_assistant \
  evaluation_files \
  evaluation_datasets \
  dataset_questions \
  evaluation_jobs \
  evaluation_runs \
  evaluation_results \
  dataset_files > backup_$(date +%Y%m%d).sql
```

**MinIO Backup:**
```bash
# Backup evaluation bucket
mc mirror local/evaluation /backup/minio/evaluation/
```

---

## Performance Optimization

### Redis Caching
- Latest run cached indefinitely
- Overview cached for 1 hour
- Adjust TTL in code if needed

### Database Indexes
All critical indexes already created in migration:
- `evaluation_jobs`: status, created_by_user_id, created_at
- `evaluation_runs`: dataset_id, job_id, created_at DESC
- `evaluation_results`: run_id, question_id, created_at
- `dataset_questions`: dataset_id, order_index (UNIQUE)

### Connection Pooling
SQLAlchemy pool configured:
- Pool size: 10
- Max overflow: 20
- Pool recycle: 3600s

---

## Security Checklist

- [x] Super admin only access enforced at API Gateway
- [x] Input validation with Pydantic
- [x] SQL injection protection (SQLAlchemy ORM)
- [x] CORS configured for CMS domain only
- [x] No stack traces in production errors
- [x] File upload validation (type, size)
- [x] MinIO bucket private by default
- [x] Redis password protected (configure in production)
- [x] Database credentials in environment variables

---

## Support and Documentation

- **API Documentation**: See PHASE4_IMPLEMENTATION_SUMMARY.md
- **Backend Code**: ltv-ragas-evaluation/src/
- **Frontend Code**: ltv-assistant-cms/src/features/evaluation/
- **Database Schema**: migrations/versions/

---

## Quick Reference

**Services:**
- Backend API: http://localhost:50059
- API Gateway: http://localhost:3000
- Frontend: http://localhost:5173
- MinIO Console: http://localhost:9001
- Redis: localhost:6379
- MySQL: localhost:3306

**Key Commands:**
```bash
# Start all
docker-compose up -d

# View logs
docker-compose logs -f ltv-ragas-evaluation

# Run migrations
docker-compose exec ltv-ragas-evaluation alembic upgrade head

# Restart worker
docker-compose restart ltv-ragas-worker

# Check health
curl http://localhost:50059/health
```

---

**Status**: Production Ready
**Version**: 1.0.0
**Last Updated**: 2025-01-10
