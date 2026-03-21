import os
import pytest
from grexis.lib.config import Settings


def test_settings_loads_defaults():
    settings = Settings(
        POSTGRES_URL="postgresql+asyncpg://user:pass@localhost/db",
        QDRANT_URL="http://localhost:6333",
        REDIS_URL="redis://localhost:6379",
        GREXIS_API_SECRET="test-secret",
    )
    assert settings.EMBEDDING_PROVIDER == "local"
    assert settings.SCHEDULED_AGENT_DAILY_TOKEN_BUDGET == 150000
    assert settings.TRUST_DECAY_DEFAULT_HALF_LIFE_DAYS == 30
    assert settings.SECRET_SCAN_ENABLED is True
    assert settings.SANDBOX_MODE is False


def test_settings_requires_api_secret(monkeypatch, tmp_path):
    # Isolate from .env file by pointing env_file to a nonexistent path
    monkeypatch.delenv("GREXIS_API_SECRET", raising=False)
    with pytest.raises(Exception):
        Settings(
            POSTGRES_URL="postgresql+asyncpg://user:pass@localhost/db",
            QDRANT_URL="http://localhost:6333",
            REDIS_URL="redis://localhost:6379",
            _env_file=str(tmp_path / "nonexistent.env"),
        )
