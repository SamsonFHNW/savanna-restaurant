"""Environment-driven configuration for the Savanna backend.

Values come from environment variables. For local development, a `.env` file
(see `.env.example`) is loaded automatically via python-dotenv; in production
(Render) the variables are set in the dashboard and no `.env` file is present.
"""
import os

from dotenv import load_dotenv

# Load a local .env if present. In production the real environment wins, so this
# is a no-op there (load_dotenv does not override already-set variables).
load_dotenv()


def _split_csv(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


class Settings:
    # ─── Runtime ───
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # ─── Recipients ───
    OWNER_EMAIL: str = os.getenv("OWNER_EMAIL", "")

    # ─── Email via Resend ───
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    FROM_EMAIL: str = os.getenv("FROM_EMAIL", "reservations@savanna-restaurant.ch")

    # ─── CORS ───
    # Comma-separated list of allowed origins. Defaults to local dev.
    CORS_ORIGINS: list[str] = _split_csv(os.getenv("CORS_ORIGINS", "http://localhost:3000"))

    # ─── Rate limiting ───
    RATE_LIMIT_MAX: int = int(os.getenv("RATE_LIMIT_MAX", "5"))
    RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "3600"))  # 1h

    @property
    def email_enabled(self) -> bool:
        return bool(self.RESEND_API_KEY)


settings = Settings()
