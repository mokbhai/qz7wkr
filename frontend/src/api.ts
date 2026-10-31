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

export interface FullMetrics {
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

export type Metrics = { n: 0 } | FullMetrics;

export function hasMetrics(metrics: Metrics): metrics is FullMetrics {
  return metrics.n > 0 && 'mae' in metrics;
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

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'ok'; data: T };

const cache = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();

function request(url: string): Promise<unknown> {
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  const pending = inFlight.get(url);
  if (pending) return pending;

  const promise = fetch(url)
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.detail === 'string' ? body.detail : `Request failed (${res.status})`);
      }
      return res.json() as Promise<unknown>;
    })
    .then((data) => {
      cache.set(url, data);
      return data;
    })
    .finally(() => inFlight.delete(url));
  inFlight.set(url, promise);
  return promise;
}

export async function prefetch(url: string): Promise<void> {
  await request(url);
}

export function useApi<T>(url: string | null): Loadable<T> {
  const [state, setState] = useState<{ url: string | null; value: Loadable<T> }>({
    url: null,
    value: { status: 'loading' },
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) {
      setState({ url, value: { status: 'ok', data: cache.get(url) as T } });
      return;
    }
    // Abort this subscriber, not the shared request used by prefetch and other hooks.
    const ctrl = new AbortController();
    setState({ url, value: { status: 'loading' } });
    request(url)
      .then((data) => {
        if (!ctrl.signal.aborted) setState({ url, value: { status: 'ok', data: data as T } });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({
          url,
          value: {
            status: 'error',
            message: err instanceof Error ? err.message : 'Request failed',
            retry: () => {
              if (ctrl.signal.aborted) return;
              setState({ url, value: { status: 'loading' } });
              setAttempt((value) => value + 1);
            },
          },
        });
      });
    return () => ctrl.abort();
  }, [url, attempt]);

  if (url && cache.has(url)) return { status: 'ok', data: cache.get(url) as T };
  return url && state.url === url ? state.value : { status: 'loading' };
}
