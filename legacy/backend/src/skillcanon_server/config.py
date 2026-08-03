from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://skillcanon:skillcanon@localhost:5432/skillcanon"

    @model_validator(mode="after")
    def _normalize_database_url(self) -> "Settings":
        """Rewrite DATABASE_URL to use the asyncpg driver."""
        for prefix in ("postgresql://", "postgres://"):
            if self.database_url.startswith(prefix):
                self.database_url = (
                    "postgresql+asyncpg://" + self.database_url[len(prefix):]
                )
                break
        return self

    auth_token: str = "dev-token-123"
    jwt_secret: str = "dev-jwt-secret-change-me-in-production"
    jwt_expiry_hours: int = 24
    invitation_expiry_hours: int = 72
    log_level: str = "info"
    allowed_hosts: str = ""  # comma-separated list of allowed MCP Host headers (empty = local only)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
