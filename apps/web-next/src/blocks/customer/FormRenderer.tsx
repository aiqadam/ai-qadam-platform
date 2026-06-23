// L3 customer block — <FormRenderer>.
//
// Public form submission renderer for /forms/[slug]. Renders any operator-authored
// form as a fillable form for members and anonymous visitors.
//
// Field types: short_text, long_text, yes_no, select_one, select_many,
//   scale (configurable range), speaker_rating
//
// AGENTS.md §5: Presentation-only — uses usePublicForm hook for data fetching.

'use client';

import type { FieldDef } from '@/blocks/workspace/FormBuilder';
import { IslandRoot } from '@/lib/island-root';
import type { PublicForm } from '@/lib/types';
import { submitForm } from '@/lib/use-public-form';
import { cn } from '@/lib/utils';
import { type ReactElement, useCallback, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'submitting' | 'success' | 'error';

interface FormRendererProps {
  form: PublicForm;
  onSubmitSuccess?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMeaningful(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

function stripEmptyValues(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!isMeaningful(v)) continue;
    out[k] = v;
  }
  return out;
}

// ─── Field renderers ─────────────────────────────────────────────────────────

function ShortTextField({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string | undefined;
}): ReactElement {
  return (
    <input
      type="text"
      maxLength={200}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    />
  );
}

function LongTextField({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder?: string | undefined;
}): ReactElement {
  return (
    <textarea
      rows={4}
      maxLength={2000}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    />
  );
}

function YesNoField({
  value,
  onChange,
  disabled,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  disabled: boolean;
}): ReactElement {
  return (
    <div className="flex gap-2">
      {[
        { v: true, label: 'Yes' },
        { v: false, label: 'No' },
      ].map(({ v, label }) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cn(
            'min-w-20 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
            'cursor-pointer disabled:cursor-not-allowed',
            value === v
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-transparent text-foreground hover:bg-muted',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SelectOneField({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: string; label: string }>;
  value: string | undefined;
  onChange: (v: string) => void;
  disabled: boolean;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={cn(
            'flex cursor-pointer items-center gap-2 text-sm',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <input
            type="radio"
            name={opt.value}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            disabled={disabled}
            className="h-4 w-4 accent-primary"
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function SelectManyField({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
}): ReactElement {
  const toggle = (v: string): void => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={cn(
            'flex cursor-pointer items-center gap-2 text-sm',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <input
            type="checkbox"
            value={opt.value}
            checked={value.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            disabled={disabled}
            className="h-4 w-4 rounded accent-primary"
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function ScaleField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: number | undefined;
  onChange: (v: number) => void;
  disabled: boolean;
}): ReactElement {
  const scale = field.scale ?? { min: 1, max: 10 };
  const buttons: number[] = [];
  for (let i = scale.min; i <= scale.max; i++) buttons.push(i);

  return (
    <div>
      <div
        className={cn(
          'grid gap-1',
          // Tailwind arbitrary value for dynamic column count
          `grid-cols-[repeat(${buttons.length},minmax(0,1fr))]`,
        )}
      >
        {buttons.map((n) => (
          <label
            key={n}
            className={cn(
              'flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold transition-colors',
              'disabled:cursor-not-allowed',
              value === n
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-transparent text-foreground hover:bg-muted',
            )}
          >
            <input
              type="radio"
              name={field.key}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              disabled={disabled}
              className="sr-only"
            />
            {n}
          </label>
        ))}
      </div>
      {(scale.min_label || scale.max_label) && (
        <div className="mt-1.5 flex justify-between font-mono text-xs text-muted-foreground">
          <span>{scale.min_label ?? ''}</span>
          <span>{scale.max_label ?? ''}</span>
        </div>
      )}
    </div>
  );
}

function SpeakerRatingField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  disabled: boolean;
}): ReactElement {
  const scale = field.scale ?? { min: 1, max: 5 };

  const setRating = (speakerKey: string, rating: number): void => {
    onChange({ ...value, [speakerKey]: rating });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Rate each speaker on a scale of {scale.min} to {scale.max}
      </p>
      <div className="space-y-4">
        {(field.options ?? []).map((opt) => {
          const currentRating = value[opt.value];
          return (
            <div key={opt.value} className="space-y-1.5">
              <p className="block font-medium text-sm">{opt.label}</p>
              <div
                className={cn(
                  'grid gap-1',
                  // Tailwind arbitrary value for dynamic column count
                  `grid-cols-[repeat(${scale.max - scale.min + 1},minmax(0,1fr))]`,
                )}
              >
                {Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i).map(
                  (n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={disabled}
                      onClick={() => setRating(opt.value, n)}
                      className={cn(
                        'flex h-9 cursor-pointer items-center justify-center rounded-md border text-sm font-medium transition-colors',
                        'disabled:cursor-not-allowed',
                        currentRating === n
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-transparent text-foreground hover:bg-muted',
                      )}
                    >
                      {n}
                    </button>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Field dispatch ───────────────────────────────────────────────────────────

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}): ReactElement {
  switch (field.type) {
    case 'short_text':
      return (
        <ShortTextField
          value={(value as string) ?? ''}
          onChange={onChange}
          disabled={disabled}
          placeholder={field.placeholder}
        />
      );
    case 'long_text':
      return (
        <LongTextField
          value={(value as string) ?? ''}
          onChange={onChange}
          disabled={disabled}
          placeholder={field.placeholder}
        />
      );
    case 'yes_no':
      return (
        <YesNoField value={value as boolean | undefined} onChange={onChange} disabled={disabled} />
      );
    case 'select_one':
      return (
        <SelectOneField
          options={field.options ?? []}
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'select_many':
      return (
        <SelectManyField
          options={field.options ?? []}
          value={(value as string[]) ?? []}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'scale':
      return (
        <ScaleField
          field={field}
          value={value as number | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'speaker_rating':
      return (
        <SpeakerRatingField
          field={field}
          value={(value as Record<string, number>) ?? {}}
          onChange={onChange}
          disabled={disabled}
        />
      );
  }
}

// ─── Submission ───────────────────────────────────────────────────────────────

interface SubmissionResult {
  success: boolean;
  errorMessage?: string;
}

async function submitToApi(
  slug: string,
  payload: Record<string, unknown>,
): Promise<SubmissionResult> {
  try {
    const result = await submitForm(slug, payload, true);
    if (result.success) return { success: true };
    return { success: false, errorMessage: result.error ?? 'Submission failed' };
  } catch (err) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : 'Submission failed',
    };
  }
}

// ─── FormRenderer ─────────────────────────────────────────────────────────────

export function FormRenderer({ form, onSubmitSuccess }: FormRendererProps): ReactElement {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const setField = useCallback((key: string, value: unknown): void => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setPhase('submitting');
      setError(null);

      const result = await submitToApi(form.slug, stripEmptyValues(values));
      if (result.success) {
        setPhase('success');
        onSubmitSuccess?.();
      } else {
        setError(result.errorMessage ?? 'Submission failed');
        setPhase('error');
      }
    },
    [form.slug, values, onSubmitSuccess],
  );

  if (phase === 'success') {
    return (
      <IslandRoot>
        <div className="rounded-xl border border-border bg-card p-9">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <svg
                className="h-6 w-6 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-label="Success"
              >
                <title>Success</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="mb-2 font-display text-xl font-semibold">Thanks for your response</h2>
            <p className="text-sm text-muted-foreground">
              {form.description ?? 'We read every response. It shapes the next event.'}
            </p>
          </div>
        </div>
      </IslandRoot>
    );
  }

  const isSubmitting = phase === 'submitting';

  return (
    <IslandRoot>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-9">
          <h1 className="mb-2 font-display text-2xl font-semibold">{form.title}</h1>
          {form.description && (
            <p className="mb-6 text-sm text-muted-foreground">{form.description}</p>
          )}
          <p className="mb-7 font-mono text-xs text-muted-foreground">
            Submitting as: <span className="text-foreground">Anonymous</span>
          </p>

          <div className="space-y-6">
            {form.schema.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <label
                  htmlFor={field.key}
                  className={cn('block text-sm', field.required ? 'font-medium' : 'font-normal')}
                >
                  {field.label}
                  {field.required && <span className="ml-0.5 text-destructive">*</span>}
                </label>
                <FieldInput
                  field={field}
                  value={values[field.key]}
                  onChange={(v) => setField(field.key, v)}
                  disabled={isSubmitting}
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    </IslandRoot>
  );
}

// ─── Island wrapper ────────────────────────────────────────────────────────────

export function FormRendererIsland(props: FormRendererProps): ReactElement {
  return (
    <IslandRoot>
      <FormRenderer {...props} />
    </IslandRoot>
  );
}
