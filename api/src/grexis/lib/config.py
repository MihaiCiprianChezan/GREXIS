from typing import Literal
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Required
    POSTGRES_URL: str
    QDRANT_URL: str
    REDIS_URL: str
    GREXIS_API_SECRET: str

    # Embedding
    EMBEDDING_PROVIDER: Literal["local", "openai"] = "local"
    OPENAI_API_KEY: str = ""
    CUDA_VISIBLE_DEVICES: str | None = None

    # Scheduled agent
    SCHEDULED_AGENT_DAILY_TOKEN_BUDGET: int = 150000
    SCHEDULED_AGENT_MAX_ATTEMPTS_PER_PROBLEM: int = 3

    # Trust
    TRUST_DECAY_DEFAULT_HALF_LIFE_DAYS: int = 30
    CONSECUTIVE_FAILURE_THRESHOLD: int = 5
    CONFIDENCE_FLOOR_FEEDBACKS: int = 1

    # Secret scanning
    SECRET_SCAN_ENABLED: bool = True

    # Sandbox
    SANDBOX_MODE: bool = False

    # Logging
    LOG_LEVEL: str = "INFO"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings: Settings | None = None


def get_settings() -> Settings:
    global settings
    if settings is None:
        settings = Settings()  # type: ignore[call-arg]
    return settings
