import { useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiUrl, useApi, type Brief, type CutoffKey, type Meta } from '../api';
import { addDays, dateRange, gwh, mw, toCsv, ukDay, ukHour, ukStamp } from '../format';
import { Card, DownloadIcon, IconButton, Legend, Stat, Status, useMediaQuery } from './ui';

const gwhValue = (mwh: number | null) => (mwh == null ? '–' : (mwh / 1000).toFixed(1));

export function BriefView({ meta, cutoff }: { meta: Meta; cutoff: CutoffKey }) {
  const deliveries = useMemo(() => dateRange(meta.delivery_dates.first, meta.delivery_dates.last), [meta]);
  const [delivery, setDelivery] = useState('2026-01-15');
  const [showActual, setShowActual] = useState(true);
  const [showRuns, setShowRuns] = useState(false);

  const state = useApi<Brief>(apiUrl('/api/decision', { delivery_date: delivery, cutoff }));
  const cutoffInfo = meta.cutoffs.find((c) => c.key === cutoff)!;
  const idx = deliveries.indexOf(delivery);

  // ← / → step through days, unless the user is typing in a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return;
      if (e.key === 'ArrowLeft' && idx > 0) setDelivery(deliveries[idx - 1]);
      if (e.key === 'ArrowRight' && idx < deliveries.length - 1) setDelivery(deliveries[idx + 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, deliveries]);

  return (
    <div className="view">
      <div className="pagehead">
        <div>
          <h1>Delivery {ukDay(delivery)} 2026</h1>
          <p className="pagehead__sub">
            Bought {ukDay(addDays(delivery, -1))} before the {cutoffInfo.local_time} gate closure (
            {cutoff === 'epex' ? 'EPEX' : 'N2EX'})
          </p>
        </div>
        <div className="daypicker">
          <button
            type="button"
            aria-label="Previous day"
            title="Previous day (←)"
            disabled={idx <= 0}
            onClick={() => setDelivery(deliveries[idx - 1])}
          >
            ‹
          </button>
          <select
            aria-label="Delivery day"
            title="Delivery day (use ← / → to step through days)"
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
          >
            {deliveries.map((d) => (
              <option key={d} value={d}>
                {ukDay(d)}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Next day"
            title="Next day (→)"
            disabled={idx >= deliveries.length - 1}
            onClick={() => setDelivery(deliveries[idx + 1])}
          >
            ›
          </button>
        </div>
      </div>

      {state.status !== 'ok' ? (
        <Status state={state} />
      ) : (
        <BriefBody
          brief={state.data}
          showActual={showActual}
          showRuns={showRuns}
          setShowActual={setShowActual}
          setShowRuns={setShowRuns}
        />
      )}
    </div>
  );
}

function BriefBody({
  brief,
  showActual,
  showRuns,
  setShowActual,
  setShowRuns,
}: {
  brief: Brief;
  showActual: boolean;
  showRuns: boolean;
  setShowActual: (v: boolean) => void;
  setShowRuns: (v: boolean) => void;
}) {
  const { totals_mwh: t, hours } = brief;
  const used = brief.runs_used[0];
  // Every 3 h on desktop, every 6 h on phones (the styles.css breakpoint).
  const narrow = useMediaQuery('(max-width: 640px)');
  const leads = hours.map((h) => h.horizon_h).filter((h): h is number => h != null);

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

  const runs = useMemo(() => {
    let prevTotal: number | null = null;
    const rows = brief.runs.map((r) => {
      const covered = r.values.filter((v) => v != null).length;
      const total = r.values.reduce<number>((s, v) => s + (v ?? 0), 0);
      const full = covered === hours.length;
      const delta = full && prevTotal != null ? total - prevTotal : null;
      if (full) prevTotal = total;
      const lead = (new Date(hours[0].time).getTime() - new Date(r.published).getTime()) / 3_600_000;
      return { ...r, covered, total, full, delta, lead };
    });
    // Runs published once the day has started are intraday material, not day-ahead; keep the last 10 before it.
    return rows.filter((r) => r.lead > 0).slice(-10);
  }, [brief.runs, hours]);

  const downloadCsv = () => {
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
    const a = Object.assign(document.createElement('a'), { href: url, download: `wind-${brief.delivery_date}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="stats">
        <Stat label="Wind forecast" value={gwhValue(t.forecast)} unit="GWh" note={`run of ${ukStamp(used)}`} />
        <Stat
          label="Plan on (P10)"
          value={gwhValue(t.p10)}
          unit="GWh"
          note={t.forecast != null && t.p10 != null ? `${gwhValue(t.forecast - t.p10)} GWh under forecast` : undefined}
        />
        <Stat label="High case (P90)" value={gwhValue(t.p90)} unit="GWh" />
        <Stat
          label="Outturn*"
          value={showActual ? gwhValue(t.actual) : '–'}
          unit="GWh"
          note={
            showActual && t.actual != null && t.forecast != null
              ? `forecast was ${t.forecast >= t.actual ? 'high' : 'low'} by ${gwh(Math.abs(t.forecast - t.actual))}`
              : 'hidden'
          }
        />
      </div>

      <Card
        title={
          <>
            Wind generation <span className="muted">MW, hourly</span>
          </>
        }
        tools={
          <>
            <label className="toggle">
              <input type="checkbox" checked={showRuns} onChange={(e) => setShowRuns(e.target.checked)} />
              Other runs
            </label>
            <label className="toggle">
              <input type="checkbox" checked={showActual} onChange={(e) => setShowActual(e.target.checked)} />
              Outturn
            </label>
            <IconButton label="Download hourly CSV" onClick={downloadCsv}>
              <DownloadIcon />
            </IconButton>
          </>
        }
      >
        <div className="chart chart--tall">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={narrow ? 5 : 2} stroke="var(--axis)" tickLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="var(--axis)"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v.toLocaleString('en-GB')}
                domain={[0, (max: number) => Math.ceil(max / 5000) * 5000]}
                tickCount={6}
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
                    strokeDasharray={r.usable ? undefined : '3 3'}
                    strokeWidth={1}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              <Line dataKey="forecast" stroke="var(--c-forecast)" strokeWidth={2} dot={false} isAnimationActive={false} />
              {showActual && (
                <Line dataKey="actual" stroke="var(--c-actual)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend
          items={[
            { label: `Forecast (${ukStamp(used)} run)`, className: 'sw-forecast' },
            { label: 'P10–P90', className: 'sw-band' },
            ...(showActual ? [{ label: 'Outturn', className: 'sw-actual' }] : []),
            ...(showRuns
              ? [
                  { label: 'Earlier runs', className: 'sw-run' },
                  { label: 'After gate closure', className: 'sw-late' },
                ]
              : []),
          ]}
        />
      </Card>

      <div className="split">
        <Card
          flush
          title={
            <>
              Forecast runs <span className="muted">published before delivery</span>
            </>
          }
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Published</th>
                  <th>Lead to 00:00</th>
                  <th>Day total</th>
                  <th>Change, GWh</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.published} className={r.published === used ? 'is-used' : r.usable ? '' : 'is-late'}>
                    <td>{ukStamp(r.published)}</td>
                    <td>{r.lead.toFixed(1)} h</td>
                    <td
                      title={r.full ? undefined : 'This run does not reach the end of the delivery day, so no day total'}
                    >
                      {r.full ? (
                        `${gwhValue(r.total)} GWh`
                      ) : (
                        <span className="muted">
                          partial ({r.covered} of {hours.length} h)
                        </span>
                      )}
                    </td>
                    <td className={r.delta == null || Math.abs(r.delta) < 50 ? '' : r.delta < 0 ? 'neg' : 'pos'}>
                      {r.delta == null ? '' : Math.abs(r.delta) < 50 ? '0.0' : `${r.delta > 0 ? '+' : ''}${gwhValue(r.delta)}`}
                    </td>
                    <td>
                      {r.published === used ? (
                        <span className="tag tag--used">used</span>
                      ) : r.usable ? (
                        ''
                      ) : (
                        <span className="tag">after GC</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card flush title="Hourly values">
          <div className="table-wrap table-wrap--scroll">
            <table>
              <thead>
                <tr>
                  <th>Hour</th>
                  <th>Forecast</th>
                  <th>P10</th>
                  <th>P90</th>
                  {showActual && <th>Outturn*</th>}
                </tr>
              </thead>
              <tbody>
                {hours.map((h) => (
                  <tr key={h.time}>
                    <td>{ukHour(h.time)}</td>
                    <td>{fmt(h.forecast)}</td>
                    <td>{fmt(h.p10)}</td>
                    <td>{fmt(h.p90)}</td>
                    {showActual && <td>{fmt(h.actual)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="footnote">
        * Outturn is shown for review; it wasn’t known when the power was bought. Lead times in this day run{' '}
        {leads.length ? `${Math.min(...leads)}–${Math.max(...leads)}` : '–'} h. P10/P90 come from the errors of the
        forecast held at gate closure on the other {brief.calibration_days} pilot days, in 6-hour lead-time buckets.
      </p>
    </>
  );
}

const fmt = (v: number | null) => (v == null ? '–' : Math.round(v).toLocaleString('en-GB'));

type TooltipProps = { active?: boolean; label?: string; payload?: { dataKey: string; value: unknown }[] };

function BriefTooltip({ active, label, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value;
  const band = get('band') as [number, number] | undefined;
  return (
    <div className="tooltip">
      <div className="tooltip__title">{label}</div>
      <div>Forecast {mw(get('forecast') as number)}</div>
      {band && (
        <div className="muted">
          P10–P90 {fmt(band[0])}–{fmt(band[1])}
        </div>
      )}
      {get('actual') != null && <div>Outturn {mw(get('actual') as number)}</div>}
    </div>
  );
}
