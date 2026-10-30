"""HTTP layer: validates inputs, delegates to `analysis`, and serves the built frontend if present."""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import analysis as an
from .config import (
    BAND_BUCKET_H,
    CUTOFFS,
    DECISION_FIRST,
    DECISION_LAST,
    DEFAULT_CUTOFF,
    DELIVERY_FIRST,
    DELIVERY_LAST,
    MAX_HORIZON_H,
    STATIC_DIR,
)
from .store import get_dataset

app = FastAPI(title="Wind Day-Ahead Desk API", version="1.0.0")
app.add_middleware(GZipMiddleware, minimum_size=1024)

CutoffKey = Literal["epex", "n2ex"]


def _delivery_range(start: date | None, end: date | None) -> list[date]:
    start, end = start or DELIVERY_FIRST, end or DELIVERY_LAST
    if not (DELIVERY_FIRST <= start <= end <= DELIVERY_LAST):
        raise HTTPException(422, f"Delivery dates must satisfy {DELIVERY_FIRST} <= start <= end <= {DELIVERY_LAST}.")
    return an.days(start, end)


@app.get("/api/health")
def health() -> dict:
    ds = get_dataset()
    return {"status": "ok", "actuals": len(ds.actuals), "forecast_targets": len(ds.forecasts)}


@app.get("/api/meta")
def meta() -> dict:
    ds = get_dataset()
    return {
        "decision_dates": {"first": DECISION_FIRST.isoformat(), "last": DECISION_LAST.isoformat()},
        "delivery_dates": {"first": DELIVERY_FIRST.isoformat(), "last": DELIVERY_LAST.isoformat()},
        "cutoffs": [
            {"key": c.key, "label": c.label, "local_time": c.local_time.strftime("%H:%M")} for c in CUTOFFS.values()
        ],
        "default_cutoff": DEFAULT_CUTOFF,
        "max_horizon_h": MAX_HORIZON_H,
        "band_bucket_h": BAND_BUCKET_H,
        "data_fetched_at": ds.fetched_at,
        "publish_times_utc": sorted({p.strftime("%H:%M") for p in ds.publish_times}),
    }


@app.get("/api/decision")
def decision(
    delivery_date: Annotated[date, Query(description="UK delivery day (D); decision is taken on D-1")],
    cutoff: CutoffKey = DEFAULT_CUTOFF,
) -> dict:
    _delivery_range(delivery_date, delivery_date)
    return _decision_cached(delivery_date, cutoff)


@lru_cache(maxsize=128)
def _decision_cached(delivery_date: date, cutoff: str) -> dict:
    calibration = an.days(DELIVERY_FIRST, DELIVERY_LAST)
    return an.decision_brief(get_dataset(), delivery_date, CUTOFFS[cutoff].local_time, calibration)


@app.get("/api/accuracy")
def accuracy(
    start: date | None = None,
    end: date | None = None,
    mode: Literal["decision", "horizon"] = "decision",
    cutoff: CutoffKey = DEFAULT_CUTOFF,
    horizon_h: Annotated[int, Query(ge=0, le=MAX_HORIZON_H)] = 24,
) -> dict:
    deliveries = _delivery_range(start, end)
    return _accuracy_cached(deliveries[0], deliveries[-1], mode, cutoff, horizon_h)


@lru_cache(maxsize=256)
def _accuracy_cached(start: date, end: date, mode: str, cutoff: str, horizon_h: int) -> dict:
    ds, deliveries = get_dataset(), an.days(start, end)
    if mode == "decision":
        pairs = an.decision_pairs(ds, deliveries, CUTOFFS[cutoff].local_time)
    else:
        pairs = an.horizon_pairs(ds, deliveries, horizon_h)
    return {
        "metrics": an.metrics(pairs),
        "series": [
            {
                "time": p.target.isoformat(),
                "forecast": p.forecast,
                "actual": p.actual,
                "published": p.published.isoformat(),
            }
            for p in pairs
        ],
        "by_hour": an.by_hour_of_day(pairs),
        "histogram": an.histogram(pairs),
        "daily": an.daily(pairs),
    }


@app.get("/api/horizon-curve")
def horizon_curve(start: date | None = None, end: date | None = None) -> dict:
    deliveries = _delivery_range(start, end)
    return {"points": _horizon_cached(deliveries[0], deliveries[-1])}


@lru_cache(maxsize=64)
def _horizon_cached(start: date, end: date) -> list[dict]:
    return an.horizon_curve(get_dataset(), an.days(start, end), MAX_HORIZON_H)


@app.get("/api/insights")
def insights() -> dict:
    """Headline numbers for the pilot summary, over the full January decision window."""
    return _insights_cached()


@lru_cache(maxsize=1)
def _insights_cached() -> dict:
    ds, deliveries = get_dataset(), an.days(DELIVERY_FIRST, DELIVERY_LAST)
    by_cutoff = {
        key: {
            "metrics": an.metrics(an.decision_pairs(ds, deliveries, c.local_time)),
            "band_coverage": an.band_coverage(ds, deliveries, c.local_time),
        }
        for key, c in CUTOFFS.items()
    }
    return {"cutoffs": by_cutoff}


# Single-container deployments serve the SPA from the same origin.
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        file = (STATIC_DIR / path).resolve()
        if path and file.is_file() and file.is_relative_to(STATIC_DIR.resolve()):
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")
