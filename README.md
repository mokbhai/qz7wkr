# Wind Day-Ahead Desk

A web app for a UK utility's day-ahead power desk. It answers two questions for every purchase decision made in **January 2026**:

1. **What wind forecast did we have when we had to commit?** The latest Elexon WINDFOR forecast published before day-ahead gate closure, for the next UK delivery day, with an empirical P10–P90 uncertainty band.
2. **How far can we trust it?** Forecast error measured against metered wind outturn (Elexon FUELHH): MAE, RMSE, bias, tail errors, error vs lead time, by hour of day, and the hardest days.

**Live app:** https://qz7wkr-kappa.vercel.app  
**Stack:** React + TypeScript (Vite, Recharts) · Python 3.12 (FastAPI) · Docker · Vercel

---

## Pilot findings (January 2026, gate closure 09:20 UK)

| | |
|---|---|
| Typical miss at decision time | **2.02 GW MAE** (18% of mean wind output); P90 absolute error 4.15 GW |
| Systematic bias | Forecast **over-predicts by +1.75 GW** on average, at every lead time from 0 to 48 h |
| Uncertainty band | Leave-one-day-out P10–P90 band held **78% of outturns** (target 80%) |
| Waiting for N2EX (09:50) | Uses the 09:30 forecast run; MAE only **1.3% lower** than at 09:20 |

The bias is the actionable result. Committing against the raw forecast leaves the book short of wind on most days, so a buyer should plan on the band. Its likely cause is that WINDFOR does not capture curtailment and constraint actions, which show up in the metered outturn. With wind data alone, this pilot can show the effect but cannot prove the cause.

## Domain model and definitions

| Term | Definition in this app |
|---|---|
| Delivery day **D** | A UK local calendar day (Europe/London; 23 or 25 hours on clock-change days). |
| Decision instant | Gate closure on **D-1**, UK time: **09:20** (EPEX SPOT GB hourly auction, the default) or **09:50** (Nord Pool N2EX GB auction). Switch in the header. |
| January 2026 decisions | Decisions taken 1–31 Jan, i.e. delivery days **2 Jan – 1 Feb 2026**. |
| Forecast at decision time | For each hourly target `t` of D: the WINDFOR value from the **latest run with `publishTime <= decision instant`**. No later information leaks in. |
| Fixed lead-time forecast | For the accuracy view: the latest run with `publishTime <= t - N h`, for N = 0…48. |
| Actual | FUELHH `fuelType=WIND` generation for the half-hour starting at `t`. WINDFOR is hourly, so the comparison uses the 744 hourly instants where both exist. |
| Error | `forecast - actual` (MW). Positive means wind was over-forecast, which leaves the buyer **short**. |
| P10 / P90 band | `forecast - quantile(error, 0.9 / 0.1)`, using decision-time errors from the **other** pilot days in the same 6-hour lead-time bucket (leave-one-day-out, so a day never calibrates its own band), clamped at 0. |
| Energy totals | The sum of hourly MW values for the day, shown as GWh. |

WINDFOR runs also restate a few hours that have already passed (target before publish time). These are not forecasts and are dropped at load time.

## Architecture

```
Elexon BMRS API ──(python -m app.ingest)──▶ backend/data/elexon_wind_2026-01.json.gz   (113 KB, committed)
                                                     │ loaded once, indexed in memory
                                                     ▼
              backend/app  ── store.py     target → sorted publish times (bisect = "latest run as of T")
                           ── analysis.py  pure functions: pairing, metrics, band, horizon curve
                           ── main.py      FastAPI: validation, caching, JSON; serves the SPA in Docker
                                                     │ /api/*
                                                     ▼
              frontend/src ── BriefView     Day-ahead brief (decision view, CSV export)
                           ── AccuracyView  Forecast accuracy (metrics + 4 charts + hardest days)
```

Why it is built this way:

- **Snapshot instead of live Elexon calls.** The scope is a fixed historical month. A committed snapshot makes the app deterministic and testable and keeps it fast (all endpoints respond in under 60 ms locally), and it keeps working if Elexon rate-limits or goes down. `python -m app.ingest` refreshes it: chunked requests, retries with backoff, and dedupe on `(publishTime, startTime)`. The ingest refuses to overwrite the snapshot with an empty result.
- **No pandas or numpy.** About 20k forecast points fit comfortably in plain Python. The bisect index answers "latest forecast as of T" in O(log n). Leaving out scientific libraries keeps the Vercel function small and cold starts fast. `quantile()` matches numpy's default linear method, and a test pins that.
- **Pure domain layer.** `analysis.py` has no HTTP or IO code, so unit tests cover it with tiny hand-built fixtures. `main.py` only validates input, caches, and serialises.
- **Input validation at the edge.** Dates outside the pilot window, reversed ranges, and lead times outside 0–48 h return 422 with a readable message.
- **Frontend.** One typed client (`api.ts`). Its `useApi` hook aborts stale requests, so stepping quickly through days never shows old data. All times display in UK local time. Colours are CSS tokens with a dark-mode set.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness and row counts |
| `GET /api/meta` | Pilot window, cutoffs, forecast run times, snapshot timestamp |
| `GET /api/decision?delivery_date=2026-01-15&cutoff=epex` | Hourly forecast at gate closure, P10/P90, outturn, every run around the decision (flagged usable or late), daily totals |
| `GET /api/accuracy?start=&end=&mode=decision\|horizon&cutoff=&horizon_h=` | Metrics, paired series, error by hour of day, histogram, daily breakdown |
| `GET /api/horizon-curve?start=&end=` | MAE / RMSE / bias / P90 for lead times 0–48 h |
| `GET /api/insights` | Headline pilot numbers for both cutoffs, including band coverage |

