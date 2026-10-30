from __future__ import annotations

import math
from datetime import UTC, date, datetime, time

import pytest

from app import analysis as an


def utc(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=UTC)


def test_delivery_day_handles_uk_clock_changes():
    assert len(an.delivery_targets(date(2026, 1, 15))) == 24
    assert len(an.delivery_targets(date(2026, 3, 29))) == 23  # BST starts
    assert len(an.delivery_targets(date(2026, 10, 25))) == 25  # BST ends
    # In summer, the UK day starts at 23:00 UTC the previous evening.
    assert an.delivery_targets(date(2026, 7, 1))[0] == utc("2026-06-30T23:00:00")


def test_decision_instant_is_gate_closure_on_previous_uk_day():
    assert an.decision_instant(date(2026, 1, 15), time(9, 20)) == utc("2026-01-14T09:20:00")
    assert an.decision_instant(date(2026, 7, 2), time(9, 20)) == utc("2026-07-01T08:20:00")


def test_forecast_as_of_never_uses_a_run_published_after_the_instant(tiny):
    target = utc("2026-01-15T00:00:00")
    assert tiny.forecast_as_of(target, utc("2026-01-14T09:20:00")).mw == 1500
    assert tiny.forecast_as_of(target, utc("2026-01-14T09:30:00")).mw == 1300  # inclusive
    assert tiny.forecast_as_of(target, utc("2026-01-14T07:29:59")) is None


def test_restated_past_hours_are_dropped(tiny):
    assert tiny.forecast_as_of(utc("2026-01-15T01:00:00"), utc("2026-01-16T00:00:00")).mw == 1250


def test_decision_pairs_differ_by_cutoff(tiny):
    epex = an.decision_pairs(tiny, [date(2026, 1, 15)], time(9, 20))
    n2ex = an.decision_pairs(tiny, [date(2026, 1, 15)], time(9, 50))
    assert [p.forecast for p in epex] == [1500, 1600]
    assert [p.forecast for p in n2ex] == [1300, 1250]
    # Only hourly targets are compared; the 00:30 actual has no forecast.
    assert [p.actual for p in epex] == [1000, 1200]


def test_horizon_pairs_respect_minimum_lead(tiny):
    # 00:00 target, >= 15h lead -> must be published by 09:00 the day before -> the 07:30 run.
    pairs = an.horizon_pairs(tiny, [date(2026, 1, 15)], 15)
    assert pairs[0].forecast == 1500 and pairs[0].horizon_h == 16.5
    # 01:00 target, >= 15h lead -> by 10:00 -> the 09:30 run.
    assert pairs[1].forecast == 1250


def test_metrics_signs_and_values():
    pairs = [
        an.Pair(utc("2026-01-15T00:00:00"), utc("2026-01-14T00:00:00"), 110, 100),
        an.Pair(utc("2026-01-15T01:00:00"), utc("2026-01-14T00:00:00"), 70, 100),
    ]
    m = an.metrics(pairs)
    assert m["mae"] == 20
    assert m["bias"] == -10  # net under-forecast
    assert m["rmse"] == pytest.approx(math.sqrt((100 + 900) / 2))
    assert m["nmae"] == pytest.approx(0.2)
    assert an.metrics([]) == {"n": 0}


def test_quantile_matches_numpy_linear():
    assert an.quantile([1, 2, 3, 4], 0.5) == 2.5
    assert an.quantile([0, 10], 0.9) == 9
    assert math.isnan(an.quantile([], 0.5))


def test_band_swaps_error_quantiles_and_clamps_at_zero():
    table = {2: [-200.0, 500.0]}  # 12-18h bucket: error P10 = -200, P90 = +500
    assert an.band_for(1000, 13, table) == (500, 1200)
    assert an.band_for(300, 13, table) == (0, 500)
    assert an.band_for(1000, 40, table) is None


def test_histogram_bins_are_contiguous():
    p = lambda f, a: an.Pair(utc("2026-01-15T00:00:00"), utc("2026-01-14T00:00:00"), f, a)  # noqa: E731
    bins = an.histogram([p(0, 1200), p(1600, 0)], bin_mw=500)
    assert [b["from"] for b in bins] == [-1500, -1000, -500, 0, 500, 1000, 1500]
    assert sum(b["count"] for b in bins) == 2
