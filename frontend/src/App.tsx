import { useState } from 'react';
import { apiUrl, useApi, type CutoffKey, type Meta } from './api';
import { AccuracyView } from './components/AccuracyView';
import { BriefView } from './components/BriefView';
import { Segmented, Status } from './components/ui';
import { ukStamp } from './format';

type Tab = 'brief' | 'accuracy';

export function App() {
  const meta = useApi<Meta>(apiUrl('/api/meta'));
  const [tab, setTab] = useState<Tab>('brief');
  const [cutoff, setCutoff] = useState<CutoffKey>('epex');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28">
              <circle cx="16" cy="16" r="15" fill="var(--c-forecast)" />
              <path d="M16 16 L16 5 M16 16 L25.5 21.5 M16 16 L6.5 21.5" stroke="white" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h1>Wind Day-Ahead Desk</h1>
            <p>GB national wind · forecast vs outturn · pilot on January 2026 purchase decisions</p>
          </div>
        </div>
        {meta.status === 'ok' && (
          <div className="field">
            <span className="field__label">Gate closure (D-1, UK time)</span>
            <Segmented<CutoffKey>
              label="Day-ahead auction"
              value={cutoff}
              onChange={setCutoff}
              options={meta.data.cutoffs.map((c) => ({ value: c.key, label: `${c.local_time} ${c.key.toUpperCase()}`, title: c.label }))}
            />
          </div>
        )}
      </header>

      <nav className="tabs" role="tablist">
        {(
          [
            ['brief', 'Day-ahead brief'],
            ['accuracy', 'Forecast accuracy'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        {meta.status !== 'ok' ? (
          <Status state={meta} />
        ) : tab === 'brief' ? (
          <BriefView meta={meta.data} cutoff={cutoff} />
        ) : (
          <AccuracyView meta={meta.data} cutoff={cutoff} />
        )}
      </main>

      {meta.status === 'ok' && (
        <footer className="footer">
          Source: Elexon BMRS — FUELHH (fuelType WIND, half-hourly outturn) and WINDFOR (hourly forecasts, a new run roughly every 3 h). Snapshot taken {ukStamp(meta.data.data_fetched_at)}. Forecasts are
          compared with the outturn at the same start time.
        </footer>
      )}
    </div>
  );
}
