import { useEffect, useMemo, useState } from 'react';
import { apiUrl, hasMetrics, useApi, type Accuracy, type CutoffKey, type HorizonPoint, type Insights, type Meta } from '../api';
import { dateRange, ukDay } from '../format';
import { MetricsRow } from './accuracy/MetricsRow';
import { PilotNotes } from './accuracy/PilotNotes';
import { ForecastVsOutturnChart } from './accuracy/ForecastVsOutturnChart';
import { LeadTimeChart } from './accuracy/LeadTimeChart';
import { ErrorHistogram } from './accuracy/ErrorHistogram';
import { ByHourChart } from './accuracy/ByHourChart';
import { WorstDaysTable } from './accuracy/WorstDaysTable';
import type { DayNavigation, Mode } from './accuracy/helpers';
import { Status } from './ui';
import './accuracy/accuracy.css';

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
  const [draftHorizon, setDraftHorizon] = useState(horizon);
  useEffect(() => setDraftHorizon(horizon), [horizon]);
  useEffect(() => {
    if (draftHorizon === horizon) return;
    const timer = window.setTimeout(() => setHorizon(draftHorizon), 150);
    return () => window.clearTimeout(timer);
  }, [draftHorizon, horizon, setHorizon]);

  const accuracy = useApi<Accuracy>(
    apiUrl('/api/accuracy', { start, end, mode, cutoff, horizon_h: mode === 'horizon' ? horizon : undefined }),
  );
  const curve = useApi<{ points: HorizonPoint[] }>(apiUrl('/api/horizon-curve', { start, end }));
  const insights = useApi<Insights>(apiUrl('/api/insights'));
  const cutoffInfo = meta.cutoffs.find((item) => item.key === cutoff)!;
  const acc = accuracy.status === 'ok' ? accuracy.data : null;
  const metrics = acc && hasMetrics(acc.metrics) ? acc.metrics : null;

  return (
    <div className="view accuracy-view">
      <div className="pagehead">
        <div>
          <h1>Forecast accuracy</h1>
          <p className="pagehead__sub">
            WINDFOR vs metered wind, delivery {ukDay(start)} – {ukDay(end)}
            {acc && ` · ${acc.metrics.n} hours`}
          </p>
        </div>
      </div>

      <div className="filters">
        <label>From
          <select value={start} onChange={(event) => setStart(event.target.value)}>
            {deliveries.filter((day) => day <= end).map((day) => <option key={day} value={day}>{ukDay(day)}</option>)}
          </select>
        </label>
        <label>To
          <select value={end} onChange={(event) => setEnd(event.target.value)}>
            {deliveries.filter((day) => day >= start).map((day) => <option key={day} value={day}>{ukDay(day)}</option>)}
          </select>
        </label>
        <label>Forecast
          <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            <option value="decision">Held at gate closure ({cutoffInfo.local_time})</option>
            <option value="horizon">Latest forecast ≥ {draftHorizon} h before delivery</option>
          </select>
        </label>
        {mode === 'horizon' && (
          <label className="filters__range">
            <span>At least <b>{draftHorizon} h</b> ahead</span>
            <input type="range" min={0} max={meta.max_horizon_h} value={draftHorizon}
              onChange={(event) => setDraftHorizon(Number(event.target.value))} />
          </label>
        )}
      </div>
      <p className="accuracy-definition">Error = forecast − outturn. Positive means the forecast was high and the buyer ends up short.</p>

      {accuracy.status !== 'ok'
        ? <Status state={accuracy} label="Loading accuracy…" what="accuracy" minHeight={110} />
        : metrics ? <MetricsRow metrics={metrics} />
          : <p className="status" role="status">No hours with both a forecast and an outturn in this range.</p>}

      <PilotNotes state={insights} cutoff={cutoff} meta={meta} />

      {acc && metrics && <ForecastVsOutturnChart series={acc.series} />}
      <div className="split">
        <LeadTimeChart state={curve} series={acc?.series ?? []} mode={mode}
          marker={mode === 'horizon' ? horizon : metrics?.mean_horizon_h ?? null} />
        {acc && metrics && <ErrorHistogram histogram={acc.histogram} />}
      </div>
      {acc && metrics && (
        <div className="split">
          <ByHourChart points={acc.by_hour} deliveryDate={start} />
          <WorstDaysTable daily={acc.daily} linkToDay={linkToDay} onOpenDay={onOpenDay} />
        </div>
      )}
    </div>
  );
}
