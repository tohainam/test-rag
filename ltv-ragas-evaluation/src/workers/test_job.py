"""
Test job for verifying RQ worker functionality.
This is a simple job used during Phase 1 testing.
"""

import time
from src.utils.logger import logger


def test_job(message: str = "Hello from RQ worker!") -> dict:
    """
    Simple test job that logs a message and returns a result.

    Args:
        message: Message to log

    Returns:
        Dictionary with job result
    """
    logger.info(f"Test job started: {message}")

    # Simulate some work
    time.sleep(2)

    result = {
        'status': 'success',
        'message': message,
        'timestamp': time.time()
    }

    logger.info(f"Test job completed: {result}")

    return result
