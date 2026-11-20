from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False
    )

    # Application
    app_name: str = "SANAA AI"
    app_env: str = "development"
    debug: bool = False
    api_prefix: str = "/api"
    cors_origins: str = ""
    timezone: str = "Africa/Cairo"
    log_level: str = "INFO"
    log_dir: str = "logs"

    # Security
    internal_api_key: str = ""
    jwt_secret: str = "CHANGE_ME_TO_A_LONG_RANDOM_STRING"
    jwt_expire_minutes: int = 120

    # Read-only database user
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "furniture_erp"
    db_user: str = "ai_readonly"
    db_password: str = ""
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_statement_timeout_ms: int = 15000

    # App database user (writes to schema sanaa_ai)
    db_app_user: str = "ai_app"
    db_app_password: str = ""

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_think: bool = False
    ollama_timeout_seconds: float = 180
    ollama_temperature: float = 0.1
    ollama_num_ctx: int = 8192
    ollama_num_predict: int = 900
    ollama_keep_alive: str = "30m"

    # Analysis
    max_sql_rows: int = Field(100, ge=1, le=5000)
    max_question_length: int = 2000
    max_sql_attempts: int = Field(3, ge=1, le=5)
    rag_use_embeddings: bool = False

    # Voice
    whisper_model: str = "small"
    whisper_device: str = "auto"
    whisper_compute_type: str = "auto"
    tts_voice_ar: str = "ar-EG-SalmaNeural"
    tts_voice_en: str = "en-US-AriaNeural"

    # Recommendations
    monthly_report_enabled: bool = True
    monthly_report_day: int = 1
    monthly_report_hour: int = 7
    forecast_horizon_months: int = 3

    # Customer services
    default_delivery_city: str = "Cairo"
    quotation_valid_days: int = 14
    design_output_dir: str = "generated_designs"
    public_base_url: str = "http://localhost:8000"

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def _url(self, user: str, password: str) -> str:
        return (
            f"postgresql+asyncpg://{quote_plus(user)}:{quote_plus(password)}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def database_url(self) -> str:
        return self._url(self.db_user, self.db_password)

    @property
    def app_database_url(self) -> str:
        return self._url(self.db_app_user, self.db_app_password)

    @property
    def app_db_configured(self) -> bool:
        return bool(self.db_app_password)

    def path(self, value: str) -> Path:
        """Resolve a configured path relative to the project root."""
        candidate = Path(value)
        return candidate if candidate.is_absolute() else BASE_DIR / candidate


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
