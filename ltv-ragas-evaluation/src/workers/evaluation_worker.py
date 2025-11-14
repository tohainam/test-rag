"""
RQ Worker for processing RAGAS evaluation jobs.
Sequential job processing to avoid overloading the retrieval service.
"""

import sys
import time
from datetime import datetime, timezone
from redis import Redis
from rq import Worker, Queue
from sqlalchemy import select

from src.config.settings import get_settings
from src.utils.logger import logger
from src.models.base import get_db_session
from src.models.job import EvaluationJob
from src.models.run import EvaluationRun
from src.models.question import DatasetQuestion
from src.models.result import EvaluationResult
from src.services.retrieval_client import get_retrieval_client, RetrievalServiceError
from src.services.ragas_evaluator import get_ragas_evaluator
from src.services.statistics_service import StatisticsService


settings = get_settings()


def update_progress(
    redis_conn: Redis,
    db_job: EvaluationJob,
    db_run: EvaluationRun,
    progress_percent: int,
    current_step: str
) -> None:
    """
    Update progress in both Redis and database.

    Args:
        redis_conn: Redis connection
        db_job: Job database object
        db_run: Run database object
        progress_percent: Progress percentage (0-100)
        current_step: Current step description
    """
    # Update Redis (for fast polling)
    cache_key = f"eval_progress:{db_job.job_id}"
    redis_conn.hset(cache_key, mapping={
        'progress_percent': progress_percent,
        'current_step': current_step,
        'updated_at': datetime.now(timezone.utc).isoformat()
    })
    redis_conn.expire(cache_key, 3600)  # 1 hour TTL

    # Update database (for persistence)
    db_job.progress_percent = progress_percent
    db_job.current_step = current_step


