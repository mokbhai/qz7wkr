import { describe, expect, it, vi } from 'vitest';
import { shouldStepDay } from './BriefView';

const event = (overrides: Partial<Parameters<typeof shouldStepDay>[0]> = {}) => ({
  key: 'ArrowRight', defaultPrevented: false, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
  target: null,
  ...overrides,
});

describe('day stepping keys', () => {
  it.each([
    '.table-wrap', '[role="region"]', '[role="application"]', '[role="img"]', 'a[href]', 'details', 'summary',
    '[role="tablist"]', 'button', 'input', 'select', 'textarea', '[contenteditable]:not([contenteditable="false"])',
  ])('leaves keys inside %s to the focused region or control', (match) => {
    const ancestor = {};
    const closest = vi.fn((selectors: string) => selectors.split(', ').includes(match) ? ancestor : null);
    const target = { tagName: 'SPAN', closest } as unknown as EventTarget;
    expect(shouldStepDay(event({ target, key: 'ArrowLeft' }))).toBe(false);
    expect(shouldStepDay(event({ target }))).toBe(false);
    expect(closest).toHaveBeenCalled();
  });

  it.each(['defaultPrevented', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)('ignores %s events', (key) => {
    expect(shouldStepDay(event({ [key]: true }))).toBe(false);
  });

  it('steps only for left and right arrows outside guarded regions', () => {
    const target = { tagName: 'DIV', closest: () => null } as unknown as EventTarget;
    expect(shouldStepDay(event({ target }))).toBe(true);
    expect(shouldStepDay(event({ target, key: 'ArrowLeft' }))).toBe(true);
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'a']) {
      expect(shouldStepDay(event({ target, key }))).toBe(false);
    }
  });

  it('handles null and non-element event targets without requiring DOM globals', () => {
    expect(shouldStepDay(event())).toBe(true);
    expect(shouldStepDay(event({ target: {} as EventTarget }))).toBe(true);
  });
});
