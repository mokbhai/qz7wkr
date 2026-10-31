import { describe, expect, it } from 'vitest';
import type { Accuracy, HorizonPoint } from '../../api';
import {
  byHourSummary, errorTone, forecastSummary, histogramBarWidth, histogramGeometry, histogramInterval,
  histogramSummary, leadHours, leadRange, leadSummary, niceTicks, number, powerTicks, signedGw,
} from './helpers';

const series: Accuracy['series'] = [
  { time: '2026-01-02T00:00:00Z', published: '2026-01-01T07:30:00Z', forecast: 4000, actual: 3000 },
  { time: '2026-01-02T23:00:00Z', published: '2026-01-01T07:30:00Z', forecast: 3000, actual: 2000 },
];
const point = (horizon_h: number, mae: number): HorizonPoint => ({ horizon_h, mae, n: 24, bias: 1000, rmse: 2000, p90_abs: 3000 });

describe('histogram geometry', () => {
  const bins = [{ from: -1500, to: -1000, count: 2 }, { from: 0, to: 500, count: 6 }, { from: 500, to: 1500, count: 2 }];

  it('uses outer edges and midpoints in GW, with whole-GW ticks', () => {
    const geometry = histogramGeometry(bins);
    expect(geometry.domain).toEqual([-1.5, 1.5]);
    expect(geometry.ticks).toEqual([-1, 0, 1]);
    expect(geometry.bins.map((bin) => bin.midpoint)).toEqual([-1.25, 0.25, 1]);
    expect(geometry.bins[1].count).toBe(6);
    expect(bins[1]).not.toHaveProperty('midpoint');
  });

  it('preserves unequal bin widths and leaves a pixel gap', () => {
    expect(histogramBarWidth(-1500, -1000, 600, [-1.5, 1.5])).toBe(99);
    expect(histogramBarWidth(500, 1500, 600, [-1.5, 1.5])).toBe(199);
    expect(histogramBarWidth(0, 500, -2, [-1.5, 1.5])).toBe(0);
  });

  it('handles empty histograms and narrow domains', () => {
    expect(histogramGeometry([])).toEqual({ bins: [], domain: [-1, 1], ticks: [-1, 0, 1] });
    expect(histogramGeometry([{ from: 100, to: 400, count: 2 }]).ticks).toEqual([]);
  });

  it('uses each bin’s edges in signed tooltip intervals', () => {
    expect(histogramInterval(1000, 1500)).toBe('+1.0 ≤ error < +1.5 GW');
    expect(histogramInterval(-1000, 0)).toBe('-1.0 ≤ error < 0.0 GW');
  });

  it('summarises counts and sign without claiming all zero-bin values are positive', () => {
    expect(histogramSummary(bins)).toContain('10 hours; 80% in non-negative error bins');
    expect(histogramSummary([])).toBe('No error distribution.');
    expect(histogramSummary([{ from: 0, to: 500, count: 0 }])).toBe('No error distribution.');
  });
});

describe('held lead times', () => {
  it('retains fractional hours across dates and uses the entire series', () => {
    expect(leadHours(series[0])).toBe(16.5);
    expect(leadRange(series)).toEqual([16.5, 39.5]);
    expect(leadRange([...series].reverse())).toEqual([16.5, 39.5]);
  });

  it('ignores invalid or negative leads and handles no matches', () => {
    expect(leadRange([])).toBeNull();
    expect(leadRange([{ ...series[0], published: 'invalid' }])).toBeNull();
    expect(leadRange([{ ...series[0], published: '2026-01-03T00:00:00Z' }, series[0]])).toEqual([16.5, 16.5]);
  });
});

describe('accessible summaries', () => {
  it('describes forecast scope and computes signed mean error', () => {
    expect(forecastSummary(series)).toContain('2 hours, 2 Jan, 00:00 to 2 Jan, 23:00');
    expect(forecastSummary(series)).toContain('Mean error +1.00 GW');
    expect(forecastSummary([])).toBe('No forecast and outturn pairs.');
  });

  it('sorts lead-time endpoints and describes rising, falling and flat MAE', () => {
    const points = [point(48, 2300), point(0, 1700)];
    expect(leadSummary(points)).toContain('rises from 1.7 GW at 0 h to 2.3 GW at 48 h');
    expect(points[0].horizon_h).toBe(48);
    expect(leadSummary([point(0, 2000), point(48, 1000)])).toContain('falls');
    expect(leadSummary([point(0, 1000)])).toContain('is unchanged');
    expect(leadSummary([])).toBe('No lead-time errors.');
  });

  it('finds the best and worst hours without assuming input order', () => {
    expect(byHourSummary([{ hour: 23, mae: 2200, bias: 1900 }, { hour: 3, mae: 1100, bias: 500 }], '2026-01-02'))
      .toContain('lowest 1.10 GW at 03:00, highest 2.20 GW at 23:00');
    expect(byHourSummary([], '2026-01-02')).toBe('No errors by hour of day.');
  });
});

describe('metric presentation', () => {
  it('uses round steps with four to six non-negative ticks for GW error ranges', () => {
    for (const max of [0, 0.1, 0.9, 1.3, 2.6, 4.1, 7.4, 9.9, 12, 24.9]) {
      const ticks = niceTicks(max);
      const step = ticks[1];
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(max);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks.length).toBeLessThanOrEqual(6);
      expect([0.25, 0.5, 1, 2, 5]).toContain(step);
      expect(ticks.every((tick, index) => tick === index * step)).toBe(true);
    }
    expect(niceTicks(2.6)).toEqual([0, 1, 2, 3]);
  });

  it('handles empty or invalid maxima and keeps signed bias on the same round step', () => {
    for (const max of [-1, NaN, Infinity, -Infinity]) {
      expect(niceTicks(max)).toEqual([0, 0.25, 0.5, 0.75]);
    }
    const ticks = niceTicks(2.6);
    expect(powerTicks([-0.65, 2.6, ticks[ticks.length - 1]], ticks[1])).toEqual([-1, 0, 1, 2, 3]);
    expect(niceTicks(30).at(-1)).toBe(30);
  });

  it('creates readable power ticks covering positive, negative and empty values', () => {
    expect(powerTicks([21.4, 0.8], 5)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(powerTicks([4.7, -1.1], 1)).toEqual([-2, -1, 0, 1, 2, 3, 4, 5]);
    expect(powerTicks([], 1)).toEqual([0, 1]);
    expect(powerTicks([0], 1)).toEqual([0, 1]);
  });

  it('formats rounded numbers and signed GW', () => {
    expect(number(2022.47)).toBe('2,022');
    expect(signedGw(1750)).toBe('+1.75 GW');
    expect(signedGw(-1750)).toBe('-1.75 GW');
    expect(signedGw(0)).toBe('0.00 GW');
  });

  it('treats positive errors as a shortfall and negative errors as surplus', () => {
    expect(errorTone(1)).toBe('neg');
    expect(errorTone(-1)).toBe('pos');
    expect(errorTone(0)).toBe('muted');
  });
});
