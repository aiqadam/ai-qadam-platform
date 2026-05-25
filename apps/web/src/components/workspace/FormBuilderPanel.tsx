import { type ReactElement, useEffect, useMemo, useState } from 'react';

// Operator form-builder cabinet — per-form editor.
//
// What the operator does here:
//   1. Edit metadata (title, description, country, status, allow_anonymous)
//   2. Add/remove/reorder fields. 6 field types match the cross-layer
//      contract: short_text, long_text, scale, select_one, select_many, yes_no
//   3. Hit "Save" to persist
//   4. "View public form" jumps to /forms/{slug} for a real preview
//
// The schema editor is intentionally simple in v1 — vertical list with
// up/down arrows, no drag-drop library. Enough for the standardized
// post-event survey use case + most operator-built forms.

const FIELD_TYPES = [
  'short_text',
  'long_text',
  'scale',
  'select_one',
  'select_many',
  'yes_no',
] as const;
type FieldType = (typeof FIELD_TYPES)[number];

interface FormField {
  type: FieldType;
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  scale?: { min: number; max: number; min_label?: string; max_label?: string };
  options?: { value: string; label: string }[];
}

interface Form {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  country: string;
  status: 'draft' | 'published' | 'archived';
  allow_anonymous: boolean;
  schema: { fields: FormField[] };
  submission_count: number;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; accessToken: string; form: Form }
  | { phase: 'error'; message: string };

async function bootstrap(formId: string): Promise<State> {
  try {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!r.ok) return { phase: 'anon' };
    const { accessToken } = (await r.json()) as { accessToken: string };
    const res = await fetch(`/api/v1/workspace/forms/${encodeURIComponent(formId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) return { phase: 'anon' };
    if (!res.ok) return { phase: 'error', message: `load form: ${res.status}` };
    const { form } = (await res.json()) as { form: Form };
    // Ensure schema shape — older drafts may have null/missing.
    if (!form.schema?.fields) form.schema = { fields: [] };
    return { phase: 'authed', accessToken, form };
  } catch (err) {
    return { phase: 'error', message: err instanceof Error ? err.message : 'bootstrap failed' };
  }
}

function signInUrl(formId: string): string {
  const next = `/workspace/forms/${formId}`;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

async function saveForm(
  accessToken: string,
  formId: string,
  patch: Partial<Pick<Form, 'title' | 'description' | 'status' | 'allow_anonymous'>> & {
    schema?: Form['schema'];
  },
): Promise<{ ok: true; form: Form } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/v1/workspace/forms/${encodeURIComponent(formId)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `save: ${res.status} ${text.slice(0, 200)}` };
    }
    const { form } = (await res.json()) as { form: Form };
    return { ok: true, form };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'save failed' };
  }
}

export default function FormBuilderPanel({ formId }: { formId: string }): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [draft, setDraft] = useState<Form | null>(null);

  useEffect(() => {
    void bootstrap(formId).then((s) => {
      setState(s);
      if (s.phase === 'authed') setDraft(s.form);
    });
  }, [formId]);

  if (state.phase === 'loading') return <Shell>Loading…</Shell>;
  if (state.phase === 'anon') {
    return (
      <Shell>
        <p style={{ marginBottom: 16 }}>You need to sign in.</p>
        <a href={signInUrl(formId)} className="btn btn-primary">
          Sign in
        </a>
      </Shell>
    );
  }
  if (state.phase === 'error' || !draft) {
    return (
      <Shell>
        <p style={{ color: 'var(--destructive, #c00)' }}>
          {state.phase === 'error' ? state.message : 'No draft loaded'}
        </p>
      </Shell>
    );
  }
  return (
    <AuthedBuilder
      formId={formId}
      state={state}
      draft={draft}
      setState={setState}
      setDraft={setDraft}
    />
  );
}

function AuthedBuilder({
  formId,
  state,
  draft,
  setState,
  setDraft,
}: {
  formId: string;
  state: Extract<State, { phase: 'authed' }>;
  draft: Form;
  setState: (s: State) => void;
  setDraft: (f: Form) => void;
}): ReactElement {
  const [savingPhase, setSavingPhase] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savingError, setSavingError] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(state.form) !== JSON.stringify(draft),
    [state.form, draft],
  );

  const handleSave = makeSaveHandler({
    accessToken: state.accessToken,
    formId,
    draft,
    setSavingPhase,
    setSavingError,
    onSaved: (saved) => {
      setState({ ...state, form: saved });
      setDraft(saved);
    },
  });

  const { updateField, addField, removeField, moveField } = useFieldOps(draft, setDraft);

  return (
    <Shell>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <a href="/workspace/forms" style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
            ← Back to forms
          </a>
          <h1 style={{ margin: '6px 0 0', fontSize: 26, fontFamily: 'var(--font-display)' }}>
            {draft.title || 'Untitled form'}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
            <code>{draft.slug}</code> · {draft.submission_count} responses
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {savingPhase === 'saved' && (
            <span style={{ fontSize: 12, color: '#22c55e' }}>✓ saved</span>
          )}
          {savingPhase === 'error' && savingError && (
            <span style={{ fontSize: 12, color: 'var(--destructive, #c00)' }}>{savingError}</span>
          )}
          <a
            href={`/workspace/forms/${formId}/responses`}
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            View responses ({draft.submission_count})
          </a>
          <a
            href={`/forms/${draft.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{ textDecoration: 'none' }}
          >
            View public form ↗
          </a>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!dirty || savingPhase === 'saving'}
            onClick={() => void handleSave()}
          >
            {savingPhase === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <MetadataBlock draft={draft} setDraft={setDraft} />

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>Fields</h2>
      {draft.schema.fields.length === 0 ? (
        <div
          style={{
            padding: 24,
            border: '1px dashed var(--border)',
            borderRadius: 12,
            textAlign: 'center',
            color: 'var(--muted-foreground)',
            marginBottom: 16,
          }}
        >
          No fields yet — pick a type to start.
        </div>
      ) : (
        draft.schema.fields.map((field, idx) => (
          <FieldEditor
            key={`${field.key}-${idx}`}
            field={field}
            isFirst={idx === 0}
            isLast={idx === draft.schema.fields.length - 1}
            onChange={(p) => updateField(idx, p)}
            onRemove={() => removeField(idx)}
            onMoveUp={() => moveField(idx, -1)}
            onMoveDown={() => moveField(idx, 1)}
          />
        ))
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 }}>
        {FIELD_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className="btn"
            onClick={() => addField(t)}
            style={{ fontSize: 13 }}
          >
            + {humanizeFieldType(t)}
          </button>
        ))}
      </div>
    </Shell>
  );
}

