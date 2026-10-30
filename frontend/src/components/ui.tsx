import type { ReactNode } from 'react';

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

export function ViewHead({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className="view-head">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2>{title}</h2>
      {lede && <p>{lede}</p>}
    </header>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: 'muted' | 'brand';
}) {
  return (
    <div className={`kpi${tone ? ` kpi--${tone}` : ''}`}>
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">{value}</div>
      {sub && <div className="kpi__sub">{sub}</div>}
    </div>
  );
}

export function Panel({
  eyebrow,
  title,
  note,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  note?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h3 className="panel__title">{title}</h3>
          {note && <p className="panel__note">{note}</p>}
        </div>
        {actions && <div className="panel__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Signal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="signal">
      <Eyebrow>Forecast signal</Eyebrow>
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}

export function WatchList({ items }: { items: { text: ReactNode; detail?: ReactNode }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="watch">
      <Eyebrow>Watch list</Eyebrow>
      <ul>
        {items.map((item, i) => (
          <li key={i}>
            <span>
              {item.text}
              {item.detail && <small>{item.detail}</small>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          className={value === o.value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
