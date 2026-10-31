import { useEffect, useMemo, useState } from 'react';
import { apiUrl, prefetch, useApi, type Brief, type CutoffKey, type Insights, type Meta } from '../api';
import { dateRange, gwh, pct, toCsv, ukDay, ukHour, ukStamp } from '../format';
import { Stat, Status } from './ui';
import { ForecastRunsTable } from './brief/ForecastRunsTable';
import { HourlyTable } from './brief/HourlyTable';
import { WindChart } from './brief/WindChart';
import { buildCsvRows, csvFilename, gwhValue, revisionSummary, runRevision } from './brief/helpers';
import './brief/brief.css';

export function shouldStepDay(event: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'>) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
  const target = event.target as Element | null;
  return !target?.closest?.('.table-wrap, [role="region"], [role="application"], [role="img"], a[href], details, summary, [role="tablist"], button, input, select, textarea, [contenteditable]:not([contenteditable="false"])');
}

export function BriefView({ meta, cutoff, delivery, setDelivery }: {
  meta: Meta;
  cutoff: CutoffKey;
  delivery: string;
  setDelivery: (day: string) => void;
}) {
  const deliveries = useMemo(() => dateRange(meta.delivery_dates.first, meta.delivery_dates.last), [meta]);
  const [showActual, setShowActual] = useState(true);
  const [showPrevious, setShowPrevious] = useState(false);
  const [showLater, setShowLater] = useState(false);
  const insights = useApi<Insights>(apiUrl('/api/insights'));

  const state = useApi<Brief>(apiUrl('/api/decision', { delivery_date: delivery, cutoff }));
  const idx = deliveries.indexOf(delivery);

  useEffect(() => {
    if (state.status !== 'ok') return;
    for (const day of [deliveries[idx - 1], deliveries[idx + 1]]) {
      if (day) void prefetch(apiUrl('/api/decision', { delivery_date: day, cutoff })).catch(() => {});
    }
  }, [state.status, idx, deliveries, cutoff]);

  // ← / → step through days outside controls and regions with their own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldStepDay(e)) return;
      if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        setDelivery(deliveries[idx - 1]);
      }
      if (e.key === 'ArrowRight' && idx < deliveries.length - 1) {
        e.preventDefault();
        setDelivery(deliveries[idx + 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, deliveries, setDelivery]);

  return (
    <div className="view brief-view">
      <div className="pagehead">
        <div>
          <h1>Delivery {ukDay(delivery)} {delivery.slice(0, 4)}</h1>
          <p className="pagehead__sub brief-snapshot">
            {state.status === 'ok' && <span>
              Decision at {ukHour(state.data.decision_at)} UK on {ukDay(state.data.decision_at.slice(0, 10))} · {cutoff === 'epex' ? 'EPEX' : 'N2EX'}
            </span>}
            <span className="tag brief-replay">January 2026 replay</span>
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
        <Status state={state} label="Loading wind forecast…" what="wind forecast" minHeight={500} />
      ) : (
        <BriefBody
          brief={state.data}
          showActual={showActual}
          cutoff={cutoff}
          coverage={insights.status === 'ok' ? insights.data.cutoffs[cutoff].band_coverage.inside : undefined}
          showPrevious={showPrevious}
          showLater={showLater}
          setShowActual={setShowActual}
          setShowPrevious={setShowPrevious}
          setShowLater={setShowLater}
        />
      )}
    </div>
  );
}

function BriefBody({ brief, cutoff, coverage, showActual, showPrevious, showLater, setShowActual, setShowPrevious, setShowLater }: {
  brief: Brief;
  cutoff: CutoffKey;
  coverage: number | null | undefined;
  showActual: boolean;
  showPrevious: boolean;
  showLater: boolean;
  setShowActual: (show: boolean) => void;
  setShowPrevious: (show: boolean) => void;
  setShowLater: (show: boolean) => void;
}) {
  const { totals_mwh: totals } = brief;
  const revision = runRevision(brief);
  const leads = brief.hours.flatMap((hour) => hour.horizon_h == null ? [] : [hour.horizon_h]);
  const used = brief.runs_used;
  const forecastNote = used.length > 1 ? `latest run per hour · ${used.length} runs`
    : used.length === 1 ? `run of ${ukStamp(used[0])}` : 'no eligible run';

  const downloadCsv = () => {
    const body = toCsv(buildCsvRows(brief, cutoff, showActual));
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
    const anchor = Object.assign(document.createElement('a'), { href: url, download: csvFilename(brief, cutoff) });
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <>
      <div className="stats">
        <Stat label="Wind forecast" value={gwhValue(totals.forecast)} unit="GWh" note={forecastNote} />
        <Stat label="Low-wind case" value={gwhValue(totals.p10)} unit="GWh" note={<>
          sum of hourly P10
          {totals.forecast != null && totals.p10 != null && <span className="brief-stat-detail">{gwhValue(totals.forecast - totals.p10)} GWh under forecast</span>}
        </>} />
        <Stat label="High-wind case" value={gwhValue(totals.p90)} unit="GWh" note="sum of hourly P90" />
        <Stat label="Outturn*" value={showActual && totals.actual != null ? `≈${gwhValue(totals.actual)}` : '–'} unit="GWh" note={
          !showActual ? 'hidden' : totals.actual == null ? 'incomplete outturn'
            : totals.forecast != null ? `forecast was ${totals.forecast >= totals.actual ? 'high' : 'low'} by ${gwh(Math.abs(totals.forecast - totals.actual))}` : undefined
        } />
      </div>

      <p className="brief-revision">{revisionSummary(revision, brief.hours.length)}</p>

      <WindChart brief={brief} previous={revision?.previous} showPrevious={showPrevious} setShowPrevious={setShowPrevious}
        showLater={showLater} setShowLater={setShowLater} showActual={showActual} setShowActual={setShowActual} />
      <p className="footnote brief-calibration">
        Band: P10–P90 of outturn at the same lead time on the other {brief.calibration_days} pilot days
        {coverage != null && <> · held {pct(coverage)} of outturns over the pilot (target 80%)</>}
      </p>

      <div className="brief-tables">
        <HourlyTable brief={brief} showActual={showActual} onDownload={downloadCsv} />
        <ForecastRunsTable brief={brief} />
      </div>

      <p className="footnote">
        * Outturn is shown for review; it wasn’t known at decision time. Outturn energy uses the half-hour starting each hour, the points the forecast is scored on.
        {' '}Low/high-wind cases add up hourly P10/P90 bounds; they are not percentiles of daily energy.
        {leads.length > 0 && <> Lead times in this day run {Math.min(...leads)}–{Math.max(...leads)} h.</>}
        {' '}Band calibration uses 6-hour lead-time buckets.
      </p>
    </>
  );
}
