"""Opening-hours and reservation time-slot logic for Savanna, Delémont.

Weekday convention: Python date.weekday() → Monday=0 … Sunday=6.

    Monday    11:00–23:00
    Tuesday   Closed
    Wednesday 11:00–23:00
    Thursday  11:00–23:00
    Friday    10:30–01:30 (closes after midnight)
    Saturday  10:30–01:30 (closes after midnight)
    Sunday    10:00–23:00
"""
from __future__ import annotations

# minutes from midnight; close <= open means it closes the next day
OPENING_HOURS: dict[int, tuple[int, int] | None] = {
    0: (11 * 60, 23 * 60),          # Monday
    1: None,                        # Tuesday — closed
    2: (11 * 60, 23 * 60),          # Wednesday
    3: (11 * 60, 23 * 60),          # Thursday
    4: (10 * 60 + 30, 1 * 60 + 30), # Friday   → 01:30 next day
    5: (10 * 60 + 30, 1 * 60 + 30), # Saturday → 01:30 next day
    6: (10 * 60, 23 * 60),          # Sunday
}

SLOT_STEP = 30      # minutes between slots
LAST_SEATING = 60   # last slot is this many minutes before close

TUESDAY = 1


def _to_minutes(hhmm: str) -> int | None:
    try:
        h, m = hhmm.split(":")
        h, m = int(h), int(m)
    except (ValueError, AttributeError):
        return None
    if not (0 <= h <= 23 and 0 <= m <= 59):
        return None
    return h * 60 + m


def is_closed(weekday: int) -> bool:
    return OPENING_HOURS.get(weekday) is None


def valid_slots(weekday: int) -> list[str]:
    """Return the list of bookable HH:MM slots for a weekday."""
    hours = OPENING_HOURS.get(weekday)
    if hours is None:
        return []
    open_m, close_m = hours
    if close_m <= open_m:
        close_m += 24 * 60  # wrap past midnight
    last = close_m - LAST_SEATING
    slots = []
    t = open_m
    while t <= last:
        slots.append(f"{(t // 60) % 24:02d}:{t % 60:02d}")
        t += SLOT_STEP
    return slots


def is_valid_time(weekday: int, hhmm: str) -> bool:
    """True if hhmm is a bookable slot on the given weekday."""
    if _to_minutes(hhmm) is None:
        return False
    return hhmm in valid_slots(weekday)
