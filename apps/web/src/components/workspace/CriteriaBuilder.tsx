import { type ReactElement, useEffect, useState } from 'react';

// #393 — friendly criteria builder for tg_segments. Replaces the raw
// JSON textarea in the segments cabinet. Operators pick fields from a
// dropdown, get per-field widgets (country chips, days input, event
// picker, topic chips). Power users can flip to "Edit JSON" for the
// underlying DSL.
//
// The output shape matches the DSL the server validator already
// enforces (`validateCriteria` in tg-segments.service.ts) — no
// service changes needed.

export type Recurrence = 'none' | 'weekly' | 'monthly';

// Leaf field types — mirror SegmentCriteria's leaf shapes.
type CountryLeaf = { country: { _eq?: string; _in?: string[] } };
type LinkedDaysLeaf = { linked_within_days: { _gte: number } };
type EventLeaf = { registered_for_event: { _eq: string } };
type TopicLeaf = { preferred_topics: { _contains: string } };
type Leaf = CountryLeaf | LinkedDaysLeaf | EventLeaf | TopicLeaf;

export type Criteria = { _and?: Leaf[]; _or?: Leaf[] };

type FieldKey = 'country' | 'linked_within_days' | 'registered_for_event' | 'preferred_topics';

const FIELD_LABEL: Record<FieldKey, string> = {
  country: 'Country',
  linked_within_days: 'Linked recently',
  registered_for_event: 'Registered for event',
  preferred_topics: 'Followed topic',
};

interface EventListItem {
  id: string;
  title: string;
  country: string;
  starts_at: string;
}

interface EventTopic {
  slug: string;
  label: string;
  icon: string | null;
}

interface Props {
  criteria: Criteria;
  country: string;
  accessToken: string;
  onChange: (next: Criteria) => void;
}

export default function CriteriaBuilder({
  criteria,
  country,
  accessToken,
  onChange,
}: Props): ReactElement {
  const [editMode, setEditMode] = useState<'builder' | 'json'>('builder');
  const [jsonDraft, setJsonDraft] = useState(JSON.stringify(criteria, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Sync json draft when criteria changes upstream (e.g. on a new template load)
  // BUT only when in builder mode — don't blow away in-flight JSON edits.
  useEffect(() => {
    if (editMode === 'builder') {
      setJsonDraft(JSON.stringify(criteria, null, 2));
    }
  }, [criteria, editMode]);

  const op = (criteria._or ? '_or' : '_and') as '_and' | '_or';
  const leaves: Leaf[] = criteria._or ?? criteria._and ?? [];

  const setOp = (next: '_and' | '_or'): void => {
    onChange(next === '_or' ? { _or: leaves } : { _and: leaves });
  };

  const updateLeaf = (index: number, next: Leaf): void => {
    const updated = leaves.map((l, i) => (i === index ? next : l));
    onChange(op === '_or' ? { _or: updated } : { _and: updated });
  };

  const removeLeaf = (index: number): void => {
    const updated = leaves.filter((_, i) => i !== index);
    onChange(op === '_or' ? { _or: updated } : { _and: updated });
  };

  const addLeaf = (field: FieldKey): void => {
    const fresh = blankLeaf(field, country);
    const updated = [...leaves, fresh];
    onChange(op === '_or' ? { _or: updated } : { _and: updated });
  };

  // JSON mode commit: parse + replace + (if valid) flip back to builder.
  const commitJson = (): void => {
    try {
      const parsed = JSON.parse(jsonDraft) as Criteria;
      onChange(parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'JSON parse failed');
    }
  };

  if (editMode === 'json') {
    return (
      <div style={builderShellStyle()}>
        <div style={builderHeaderStyle()}>
          <strong>Edit JSON (advanced)</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={commitJson} style={smallBtnStyle()}>
              Apply
            </button>
            <button type="button" onClick={() => setEditMode('builder')} style={smallBtnStyle()}>
              Back to builder
            </button>
          </div>
        </div>
        {jsonError && <div style={errorBoxStyle()}>{jsonError}</div>}
        <textarea
          value={jsonDraft}
          onChange={(e) => setJsonDraft(e.target.value)}
          rows={12}
          style={{ ...inputStyle(), fontFamily: 'var(--font-mono)', width: '100%' }}
          data-testid="criteria-json-textarea"
        />
        <p style={mutedStyle()}>
          Supported fields: <code>country</code>, <code>linked_within_days</code>,
          <code>registered_for_event</code>, <code>preferred_topics</code>. Wrap leaves in
          <code>_and</code> or <code>_or</code>.
        </p>
      </div>
    );
  }

  return (
    <div style={builderShellStyle()} data-testid="criteria-builder">
      <div style={builderHeaderStyle()}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          Match
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as '_and' | '_or')}
            style={smallInputStyle()}
          >
            <option value="_and">all of the criteria</option>
            <option value="_or">any of the criteria</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setEditMode('json')}
          style={smallBtnStyle()}
          data-testid="edit-json-toggle"
        >
          Edit JSON
        </button>
      </div>

      {leaves.length === 0 && (
        <p style={mutedStyle()}>
          No criteria yet. Use "+ Add criterion" below. Every segment also AND-intersects with the
          always-on scope: tg-linked, not opted out, in <strong>{country.toUpperCase()}</strong>.
        </p>
      )}

      {leaves.map((leaf, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: leaves reorder by position; index IS identity
        <div key={i} style={leafRowStyle()}>
          <LeafEditor
            leaf={leaf}
            accessToken={accessToken}
            country={country}
            onChange={(next) => updateLeaf(i, next)}
          />
          <button
            type="button"
            onClick={() => removeLeaf(i)}
            style={smallBtnStyle()}
            data-testid={`remove-leaf-${i}`}
          >
            Remove
          </button>
        </div>
      ))}

      <AddCriterionPicker onAdd={addLeaf} />
    </div>
  );
}

