import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiUrl, hasMetrics, useApi, type Accuracy, type CutoffKey, type HorizonPoint, type Insights, type Meta } from '../api';
import { dateRange, gw, mw, pct, ukDay, ukStamp } from '../format';
import { axisTick, ChartFrame, Card, Legend, Stat, Status, useMediaQuery } from './ui';

type Mode = 'decision' | 'horizon';

const gwTick = (v: number) => (v / 1000).toFixed(1);
const num = (v: number) => Math.round(v).toLocaleString('en-GB');
const shortDay = (t: number) =>
  new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });

interface DayNavigation {
  linkToDay: (day: string) => string;
  onOpenDay: (day: string) => void;
}

export function AccuracyView({ meta, cutoff, start, setStart, end, setEnd, mode, setMode, horizon, setHorizon, linkToDay, onOpenDay }: {
  meta: Meta;
  cutoff: CutoffKey;
  start: string;
  setStart: (day: string) => void;
  end: string;
  setEnd: (day: string) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  horizon: number;
  setHorizon: (horizon: number) => void;
} & DayNavigation) {
  const deliveries = useMemo(() => dateRange(meta.delivery_dates.first, meta.delivery_dates.last), [meta]);

  const accuracy = useApi<Accuracy>(
    apiUrl('/api/accuracy', { start, end, mode, cutoff, horizon_h: mode === 'horizon' ? horizon : undefined }),
  );
  const curve = useApi<{ points: HorizonPoint[] }>(apiUrl('/api/horizon-curve', { start, end }));
  const insights = useApi<Insights>(apiUrl('/api/insights'));
  const fullCurve = useApi<{ points: HorizonPoint[] }>(apiUrl('/api/horizon-curve'));
  const cutoffInfo = meta.cutoffs.find((c) => c.key === cutoff)!;
  const n = accuracy.status === 'ok' ? accuracy.data.metrics.n : null;

  return (
    <div className="view">
      <div className="pagehead">
        <div>
          <h1>Forecast accuracy</h1>
          <p className="pagehead__sub">
            WINDFOR vs metered wind, delivery {ukDay(start)} – {ukDay(end)}
            {n != null && ` · ${n} hours`}
          </p>
        </div>
      </div>

      <div className="filters">
        <label>
          From
          <select value={start} onChange={(e) => setStart(e.target.value)}>
            {deliveries
              .filter((d) => d <= end)
              .map((d) => (
                <option key={d} value={d}>
                  {ukDay(d)}
                </option>
              ))}
          </select>
        </label>
        <label>
          To
          <select value={end} onChange={(e) => setEnd(e.target.value)}>
            {deliveries
              .filter((d) => d >= start)
              .map((d) => (
                <option key={d} value={d}>
                  {ukDay(d)}
                </option>
              ))}
          </select>
        </label>
        <label>
          Forecast
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="decision">Held at gate closure ({cutoffInfo.local_time})</option>
            <option value="horizon">Fixed lead time</option>
          </select>
        </label>
        {mode === 'horizon' && (
          <label className="filters__range">
            <span>
              At least <b>{horizon} h</b> ahead
            </span>
            <input
              type="range"
              min={0}
              max={meta.max_horizon_h}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            />
          </label>
        )}
      </div>

      {accuracy.status !== 'ok' ? (
        <Status state={accuracy} label="Loading forecast accuracy…" what="forecast accuracy" minHeight={500} />
      ) : (
        <AccuracyBody
          acc={accuracy.data}
          curve={curve.status === 'ok' ? curve.data.points : []}
          marker={mode === 'horizon' ? horizon : hasMetrics(accuracy.data.metrics) ? accuracy.data.metrics.mean_horizon_h : 0}
          mode={mode}
          linkToDay={linkToDay}
          onOpenDay={onOpenDay}
        />
      )}

      {insights.status === 'ok' && fullCurve.status === 'ok' && (
        <Notes insights={insights.data} curve={fullCurve.data.points} meta={meta} />
      )}
    </div>
  );
}

