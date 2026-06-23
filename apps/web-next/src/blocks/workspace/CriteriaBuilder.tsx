// L3 workspace block — <CriteriaBuilder>.
//
// Segment criteria builder for Telegram audience targeting. Operators
// define reusable audience definitions using an AND/OR criteria DSL.
//
// Supported leaf types:
//   country (_eq / _in)
//   registered_for_event (_eq)
//   preferred_topics (_contains)
//   linked_within_days (_gte)
//
// FR-MIG-014.

import { Button } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import type { SegmentCriteria, SegmentLeaf } from '@/lib/types';
import { useEventTopics } from '@/lib/use-telegram-topics';
import { useWorkspaceEvents } from '@/lib/use-workspace-events';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { AsyncSelect, type AsyncSelectOption } from './AsyncSelect';

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldKey = 'country' | 'linked_within_days' | 'registered_for_event' | 'preferred_topics';

const FIELD_LABEL: Record<FieldKey, string> = {
  country: 'Country',
  linked_within_days: 'Linked recently',
  registered_for_event: 'Registered for event',
  preferred_topics: 'Followed topic',
};

export interface CriteriaBuilderProps {
  criteria: SegmentCriteria;
  country: string;
  onChange: (next: SegmentCriteria) => void;
  className?: string;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

function blankLeaf(field: FieldKey, country: string): SegmentLeaf {
  if (field === 'country') return { country: { _eq: country } };
  if (field === 'linked_within_days') return { linked_within_days: { _gte: 30 } };
  if (field === 'registered_for_event') return { registered_for_event: { _eq: '' } };
  return { preferred_topics: { _contains: '' } };
}

// ─── CriteriaBuilder root ────────────────────────────────────────────────────

function CriteriaBuilderInner({
  criteria,
  country,
  onChange,
  className,
}: CriteriaBuilderProps): ReactElement {
  const [editMode, setEditMode] = useState<'builder' | 'json'>('builder');
  const [jsonDraft, setJsonDraft] = useState(JSON.stringify(criteria, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (editMode === 'builder') {
      setJsonDraft(JSON.stringify(criteria, null, 2));
    }
  }, [criteria, editMode]);

  const op = (criteria._or ? '_or' : '_and') as '_and' | '_or';
  const leaves: SegmentLeaf[] = criteria._or ?? criteria._and ?? [];

  const setOp = useCallback(
    (next: '_and' | '_or'): void => {
      onChange(next === '_or' ? { _or: [...leaves] } : { _and: [...leaves] });
    },
    [leaves, onChange],
  );

  const updateLeaf = useCallback(
    (index: number, next: SegmentLeaf): void => {
      const updated = leaves.map((l, i) => (i === index ? next : l));
      onChange(op === '_or' ? { _or: updated } : { _and: updated });
    },
    [leaves, op, onChange],
  );

  const removeLeaf = useCallback(
    (index: number): void => {
      const updated = leaves.filter((_, i) => i !== index);
      onChange(op === '_or' ? { _or: updated } : { _and: updated });
    },
    [leaves, op, onChange],
  );

  const addLeaf = useCallback(
    (field: FieldKey): void => {
      const fresh = blankLeaf(field, country);
      const updated = [...leaves, fresh];
      onChange(op === '_or' ? { _or: updated } : { _and: updated });
    },
    [leaves, op, country, onChange],
  );

  const commitJson = useCallback((): void => {
    try {
      const parsed = JSON.parse(jsonDraft) as SegmentCriteria;
      onChange(parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'JSON parse failed');
    }
  }, [jsonDraft, onChange]);

  if (editMode === 'json') {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
          <span className="font-mono text-xs font-medium text-muted-foreground">
            Edit JSON (advanced)
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={commitJson}>
              Apply
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditMode('builder')}>
              Back to builder
            </Button>
          </div>
        </div>
        {jsonError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {jsonError}
          </div>
        )}
        <textarea
          value={jsonDraft}
          onChange={(e) => setJsonDraft(e.target.value)}
          rows={10}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="criteria-json-textarea"
        />
        <p className="text-xs text-muted-foreground">
          Supported fields: <code className="text-[10px]">country</code>,{' '}
          <code className="text-[10px]">linked_within_days</code>,{' '}
          <code className="text-[10px]">registered_for_event</code>,{' '}
          <code className="text-[10px]">preferred_topics</code>. Wrap leaves in{' '}
          <code className="text-[10px]">_and</code> or <code className="text-[10px]">_or</code>.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          Match
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as '_and' | '_or')}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="_and">all of the criteria</option>
            <option value="_or">any of the criteria</option>
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setEditMode('json')}
          data-testid="edit-json-toggle"
        >
          Edit JSON
        </Button>
      </div>

      {leaves.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No criteria yet. Use "+ Add criterion" below. Every segment also AND-intersects with the
            always-on scope: tg-linked, not opted out, in <strong>{country.toUpperCase()}</strong>.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {leaves.map((leaf, i) => (
          <LeafEditor
            // biome-ignore lint/suspicious/noArrayIndexKey: leaves reorder by position; index IS identity
            key={i}
            leaf={leaf}
            country={country}
            onChange={(next) => updateLeaf(i, next)}
            onRemove={() => removeLeaf(i)}
          />
        ))}
      </div>

      <AddCriterionPicker onAdd={addLeaf} />
    </div>
  );
}

