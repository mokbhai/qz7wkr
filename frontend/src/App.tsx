import { useState } from 'react';
import { apiUrl, useApi, type CutoffKey, type Meta } from './api';
import { AccuracyView } from './components/AccuracyView';
import { BriefView } from './components/BriefView';
import { Eyebrow, Segmented, Status } from './components/ui';
import { ukStamp } from './format';

type Tab = 'brief' | 'accuracy';

const TABS: [Tab, string][] = [
  ['brief', 'Day-ahead brief'],
  ['accuracy', 'Forecast accuracy'],
];

export function App() {
  const meta = useApi<Meta>(apiUrl('/api/meta'));
  const [tab, setTab] = useState<Tab>('brief');
  const [cutoff, setCutoff] = useState<CutoffKey>('epex');

  return (
    <>
      <nav className="nav">
        <div className="nav__inner">
          <div className="brand">
            <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
              <rect width="32" height="32" fill="var(--brand)" />
              <path d="M16 16 L16 6 M16 16 L24.7 21 M16 16 L7.3 21" stroke="white" strokeWidth="2.6" strokeLinecap="square" />
            </svg>
            <span className="brand__name">
              Wind <span>Day-Ahead</span> Desk
            </span>
          </div>
          {meta.status === 'ok' && (
            <div className="field">
              <span className="field__label">Gate closure · D-1, UK time</span>
              <Segmented<CutoffKey>
                label="Day-ahead auction"
                value={cutoff}
                onChange={setCutoff}
                options={meta.data.cutoffs.map((c) => ({
                  value: c.key,
                  label: `${c.local_time} ${c.key.toUpperCase()}`,
                  title: c.label,
                }))}
              />
            </div>
          )}
        </div>
      </nav>

      <div className="app">
        <header className="intro">
          <Eyebrow>Pilot · GB day-ahead procurement · January 2026</Eyebrow>
          <h1>
            Know the wind you can <em>count on</em> before the auction closes.
          </h1>
          <p>
            The forecast you actually had at gate closure, the range it is likely to land in, and a month of evidence on
            how far to trust it.
          </p>
        </header>

        <div className="tabs" role="tablist">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'is-active' : ''}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

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
            <strong>Every figure traces back to a published forecast run and a metered outturn.</strong> Source: Elexon
            BMRS: FUELHH (wind outturn, half-hourly) and WINDFOR (hourly forecasts, a new run roughly every 3 h).
            Forecasts are compared with the outturn at the same start time. Snapshot taken{' '}
            {ukStamp(meta.data.data_fetched_at)} UK.
          </footer>
        )}
      </div>
    </>
  );
}
