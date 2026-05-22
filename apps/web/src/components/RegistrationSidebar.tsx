import { type ReactElement, useEffect, useState } from 'react';
import { readAttribution } from '../lib/attribution';

// Client-side registration sidebar for a single event page. Hydrates by:
//   1. POST /api/v1/auth/refresh — uses the __Host- cookie to get a fresh
//      access token (anon if it fails).
//   2. If authed: GET /api/v1/registrations/mine, looks for this event,
//      sets the current status.
//
// Phase 1 wired the same flow inside EventsList.tsx (deleted in A2); this
// is the single-event focused version. Refresh/me/register/cancel endpoints
// are unchanged from Phase 1.

interface ApiEventLite {
  id: string;
  capacity: number | null;
  registeredCount: number;
  startsAt: string;
  endsAt: string;
  location: string | null;
}

type ActiveStatus = 'registered' | 'waitlisted';

type AuthState =
  | { kind: 'anon' }
  | { kind: 'authed'; accessToken: string; myStatus: ActiveStatus | null };

type Ready = {
  phase: 'ready';
  auth: AuthState;
  localCount: number;
  localStatus: ActiveStatus | null;
};
type State = { phase: 'loading' } | Ready | { phase: 'error'; message: string };

async function fetchAccessToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as { accessToken: string };
    return body.accessToken;
  } catch {
    return null;
  }
}

async function fetchMyStatusFor(
  eventId: string,
  accessToken: string,
): Promise<ActiveStatus | null> {
  const res = await fetch('/api/v1/registrations/mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    registrations: Array<{ status: string; event: { id: string } }>;
  };
  for (const r of body.registrations) {
    if (r.event.id === eventId && (r.status === 'registered' || r.status === 'waitlisted')) {
      return r.status;
    }
  }
  return null;
}

interface RegisterBody {
  referredBy?: string;
  acquisitionSource?: unknown;
}

