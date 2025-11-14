"""
Question Generation Job Routes

API endpoints for managing question generation jobs.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional
from flask import Blueprint, request, jsonify
from redis import Redis
from rq import Queue
from sqlalchemy import select, desc

from src.config.settings import get_settings
from src.models.base import get_db_session
from src.models.generation_job import QuestionGenerationJob, GenerationStatus
from src.models.dataset import EvaluationDataset
from src.models.file import EvaluationFile
from src.models.dataset_file import DatasetFile
from src.utils.logger import logger
from src.workers.question_generation_worker import run_question_generation

settings = get_settings()
generation_jobs_bp = Blueprint('generation_jobs', __name__)


@generation_jobs_bp.route('/evaluation/datasets/<dataset_id>/generate', methods=['POST'])
def trigger_generation(dataset_id: str):
    """
    Trigger question generation for a dataset.

    Can be used to:
    - Generate questions for newly added files
    - Regenerate questions for specific files
    - Regenerate all questions for a dataset

    Request Body:
        {
            "file_ids": ["file1", "file2"],  // Optional: specific files to process
            "config": {  // Optional: generation configuration
                "temperature": 0.3,
                "model": "gemini-2.5-flash-lite"
            }
        }

    Returns:
        {
            "success": true,
            "job_id": "uuid",
            "dataset_id": "uuid",
            "total_files": 5,
            "message": "Question generation started"
        }
    """
    user_id = request.headers.get('X-User-Id')
    if not user_id:
        return jsonify({"error": "Authentication required"}), 401

    user_id = int(user_id)

    db = get_db_session()

    try:
        # Validate dataset exists and user has access
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if not dataset:
            return jsonify({"error": "Dataset not found"}), 404

        if dataset.created_by_user_id != user_id:
            return jsonify({"error": "Access denied"}), 403

        # Get request data
        data = request.get_json() or {}
        file_ids = data.get('file_ids')
        config = data.get('config')

        # Validate file_ids if provided
        if file_ids:
            # Check that files exist and are linked to dataset
            files_query = (
                select(EvaluationFile.file_id)
                .join(DatasetFile, DatasetFile.file_id == EvaluationFile.file_id)
                .where(
                    DatasetFile.dataset_id == dataset_id,
                    EvaluationFile.file_id.in_(file_ids)
                )
            )
            valid_file_ids = [row[0] for row in db.execute(files_query).all()]

            if len(valid_file_ids) != len(file_ids):
                return jsonify({"error": "Some file IDs are invalid or not linked to dataset"}), 400

            total_files = len(valid_file_ids)
        else:
            # Count all files linked to dataset
            total_files = db.execute(
                select(DatasetFile.file_id)
                .where(DatasetFile.dataset_id == dataset_id)
            ).all().__len__()

        if total_files == 0:
            return jsonify({"error": "No files linked to dataset"}), 400

        # Create generation job
        job_id = str(uuid.uuid4())
        generation_job = QuestionGenerationJob(
            job_id=job_id,
            dataset_id=dataset_id,
            status=GenerationStatus.pending,
            total_files=total_files,
            config=config,
        )
        db.add(generation_job)
        db.commit()

        # Enqueue worker task
        logger.info(f"About to enqueue generation job {job_id} to ragas-queue")
        try:
            redis_conn = Redis.from_url(settings.redis_url)
            logger.info(f"Redis connection created: {redis_conn}")
            queue = Queue('ragas-queue', connection=redis_conn)
            logger.info(f"Queue created, about to enqueue...")
            rq_job = queue.enqueue(
                run_question_generation,
                job_id,  # First positional argument
                dataset_id,  # Second positional argument
                file_ids,  # Third positional argument
                job_timeout='1h',  # Timeout as keyword argument
            )
            logger.info(
                f"Question generation job {job_id} enqueued to RQ with RQ job ID: {rq_job.id}"
            )
        except Exception as enqueue_error:
            logger.error(f"Failed to enqueue job {job_id}: {str(enqueue_error)}", exc_info=True)
            raise

        logger.info(
            f"Question generation job {job_id} created for dataset {dataset_id} "
            f"with {total_files} files"
        )

        return jsonify({
            "success": True,
            "job_id": job_id,
            "dataset_id": dataset_id,
            "total_files": total_files,
            "message": "Question generation started"
        }), 201

    except Exception as e:
        logger.error(f"Failed to trigger generation: {str(e)}", exc_info=True)
        db.rollback()
        return jsonify({"error": f"Failed to start generation: {str(e)}"}), 500

    finally:
        db.close()


@generation_jobs_bp.route('/evaluation/generation-jobs/<job_id>', methods=['GET'])
def get_generation_job_status(job_id: str):
    """
    Get status and progress of a question generation job.

    Returns:
        {
            "job_id": "uuid",
            "dataset_id": "uuid",
            "status": "processing",
            "progress_percent": 45.5,
            "current_file": "document.pdf",
            "total_files": 5,
            "processed_files": 2,
            "failed_files": 0,
            "total_questions_generated": 15,
            "config": {},
            "error_messages": [],
            "file_results": {},
            "processing_time_ms": 12345,
            "created_at": "2025-01-01T00:00:00Z",
            "started_at": "2025-01-01T00:00:05Z",
            "completed_at": null,
            "updated_at": "2025-01-01T00:00:30Z"
        }
    """
    db = get_db_session()

    try:
        # Get job from database
        job = db.execute(
            select(QuestionGenerationJob).where(QuestionGenerationJob.job_id == job_id)
        ).scalar_one_or_none()

        if not job:
            return jsonify({"error": "Generation job not found"}), 404

        # Try to get real-time progress from Redis (faster)
        try:
            redis_conn = Redis.from_url(settings.redis_url, decode_responses=True)
            cache_key = f"gen_progress:{job_id}"
            redis_data = redis_conn.hgetall(cache_key)

            if redis_data:
                # Update with Redis data (more recent)
                job_dict = job.to_dict()
                job_dict['progress_percent'] = float(redis_data.get('progress_percent', job.progress_percent))
                job_dict['current_file'] = redis_data.get('current_file', job.current_file)
                return jsonify(job_dict), 200
        except Exception as redis_error:
            logger.warning(f"Failed to get progress from Redis: {str(redis_error)}")
            # Fall back to database data

        return jsonify(job.to_dict()), 200

    except Exception as e:
        logger.error(f"Failed to get generation job status: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to get job status: {str(e)}"}), 500

    finally:
        db.close()


@generation_jobs_bp.route('/evaluation/datasets/<dataset_id>/generation-jobs', methods=['GET'])
def list_generation_jobs(dataset_id: str):
    """
    List all generation jobs for a dataset.

    Query Parameters:
        - status: Filter by status (pending, processing, completed, failed)
        - page: Page number (default: 1)
        - limit: Items per page (default: 20, max: 100)

    Returns:
        {
            "jobs": [
                {
                    "job_id": "uuid",
                    "dataset_id": "uuid",
                    "status": "completed",
                    "progress_percent": 100.0,
                    "total_files": 5,
                    "processed_files": 5,
                    "failed_files": 0,
                    "total_questions_generated": 25,
                    "processing_time_ms": 45000,
                    "created_at": "2025-01-01T00:00:00Z",
                    "completed_at": "2025-01-01T00:00:45Z"
                }
            ],
            "total": 10,
            "page": 1,
            "limit": 20,
            "total_pages": 1
        }
    """
    user_id = request.headers.get('X-User-Id')
    if user_id:
        user_id = int(user_id)

    db = get_db_session()

    try:
        # Validate dataset exists
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one_or_none()

        if not dataset:
            return jsonify({"error": "Dataset not found"}), 404

        # Optional: Check user access (if user_id is available)
        if user_id and dataset.created_by_user_id != user_id:
            return jsonify({"error": "Access denied"}), 403

        # Get query parameters
        status_filter = request.args.get('status')
        page = max(1, int(request.args.get('page', 1)))
        limit = min(100, max(1, int(request.args.get('limit', 20))))
        offset = (page - 1) * limit

        # Build query
        query = select(QuestionGenerationJob).where(
            QuestionGenerationJob.dataset_id == dataset_id
        )

        if status_filter:
            try:
                status_enum = GenerationStatus(status_filter)
                query = query.where(QuestionGenerationJob.status == status_enum)
            except ValueError:
                return jsonify({"error": f"Invalid status: {status_filter}"}), 400

        # Order by created_at descending (most recent first)
        query = query.order_by(desc(QuestionGenerationJob.created_at))

        # Get total count
        count_query = select(QuestionGenerationJob.job_id).where(
            QuestionGenerationJob.dataset_id == dataset_id
        )
        if status_filter:
            count_query = count_query.where(QuestionGenerationJob.status == status_enum)

        total = db.execute(count_query).all().__len__()

        # Get paginated results
        query = query.offset(offset).limit(limit)
        jobs = db.execute(query).scalars().all()

        # Calculate total pages
        total_pages = (total + limit - 1) // limit if total > 0 else 0

        return jsonify({
            "jobs": [job.to_dict() for job in jobs],
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages
        }), 200

    except Exception as e:
        logger.error(f"Failed to list generation jobs: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to list jobs: {str(e)}"}), 500

    finally:
        db.close()
