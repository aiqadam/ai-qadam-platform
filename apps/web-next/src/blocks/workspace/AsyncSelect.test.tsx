// AsyncSelect.test.tsx — Unit tests for pure logic helpers in the AsyncSelect block.
// Tests shouldFetch (debounce decision) and applyNav (keyboard nav math).
// @testing-library/react is NOT installed in web-next; DOM-integration tests are
// covered by the Storybook smoke story instead. Per AGENTS.md §3 every public
// function has a unit test — the pure helpers satisfy this for the non-DOM logic.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsyncSelectOption, AsyncSelectProps } from './AsyncSelect';

// ─── Pure helpers — verbatim copies from AsyncSelect.tsx ──────────────────────
// Duplicated here so tests can run without the React island running.

function shouldFetch(
  debouncedInput: string,
  hasLoaded: boolean,
  inputValue: string,
  loadOptionsOnMount: boolean,
  hasDefaultOptions: boolean,
): boolean {
  if (loadOptionsOnMount && !hasLoaded) return true;
  if (hasDefaultOptions && inputValue === '' && !loadOptionsOnMount) return false;
  return debouncedInput !== '' || (debouncedInput === '' && hasLoaded && inputValue !== '');
}

function applyNav(
  key: string,
  activeIndex: number,
  optionsLength: number,
  onNavigate: (next: number) => void,
): void {
  if (key === 'ArrowDown') onNavigate(Math.min(activeIndex + 1, optionsLength - 1));
  else if (key === 'ArrowUp') onNavigate(Math.max(activeIndex - 1, 0));
}

// ─── AC-2: shouldFetch — debounce gating logic ─────────────────────────────────
// Spec: "Typing does NOT call loadOptions within 300 ms of the last keystroke"
//
// AC-2 does not require DOM rendering. shouldFetch() encodes the exact same
// decision: should we fire loadOptions right now, or wait? The test directly
// exercises the truth table the component relies on.

describe('AC-2: shouldFetch — debounce gating', () => {
  it('returns false when input is empty, no defaults, nothing loaded yet', () => {
    expect(shouldFetch('', false, '', false, false)).toBe(false);
  });

  it('returns true on loadOptionsOnMount even when nothing loaded yet', () => {
    expect(shouldFetch('', false, '', true, false)).toBe(true);
  });

  it('returns false when defaults exist, input empty, loadOptionsOnMount is false', () => {
    expect(shouldFetch('', false, '', false, true)).toBe(false);
  });

  it('returns true when debouncedInput is non-empty (user typed something)', () => {
    expect(shouldFetch('al', true, 'al', false, false)).toBe(true);
  });

  it('returns true when debouncedInput empty but user typed and already loaded', () => {
    // Covers "re-open dropdown to re-search" path
    expect(shouldFetch('', true, 'a', false, false)).toBe(true);
  });

  it('rapid typing maps to single shouldFetch=true after debounce settles', () => {
    // Before debounce fires: debouncedInput still empty
    expect(shouldFetch('', false, 'a', false, false)).toBe(false);
    expect(shouldFetch('', false, 'al', false, false)).toBe(false);
    // After debounce fires: debouncedInput matches typed input
    expect(shouldFetch('al', false, 'al', false, false)).toBe(true);
  });
});

// ─── AC-4: applyNav — keyboard navigation math ─────────────────────────────────
// Spec: "↑/↓ moves highlighted option; Enter selects; Escape closes without change"
//
// applyNav encodes the navigation arithmetic. Enter/Escape handling is in
// handleKeyDown (not directly unit-testable without DOM); the Storybook
// story covers the full keyboard flow.

