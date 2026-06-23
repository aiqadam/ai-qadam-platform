// L3 workspace block - AsyncSelect. FR-MIG-004.
// Debounced server-backed dropdown. Keyboard nav via ARIA combobox pattern.

import { IslandRoot } from '@/lib/island-root';
import { cn } from '@/lib/utils';
import { ChevronDown, Loader2, X } from 'lucide-react';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface AsyncSelectOption {
  value: string;
  label: string;
}

export interface AsyncSelectProps {
  loadOptions: (input: string) => Promise<AsyncSelectOption[]>;
  value: AsyncSelectOption | null;
  onChange: (next: AsyncSelectOption | null) => void;
  placeholder?: string;
  defaultOptions?: AsyncSelectOption[];
  loadOptionsOnMount?: boolean;
  debounceMs?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
}

type AsyncState = 'idle' | 'loading' | 'success' | 'error';
const DEFAULT_DEBOUNCE_MS = 300;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

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

function useFetchOptions(
  loadOptions: (input: string) => Promise<AsyncSelectOption[]>,
  debouncedInput: string,
  defaultOptions: AsyncSelectOption[] | undefined,
  inputValue: string,
  loadOptionsOnMount: boolean,
) {
  const [options, setOptions] = useState<AsyncSelectOption[]>(defaultOptions ?? []);
  const [asyncState, setAsyncState] = useState<AsyncState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (
      !shouldFetch(
        debouncedInput,
        hasLoadedRef.current,
        inputValue,
        loadOptionsOnMount,
        defaultOptions !== undefined,
      )
    )
      return;
    let cancelled = false;
    setAsyncState('loading');
    setErrorMessage(null);
    loadOptions(debouncedInput)
      .then((result) => {
        if (cancelled) return;
        setOptions(result);
        setAsyncState('success');
        hasLoadedRef.current = true;
      })
      .catch(() => {
        if (cancelled) return;
        setErrorMessage('Could not load options');
        setAsyncState('error');
        hasLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedInput, loadOptions, defaultOptions, inputValue, loadOptionsOnMount]);

  return { options, asyncState, errorMessage };
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

function renderStatusIcon(asyncState: AsyncState): ReactElement {
  if (asyncState === 'loading')
    return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="8" strokeWidth="2" />
      <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function OptionItem({
  opt,
  isActive,
  listboxId,
  onClick,
}: {
  opt: AsyncSelectOption;
  isActive: boolean;
  listboxId: string;
  onClick: (opt: AsyncSelectOption) => void;
}): ReactElement {
  return (
    <div
      key={opt.value}
      // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA combobox pattern requires role=option on a div
      role="option"
      id={`${listboxId}-opt-${opt.value}`}
      aria-selected={isActive}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onClick(opt)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(opt);
        }
      }}
      className={cn(
        'px-3 py-2 text-sm cursor-pointer transition-colors',
        isActive ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted',
      )}
    >
      {opt.label}
    </div>
  );
}

function renderDropdown(
  options: AsyncSelectOption[],
  asyncState: AsyncState,
  errorMessage: string | null,
  activeIndex: number,
  listboxId: string,
  onOptionClick: (opt: AsyncSelectOption) => void,
): ReactElement {
  return (
    <div
      id={listboxId}
      // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA combobox pattern requires role=listbox on a div, not <ul>
      // biome-ignore lint/a11y/useFocusableInteractive: listbox is navigated via arrow keys on the input, not via tab focus
      role="listbox"
      aria-label="Options"
      aria-busy={asyncState === 'loading'}
      tabIndex={-1}
      className={cn(
        'absolute z-50 mt-1 w-full rounded-md border bg-popover py-1 shadow-md',
        'max-h-60 overflow-y-auto',
      )}
    >
      {asyncState === 'loading' && options.length === 0 && (
        <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
      )}
      {asyncState === 'error' && (
        <div className="px-3 py-2 text-sm text-destructive">{errorMessage}</div>
      )}
      {asyncState === 'success' && options.length === 0 && (
        <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
      )}
      {options.map((opt, i) => (
        <OptionItem
          key={opt.value}
          opt={opt}
          isActive={i === activeIndex}
          listboxId={listboxId}
          onClick={onOptionClick}
        />
      ))}
    </div>
  );
}

