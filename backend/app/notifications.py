"""Notification senders: owner email, customer email.

All senders are async and defensive: a failure in one channel is logged and
does not raise, so a single reservation still succeeds if e.g. the customer
confirmation email fails. The owner email is always French; the customer email
uses the language the customer selected on the site (res.lang).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from pathlib import Path

import resend

from .config import settings
from .models import ReservationRequest, ContactRequest

logger = logging.getLogger("savanna.notifications")

TEMPLATES_DIR = Path(__file__).parent / "templates"

# Localized weekday / month names for the date shown in customer emails.
# NOTE: DE/IT drafted for review by a native speaker.
WEEKDAYS = {
    "fr": ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
    "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    "de": ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
    "it": ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
}
MONTHS = {
    "fr": ["janvier", "février", "mars", "avril", "mai", "juin",
           "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    "en": ["January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"],
    "de": ["Januar", "Februar", "März", "April", "Mai", "Juni",
           "Juli", "August", "September", "Oktober", "November", "Dezember"],
    "it": ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
           "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
}

CUSTOMER_SUBJECT = {
    "fr": "Votre demande de réservation — Savanna",
    "en": "Your reservation request — Savanna",
    "de": "Ihre Reservierungsanfrage — Savanna",
    "it": "La tua richiesta di prenotazione — Savanna",
}


def format_date(res: ReservationRequest, lang: str = "fr") -> str:
    d = res.date
    wd = WEEKDAYS.get(lang, WEEKDAYS["fr"])[d.weekday()]
    mo = MONTHS.get(lang, MONTHS["fr"])[d.month - 1]
    return f"{wd} {d.day} {mo} {d.year}"


def format_fr_date(res: ReservationRequest) -> str:
    return format_date(res, "fr")


# ─────────────────────────────────────────────────────────────
# Email transport (Resend)
# ─────────────────────────────────────────────────────────────
def mask_email(addr: str) -> str:
    """Redact an address for logs — keep the first char + domain, hide the rest."""
    if not addr or "@" not in addr:
        return "—"
    local, _, domain = addr.partition("@")
    head = local[0] if local else ""
    return f"{head}***@{domain}"


def _send_via_resend(to: str, subject: str, body_text: str) -> str | None:
    """Synchronous Resend SDK call. Returns the message id, or raises on failure."""
    resend.api_key = settings.RESEND_API_KEY
    result = resend.Emails.send(
        {
            "from": settings.FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "text": body_text,
        }
    )
    # SDK returns a dict-like {"id": "..."} on success.
    if isinstance(result, dict):
        return result.get("id")
    return getattr(result, "id", None)


async def _send_email(to: str, subject: str, body_text: str) -> None:
    """Send one email via Resend and log the outcome. Raises on send failure."""
    if not to:
        return

    if not settings.RESEND_API_KEY:
        logger.warning(
            "Email not configured (RESEND_API_KEY unset) — skipped send to %s (subject=%r)",
            mask_email(to), subject,
        )
        return

    # The Resend SDK is synchronous; run it off the event loop.
    message_id = await asyncio.to_thread(_send_via_resend, to, subject, body_text)
    logger.info("Email sent to %s (subject=%r, id=%s)", mask_email(to), subject, message_id)


# ─────────────────────────────────────────────────────────────
# Message builders
# ─────────────────────────────────────────────────────────────
def _owner_email_body(res: ReservationRequest) -> str:
    stamp = datetime.now().strftime("%d.%m.%Y %H:%M")
    return (
        "Nouvelle demande de réservation — Savanna\n"
        "==========================================\n\n"
        f"Nom          : {res.name}\n"
        f"Personnes    : {res.guests}\n"
        f"Date         : {format_fr_date(res)}\n"
        f"Heure        : {res.time}\n"
        f"Téléphone    : {res.phone}\n"
        f"Email        : {res.email}\n"
        f"Message      : {res.message or '—'}\n\n"
        f"Reçu le {stamp}\n\n"
        "→ À confirmer par téléphone dans les 24h."
    )


def _customer_email_body(res: ReservationRequest) -> str:
    """Render the confirmation email in the customer's language.

    Falls back to the French template if the localized one is missing.
    """
    lang = res.lang if res.lang in CUSTOMER_SUBJECT else "fr"
    path = TEMPLATES_DIR / f"customer_confirmation_{lang}.txt"
    if not path.exists():
        path = TEMPLATES_DIR / "customer_confirmation_fr.txt"
        lang = "fr"
    template = path.read_text(encoding="utf-8")
    return template.format(
        name=res.name,
        date=format_date(res, lang),
        time=res.time,
        guests=res.guests,
    )


# ─────────────────────────────────────────────────────────────
# Public entry points (each wraps failures so gather() never fails hard)
# ─────────────────────────────────────────────────────────────
async def notify_owner_email(res: ReservationRequest) -> None:
    try:
        await _send_email(settings.OWNER_EMAIL, "Nouvelle réservation — Savanna", _owner_email_body(res))
    except Exception:  # noqa: BLE001
        logger.exception("Owner reservation email failed (to=%s)", mask_email(settings.OWNER_EMAIL))


async def notify_customer_email(res: ReservationRequest) -> None:
    try:
        subject = CUSTOMER_SUBJECT.get(res.lang, CUSTOMER_SUBJECT["fr"])
        await _send_email(res.email, subject, _customer_email_body(res))
    except Exception:  # noqa: BLE001
        logger.exception("Customer confirmation email failed (to=%s)", mask_email(res.email))


async def notify_contact_email(msg: ContactRequest) -> None:
    try:
        stamp = datetime.now().strftime("%d.%m.%Y %H:%M")
        body = (
            "Nouveau message — Savanna\n"
            "=========================\n\n"
            f"Nom     : {msg.name}\n"
            f"Email   : {msg.email}\n\n"
            f"Message :\n{msg.message}\n\n"
            f"Reçu le {stamp}"
        )
        await _send_email(settings.OWNER_EMAIL, "Nouveau message — Savanna", body)
    except Exception:  # noqa: BLE001
        logger.exception("Contact email failed (to=%s)", mask_email(settings.OWNER_EMAIL))
