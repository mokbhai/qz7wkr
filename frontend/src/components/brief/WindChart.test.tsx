import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Brief } from '../../api';
import { WindChart } from './WindChart';

const media = vi.hoisted(() => ({ narrow: false }));

vi.mock('../ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('../ui')>(),
  ChartFrame: ({ height, children }: { height: number; children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height }),
  useMediaQuery: () => media.narrow,
}));

const brief: Brief = {
  delivery_date: '2026-01-28', decision_date: '2026-01-27', decision_at: '2026-01-27T09:20:00Z',
  runs_used: ['2026-01-27T07:30:00Z'], runs: [], calibration_days: 30,
  totals_mwh: { forecast: 267000, p10: 200000, p90: 300000, actual: 139000 },
  hours: Array.from({ length: 24 }, (_, index) => ({
    time: `2026-01-28T${String(index).padStart(2, '0')}:00:00Z`,
    forecast: 9000 + index * 200, actual: 6000, p10: 7000, p90: index === 22 ? 20000 : 18000,
  })),
};

function renderChart(snapshot = brief) {
  return renderToStaticMarkup(<WindChart brief={snapshot} previous={undefined} showPrevious={false} setShowPrevious={() => {}}
    showLater={false} setShowLater={() => {}} showActual setShowActual={() => {}} />);
}

describe('wind chart rendering', () => {
  it.each([false, true])('fills the plot through 23:00 and keeps hour ticks (narrow: %s)', (narrow) => {
    media.narrow = narrow;
    const markup = renderChart();
    const lines = [...markup.matchAll(/<path\b[^>]*class="[^"]*recharts-line-curve[^"]*"[^>]*>/g)];
    expect(lines).toHaveLength(2);
    for (const [line] of lines) {
      const path = line.match(/\bd="([^"]+)"/)?.[1];
      expect(path).toMatch(/^M32,/);
      expect(path).toMatch(/L790,[\d.]+$/);
    }
    const labels = [...markup.matchAll(/<tspan\b[^>]*>(\d{2}:\d{2})<\/tspan>/g)].map((match) => match[1]);
    expect(labels).toEqual(narrow ? ['00:00', '06:00', '12:00', '18:00']
      : ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00']);
  });

  it.each([22, 23])('aligns widest-band shading at %s:00 without extending the axis', (hour) => {
    const snapshot = { ...brief, hours: brief.hours.map((point, index) => ({ ...point, p90: index === hour ? 20000 : 18000 })) };
    const markup = renderChart(snapshot);
    const area = markup.match(/<path\b[^>]*class="[^"]*recharts-reference-area-rect[^"]*"[^>]*>/)?.[0];
    expect(area).toBeDefined();
    expect(area).toContain('clip-path="url(#');
    const x = Number(area?.match(/\bx="([^"]+)"/)?.[1]);
    const width = Number(area?.match(/\bwidth="([^"]+)"/)?.[1]);
    expect(x).toBeCloseTo(32 + (790 - 32) * hour / 23);
    expect(width).toBeCloseTo((790 - 32) / 23);
    expect(markup).toMatch(/class="recharts-curve recharts-line-curve"[^>]*d="[^"]*L790,[\d.]+"/);
  });

  it('labels the chart and enables keyboard exploration of the plotted data', () => {
    const markup = renderChart();
    expect(markup).toContain('role="img" aria-label="Wind forecast for Wed 28 Jan from the 27 Jan 07:30 run: 267 GWh, ranging 9.0 to 13.6 GW; outturn 139 GWh."');
    expect(markup).toMatch(/<svg\b[^>]*tabindex="0"[^>]*role="application"/);
  });
});
