"""Pydantic request models with server-side validation.

All error messages are in French — they surface directly in the UI.
"""
from __future__ import annotations

from datetime import date as date_type, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from .hours import TUESDAY, is_closed, is_valid_time

MAX_PARTY_SIZE = 8
MAX_DAYS_AHEAD = 60


class ReservationRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    phone: str = Field(..., min_length=5, max_length=40)
    date: date_type
    time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    guests: int = Field(..., ge=1)
    message: str = Field(default="", max_length=1000)

    # Language the customer used on the site — picks the confirmation email template.
    lang: Literal["fr", "en", "de", "it"] = "fr"

    # Honeypot — must stay empty
    website: str = Field(default="", max_length=0)

    @field_validator("name", "phone", "message")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("guests")
    @classmethod
    def _party_size(cls, v: int) -> int:
        if v > MAX_PARTY_SIZE:
            raise ValueError(
                "Pour les groupes de plus de 8 personnes, appelez-nous au 032 422 73 10."
            )
        return v

    @field_validator("date")
    @classmethod
    def _date_range(cls, v: date_type) -> date_type:
        today = datetime.now().date()
        if v < today:
            raise ValueError("La date est déjà passée. Choisissez une date à venir.")
        if v > today + timedelta(days=MAX_DAYS_AHEAD):
            raise ValueError(
                "Les réservations sont possibles jusqu'à 60 jours à l'avance."
            )
        return v

    @model_validator(mode="after")
    def _check_open_and_slot(self) -> "ReservationRequest":
        weekday = self.date.weekday()
        if weekday == TUESDAY or is_closed(weekday):
            raise ValueError("Nous sommes fermés le mardi. Choisissez un autre jour.")
        if not is_valid_time(weekday, self.time):
            raise ValueError(
                "Cet horaire n'est pas disponible ce jour-là. Choisissez un créneau proposé."
            )
        return self


class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    message: str = Field(..., min_length=1, max_length=2000)
    website: str = Field(default="", max_length=0)  # honeypot

    @field_validator("name", "message")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()
