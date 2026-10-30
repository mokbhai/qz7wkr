import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiUrl, useApi, type Brief, type CutoffKey, type Meta } from '../api';
import { addDays, dateRange, gwh, mw, signed, toCsv, ukDay, ukHour, ukStamp } from '../format';
import { Kpi, Legend, Panel, Status } from './ui';

export function BriefView({ meta, cutoff }: { meta: Meta; cutoff: CutoffKey }) {
  const deliveries = useMemo(() => dateRange(meta.delivery_dates.first, meta.delivery_dates.last), [meta]);
  const [delivery, setDelivery] = useState('2026-01-15');
  const [showActual, setShowActual] = useState(true);
  const [showRuns, setShowRuns] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const state = useApi<Brief>(apiUrl('/api/decision', { delivery_date: delivery, cutoff }));
  const cutoffInfo = meta.cutoffs.find((c) => c.key === cutoff)!;
  const idx = deliveries.indexOf(delivery);

  return (
    <div className="view">
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
          cutoffLabel={`${cutoffInfo.label}, ${cutoffInfo.local_time}`}
          showActual={showActual}
          showRuns={showRuns}
          showTable={showTable}
          onToggleTable={() => setShowTable((v) => !v)}
        />
      )}
    </div>
  );
}

function BriefBody({
  brief,
  cutoffLabel,
  showActual,
  showRuns,
  showTable,
  onToggleTable,
}: {
  brief: Brief;
  cutoffLabel: string;
  showActual: boolean;
  showRuns: boolean;
  showTable: boolean;
  onToggleTable: () => void;
}) {
  const { totals_mwh: t, hours } = brief;
  const horizons = hours.map((h) => h.horizon_h).filter((h): h is number => h != null);
  const runLabel = brief.runs_used.map(ukStamp).join(', ');

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
          label={`Wind forecast · ${ukDay(brief.delivery_date)}`}
          value={gwh(t.forecast)}
          sub={`avg ${mw(t.forecast != null ? t.forecast / hours.length : null)}`}
        />
        <Kpi
          label="Plan-safe wind (P10)"
          value={gwh(t.p10)}
          sub={t.forecast != null && t.p10 != null ? `${gwh(t.forecast - t.p10)} below the forecast: cover to hold` : undefined}
        />
        <Kpi label="Upside wind (P90)" value={gwh(t.p90)} sub="outturn tops this ~1 hour in 10" />
        <Kpi
          label="Forecast in hand at gate closure"
          value={runLabel || '–'}
          sub={horizons.length ? `lead ${Math.min(...horizons)}–${Math.max(...horizons)} h` : undefined}
        />
        {showActual && (
          <Kpi
            tone="muted"
            label="Outturn (hindsight)"
            value={gwh(t.actual)}
            sub={t.actual != null && t.forecast != null ? `forecast ${signed(gwh(t.forecast - t.actual), t.forecast - t.actual)} vs outturn` : undefined}
          />
        )}
      </div>

      <Panel
        title="Wind generation for the delivery day"
        note={
          <>
            Latest forecast published before <strong>{ukStamp(brief.decision_at)}</strong> ({cutoffLabel}). The band is
            the P10–P90 range of outturns seen in the other {brief.calibration_days} pilot days at the same lead time.
          </>
        }
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
                <Line dataKey="actual" stroke="var(--c-actual)" strokeWidth={2} dot={false} isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel
        title="Hourly schedule"
        actions={
          <button type="button" className="btn btn--ghost" onClick={onToggleTable} aria-expanded={showTable}>
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
                      <td>{h.forecast != null && h.actual != null ? signed(mw(h.forecast - h.actual), h.forecast - h.actual) : '–'}</td>
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
