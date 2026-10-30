"""Static configuration for the pilot: the decision window, auction cutoffs and data location."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

# Purchase decisions made in January 2026 cover delivery days 2 Jan .. 1 Feb 2026.
DECISION_FIRST = date(2026, 1, 1)
DECISION_LAST = date(2026, 1, 31)
DELIVERY_FIRST = DECISION_FIRST + timedelta(days=1)
DELIVERY_LAST = DECISION_LAST + timedelta(days=1)

# Largest lead time (hours) offered by the fixed-horizon analysis.
MAX_HORIZON_H = 48

# Lead-time bucket width (hours) used to calibrate the uncertainty band.
BAND_BUCKET_H = 6


@dataclass(frozen=True)
class Cutoff:
    key: str
    label: str
    local_time: time


# Gate closure on D-1 (UK local time) of the two GB day-ahead auctions.
CUTOFFS: dict[str, Cutoff] = {
    "epex": Cutoff("epex", "EPEX SPOT GB hourly auction", time(9, 20)),
    "n2ex": Cutoff("n2ex", "Nord Pool N2EX GB auction", time(9, 50)),
}
DEFAULT_CUTOFF = "epex"

DATA_PATH = Path(
    os.environ.get(
        "WIND_DATA_PATH",
        Path(__file__).resolve().parent.parent / "data" / "elexon_wind_2026-01.json.gz",
    )
)

# Built React bundle; served by FastAPI when present (Docker image).
STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parent.parent / "static"))