async function postRegister(eventId: string, accessToken: string): Promise<ActiveStatus> {
  // F-S3.9: include referral + UTM first/last-touch from the
  // long-lived cookies the landing-page hook captured.
  const attribution = readAttribution();
  const body: RegisterBody = {
    ...(attribution.referredBy ? { referredBy: attribution.referredBy } : {}),
    ...(attribution.acquisitionSource ? { acquisitionSource: attribution.acquisitionSource } : {}),
  };
  const res = await fetch(`/api/v1/events/${eventId}/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`register failed: HTTP ${res.status}`);
  const parsed = (await res.json()) as { status: string };
  if (parsed.status !== 'registered' && parsed.status !== 'waitlisted') {
    throw new Error(`unexpected status: ${parsed.status}`);
  }
  return parsed.status;
}

async function deleteRegister(eventId: string, accessToken: string): Promise<void> {
  const res = await fetch(`/api/v1/events/${eventId}/register`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) throw new Error(`cancel failed: HTTP ${res.status}`);
}

function timeRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `${time(s)} – ${time(e)}`;
  return `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`;
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function readyAfterRegister(s: Ready, next: ActiveStatus, accessToken: string): Ready {
  return {
    phase: 'ready',
    auth: { kind: 'authed', accessToken, myStatus: next },
    localCount: s.localCount + (next === 'registered' ? 1 : 0),
    localStatus: next,
  };
}

function readyAfterCancel(s: Ready, accessToken: string): Ready {
  return {
    phase: 'ready',
    auth: { kind: 'authed', accessToken, myStatus: null },
    localCount: s.localStatus === 'registered' ? Math.max(0, s.localCount - 1) : s.localCount,
    localStatus: null,
  };
}

const EYEBROW: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--muted-foreground)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 4px',
};

function MetaRow({
  label,
  primary,
  secondary,
}: { label: string; primary: string; secondary?: string }): ReactElement {
  return (
    <div>
      <p style={EYEBROW}>{label}</p>
      <p style={{ fontSize: 14, margin: 0 }}>{primary}</p>
      {secondary && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--muted-foreground)',
            margin: '2px 0 0',
          }}
        >
          {secondary}
        </p>
      )}
    </div>
  );
}

interface CTAProps {
  state: State;
  eventId: string;
  isFull: boolean;
  busy: boolean;
  onRegister: () => void;
  onCancel: () => void;
}

function CTA({
  state,
  eventId,
  isFull,
  busy,
  onRegister,
  onCancel,
}: CTAProps): ReactElement | null {
  if (state.phase === 'loading') {
    return (
      <div style={{ padding: '10px 0', fontSize: 13, color: 'var(--muted-foreground)' }}>
        Loading…
      </div>
    );
  }
  if (state.phase === 'error') {
    return (
      <div style={{ padding: '10px 0', fontSize: 13, color: 'var(--destructive, #c00)' }}>
        {state.message}
      </div>
    );
  }
  if (state.auth.kind === 'anon') {
    return (
      <a
        className="btn btn-primary btn-lg"
        href={`/auth/sign-in?next=${encodeURIComponent(`/events/${eventId}`)}`}
        style={{ textDecoration: 'none', textAlign: 'center' }}
      >
        {isFull ? 'Sign in to join waitlist' : 'Sign in to register'}
      </a>
    );
  }
  if (state.localStatus == null) {
    return (
      <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={onRegister}>
        {busy ? '…' : isFull ? 'Join waitlist' : 'Register'}
      </button>
    );
  }
  if (state.localStatus === 'registered') {
    return (
      <>
        <div
          style={{
            padding: '10px 12px',
            border: '1px solid color-mix(in oklch, var(--primary) 30%, transparent)',
            background: 'color-mix(in oklch, var(--primary) 8%, transparent)',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          ✓ You're registered
        </div>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>
          {busy ? '…' : 'Cancel registration'}
        </button>
      </>
    );
  }
  return (
    <>
      <div
        style={{
          padding: '10px 12px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--muted-foreground)',
        }}
      >
        On waitlist — we'll email if a seat opens
      </div>
      <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>
        {busy ? '…' : 'Leave waitlist'}
      </button>
    </>
  );
}

interface Props {
  event: ApiEventLite;
}

export function RegistrationSidebar({ event }: Props): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await fetchAccessToken();
      if (cancelled) return;
      const auth: AuthState = token
        ? { kind: 'authed', accessToken: token, myStatus: await fetchMyStatusFor(event.id, token) }
        : { kind: 'anon' };
      if (cancelled) return;
      setState({
        phase: 'ready',
        auth,
        localCount: event.registeredCount,
        localStatus: auth.kind === 'authed' ? auth.myStatus : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [event.id, event.registeredCount]);

  async function register(): Promise<void> {
    if (state.phase !== 'ready' || state.auth.kind !== 'authed') return;
    setBusy(true);
    const token = state.auth.accessToken;
    try {
      const next = await postRegister(event.id, token);
      setState(readyAfterRegister(state, next, token));
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'register failed' });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    if (state.phase !== 'ready' || state.auth.kind !== 'authed') return;
    setBusy(true);
    const token = state.auth.accessToken;
    try {
      await deleteRegister(event.id, token);
      setState(readyAfterCancel(state, token));
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'cancel failed' });
    } finally {
      setBusy(false);
    }
  }

  const liveCount = state.phase === 'ready' ? state.localCount : event.registeredCount;
  const capacityHint =
    event.capacity != null ? `${liveCount} / ${event.capacity} spots` : `${liveCount} going`;
  const isFull = event.capacity != null && liveCount >= event.capacity;

  return (
    <aside
      style={{
        position: 'sticky',
        top: 80,
        padding: 20,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        height: 'fit-content',
      }}
    >
      <MetaRow
        label="When"
        primary={fullDate(event.startsAt)}
        secondary={timeRange(event.startsAt, event.endsAt)}
      />
      {event.location && <MetaRow label="Where" primary={event.location} />}
      <MetaRow label="Capacity" primary={capacityHint} />
      <CTA
        state={state}
        eventId={event.id}
        isFull={isFull}
        busy={busy}
        onRegister={() => void register()}
        onCancel={() => void cancel()}
      />
    </aside>
  );
}