Interactive docs: `/docs` (FastAPI Swagger UI).

## Repository layout

```
.
├── api/index.py                 Vercel serverless entry; re-exports the FastAPI app
├── backend/
│   ├── app/
│   │   ├── config.py            Pilot window, auction cutoffs, paths
│   │   ├── ingest.py            Elexon FUELHH + WINDFOR fetch → snapshot (CLI)
│   │   ├── store.py             Snapshot loader + in-memory index
│   │   ├── analysis.py          Domain logic (pure functions)
│   │   └── main.py              FastAPI routes, caching, static SPA serving
│   ├── data/elexon_wind_2026-01.json.gz   Committed data snapshot
│   └── tests/                   pytest: domain unit tests, API tests on real data
├── frontend/
│   ├── src/
│   │   ├── App.tsx              Shell: header, gate-closure switch, tabs
│   │   ├── api.ts               Typed API client + useApi hook
│   │   ├── format.ts            UK-time and unit formatting, CSV
│   │   ├── format.test.ts       vitest
│   │   ├── styles.css           Design tokens (light/dark) and layout
│   │   └── components/          BriefView, AccuracyView, shared UI pieces
│   ├── index.html, vite.config.ts, tsconfig.json, package.json
├── Dockerfile                   Multi-stage: build React → serve app + API with uvicorn
├── docker-compose.yml
├── vercel.json                  Static frontend + Python function for /api/*
├── pyproject.toml               Python deps (runtime + dev group), pytest and ruff config; read by uv, Docker and Vercel
├── uv.lock                      Locked Python dependency graph (installed with --frozen everywhere)
├── .python-version              Python 3.12
└── .github/workflows/ci.yml     Lint, tests, typecheck, build, Docker smoke test
```

## Running it

### Docker (recommended)

```bash
docker compose up --build
# open http://localhost:8000
```

### Without Docker

```bash
# backend (uv installs Python 3.12 and the locked deps into .venv)
uv sync --frozen
cd backend && uv run uvicorn app.main:app --reload --port 8000

# frontend (Node 22+), in a second terminal
cd frontend
npm ci
npm run dev        # http://localhost:5173, proxies /api to :8000
```

### Refresh the data snapshot (optional)

```bash
cd backend && uv run python -m app.ingest
```

### Tests and checks

```bash
uv run ruff check backend api && uv run ruff format --check backend api && uv run pytest -q
cd frontend && npm run typecheck && npm test && npm run build
```

CI runs the same checks and also builds the Docker image and smoke-tests `/api/health`.

## Deployment

Vercel serves `frontend/dist` as static files and `api/index.py` as a Python serverless function. The function bundles `backend/app` and the data snapshot, and `/api/*` is rewritten to it. The Docker image also runs as-is on any container host, including Heroku's container stack, because it honours `$PORT`.

## Limitations and next steps

- **Scope is wind only, as specified.** Turning "wind forecast + band" into "MWh to procure" needs a demand forecast and the other renewables, which is the obvious next integration.
- **The band is calibrated on the pilot month itself** (leave-one-day-out). In production it should use a trailing window, for example the last 60 days, and the bias finding should be re-checked across seasons.
- **Hourly comparison.** The forecast is compared with the half-hour starting on the hour. An hourly mean of both half-hours is a possible alternative definition, and it changes the metrics only slightly.
- **Gate-closure times** come from the EPEX and Nord Pool GB auction rules and are configurable in `backend/app/config.py`.
- **Live mode.** Swap the snapshot for a scheduled ingest (cron → object storage) and the API stays the same.

## Use of AI tools

This project was built with AI assistance: **Claude Code (Anthropic)** was used for scaffolding, writing code and tests, and drafting this README. I reviewed the domain definitions (decision instant, no look-ahead, error sign, band calibration), the analysis results, and the UI against the live Elexon data, and I can explain and defend every part of the code.
