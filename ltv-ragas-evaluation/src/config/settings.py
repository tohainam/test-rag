"""
Application configuration using Pydantic Settings.
Environment-based configuration for development and production.
"""

from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Flask Configuration
    flask_env: Literal["development", "production"] = "development"
    port: int = 50059

    # Database Configuration
    database_url: str = "mysql+pymysql://root:root@localhost:3306/ltv_assistant"

    # Redis Configuration
    redis_url: str = "redis://localhost:6379/0"

    # MinIO Configuration
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_secure: bool = False
    minio_bucket_evaluation: str = "evaluation"
    minio_presigned_url_expiry_hours: int = 1

    # Retrieval Service Configuration
    retrieval_service_url: str = "http://localhost:50056"

    # Worker Configuration
    rq_queue_name: str = "ragas-queue"
    rq_worker_timeout: int = 7200  # 2 hours
    rq_job_timeout: int = 7200  # 2 hours (timeout for individual jobs)
    rq_max_retries: int = 3

    # Logging
    log_level: str = "INFO"
    service_name: str = "ltv-ragas-evaluation"

    # RAGAS Configuration
    ragas_metrics: str = "context_precision,context_recall,context_relevancy"

    # LLM Configuration for Question Generation and RAGAS Evaluation
    google_api_key: str = ""  # Google API key for Gemini
    google_chat_model: str = "gemini-1.5-flash"  # More stable than gemini-2.5-flash-lite for RAGAS
    ollama_base_url: str = "http://ollama:11434"  # Ollama base URL
    ollama_chat_model: str = "qwen2.5:7b"  # 4.7GB - sequential evaluation prevents OOM, faster than gemma3

    @property
    def is_development(self) -> bool:
        """Check if running in development mode."""
        return self.flask_env == "development"

    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.flask_env == "production"


# Global settings instance
_settings: Settings | None = None


def get_settings() -> Settings:
    """Get the global settings instance (singleton pattern)."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