/** Analyst notes on the whole pilot window. Every number is computed from the API, none is typed in. */
function Notes({ insights, curve, meta }: { insights: Insights; curve: HorizonPoint[]; meta: Meta }) {
  const epex = insights.cutoffs.epex;
  const n2ex = insights.cutoffs.n2ex;
  if (!hasMetrics(epex.metrics) || !hasMetrics(n2ex.metrics)) return null;
  const gain = 1 - n2ex.metrics.mae / epex.metrics.mae;
  const cov = epex.band_coverage.inside;
  const zeroLead = curve.find((p) => p.horizon_h === 0);
  const e = meta.cutoffs.find((c) => c.key === 'epex')!;
  const n = meta.cutoffs.find((c) => c.key === 'n2ex')!;
  const high = epex.metrics.bias > 0;

  return (
    <Card title="Notes from the January pilot">
      <ul className="notes">
        <li>
          At the {e.local_time} gate closure the forecast missed by {gw(epex.metrics.mae)} in a typical hour (MAE,{' '}
          {pct(epex.metrics.nmae)} of mean output). One hour in ten was out by more than {gw(epex.metrics.p90_abs)}.
        </li>
        <li>
          It ran {high ? 'high' : 'low'} almost all month: bias {high ? '+' : '−'}
          {gw(Math.abs(epex.metrics.bias))}
          {zeroLead && <>, and still {gw(Math.abs(zeroLead.bias))} with zero lead time</>}. Our working guess is
          curtailment, which shows up in metered output but not in WINDFOR. Wind data alone can’t confirm it.
        </li>
        <li>
          The P10–P90 band caught {pct(cov)} of outturns with each day left out of its own calibration (aim: 80%).{' '}
          {cov < 0.8 ? 'A little narrow, but usable.' : 'Good enough to plan on.'}
        </li>
        <li>
          Waiting for {n.local_time} ({n.key.toUpperCase()}) picks up a fresher run, but MAE only drops {pct(gain, 1)}.
          Not a reason to pick one auction over the other.
        </li>
      </ul>
    </Card>
  );
}

