import { describe, expect, it } from 'vitest';
import type { Brief, BriefHour } from '../../api';
import { toCsv } from '../../format';
import { bandSpan, buildCsvRows, csvFilename, forecastRunRows, gwhValue, largestOverForecast, runRevision, signedValue, widestBandWindow, windAxis } from './helpers';

const used = '2026-01-14T07:30:00Z';
const previous = '2026-01-14T04:30:00Z';

function hour(index: number, overrides: Partial<BriefHour> = {}): BriefHour {
  return {
    time: `2026-01-15T${String(index).padStart(2, '0')}:00:00Z`,
    forecast: 4000, actual: 3000, p10: 2000, p90: 5000, published: used, horizon_h: 16.5 + index,
    ...overrides,
  };
}

function brief(overrides: Partial<Brief> = {}): Brief {
  return {
    delivery_date: '2026-01-15', decision_date: '2026-01-14', decision_at: '2026-01-14T09:20:00Z',
    runs_used: [used], hours: [hour(0), hour(1), hour(2)],
    runs: [
      { published: previous, usable: true, values: [4200, 2500, 5500] },
      { published: used, usable: true, values: [4000, 4000, 4000] },
    ],
    totals_mwh: { forecast: 12000, p10: 6000, p90: 15000, actual: 9000 }, calibration_days: 30,
    ...overrides,
  };
}

describe('run revision', () => {
  it('uses the latest eligible earlier run, irrespective of run order or later publications', () => {
    const snapshot = brief();
    snapshot.runs.reverse();
    snapshot.runs.push(
      { published: '2026-01-14T02:30:00Z', usable: true, values: [100, 100, 100] },
      { published: '2026-01-14T06:30:00Z', usable: false, values: [100, 100, 100] },
      { published: '2026-01-14T09:30:00Z', usable: true, values: [100, 100, 100] },
    );
    const result = runRevision(snapshot)!;
    expect(result.previous.published).toBe(previous);
    expect(result.deltaMwh).toBe(-200);
    expect(result.overlap).toBe(3);
    expect(result.largest).toEqual({ time: hour(1).time, delta: 1500 });
  });

  it('compares only overlapping hours and preserves the sign of the largest change', () => {
    const snapshot = brief();
    snapshot.hours[0].forecast = null;
    snapshot.runs[0].values = [1, null, 6500];
    expect(runRevision(snapshot)).toMatchObject({ overlap: 1, deltaMwh: -2500, largest: { time: hour(2).time, delta: -2500 } });
  });

  it('compares mixed snapshots to the eligible run before all used runs', () => {
    const snapshot = brief({ runs_used: [used, previous] });
    snapshot.runs.push({ published: '2026-01-14T02:30:00Z', usable: true, values: [3500, 3500, 3500] });
    expect(runRevision(snapshot)).toMatchObject({ previous: { published: '2026-01-14T02:30:00Z' }, deltaMwh: 1500 });
  });

  it('does not mutate the runs or hours', () => {
    const snapshot = brief();
    const original = structuredClone(snapshot);
    runRevision(snapshot);
    expect(snapshot).toEqual(original);
  });

  it('returns no comparison without a used run, eligible predecessor or overlap', () => {
    expect(runRevision(brief({ runs_used: [] }))).toBeNull();
    expect(runRevision(brief({ runs: [] }))).toBeNull();
    const snapshot = brief();
    snapshot.runs[0].values = [null, null, null];
    expect(runRevision(snapshot)).toBeNull();
  });
});

describe('uncertainty window', () => {
  const hoursWithSpans = (spans: (number | null)[]) => spans.map((span, index) => hour(index, { p10: 0, p90: span }));

  it('groups adjacent ties and near-ties within 5%, with an exclusive end', () => {
    expect(widestBandWindow(hoursWithSpans([500, 950, 1000, 960, 949]))).toEqual({
      start: hour(1).time, end: '2026-01-15T04:00:00.000Z', maxSpan: 1000,
    });
  });

  it('does not bridge narrow or missing hours and picks the longest group with a maximum', () => {
    expect(widestBandWindow(hoursWithSpans([1000, null, 960, 1000, 970, 500, 990]))).toMatchObject({ start: hour(2).time, end: '2026-01-15T05:00:00.000Z' });
  });

  it('keeps the true maximum rather than a longer, slightly narrower group', () => {
    expect(widestBandWindow(hoursWithSpans([1000, 100, 980, 990, 980]))).toMatchObject({ start: hour(0).time, end: '2026-01-15T01:00:00.000Z' });
  });

  it('resolves separated equal windows to the earliest and respects timestamp gaps', () => {
    expect(widestBandWindow(hoursWithSpans([1000, 100, 1000]))).toMatchObject({ start: hour(0).time });
    expect(widestBandWindow([hour(0), hour(2)])).toMatchObject({ start: hour(0).time, end: '2026-01-15T01:00:00.000Z' });
  });

  it('covers a single final hour through midnight and handles absent or zero bands', () => {
    expect(widestBandWindow([hour(23)])).toMatchObject({ end: '2026-01-16T00:00:00.000Z' });
    expect(widestBandWindow([])).toBeNull();
    expect(widestBandWindow(hoursWithSpans([null, 0]))).toBeNull();
    expect(bandSpan(hour(0, { p10: null }))).toBeNull();
    expect(bandSpan(hour(0))).toBe(3000);
  });
});

