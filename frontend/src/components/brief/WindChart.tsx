import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, Tooltip, XAxis, YAxis, type LabelProps } from 'recharts';
import type { Brief, BriefHour } from '../../api';
import { gw, ukHour, ukStamp } from '../../format';
import { axisTick, Card, ChartFrame, ChartTooltip, Legend, useMediaQuery } from '../ui';
import { largestOverForecast, signedValue, widestBandWindow, windAxis, type ForecastRun } from './helpers';

export function WindChart({ brief, previous, showPrevious, setShowPrevious, showLater, setShowLater, showActual, setShowActual }: {
  brief: Brief;
  previous: ForecastRun | undefined;
  showPrevious: boolean;
  setShowPrevious: (show: boolean) => void;
  showLater: boolean;
  setShowLater: (show: boolean) => void;
  showActual: boolean;
  setShowActual: (show: boolean) => void;
}) {
  const narrow = useMediaQuery('(max-width: 640px)');
  const window = widestBandWindow(brief.hours);
  const miss = showActual ? largestOverForecast(brief.hours) : null;
  const later = brief.runs.filter((run) => Date.parse(run.published) > Date.parse(brief.decision_at));
  const data = brief.hours.map((hour, index) => ({
    ...hour,
    timestamp: Date.parse(hour.time),
    band: hour.p10 != null && hour.p90 != null ? [hour.p10, hour.p90] : null,
    previous: showPrevious ? previous?.values[index] : null,
    ...Object.fromEntries(showLater ? later.map((run, runIndex) => [`later${runIndex}`, run.values[index]]) : []),
  }));
  const axis = windAxis(brief.hours.flatMap((hour, index) => [
    hour.forecast, hour.p90,
    ...(showActual ? [hour.actual] : []),
    ...(showPrevious ? [previous?.values[index]] : []),
    ...(showLater ? later.map((run) => run.values[index]) : []),
  ]));
  const ticks = data.filter((_, index) => index % (narrow ? 6 : 3) === 0).map((hour) => hour.timestamp);
  const used = brief.runs_used;

  return (
    <Card title="Wind generation · GW" tools={
      <>
        <label className="toggle">
          <input type="checkbox" checked={showPrevious} disabled={!previous} onChange={(e) => setShowPrevious(e.target.checked)} />
          Previous run
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showLater} disabled={!later.length} onChange={(e) => setShowLater(e.target.checked)} />
          Later runs
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} />
          Outturn
        </label>
      </>
    }>
      <div className="chart chart--tall">
        <ChartFrame height={narrow ? 280 : 340}>
          {({ width, height }) => (
            <ComposedChart width={width} height={height} data={data} margin={{ top: 24, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="timestamp" type="number" scale="time" ticks={ticks}
                domain={data.length ? [data[0].timestamp, data[data.length - 1].timestamp + 3_600_000] : [0, 1]}
                tick={axisTick} tickFormatter={(time: number) => ukHour(new Date(time).toISOString())}
                stroke="var(--axis)" tickLine={false}
              />
              <YAxis tick={axisTick} stroke="var(--axis)" tickLine={false} axisLine={false}
                tickFormatter={(value: number) => String(value / 1000)} domain={[0, axis.upper]} ticks={axis.ticks} width={32} />
              <Tooltip content={<WindTooltip showActual={showActual} />} />
              {window && (
                <ReferenceArea x1={Date.parse(window.start)} x2={Date.parse(window.end)}
                  fill="var(--accent-bg)" fillOpacity={0.65} stroke="none" ifOverflow="hidden"
                  label={{ value: 'widest band', position: 'insideTop', fontSize: 11, fill: 'var(--muted)' }} />
              )}
              <Area dataKey="band" stroke="none" fill="var(--c-band)" isAnimationActive={false} />
              {showPrevious && previous && (
                <Line dataKey="previous" stroke="var(--ink)" strokeDasharray="4 3" strokeWidth={1.25} dot={false} isAnimationActive={false} />
              )}
              {showLater && later.map((run, index) => (
                <Line key={run.published} dataKey={`later${index}`} stroke="var(--c-late)" strokeDasharray="3 3"
                  strokeWidth={1} dot={false} isAnimationActive={false} />
              ))}
              <Line dataKey="forecast" stroke="var(--c-forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
              {showActual && <Line dataKey="actual" stroke="var(--c-actual)" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
              {miss && (
                <ReferenceDot x={Date.parse(miss.time)} y={miss.forecast} r={3} fill="var(--c-forecast)" stroke="var(--card)"
                  label={(props: LabelProps) => <MissLabel {...props} chartWidth={width}
                    text={`largest over-forecast ${signedValue(miss.error / 1000, 1)} GW`} />} />
              )}
            </ComposedChart>
          )}
        </ChartFrame>
      </div>
      <Legend items={[
        { label: used.length === 1 ? `Forecast (${ukStamp(used[0])} run)` : 'Forecast (latest run per hour)', className: 'sw-forecast' },
        { label: 'P10–P90', className: 'sw-band' },
        ...(showActual ? [{ label: 'Outturn', className: 'sw-actual' }] : []),
        ...(showPrevious && previous ? [{ label: `Previous run (${ukStamp(previous.published)})`, className: 'brief-sw-previous' }] : []),
        ...(showLater && later.length ? [{ label: 'Later runs (after gate closure)', className: 'sw-late' }] : []),
      ]} />
      {window && <p className="footnote brief-band-window">Widest band {ukHour(window.start)}–{ukHour(window.end)} · up to {gw(window.maxSpan, 1)} P10–P90</p>}
    </Card>
  );
}

function MissLabel({ viewBox, chartWidth, text }: LabelProps & { chartWidth: number; text: string }) {
  if (!viewBox || !('x' in viewBox) || !('y' in viewBox)) return null;
  const x = Math.max(132, Math.min(Number(viewBox.x) + 3, chartWidth - 110));
  return <text x={x} y={Math.max(12, Number(viewBox.y) - 10)} textAnchor="middle" fontSize={11}
    fill="var(--ink)" stroke="var(--card)" strokeWidth={3} paintOrder="stroke">{text}</text>;
}

function WindTooltip({ active, payload, showActual }: {
  active?: boolean;
  payload?: { payload: BriefHour }[];
  showActual: boolean;
}) {
  const hour = payload?.[0]?.payload;
  if (!active || !hour) return null;
  const error = hour.forecast != null && hour.actual != null ? hour.forecast - hour.actual : null;
  const rows: Parameters<typeof ChartTooltip>[0]['rows'] = [
    { label: 'Forecast', value: gw(hour.forecast) },
    { label: 'P10–P90', value: hour.p10 != null && hour.p90 != null ? `${(hour.p10 / 1000).toFixed(2)}–${gw(hour.p90)}` : '–' },
  ];
  if (showActual) {
    rows.push({ label: 'Outturn', value: gw(hour.actual) });
    rows.push({
      label: 'Error',
      value: error == null ? '–' : `${signedValue(error / 1000, 2)} GW · ${error > 0 ? 'forecast high' : error < 0 ? 'forecast low' : 'on forecast'}`,
      tone: error == null || error === 0 ? 'muted' : error > 0 ? 'neg' : 'pos',
    });
  }
  return <ChartTooltip title={`${ukHour(hour.time)} UK`} rows={rows}
    footer={hour.published ? `run ${ukStamp(hour.published)} · ${hour.horizon_h ?? '–'} h ahead` : 'No eligible run'} />;
}
