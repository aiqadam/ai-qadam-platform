import { type FormEvent, type ReactElement, useState } from 'react';
import type { FormField, FormSummary } from '../lib/forms-api';

// Renders an operator-built form and submits to the API.
//
// v1 web users always submit anonymously. The bot path (separate
// flow) handles attributed submissions via tg_user_id. PR-D adds the
// Authentik-session attribution path so signed-in web users can also
// submit attributed.
//
// When `form.allow_anonymous=false`, the form is locked with a
// "sign-in required" message — submitting anonymously would be a 403.
//
// Field types (must match apps/api/src/modules/telegram/telegram-forms.service.ts):
//   short_text, long_text, scale, select_one, select_many, yes_no

type Phase = 'idle' | 'submitting' | 'success' | 'error';

interface SubmitResult {
  phase: Phase;
  error: string | null;
}

interface SubmissionBody {
  is_anonymous: boolean;
  payload: Record<string, unknown>;
  source: 'web';
  event_id?: string;
}

async function postSubmission(
  slug: string,
  payload: Record<string, unknown>,
  eventId: string | null,
): Promise<SubmitResult> {
  try {
    const body: SubmissionBody = {
      is_anonymous: true,
      payload,
      source: 'web',
    };
    if (eventId) body.event_id = eventId;
    const res = await fetch(`/api/v1/telegram/forms/${encodeURIComponent(slug)}/submissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 200) return { phase: 'success', error: null };
    const text = await res.text();
    const errMsg = humanizeError(res.status, text);
    return { phase: 'error', error: errMsg };
  } catch (err) {
    return { phase: 'error', error: err instanceof Error ? err.message : 'submit failed' };
  }
}

function humanizeError(status: number, text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: string; field?: string; max?: number };
    if (parsed.error === 'field_required' && parsed.field) {
      return `Required field is missing: ${parsed.field}`;
    }
    if (parsed.error === 'field_too_long' && parsed.field) {
      return `Field "${parsed.field}" exceeds maximum length${parsed.max ? ` of ${parsed.max}` : ''}.`;
    }
    if (parsed.error === 'anonymous_not_allowed') {
      return 'This form requires you to sign in before submitting.';
    }
    if (parsed.error) {
      return `Submission failed: ${parsed.error}`;
    }
  } catch {
    // fall through
  }
  return `Submission failed (HTTP ${status}). Please try again.`;
}

// PR-D4 — dynamic event-context block spliced above the form when
// rendered via /events/{slug}/survey. NOT part of the form schema —
// kept on the renderer so the same operator-built template works for
// every event without needing per-event copies. Future field-type
// extension (`speaker_rating`) would consume the same speakers array
// and auto-expand to N scale fields.
export interface EventContext {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  speakers: Array<{ name: string | null; talkTitle: string | null }>;
}

export default function FormRenderer({
  form,
  eventId = null,
  eventContext = null,
}: {
  form: FormSummary;
  eventId?: string | null;
  eventContext?: EventContext | null;
}): ReactElement {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!form.allow_anonymous) {
    return (
      <Panel>
        <Heading>{form.title}</Heading>
        <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          This form requires you to sign in before submitting. The web sign-in flow is shipping soon
          — for now, you can fill it via the AI Qadam Telegram bot.
        </p>
      </Panel>
    );
  }

  const setField = (key: string, value: unknown): void => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setPhase('submitting');
    setError(null);
    const result = await postSubmission(form.slug, stripEmptyValues(values), eventId);
    setPhase(result.phase);
    setError(result.error);
  };

  if (phase === 'success') {
    return (
      <Panel>
        <Heading>Thanks for the feedback</Heading>
        <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>
          We read every response. It shapes the next event.
        </p>
      </Panel>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      {eventContext && <EventContextHeader ctx={eventContext} />}
      <Panel>
        <Heading>{form.title}</Heading>
        {form.description && (
          <p style={{ color: 'var(--muted-foreground)', margin: '0 0 24px' }}>{form.description}</p>
        )}
        <p
          style={{
            fontSize: 12,
            color: 'var(--muted-foreground)',
            margin: '0 0 28px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Submitting as: Anonymous
        </p>
        {form.schema.fields.map((field) => (
          <FieldBlock
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(v) => setField(field.key, v)}
            disabled={phase === 'submitting'}
          />
        ))}
        {error && (
          <p style={{ color: 'var(--destructive, #c00)', fontSize: 13, marginTop: 12 }}>{error}</p>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={phase === 'submitting'}
          style={{ marginTop: 12 }}
        >
          {phase === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
      </Panel>
    </form>
  );
}

// ─── Field renderers ────────────────────────────────────────────────────────

function FieldBlock({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}): ReactElement {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 24px' }}>
      <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, padding: 0 }}>
        {field.label}
        {field.required && <span style={{ color: 'var(--destructive, #c00)' }}> *</span>}
      </legend>
      <FieldInput field={field} value={value} onChange={onChange} disabled={disabled} />
    </fieldset>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}): ReactElement {
  switch (field.type) {
    case 'short_text':
      return (
        <input
          type="text"
          maxLength={200}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={field.placeholder}
          style={inputStyle}
        />
      );
    case 'long_text':
      return (
        <textarea
          rows={4}
          maxLength={2000}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={field.placeholder}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      );
    case 'scale':
      return (
        <ScalePicker
          field={field}
          value={value as number | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'select_one':
      return (
        <RadioGroup
          field={field}
          value={value as string | undefined}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'select_many':
      return (
        <CheckboxGroup
          field={field}
          value={(value as string[]) ?? []}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'yes_no':
      return (
        <YesNoPicker value={value as boolean | undefined} onChange={onChange} disabled={disabled} />
      );
  }
}

function ScalePicker({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: number | undefined;
  onChange: (v: number) => void;
  disabled: boolean;
}): ReactElement {
  const scale = field.scale ?? { min: 0, max: 10 };
  const buttons: number[] = [];
  for (let i = scale.min; i <= scale.max; i++) buttons.push(i);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {buttons.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            style={{
              minWidth: 44,
              height: 44,
              padding: '0 8px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: value === n ? 'var(--primary)' : 'transparent',
              color: value === n ? 'var(--primary-foreground)' : 'var(--foreground)',
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {(scale.min_label || scale.max_label) && (
        <p
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            margin: '6px 2px 0',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>{scale.min_label ?? ''}</span>
          <span>{scale.max_label ?? ''}</span>
        </p>
      )}
    </div>
  );
}

function RadioGroup({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: string | undefined;
  onChange: (v: string) => void;
  disabled: boolean;
}): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(field.options ?? []).map((opt) => (
        <label
          key={opt.value}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="radio"
            name={field.key}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            disabled={disabled}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function CheckboxGroup({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
}): ReactElement {
  const toggle = (v: string): void => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(field.options ?? []).map((opt) => (
        <label
          key={opt.value}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            value={opt.value}
            checked={value.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            disabled={disabled}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function YesNoPicker({
  value,
  onChange,
  disabled,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  disabled: boolean;
}): ReactElement {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {[
        { v: true, label: 'Yes' },
        { v: false, label: 'No' },
      ].map(({ v, label }) => (
        <button
          key={label}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          style={{
            minWidth: 80,
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: value === v ? 'var(--primary)' : 'transparent',
            color: value === v ? 'var(--primary-foreground)' : 'var(--foreground)',
            fontSize: 14,
            fontWeight: 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Removes empty-string + empty-array values so they're treated as
// missing by the API (matches `validateSubmissionPayload`'s empty-string
// = missing rule).
function stripEmptyValues(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontFamily: 'inherit',
  fontSize: 14,
};

// PR-D4 — dynamic event-context card rendered above the form on the
// /events/{slug}/survey route. Pure presentation; takes no behaviour.
function EventContextHeader({ ctx }: { ctx: EventContext }): ReactElement {
  return (
    <div
      style={{
        padding: '20px 24px',
        marginBottom: 16,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--muted-foreground)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        Feedback for
      </div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{ctx.title}</div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--muted-foreground)',
          marginTop: 4,
        }}
      >
        {fmtEventWhen(ctx.startsAt)}
        {ctx.location && ` · ${ctx.location}`}
      </div>
      {ctx.speakers.length > 0 && <SpeakersStrip speakers={ctx.speakers} />}
    </div>
  );
}

function SpeakersStrip({
  speakers,
}: {
  speakers: Array<{ name: string | null; talkTitle: string | null }>;
}): ReactElement {
  return (
    <div style={{ marginTop: 12, fontSize: 13 }}>
      <div
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--muted-foreground)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {speakers.length === 1 ? 'Speaker' : 'Speakers'}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {speakers
          .filter((s) => s.name)
          .map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: speaker list is read-only display, index is stable for this render
            <li key={`spk-${i}`} style={{ marginTop: 2 }}>
              <strong>{s.name}</strong>
              {s.talkTitle && (
                <span style={{ color: 'var(--muted-foreground)' }}> — {s.talkTitle}</span>
              )}
            </li>
          ))}
      </ul>
    </div>
  );
}

function fmtEventWhen(startsAt: string): string {
  try {
    return new Date(startsAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return startsAt;
  }
}

function Panel({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div
      style={{
        padding: 36,
        border: '1px solid var(--border)',
        borderRadius: 16,
        background: 'var(--card)',
      }}
    >
      {children}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <h1
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 26,
        margin: '0 0 8px',
      }}
    >
      {children}
    </h1>
  );
}