describe('largest over-forecast', () => {
  it('chooses the largest positive error and ignores larger negative errors or missing values', () => {
    expect(largestOverForecast([
      hour(0, { actual: 10000 }), hour(1, { actual: null }), hour(2, { actual: 1200 }), hour(3, { forecast: null }),
    ])).toEqual({ time: hour(2).time, forecast: 4000, error: 2800 });
  });

  it('returns no marker when there is no positive error', () => {
    expect(largestOverForecast([hour(0, { actual: 4000 }), hour(1, { actual: 5000 })])).toBeNull();
    expect(largestOverForecast([])).toBeNull();
  });
});

describe('traceable CSV', () => {
  it('exports the exact ordered schema, unrounded bounds and UTC interval ends', () => {
    const snapshot = brief({ hours: [hour(23, { p10: 2000.25, p90: 5000.75 })] });
    const rows = buildCsvRows(snapshot, 'epex', true);
    expect(rows).toEqual([{
      delivery_date_uk: '2026-01-15', decision_at_utc: '2026-01-14T09:20:00.000Z', cutoff: 'epex',
      interval_start_utc: '2026-01-15T23:00:00.000Z', interval_end_utc: '2026-01-16T00:00:00.000Z',
      forecast_mw: 4000, p10_mw: 2000.25, p90_mw: 5000.75, span_mw: 3000.5,
      forecast_published_utc: '2026-01-14T07:30:00.000Z', lead_h: 39.5, actual_halfhour_start_mw: 3000,
    }]);
    expect(toCsv(rows).split('\n')[0]).toBe('delivery_date_uk,decision_at_utc,cutoff,interval_start_utc,interval_end_utc,forecast_mw,p10_mw,p90_mw,span_mw,forecast_published_utc,lead_h,actual_halfhour_start_mw');
  });

  it('omits actuals from the schema when hidden and keeps missing source data blank', () => {
    const snapshot = brief({ hours: [hour(0, { forecast: null, p10: null, published: undefined, horizon_h: undefined })] });
    const rows = buildCsvRows(snapshot, 'n2ex', false);
    expect(rows[0]).not.toHaveProperty('actual_halfhour_start_mw');
    expect(rows[0]).toMatchObject({ forecast_mw: null, span_mw: null, forecast_published_utc: null, lead_h: null, cutoff: 'n2ex' });
    expect(toCsv(rows)).not.toContain('undefined');
    expect(buildCsvRows(brief({ hours: [] }), 'epex', true)).toEqual([]);
  });

  it('normalizes offset times to UTC and derives filenames from the actual UK decision time', () => {
    const snapshot = brief({ decision_at: '2026-01-14T10:50:00+01:00' });
    expect(buildCsvRows(snapshot, 'n2ex', false)[0].decision_at_utc).toBe('2026-01-14T09:50:00.000Z');
    expect(csvFilename(snapshot, 'n2ex')).toBe('wind-2026-01-15-n2ex-0950.csv');
    expect(csvFilename(brief(), 'epex')).toBe('wind-2026-01-15-epex-0920.csv');
  });
});

describe('forecast run table', () => {
  it('sorts chronologically, tags every used run and identifies runs after the decision', () => {
    const snapshot = brief({ runs_used: [used, previous] });
    snapshot.runs.reverse();
    snapshot.runs.push({ published: '2026-01-14T09:30:00Z', usable: false, values: [4100, 4100, 4100] });
    expect(forecastRunRows(snapshot)).toMatchObject([
      { published: previous, used: true, full: true, delta: null, lead: 19.5 },
      { published: used, used: true, total: 12000, delta: -200 },
      { late: true, used: false, delta: 300 },
    ]);
  });

  it('does not show a daily change across a partial run or include intraday runs', () => {
    const snapshot = brief();
    snapshot.runs.splice(1, 0, { published: '2026-01-14T06:30:00Z', usable: true, values: [null, 3900, 4000] });
    snapshot.runs.push({ published: hour(0).time, usable: false, values: [1, 1, 1] });
    const rows = forecastRunRows(snapshot);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ full: false, covered: 2, delta: null });
    expect(rows[2].delta).toBeNull();
    expect(forecastRunRows(brief({ hours: [] }))).toEqual([]);
  });
});

describe('display helpers', () => {
  it('uses whole-GW ticks covering every visible series, including high later runs', () => {
    for (const values of [[], [null], [550], [15834, null, 30000], [99999]]) {
      const axis = windAxis(values);
      expect(axis.upper).toBeGreaterThanOrEqual(Math.max(0, ...values.map((value) => value ?? 0)));
      expect(axis.ticks.every((tick) => Number.isInteger(tick / 1000))).toBe(true);
      expect(axis.ticks[0]).toBe(0);
      expect(axis.ticks.at(-1)).toBe(axis.upper);
    }
  });

  it('formats signed revisions without negative zero and preserves zero energy', () => {
    expect(signedValue(-0.01, 1)).toBe('+0.0');
    expect(signedValue(-1234)).toBe('−1,234');
    expect(signedValue(0.92, 2)).toBe('+0.92');
    expect(gwhValue(0)).toBe('0.0');
    expect(gwhValue(null)).toBe('–');
  });
});