// ─── Save handler (extracted to keep orchestration under complexity budget) ─

interface SaveDeps {
  accessToken: string;
  formId: string;
  draft: Form;
  setSavingPhase: (p: 'idle' | 'saving' | 'saved' | 'error') => void;
  setSavingError: (s: string | null) => void;
  onSaved: (form: Form) => void;
}
function makeSaveHandler(deps: SaveDeps): () => Promise<void> {
  return async () => {
    deps.setSavingPhase('saving');
    deps.setSavingError(null);
    const result = await saveForm(deps.accessToken, deps.formId, {
      title: deps.draft.title,
      description: deps.draft.description,
      status: deps.draft.status,
      allow_anonymous: deps.draft.allow_anonymous,
      schema: deps.draft.schema,
    });
    if (!result.ok) {
      deps.setSavingPhase('error');
      deps.setSavingError(result.error);
      return;
    }
    deps.onSaved(result.form);
    deps.setSavingPhase('saved');
    setTimeout(() => deps.setSavingPhase('idle'), 2000);
  };
}

// ─── Field-list mutations (extracted to keep the orchestration tidy) ────────

function useFieldOps(draft: Form, setDraft: (f: Form) => void) {
  const updateField = (idx: number, patch: Partial<FormField>): void => {
    const fields = [...draft.schema.fields];
    fields[idx] = { ...fields[idx], ...patch } as FormField;
    setDraft({ ...draft, schema: { fields } });
  };
  const addField = (type: FieldType): void => {
    setDraft({
      ...draft,
      schema: {
        fields: [...draft.schema.fields, newFieldOfType(type, draft.schema.fields.length)],
      },
    });
  };
  const removeField = (idx: number): void => {
    setDraft({
      ...draft,
      schema: { fields: draft.schema.fields.filter((_, i) => i !== idx) },
    });
  };
  const moveField = (idx: number, dir: -1 | 1): void => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= draft.schema.fields.length) return;
    const fields = [...draft.schema.fields];
    const a = fields[idx];
    const b = fields[newIdx];
    if (!a || !b) return;
    fields[idx] = b;
    fields[newIdx] = a;
    setDraft({ ...draft, schema: { fields } });
  };
  return { updateField, addField, removeField, moveField };
}

function newFieldOfType(type: FieldType, currentLength: number): FormField {
  const key = `q${currentLength + 1}`;
  const base: FormField = {
    type,
    key,
    label: `Question ${currentLength + 1}`,
    required: false,
  };
  if (type === 'scale') {
    base.scale = { min: 0, max: 10 };
  } else if (type === 'select_one' || type === 'select_many') {
    base.options = [
      { value: 'opt1', label: 'Option 1' },
      { value: 'opt2', label: 'Option 2' },
    ];
  }
  return base;
}

// ─── Metadata + field editors ───────────────────────────────────────────────

