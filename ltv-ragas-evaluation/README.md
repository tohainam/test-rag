# LTV RAGAS Evaluation Service

RAGAS-based evaluation system for assessing the quality of the LTV Assistant's retrieval system.

## Overview

This service provides:
- **Evaluation Dataset Management**: Create and manage test datasets with questions
- **Sequential Testing**: Test questions one at a time to avoid overloading the retrieval service
- **RAGAS Metrics**: Context Precision, Context Recall, and Context Relevancy
- **Progress Tracking**: Real-time progress updates during evaluation
- **Results Dashboard**: View detailed evaluation results

## Architecture

- **Flask** web service (port 50059)
- **RQ Worker** for async job processing
- **MySQL** for data persistence
- **Redis** for job queue
- **MinIO** for file storage (evaluation bucket)

## Phase 1 Features

### ✅ Implemented
- Project structure and configuration
- Database schema (7 tables)
- SQLAlchemy models
- Alembic migrations
- Flask application with CORS
- Health check endpoint
- JSON structured logging
- Docker containerization

### 🚧 In Progress
- API Gateway integration
- RQ Worker setup

### 📋 Planned (Phase 2+)
- File upload/management APIs
- Dataset CRUD APIs
- Question management APIs
- Evaluation execution engine
- Results dashboard APIs

## Database Schema

### Core Tables
1. **evaluation_files** - Uploaded file metadata
2. **evaluation_datasets** - Test datasets
3. **dataset_questions** - Questions within datasets (ordered)
4. **evaluation_jobs** - Async job tracking
5. **evaluation_runs** - Evaluation execution records
6. **evaluation_results** - Individual question results
7. **dataset_files** - Dataset-File junction table

## Setup

### Local Development

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run migrations:
```bash
alembic upgrade head
```

4. Start the service:
```bash
python -m src.app
```

### Docker

Build and run with Docker Compose:
```bash
docker-compose up --build ltv-ragas-evaluation ltv-ragas-worker
```

## API Endpoints

### Health Check
```
GET /health
```

Returns service health status including database and Redis connectivity.

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `DATABASE_URL` - MySQL connection string
- `REDIS_URL` - Redis connection string
- `MINIO_ENDPOINT` - MinIO server endpoint
- `RETRIEVAL_SERVICE_URL` - URL of the retrieval service to evaluate

## Access Control

**Super Admin Only**: All evaluation endpoints require the `super_admin` role. Access is enforced at the API Gateway level.

## Development

### Running Tests
```bash
pytest tests/
```

### Running Worker
```bash
rq worker ragas-queue --url redis://localhost:6379/0
```

### Creating Migrations
```bash
alembic revision --autogenerate -m "Description"
alembic upgrade head
```

## Architecture Decisions

### Sequential Testing
Questions are tested **one at a time** (not in parallel) to avoid overloading the retrieval service. Progress is tracked per-question for real-time updates.

### Auto-Load Dashboard
The dashboard automatically loads the latest completed evaluation run, eliminating the need for manual selection.

### Role-Based Access
Only users with the `super_admin` role can access evaluation features, enforced at multiple levels (Gateway, Service, Frontend).

## License

Proprietary - LTV Assistant Project
