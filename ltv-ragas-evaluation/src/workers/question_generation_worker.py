"""
RQ Worker for processing question generation jobs.
Sequential file processing to avoid overloading LLM services.
"""

import time
import uuid
from datetime import datetime, timezone
from redis import Redis
from sqlalchemy import select
from typing import Dict, List

from src.config.settings import get_settings
from src.utils.logger import logger
from src.models.base import get_db_session
from src.models.generation_job import QuestionGenerationJob, GenerationStatus
from src.models.dataset import EvaluationDataset
from src.models.file import EvaluationFile
from src.models.dataset_file import DatasetFile
from src.models.question import DatasetQuestion
from src.services.minio_service import get_minio_service
from src.services.file_content_extractor import FileContentExtractor
from src.services.llm_question_generator import LLMQuestionGenerator

settings = get_settings()


def update_progress(
    redis_conn: Redis,
    db_job: QuestionGenerationJob,
    progress_percent: float,
    current_file: str | None
) -> None:
    """
    Update progress in both Redis and database.

    Args:
        redis_conn: Redis connection
        db_job: Generation job database object
        progress_percent: Progress percentage (0-100)
        current_file: Current file being processed
    """
    # Update Redis (for fast polling)
    cache_key = f"gen_progress:{db_job.job_id}"
    redis_conn.hset(cache_key, mapping={
        'progress_percent': progress_percent,
        'current_file': current_file or '',
        'updated_at': datetime.now(timezone.utc).isoformat()
    })
    redis_conn.expire(cache_key, 3600)  # 1 hour TTL

    # Update database (for persistence)
    db_job.progress_percent = progress_percent
    db_job.current_file = current_file