function MetadataBlock({
  draft,
  setDraft,
}: {
  draft: Form;
  setDraft: (f: Form) => void;
}): ReactElement {
  return (
    <section
      style={{
        padding: 24,
        border: '1px solid var(--border)',
        borderRadius: 12,
        marginBottom: 24,
      }}
    >
      <Row>
        <Label>Title</Label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          style={inputStyle}
        />
      </Row>
      <Row>
        <Label>Description (optional)</Label>
        <textarea
          rows={2}
          value={draft.description ?? ''}
          onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Row>
      <Row>
        <Label>Status</Label>
        <select
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as Form['status'] })}
          style={inputStyle}
        >
          <option value="draft">Draft (hidden from public)</option>
          <option value="published">Published (live at /forms/{draft.slug})</option>
          <option value="archived">Archived</option>
        </select>
      </Row>
      <Row>
        <Label>Privacy</Label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={draft.allow_anonymous}
            onChange={(e) => setDraft({ ...draft, allow_anonymous: e.target.checked })}
          />
          <span>Allow anonymous responses</span>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            (respondent chooses at submit time when enabled)
          </span>
        </label>
      </Row>
    </section>
  );
}

function FieldEditor({
  field,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  field: FormField;
  isFirst: boolean;
  isLast: boolean;
  onChange: (p: Partial<FormField>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}): ReactElement {
  return (
    <div
      style={{
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 10,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <code
          style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
        >
          {humanizeFieldType(field.type)}
        </code>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" disabled={isFirst} onClick={onMoveUp} style={iconBtn}>
          ↑
        </button>
        <button
          type="button"
          className="btn"
          disabled={isLast}
          onClick={onMoveDown}
          style={iconBtn}
        >
          ↓
        </button>
        <button
          type="button"
          className="btn"
          onClick={onRemove}
          style={{ ...iconBtn, color: 'var(--destructive, #c00)' }}
        >
          ✕
        </button>
      </div>
      <Row>
        <Label>Question</Label>
        <input
          type="text"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          style={inputStyle}
        />
      </Row>
      <Row>
        <Label>Field key</Label>
        <input
          type="text"
          value={field.key}
          onChange={(e) => onChange({ key: e.target.value })}
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 13 }}
        />
      </Row>
      <Row>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          <span>Required</span>
        </label>
      </Row>
      {field.type === 'scale' && (
        <Row>
          <Label>Scale</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              value={field.scale?.min ?? 0}
              onChange={(e) =>
                onChange({
                  scale: { ...(field.scale ?? { min: 0, max: 10 }), min: Number(e.target.value) },
                })
              }
              style={{ ...inputStyle, width: 80 }}
            />
            <span style={{ alignSelf: 'center', color: 'var(--muted-foreground)' }}>to</span>
            <input
              type="number"
              value={field.scale?.max ?? 10}
              onChange={(e) =>
                onChange({
                  scale: { ...(field.scale ?? { min: 0, max: 10 }), max: Number(e.target.value) },
                })
              }
              style={{ ...inputStyle, width: 80 }}
            />
          </div>
        </Row>
      )}
      {(field.type === 'select_one' || field.type === 'select_many') && (
        <OptionsEditor
          options={field.options ?? []}
          onChange={(options) => onChange({ options })}
        />
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[];
  onChange: (opts: { value: string; label: string }[]) => void;
}): ReactElement {
  return (
    <Row>
      <Label>Options</Label>
      <div>
        {options.map((opt, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: options list is order-dependent + identifiable by index for edit UX
          <div key={`opt-${i}`} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              type="text"
              placeholder="value"
              value={opt.value}
              onChange={(e) => {
                const next = [...options];
                next[i] = { ...opt, value: e.target.value };
                onChange(next);
              }}
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 13, flex: 1 }}
            />
            <input
              type="text"
              placeholder="label"
              value={opt.label}
              onChange={(e) => {
                const next = [...options];
                next[i] = { ...opt, label: e.target.value };
                onChange(next);
              }}
              style={{ ...inputStyle, flex: 2 }}
            />
            <button
              type="button"
              className="btn"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              style={iconBtn}
              disabled={options.length <= 2}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange([
              ...options,
              { value: `opt${options.length + 1}`, label: `Option ${options.length + 1}` },
            ])
          }
          style={{ fontSize: 13, marginTop: 4 }}
        >
          + Add option
        </button>
      </div>
    </Row>
  );
}

// ─── Layout helpers ─────────────────────────────────────────────────────────

function Row({ children }: { children: React.ReactNode }): ReactElement {
  return <div style={{ marginBottom: 12 }}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div
      style={{
        fontSize: 12,
        color: 'var(--muted-foreground)',
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function humanizeFieldType(t: FieldType): string {
  return {
    short_text: 'Short text',
    long_text: 'Long text',
    scale: 'Scale (NPS / rating)',
    select_one: 'Single choice',
    select_many: 'Multiple choice',
    yes_no: 'Yes / No',
  }[t];
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontFamily: 'inherit',
  fontSize: 14,
};

const iconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  padding: 0,
  fontSize: 14,
};

function Shell({ children }: { children: React.ReactNode }): ReactElement {
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px' }}>{children}</main>;
}
