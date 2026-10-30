import { describe, expect, it } from 'vitest';
import { addDays, dateRange, gwh, mw, signed, toCsv, ukDay, ukHour } from './format';

describe('format', () => {
  it('formats power and energy', () => {
    expect(mw(12345.6)).toBe('12,346 MW');
    expect(mw(null)).toBe('–');
    expect(gwh(278630)).toBe('278.6 GWh');
    expect(signed('1.7 GW', 1700)).toBe('+1.7 GW');
    expect(signed('-1.7 GW', -1700)).toBe('-1.7 GW');
  });

  it('shows UK local time across the clock change', () => {
    expect(ukHour('2026-01-15T09:20:00Z')).toBe('09:20');
    expect(ukHour('2026-07-01T08:20:00Z')).toBe('09:20');
    expect(ukDay('2026-01-15')).toBe('Thu 15 Jan');
  });

  it('walks calendar days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(dateRange('2026-01-30', '2026-02-01')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01']);
  });

  it('escapes CSV cells', () => {
    expect(toCsv([{ a: 'x,y', b: 1, c: null }])).toBe('a,b,c\n"x,y",1,');
  });
});
