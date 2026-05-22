import { type ReactElement, type ReactNode, useEffect, useState } from 'react';

// F-S3.4 — single-event control panel.
// Three sections:
//   1. Event metadata (editable: title, description, status, dates, capacity, location)
//   2. Registration breakdown (registered / waitlisted / cancelled / attended)
//   3. Post-event followup checklist (4 kinds, optional body_md, mark complete)

interface RegistrationCounts {
  registered: number;
  waitlisted: number;
  cancelled: number;
  attended: number;
}

type FollowupKind =
  | 'retrospective'
  | 'thank_you_sent'
  | 'recap_posted'
  | 'sponsor_report_delivered';

interface EventFollowup {
  id: string;
  kind: FollowupKind;
  body_md: string | null;
  due_at: string | null;
  completed_at: string | null;
}

interface EventDetail {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'cancelled';
  format: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  location: string | null;
  country: string;
  counts: RegistrationCounts;
  followups: EventFollowup[];
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; accessToken: string; email: string; event: EventDetail }
  | { phase: 'notfound' }
  | { phase: 'error'; message: string };

async function bootstrap(eventId: string): Promise<State> {
  try {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!r.ok) return { phase: 'anon' };
    const { accessToken } = (await r.json()) as { accessToken: string };
    const me = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!me.ok) return { phase: 'anon' };
    const meData = (await me.json()) as { email: string };
    const ev = await fetch(`/api/v1/workspace/events/${encodeURIComponent(eventId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (ev.status === 404) return { phase: 'notfound' };
    if (!ev.ok) return { phase: 'error', message: `load event: ${ev.status}` };
    const { event } = (await ev.json()) as { event: EventDetail };
    return { phase: 'authed', accessToken, email: meData.email, event };
  } catch (err) {
    return { phase: 'error', message: err instanceof Error ? err.message : 'bootstrap failed' };
  }
}

function signInUrl(eventId: string): string {
  const next =
    typeof window === 'undefined'
      ? `/workspace/events/${eventId}`
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

export default function EventControlPanel({ eventId }: { eventId: string }): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    void bootstrap(eventId).then(setState);
  }, [eventId]);

  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl(eventId));
    }
  }, [state.phase, eventId]);

  if (state.phase === 'loading' || state.phase === 'anon') {
    return (
      <Shell>
        <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>
      </Shell>
    );
  }
  if (state.phase === 'notfound') {
    return (
      <Shell>
        <p style={{ color: 'var(--muted-foreground)' }}>Event not found.</p>
        <a href="/workspace/events" className="btn">
          ← Back to events
        </a>
      </Shell>
    );
  }
  if (state.phase === 'error') {
    return (
      <Shell>
        <p style={{ color: 'var(--muted-foreground)' }}>Event unavailable: {state.message}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Panel
        accessToken={state.accessToken}
        initial={state.event}
        onChange={(next) => setState({ ...state, event: next })}
      />
    </Shell>
  );
}

interface PanelProps {
  accessToken: string;
  initial: EventDetail;
  onChange: (next: EventDetail) => void;
}

function Panel({ accessToken, initial, onChange }: PanelProps): ReactElement {
  const phase = phaseOf(initial);
  return (
    <div>
      <BackLink />
      <EventHeader event={initial} phase={phase} />
      <CountsRow counts={initial.counts} capacity={initial.capacity} />
      <EditForm event={initial} accessToken={accessToken} onSaved={onChange} />
      <FollowupsList
        event={initial}
        accessToken={accessToken}
        onSaved={(next) =>
          onChange({ ...initial, followups: mergeFollowup(initial.followups, next) })
        }
      />
    </div>
  );
}

function phaseOf(event: EventDetail): 'pre' | 'day_of' | 'post' {
  const now = Date.now();
  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at).getTime();
  if (now < start) return 'pre';
  if (now <= end) return 'day_of';
  return 'post';
}

function BackLink(): ReactElement {
  return (
    <a
      href="/workspace/events"
      style={{
        display: 'inline-block',
        marginBottom: 18,
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        color: 'var(--muted-foreground)',
        textDecoration: 'none',
      }}
    >
      ← All events
    </a>
  );
}

function EventHeader({
  event,
  phase,
}: { event: EventDetail; phase: 'pre' | 'day_of' | 'post' }): ReactElement {
  const phaseLabel: Record<'pre' | 'day_of' | 'post', string> = {
    pre: 'Pre-event',
    day_of: 'Live now',
    post: 'Post-event',
  };
  return (
    <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: '0 0 4px',
          }}
        >
          {phaseLabel[phase]} · {event.country.toUpperCase()}
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 26,
            letterSpacing: '-0.02em',
            margin: '0 0 4px',
          }}
        >
          {event.title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
          {formatRange(event.starts_at, event.ends_at)}
          {event.location ? ` · ${event.location}` : ''}
        </p>
      </div>
      {phase === 'day_of' && (
        <a className="btn btn-primary" href="/checkin" style={{ textDecoration: 'none' }}>
          Open check-in →
        </a>
      )}
    </div>
  );
}

function CountsRow({
  counts,
  capacity,
}: { counts: RegistrationCounts; capacity: number | null }): ReactElement {
  const checkinRate = counts.registered > 0 ? (counts.attended / counts.registered) * 100 : 0;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 24,
      }}
    >
      <Stat
        label="Registered"
        value={counts.registered}
        hint={capacity ? `of ${capacity}` : null}
      />
      <Stat label="Waitlist" value={counts.waitlisted} />
      <Stat label="Attended" value={counts.attended} hint={`${checkinRate.toFixed(0)}% check-in`} />
      <Stat label="Cancelled" value={counts.cancelled} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: { label: string; value: number; hint?: string | null }): ReactElement {
  return (
    <div
      style={{
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--card)',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          margin: '0 0 6px',
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 24,
          fontWeight: 500,
          margin: 0,
          color: 'var(--foreground)',
        }}
      >
        {value}
      </p>
      {hint && (
        <p style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>{hint}</p>
      )}
    </div>
  );
}

interface EditFormProps {
  event: EventDetail;
  accessToken: string;
  onSaved: (next: EventDetail) => void;
}

interface PatchBody {
  title: string;
  description: string;
  status: EventDetail['status'];
  location: string | null;
  capacity: number | null;
}

function parseCapacity(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('capacity must be a non-negative integer or blank');
  }
  return n;
}

async function patchEvent(
  eventId: string,
  accessToken: string,
  body: PatchBody,
): Promise<EventDetail> {
  const r = await fetch(`/api/v1/workspace/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t.slice(0, 200));
  }
  const { event: next } = (await r.json()) as { event: EventDetail };
  return next;
}