export function CriteriaBuilder(props: CriteriaBuilderProps): ReactElement {
  return (
    <IslandRoot>
      <CriteriaBuilderInner {...props} />
    </IslandRoot>
  );
}

// ─── Add-criterion dropdown ──────────────────────────────────────────────────

function AddCriterionPicker({ onAdd }: { onAdd: (f: FieldKey) => void }): ReactElement {
  const [pick, setPick] = useState<FieldKey | ''>('');
  return (
    <div className="flex items-center gap-2">
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value as FieldKey | '')}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="add-criterion-select"
      >
        <option value="">+ Add criterion…</option>
        {(Object.keys(FIELD_LABEL) as FieldKey[]).map((f) => (
          <option key={f} value={f}>
            {FIELD_LABEL[f]}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pick === ''}
        onClick={() => {
          if (pick !== '') {
            onAdd(pick);
            setPick('');
          }
        }}
      >
        Add
      </Button>
    </div>
  );
}

// ─── Per-leaf editor ─────────────────────────────────────────────────────────

function LeafEditor({
  leaf,
  country,
  onChange,
  onRemove,
}: {
  leaf: SegmentLeaf;
  country: string;
  onChange: (next: SegmentLeaf) => void;
  onRemove: () => void;
}): ReactElement {
  if ('country' in leaf) {
    return <CountryWidget leaf={leaf} onChange={onChange} onRemove={onRemove} />;
  }
  if ('linked_within_days' in leaf) {
    return <LinkedDaysWidget leaf={leaf} onChange={onChange} onRemove={onRemove} />;
  }
  if ('registered_for_event' in leaf) {
    return (
      <EventPickerWidget leaf={leaf} country={country} onChange={onChange} onRemove={onRemove} />
    );
  }
  return <TopicPickerWidget leaf={leaf} onChange={onChange} onRemove={onRemove} />;
}

// ─── Widget: country ────────────────────────────────────────────────────────

const COUNTRIES: { code: string; label: string }[] = [
  { code: 'uz', label: 'Uzbekistan' },
  { code: 'kz', label: 'Kazakhstan' },
  { code: 'tj', label: 'Tajikistan' },
];

