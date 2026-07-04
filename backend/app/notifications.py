"""Notification senders: owner email, customer email, owner WhatsApp.

All senders are async and defensive: a failure in one channel is logged and
does not raise, so a single reservation still succeeds if e.g. WhatsApp is down.
Owner email + WhatsApp are always French; the customer email uses the language
the customer selected on the site (res.lang).
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

import httpx

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
# Email transport (Resend preferred, SMTP fallback)
# ─────────────────────────────────────────────────────────────
async def _send_email(to: str, subject: str, body_text: str) -> None:
    if not to:
        return

    if settings.RESEND_API_KEY:
        await _send_via_resend(to, subject, body_text)
    elif settings.SMTP_HOST:
        await _send_via_smtp(to, subject, body_text)
    else:
        logger.warning("Email not configured — would have sent to %s: %s", to, subject)


async def _send_via_resend(to: str, subject: str, body_text: str) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={
                "from": settings.EMAIL_FROM,
                "to": [to],
                "subject": subject,
                "text": body_text,
            },
        )
        resp.raise_for_status()


async def _send_via_smtp(to: str, subject: str, body_text: str) -> None:
    # Imported lazily so the dependency is optional when using Resend.
    import aiosmtplib
    from email.message import EmailMessage

    msg = EmailMessage()
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body_text)

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
        start_tls=settings.SMTP_STARTTLS,
    )


# ─────────────────────────────────────────────────────────────
# WhatsApp via Twilio
# ─────────────────────────────────────────────────────────────
async def _send_whatsapp(body: str) -> None:
    if not settings.whatsapp_enabled:
        logger.warning("WhatsApp not configured — would have sent: %s", body.replace("\n", " | "))
        return

    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json"
    to = settings.OWNER_WHATSAPP
    if not to.startswith("whatsapp:"):
        to = "whatsapp:" + to

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            data={"From": settings.TWILIO_WHATSAPP_FROM, "To": to, "Body": body},
            auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
        )
        resp.raise_for_status()


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


def _owner_whatsapp_body(res: ReservationRequest) -> str:
    return (
        "🍽 Nouvelle réservation — Savanna\n\n"
        f"Nom: {res.name}\n"
        f"Personnes: {res.guests}\n"
        f"Date: {format_fr_date(res)} à {res.time}\n"
        f"Tél: {res.phone}\n\n"
        "Détails complets par email."
    )


# ─────────────────────────────────────────────────────────────
# Public entry points (each wraps failures so gather() never fails hard)
# ─────────────────────────────────────────────────────────────
async def notify_owner_email(res: ReservationRequest) -> None:
    try:
        await _send_email(settings.OWNER_EMAIL, "Nouvelle réservation — Savanna", _owner_email_body(res))
    except Exception:  # noqa: BLE001
        logger.exception("Owner reservation email failed")


async def notify_customer_email(res: ReservationRequest) -> None:
    try:
        subject = CUSTOMER_SUBJECT.get(res.lang, CUSTOMER_SUBJECT["fr"])
        await _send_email(res.email, subject, _customer_email_body(res))
    except Exception:  # noqa: BLE001
        logger.exception("Customer confirmation email failed")


async def notify_owner_whatsapp(res: ReservationRequest) -> None:
    try:
        await _send_whatsapp(_owner_whatsapp_body(res))
    except Exception:  # noqa: BLE001
        logger.exception("Owner WhatsApp failed")


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
        logger.exception("Contact email failed")
