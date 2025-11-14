"""
Job Management API endpoints.
Handles evaluation job creation and status tracking.
"""

from flask import Blueprint, request, jsonify, Response
from sqlalchemy import select, func
from pydantic import ValidationError
from redis import Redis
from rq import Queue

from src.models.base import get_db_session
from src.models.job import EvaluationJob
from src.models.run import EvaluationRun
from src.models.dataset import EvaluationDataset
from src.models.question import DatasetQuestion
from src.schemas.job import (
    JobCreateRequest,
    JobCreateResponse,
    JobStatusResponse,
    JobListItem,
    JobListResponse
)
from src.config.settings import get_settings
from src.utils.logger import logger


settings = get_settings()
jobs_bp = Blueprint('jobs', __name__, url_prefix='/evaluation/jobs')


# Initialize Redis and Queue
def get_rq_queue() -> Queue:
    """Get or create RQ queue."""
    redis_conn = Redis.from_url(
        settings.redis_url,
        socket_connect_timeout=5,
        socket_keepalive=True,
        decode_responses=True
    )
    return Queue(settings.rq_queue_name, connection=redis_conn)


@jobs_bp.route('', methods=['POST'])
def create_job() -> tuple[Response, int]:
    """
    Create a new evaluation job.

    Request body:
        {
            "dataset_id": "uuid",
            "top_k": 5,
            "metadata": {}
        }

    Returns:
        JSON response with job_id and run_id
    """
    # Get user ID from header
    user_id_str = request.headers.get('X-User-Id')
    if not user_id_str:
        return jsonify({'error': 'Unauthorized', 'message': 'User ID not found'}), 401

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        return jsonify({'error': 'BadRequest', 'message': 'Invalid user ID format'}), 400

    try:
        # Parse and validate request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'BadRequest', 'message': 'Request body is required'}), 400

        req = JobCreateRequest(**data)

        db = get_db_session()
        try:
            # Validate dataset exists
            dataset = db.execute(
                select(EvaluationDataset).where(
                    EvaluationDataset.dataset_id == req.dataset_id)
            ).scalar_one_or_none()

            if not dataset:
                return jsonify({'error': 'NotFound', 'message': 'Dataset not found'}), 404

            # Check dataset has questions
            question_count = db.execute(
                select(func.count())
                .where(DatasetQuestion.dataset_id == req.dataset_id)
            ).scalar() or 0

            if question_count == 0:
                return jsonify({
                    'error': 'BadRequest',
                    'message': 'Dataset has no questions to evaluate'
                }), 400

            # Create evaluation job
            job = EvaluationJob(
                status='pending',
                progress_percent=0,
                current_step='Initializing evaluation...',
                created_by_user_id=user_id
            )
            db.add(job)
            db.flush()  # Get job_id

            # Create evaluation run
            run = EvaluationRun(
                job_id=job.job_id,
                dataset_id=req.dataset_id,
                total_questions=question_count,
                successful_questions=0,
                failed_questions=0,
                current_question_index=0,
                config={'top_k': req.top_k, 'metadata': req.metadata or {}}
            )
            db.add(run)
            db.commit()

            # Enqueue job to RQ
            queue = get_rq_queue()
            # Use string path for RQ to properly import the function
            # Pass arguments as positional args when using string path
            rq_job = queue.enqueue(
                'src.workers.evaluation_worker.run_evaluation',
                job.job_id,  # job_id
                run.run_id,  # run_id
                req.dataset_id,  # dataset_id
                req.top_k,  # top_k
                job_id=job.job_id,  # RQ job_id
                job_timeout=settings.rq_job_timeout,
                result_ttl=86400  # Keep result for 24 hours
            )

            logger.info(
                f"Created evaluation job {job.job_id} with RQ job {rq_job.id}")

            # Prepare response
            response = JobCreateResponse(
                job_id=job.job_id,
                run_id=run.run_id,
                dataset_id=req.dataset_id,
                status=job.status,
                created_at=job.created_at,
                message=f'Evaluation job created successfully. Processing {question_count} questions.'
            )

            return jsonify(response.model_dump(mode='json')), 201

        finally:
            db.close()

    except ValidationError as e:
        return jsonify({'error': 'BadRequest', 'message': str(e)}), 400
    except Exception as e:
        logger.error(f"Failed to create evaluation job: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to create evaluation job'}), 500


@jobs_bp.route('/<job_id>', methods=['GET'])
def get_job_status(job_id: str) -> tuple[Response, int]:
    """
    Get job status with progress details.

    Args:
        job_id: Job identifier

    Returns:
        JSON response with job status and progress
    """
    try:
        db = get_db_session()
        try:
            # Get job
            job = db.execute(
                select(EvaluationJob).where(EvaluationJob.job_id == job_id)
            ).scalar_one_or_none()

            if not job:
                return jsonify({'error': 'NotFound', 'message': 'Job not found'}), 404

            # Get associated run
            run = db.execute(
                select(EvaluationRun).where(EvaluationRun.job_id == job_id)
            ).scalar_one_or_none()

            if not run:
                return jsonify({'error': 'NotFound', 'message': 'Evaluation run not found'}), 404

            # Try to get real-time progress from Redis
            try:
                redis_conn = Redis.from_url(
                    settings.redis_url, decode_responses=True)
                cache_key = f"eval_progress:{job_id}"
                cached_data = redis_conn.hgetall(cache_key)

                if cached_data:
                    # Use cached progress data (more up-to-date)
                    job.progress_percent = int(cached_data.get(
                        'progress_percent', job.progress_percent))
                    job.current_step = cached_data.get(
                        'current_step', job.current_step)
            except Exception as redis_error:
                logger.warning(
                    f"Failed to fetch Redis progress: {redis_error}")
                # Continue with database values

            # Prepare response
            response = JobStatusResponse(
                job_id=job.job_id,
                run_id=run.run_id,
                status=job.status,
                progress_percent=job.progress_percent,
                current_step=job.current_step,
                total_questions=run.total_questions,
                completed_questions=run.successful_questions,
                failed_questions=run.failed_questions,
                created_at=job.created_at,
                started_at=job.started_at,
                completed_at=job.completed_at,
                error_message=job.error_message,
                average_scores=run.average_scores if job.status == 'completed' else None,
                statistics=run.statistics if job.status == 'completed' else None,
                processing_time_ms=run.processing_time_ms if job.status == 'completed' else None
            )

            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to get job status: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to get job status'}), 500


@jobs_bp.route('', methods=['GET'])
def list_jobs() -> tuple[Response, int]:
    """
    List all evaluation jobs with pagination.

    Query params:
        - page: Page number (default: 1)
        - limit: Items per page (default: 20)
        - status: Filter by status
        - dataset_id: Filter by dataset ID

    Returns:
        JSON response with paginated job list
    """
    # Parse query parameters
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    status = request.args.get('status', type=str)
    dataset_id = request.args.get('dataset_id', type=str)

    # Validate parameters
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 20

    try:
        db = get_db_session()
        try:
            # Build query
            query = select(EvaluationJob).join(
                EvaluationRun, EvaluationRun.job_id == EvaluationJob.job_id
            ).join(
                EvaluationDataset, EvaluationDataset.dataset_id == EvaluationRun.dataset_id
            )

            # Apply filters
            if status:
                query = query.where(EvaluationJob.status == status)
            if dataset_id:
                query = query.where(EvaluationRun.dataset_id == dataset_id)

            # Order by creation date (newest first)
            query = query.order_by(EvaluationJob.created_at.desc())

            # Get total count
            count_query = select(func.count()).select_from(query.subquery())
            total = db.execute(count_query).scalar() or 0

            # Calculate pagination
            pages = (total + limit - 1) // limit if total > 0 else 1
            offset = (page - 1) * limit

            # Get paginated results
            query = query.offset(offset).limit(limit)
            jobs = db.execute(query).scalars().all()

            # Prepare response items
            items = []
            for job in jobs:
                run = db.execute(
                    select(EvaluationRun).where(
                        EvaluationRun.job_id == job.job_id)
                ).scalar_one()

                dataset = db.execute(
                    select(EvaluationDataset).where(
                        EvaluationDataset.dataset_id == run.dataset_id)
                ).scalar_one()

                items.append(JobListItem(
                    job_id=job.job_id,
                    run_id=run.run_id,
                    dataset_id=run.dataset_id,
                    dataset_name=dataset.name,
                    status=job.status,
                    progress_percent=job.progress_percent,
                    total_questions=run.total_questions,
                    created_at=job.created_at,
                    completed_at=job.completed_at
                ))

            response = JobListResponse(
                items=items,
                total=total,
                page=page,
                limit=limit,
                pages=pages
            )

            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to list jobs: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to list jobs'}), 500