function AccuracyBody({ acc, curve, marker, mode, linkToDay, onOpenDay }: {
  acc: Accuracy;
  curve: HorizonPoint[];
  marker: number;
  mode: Mode;
} & DayNavigation) {
  const narrow = useMediaQuery('(max-width: 640px)');
  const m = acc.metrics;
  const series = useMemo(
    () => acc.series.map((p) => ({ t: new Date(p.time).getTime(), forecast: p.forecast, actual: p.actual })),
    [acc.series],
  );
  const worst = useMemo(() => [...acc.daily].sort((a, b) => b.mae - a.mae).slice(0, 8), [acc.daily]);

  if (!hasMetrics(m)) return <div className="status">No hours with both a forecast and an outturn in this range.</div>;

  return (
    <>
      <div className="stats">
        <Stat label="MAE" value={num(m.mae)} unit="MW" note={`${pct(m.nmae)} of mean output`} />
        <Stat label="RMSE" value={num(m.rmse)} unit="MW" />
        <Stat
          label="Bias"
          value={`${m.bias > 0 ? '+' : ''}${num(m.bias)}`}
          unit="MW"
          note={m.bias > 0 ? 'forecast high' : 'forecast low'}
        />
        <Stat label="P90 |error|" value={num(m.p90_abs)} unit="MW" note={`max ${num(m.max_abs)}`} />
      </div>

      <Card
        title={
          <>
            Forecast vs outturn <span className="muted">MW, hourly</span>
          </>
        }
      >
        <div className="chart chart--tall">
          <ChartFrame height={narrow ? 280 : 340}>
            {({ width, height }) => (
              <ComposedChart width={width} height={height} data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tick={axisTick}
                  stroke="var(--axis)"
                  tickLine={false}
                  tickFormatter={shortDay}
                  minTickGap={36}
                />
                <YAxis
                  tick={axisTick}
                  stroke="var(--axis)"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={num}
                  domain={[0, (max: number) => Math.ceil(max / 5000) * 5000]}
                  tickCount={6}
                  width={52}
                />
                <Tooltip formatter={(v: number) => mw(v)} labelFormatter={(t: number) => ukStamp(new Date(t).toISOString())} />
                <Line
                  dataKey="forecast"
                  name="Forecast"
                  stroke="var(--c-forecast)"
                  strokeWidth={1.25}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="actual"
                  name="Outturn"
                  stroke="var(--c-actual)"
                  strokeWidth={1.25}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            )}
          </ChartFrame>
        </div>
        <Legend
          items={[
            { label: 'Forecast', className: 'sw-forecast' },
            { label: 'Outturn', className: 'sw-actual' },
          ]}
        />
      </Card>

      <div className="split">
        <Card
          title={
            <>
              Error vs lead time <span className="muted">GW</span>
            </>
          }
        >
          <div className="chart">
            <ChartFrame height={260}>
              {({ width, height }) => (
                <LineChart width={width} height={height} data={curve} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis
                    dataKey="horizon_h"
                    type="number"
                    domain={[0, 48]}
                    ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
                    tickFormatter={(h: number) => `${h}h`}
                    tick={axisTick}
                    stroke="var(--axis)"
                    tickLine={false}
                  />
                  <YAxis
                    tick={axisTick}
                    stroke="var(--axis)"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={gwTick}
                    width={32}
                  />
                  <Tooltip formatter={(v: number) => mw(v)} labelFormatter={(h) => `≥ ${h} h ahead`} />
                  <ReferenceLine
                    x={Math.round(marker)}
                    stroke="var(--axis)"
                    strokeDasharray="2 3"
                    label={{
                      value: mode === 'decision' ? 'avg at GC' : 'selected',
                      fontSize: 10,
                      position: 'top',
                      fill: 'var(--muted)',
                    }}
                  />
                  <Line
                    dataKey="p90_abs"
                    name="P90 |error|"
                    stroke="var(--c-p90)"
                    strokeWidth={1.25}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line dataKey="mae" name="MAE" stroke="var(--c-forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line
                    dataKey="bias"
                    name="Bias"
                    stroke="var(--c-bias)"
                    strokeWidth={1.25}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              )}
            </ChartFrame>
          </div>
          <Legend
            items={[
              { label: 'MAE', className: 'sw-forecast' },
              { label: 'P90 |error|', className: 'sw-p90' },
              { label: 'Bias', className: 'sw-bias' },
            ]}
          />
        </Card>

        <Card
          title={
            <>
              Error distribution <span className="muted">forecast − outturn, hours per 0.5 GW</span>
            </>
          }
        >
          <div className="chart">
            <ChartFrame height={260}>
              {({ width, height }) => (
                <BarChart width={width} height={height} data={acc.histogram} margin={{ top: 16, right: 8, bottom: 4, left: 0 }} barCategoryGap={1}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="from" tick={axisTick} stroke="var(--axis)" tickLine={false} tickFormatter={gwTick} />
                  <YAxis tick={axisTick} stroke="var(--axis)" tickLine={false} axisLine={false} width={32} />
                  <Tooltip
                    formatter={(v: number) => [`${v} h`, 'hours']}
                    labelFormatter={(from: number) => `${gw(from, 1)} to ${gw(from + 500, 1)}`}
                  />
                  <Bar dataKey="count" isAnimationActive={false}>
                    {acc.histogram.map((b) => (
                      <Cell key={b.from} fill={b.from >= 0 ? 'var(--c-short)' : 'var(--c-long)'} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ChartFrame>
          </div>
          <Legend
            items={[
              { label: 'Forecast high (book short)', className: 'sw-short' },
              { label: 'Forecast low (book long)', className: 'sw-long' },
            ]}
          />
        </Card>
      </div>

      <div className="split">
        <Card
          title={
            <>
              By hour of day <span className="muted">GW</span>
            </>
          }
        >
          <div className="chart">
            <ChartFrame height={260}>
              {({ width, height }) => (
                <ComposedChart width={width} height={height} data={acc.by_hour} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={axisTick}
                    stroke="var(--axis)"
                    tickLine={false}
                    tickFormatter={(h: number) => String(h).padStart(2, '0')}
                    interval={2}
                  />
                  <YAxis
                    tick={axisTick}
                    stroke="var(--axis)"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={gwTick}
                    width={32}
                  />
                  <Tooltip formatter={(v: number) => mw(v)} labelFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`} />
                  <Bar dataKey="mae" name="MAE" fill="var(--c-band-strong)" isAnimationActive={false} />
                  <Line
                    dataKey="bias"
                    name="Bias"
                    stroke="var(--c-bias)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              )}
            </ChartFrame>
          </div>
          <Legend
            items={[
              { label: 'MAE', className: 'sw-band' },
              { label: 'Bias', className: 'sw-bias' },
            ]}
          />
        </Card>

        <Card flush title="Worst days">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Delivery</th>
                  <th>Forecast</th>
                  <th>Outturn</th>
                  <th>MAE</th>
                </tr>
              </thead>
              <tbody>
                {worst.map((d) => (
                  <tr key={d.date}>
                    <td>
                      <a href={linkToDay(d.date)} onClick={(e) => {
                        if (e.button !== 0 || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
                        e.preventDefault();
                        onOpenDay(d.date);
                      }}>{ukDay(d.date)}</a>
                    </td>
                    <td>{(d.forecast_mwh / 1000).toFixed(0)} GWh</td>
                    <td>{(d.actual_mwh / 1000).toFixed(0)} GWh</td>
                    <td>{num(d.mae)} MW</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