// ─── Add-criterion dropdown ──────────────────────────────────────────────

function AddCriterionPicker({ onAdd }: { onAdd: (f: FieldKey) => void }): ReactElement {
  const [pick, setPick] = useState<FieldKey | ''>('');
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value as FieldKey | '')}
        style={smallInputStyle()}
        data-testid="add-criterion-select"
      >
        <option value="">+ Add criterion…</option>
        {(Object.keys(FIELD_LABEL) as FieldKey[]).map((f) => (
          <option key={f} value={f}>
            {FIELD_LABEL[f]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pick === ''}
        onClick={() => {
          if (pick !== '') {
            onAdd(pick);
            setPick('');
          }
        }}
        style={smallBtnStyle()}
      >
        Add
      </button>
    </div>
  );
}

// ─── Per-leaf editor (dispatches by field) ────────────────────────────────

function LeafEditor({
  leaf,
  accessToken,
  country,
  onChange,
}: {
  leaf: Leaf;
  accessToken: string;
  country: string;
  onChange: (next: Leaf) => void;
}): ReactElement {
  if ('country' in leaf) {
    return <CountryWidget leaf={leaf} onChange={onChange} />;
  }
  if ('linked_within_days' in leaf) {
    return <LinkedDaysWidget leaf={leaf} onChange={onChange} />;
  }
  if ('registered_for_event' in leaf) {
    return (
      <EventPickerWidget
        leaf={leaf}
        accessToken={accessToken}
        country={country}
        onChange={onChange}
      />
    );
  }
  return <TopicPickerWidget leaf={leaf} accessToken={accessToken} onChange={onChange} />;
}

// ─── Widget: country ─────────────────────────────────────────────────────

const COUNTRIES: { code: string; label: string }[] = [
  { code: 'uz', label: 'Uzbekistan' },
  { code: 'kz', label: 'Kazakhstan' },
  { code: 'tj', label: 'Tajikistan' },
];

function CountryWidget({
  leaf,
  onChange,
}: {
  leaf: CountryLeaf;
  onChange: (next: CountryLeaf) => void;
}): ReactElement {
  const selected = leaf.country._in ?? (leaf.country._eq ? [leaf.country._eq] : []);
  const toggle = (code: string): void => {
    const next = selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
    // exactOptionalPropertyTypes: next[0] is string|undefined with
    // noUncheckedIndexedAccess. We know length===1 ⇒ index 0 exists.
    const first = next[0];
    if (next.length === 1 && first !== undefined) {
      onChange({ country: { _eq: first } });
    } else {
      onChange({ country: { _in: next } });
    }
  };
  return (
    <div style={leafBodyStyle()}>
      <span style={leafLabelStyle()}>Country in:</span>
      {COUNTRIES.map((c) => (
        <button
          key={c.code}
          type="button"
          onClick={() => toggle(c.code)}
          style={chipStyle(selected.includes(c.code))}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

// ─── Widget: linked_within_days ──────────────────────────────────────────

function LinkedDaysWidget({
  leaf,
  onChange,
}: {
  leaf: LinkedDaysLeaf;
  onChange: (next: LinkedDaysLeaf) => void;
}): ReactElement {
  return (
    <div style={leafBodyStyle()}>
      <span style={leafLabelStyle()}>Linked within last</span>
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
        style={{ ...smallInputStyle(), width: 80 }}
      />
      <span style={leafLabelStyle()}>days</span>
    </div>
  );
}

// ─── Widget: registered_for_event ────────────────────────────────────────

function EventPickerWidget({
  leaf,
  accessToken,
  country,
  onChange,
}: {
  leaf: EventLeaf;
  accessToken: string;
  country: string;
  onChange: (next: EventLeaf) => void;
}): ReactElement {
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/v1/workspace/events', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const body = (await res.json()) as { events: EventListItem[] };
        if (!cancelled) {
          // Sort by starts_at desc so the most recent is at the top.
          setEvents(
            body.events
              .filter((e) => e.country === country)
              .sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'fetch failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, country]);

  return (
    <div style={leafBodyStyle()}>
      <span style={leafLabelStyle()}>Registered for event:</span>
      {events === null && !error && <span style={mutedStyle()}>Loading events…</span>}
      {error && <span style={mutedStyle()}>Events failed to load ({error})</span>}
      {events && (
        <select
          value={leaf.registered_for_event._eq}
          onChange={(e) => onChange({ registered_for_event: { _eq: e.target.value } })}
          style={{ ...smallInputStyle(), flex: 1 }}
        >
          <option value="">— pick an event —</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} · {new Date(e.starts_at).toLocaleDateString()}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ─── Widget: preferred_topics ────────────────────────────────────────────

function TopicPickerWidget({
  leaf,
  accessToken,
  onChange,
}: {
  leaf: TopicLeaf;
  accessToken: string;
  onChange: (next: TopicLeaf) => void;
}): ReactElement {
  const [topics, setTopics] = useState<EventTopic[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/v1/telegram/event-topics', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const body = (await res.json()) as { items: EventTopic[] };
          if (!cancelled) setTopics(body.items);
        }
      } catch {
        // silent — fall back to slug input
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return (
    <div style={leafBodyStyle()}>
      <span style={leafLabelStyle()}>Followed topic:</span>
      {topics === null && <span style={mutedStyle()}>Loading topics…</span>}
      {topics?.map((t) => (
        <button
          key={t.slug}
          type="button"
          onClick={() => onChange({ preferred_topics: { _contains: t.slug } })}
          style={chipStyle(leaf.preferred_topics._contains === t.slug)}
        >
          {t.icon ? `${t.icon} ` : ''}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Defaults + styles ───────────────────────────────────────────────────

function blankLeaf(field: FieldKey, country: string): Leaf {
  if (field === 'country') return { country: { _eq: country } };
  if (field === 'linked_within_days') return { linked_within_days: { _gte: 30 } };
  if (field === 'registered_for_event') return { registered_for_event: { _eq: '' } };
  return { preferred_topics: { _contains: '' } };
}

function builderShellStyle(): React.CSSProperties {
  return {
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  };
}
function builderHeaderStyle(): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottom: '1px solid var(--border)',
  };
}
function leafRowStyle(): React.CSSProperties {
  return {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px dashed var(--border)',
  };
}
function leafBodyStyle(): React.CSSProperties {
  return { display: 'flex', gap: 6, alignItems: 'center', flex: 1, flexWrap: 'wrap' };
}
function leafLabelStyle(): React.CSSProperties {
  return { fontSize: 13, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' };
}
function chipStyle(selected: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 16,
    border: '1px solid var(--border)',
    background: selected ? 'var(--primary)' : 'transparent',
    color: selected ? 'var(--primary-foreground)' : 'var(--foreground)',
    fontSize: 13,
    cursor: 'pointer',
  };
}
function smallBtnStyle(): React.CSSProperties {
  return {
    padding: '4px 12px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--foreground)',
    fontSize: 13,
    cursor: 'pointer',
  };
}
function smallInputStyle(): React.CSSProperties {
  return {
    padding: '4px 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 13,
    background: 'var(--background)',
    color: 'var(--foreground)',
  };
}
function inputStyle(): React.CSSProperties {
  return {
    padding: '8px 12px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 14,
    background: 'var(--background)',
    color: 'var(--foreground)',
  };
}
function mutedStyle(): React.CSSProperties {
  return { color: 'var(--muted-foreground)', fontSize: 13 };
}
function errorBoxStyle(): React.CSSProperties {
  return {
    padding: 8,
    border: '1px solid #dc2626',
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 6,
    fontSize: 13,
  };
}
