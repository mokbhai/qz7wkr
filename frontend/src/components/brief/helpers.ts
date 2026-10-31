import type { Brief, BriefHour, CutoffKey } from '../../api';
import { ukHour } from '../../format';

const HOUR_MS = 3_600_000;
export type ForecastRun = Brief['runs'][number];

export function bandSpan(hour: BriefHour): number | null {
  return hour.p10 == null || hour.p90 == null ? null : hour.p90 - hour.p10;
}

export function runRevision(brief: Brief) {
  // A mixed snapshot has no single used run: compare with the run before all of them.
  const firstUsed = Math.min(...brief.runs_used.map(Date.parse));
  if (!Number.isFinite(firstUsed)) return null;
  const previous = brief.runs
    .filter((run) => run.usable && Date.parse(run.published) < firstUsed
      && Date.parse(run.published) <= Date.parse(brief.decision_at))
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))[0];
  if (!previous) return null;

  const changes = brief.hours.flatMap((hour, index) => {
    const before = previous.values[index];
    return hour.forecast == null || before == null ? [] : [{ time: hour.time, delta: hour.forecast - before }];
  });
  if (!changes.length) return null;
  const largest = changes.reduce((best, change) => Math.abs(change.delta) > Math.abs(best.delta) ? change : best);
  return { previous, overlap: changes.length, deltaMwh: changes.reduce((sum, change) => sum + change.delta, 0), largest };
}

export function widestBandWindow(hours: BriefHour[]) {
  const spans = hours.map(bandSpan);
  const maxSpan = Math.max(...spans.map((span) => span ?? 0));
  if (maxSpan <= 0) return null;

  const groups: { start: number; end: number; peak: number }[] = [];
  spans.forEach((span, index) => {
    if (span == null || span < maxSpan * 0.95) return;
    const last = groups[groups.length - 1];
    const contiguous = last && last.end === index - 1
      && Date.parse(hours[index].time) - Date.parse(hours[last.end].time) === HOUR_MS;
    if (contiguous) {
      last.end = index;
      last.peak = Math.max(last.peak, span);
    } else {
      groups.push({ start: index, end: index, peak: span });
    }
  });
  // Prefer the longest group containing a true maximum; equal groups resolve to the earliest.
  const window = groups.filter((group) => group.peak === maxSpan)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  return {
    start: hours[window.start].time,
    end: new Date(Date.parse(hours[window.end].time) + HOUR_MS).toISOString(),
    maxSpan,
  };
}

export function largestOverForecast(hours: BriefHour[]) {
  let largest: { time: string; forecast: number; error: number } | null = null;
  for (const hour of hours) {
    if (hour.forecast == null || hour.actual == null) continue;
    const error = hour.forecast - hour.actual;
    if (error > 0 && (!largest || error > largest.error)) largest = { time: hour.time, forecast: hour.forecast, error };
  }
  return largest;
}

export function buildCsvRows(brief: Brief, cutoff: CutoffKey, showActual: boolean) {
  return brief.hours.map((hour) => ({
    delivery_date_uk: brief.delivery_date,
    decision_at_utc: new Date(brief.decision_at).toISOString(),
    cutoff,
    interval_start_utc: new Date(hour.time).toISOString(),
    interval_end_utc: new Date(Date.parse(hour.time) + HOUR_MS).toISOString(),
    forecast_mw: hour.forecast,
    p10_mw: hour.p10,
    p90_mw: hour.p90,
    span_mw: bandSpan(hour),
    forecast_published_utc: hour.published ? new Date(hour.published).toISOString() : null,
    lead_h: hour.horizon_h ?? null,
    ...(showActual ? { actual_halfhour_start_mw: hour.actual } : {}),
  }));
}

export function csvFilename(brief: Brief, cutoff: CutoffKey): string {
  return `wind-${brief.delivery_date}-${cutoff}-${ukHour(brief.decision_at).replace(':', '')}.csv`;
}

export function forecastRunRows(brief: Brief) {
  const firstHour = brief.hours[0];
  if (!firstHour) return [];
  let previousTotal: number | null = null;
  return [...brief.runs]
    .sort((a, b) => Date.parse(a.published) - Date.parse(b.published))
    .filter((run) => Date.parse(run.published) < Date.parse(firstHour.time))
    .map((run) => {
      const covered = brief.hours.filter((_, index) => run.values[index] != null).length;
      const total = run.values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      const full = covered === brief.hours.length;
      const delta = full && previousTotal != null ? total - previousTotal : null;
      previousTotal = full ? total : null;
      return {
        ...run, covered, total, full, delta,
        lead: (Date.parse(firstHour.time) - Date.parse(run.published)) / HOUR_MS,
        used: brief.runs_used.some((published) => Date.parse(published) === Date.parse(run.published)),
        late: Date.parse(run.published) > Date.parse(brief.decision_at),
      };
    })
    .slice(-10);
}

export function windAxis(values: (number | null | undefined)[]) {
  const max = Math.max(0, ...values.map((value) => value ?? 0));
  const step = Math.max(1000, Math.ceil(max / 5000) * 1000);
  const upper = Math.max(step, Math.ceil(max / step) * step);
  return { upper, ticks: Array.from({ length: upper / step + 1 }, (_, index) => index * step) };
}

export const gwhValue = (mwh: number | null) => mwh == null ? '–' : (mwh / 1000).toFixed(1);

export function signedValue(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits));
  const magnitude = Math.abs(rounded).toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${rounded < 0 ? '−' : '+'}${magnitude}`;
}
