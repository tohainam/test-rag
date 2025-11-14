"""
SQLAlchemy base models and database configuration.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import create_engine, MetaData
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from sqlalchemy.pool import QueuePool

from src.config.settings import get_settings


def generate_uuid() -> str:
    """Generate a UUID string."""
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Get current UTC datetime."""
    return datetime.now(timezone.utc)


# Create metadata with naming convention
_metadata = MetaData(
    naming_convention={
        "ix": "ix_%(column_0_label)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s"
    }
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    metadata = _metadata


# Database engine and session
_engine: Any = None
_session_factory: Any = None


def get_engine() -> Any:
    """Get or create the database engine."""
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_engine(
            settings.database_url,
            poolclass=QueuePool,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            echo=settings.is_development,
        )
    return _engine


def get_session_factory() -> sessionmaker:
    """Get or create the session factory."""
    global _session_factory
    if _session_factory is None:
        engine = get_engine()
        _session_factory = sessionmaker(
            bind=engine,
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_factory


def get_db_session() -> Session:
    """Get a new database session."""
    factory = get_session_factory()
    return factory()