def run_evaluation(
    job_id: str,
    run_id: str,
    dataset_id: str,
    top_k: int = 5
) -> dict[str, any]:
    """
    Run sequential evaluation for all questions in a dataset.
    CRITICAL: Questions are processed ONE AT A TIME to avoid overloading retrieval service.

    Args:
        job_id: Evaluation job ID
        run_id: Evaluation run ID
        dataset_id: Dataset ID to evaluate
        top_k: Number of contexts to retrieve per question

    Returns:
        Dict with evaluation results summary
    """
    db = get_db_session()
    redis_conn = Redis.from_url(settings.redis_url, decode_responses=True)
    retrieval_client = get_retrieval_client()
    ragas_evaluator = get_ragas_evaluator()

    start_time = time.time()

    try:
        logger.info(f"Starting evaluation for job {job_id}, run {run_id}, dataset {dataset_id}")

        # Get job and run
        job = db.execute(
            select(EvaluationJob).where(EvaluationJob.job_id == job_id)
        ).scalar_one()

        run = db.execute(
            select(EvaluationRun).where(EvaluationRun.run_id == run_id)
        ).scalar_one()

        # Update job status to processing
        job.status = 'processing'
        job.started_at = datetime.now(timezone.utc)
        update_progress(redis_conn, job, run, 5, 'Loading questions...')
        db.commit()

        # Get all questions ordered by order_index (CRITICAL for sequential processing)
        questions = db.execute(
            select(DatasetQuestion)
            .where(DatasetQuestion.dataset_id == dataset_id)
            .order_by(DatasetQuestion.order_index)
        ).scalars().all()

        total_questions = len(questions)
        logger.info(f"Processing {total_questions} questions sequentially")

        update_progress(redis_conn, job, run, 10, f'Starting evaluation of {total_questions} questions...')
        db.commit()

        # Process questions ONE AT A TIME
        for idx, question in enumerate(questions):
            question_num = idx + 1
            progress_base = 10 + int((idx / total_questions) * 80)  # 10-90% for processing

            try:
                logger.info(f"Processing question {question_num}/{total_questions}: {question.question[:100]}")

                # Update progress
                run.current_question_index = idx
                run.current_question_id = question.question_id
                update_progress(
                    redis_conn, job, run,
                    progress_base,
                    f'Testing question {question_num}/{total_questions}...'
                )
                db.commit()

                # Initialize contexts outside try block so it's accessible in except handlers
                contexts = []
                retrieval_time_ms = 0

                # Step 1: Query retrieval service
                logger.info(f"Querying retrieval service for question {question_num}")
                retrieval_start = time.time()

                retrieval_result = retrieval_client.query(
                    question=question.question,
                    top_k=top_k
                )

                retrieval_time_ms = int((time.time() - retrieval_start) * 1000)
                contexts = retrieval_result['contexts']

                logger.info(f"Retrieved {len(contexts)} contexts in {retrieval_time_ms}ms")

                # Step 2: Run RAGAS evaluation
                logger.info(f"Running RAGAS evaluation for question {question_num}")
                eval_start = time.time()

                ragas_scores = ragas_evaluator.evaluate_single(
                    question=question.question,
                    contexts=contexts,
                    expected_context=question.expected_context
                )

                eval_time_ms = int((time.time() - eval_start) * 1000)

                logger.info(f"RAGAS evaluation completed in {eval_time_ms}ms")

                # Step 3: Save result
                result = EvaluationResult(
                    run_id=run_id,
                    question_id=question.question_id,
                    question=question.question,
                    expected_context=question.expected_context,
                    retrieved_contexts=contexts,
                    context_precision=ragas_scores['context_precision'],
                    context_recall=ragas_scores['context_recall'],
                    context_relevancy=ragas_scores['context_relevancy'],
                    result_metadata={
                        'retrieval_time_ms': retrieval_time_ms,
                        'evaluation_time_ms': eval_time_ms,
                        'total_time_ms': retrieval_time_ms + eval_time_ms,
                        'cache_hit': retrieval_result.get('cached', False),
                        'top_k': top_k
                    }
                )
                db.add(result)

                # Update run counts
                run.successful_questions += 1
                db.commit()

                logger.info(f"Successfully completed question {question_num}/{total_questions}")

            except RetrievalServiceError as e:
                logger.error(f"Retrieval failed for question {question_num}: {e}")

                # Save failed result
                result = EvaluationResult(
                    run_id=run_id,
                    question_id=question.question_id,
                    question=question.question,
                    expected_context=question.expected_context,
                    retrieved_contexts=[],
                    result_metadata={'error_type': 'retrieval_error', 'error_message': f"Retrieval service error: {str(e)}"}
                )
                db.add(result)
                run.failed_questions += 1
                db.commit()

            except Exception as e:
                logger.error(f"Evaluation failed for question {question_num}: {e}", exc_info=True)

                # Save failed result but preserve retrieved contexts for debugging
                result = EvaluationResult(
                    run_id=run_id,
                    question_id=question.question_id,
                    question=question.question,
                    expected_context=question.expected_context,
                    retrieved_contexts=contexts,  # Preserve contexts even on evaluation failure
                    result_metadata={
                        'error_type': 'evaluation_error',
                        'error_message': f"Evaluation error: {str(e)}",
                        'retrieval_time_ms': retrieval_time_ms if retrieval_time_ms > 0 else None,
                        'contexts_retrieved': len(contexts)
                    }
                )
                db.add(result)
                run.failed_questions += 1
                db.commit()

        # Calculate statistics
        logger.info("Calculating aggregate statistics...")
        update_progress(redis_conn, job, run, 90, 'Calculating statistics...')
        db.commit()

        average_scores = StatisticsService.calculate_average_scores(db, run_id)
        statistics = StatisticsService.calculate_run_statistics(db, run_id)

        # Update run with final statistics
        run.average_scores = average_scores
        run.statistics = statistics
        run.processing_time_ms = int((time.time() - start_time) * 1000)

        # Mark job as completed
        job.status = 'completed'
        job.completed_at = datetime.now(timezone.utc)
        update_progress(redis_conn, job, run, 100, 'Evaluation completed successfully')
        db.commit()

        logger.info(f"Evaluation completed: {run.successful_questions} succeeded, {run.failed_questions} failed")

        return {
            'status': 'completed',
            'total_questions': total_questions,
            'completed': run.successful_questions,
            'failed': run.failed_questions,
            'average_scores': average_scores,
            'processing_time_ms': run.processing_time_ms
        }

    except Exception as e:
        logger.error(f"Evaluation job failed: {e}", exc_info=True)

        # Mark job as failed if job was loaded
        try:
            if 'job' in locals() and job is not None:
                job.status = 'failed'
                job.completed_at = datetime.now(timezone.utc)
                job.error_message = str(e)
                if 'run' in locals() and run is not None:
                    update_progress(redis_conn, job, run, job.progress_percent, f'Error: {str(e)}')
                db.commit()
        except Exception as commit_error:
            logger.error(f"Failed to update job status: {commit_error}")

        raise

    finally:
        db.close()


def main() -> None:
    """Main entry point for the RQ worker."""
    settings = get_settings()

    logger.info(f"Starting RQ Worker for queue: {settings.rq_queue_name}")
    logger.info(f"Redis URL: {settings.redis_url}")
    logger.info(f"Worker timeout: {settings.rq_worker_timeout}s")

    # Connect to Redis
    try:
        redis_conn = Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=10,
            socket_keepalive=True,
            decode_responses=True
        )

        # Test connection
        redis_conn.ping()
        logger.info("Successfully connected to Redis")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        sys.exit(1)

    # Create queue
    queue = Queue(settings.rq_queue_name, connection=redis_conn)

    # Start worker with single job processing (sequential)
    worker = Worker(
        [queue],
        connection=redis_conn,
        name=f"{settings.service_name}-worker",
        # Process one job at a time (sequential)
        # This is critical to avoid overloading the retrieval service
    )

    logger.info("Worker started and listening for jobs...")
    worker.work(
        with_scheduler=False,
        logging_level='INFO'
    )


if __name__ == '__main__':
    main()
