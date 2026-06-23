// AsyncSelect.useFetchOptions.ts
// Standalone extracted version of useFetchOptions for unit testing without React DOM.
// Tests the error-state path: loadOptions rejects → asyncState='error'.

import { type AsyncSelectOption, type AsyncState } from './AsyncSelect';

// Duplicated from AsyncSelect.tsx — keep in sync.
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

interface UseFetchOptionsResult {
  options: AsyncSelectOption[];
  asyncState: AsyncState;
  errorMessage: string | null;
}

/**
 * Synchronous simulation of useFetchOptions logic.
 * Returns the same { options, asyncState, errorMessage } shape that the hook returns.
 *
 * Call sequence:
 *  1. callUseFetchOptions(loadOptions, ...)  ← initial render, not loading yet
 *  2. simulateUseEffectTick(useFetchResult)  ← effect fires, calls loadOptions
 *  3. simulateLoadOptionsSettled(useFetchResult, rejected?) ← Promise resolves/rejects
 */
function callUseFetchOptions(
  _loadOptions: (input: string) => Promise<AsyncSelectOption[]>,
  debouncedInput: string,
  defaultOptions: AsyncSelectOption[] | undefined,
  inputValue: string,
  loadOptionsOnMount: boolean,
): UseFetchOptionsResult & { hasLoaded: boolean } {
  const hasDefaultOptions = defaultOptions !== undefined;
  const hasLoaded = false; // initial state before any effect runs
  const needsFetch = shouldFetch(
    debouncedInput,
    hasLoaded,
    inputValue,
    loadOptionsOnMount,
    hasDefaultOptions,
  );

  return {
    options: defaultOptions ?? [],
    asyncState: needsFetch ? 'loading' : 'idle',
    errorMessage: null,
    hasLoaded,
  };
}

function simulateUseEffectTick(
  prev: UseFetchOptionsResult & { hasLoaded: boolean },
  _loadOptions: (input: string) => Promise<AsyncSelectOption[]>,
  debouncedInput: string,
  defaultOptions: AsyncSelectOption[] | undefined,
  inputValue: string,
  loadOptionsOnMount: boolean,
): UseFetchOptionsResult & { hasLoaded: boolean } {
  const hasDefaultOptions = defaultOptions !== undefined;
  const needsFetch = shouldFetch(
    debouncedInput,
    prev.hasLoaded,
    inputValue,
    loadOptionsOnMount,
    hasDefaultOptions,
  );

  if (!needsFetch) {
    return { ...prev, asyncState: 'idle' };
  }

  // The effect calls loadOptions(debouncedInput) and updates state based on result.
  // We return 'loading' to indicate the async operation is in flight.
  return { options: prev.options, asyncState: 'loading', errorMessage: null, hasLoaded: false };
}

function simulateLoadOptionsRejected(
  prev: UseFetchOptionsResult & { hasLoaded: boolean },
): UseFetchOptionsResult & { hasLoaded: boolean } {
  // When loadOptions rejects, the catch block sets asyncState='error' and errorMessage.
  return {
    options: prev.options,
    asyncState: 'error',
    errorMessage: 'Could not load options',
    hasLoaded: true,
  };
}

function simulateLoadOptionsFulfilled(
  _prev: UseFetchOptionsResult & { hasLoaded: boolean },
  result: AsyncSelectOption[],
): UseFetchOptionsResult & { hasLoaded: boolean } {
  return { options: result, asyncState: 'success', errorMessage: null, hasLoaded: true };
}

// ─── Exported test helpers ───────────────────────────────────────────────────

export type { UseFetchOptionsResult };

export {
  callUseFetchOptions,
  simulateUseEffectTick,
  simulateLoadOptionsRejected,
  simulateLoadOptionsFulfilled,
  shouldFetch,
};