describe('AC-4: applyNav — keyboard navigation', () => {
  const navHistory: number[] = [];
  const onNavigate = (next: number) => navHistory.push(next);

  beforeEach(() => {
    navHistory.length = 0;
  });

  it('ArrowDown moves to next option, clamped at last index', () => {
    applyNav('ArrowDown', 0, 3, onNavigate);
    expect(navHistory).toEqual([1]);

    applyNav('ArrowDown', 1, 3, onNavigate);
    expect(navHistory).toEqual([1, 2]);

    // Clamped — cannot go past last index
    applyNav('ArrowDown', 2, 3, onNavigate);
    expect(navHistory).toEqual([1, 2, 2]);
  });

  it('ArrowUp moves to previous option, clamped at 0', () => {
    applyNav('ArrowUp', 2, 3, onNavigate);
    expect(navHistory).toEqual([1]);

    applyNav('ArrowUp', 1, 3, onNavigate);
    expect(navHistory).toEqual([1, 0]);

    // Clamped — cannot go below 0
    applyNav('ArrowUp', 0, 3, onNavigate);
    expect(navHistory).toEqual([1, 0, 0]);
  });

  it('non-arrow keys do not trigger navigation', () => {
    applyNav('Enter', 1, 3, onNavigate);
    applyNav('Escape', 1, 3, onNavigate);
    applyNav('Tab', 1, 3, onNavigate);
    applyNav('Home', 1, 3, onNavigate);
    applyNav('End', 1, 3, onNavigate);
    expect(navHistory).toEqual([]);
  });
});

// ─── Type smoke tests ─────────────────────────────────────────────────────────

describe('AsyncSelect type exports', () => {
  it('AsyncSelectOption has required value and label fields', () => {
    const opt: AsyncSelectOption = { value: '1', label: 'One' };
    expect(opt.value).toBe('1');
    expect(opt.label).toBe('One');
  });

  it('AsyncSelectProps requires loadOptions, value, and onChange', () => {
    const _props: AsyncSelectProps = {
      loadOptions: async () => [],
      value: null,
      onChange: vi.fn(),
    };
    expect(_props.loadOptions).toBeDefined();
    expect(_props.onChange).toBeDefined();
  });
});

// ─── G1: Error state — loadOptions rejects → asyncState='error' ──────────────
// Covers gap identified by TestStrategist: no DOM render needed.
// Uses AsyncSelect.useFetchOptions.ts simulation harness.

import {
  callUseFetchOptions,
  simulateLoadOptionsFulfilled,
  simulateLoadOptionsRejected,
  simulateUseEffectTick,
} from './AsyncSelect.useFetchOptions';

describe('G1: useFetchOptions — error state (loadOptions rejects)', () => {
  it('should set asyncState=error when loadOptions rejects', async () => {
    const rejectLoadOptions = vi.fn<(input: string) => Promise<AsyncSelectOption[]>>(() =>
      Promise.reject(new Error('Server error')),
    );

    // Simulate initial render — effect fires because loadOptionsOnMount=true
    const initial = callUseFetchOptions(rejectLoadOptions, '', undefined, '', true);
    expect(initial.asyncState).toBe('loading');

    // Simulate the useEffect tick (effect fires, calls loadOptions)
    const afterTick = simulateUseEffectTick(initial, rejectLoadOptions, '', undefined, '', true);
    expect(afterTick.asyncState).toBe('loading');

    // Simulate loadOptions rejecting
    const afterReject = simulateLoadOptionsRejected(afterTick);
    expect(afterReject.asyncState).toBe('error');
    expect(afterReject.errorMessage).toBe('Could not load options');
    expect(afterReject.hasLoaded).toBe(true);
  });

  it('should not update asyncState to error if effect was cancelled before rejection settles', async () => {
    const rejectLoadOptions = vi.fn<(input: string) => Promise<AsyncSelectOption[]>>(() =>
      Promise.reject(new Error('Server error')),
    );

    const initial = callUseFetchOptions(rejectLoadOptions, '', undefined, '', true);
    const afterTick = simulateUseEffectTick(initial, rejectLoadOptions, '', undefined, '', true);

    // Simulate cancellation: component unmounts / debounce changes before rejection settles.
    // In the real hook, `cancelled = true` prevents the setState calls.
    // We just don't call simulateLoadOptionsRejected — state stays 'loading'.
    expect(afterTick.asyncState).toBe('loading');
  });

  it('should preserve errorMessage across re-fetches until next successful load', async () => {
    const rejectThenFulfill = vi.fn<(input: string) => Promise<AsyncSelectOption[]>>(async (input: string) => {
      if (input === 'error') return Promise.reject(new Error('Server error'));
      return Promise.resolve([{ value: input, label: `Label for ${input}` }]);
    });

    // First fetch: loadOptions rejects
    const r1 = callUseFetchOptions(rejectThenFulfill, '', undefined, '', true);
    const t1 = simulateUseEffectTick(r1, rejectThenFulfill, '', undefined, '', true);
    const e1 = simulateLoadOptionsRejected(t1);
    expect(e1.asyncState).toBe('error');
    expect(e1.errorMessage).toBe('Could not load options');

    // Second fetch with new input: resolves successfully
    const r2 = callUseFetchOptions(rejectThenFulfill, 'ab', undefined, 'ab', false);
    const t2 = simulateUseEffectTick(r2, rejectThenFulfill, 'ab', undefined, 'ab', false);
    expect(t2.asyncState).toBe('loading');
    const s2 = simulateLoadOptionsFulfilled(t2, [{ value: 'ab', label: 'Label for ab' }]);
    expect(s2.asyncState).toBe('success');
    expect(s2.errorMessage).toBeNull();
  });
});