function EditForm({ event, accessToken, onSaved }: EditFormProps): ReactElement {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [status, setStatus] = useState(event.status);
  const [location, setLocation] = useState(event.location ?? '');
  const [capacity, setCapacity] = useState<string>(
    event.capacity == null ? '' : String(event.capacity),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    title !== event.title ||
    description !== event.description ||
    status !== event.status ||
    location !== (event.location ?? '') ||
    capacity !== (event.capacity == null ? '' : String(event.capacity));

  const onSave = async (): Promise<void> => {
    setSaving(true);
    setErr(null);
    try {
      const body: PatchBody = {
        title,
        description,
        status,
        location: location.trim() ? location.trim() : null,
        capacity: parseCapacity(capacity),
      };
      const next = await patchEvent(event.id, accessToken, body);
      onSaved(next);
      setSavedAt(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Event details">
      <Field label="Title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          style={inputStyle}
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EventDetail['status'])}
            style={inputStyle}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <Field label="Capacity (blank = unlimited)">
          <input
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Location">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={255}
            placeholder="Venue or online"
            style={inputStyle}
          />
        </Field>
      </div>
      {err && (
        <p style={{ fontSize: 12, color: 'var(--destructive, #c00)', margin: '8px 0 0' }}>{err}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || saving}
          onClick={() => void onSave()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedAt && !dirty && (
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Saved</span>
        )}
      </div>
    </Section>
  );
}

interface FollowupsListProps {
  event: EventDetail;
  accessToken: string;
  onSaved: (next: EventFollowup) => void;
}

const FOLLOWUP_LABELS: Record<FollowupKind, { title: string; hint: string }> = {
  retrospective: { title: 'Retrospective', hint: 'What worked, what didn’t. Notes for next time.' },
  thank_you_sent: {
    title: 'Thank-you sent',
    hint: 'Manually via /workspace/announce or per-speaker.',
  },
  recap_posted: { title: 'Recap posted', hint: 'Blog post / Telegram / social.' },
  sponsor_report_delivered: {
    title: 'Sponsor report delivered',
    hint: 'F-S3.5 cabinet automates this; toggle manually until then.',
  },
};
const FOLLOWUP_ORDER: FollowupKind[] = [
  'retrospective',
  'thank_you_sent',
  'recap_posted',
  'sponsor_report_delivered',
];

function FollowupsList({ event, accessToken, onSaved }: FollowupsListProps): ReactElement {
  const byKind = new Map<FollowupKind, EventFollowup>();
  for (const f of event.followups) byKind.set(f.kind, f);
  return (
    <Section title="Post-event followups">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FOLLOWUP_ORDER.map((kind) => (
          <FollowupRow
            key={kind}
            eventId={event.id}
            kind={kind}
            current={byKind.get(kind) ?? null}
            accessToken={accessToken}
            onSaved={onSaved}
          />
        ))}
      </div>
    </Section>
  );
}

interface FollowupRowProps {
  eventId: string;
  kind: FollowupKind;
  current: EventFollowup | null;
  accessToken: string;
  onSaved: (next: EventFollowup) => void;
}

async function upsertFollowupRequest(
  eventId: string,
  kind: FollowupKind,
  accessToken: string,
  patch: { completed?: boolean; body_md?: string | null },
): Promise<EventFollowup> {
  const r = await fetch(
    `/api/v1/workspace/events/${encodeURIComponent(eventId)}/followups/${kind}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(patch),
    },
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t.slice(0, 200));
  }
  const { followup } = (await r.json()) as { followup: EventFollowup };
  return followup;
}

function FollowupRow({
  eventId,
  kind,
  current,
  accessToken,
  onSaved,
}: FollowupRowProps): ReactElement {
  const completed = Boolean(current?.completed_at);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [body, setBody] = useState(current?.body_md ?? '');
  const [expanded, setExpanded] = useState(false);

  const upsert = async (patch: { completed?: boolean; body_md?: string | null }): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      const followup = await upsertFollowupRequest(eventId, kind, accessToken, patch);
      onSaved(followup);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  const label = FOLLOWUP_LABELS[kind];
  return (
    <div
      style={{
        padding: 14,
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--card)',
      }}
    >
      <FollowupHeader
        label={label}
        completed={completed}
        busy={busy}
        hasBody={Boolean(current?.body_md)}
        expanded={expanded}
        onToggleComplete={() => void upsert({ completed: !completed })}
        onToggleExpanded={() => setExpanded((x) => !x)}
      />
      {expanded && (
        <FollowupNotesEditor
          body={body}
          setBody={setBody}
          busy={busy}
          dirty={body !== (current?.body_md ?? '')}
          onSave={() => void upsert({ body_md: body.trim() === '' ? null : body })}
        />
      )}
      {err && (
        <p style={{ fontSize: 12, color: 'var(--destructive, #c00)', margin: '8px 0 0' }}>{err}</p>
      )}
    </div>
  );
}

interface FollowupHeaderProps {
  label: { title: string; hint: string };
  completed: boolean;
  busy: boolean;
  hasBody: boolean;
  expanded: boolean;
  onToggleComplete: () => void;
  onToggleExpanded: () => void;
}

function FollowupHeader(props: FollowupHeaderProps): ReactElement {
  const { label, completed, busy, hasBody, expanded, onToggleComplete, onToggleExpanded } = props;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        type="button"
        onClick={onToggleComplete}
        disabled={busy}
        aria-pressed={completed}
        aria-label={completed ? `Mark ${label.title} incomplete` : `Mark ${label.title} complete`}
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: completed ? 'var(--primary)' : 'transparent',
          color: completed ? 'var(--primary-foreground)' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          padding: 0,
        }}
      >
        ✓
      </button>
      <div style={{ flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontWeight: 500,
            fontSize: 14,
            color: completed ? 'var(--muted-foreground)' : 'var(--foreground)',
            textDecoration: completed ? 'line-through' : 'none',
          }}
        >
          {label.title}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
          {label.hint}
        </p>
      </div>
      <button
        type="button"
        className="btn"
        onClick={onToggleExpanded}
        style={{ padding: '4px 10px', fontSize: 12 }}
      >
        {expanded ? 'Hide notes' : hasBody ? 'Edit notes' : 'Add notes'}
      </button>
    </div>
  );
}

interface FollowupNotesEditorProps {
  body: string;
  setBody: (v: string) => void;
  busy: boolean;
  dirty: boolean;
  onSave: () => void;
}

function FollowupNotesEditor(props: FollowupNotesEditorProps): ReactElement {
  const { body, setBody, busy, dirty, onSave } = props;
  return (
    <div style={{ marginTop: 12 }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Markdown notes…"
        style={{ ...inputStyle, fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !dirty}
          onClick={onSave}
        >
          {busy ? 'Saving…' : 'Save notes'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section
      style={{
        marginBottom: 28,
        padding: 20,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--background)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 16,
          margin: '0 0 14px',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div style={{ marginBottom: 12 }}>
      <p
        style={{
          fontSize: 12,
          color: 'var(--muted-foreground)',
          margin: '0 0 6px',
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: 14,
};

function Shell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '24px 16px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: '0 0 12px',
            padding: '0 8px',
          }}
        >
          Workspace
        </p>
        <NavLink href="/workspace" label="Dashboard" />
        <NavLink href="/workspace/members" label="Members" />
        <NavLink href="/workspace/announce" label="Announce" />
        <NavLink href="/workspace/events" label="Events" active />
      </aside>
      <main style={{ flex: 1, padding: '32px 48px', maxWidth: 1180 }}>{children}</main>
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
}: { href: string; label: string; active?: boolean }): ReactElement {
  return (
    <a
      href={href}
      className="app-nav-link"
      style={{
        display: 'block',
        padding: '8px 12px',
        ...(active ? { background: 'var(--card)', borderRadius: 6 } : {}),
      }}
    >
      {label}
    </a>
  );
}

function formatRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();
  const dateOpts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  if (sameDay) {
    return `${start.toLocaleDateString(undefined, dateOpts)} · ${start.toLocaleTimeString(undefined, timeOpts)}–${end.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${start.toLocaleDateString(undefined, dateOpts)} → ${end.toLocaleDateString(undefined, dateOpts)}`;
}

function mergeFollowup(list: EventFollowup[], next: EventFollowup): EventFollowup[] {
  const idx = list.findIndex((f) => f.kind === next.kind);
  if (idx === -1) return [...list, next];
  const copy = [...list];
  copy[idx] = next;
  return copy;
}
