import type { CutoffKey, Meta } from './api';

export interface DeskState {
  tab: 'brief' | 'accuracy';
  day: string;
  cutoff: CutoffKey;
  start: string;
  end: string;
  mode: 'decision' | 'horizon';
  horizon: number;
}

type Bounds = Pick<Meta, 'delivery_dates'>;

const pilotBounds: Bounds = { delivery_dates: { first: '2026-01-02', last: '2026-02-01' } };

function defaults(bounds: Bounds): DeskState {
  const { first, last } = bounds.delivery_dates;
  return {
    tab: 'brief',
    day: '2026-01-15' < first ? first : '2026-01-15' > last ? last : '2026-01-15',
    cutoff: 'epex',
    start: first,
    end: last,
    mode: 'decision',
    horizon: 24,
  };
}

export function parseState(search: string, bounds: Bounds): DeskState {
  const params = new URLSearchParams(search);
  const fallback = defaults(bounds);
  const { first, last } = bounds.delivery_dates;
  const date = (key: 'day' | 'start' | 'end') => {
    const value = params.get(key) ?? '';
    const timestamp = Date.parse(`${value}T12:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(timestamp)
      && new Date(timestamp).toISOString().slice(0, 10) === value && value >= first && value <= last
      ? value : fallback[key];
  };
  let start = date('start');
  let end = date('end');
  if (start > end) [start, end] = [end, start];
  const rawHorizon = params.get('horizon');
  const horizon = rawHorizon?.trim() ? Number(rawHorizon) : NaN;

  return {
    tab: params.get('tab') === 'accuracy' ? 'accuracy' : fallback.tab,
    day: date('day'),
    cutoff: params.get('cutoff') === 'n2ex' ? 'n2ex' : fallback.cutoff,
    start,
    end,
    mode: params.get('mode') === 'horizon' ? 'horizon' : fallback.mode,
    horizon: Number.isInteger(horizon) && horizon >= 0 && horizon <= 48 ? horizon : fallback.horizon,
  };
}

export function toSearch(state: DeskState, bounds: Bounds = pilotBounds): string {
  const fallback = defaults(bounds);
  const params = new URLSearchParams();
  for (const key of Object.keys(fallback) as (keyof DeskState)[]) {
    if (state[key] !== fallback[key]) params.set(key, String(state[key]));
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}
