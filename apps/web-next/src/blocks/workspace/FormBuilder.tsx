// L3 workspace block — <FormBuilder>.
//
// Drag-and-drop form builder for operator-authored forms and segment criteria.
// Gated by: FR-MIG-013 (forms builder cabinet), FR-MIG-014 (Telegram segments),
// FR-MIG-019 (public form renderer).
//
// 7 field types:
//   short_text, long_text, yes_no, select_one, select_many,
//   scale (1-10), speaker_rating
//
// Keyboard drag: Space to grab/drop, arrow keys to move, Escape to cancel.
//
// AGENTS.md §5: Presentation-only — no direct API calls inside the block.

'use client';

import { Button } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { cn } from '@/lib/utils';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Eye, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export const FIELD_TYPE_META: {
  readonly [K in FieldType]: { label: string; description: string };
} = {
  short_text: { label: 'Short text', description: 'Single-line text input' },
  long_text: { label: 'Long text', description: 'Multi-line text area' },
  yes_no: { label: 'Yes / No', description: 'Toggle with two options' },
  select_one: { label: 'Single choice', description: 'Radio buttons' },
  select_many: { label: 'Multiple choice', description: 'Checkboxes' },
  scale: { label: 'Scale (1-10)', description: 'Numeric rating scale' },
  speaker_rating: { label: 'Speaker rating', description: 'Per-speaker rating (1-5)' },
};

export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'yes_no'
  | 'select_one'
  | 'select_many'
  | 'scale'
  | 'speaker_rating';

export interface ScaleConfig {
  min: number;
  max: number;
  min_label?: string | undefined;
  max_label?: string | undefined;
}

export interface SelectOption {
  value: string;
  label: string;
}

/** Canonical field definition — consumed by FR-MIG-019 FormRenderer */
export interface FieldDef {
  type: FieldType;
  key: string;
  label: string;
  required?: boolean | undefined;
  placeholder?: string | undefined;
  scale?: ScaleConfig | undefined;
  options?: SelectOption[] | undefined;
}

export interface FormBuilderProps {
  /** Ordered list of field definitions — updated via onChange */
  schema: FieldDef[];
  onChange: (schema: FieldDef[]) => void;
  /** Optional read-only preview mode */
  preview?: boolean;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateKey(existingKeys: string[]): string {
  let n = existingKeys.length + 1;
  while (existingKeys.includes(`q${n}`)) n++;
  return `q${n}`;
}

function defaultScaleForType(type: FieldType): ScaleConfig {
  return type === 'speaker_rating' ? { min: 1, max: 5 } : { min: 1, max: 10 };
}

function defaultOptions(): SelectOption[] {
  return [
    { value: 'opt1', label: 'Option 1' },
    { value: 'opt2', label: 'Option 2' },
  ];
}

function newField(type: FieldType, existingKeys: string[]): FieldDef {
  const key = generateKey(existingKeys);
  const base: FieldDef = {
    type,
    key,
    label: `Question ${existingKeys.length + 1}`,
    required: false,
  };
  if (type === 'short_text' || type === 'long_text') {
    base.placeholder = '';
  } else if (type === 'scale' || type === 'speaker_rating') {
    base.scale = defaultScaleForType(type);
  } else if (type === 'select_one' || type === 'select_many') {
    base.options = defaultOptions();
  }
  return base;
}

// ─── Field type picker ────────────────────────────────────────────────────────

function FieldTypePicker({
  onAdd,
}: {
  onAdd: (type: FieldType) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(FIELD_TYPE_META) as FieldType[]).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onAdd(type)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-input bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {FIELD_TYPE_META[type].label}
        </button>
      ))}
    </div>
  );
}

// ─── Sortable field card ─────────────────────────────────────────────────────

