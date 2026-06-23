// L3 workspace block — <Form>.
//
// Generic Zod-driven form wrapper for all write operations. Accepts a Zod schema
// and renders labelled fields automatically. Compatible with TanStack Query mutations.
//
// Field types inferred from Zod schema:
//   text     → z.string()          → <Input type="text">
//   textarea → z.string() + refine → <textarea>
//   number   → z.number()          → <Input type="number">
//   date     → z.string() + date   → <Input type="date">
//   select   → z.enum()            → <Select>
//   checkbox → z.boolean()         → <input type="checkbox">
//   async-select → z.string() + meta → <AsyncSelect> (FR-MIG-004)
//
// AGENTS.md §5: Presentation-only — no direct API calls inside the block.

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { type DefaultValues, type FieldPath, type RegisterOptions, useForm } from 'react-hook-form';
import { type AnyZodObject, type ZodTypeAny, z } from 'zod';
import { AsyncSelect, type AsyncSelectOption } from './AsyncSelect';

// ─── Field metadata ──────────────────────────────────────────────────────────

/** How a Zod schema field maps to a render type */
type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'async-select';

/** Per-field configuration extracted from the Zod schema */
interface FieldMeta {
  type: FieldType;
  label: string;
  placeholder?: string | undefined;
  hint?: string | undefined;
  options?: readonly string[] | undefined; // for select / enum
  required: boolean;
  disabled?: boolean | undefined;
  /** For async-select fields: called with the search query to load matching options. */
  loadOptions?: ((input: string) => Promise<AsyncSelectOption[]>) | undefined;
}

// ─── Zod inference helpers ────────────────────────────────────────────────────

function inferFieldType(
  key: string,
  schema: ZodTypeAny,
  meta?: Record<string, unknown>,
): FieldType {
  // 1. Explicit type hint from schema meta (consumer can set zodInputType)
  const hint = (meta as Record<string, FieldType> | undefined)?.[key];
  if (hint) return hint;

  // 2. Type-based inference
  if (schema instanceof z.ZodBoolean) return 'checkbox';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodEnum) return 'select';

  if (schema instanceof z.ZodString) {
    // Heuristic: keys containing 'date', 'at', '_at' → date
    if (/date|at|_at/i.test(key)) return 'date';
    return 'text';
  }

  return 'text';
}

// ─── Schema walking ──────────────────────────────────────────────────────────

/** Extract field metadata from a Zod object schema */
function extractFields(schema: AnyZodObject): Record<string, FieldMeta> {
  const shape = schema.shape;
  const meta = (schema as unknown as { _meta?: Record<string, Record<string, unknown>> })
    ._meta?.[0];

  const result: Record<string, FieldMeta> = {};

  for (const [key, fieldSchema] of Object.entries(shape)) {
    // Unwrap optional / nullable via _def (not a method call in newer zod)
    const def = (fieldSchema as { _def?: { innerType?: ZodTypeAny; typeName?: string } })._def;
    const unwrapped =
      def?.typeName === 'ZodOptional' || def?.typeName === 'ZodNullable'
        ? (def?.innerType ?? fieldSchema)
        : fieldSchema;

    const inferredType = inferFieldType(key, unwrapped as ZodTypeAny, meta);

    // Build label from key: "eventTitle" → "Event Title"
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();

    const fieldMeta: FieldMeta = {
      type: inferredType,
      label,
      required: def?.typeName !== 'ZodOptional',
    };

    if (unwrapped instanceof z.ZodEnum) {
      fieldMeta.options = unwrapped.options;
    }

    result[key] = fieldMeta;
  }

  return result;
}

// ─── Field renderer ───────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
}

function Field({
  label,
  htmlFor,
  children,
  hint,
  error,
  required,
}: FieldProps): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className={cn(
          'block font-mono text-[10px] uppercase tracking-wider',
          required ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground m-0">{hint}</p>}
      {error && <p className="text-xs text-destructive m-0">{error}</p>}
    </div>
  );
}

// ─── Sub-renderers — one per field type ──────────────────────────────────────
// Extracted to keep cognitive complexity of each under 10.

function CheckboxField<T extends Record<string, unknown>>({
  meta,
  id,
  registration,
}: FormFieldProps<T>): React.ReactElement {
  const { label } = meta;
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        disabled={registration.disabled}
        {...(registration as React.InputHTMLAttributes<HTMLInputElement>)}
        className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
      />
      <label htmlFor={id} className="text-sm font-medium cursor-pointer">
        {label}
      </label>
    </div>
  );
}

function TextareaField<T extends Record<string, unknown>>({
  meta,
  id,
  registration,
  error,
}: FormFieldProps<T>): React.ReactElement {
  const { placeholder } = meta;
  return (
    <textarea
      id={id}
      placeholder={placeholder}
      disabled={registration.disabled}
      className={cn(
        'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error && 'border-destructive',
      )}
      {...(registration.value || {})}
      onChange={registration.onChange as React.ChangeEventHandler<HTMLTextAreaElement>}
      onBlur={registration.onBlur}
      name={id}
    />
  );
}

