import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Loadable } from '../api';

export const axisTick = { fontSize: 11, fill: 'var(--muted)' };

export function ChartFrame({ height, children }: {
  height: number;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current!;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', minWidth: 0, height }}>
      {width > 0 && children({ width, height })}
    </div>
  );
}

export function ChartTooltip({ title, rows, footer }: {
  title: ReactNode;
  rows: { label: string; value: ReactNode; tone?: 'muted' | 'pos' | 'neg' }[];
  footer?: ReactNode;
}) {
  return (
    <div className="tooltip">
      <div className="tooltip__title">{title}</div>
      <dl className="tooltip__rows">
        {rows.map((row, index) => (
          <div key={index} className={row.tone}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {footer != null && <div className="tooltip__footer">{footer}</div>}
    </div>
  );
}

/** Whether a CSS media query currently matches. Reads false when `window` or `matchMedia` is unavailable. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** A headline number with its unit set smaller, e.g. 278.6 GWh. */
export function Stat({ label, value, unit, note }: { label: ReactNode; value: string; unit?: string; note?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">
        {value}
        {unit && <span className="stat__unit">{unit}</span>}
      </div>
      {note && <div className="stat__note">{note}</div>}
    </div>
  );
}

export function Card({
  title,
  tools,
  children,
  flush,
}: {
  title: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className={`card${flush ? ' card--flush' : ''}`}>
      <header className="card__head">
        <h2 className="card__title">{title}</h2>
        {tools && <div className="card__tools">{tools}</div>}
      </header>
      {children}
    </section>
  );
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);

export function Status({ state, label = 'Loading…', what = 'data', minHeight }: {
  state: Exclude<Loadable<unknown>, { status: 'ok' }>;
  label?: string;
  what?: string;
  minHeight?: number;
}) {
  if (state.status === 'error') {
    return (
      <div className="status status--error" role="alert" style={{ minHeight }}>
        <div>Couldn't load {what}.</div>
        <div>{state.message}</div>
        <button type="button" className="text-btn" onClick={state.retry}>Retry</button>
      </div>
    );
  }
  return <div className="status" role="status" style={{ minHeight }}>{label}</div>;
}

export function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className={`legend__swatch ${i.className}`} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
