"""Fetch the January 2026 wind actuals (FUELHH) and forecasts (WINDFOR) from Elexon BMRS.

Writes a compact, versioned snapshot the API loads at start-up, so the app never depends on
Elexon being reachable at request time.

    python -m app.ingest            # refresh backend/data snapshot
    python -m app.ingest --out x.gz # write elsewhere
"""

from __future__ import annotations

import argparse
import gzip
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta

from .config import DATA_PATH, DECISION_FIRST, DELIVERY_LAST, MAX_HORIZON_H

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
CHUNK_DAYS = 7
RETRIES = 4


def _get(dataset: str, params: dict[str, str]) -> list[dict]:
    url = f"{BASE_URL}/{dataset}/stream?{urllib.parse.urlencode(params)}"
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                return json.load(resp)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt == RETRIES - 1:
                raise RuntimeError(f"{dataset} fetch failed after {RETRIES} attempts: {url}") from exc
            time.sleep(2**attempt)
    raise AssertionError("unreachable")


def fetch_actuals() -> list[list]:
    # One day of margin either side of the delivery window for chart context.
    start, end = DECISION_FIRST - timedelta(days=1), DELIVERY_LAST
    rows: dict[str, float] = {}
    day = start
    while day <= end:
        chunk_end = min(day + timedelta(days=CHUNK_DAYS - 1), end)
        for r in _get(
            "FUELHH",
            {"settlementDateFrom": day.isoformat(), "settlementDateTo": chunk_end.isoformat(), "fuelType": "WIND"},
        ):
            if r.get("fuelType") == "WIND" and r.get("generation") is not None:
                rows[r["startTime"]] = float(r["generation"])
        day = chunk_end + timedelta(days=1)
    return [[t, g] for t, g in sorted(rows.items())]


def fetch_forecasts() -> list[list]:
    # Earliest run that can still matter: MAX_HORIZON_H plus a day before the first delivery day.
    start = datetime.combine(DECISION_FIRST, datetime.min.time(), UTC) - timedelta(hours=MAX_HORIZON_H + 24)
    end = datetime.combine(DELIVERY_LAST + timedelta(days=1), datetime.min.time(), UTC)
    rows: dict[tuple[str, str], float] = {}
    cursor = start
    while cursor < end:
        chunk_end = min(cursor + timedelta(days=CHUNK_DAYS), end)
        for r in _get(
            "WINDFOR",
            {
                "publishDateTimeFrom": cursor.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "publishDateTimeTo": chunk_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        ):
            if r.get("generation") is not None:
                rows[(r["publishTime"], r["startTime"])] = float(r["generation"])
        cursor = chunk_end
    return [[p, t, g] for (p, t), g in sorted(rows.items())]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=str(DATA_PATH))
    args = parser.parse_args()

    actuals = fetch_actuals()
    forecasts = fetch_forecasts()
    if not actuals or not forecasts:
        raise SystemExit("Elexon returned no rows; refusing to overwrite the snapshot.")

    snapshot = {
        "meta": {
            "fetched_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sources": {
                "actuals": f"{BASE_URL}/FUELHH/stream (fuelType=WIND)",
                "forecasts": f"{BASE_URL}/WINDFOR/stream",
            },
        },
        "actuals": actuals,
        "forecasts": forecasts,
    }
    with gzip.open(args.out, "wt", encoding="utf-8") as fh:
        json.dump(snapshot, fh, separators=(",", ":"))
    print(f"wrote {args.out}: {len(actuals)} actuals, {len(forecasts)} forecast points")


if __name__ == "__main__":
    main()
