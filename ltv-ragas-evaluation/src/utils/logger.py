"""
Structured JSON logging utility for the RAGAS Evaluation service.
"""

import logging
import sys
from typing import Any
from pythonjsonlogger import jsonlogger

from src.config.settings import get_settings


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """Custom JSON formatter with additional fields."""

    def add_fields(self, log_record: dict[str, Any], record: logging.LogRecord, message_dict: dict[str, Any]) -> None:
        """Add custom fields to log record."""
        super().add_fields(log_record, record, message_dict)

        # Add service name
        settings = get_settings()
        log_record['service'] = settings.service_name

        # Add level name
        log_record['level'] = record.levelname

        # Add timestamp
        log_record['timestamp'] = self.formatTime(record, self.datefmt)


def setup_logger(name: str = "ltv-ragas-evaluation") -> logging.Logger:
    """
    Setup and configure JSON structured logger.

    Args:
        name: Logger name

    Returns:
        Configured logger instance
    """
    settings = get_settings()

    # Create logger
    logger = logging.getLogger(name)

    # Set log level from settings
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logger.setLevel(log_level)

    # Remove existing handlers to avoid duplicates
    logger.handlers = []

    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)

    # Create JSON formatter
    formatter = CustomJsonFormatter(
        '%(timestamp)s %(level)s %(service)s %(name)s %(message)s',
        datefmt='%Y-%m-%dT%H:%M:%S'
    )

    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # Prevent propagation to root logger
    logger.propagate = False

    return logger


# Global logger instance
logger = setup_logger()
