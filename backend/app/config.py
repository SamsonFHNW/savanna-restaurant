"""Environment-driven configuration for the Savanna backend."""
import os


def _split_csv(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


class Settings:
    # ─── Recipients ───
    OWNER_EMAIL: str = os.getenv("OWNER_EMAIL", "")
    OWNER_WHATSAPP: str = os.getenv("OWNER_WHATSAPP", "")  # E.164, e.g. +41...

    # ─── Email: Resend (preferred) or SMTP ───
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "Savanna <reservations@savanna-restaurant.ch>")

    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_STARTTLS: bool = os.getenv("SMTP_STARTTLS", "true").lower() == "true"

    # ─── Twilio WhatsApp ───
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_WHATSAPP_FROM: str = os.getenv("TWILIO_WHATSAPP_FROM", "")  # e.g. whatsapp:+14155238886

    # ─── CORS ───
    # Comma-separated list of allowed origins. Defaults to production + local dev.
    ALLOWED_ORIGINS: list[str] = _split_csv(
        os.getenv(
            "ALLOWED_ORIGINS",
            "https://savanna-restaurant.ch,https://www.savanna-restaurant.ch,"
            "http://localhost:8000,http://localhost:5173,http://127.0.0.1:5500",
        )
    )

    # ─── Rate limiting ───
    RATE_LIMIT_MAX: int = int(os.getenv("RATE_LIMIT_MAX", "5"))
    RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "3600"))  # 1h

    @property
    def email_enabled(self) -> bool:
        return bool(self.RESEND_API_KEY or self.SMTP_HOST)

    @property
    def whatsapp_enabled(self) -> bool:
        return bool(self.TWILIO_ACCOUNT_SID and self.TWILIO_AUTH_TOKEN and self.TWILIO_WHATSAPP_FROM and self.OWNER_WHATSAPP)


settings = Settings()
