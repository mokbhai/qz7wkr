"""Pure domain logic: which forecast was available when, and how wrong it turned out to be.

Conventions
- All instants are timezone-aware UTC; delivery days are UK local calendar days.
- error = forecast - actual (MW). Positive error = wind over-forecast = the buyer ends up short.
- Forecasts are hourly; they are compared with the half-hourly actual starting at the same instant.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from .config import BAND_BUCKET_H, UK_TZ
from .store import Dataset

HOUR = timedelta(hours=1)


@dataclass(frozen=True)
class Pair:
    target: datetime
    published: datetime
    forecast: float
    actual: float

    @property
    def error(self) -> float:
        return self.forecast - self.actual

    @property
    def horizon_h(self) -> float:
        return (self.target - self.published).total_seconds() / 3600


# ---------------------------------------------------------------- time helpers


def delivery_targets(day: date) -> list[datetime]:
    """Hourly target instants (UTC) of a UK local delivery day; 23 or 25 on clock-change days."""
    start = datetime.combine(day, time(0), UK_TZ).astimezone(UTC)
    end = datetime.combine(day + timedelta(days=1), time(0), UK_TZ).astimezone(UTC)
    out, t = [], start
    while t < end:
        out.append(t)
        t += HOUR
    return out


def decision_instant(delivery: date, cutoff: time) -> datetime:
    """When the buyer must commit for `delivery`: gate closure on the previous UK day."""
    return datetime.combine(delivery - timedelta(days=1), cutoff, UK_TZ).astimezone(UTC)


def days(first: date, last: date) -> list[date]:
    return [first + timedelta(days=i) for i in range((last - first).days + 1)]


def uk_date(t: datetime) -> date:
    return t.astimezone(UK_TZ).date()


def uk_hour(t: datetime) -> int:
    return t.astimezone(UK_TZ).hour


# ---------------------------------------------------------------- pairing


def decision_pairs(ds: Dataset, deliveries: list[date], cutoff: time) -> list[Pair]:
    """Forecast the buyer actually had at gate closure, paired with the outturn."""
    pairs = []
    for day in deliveries:
        as_of = decision_instant(day, cutoff)
        for target in delivery_targets(day):
            fc, actual = ds.forecast_as_of(target, as_of), ds.actual(target)
            if fc is not None and actual is not None:
                pairs.append(Pair(target, fc.published, fc.mw, actual))
    return pairs


def horizon_pairs(ds: Dataset, deliveries: list[date], horizon_h: float) -> list[Pair]:
    """Latest forecast published at least `horizon_h` hours before each target."""
    pairs = []
    lead = timedelta(hours=horizon_h)
    for day in deliveries:
        for target in delivery_targets(day):
            fc, actual = ds.forecast_as_of(target, target - lead), ds.actual(target)
            if fc is not None and actual is not None:
                pairs.append(Pair(target, fc.published, fc.mw, actual))
    return pairs


# ---------------------------------------------------------------- statistics


def quantile(sorted_values: list[float], q: float) -> float:
    """Linear-interpolated quantile of an already sorted list (numpy's default method)."""
    if not sorted_values:
        return math.nan
    pos = (len(sorted_values) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo)


def metrics(pairs: list[Pair]) -> dict:
    n = len(pairs)
    if n == 0:
        return {"n": 0}
    errors = [p.error for p in pairs]
    abs_sorted = sorted(abs(e) for e in errors)
    mean_actual = sum(p.actual for p in pairs) / n
    mae = sum(abs_sorted) / n
    return {
        "n": n,
        "mae": mae,
        "rmse": math.sqrt(sum(e * e for e in errors) / n),
        "bias": sum(errors) / n,
        "nmae": mae / mean_actual if mean_actual else None,
        "p50_abs": quantile(abs_sorted, 0.5),
        "p90_abs": quantile(abs_sorted, 0.9),
        "p99_abs": quantile(abs_sorted, 0.99),
        "max_abs": abs_sorted[-1],
        "mean_actual": mean_actual,
        "mean_horizon_h": sum(p.horizon_h for p in pairs) / n,
    }


def histogram(pairs: list[Pair], bin_mw: int = 500) -> list[dict]:
    counts: dict[int, int] = defaultdict(int)
    for p in pairs:
        counts[math.floor(p.error / bin_mw)] += 1
    if not counts:
        return []
    return [
        {"from": b * bin_mw, "to": (b + 1) * bin_mw, "count": counts.get(b, 0)}
        for b in range(min(counts), max(counts) + 1)
    ]


def by_hour_of_day(pairs: list[Pair]) -> list[dict]:
    groups: dict[int, list[Pair]] = defaultdict(list)
    for p in pairs:
        groups[uk_hour(p.target)].append(p)
    return [
        {"hour": h, "mae": sum(abs(p.error) for p in g) / len(g), "bias": sum(p.error for p in g) / len(g)}
        for h, g in sorted(groups.items())
    ]


def daily(pairs: list[Pair]) -> list[dict]:
    groups: dict[date, list[Pair]] = defaultdict(list)
    for p in pairs:
        groups[uk_date(p.target)].append(p)
    out = []
    for day, g in sorted(groups.items()):
        out.append(
            {
                "date": day.isoformat(),
                "mae": sum(abs(p.error) for p in g) / len(g),
                "bias": sum(p.error for p in g) / len(g),
                # Hourly MW points -> MWh (each point stands for one hour).
                "forecast_mwh": sum(p.forecast for p in g),
                "actual_mwh": sum(p.actual for p in g),
            }
        )
    return out


def horizon_curve(ds: Dataset, deliveries: list[date], max_h: int) -> list[dict]:
    out = []
    for h in range(max_h + 1):
        m = metrics(horizon_pairs(ds, deliveries, h))
        if m["n"]:
            out.append({"horizon_h": h, **{k: m[k] for k in ("n", "mae", "rmse", "bias", "p90_abs")}})
    return out


# ---------------------------------------------------------------- uncertainty band


def error_quantiles_by_lead(pairs: list[Pair], qs: tuple[float, ...]) -> dict[int, list[float]]:
    """Empirical error quantiles per lead-time bucket of BAND_BUCKET_H hours."""
    buckets: dict[int, list[float]] = defaultdict(list)
    for p in pairs:
        buckets[int(p.horizon_h // BAND_BUCKET_H)].append(p.error)
    return {b: [quantile(sorted(errs), q) for q in qs] for b, errs in buckets.items()}


def band_for(forecast_mw: float, horizon_h: float, table: dict[int, list[float]]) -> tuple[float, float] | None:
    """P10/P90 of the actual given a forecast: actual = forecast - error, so the quantiles swap."""
    q = table.get(int(horizon_h // BAND_BUCKET_H))
    if q is None:
        return None
    err_p10, err_p90 = q
    return max(0.0, forecast_mw - err_p90), max(0.0, forecast_mw - err_p10)


def band_coverage(ds: Dataset, deliveries: list[date], cutoff: time) -> dict:
    """Share of outturns inside the P10-P90 band, each day calibrated without itself (target ~80%)."""
    pairs_by_day = {d: decision_pairs(ds, [d], cutoff) for d in deliveries}
    inside = below = above = 0
    for day, pairs in pairs_by_day.items():
        others = [p for d, ps in pairs_by_day.items() if d != day for p in ps]
        table = error_quantiles_by_lead(others, (0.1, 0.9))
        for p in pairs:
            band = band_for(p.forecast, p.horizon_h, table)
            if band is None:
                continue
            if p.actual < band[0]:
                below += 1
            elif p.actual > band[1]:
                above += 1
            else:
                inside += 1
    n = inside + below + above
    return {
        "n": n,
        "inside": inside / n if n else None,
        "below_p10": below / n if n else None,
        "above_p90": above / n if n else None,
    }


# ---------------------------------------------------------------- decision brief


def decision_brief(ds: Dataset, delivery: date, cutoff: time, calibration_days: list[date]) -> dict:
    """Everything the desk needs at gate closure for one delivery day, plus hindsight outturn.

    The band is calibrated on decision-time errors of the other pilot days (leave-one-day-out),
    so a day's own outturn never shapes its own band.
    """
    as_of = decision_instant(delivery, cutoff)
    others = [d for d in calibration_days if d != delivery]
    table = error_quantiles_by_lead(decision_pairs(ds, others, cutoff), (0.1, 0.9))

    hours, runs_used = [], set()
    for target in delivery_targets(delivery):
        fc = ds.forecast_as_of(target, as_of)
        row = {"time": target.isoformat(), "actual": ds.actual(target), "forecast": None, "p10": None, "p90": None}
        if fc is not None:
            runs_used.add(fc.published)
            lead = (target - fc.published).total_seconds() / 3600
            band = band_for(fc.mw, lead, table)
            row.update(forecast=fc.mw, published=fc.published.isoformat(), horizon_h=lead)
            if band:
                row["p10"], row["p90"] = band
        hours.append(row)

    # Runs bracketing the decision: what came before, and what arrived too late to use.
    window_start = as_of - timedelta(hours=36)
    window_end = delivery_targets(delivery)[-1]
    runs = []
    for published in ds.publish_times:
        if window_start <= published <= window_end:
            values = ds.run(published)
            series = [values.get(datetime.fromisoformat(h["time"])) for h in hours]
            if any(v is not None for v in series):
                runs.append({"published": published.isoformat(), "usable": published <= as_of, "values": series})

    def total(key: str) -> float | None:
        vals = [h[key] for h in hours]
        return None if any(v is None for v in vals) else sum(vals)

    return {
        "delivery_date": delivery.isoformat(),
        "decision_date": (delivery - timedelta(days=1)).isoformat(),
        "decision_at": as_of.isoformat(),
        "runs_used": sorted(p.isoformat() for p in runs_used),
        "hours": hours,
        "runs": runs,
        "totals_mwh": {k: total(k) for k in ("forecast", "p10", "p90", "actual")},
        "calibration_days": len(others),
    }
