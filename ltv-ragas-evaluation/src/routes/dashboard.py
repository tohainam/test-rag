"""
Dashboard and Results API endpoints.
Handles dashboard auto-load, metrics overview, results listing, and export.
"""

import json
import csv
import io
from flask import Blueprint, request, jsonify, Response
from sqlalchemy import select, func
from redis import Redis

from src.models.base import get_db_session
from src.models.run import EvaluationRun
from src.models.result import EvaluationResult
from src.models.dataset import EvaluationDataset
from src.models.job import EvaluationJob
from src.schemas.dashboard import DashboardLatestResponse, RunOverviewResponse
from src.schemas.result import ResultListResponse, ResultListItem, ResultDetailResponse
from src.config.settings import get_settings
from src.utils.logger import logger


settings = get_settings()
dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/evaluation')


@dashboard_bp.route('/dashboard/latest', methods=['GET'])
def get_latest_run() -> tuple[Response, int]:
    """
    Get latest completed evaluation run for dashboard auto-load.

    Returns:
        JSON response with latest run and statistics
    """
    try:
        db = get_db_session()
        try:
            # Query latest completed run
            run = db.execute(
                select(EvaluationRun)
                .join(EvaluationJob, EvaluationJob.job_id == EvaluationRun.job_id)
                .where(EvaluationJob.status == 'completed')
                .order_by(EvaluationRun.created_at.desc())
                .limit(1)
            ).scalar_one_or_none()

            if not run:
                return jsonify({
                    'run_id': None,
                    'dataset_id': None,
                    'dataset_name': None,
                    'job_id': None,
                    'total_questions': 0,
                    'completed_questions': 0,
                    'failed_questions': 0,
                    'average_scores': None,
                    'statistics': None,
                    'processing_time_ms': None,
                    'created_at': None,
                    'completed_at': None,
                    'message': 'No evaluations have been run yet. Create a dataset and start your first evaluation.'
                }), 200

            # Get dataset name
            dataset = db.execute(
                select(EvaluationDataset).where(EvaluationDataset.dataset_id == run.dataset_id)
            ).scalar_one()

            # Get job
            job = db.execute(
                select(EvaluationJob).where(EvaluationJob.job_id == run.job_id)
            ).scalar_one()

            # Cache in Redis
            try:
                redis_conn = Redis.from_url(settings.redis_url, decode_responses=True)
                redis_conn.set('ragas:latest_run', run.run_id)
                logger.info(f"Cached latest run: {run.run_id}")
            except Exception as redis_error:
                logger.warning(f"Failed to cache latest run: {redis_error}")

            # Calculate completed questions (successful + failed)
            completed_questions = run.successful_questions + run.failed_questions

            # Prepare response
            response = DashboardLatestResponse(
                run_id=run.run_id,
                dataset_id=run.dataset_id,
                dataset_name=dataset.name,
                job_id=run.job_id,
                total_questions=run.total_questions,
                completed_questions=completed_questions,
                failed_questions=run.failed_questions,
                average_scores=run.average_scores,
                statistics=run.statistics,
                processing_time_ms=run.processing_time_ms,
                created_at=run.created_at,
                completed_at=job.completed_at
            )

            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to get latest run: {e}", exc_info=True)
        return jsonify({
            'error': 'InternalServerError',
            'message': 'Failed to get latest run'
        }), 500


