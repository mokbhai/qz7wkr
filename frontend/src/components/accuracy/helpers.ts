import type { Accuracy, HorizonPoint } from '../../api';
import { gw, pct, ukHour, ukStamp } from '../../format';

export type Mode = 'decision' | 'horizon';
export interface DayNavigation {
  linkToDay: (day: string) => string;
  onOpenDay: (day: string) => void;
}

export const number = (value: number) => Math.round(value).toLocaleString('en-GB');
export const signedGw = (value: number, digits = 2) => `${value > 0 ? '+' : ''}${gw(value, digits)}`;
export const errorTone = (value: number): 'neg' | 'pos' | 'muted' => value > 0 ? 'neg' : value < 0 ? 'pos' : 'muted';
export const leadHours = (point: Pick<Accuracy['series'][number], 'time' | 'published'>) =>
  (Date.parse(point.time) - Date.parse(point.published)) / 3_600_000;

export function powerTicks(values: number[], step: number) {
  const min = Math.floor(Math.min(0, ...values) / step) * step;
  const max = Math.max(step, Math.ceil(Math.max(0, ...values) / step) * step);
  return Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step);
}

export function niceTicks(max: number) {
  const upper = Number.isFinite(max) ? Math.max(0, max) : 0;
  const step = [0.25, 0.5, 1, 2, 5].find((value) => Math.ceil(upper / value) <= 5) ?? 5;
  const intervals = Math.max(3, Math.ceil(upper / step));
  return Array.from({ length: intervals + 1 }, (_, index) => index * step);
}

export function leadRange(series: Accuracy['series']): [number, number] | null {
  const leads = series.map(leadHours).filter((lead) => Number.isFinite(lead) && lead >= 0);
  return leads.length ? [Math.min(...leads), Math.max(...leads)] : null;
}

export function histogramGeometry(histogram: Accuracy['histogram']) {
  const bins = histogram.map((bin) => ({ ...bin, midpoint: (bin.from + bin.to) / 2000 }));
  const domain: [number, number] = bins.length
    ? [Math.min(...bins.map((bin) => bin.from)) / 1000, Math.max(...bins.map((bin) => bin.to)) / 1000]
    : [-1, 1];
  const ticks = Array.from({ length: Math.max(0, Math.floor(domain[1]) - Math.ceil(domain[0]) + 1) },
    (_, index) => Math.ceil(domain[0]) + index);
  return { bins, domain, ticks };
}

export function histogramBarWidth(from: number, to: number, plotWidth: number, domain: [number, number]) {
  return Math.max(0, (to - from) / 1000 / (domain[1] - domain[0]) * Math.max(0, plotWidth) - 1);
}

export function histogramInterval(from: number, to: number) {
  const edge = (value: number) => `${value > 0 ? '+' : ''}${(value / 1000).toFixed(1)}`;
  return `${edge(from)} ≤ error < ${edge(to)} GW`;
}

export function forecastSummary(series: Accuracy['series']) {
  if (!series.length) return 'No forecast and outturn pairs.';
  const errors = series.map((point) => point.forecast - point.actual);
  const meanError = errors.reduce((sum, error) => sum + error, 0) / errors.length;
  return `Forecast and outturn for ${number(series.length)} hours, ${ukStamp(series[0].time)} to ${ukStamp(series[series.length - 1].time)}. Mean error ${signedGw(meanError)}.`;
}

export function leadSummary(points: HorizonPoint[]) {
  if (!points.length) return 'No lead-time errors.';
  const sorted = [...points].sort((a, b) => a.horizon_h - b.horizon_h);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return `Mean absolute error ${last.mae > first.mae ? 'rises' : last.mae < first.mae ? 'falls' : 'is unchanged'} from ${gw(first.mae, 1)} at ${first.horizon_h} h to ${gw(last.mae, 1)} at ${last.horizon_h} h. Also shows 90th-percentile absolute error and mean error (bias).`;
}

export function histogramSummary(histogram: Accuracy['histogram']) {
  const total = histogram.reduce((sum, bin) => sum + bin.count, 0);
  if (!total) return 'No error distribution.';
  const high = histogram.filter((bin) => bin.from >= 0).reduce((sum, bin) => sum + bin.count, 0);
  return `Error distribution for ${number(total)} hours; ${pct(high / total)} in non-negative error bins (forecast high). ${histogramInterval(Math.min(...histogram.map((bin) => bin.from)), Math.max(...histogram.map((bin) => bin.to)))}.`;
}

export function byHourSummary(points: Accuracy['by_hour'], deliveryDate: string) {
  if (!points.length) return 'No errors by hour of day.';
  const worst = points.reduce((a, b) => a.mae >= b.mae ? a : b);
  const best = points.reduce((a, b) => a.mae <= b.mae ? a : b);
  const hour = (value: number) => ukHour(`${deliveryDate}T${String(value).padStart(2, '0')}:00:00Z`);
  return `Mean absolute error by UK delivery hour: lowest ${gw(best.mae)} at ${hour(best.hour)}, highest ${gw(worst.mae)} at ${hour(worst.hour)}. Also shows mean error (bias).`;
}
