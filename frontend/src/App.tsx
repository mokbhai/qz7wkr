import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { apiUrl, useApi, type CutoffKey, type Meta } from './api';
import { AccuracyView } from './components/AccuracyView';
import { BriefView } from './components/BriefView';
import { Status } from './components/ui';
import { ukStamp } from './format';
import { parseState, toSearch, type DeskState } from './urlState';

const tabs = [{ key: 'brief', label: 'Daily brief' }, { key: 'accuracy', label: 'Accuracy' }] as const;

export function App() {
  const meta = useApi<Meta>(apiUrl('/api/meta'));
  if (meta.status !== 'ok') {
    return <main className="page"><Status state={meta} label="Loading desk settings…" what="desk settings" minHeight={500} /></main>;
  }
  return <Desk meta={meta.data} />;
}

function Desk({ meta }: { meta: Meta }) {
  const [state, setState] = useState(() => parseState(window.location.search, meta));
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { tab, cutoff } = state;

  const update = useCallback((patch: Partial<DeskState>, replace = false) => {
    const next = parseState(toSearch({ ...state, ...patch }, meta), meta);
    const search = toSearch(next, meta);
    if (search === toSearch(state, meta)) return;
    window.history[replace ? 'replaceState' : 'pushState'](
      null, '', `${window.location.pathname}${search}${window.location.hash}`,
    );
    setState(next);
  }, [state, meta]);

  useEffect(() => {
    const onPopState = () => setState(parseState(window.location.search, meta));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [meta]);

  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timer = window.setTimeout(() => setCopyStatus('idle'), 1500);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'ArrowRight' ? (index + 1) % tabs.length : null;
    if (next == null) return;
    event.preventDefault();
    update({ tab: tabs[next].key });
    tabRefs.current[next]?.focus();
  };

  const copyLink = async () => {
    try {
      const search = toSearch(state, meta);
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}${search}${window.location.hash}`);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };

  const linkToDay = (day: string) => {
    const params = new URLSearchParams({ tab: 'brief', day, cutoff });
    const search = new URLSearchParams(toSearch({ ...state, tab: 'brief', day }, meta));
    for (const [key, value] of search) params.set(key, value);
    return `?${params}`;
  };

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
            <nav className="appbar__tabs" role="tablist" aria-label="Desk views">
              {tabs.map((item, index) => (
                <button
                  key={item.key}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  type="button"
                  role="tab"
                  id={`tab-${item.key}`}
                  aria-controls={`panel-${item.key}`}
                  aria-selected={tab === item.key}
                  tabIndex={tab === item.key ? 0 : -1}
                  onClick={() => update({ tab: item.key })}
                  onKeyDown={(event) => onTabKey(event, index)}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="appbar__tools">
            {typeof navigator.clipboard?.writeText === 'function' && (
              <button type="button" className="text-btn" onClick={copyLink} aria-live="polite">
                {copyStatus === 'copied' ? 'Copied' : copyStatus === 'error' ? 'Couldn’t copy link' : 'Copy link'}
              </button>
            )}
            <label className="appbar__gc">
              <span>Gate closure</span>
              <select value={cutoff} onChange={(e) => update({ cutoff: e.target.value as CutoffKey })}>
                {meta.cutoffs.map((c) => (
                  <option key={c.key} value={c.key} title={c.label}>
                    {c.local_time} {c.key === 'epex' ? 'EPEX' : 'N2EX'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <main className="page">
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === 'brief' ? (
            <BriefView meta={meta} cutoff={cutoff} delivery={state.day} setDelivery={(day) => update({ day })} />
          ) : (
            <AccuracyView
              meta={meta}
              cutoff={cutoff}
              start={state.start}
              setStart={(start) => update({ start })}
              end={state.end}
              setEnd={(end) => update({ end })}
              mode={state.mode}
              setMode={(mode) => update({ mode })}
              horizon={state.horizon}
              setHorizon={(horizon) => update({ horizon }, true)}
              linkToDay={linkToDay}
              onOpenDay={(day) => update({ tab: 'brief', day })}
            />
          )}
        </div>

        <footer className="footer">
          Data: Elexon BMRS FUELHH (wind, half-hourly outturn) and WINDFOR (hourly forecast, ~8 runs a day), pulled{' '}
          {ukStamp(meta.data_fetched_at)}. Forecast hours are matched to the outturn period starting at the same
          time. All times UK.
        </footer>
      </main>
    </>
  );
}
