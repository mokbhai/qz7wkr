"""In-memory index over the snapshot: actuals by target time, forecasts by target then publish time."""

from __future__ import annotations

import gzip
import json
from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from .config import DATA_PATH


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class Forecast:
    published: datetime
    mw: float


@dataclass(frozen=True)
class Dataset:
    actuals: dict[datetime, float]
    # target time -> (sorted publish times, generation in the same order)
    forecasts: dict[datetime, tuple[list[datetime], list[float]]]
    publish_times: list[datetime]
    fetched_at: str

    def actual(self, target: datetime) -> float | None:
        return self.actuals.get(target)

    def forecast_as_of(self, target: datetime, as_of: datetime) -> Forecast | None:
        """Latest forecast for `target` that had been published at `as_of`."""
        entry = self.forecasts.get(target)
        if entry is None:
            return None
        published, values = entry
        i = bisect_right(published, as_of) - 1
        return None if i < 0 else Forecast(published[i], values[i])

    def run(self, published: datetime) -> dict[datetime, float]:
        """All target values of a single forecast run."""
        out: dict[datetime, float] = {}
        for target, (pubs, values) in self.forecasts.items():
            i = bisect_right(pubs, published) - 1
            if i >= 0 and pubs[i] == published:
                out[target] = values[i]
        return out


def build_dataset(raw: dict) -> Dataset:
    actuals = {parse_utc(t): float(g) for t, g in raw["actuals"]}

    grouped: dict[datetime, dict[datetime, float]] = {}
    for p, t, g in raw["forecasts"]:
        published, target = parse_utc(p), parse_utc(t)
        # WINDFOR runs also restate a few hours already past; those are not forecasts.
        if target < published:
            continue
        grouped.setdefault(target, {})[published] = float(g)

    forecasts = {target: (sorted(by_pub), [by_pub[p] for p in sorted(by_pub)]) for target, by_pub in grouped.items()}
    publish_times = sorted({p for pubs, _ in forecasts.values() for p in pubs})
    return Dataset(actuals, forecasts, publish_times, raw.get("meta", {}).get("fetched_at", "unknown"))


def load_dataset(path: Path) -> Dataset:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return build_dataset(json.load(fh))


@lru_cache(maxsize=1)
def get_dataset() -> Dataset:
    return load_dataset(DATA_PATH)