function AsyncSelectInner({
  loadOptions,
  value,
  onChange,
  placeholder = 'Search...',
  defaultOptions,
  loadOptionsOnMount = false,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  disabled = false,
  id,
  className,
}: AsyncSelectProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const debouncedInput = useDebounce(inputValue, debounceMs);
  const listboxId = useRef<string>(`ls-${Math.random().toString(36).slice(2, 9)}`).current;

  const { options, asyncState, errorMessage } = useFetchOptions(
    loadOptions,
    debouncedInput,
    defaultOptions,
    inputValue,
    loadOptionsOnMount,
  );

  const confirmSelection = useCallback(() => {
    const c2 = options[activeIndex];
    if (c2 !== undefined) {
      onChange(c2);
      setInputValue(c2.label);
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }, [activeIndex, onChange, options]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keyboard navigation requires per-key branching
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (disabled) return;
    if (!isOpen && e.key === 'ArrowDown') {
      setIsOpen(true);
      setActiveIndex(options.length > 0 ? 0 : -1);
      e.preventDefault();
      return;
    }
    if (!isOpen || options.length === 0) return;
    if (e.key === 'Enter') {
      confirmSelection();
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Tab') setIsOpen(false);
      else setInputValue(value?.label ?? '');
      setIsOpen(false);
      setActiveIndex(-1);
      e.preventDefault();
      return;
    }
    e.preventDefault();
    applyNav(e.key, activeIndex, options.length, setActiveIndex);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>): void {
    setInputValue(e.target.value);
    setActiveIndex(-1);
    if (!isOpen) setIsOpen(true);
  }
  function handleClear(): void {
    setInputValue('');
    setActiveIndex(-1);
    setIsOpen(false);
    onChange(null);
  }

  const displayValue = inputValue !== '' ? inputValue : (value?.label ?? '');
  const activeOption = options[activeIndex];
  const activeDescendantId =
    activeIndex >= 0 && activeOption !== undefined
      ? `${listboxId}-opt-${activeOption.value}`
      : undefined;

  return (
    <div className={cn('relative', className)}>
      <div
        aria-disabled={disabled}
        className={cn(
          'relative flex items-center rounded-md border',
          'bg-background text-sm transition-colors',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
        )}
      >
        <span className="absolute left-3 text-muted-foreground pointer-events-none">
          {renderStatusIcon(asyncState)}
        </span>
        <input
          id={id}
          role="combobox"
          type="text"
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeDescendantId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-busy={asyncState === 'loading'}
          disabled={disabled}
          value={displayValue}
          placeholder={placeholder}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => !disabled && setIsOpen(true)}
          onBlur={() => {
            setTimeout(() => setIsOpen(false), 150);
          }}
          className={cn(
            'w-full pl-9 pr-16 py-2 bg-transparent border-0 outline-none',
            'placeholder:text-muted-foreground',
            'disabled:cursor-not-allowed',
          )}
        />
        {(value || inputValue) && !disabled && (
          <button
            type="button"
            aria-label="Clear"
            onClick={handleClear}
            className="absolute right-8 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <span className="absolute right-2 text-muted-foreground pointer-events-none">
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </div>
      {isOpen &&
        !disabled &&
        renderDropdown(options, asyncState, errorMessage, activeIndex, listboxId, onChange)}
    </div>
  );
}

export function AsyncSelect(props: AsyncSelectProps): ReactElement {
  return (
    <IslandRoot>
      <AsyncSelectInner {...props} />
    </IslandRoot>
  );
}