function CountryWidget({
  leaf,
  onChange,
  onRemove,
}: {
  leaf: { country: { _eq?: string; _in?: string[] } };
  onChange: (next: SegmentLeaf) => void;
  onRemove: () => void;
}): ReactElement {
  const selected = leaf.country._in ?? (leaf.country._eq ? [leaf.country._eq] : []);

  const toggle = (code: string): void => {
    const next = selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
    const first = next[0];
    if (next.length === 1 && first !== undefined) {
      onChange({ country: { _eq: first } });
    } else if (next.length > 1) {
      onChange({ country: { _in: next } });
    } else {
      onChange({ country: { _eq: '' } });
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-1 items-center gap-2">
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Country
        </span>
        <div className="flex flex-wrap gap-1.5">
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => toggle(c.code)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selected.includes(c.code)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-primary',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onRemove}
        className="text-destructive"
      >
        Remove
      </Button>
    </div>
  );
}

// ─── Widget: linked_within_days ─────────────────────────────────────────────

function LinkedDaysWidget({
  leaf,
  onChange,
  onRemove,
}: {
  leaf: { linked_within_days: { _gte: number } };
  onChange: (next: SegmentLeaf) => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-1 items-center gap-2">
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Linked recently
        </span>
        <span className="text-sm text-muted-foreground">within last</span>
        <input
          type="number"
          min={1}
          max={3650}
          value={leaf.linked_within_days._gte}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n > 0) {
              onChange({ linked_within_days: { _gte: n } });
            }
          }}
          className="w-20 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-sm text-muted-foreground">days</span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onRemove}
        className="text-destructive"
      >
        Remove
      </Button>
    </div>
  );
}

// ─── Widget: registered_for_event ──────────────────────────────────────────

function EventPickerWidget({
  leaf,
  country,
  onChange,
  onRemove,
}: {
  leaf: { registered_for_event: { _eq: string } };
  country: string;
  onChange: (next: SegmentLeaf) => void;
  onRemove: () => void;
}): ReactElement {
  const eventsQuery = useWorkspaceEvents(country);

  const loadEvents = useCallback(
    async (input: string): Promise<AsyncSelectOption[]> => {
      const events = eventsQuery.data?.events;
      if (!events) return [];
      const q = input.toLowerCase();
      return events
        .filter((e) => e.title.toLowerCase().includes(q))
        .slice(0, 20)
        .map((e) => ({
          value: e.id,
          label: `${e.title} · ${new Date(e.starts_at).toLocaleDateString()}`,
        }));
    },
    [eventsQuery.data?.events],
  );

  const selectedEvent =
    eventsQuery.data?.events?.find((e) => e.id === leaf.registered_for_event._eq) ?? null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-1 items-center gap-2">
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Event
        </span>
        {eventsQuery.isLoading && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading events…
          </span>
        )}
        {eventsQuery.isError && (
          <span className="text-sm text-destructive">Events failed to load</span>
        )}
        {eventsQuery.isSuccess && eventsQuery.data && (
          <AsyncSelect
            loadOptions={loadEvents}
            value={selectedEvent ? { value: selectedEvent.id, label: selectedEvent.title } : null}
            onChange={(opt) => onChange({ registered_for_event: { _eq: opt?.value ?? '' } })}
            placeholder="Search events..."
            className="w-64"
          />
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onRemove}
        className="text-destructive"
      >
        Remove
      </Button>
    </div>
  );
}

// ─── Widget: preferred_topics ───────────────────────────────────────────────

function TopicPickerWidget({
  leaf,
  onChange,
  onRemove,
}: {
  leaf: { preferred_topics: { _contains: string } };
  onChange: (next: SegmentLeaf) => void;
  onRemove: () => void;
}): ReactElement {
  const topicsQuery = useEventTopics();

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Topic
        </span>
        {topicsQuery.isLoading && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading topics…
          </span>
        )}
        {topicsQuery.isSuccess &&
          topicsQuery.data?.items?.map((t) => (
            <button
              key={t.slug}
              type="button"
              onClick={() => onChange({ preferred_topics: { _contains: t.slug } })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                leaf.preferred_topics._contains === t.slug
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-primary',
              )}
            >
              {t.icon ? `${t.icon} ` : ''}
              {t.label}
            </button>
          ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onRemove}
        className="text-destructive"
      >
        Remove
      </Button>
    </div>
  );
}
