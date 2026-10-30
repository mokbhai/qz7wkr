import { useState } from 'react';
import { apiUrl, useApi, type CutoffKey, type Meta } from './api';
import { AccuracyView } from './components/AccuracyView';
import { BriefView } from './components/BriefView';
import { Status } from './components/ui';
import { ukStamp } from './format';

type Tab = 'brief' | 'accuracy';

export function App() {
  const meta = useApi<Meta>(apiUrl('/api/meta'));
  const [tab, setTab] = useState<Tab>('brief');
  const [cutoff, setCutoff] = useState<CutoffKey>('epex');

  return (
    <>
      <header className="appbar">
        <div className="appbar__inner">
          <div className="appbar__left">
            <span className="logo" aria-hidden>
              <svg viewBox="0 0 20 20" width="18" height="18">
                <path d="M10 10V2.5M10 10l6.5 3.75M10 10l-6.5 3.75" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="10" cy="10" r="1.8" fill="currentColor" />
              </svg>
            </span>
            <span className="appbar__name">Wind desk</span>
            <span className="appbar__crumb">GB · day-ahead</span>
            <nav className="appbar__tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'brief'} onClick={() => setTab('brief')}>
                Daily brief
              </button>
              <button role="tab" aria-selected={tab === 'accuracy'} onClick={() => setTab('accuracy')}>
                Accuracy
              </button>
            </nav>
          </div>
          {meta.status === 'ok' && (
            <label className="appbar__gc">
              <span>Gate closure</span>
              <select value={cutoff} onChange={(e) => setCutoff(e.target.value as CutoffKey)}>
                {meta.data.cutoffs.map((c) => (
                  <option key={c.key} value={c.key} title={c.label}>
                    {c.local_time} {c.key === 'epex' ? 'EPEX' : 'N2EX'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </header>

      <main className="page">
        {meta.status !== 'ok' ? (
          <Status state={meta} />
        ) : tab === 'brief' ? (
          <BriefView meta={meta.data} cutoff={cutoff} />
        ) : (
          <AccuracyView meta={meta.data} cutoff={cutoff} />
        )}

        {meta.status === 'ok' && (
          <footer className="footer">
            Data: Elexon BMRS FUELHH (wind, half-hourly outturn) and WINDFOR (hourly forecast, ~8 runs a day), pulled{' '}
            {ukStamp(meta.data.data_fetched_at)}. Forecast hours are matched to the outturn period starting at the same
            time. All times UK.
          </footer>
        )}
      </main>
    </>
  );
}
