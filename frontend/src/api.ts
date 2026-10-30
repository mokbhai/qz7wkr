// Typed client for the FastAPI backend. Shapes mirror backend/app/main.py.

import { useEffect, useState } from 'react';

export type CutoffKey = 'epex' | 'n2ex';

export interface Meta {
  decision_dates: { first: string; last: string };
  delivery_dates: { first: string; last: string };
  cutoffs: { key: CutoffKey; label: string; local_time: string }[];
  default_cutoff: CutoffKey;
  max_horizon_h: number;
  band_bucket_h: number;
  data_fetched_at: string;
  publish_times_utc: string[];
}

export interface BriefHour {
  time: string;
  actual: number | null;
  forecast: number | null;
  p10: number | null;
  p90: number | null;
  published?: string;
  horizon_h?: number;
}

export interface Brief {
  delivery_date: string;
  decision_date: string;
  decision_at: string;
  runs_used: string[];
  hours: BriefHour[];
  runs: { published: string; usable: boolean; values: (number | null)[] }[];
  totals_mwh: Record<'forecast' | 'p10' | 'p90' | 'actual', number | null>;
  calibration_days: number;
}

export interface Metrics {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  nmae: number | null;
  p50_abs: number;
  p90_abs: number;
  p99_abs: number;
  max_abs: number;
  mean_actual: number;
  mean_horizon_h: number;
}

export interface Accuracy {
  metrics: Metrics;
  series: { time: string; forecast: number; actual: number; published: string }[];
  by_hour: { hour: number; mae: number; bias: number }[];
  histogram: { from: number; to: number; count: number }[];
  daily: { date: string; mae: number; bias: number; forecast_mwh: number; actual_mwh: number }[];
}

export interface HorizonPoint {
  horizon_h: number;
  n: number;
  mae: number;
  rmse: number;
  bias: number;
  p90_abs: number;
}

export interface Insights {
  cutoffs: Record<
    CutoffKey,
    { metrics: Metrics; band_coverage: { n: number; inside: number; below_p10: number; above_p90: number } }
  >;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export function apiUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const query = qs.toString();
  return `${API_BASE}${path}${query ? `?${query}` : ''}`;
}

export type Loadable<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: T };

/** GET a JSON endpoint; aborts stale requests when the URL changes so fast clicks never show old data. */
export function useApi<T>(url: string | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    setState((s) => (s.status === 'ok' ? s : { status: 'loading' }));
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(typeof body?.detail === 'string' ? body.detail : `Request failed (${res.status})`);
        }
        return res.json() as Promise<T>;
      })
      .then((data) => setState({ status: 'ok', data }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Request failed' });
      });
    return () => ctrl.abort();
  }, [url]);

  return state;
}
