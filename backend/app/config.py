"""Application settings via pydantic BaseSettings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables / .env file."""

    # Database
    database_url: str = "postgresql+asyncpg://pixel:pixel@localhost:5432/pixel_agents"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Encryption key for API key storage (Fernet)
    encryption_key: str = ""

    # LLM Provider API Keys (optional -- users can provide their own via UI)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_api_key: str = ""
    gemini_api_key: str = ""

    # Tool API Keys
    tavily_api_key: str = ""

    # Default LLM settings
    llm_provider: str = "google"
    llm_model: str = "gemini-3.1-flash-lite-preview"

    # Agent limits
    max_agents_per_user: int = 5
    tool_timeout_sec: int = 120

    # CORS
    cors_origins: str = "http://localhost:5173"

    # App environment
    app_env: str = "development"

    model_config = {
        "env_file": ("../.env", ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def get_api_key(self, provider: str) -> str:
        """Get the API key for a given provider."""
        key_map = {
            "openai": self.openai_api_key,
            "anthropic": self.anthropic_api_key,
            "google": self.google_api_key or self.gemini_api_key,
            "gemini": self.gemini_api_key or self.google_api_key,
        }
        return key_map.get(provider, "")


settings = Settings()
