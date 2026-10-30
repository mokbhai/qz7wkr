import type { ReactNode } from 'react';

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

export function Status({ state }: { state: { status: 'loading' } | { status: 'error'; message: string } }) {
  if (state.status === 'error') return <div className="status status--error">Couldn’t load data: {state.message}</div>;
  return <div className="status">Loading…</div>;
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