def run_question_generation(
    job_id: str,
    dataset_id: str,
    file_ids: List[str] | None = None
) -> Dict:
    """
    Generate questions from files for a dataset.

    Files are processed ONE AT A TIME to avoid overloading LLM services.
    Continues processing even if individual files fail (partial success).

    Args:
        job_id: Generation job ID
        dataset_id: Dataset ID to generate questions for
        file_ids: Optional list of specific file IDs to process. If None, process all linked files.

    Returns:
        Dict with generation results summary
    """
    db = get_db_session()
    redis_conn = Redis.from_url(settings.redis_url, decode_responses=True)

    # Initialize services
    minio_service = get_minio_service()
    content_extractor = FileContentExtractor(minio_service)
    question_generator = LLMQuestionGenerator()

    start_time = time.time()

    try:
        logger.info(f"Starting question generation for job {job_id}, dataset {dataset_id}")

        # Get job
        job = db.execute(
            select(QuestionGenerationJob).where(QuestionGenerationJob.job_id == job_id)
        ).scalar_one()

        # Get dataset
        dataset = db.execute(
            select(EvaluationDataset).where(EvaluationDataset.dataset_id == dataset_id)
        ).scalar_one()

        # Update job status to processing
        job.status = GenerationStatus.processing
        job.started_at = datetime.now(timezone.utc)
        update_progress(redis_conn, job, 5.0, 'Loading files...')
        db.commit()

        # Get files to process
        if file_ids:
            # Process specific files
            files_query = select(EvaluationFile).where(EvaluationFile.file_id.in_(file_ids))
        else:
            # Process all files linked to dataset
            files_query = (
                select(EvaluationFile)
                .join(DatasetFile, DatasetFile.file_id == EvaluationFile.file_id)
                .where(DatasetFile.dataset_id == dataset_id)
            )

        files = db.execute(files_query).scalars().all()

        if not files:
            logger.warning(f"No files found for dataset {dataset_id}")
            job.status = GenerationStatus.completed
            job.completed_at = datetime.now(timezone.utc)
            job.processing_time_ms = int((time.time() - start_time) * 1000)
            db.commit()
            return {
                "status": "completed",
                "total_files": 0,
                "processed_files": 0,
                "failed_files": 0,
                "total_questions_generated": 0
            }

        job.total_files = len(files)
        db.commit()

        logger.info(f"Processing {len(files)} files for dataset {dataset_id}")

        # Track results
        file_results = {}
        error_messages = []
        total_questions_generated = 0
        processed_files = 0
        failed_files = 0

        # Get current max order_index for the dataset
        max_order_result = db.execute(
            select(DatasetQuestion.order_index)
            .where(DatasetQuestion.dataset_id == dataset_id)
            .order_by(DatasetQuestion.order_index.desc())
            .limit(1)
        ).scalar()

        current_order_index = (max_order_result + 1) if max_order_result is not None else 0

        # Process each file sequentially
        for idx, file in enumerate(files, 1):
            try:
                logger.info(f"Processing file {idx}/{len(files)}: {file.filename}")

                # Update progress
                progress = 5.0 + (idx / len(files)) * 90.0  # 5% to 95%
                update_progress(redis_conn, job, progress, file.filename)
                db.commit()

                # Step 1: Extract content from file
                logger.info(f"Extracting content from {file.filename}")
                content, extraction_metadata = content_extractor.extract_content(
                    filename=file.filename,
                    content_type=file.content_type,
                    minio_bucket=file.minio_bucket,
                    minio_object_name=file.minio_object_name
                )

                # Step 2: Estimate target question count
                target_count = content_extractor.estimate_question_count(content)
                logger.info(f"Target question count for {file.filename}: {target_count}")

                # Step 3: Generate questions using LLM
                logger.info(f"Generating questions from {file.filename}")
                generated_questions = question_generator.generate_questions(
                    content=content,
                    target_count=target_count,
                    metadata=extraction_metadata
                )

                # Step 4: Add questions to database
                questions_added = 0
                for q_data in generated_questions:
                    question = DatasetQuestion(
                        question_id=str(uuid.uuid4()),
                        dataset_id=dataset_id,
                        question=q_data["question"],
                        expected_context=q_data["expected_context"],
                        order_index=current_order_index,
                        question_metadata={
                            **q_data.get("metadata", {}),
                            "source_file_id": file.file_id,
                            "generated_by_job_id": job_id,
                        }
                    )
                    db.add(question)
                    current_order_index += 1
                    questions_added += 1

                db.flush()

                # Update counters
                processed_files += 1
                total_questions_generated += questions_added

                # Record success
                file_results[file.file_id] = {
                    "status": "success",
                    "filename": file.filename,
                    "questions_count": questions_added,
                    "word_count": extraction_metadata.get("word_count"),
                }

                logger.info(
                    f"Successfully generated {questions_added} questions from {file.filename}"
                )

            except Exception as file_error:
                # Log error but continue with other files (partial success)
                error_msg = f"Failed to process {file.filename}: {str(file_error)}"
                logger.error(error_msg, exc_info=True)

                failed_files += 1
                error_messages.append(error_msg)

                file_results[file.file_id] = {
                    "status": "failed",
                    "filename": file.filename,
                    "error": str(file_error)
                }

        # Update dataset total_questions count
        dataset.total_questions = db.execute(
            select(DatasetQuestion.question_id)
            .where(DatasetQuestion.dataset_id == dataset_id)
        ).all().__len__()

        # Update job with final results
        job.processed_files = processed_files
        job.failed_files = failed_files
        job.total_questions_generated = total_questions_generated
        job.file_results = file_results
        job.error_messages = error_messages if error_messages else None
        job.completed_at = datetime.now(timezone.utc)
        job.processing_time_ms = int((time.time() - start_time) * 1000)

        # Set final status
        if failed_files == len(files):
            # All files failed
            job.status = GenerationStatus.failed
            update_progress(redis_conn, job, 100.0, 'All files failed')
        elif failed_files > 0:
            # Partial success
            job.status = GenerationStatus.completed
            update_progress(
                redis_conn,
                job,
                100.0,
                f'Completed with {failed_files} failures'
            )
        else:
            # All successful
            job.status = GenerationStatus.completed
            update_progress(redis_conn, job, 100.0, 'Completed successfully')

        db.commit()

        logger.info(
            f"Question generation completed for job {job_id}: "
            f"{processed_files}/{len(files)} files processed, "
            f"{total_questions_generated} questions generated, "
            f"{failed_files} failures"
        )

        return {
            "status": job.status.value,
            "total_files": len(files),
            "processed_files": processed_files,
            "failed_files": failed_files,
            "total_questions_generated": total_questions_generated,
            "processing_time_ms": job.processing_time_ms,
            "file_results": file_results,
            "error_messages": error_messages,
        }

    except Exception as e:
        # Fatal error - mark job as failed
        logger.error(f"Fatal error in question generation job {job_id}: {str(e)}", exc_info=True)

        try:
            job.status = GenerationStatus.failed
            job.error_messages = [f"Fatal error: {str(e)}"]
            job.completed_at = datetime.now(timezone.utc)
            job.processing_time_ms = int((time.time() - start_time) * 1000)
            update_progress(redis_conn, job, 100.0, f'Failed: {str(e)}')
            db.commit()
        except Exception as commit_error:
            logger.error(f"Failed to update job status: {str(commit_error)}")

        raise

    finally:
        db.close()