function SelectField<T extends Record<string, unknown>>({
  meta,
  id,
  registration,
  error,
}: FormFieldProps<T>): React.ReactElement {
  const { label, placeholder, options } = meta;
  return (
    <Select
      {...(registration.value ? { value: String(registration.value) } : {})}
      onValueChange={(v) => {
        const event = {
          target: { name: id, value: v },
        } as unknown as React.ChangeEvent<HTMLSelectElement>;
        registration.onChange?.(event);
      }}
    >
      <SelectTrigger className={cn(error && 'border-destructive')}>
        <SelectValue placeholder={placeholder ?? `Select ${label}`} />
      </SelectTrigger>
      <SelectContent>
        {options?.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InputField<T extends Record<string, unknown>>({
  meta,
  id,
  registration,
  error,
}: FormFieldProps<T>): React.ReactElement {
  const { type, placeholder } = meta;
  return (
    <Input
      id={id}
      type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
      placeholder={placeholder}
      disabled={registration.disabled}
      className={cn(error && 'border-destructive')}
      value={(registration.value as string | number | undefined) ?? ''}
      onChange={registration.onChange as React.ChangeEventHandler<HTMLInputElement>}
      onBlur={registration.onBlur}
      name={id}
    />
  );
}

function AsyncSelectField<T extends Record<string, unknown>>({
  meta,
  id,
  registration,
  error,
}: FormFieldProps<T>): React.ReactElement {
  // RHF stores the selected option's `value` (string) in registration.value
  const selectedValue = registration.value as string | null | undefined;
  const { label, placeholder, loadOptions } = meta;

  return (
    <AsyncSelect
      id={id}
      loadOptions={loadOptions ?? (async () => [])}
      value={selectedValue != null ? { value: selectedValue, label: selectedValue } : null}
      onChange={(next) => {
        const event = {
          target: { name: id, value: next?.value ?? '' },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        registration.onChange?.(event);
      }}
      placeholder={placeholder ?? `Search ${label.toLowerCase()}…`}
      disabled={registration.disabled}
      className={cn(error && 'border-destructive')}
    />
  );
}

// ─── FormField dispatcher ──────────────────────────────────────────────────────

interface FormFieldProps<T extends Record<string, unknown>> {
  meta: FieldMeta;
  id: FieldPath<T>;
  registration: RegisterOptions<T, FieldPath<T>>;
  error?: string | undefined;
}

function FormField<T extends Record<string, unknown>>({
  meta,
  id,
  registration,
  error,
}: FormFieldProps<T>): React.ReactElement {
  const { type, label, hint, required } = meta;

  switch (type) {
    case 'async-select':
      return (
        <Field label={label} htmlFor={id} hint={hint} error={error} required={required}>
          <AsyncSelectField meta={meta} id={id} registration={registration} error={error} />
        </Field>
      );
    case 'checkbox':
      return (
        <Field label={label} htmlFor={id} hint={hint} error={error} required={required}>
          <CheckboxField meta={meta} id={id} registration={registration} error={error} />
        </Field>
      );
    case 'textarea':
      return (
        <Field label={label} htmlFor={id} hint={hint} error={error} required={required}>
          <TextareaField meta={meta} id={id} registration={registration} error={error} />
        </Field>
      );
    case 'select':
      return (
        <Field label={label} htmlFor={id} hint={hint} error={error} required={required}>
          <SelectField meta={meta} id={id} registration={registration} error={error} />
        </Field>
      );
    default:
      return (
        <Field label={label} htmlFor={id} hint={hint} error={error} required={required}>
          <InputField meta={meta} id={id} registration={registration} error={error} />
        </Field>
      );
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface FormProps<T extends AnyZodObject = AnyZodObject> {
  /** Zod schema — fields are inferred and rendered automatically */
  schema: T;
  /** Called with fully-typed, validated data on valid submit */
  onSubmit: (data: z.infer<T>) => void | Promise<void>;
  /** Initial values — keys must match schema shape */
  defaultValues?: DefaultValues<z.infer<T>>;
  /** Extra class(es) on the wrapping form element */
  className?: string;
  /** Whether the form is pending a server-side mutation — sets all fields + button to disabled */
  isPending?: boolean | undefined;
}

/**
 * Generic Zod-driven form block for operator write cabinets.
 *
 * Usage:
 * ```tsx
 * <Form
 *   schema={z.object({ title: z.string().min(1), status: z.enum(['draft','published']) })}
 *   defaultValues={{ status: 'draft' }}
 *   onSubmit={async (data) => { await mutation.mutateAsync(data); }}
 * />
 * ```
 */
export function Form<T extends AnyZodObject>({
  schema,
  onSubmit,
  defaultValues,
  className,
  isPending = false,
}: FormProps<T>): React.ReactElement {
  const fields = extractFields(schema);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<T>>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? ({} as DefaultValues<z.infer<T>>),
    disabled: isPending,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={cn('space-y-5', className)} noValidate>
      {Object.entries(fields).map(([key, meta]) => {
        const error = errors[key]?.message as string | undefined;
        return (
          <FormField<z.infer<T>>
            key={key}
            id={key as FieldPath<z.infer<T>>}
            meta={meta}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            registration={
              register(key as FieldPath<z.infer<T>>) as unknown as RegisterOptions<
                z.infer<T>,
                FieldPath<z.infer<T>>
              >
            }
            error={error}
          />
        );
      })}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Submitting…' : 'Submit'}
        </Button>
      </div>
    </form>
  );
}

// ─── Island wrapper ──────────────────────────────────────────────────────────

export function FormIsland<T extends AnyZodObject>(props: FormProps<T>): React.ReactElement {
  return (
    <IslandRoot>
      <Form {...props} />
    </IslandRoot>
  );
}
