import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiUrl, useApi, type Brief, type CutoffKey, type Meta } from '../api';
import { addDays, dateRange, gw, gwh, mw, signed, toCsv, ukDay, ukHour, ukStamp } from '../format';
import { Kpi, Legend, Panel, Signal, Status, ViewHead, WatchList } from './ui';

export function BriefView({ meta, cutoff }: { meta: Meta; cutoff: CutoffKey }) {
  const deliveries = useMemo(() => dateRange(meta.delivery_dates.first, meta.delivery_dates.last), [meta]);
  const [delivery, setDelivery] = useState('2026-01-15');
  const [showActual, setShowActual] = useState(true);
  const [showRuns, setShowRuns] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const state = useApi<Brief>(apiUrl('/api/decision', { delivery_date: delivery, cutoff }));
  const cutoffInfo = meta.cutoffs.find((c) => c.key === cutoff)!;
  const idx = deliveries.indexOf(delivery);
  const brief = state.status === 'ok' ? state.data : null;

  return (
    <div className="view">
      <ViewHead
        eyebrow="Day-ahead brief"
        title={
          brief && brief.totals_mwh.p10 != null ? (
            <>
              {ukDay(brief.delivery_date)}: plan on <em>{gwh(brief.totals_mwh.p10)}</em> of wind.
            </>
          ) : (
            'What wind can the desk count on tomorrow?'
          )
        }
        lede={
          brief ? (
            <>
              Committed at {ukStamp(brief.decision_at)} UK ({cutoffInfo.label}). Only forecast runs published before that
              moment are used; nothing from hindsight leaks in.
            </>
          ) : undefined
        }
      />

      <div className="toolbar">
        <div className="field">
          <label htmlFor="decision-day">Decision day</label>
          <div className="stepper">
            <button type="button" aria-label="Previous day" disabled={idx <= 0} onClick={() => setDelivery(deliveries[idx - 1])}>
              ‹
            </button>
            <select id="decision-day" value={delivery} onChange={(e) => setDelivery(e.target.value)}>
              {deliveries.map((d) => (
                <option key={d} value={d}>
                  Decide {ukDay(addDays(d, -1))} → deliver {ukDay(d)}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Next day"
              disabled={idx >= deliveries.length - 1}
              onClick={() => setDelivery(deliveries[idx + 1])}
            >
              ›
            </button>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={showRuns} onChange={(e) => setShowRuns(e.target.checked)} />
          Forecast evolution
        </label>
        <label className="check">
          <input type="checkbox" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} />
          Outturn (hindsight)
        </label>
      </div>

      {state.status !== 'ok' ? (
        <Status state={state} />
      ) : (
        <BriefBody
          brief={state.data}
          showActual={showActual}
          showRuns={showRuns}
          showTable={showTable}
          onToggleTable={() => setShowTable((v) => !v)}
        />
      )}
    </div>
  );
}

/** Plain-language takeaways derived from the brief; every number is traceable to the payload. */
function readBrief(brief: Brief) {
  const { hours, totals_mwh: t } = brief;
  const withBand = hours.filter((h) => h.forecast != null && h.p10 != null && h.p90 != null);

  const shift = withBand.length
    ? withBand.reduce((s, h) => s + ((h.p10! + h.p90!) / 2 - h.forecast!), 0) / withBand.length
    : 0;
  const signal =
    t.forecast != null && t.p10 != null
      ? {
          title: `Plan on ${gwh(t.p10)}, not ${gwh(t.forecast)}.`,
          body:
            (shift < 0
              ? `At this lead time the outturn has tended to land below the forecast, so the likely range sits under it. `
              : `At this lead time the outturn has landed either side of the forecast. `) +
            `Holding cover for the ${gwh(t.forecast - t.p10)} gap keeps the plan safe about 9 hours in 10.`,
        }
      : null;

  const watch: { text: string; detail?: string }[] = [];

  const widest = withBand.reduce<(typeof withBand)[number] | null>(
    (best, h) => (!best || h.p90! - h.p10! > best.p90! - best.p10! ? h : best),
    null,
  );
  if (widest) {
    watch.push({
      text: `Widest range at ${ukHour(widest.time)}: ${gw(widest.p10, 1)} to ${gw(widest.p90, 1)}`,
      detail: 'The hour most exposed to a wind miss.',
    });
  }

  let ramp: { from: string; to: string; delta: number } | null = null;
  for (let i = 1; i < hours.length; i++) {
    const a = hours[i - 1].forecast;
    const b = hours[i].forecast;
    if (a == null || b == null) continue;
    if (!ramp || Math.abs(b - a) > Math.abs(ramp.delta)) ramp = { from: hours[i - 1].time, to: hours[i].time, delta: b - a };
  }
  if (ramp && Math.abs(ramp.delta) >= 500) {
    watch.push({
      text: `${ramp.delta < 0 ? 'Wind drops' : 'Wind ramps'} ${gw(Math.abs(ramp.delta), 1)} between ${ukHour(ramp.from)} and ${ukHour(ramp.to)}`,
      detail: 'Steepest hour-on-hour move in the forecast.',
    });
  }

  const late = [...brief.runs].reverse().find((r) => !r.usable && r.values.every((v) => v != null));
  if (late && t.forecast != null) {
    const lateTotal = late.values.reduce<number>((s, v) => s + (v ?? 0), 0);
    const diff = lateTotal - t.forecast;
    watch.push({
      text: `The ${ukStamp(late.published)} run moved the day ${signed(gwh(diff), diff)}`,
      detail: 'Published after gate closure: too late for this auction, useful for intraday.',
    });
  }

  return { signal, watch };
}

function BriefBody({
  brief,
  showActual,
  showRuns,
  showTable,
  onToggleTable,
}: {
  brief: Brief;
  showActual: boolean;
  showRuns: boolean;
  showTable: boolean;
  onToggleTable: () => void;
}) {
  const { totals_mwh: t, hours } = brief;
  const horizons = hours.map((h) => h.horizon_h).filter((h): h is number => h != null);
  const runLabel = brief.runs_used.map(ukStamp).join(', ');
  const { signal, watch } = useMemo(() => readBrief(brief), [brief]);

  const data = hours.map((h, i) => {
    const row: Record<string, unknown> = {
      label: ukHour(h.time),
      forecast: h.forecast,
      band: h.p10 != null && h.p90 != null ? [h.p10, h.p90] : null,
      actual: h.actual,
    };
    brief.runs.forEach((r, j) => (row[`run${j}`] = r.values[i]));
    return row;
  });

  const csv = () => {
    const body = toCsv(
      hours.map((h) => ({
        time_utc: h.time,
        uk_time: ukHour(h.time),
        forecast_mw: h.forecast,
        p10_mw: h.p10 != null ? Math.round(h.p10) : null,
        p90_mw: h.p90 != null ? Math.round(h.p90) : null,
        forecast_published_utc: h.published,
        lead_time_h: h.horizon_h,
        actual_mw: h.actual,
      })),
    );
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `wind-brief-${brief.delivery_date}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="kpis">
        <Kpi
          tone="brand"
          label="Plan-safe wind · P10"
          value={gwh(t.p10)}
          sub={t.forecast != null && t.p10 != null ? `${gwh(t.forecast - t.p10)} of cover below the forecast` : undefined}
        />
        <Kpi
          label={`Forecast · ${ukDay(brief.delivery_date)}`}
          value={gwh(t.forecast)}
          sub={`avg ${mw(t.forecast != null ? t.forecast / hours.length : null)}`}
        />
        <Kpi label="Upside · P90" value={gwh(t.p90)} sub="outturn tops this ~1 hour in 10" />
        <Kpi
          label="Run in hand"
          value={runLabel || '–'}
          sub={horizons.length ? `lead ${Math.min(...horizons)}–${Math.max(...horizons)} h` : undefined}
        />
        {showActual && (
          <Kpi
            tone="muted"
            label="Outturn · hindsight"
            value={gwh(t.actual)}
            sub={
              t.actual != null && t.forecast != null
                ? `forecast ${signed(gwh(t.forecast - t.actual), t.forecast - t.actual)} vs outturn`
                : undefined
            }
          />
        )}
      </div>

      <div className="brief-grid">
        <Panel
          eyebrow="Renewable outlook · GB wind"
          title="Wind generation for the delivery day"
          note={`Band: P10 to P90 of outturns on the other ${brief.calibration_days} pilot days at the same lead time.`}
          actions={
            <button type="button" className="btn" onClick={csv}>
              Download CSV
            </button>
          }
        >
          <Legend
            items={[
              { label: 'Forecast at gate closure', className: 'sw-forecast' },
              { label: 'P10–P90 band', className: 'sw-band' },
              ...(showActual ? [{ label: 'Outturn', className: 'sw-actual' }] : []),
              ...(showRuns
                ? [
                    { label: 'Earlier runs', className: 'sw-run' },
                    { label: 'Runs after gate closure', className: 'sw-late' },
                  ]
                : []),
            ]}
          />
          <div className="chart chart--tall">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={2} stroke="var(--axis)" />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="var(--axis)"
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)} GW`}
                  width={52}
                />
                <Tooltip content={<BriefTooltip />} />
                <Area dataKey="band" stroke="none" fill="var(--c-band)" isAnimationActive={false} />
                {showRuns &&
                  brief.runs.map((r, j) => (
                    <Line
                      key={r.published}
                      dataKey={`run${j}`}
                      stroke={r.usable ? 'var(--c-run)' : 'var(--c-late)'}
                      strokeDasharray={r.usable ? undefined : '4 3'}
                      strokeWidth={1}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  ))}
                <Line dataKey="forecast" stroke="var(--c-forecast)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                {showActual && (
                  <Line dataKey="actual" stroke="var(--c-actual)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <aside className="side">
          {signal && <Signal title={signal.title}>{signal.body}</Signal>}
          <WatchList items={watch} />
        </aside>
      </div>

      <Panel
        eyebrow="Hourly schedule"
        title="Forecast, range and lead time by hour"
        actions={
          <button type="button" className="btn" onClick={onToggleTable} aria-expanded={showTable}>
            {showTable ? 'Hide' : 'Show'}
          </button>
        }
      >
        {showTable && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>UK time</th>
                  <th>Forecast</th>
                  <th>P10</th>
                  <th>P90</th>
                  <th>Lead</th>
                  {showActual && <th>Outturn</th>}
                  {showActual && <th>Error</th>}
                </tr>
              </thead>
              <tbody>
                {hours.map((h) => (
                  <tr key={h.time}>
                    <td>{ukHour(h.time)}</td>
                    <td>{mw(h.forecast)}</td>
                    <td>{mw(h.p10)}</td>
                    <td>{mw(h.p90)}</td>
                    <td>{h.horizon_h != null ? `${h.horizon_h} h` : '–'}</td>
                    {showActual && <td>{mw(h.actual)}</td>}
                    {showActual && (
                      <td>
                        {h.forecast != null && h.actual != null ? signed(mw(h.forecast - h.actual), h.forecast - h.actual) : '–'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

type TooltipProps = { active?: boolean; label?: string; payload?: { dataKey: string; value: unknown }[] };

function BriefTooltip({ active, label, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value;
  const band = get('band') as [number, number] | undefined;
  return (
    <div className="tooltip">
      <div className="tooltip__title">{label} UK</div>
      <div>Forecast: {mw(get('forecast') as number)}</div>
      {band && (
        <div>
          P10–P90: {mw(band[0])} – {mw(band[1])}
        </div>
      )}
      {get('actual') != null && <div>Outturn: {mw(get('actual') as number)}</div>}
    </div>
  );
}