interface SortableFieldCardProps {
  field: FieldDef;
  isFirst: boolean;
  isLast: boolean;
  preview: boolean;
  onUpdate: (patch: Partial<FieldDef>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SortableFieldCard({
  field,
  isFirst,
  isLast,
  preview,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: SortableFieldCardProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.key,
    disabled: preview,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      // arch-ignore: no-inline-style — dnd-kit requires style prop for CSS transform during drag
      style={style}
      className={cn(
        'rounded-lg border bg-card p-4 transition-shadow',
        isDragging ? 'opacity-50 shadow-md' : 'shadow-sm',
        preview ? 'opacity-80' : '',
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        {!preview && (
          <button
            type="button"
            className="cursor-grab text-muted-foreground hover:text-foreground touch-manipulation"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {FIELD_TYPE_META[field.type]?.label ?? field.type}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{field.key}</span>
        <div className="ml-auto flex items-center gap-1">
          {!preview && (
            <>
              <button
                type="button"
                onClick={onMoveUp}
                disabled={isFirst}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                aria-label="Move field up"
              >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onMoveDown}
                disabled={isLast}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                aria-label="Move field down"
              >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="rounded p-1 text-destructive hover:bg-destructive/10"
                aria-label="Remove field"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      <FieldEditor field={field} onUpdate={onUpdate} disabled={preview} />
    </div>
  );
}

// ─── Field editor (inline) ───────────────────────────────────────────────────

interface FieldEditorProps {
  field: FieldDef;
  onUpdate: (patch: Partial<FieldDef>) => void;
  disabled?: boolean;
}

function FieldEditor({ field, onUpdate, disabled }: FieldEditorProps): ReactElement {
  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="fb-question"
          className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          Question
        </label>
        <input
          id="fb-question"
          type="text"
          value={field.label}
          disabled={disabled}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </div>

      {!disabled && (
        <div>
          <label
            htmlFor="fb-key"
            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Field key
          </label>
          <input
            id="fb-key"
            type="text"
            value={field.key}
            onChange={(e) => onUpdate({ key: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={field.required ?? false}
          disabled={disabled}
          onChange={(e) => onUpdate({ required: e.target.checked })}
          className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span>Required</span>
      </label>

      <TypeSpecificEditor field={field} onUpdate={onUpdate} disabled={disabled ?? false} />
    </div>
  );
}

// ─── Type-specific editors (extracted to reduce cognitive complexity) ───────────

function TextTypeEditor({ field, onUpdate, disabled }: TypeSpecificEditorProps): ReactElement {
  return (
    <div>
      <label
        htmlFor="fb-placeholder"
        className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        Placeholder
      </label>
      <input
        id="fb-placeholder"
        type="text"
        value={field.placeholder ?? ''}
        disabled={disabled}
        onChange={(e) => onUpdate({ placeholder: e.target.value || undefined })}
        placeholder="Hint text shown in the empty field"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
    </div>
  );
}

function ScaleTypeEditor({ field, onUpdate, disabled }: TypeSpecificEditorProps): ReactElement {
  const scale = field.scale ?? defaultScaleForType(field.type);

  function patchScale(patch: Partial<typeof scale>): void {
    onUpdate({ scale: { ...scale, ...patch } });
  }

  return (
    <>
      <div>
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Scale range
        </span>
        <div className="flex items-center gap-2">
          <input
            id="fb-scale-min"
            type="number"
            value={scale.min}
            disabled={disabled}
            onChange={(e) => patchScale({ min: Number(e.target.value) })}
            className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <span className="text-muted-foreground">to</span>
          <input
            id="fb-scale-max"
            type="number"
            value={scale.max}
            disabled={disabled}
            onChange={(e) => patchScale({ max: Number(e.target.value) })}
            className="w-20 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor="fb-scale-min-label"
            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Min label
          </label>
          <input
            id="fb-scale-min-label"
            type="text"
            value={scale.min_label ?? ''}
            disabled={disabled}
            onChange={(e) => patchScale({ min_label: e.target.value || undefined })}
            placeholder="e.g. Not at all"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        </div>
        <div>
          <label
            htmlFor="fb-scale-max-label"
            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Max label
          </label>
          <input
            id="fb-scale-max-label"
            type="text"
            value={scale.max_label ?? ''}
            disabled={disabled}
            onChange={(e) => patchScale({ max_label: e.target.value || undefined })}
            placeholder="e.g. Very likely"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        </div>
      </div>
    </>
  );
}

function SelectTypeEditor({ field, onUpdate, disabled }: TypeSpecificEditorProps): ReactElement {
  const options = field.options ?? defaultOptions();

  function updateOption(i: number, patch: { value?: string; label?: string }): void {
    const next = [...options];
    const existing = next[i];
    if (existing) {
      next[i] = {
        value: patch.value ?? existing.value,
        label: patch.label ?? existing.label,
      };
    }
    onUpdate({ options: next });
  }

  function removeOption(i: number): void {
    onUpdate({ options: options.filter((_, j) => j !== i) });
  }

  function addOption(): void {
    onUpdate({
      options: [
        ...options,
        { value: `opt${options.length + 1}`, label: `Option ${options.length + 1}` },
      ],
    });
  }

  return (
    <div>
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Options
      </span>
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={`${opt.value}-${i}`} className="flex items-center gap-2">
            <input
              id={`fb-opt-value-${i}`}
              type="text"
              placeholder="value"
              value={opt.value}
              disabled={disabled}
              onChange={(e) => updateOption(i, { value: e.target.value })}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            <input
              id={`fb-opt-label-${i}`}
              type="text"
              placeholder="label"
              value={opt.label}
              disabled={disabled}
              onChange={(e) => updateOption(i, { label: e.target.value })}
              className="flex-[2] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                disabled={options.length <= 2}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                aria-label="Remove option"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={addOption}
            className="inline-flex items-center gap-1 rounded border border-dashed border-input px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            Add option
          </button>
        )}
      </div>
    </div>
  );
}

interface TypeSpecificEditorProps {
  field: FieldDef;
  onUpdate: (patch: Partial<FieldDef>) => void;
  disabled?: boolean | undefined;
}

function TypeSpecificEditor({
  field,
  onUpdate,
  disabled,
}: TypeSpecificEditorProps): ReactElement | null {
  if (field.type === 'short_text' || field.type === 'long_text') {
    return <TextTypeEditor field={field} onUpdate={onUpdate} disabled={disabled} />;
  }
  if (field.type === 'scale' || field.type === 'speaker_rating') {
    return <ScaleTypeEditor field={field} onUpdate={onUpdate} disabled={disabled} />;
  }
  if (field.type === 'select_one' || field.type === 'select_many') {
    return <SelectTypeEditor field={field} onUpdate={onUpdate} disabled={disabled} />;
  }
  return null;
}

// ─── Preview mode renderer ────────────────────────────────────────────────────

function FormPreview({ schema }: { schema: FieldDef[] }): ReactElement {
  return (
    <div className="space-y-4 rounded-lg border bg-card p-6">
      <p className="text-sm text-muted-foreground">Preview — form as members would see it</p>
      {schema.map((field) => (
        <PreviewField key={field.key} field={field} />
      ))}
      <Button type="button" className="mt-2">
        Submit
      </Button>
    </div>
  );
}

function PreviewField({ field }: { field: FieldDef }): ReactElement {
  const id = `preview-${field.key}`;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className={cn('block font-sans text-sm', field.required ? 'font-medium' : 'font-normal')}
      >
        {field.label}
        {field.required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <PreviewInput field={field} id={id} />
      {field.placeholder && <p className="text-xs text-muted-foreground">{field.placeholder}</p>}
    </div>
  );
}

function PreviewInput({
  field,
  id,
}: {
  field: FieldDef;
  id: string;
}): ReactElement {
  switch (field.type) {
    case 'short_text':
      return (
        <input
          id={id}
          type="text"
          placeholder={field.placeholder}
          disabled
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm opacity-50"
        />
      );
    case 'long_text':
      return (
        <textarea
          id={id}
          placeholder={field.placeholder}
          disabled
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm opacity-50"
        />
      );
    case 'yes_no':
      return (
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={id} disabled /> Yes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={id} disabled /> No
          </label>
        </div>
      );
    case 'select_one': {
      const options = field.options ?? defaultOptions();
      return (
        <div className="space-y-1.5">
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input type="radio" name={id} disabled /> {opt.label}
            </label>
          ))}
        </div>
      );
    }
    case 'select_many': {
      const options = field.options ?? defaultOptions();
      return (
        <div className="space-y-1.5">
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled /> {opt.label}
            </label>
          ))}
        </div>
      );
    }
    case 'scale':
    case 'speaker_rating': {
      const scale = field.scale ?? defaultScaleForType(field.type);
      const values = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i);
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{scale.min_label ?? scale.min}</span>
            <span>{scale.max_label ?? scale.max}</span>
          </div>
          <div className="flex gap-2">
            {values.map((v) => (
              <button
                key={v}
                type="button"
                disabled
                className="h-8 w-8 rounded border border-input bg-background text-sm opacity-50"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      );
    }
    default:
      return <span className="text-xs text-muted-foreground">Unknown field type</span>;
  }
}

// ─── FormBuilder root ────────────────────────────────────────────────────────

export function FormBuilder({
  schema,
  onChange,
  preview: initialPreview = false,
  className,
}: FormBuilderProps): ReactElement {
  const [preview, setPreview] = useState(initialPreview);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const existingKeys = useMemo(() => schema.map((f) => f.key), [schema]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = schema.findIndex((f) => f.key === active.id);
        const newIndex = schema.findIndex((f) => f.key === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          onChange(arrayMove(schema, oldIndex, newIndex));
        }
      }
    },
    [schema, onChange],
  );

  const addField = useCallback(
    (type: FieldType) => {
      onChange([...schema, newField(type, existingKeys)]);
    },
    [schema, existingKeys, onChange],
  );

  const updateField = useCallback(
    (index: number, patch: Partial<FieldDef>) => {
      const next = [...schema];
      const current = next[index];
      if (!current) return;
      next[index] = {
        type: patch.type ?? current.type,
        key: patch.key ?? current.key,
        label: patch.label ?? current.label,
        required: patch.required,
        placeholder: patch.placeholder,
        scale: patch.scale,
        options: patch.options,
      };
      onChange(next);
    },
    [schema, onChange],
  );

  const removeField = useCallback(
    (index: number) => {
      onChange(schema.filter((_, i) => i !== index));
    },
    [schema, onChange],
  );

  const moveField = useCallback(
    (index: number, dir: -1 | 1) => {
      const newIndex = index + dir;
      if (newIndex < 0 || newIndex >= schema.length) return;
      onChange(arrayMove(schema, index, newIndex));
    },
    [schema, onChange],
  );

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreview(false)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              !preview
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setPreview(true)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              preview
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            Preview
          </button>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {schema.length} field{schema.length !== 1 ? 's' : ''}
        </span>
      </div>

      {preview ? (
        schema.length > 0 ? (
          <FormPreview schema={schema} />
        ) : (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No fields to preview
          </div>
        )
      ) : (
        <>
          {schema.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                No fields yet — pick a type to start.
              </p>
              <FieldTypePicker onAdd={addField} />
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={schema.map((f) => f.key)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {schema.map((field, index) => (
                    <SortableFieldCard
                      key={field.key}
                      field={field}
                      isFirst={index === 0}
                      isLast={index === schema.length - 1}
                      preview={preview}
                      onUpdate={(patch) => updateField(index, patch)}
                      onRemove={() => removeField(index)}
                      onMoveUp={() => moveField(index, -1)}
                      onMoveDown={() => moveField(index, 1)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {schema.length > 0 && (
            <div className="rounded-lg border border-dashed p-4">
              <p className="mb-2 text-xs text-muted-foreground">Add field</p>
              <FieldTypePicker onAdd={addField} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Island wrapper ──────────────────────────────────────────────────────────

export function FormBuilderIsland(props: FormBuilderProps): ReactElement {
  return (
    <IslandRoot>
      <FormBuilder {...props} />
    </IslandRoot>
  );
}
