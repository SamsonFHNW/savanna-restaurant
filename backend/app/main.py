"""Savanna — reservation & contact backend.

Endpoints:
  GET  /api/health          — liveness + config sanity
  GET  /api/slots?date=…    — bookable time slots for a date (feeds the form)
  POST /api/reservations    — validate + email the owner & customer
  POST /api/contact         — validate + email the owner

No database: reservations live in the owner's inbox.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date as date_type, datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .config import settings
from .hours import valid_slots, is_closed, TUESDAY
from .models import ReservationRequest, ContactRequest
from .ratelimit import RateLimiter
from . import notifications as notify

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("savanna")

app = FastAPI(title="Savanna Reservations", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

limiter = RateLimiter(settings.RATE_LIMIT_MAX, settings.RATE_LIMIT_WINDOW_SECONDS)


def client_ip(request: Request) -> str:
    # Railway/Render sit behind a proxy; trust X-Forwarded-For's first hop.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _first_error_message(exc: ValidationError) -> str:
    """Pull a human, French message out of a pydantic error."""
    for err in exc.errors():
        loc = err.get("loc", ())
        if "website" in loc:
            # Honeypot triggered — don't reveal why.
            return "Envoi refusé."
        msg = err.get("msg", "")
        # Strip pydantic's "Value error, " prefix if present.
        return msg.replace("Value error, ", "") or "Données invalides."
    return "Données invalides."


def ok() -> JSONResponse:
    return JSONResponse({"status": "ok"})


def error(message: str, code: int = 400) -> JSONResponse:
    return JSONResponse({"status": "error", "message": message}, status_code=code)


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "email_configured": settings.email_enabled,
        "time": datetime.now().isoformat(timespec="seconds"),
    }


@app.get("/api/slots")
async def slots(date: str) -> JSONResponse:
    """Return bookable slots for an ISO date (YYYY-MM-DD)."""
    try:
        d = date_type.fromisoformat(date)
    except ValueError:
        return error("Date invalide.", 422)
    weekday = d.weekday()
    return JSONResponse(
        {
            "status": "ok",
            "closed": weekday == TUESDAY or is_closed(weekday),
            "slots": valid_slots(weekday),
        }
    )


@app.post("/api/reservations")
async def create_reservation(request: Request) -> JSONResponse:
    if not limiter.allow(client_ip(request)):
        return error("Trop de demandes. Réessayez dans un moment.", 429)

    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        return error("Requête invalide.", 400)

    try:
        res = ReservationRequest.model_validate(payload)
    except ValidationError as exc:
        return error(_first_error_message(exc), 422)

    # Fire both emails concurrently; each is failure-tolerant.
    await asyncio.gather(
        notify.notify_owner_email(res),
        notify.notify_customer_email(res),
    )

    logger.info("Reservation: %s · %s · %s at %s · %s pers.",
                res.name, res.phone, res.date, res.time, res.guests)
    return ok()


@app.post("/api/contact")
async def contact(request: Request) -> JSONResponse:
    if not limiter.allow(client_ip(request)):
        return error("Trop de demandes. Réessayez dans un moment.", 429)

    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        return error("Requête invalide.", 400)

    try:
        msg = ContactRequest.model_validate(payload)
    except ValidationError as exc:
        return error(_first_error_message(exc), 422)

    await notify.notify_contact_email(msg)
    logger.info("Contact message from %s <%s>", msg.name, msg.email)
    return ok()
