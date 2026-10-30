from __future__ import annotations

import pytest

from app.store import Dataset, build_dataset


@pytest.fixture
def tiny() -> Dataset:
    """Two forecast runs for 15 Jan 2026 00:00-02:00 UTC, with known actuals."""
    return build_dataset(
        {
            "actuals": [
                ["2026-01-15T00:00:00Z", 1000],
                ["2026-01-15T00:30:00Z", 1100],
                ["2026-01-15T01:00:00Z", 1200],
            ],
            "forecasts": [
                # Run published the morning before (D-1 07:30).
                ["2026-01-14T07:30:00Z", "2026-01-15T00:00:00Z", 1500],
                ["2026-01-14T07:30:00Z", "2026-01-15T01:00:00Z", 1600],
                # Later run, after the 09:20 gate closure.
                ["2026-01-14T09:30:00Z", "2026-01-15T00:00:00Z", 1300],
                ["2026-01-14T09:30:00Z", "2026-01-15T01:00:00Z", 1250],
                # Restated past hour (target before publish): must be ignored.
                ["2026-01-15T03:30:00Z", "2026-01-15T01:00:00Z", 9999],
            ],
        }
    )
