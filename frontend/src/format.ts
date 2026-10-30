// Display helpers. All times are shown in UK local time, the market's convention.

const UK = 'Europe/London';

const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: UK });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: UK });
const stampFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: UK,
});

export const ukHour = (iso: string) => hourFmt.format(new Date(iso));
export const ukStamp = (iso: string) => stampFmt.format(new Date(iso));
/** `YYYY-MM-DD` calendar date -> "Thu 15 Jan" (noon UTC avoids any day roll-over). */
export const ukDay = (isoDate: string) => dayFmt.format(new Date(`${isoDate}T12:00:00Z`));

export function mw(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '–';
  return `${value.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })} MW`;
}

export function gw(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '–';
  return `${(value / 1000).toFixed(digits)} GW`;
}

/** Energy from MWh totals, shown in GWh. */
export function gwh(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '–';
  return `${(value / 1000).toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits })} GWh`;
}

export function signed(text: string, value: number): string {
  return value > 0 ? `+${text}` : text;
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '–';
  return `${(value * 100).toFixed(digits)}%`;
}

export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateRange(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/** RFC 4180 CSV with a header row. */
export function toCsv(rows: Record<string, string | number | null | undefined>[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}
