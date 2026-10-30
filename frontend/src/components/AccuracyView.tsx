import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiUrl, useApi, type Accuracy, type CutoffKey, type HorizonPoint, type Insights, type Meta } from '../api';
import { dateRange, gw, gwh, mw, pct, signed, ukDay, ukStamp } from '../format';
import { Eyebrow, Kpi, Legend, Panel, Segmented, Status, ViewHead } from './ui';

type Mode = 'decision' | 'horizon';

const gwTick = (v: number) => `${(v / 1000).toFixed(1)}`;

export function AccuracyView({ meta, cutoff }: { meta: Meta; cutoff: CutoffKey }) {
  const deliveries = useMemo(() => dateRange(meta.delivery_dates.first, meta.delivery_dates.last), [meta]);
  const [start, setStart] = useState(meta.delivery_dates.first);
  const [end, setEnd] = useState(meta.delivery_dates.last);
  const [mode, setMode] = useState<Mode>('decision');
  const [horizon, setHorizon] = useState(24);

  const accuracy = useApi<Accuracy>(
    apiUrl('/api/accuracy', { start, end, mode, cutoff, horizon_h: mode === 'horizon' ? horizon : undefined }),
  );
  const curve = useApi<{ points: HorizonPoint[] }>(apiUrl('/api/horizon-curve', { start, end }));
  const insights = useApi<Insights>(apiUrl('/api/insights'));
  const cutoffInfo = meta.cutoffs.find((c) => c.key === cutoff)!;

  return (
    <div className="view">
      <ViewHead
        eyebrow="Forecast accuracy"
        title={
          <>
            How far to <em>trust</em> the forecast.
          </>
        }
        lede="Each figure compares a forecast the desk could actually have used with metered outturn, so the error you see is the error you would have traded on."
      />

      {insights.status === 'ok' && <Findings insights={insights.data} meta={meta} />}

      <div className="toolbar">
        <div className="field">
          <label htmlFor="from">Delivery from</label>
          <select id="from" value={start} onChange={(e) => setStart(e.target.value)}>
            {deliveries.filter((d) => d <= end).map((d) => (
              <option key={d} value={d}>
                {ukDay(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="to">to</label>
          <select id="to" value={end} onChange={(e) => setEnd(e.target.value)}>
            {deliveries.filter((d) => d >= start).map((d) => (
              <option key={d} value={d}>
                {ukDay(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="field__label">Which forecast</span>
          <Segmented<Mode>
            label="Forecast selection"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'decision', label: `At gate closure (${cutoffInfo.local_time})`, title: 'What the desk actually had' },
              { value: 'horizon', label: 'Fixed lead time', title: 'Latest forecast at least N hours old' },
            ]}
          />
        </div>
        {mode === 'horizon' && (
          <div className="field field--grow">
            <label htmlFor="horizon">
              Lead time ≥ <strong>{horizon} h</strong>
            </label>
            <input
              id="horizon"
              type="range"
              min={0}
              max={meta.max_horizon_h}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            />
          </div>
        )}
      </div>

      {accuracy.status !== 'ok' ? (
        <Status state={accuracy} />
      ) : (
        <AccuracyBody
          acc={accuracy.data}
          curve={curve.status === 'ok' ? curve.data.points : []}
          marker={mode === 'horizon' ? horizon : accuracy.data.metrics.mean_horizon_h}
          mode={mode}
        />
      )}
    </div>
  );
}

function Findings({ insights, meta }: { insights: Insights; meta: Meta }) {
  const epex = insights.cutoffs.epex;
  const n2ex = insights.cutoffs.n2ex;
  const gain = 1 - n2ex.metrics.mae / epex.metrics.mae;
  const [e, n] = [meta.cutoffs.find((c) => c.key === 'epex')!, meta.cutoffs.find((c) => c.key === 'n2ex')!];
  return (
    <section className="findings" aria-label="Pilot findings">
      <Eyebrow>What the pilot shows · all January 2026 decisions</Eyebrow>
      <ol>
        {[
          <>
            <strong>The typical miss at gate closure is {gw(epex.metrics.mae)}</strong>, {pct(epex.metrics.nmae)} of average
            wind output. One hour in ten misses by more than {gw(epex.metrics.p90_abs)}.
          </>,
          <>
            <strong>
              The forecast runs {epex.metrics.bias > 0 ? 'high' : 'low'}, by {gw(Math.abs(epex.metrics.bias))} on average.
            </strong>{' '}
            Buying against the raw number leaves the book {epex.metrics.bias > 0 ? 'short' : 'long'}. The P10 plan figure
            corrects for it.
          </>,
          <>
            <strong>The range holds up.</strong> Tested on days it never saw, the P10–P90 band caught{' '}
            {pct(epex.band_coverage.inside)} of outturns against an 80% target.
          </>,
          <>
            <strong>
              Waiting until {n.local_time} {gain < 0.05 ? 'barely helps' : 'helps'}: {pct(gain, 1)} less error.
            </strong>{' '}
            A fresher run lands between {e.local_time} and {n.local_time}, but it changes little. Pick the auction on price,
            not on forecast freshness.
          </>,
        ].map((body, i) => (
          <li key={i}>
            <span className="findings__num">{String(i + 1).padStart(2, '0')}</span>
            <span>{body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AccuracyBody({ acc, curve, marker, mode }: { acc: Accuracy; curve: HorizonPoint[]; marker: number; mode: Mode }) {
  const m = acc.metrics;
  const series = useMemo(
    () => acc.series.map((p) => ({ t: new Date(p.time).getTime(), forecast: p.forecast, actual: p.actual })),
    [acc.series],
  );
  const worst = useMemo(() => [...acc.daily].sort((a, b) => b.mae - a.mae).slice(0, 7), [acc.daily]);

  if (m.n === 0) return <div className="status">No overlapping forecast and outturn in this range.</div>;

  return (
    <>
      <div className="kpis">
        <Kpi tone="brand" label="Mean absolute error" value={mw(m.mae)} sub={`${pct(m.nmae)} of mean outturn`} />
        <Kpi label="RMSE" value={mw(m.rmse)} sub="penalises big misses" />
        <Kpi label="Bias · forecast − outturn" value={signed(mw(m.bias), m.bias)} sub={m.bias > 0 ? 'runs high: leaves the book short' : 'runs low: leaves the book long'} />
        <Kpi label="P90 absolute error" value={mw(m.p90_abs)} sub={`P99 ${mw(m.p99_abs)} · max ${mw(m.max_abs)}`} />
        <Kpi label="Sample" value={`${m.n} h`} sub={`mean lead ${m.mean_horizon_h.toFixed(1)} h`} />
      </div>

      <div className="grid-2">
        <Panel eyebrow="Lead time" title="Error grows with lead time" note="Latest forecast at least N hours before delivery, same date range.">
          <Legend
            items={[
              { label: 'MAE', className: 'sw-forecast' },
              { label: 'P90 |error|', className: 'sw-p90' },
              { label: 'Bias', className: 'sw-bias' },
            ]}
          />
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={curve} margin={{ top: 22, right: 12, bottom: 16, left: 8 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="horizon_h"
                  type="number"
                  domain={[0, 48]}
                  ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
                  tick={{ fontSize: 12 }}
                  stroke="var(--axis)"
                  label={{ value: 'lead time (h)', position: 'insideBottom', offset: -8, fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--axis)" tickFormatter={gwTick} width={40} unit="" label={{ value: 'GW', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                <Tooltip formatter={(v: number) => mw(v)} labelFormatter={(h) => `lead ≥ ${h} h`} />
                <ReferenceLine
                  x={Math.round(marker)}
                  stroke="var(--axis)"
                  strokeDasharray="3 3"
                  label={{ value: mode === 'decision' ? 'gate closure (avg)' : 'selected', fontSize: 11, position: 'top' }}
                />
                <Line dataKey="mae" name="MAE" stroke="var(--c-forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="p90_abs" name="P90 |error|" stroke="var(--c-p90)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line dataKey="bias" name="Bias" stroke="var(--c-bias)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel eyebrow="Error spread" title="Where the misses fall" note="Error = forecast − outturn, hourly. Right of zero: wind came in lower than forecast.">
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={acc.histogram} margin={{ top: 8, right: 12, bottom: 16, left: 8 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="from"
                  tick={{ fontSize: 12 }}
                  stroke="var(--axis)"
                  tickFormatter={gwTick}
                  label={{ value: 'error (GW)', position: 'insideBottom', offset: -8, fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--axis)" width={40} />
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
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel eyebrow="Time series" title="Forecast vs outturn" note="Hourly, UK time. The gap between the lines is the volume the desk has to source or sell elsewhere.">
        <Legend
          items={[
            { label: 'Forecast', className: 'sw-forecast' },
            { label: 'Outturn', className: 'sw-actual' },
          ]}
        />
        <div className="chart chart--tall">
          <ResponsiveContainer>
            <ComposedChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 12 }}
                stroke="var(--axis)"
                tickFormatter={(t: number) => ukDay(new Date(t).toISOString().slice(0, 10))}
                minTickGap={40}
              />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--axis)" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)} GW`} width={52} />
              <Tooltip formatter={(v: number) => mw(v)} labelFormatter={(t: number) => ukStamp(new Date(t).toISOString())} />
              <Line dataKey="forecast" name="Forecast" stroke="var(--c-forecast)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line dataKey="actual" name="Outturn" stroke="var(--c-actual)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid-2">
        <Panel eyebrow="Time of day" title="Error by hour of day" note="Mean absolute error and bias per UK delivery hour.">
          <div className="chart">
            <ResponsiveContainer>
              <ComposedChart data={acc.by_hour} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="var(--axis)" tickFormatter={(h: number) => `${String(h).padStart(2, '0')}`} interval={2} />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--axis)" tickFormatter={gwTick} width={40} />
                <Tooltip formatter={(v: number) => mw(v)} labelFormatter={(h: number) => `${String(h).padStart(2, '0')}:00 UK`} />
                <Bar dataKey="mae" name="MAE" fill="var(--c-band-strong)" isAnimationActive={false} />
                <Line dataKey="bias" name="Bias" stroke="var(--c-bias)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel eyebrow="Review" title="Hardest days" note="Delivery days ranked by mean absolute error. Start post-mortems here.">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Delivery</th>
                  <th>Forecast</th>
                  <th>Outturn</th>
                  <th>Bias</th>
                  <th>MAE</th>
                </tr>
              </thead>
              <tbody>
                {worst.map((d) => (
                  <tr key={d.date}>
                    <td>{ukDay(d.date)}</td>
                    <td>{gwh(d.forecast_mwh, 0)}</td>
                    <td>{gwh(d.actual_mwh, 0)}</td>
                    <td>{signed(mw(d.bias), d.bias)}</td>
                    <td>{mw(d.mae)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
