import { describe, expect, it } from 'vitest';
import { parseState, toSearch, type DeskState } from './urlState';

const bounds = { delivery_dates: { first: '2026-01-02', last: '2026-02-01' } };
const defaults: DeskState = {
  tab: 'brief', day: '2026-01-15', cutoff: 'epex', start: '2026-01-02', end: '2026-02-01',
  mode: 'decision', horizon: 24,
};

describe('URL state', () => {
  it('round trips every field', () => {
    const state: DeskState = {
      tab: 'accuracy', day: '2026-02-01', cutoff: 'n2ex', start: '2026-01-10', end: '2026-01-20',
      mode: 'horizon', horizon: 36,
    };
    expect(parseState(toSearch(state), bounds)).toEqual(state);
  });

  it('falls back for invalid values and dates outside the delivery range', () => {
    expect(parseState('?tab=no&day=2026-01-01&cutoff=no&start=2026-01-32&end=2026-02-30&mode=no&horizon=no', bounds))
      .toEqual(defaults);
    for (const horizon of ['', 'Infinity', 'NaN']) {
      expect(parseState(`?horizon=${horizon}`, bounds).horizon).toBe(24);
    }
    expect(parseState('?day=not-a-date&start=2027-01-02&end=2025-02-01', bounds)).toEqual(defaults);
  });

  it('accepts only integer horizons from zero through 48', () => {
    for (const horizon of [0, 1, 24, 48]) {
      expect(parseState(`?mode=horizon&horizon=${horizon}`, bounds).horizon).toBe(horizon);
    }
    for (const horizon of [-1, 99, 24.5, 0.5, 47.9]) {
      expect(parseState(`?mode=horizon&horizon=${horizon}`, bounds).horizon).toBe(24);
    }
  });

  it('swaps reversed range endpoints', () => {
    expect(parseState('?start=2026-01-20&end=2026-01-10', bounds))
      .toMatchObject({ start: '2026-01-10', end: '2026-01-20' });
  });

  it('omits defaults', () => {
    expect(toSearch(defaults)).toBe('');
    expect(toSearch({ ...defaults, day: '2026-01-16' })).toBe('?day=2026-01-16');
    expect(parseState('', bounds)).toEqual(defaults);
  });

  it('uses metadata bounds for validation and default omission', () => {
    const narrower = { delivery_dates: { first: '2026-01-20', last: '2026-01-25' } };
    const state = parseState('?day=2026-01-15&start=2026-01-02', narrower);
    expect(state).toMatchObject({ day: '2026-01-20', start: '2026-01-20', end: '2026-01-25' });
    expect(toSearch(state, narrower)).toBe('');
  });
});