@dashboard_bp.route('/runs/<run_id>/overview', methods=['GET'])
def get_run_overview(run_id: str) -> tuple[Response, int]:
    """
    Get comprehensive overview with aggregated metrics.

    Query params:
        - use_cache: boolean (default true)

    Args:
        run_id: Evaluation run ID

    Returns:
        JSON response with complete run overview and statistics
    """
    try:
        # Check Redis cache first
        use_cache = request.args.get('use_cache', 'true').lower() == 'true'
        cache_key = f"ragas:overview:{run_id}"

        if use_cache:
            try:
                redis_conn = Redis.from_url(settings.redis_url, decode_responses=True)
                cached = redis_conn.get(cache_key)
                if cached:
                    logger.info(f"Returning cached overview for run {run_id}")
                    return jsonify(json.loads(cached)), 200
            except Exception as redis_error:
                logger.warning(f"Failed to check cache: {redis_error}")

        db = get_db_session()
        try:
            # Get run
            run = db.execute(
                select(EvaluationRun).where(EvaluationRun.run_id == run_id)
            ).scalar_one_or_none()

            if not run:
                return jsonify({'error': 'NotFound', 'message': 'Run not found'}), 404

            # Get dataset
            dataset = db.execute(
                select(EvaluationDataset).where(EvaluationDataset.dataset_id == run.dataset_id)
            ).scalar_one()

            # Get job
            job = db.execute(
                select(EvaluationJob).where(EvaluationJob.job_id == run.job_id)
            ).scalar_one()

            # Calculate completed questions (successful + failed)
            completed_questions = run.successful_questions + run.failed_questions

            # Calculate derived metrics
            success_rate = (run.successful_questions / run.total_questions * 100) if run.total_questions > 0 else 0
            avg_time_per_question = (run.processing_time_ms // run.total_questions) if run.total_questions > 0 and run.processing_time_ms else None

            avg_scores = run.average_scores or {}
            overall_score = (
                avg_scores.get('context_precision', 0) +
                avg_scores.get('context_recall', 0) +
                avg_scores.get('context_relevancy', 0)
            ) / 3

            # Parse statistics - convert to MetricStatistics if valid, otherwise None
            from src.schemas.dashboard import MetricStatistics
            
            stats = run.statistics or {}
            precision_stats_dict = stats.get('context_precision', {})
            recall_stats_dict = stats.get('context_recall', {})
            relevancy_stats_dict = stats.get('context_relevancy', {})
            
            # Only create MetricStatistics if all required fields are present
            precision_stats = None
            if precision_stats_dict and all(k in precision_stats_dict for k in ['mean', 'median', 'std_dev', 'min', 'max', 'count']):
                try:
                    precision_stats = MetricStatistics(**precision_stats_dict)
                except Exception:
                    precision_stats = None
            
            recall_stats = None
            if recall_stats_dict and all(k in recall_stats_dict for k in ['mean', 'median', 'std_dev', 'min', 'max', 'count']):
                try:
                    recall_stats = MetricStatistics(**recall_stats_dict)
                except Exception:
                    recall_stats = None
            
            relevancy_stats = None
            if relevancy_stats_dict and all(k in relevancy_stats_dict for k in ['mean', 'median', 'std_dev', 'min', 'max', 'count']):
                try:
                    relevancy_stats = MetricStatistics(**relevancy_stats_dict)
                except Exception:
                    relevancy_stats = None

            # Prepare response
            response = RunOverviewResponse(
                run_id=run.run_id,
                dataset_id=run.dataset_id,
                dataset_name=dataset.name,
                job_id=run.job_id,
                total_questions=run.total_questions,
                completed_questions=completed_questions,
                failed_questions=run.failed_questions,
                success_rate=success_rate,
                avg_context_precision=avg_scores.get('context_precision', 0.0),
                avg_context_recall=avg_scores.get('context_recall', 0.0),
                avg_context_relevancy=avg_scores.get('context_relevancy', 0.0),
                overall_score=overall_score,
                precision_stats=precision_stats,
                recall_stats=recall_stats,
                relevancy_stats=relevancy_stats,
                processing_time_ms=run.processing_time_ms,
                avg_time_per_question_ms=avg_time_per_question,
                created_at=run.created_at,
                completed_at=job.completed_at
            )

            response_json = response.model_dump(mode='json')

            # Cache for 1 hour
            if use_cache:
                try:
                    redis_conn = Redis.from_url(settings.redis_url, decode_responses=True)
                    redis_conn.setex(cache_key, 3600, json.dumps(response_json))
                    logger.info(f"Cached overview for run {run_id}")
                except Exception as redis_error:
                    logger.warning(f"Failed to cache overview: {redis_error}")

            return jsonify(response_json), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to get run overview: {e}", exc_info=True)
        return jsonify({
            'error': 'InternalServerError',
            'message': 'Failed to get run overview'
        }), 500


@dashboard_bp.route('/runs/<run_id>/results', methods=['GET'])
def get_run_results(run_id: str) -> tuple[Response, int]:
    """
    Get paginated results for a run.

    Query params:
        - page: int (default 1)
        - limit: int (default 20, max 100)
        - search: string (search in question text)
        - min_precision: float (filter)
        - min_recall: float (filter)
        - min_relevancy: float (filter)
        - sort_by: string (precision|recall|relevancy|created_at, default: created_at)
        - sort_order: string (asc|desc, default asc)

    Args:
        run_id: Evaluation run ID

    Returns:
        JSON response with paginated results list
    """
    # Parse params
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    search = request.args.get('search', type=str)
    min_precision = request.args.get('min_precision', type=float)
    min_recall = request.args.get('min_recall', type=float)
    min_relevancy = request.args.get('min_relevancy', type=float)
    sort_by = request.args.get('sort_by', 'created_at', type=str)
    sort_order = request.args.get('sort_order', 'asc', type=str)

    # Validate
    if limit < 1 or limit > 100:
        limit = 20
    if page < 1:
        page = 1

    try:
        db = get_db_session()
        try:
            # Build query
            query = select(EvaluationResult).where(EvaluationResult.run_id == run_id)

            # Apply filters
            if search:
                query = query.where(EvaluationResult.question_text.contains(search))
            if min_precision is not None:
                query = query.where(EvaluationResult.context_precision >= min_precision)
            if min_recall is not None:
                query = query.where(EvaluationResult.context_recall >= min_recall)
            if min_relevancy is not None:
                query = query.where(EvaluationResult.context_relevancy >= min_relevancy)

            # Apply sorting
            valid_sort_columns = ['context_precision', 'context_recall', 'context_relevancy', 'created_at']
            if sort_by in valid_sort_columns:
                sort_column = getattr(EvaluationResult, sort_by)
            else:
                sort_column = EvaluationResult.created_at

            if sort_order == 'desc':
                query = query.order_by(sort_column.desc())
            else:
                query = query.order_by(sort_column.asc())

            # Get total count
            count_query = select(func.count()).select_from(query.subquery())
            total = db.execute(count_query).scalar() or 0

            # Pagination
            pages = (total + limit - 1) // limit if total > 0 else 1
            offset = (page - 1) * limit

            # Get results
            query = query.offset(offset).limit(limit)
            results = db.execute(query).scalars().all()

            # Prepare response
            items = []
            for result in results:
                # Truncate question text for list view
                question_preview = result.question_text[:100] + '...' if len(result.question_text) > 100 else result.question_text

                items.append(ResultListItem(
                    result_id=result.result_id,
                    question_id=result.question_id,
                    question_text=question_preview,
                    context_precision=result.context_precision,
                    context_recall=result.context_recall,
                    context_relevancy=result.context_relevancy,
                    status=result.status,
                    created_at=result.created_at
                ))

            response = ResultListResponse(
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
        logger.error(f"Failed to get run results: {e}", exc_info=True)
        return jsonify({
            'error': 'InternalServerError',
            'message': 'Failed to get run results'
        }), 500


@dashboard_bp.route('/results/<result_id>', methods=['GET'])
def get_result_detail(result_id: str) -> tuple[Response, int]:
    """
    Get complete detail for a single result.

    Args:
        result_id: Evaluation result ID

    Returns:
        JSON response with full result including all contexts, scores, and metadata
    """
    try:
        db = get_db_session()
        try:
            result = db.execute(
                select(EvaluationResult).where(EvaluationResult.result_id == result_id)
            ).scalar_one_or_none()

            if not result:
                return jsonify({'error': 'NotFound', 'message': 'Result not found'}), 404

            response = ResultDetailResponse.model_validate(result)
            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to get result detail: {e}", exc_info=True)
        return jsonify({
            'error': 'InternalServerError',
            'message': 'Failed to get result detail'
        }), 500


@dashboard_bp.route('/runs/<run_id>/export', methods=['GET'])
def export_results(run_id: str) -> Response:
    """
    Export results to CSV or JSON.

    Query params:
        - format: csv|json (required)
        - type: summary|detailed (default: detailed)

    Args:
        run_id: Evaluation run ID

    Returns:
        File download (CSV or JSON)
    """
    export_format = request.args.get('format', 'csv')
    export_type = request.args.get('type', 'detailed')

    if export_format not in ['csv', 'json']:
        return jsonify({
            'error': 'BadRequest',
            'message': 'Invalid format. Use csv or json'
        }), 400

    try:
        db = get_db_session()
        try:
            # Get all results
            results = db.execute(
                select(EvaluationResult)
                .where(EvaluationResult.run_id == run_id)
                .order_by(EvaluationResult.created_at)
            ).scalars().all()

            if not results:
                return jsonify({
                    'error': 'NotFound',
                    'message': 'No results found for this run'
                }), 404

            # Export as CSV
            if export_format == 'csv':
                output = io.StringIO()

                if export_type == 'summary':
                    writer = csv.writer(output)
                    writer.writerow(['Question ID', 'Question', 'Precision', 'Recall', 'Relevancy', 'Status'])
                    for result in results:
                        writer.writerow([
                            result.question_id,
                            result.question_text,
                            result.context_precision or '',
                            result.context_recall or '',
                            result.context_relevancy or '',
                            result.status
                        ])
                else:  # detailed
                    writer = csv.writer(output)
                    writer.writerow([
                        'Question ID', 'Question', 'Expected Context',
                        'Retrieved Contexts', 'Precision', 'Recall', 'Relevancy',
                        'Status', 'Error Message', 'Metadata'
                    ])
                    for result in results:
                        writer.writerow([
                            result.question_id,
                            result.question_text,
                            result.expected_context,
                            json.dumps(result.retrieved_contexts) if result.retrieved_contexts else '',
                            result.context_precision or '',
                            result.context_recall or '',
                            result.context_relevancy or '',
                            result.status,
                            result.error_message or '',
                            json.dumps(result.result_metadata) if result.result_metadata else ''
                        ])

                response = Response(output.getvalue(), mimetype='text/csv')
                response.headers['Content-Disposition'] = f'attachment; filename=results_{run_id}.csv'
                logger.info(f"Exported results to CSV for run {run_id}")
                return response

            # Export as JSON
            else:
                data = []
                for result in results:
                    if export_type == 'summary':
                        data.append({
                            'question_id': result.question_id,
                            'question': result.question_text,
                            'scores': {
                                'precision': result.context_precision,
                                'recall': result.context_recall,
                                'relevancy': result.context_relevancy
                            },
                            'status': result.status
                        })
                    else:  # detailed
                        data.append(ResultDetailResponse.model_validate(result).model_dump(mode='json'))

                response = Response(json.dumps(data, indent=2), mimetype='application/json')
                response.headers['Content-Disposition'] = f'attachment; filename=results_{run_id}.json'
                logger.info(f"Exported results to JSON for run {run_id}")
                return response

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to export results: {e}", exc_info=True)
        return jsonify({
            'error': 'InternalServerError',
            'message': 'Failed to export results'
        }), 500
