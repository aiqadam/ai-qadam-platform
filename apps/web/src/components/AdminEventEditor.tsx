import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

// Admin event editor. id='new' creates; else loads + patches.
// Refresh-then-fetch bootstrap; on submit POST or PATCH to /v1/admin/events.

interface AdminEvent {
  id: string;
  title: string;
  description: string;
  format: string;
  status: 'draft' | 'published' | 'cancelled';
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registeredCount: number;
  location: string | null;
  countryCode: string;
}

interface FormShape {
  title: string;
  description: string;
  format: string;
  status: 'draft' | 'published' | 'cancelled';
  startsAt: string; // datetime-local string
  endsAt: string;
  capacity: string; // string so empty = null
  location: string;
}

const EMPTY: FormShape = {
  title: '',
  description: '',
  format: 'meetup',
  status: 'draft',
  startsAt: '',
  endsAt: '',
  capacity: '',
  location: '',
};

const FORMATS = ['meetup', 'workshop', 'hackathon', 'conference', 'online'] as const;
const STATUSES = ['draft', 'published', 'cancelled'] as const;

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'ready'; form: FormShape; accessToken: string; existingId: string | null }
  | { phase: 'error'; message: string };

function eventToForm(e: AdminEvent): FormShape {
  return {
    title: e.title,
    description: e.description,
    format: e.format,
    status: e.status,
    startsAt: new Date(e.startsAt).toISOString().slice(0, 16),
    endsAt: new Date(e.endsAt).toISOString().slice(0, 16),
    capacity: e.capacity == null ? '' : String(e.capacity),
    location: e.location ?? '',
  };
}

function formToBody(form: FormShape): Record<string, unknown> {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    format: form.format,
    status: form.status,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: new Date(form.endsAt).toISOString(),
    capacity: form.capacity.trim() === '' ? null : Number(form.capacity),
    location: form.location.trim() === '' ? null : form.location.trim(),
  };
}

async function bootstrap(id: string): Promise<State> {
  const refreshRes = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!refreshRes.ok) return { phase: 'anon' };
  const { accessToken } = (await refreshRes.json()) as { accessToken: string };

  if (id === 'new') {
    return { phase: 'ready', form: EMPTY, accessToken, existingId: null };
  }

  // Load existing event via the admin list (no GET /:id yet — small N is fine).
  const res = await fetch('/api/v1/admin/events', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 403) return { phase: 'forbidden' };
  if (!res.ok) return { phase: 'error', message: `HTTP ${res.status}` };
  const body = (await res.json()) as { events: AdminEvent[] };
  const found = body.events.find((e) => e.id === id);
  if (!found) return { phase: 'error', message: 'event not found' };
  return { phase: 'ready', form: eventToForm(found), accessToken, existingId: found.id };
}

interface Props {
  id: string;
}

export function AdminEventEditor({ id }: Props): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrap(id)
      .catch(
        (err: unknown): State => ({
          phase: 'error',
          message: err instanceof Error ? err.message : 'bootstrap failed',
        }),
      )
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function update<K extends keyof FormShape>(key: K, value: FormShape[K]): void {
    if (state.phase !== 'ready') return;
    setState({ ...state, form: { ...state.form, [key]: value } });
  }

  async function handleSubmit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    if (state.phase !== 'ready') return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = formToBody(state.form);
      const isCreate = state.existingId === null;
      const url = isCreate ? '/api/v1/admin/events' : `/api/v1/admin/events/${state.existingId}`;
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${state.accessToken}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${msg}`);
      }
      window.location.href = '/admin/events';
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (state.phase === 'loading')
    return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
  if (state.phase === 'anon')
    return <p style={{ color: 'var(--muted-foreground)' }}>Sign in required.</p>;
  if (state.phase === 'forbidden')
    return <p style={{ color: 'var(--muted-foreground)' }}>Not authorized for this country.</p>;
  if (state.phase === 'error')
    return <p style={{ color: 'var(--destructive, #c00)' }}>{state.message}</p>;

  const { form } = state;
  const isCreate = state.existingId === null;

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}
    >
      <Field label="Title">
        <input
          type="text"
          required
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Description">
        <textarea
          required
          rows={6}
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Format">
          <select
            value={form.format}
            onChange={(e) => update('format', e.target.value)}
            style={inputStyle}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => update('status', e.target.value as FormShape['status'])}
            style={inputStyle}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Starts at">
          <input
            type="datetime-local"
            required
            value={form.startsAt}
            onChange={(e) => update('startsAt', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Ends at">
          <input
            type="datetime-local"
            required
            value={form.endsAt}
            onChange={(e) => update('endsAt', e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Capacity (blank = unlimited)">
          <input
            type="number"
            min="0"
            value={form.capacity}
            onChange={(e) => update('capacity', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Location (blank = online)">
          <input
            type="text"
            value={form.location}
            onChange={(e) => update('location', e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      {submitError && (
        <div
          style={{
            padding: '10px 12px',
            border: '1px solid color-mix(in oklch, oklch(0.6 0.18 25) 50%, var(--border))',
            background: 'color-mix(in oklch, oklch(0.6 0.18 25) 8%, transparent)',
            borderRadius: 8,
            fontSize: 13,
            color: 'oklch(0.6 0.18 25)',
          }}
        >
          {submitError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? '…' : isCreate ? 'Create event' : 'Save changes'}
        </button>
        <a href="/admin/events" className="btn btn-outline" style={{ textDecoration: 'none' }}>
          Cancel
        </a>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--card)',
  color: 'var(--foreground)',
  fontSize: 14,
};

interface FieldProps {
  label: string;
  children: ReactElement;
}

function Field({ label, children }: FieldProps): ReactElement {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children is always a single form control passed from inline call sites; biome can't see through the children prop.
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--muted-foreground)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