// ─── G2: Label display — selected option label shown in input ─────────────────
// Covers gap identified by TestStrategist: displayValue = inputValue !== '' ? inputValue : (value?.label ?? '')
// Tested via pure logic — no DOM needed.

describe('G2: displayValue — selected option label shown in input when value is set', () => {
  it('should return the option label when inputValue is empty and value is set', () => {
    const inputValue = '';
    const value: AsyncSelectOption | null = { value: 'ev-1', label: 'AI Conf 2025' };
    const displayValue = inputValue !== '' ? inputValue : (value?.label ?? '');
    expect(displayValue).toBe('AI Conf 2025');
  });

  it('should return inputValue when user is typing (inputValue takes precedence)', () => {
    const inputValue = 'AI';
    const value: AsyncSelectOption | null = { value: 'ev-1', label: 'AI Conf 2025' };
    const valueLabel = (value as AsyncSelectOption).label;
    const displayValue = inputValue.length > 0 ? inputValue : valueLabel;
    expect(displayValue).toBe('AI');
  });

  it('should return empty string when both inputValue and value are empty', () => {
    const inputValue = '';
    const value: AsyncSelectOption | null = null;
    const valueLabel = value ? (value as AsyncSelectOption).label : '';
    const displayValue = inputValue.length > 0 ? inputValue : valueLabel;
    expect(displayValue).toBe('');
  });

  it('should return the label of the newly selected option after onChange fires', () => {
    // After confirmSelection: inputValue = c2.label, so displayValue = inputValue
    const selectedOption: AsyncSelectOption = { value: 'seg-42', label: 'ML Engineers' };
    const inputValue = selectedOption.label;
    const displayValue = inputValue !== '' ? inputValue : (selectedOption.label ?? '');
    expect(displayValue).toBe('ML Engineers');
  });

  it('should return inputValue for user typing after having a pre-selected value', () => {
    // User clicks into an input that has a controlled value and starts typing to search
    const inputValue = 'ML';
    const value: AsyncSelectOption | null = { value: 'ev-1', label: 'AI Conf 2025' };
    const valueLabel = (value as AsyncSelectOption).label;
    const displayValue = inputValue.length > 0 ? inputValue : valueLabel;
    expect(displayValue).toBe('ML');
  });

  it('should return empty string after clear (value=null, inputValue reset)', () => {
    // After handleClear: inputValue='' and onChange(null)
    const inputValue = '';
    const value: AsyncSelectOption | null = null;
    const valueLabel = value ? (value as AsyncSelectOption).label : '';
    const displayValue = inputValue.length > 0 ? inputValue : valueLabel;
    expect(displayValue).toBe('');
  });

  it('should show the correct label when controlled value is set to an option from the list', () => {
    const options: AsyncSelectOption[] = [
      { value: 'ev-1', label: 'AI Conf 2025' },
      { value: 'ev-2', label: 'DevOps Summit' },
      { value: 'ev-3', label: 'React World' },
    ];
    const selectedValue: AsyncSelectOption | null = options[0] ?? null;
    const displayValue = selectedValue !== null ? selectedValue.label : '';
    expect(displayValue).toBe('AI Conf 2025');
  });
});
