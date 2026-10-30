"""End-to-end checks against the committed January 2026 snapshot."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_and_meta():
    assert client.get("/api/health").json()["status"] == "ok"
    meta = client.get("/api/meta").json()
    assert meta["delivery_dates"] == {"first": "2026-01-02", "last": "2026-02-01"}
    assert {c["key"] for c in meta["cutoffs"]} == {"epex", "n2ex"}


def test_decision_brief_only_uses_runs_published_before_gate_closure():
    body = client.get("/api/decision", params={"delivery_date": "2026-01-15", "cutoff": "epex"}).json()
    assert body["decision_at"] == "2026-01-14T09:20:00+00:00"
    assert len(body["hours"]) == 24
    assert all(p <= body["decision_at"] for p in body["runs_used"])
    assert all(h["p10"] <= h["p90"] for h in body["hours"])
    assert any(not r["usable"] for r in body["runs"])  # later runs shown as hindsight


def test_every_pilot_day_has_a_complete_brief():
    for day in range(2, 32):
        body = client.get("/api/decision", params={"delivery_date": f"2026-01-{day:02d}"}).json()
        assert all(h["forecast"] is not None for h in body["hours"]), day


def test_out_of_window_dates_are_rejected():
    assert client.get("/api/decision", params={"delivery_date": "2026-03-01"}).status_code == 422
    assert client.get("/api/accuracy", params={"start": "2026-01-20", "end": "2026-01-10"}).status_code == 422
    assert client.get("/api/accuracy", params={"mode": "horizon", "horizon_h": 99}).status_code == 422


def test_accuracy_full_month():
    body = client.get("/api/accuracy").json()
    assert body["metrics"]["n"] == 31 * 24
    assert len(body["by_hour"]) == 24
    assert sum(b["count"] for b in body["histogram"]) == body["metrics"]["n"]


def test_error_grows_with_lead_time():
    points = client.get("/api/horizon-curve").json()["points"]
    assert points[0]["horizon_h"] == 0
    assert points[-1]["mae"] > points[0]["mae"]


def test_band_is_roughly_calibrated():
    cov = client.get("/api/insights").json()["cutoffs"]["epex"]["band_coverage"]
    assert 0.65 <= cov["inside"] <= 0.9
