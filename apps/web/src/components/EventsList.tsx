import { type ReactElement, useEffect, useState } from 'react';

interface ApiEvent {
  id: string;
  title: string;
  description: string;
  format: 'meetup' | 'workshop' | 'hackathon' | 'conference' | 'online';
  status: 'draft' | 'published' | 'cancelled';
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registeredCount: number;
  location: string | null;
  countryCode: string;
}

type ActiveStatus = 'registered' | 'waitlisted';

type AuthState =
  | { kind: 'anon' }
  | { kind: 'authed'; accessToken: string; statuses: Map<string, ActiveStatus> };

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; events: ApiEvent[]; auth: AuthState };

const FORMAT_LABEL: Record<ApiEvent['format'], string> = {
  meetup: 'Meetup',
  workshop: 'Workshop',
  hackathon: 'Hackathon',
  conference: 'Conference',
  online: 'Online',
};

async function fetchEvents(): Promise<ApiEvent[]> {
  const res = await fetch('/api/v1/events');
  if (!res.ok) throw new Error(`events fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { events: ApiEvent[] };
  return body.events;
}

async function fetchAccessToken(): Promise<string | null> {
  const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!res.ok) return null;
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

async function fetchMyStatuses(accessToken: string): Promise<Map<string, ActiveStatus>> {
  const res = await fetch('/api/v1/registrations/mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return new Map();
  const body = (await res.json()) as {
    registrations: Array<{
      status: ActiveStatus | 'cancelled' | 'attended';
      event: { id: string };
    }>;
  };
  const out = new Map<string, ActiveStatus>();
  for (const r of body.registrations) {
    if (r.status === 'registered' || r.status === 'waitlisted') {
      out.set(r.event.id, r.status);
    }
  }
  return out;
}

async function loadInitialState(): Promise<State> {
  const events = await fetchEvents();
  const accessToken = await fetchAccessToken();
  if (!accessToken) {
    return { status: 'loaded', events, auth: { kind: 'anon' } };
  }
  const statuses = await fetchMyStatuses(accessToken);
  return { status: 'loaded', events, auth: { kind: 'authed', accessToken, statuses } };
}

async function postRegister(eventId: string, accessToken: string): Promise<ActiveStatus> {
  const res = await fetch(`/api/v1/events/${eventId}/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`register failed: HTTP ${res.status}`);
  const body = (await res.json()) as { status: ActiveStatus | 'cancelled' | 'attended' };
  if (body.status !== 'registered' && body.status !== 'waitlisted') {
    throw new Error(`unexpected status from register: ${body.status}`);
  }
  return body.status;
}

async function deleteRegister(eventId: string, accessToken: string): Promise<void> {
  const res = await fetch(`/api/v1/events/${eventId}/register`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) throw new Error(`cancel failed: HTTP ${res.status}`);
}

function formatDatePlate(iso: string): { month: string; day: string; weekday: string } {
  const d = new Date(iso);
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
    weekday: d.toLocaleString('en-US', { weekday: 'short' }),
  };
}

function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toDateString() === end.toDateString();
  const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `${time(start)} – ${time(end)}`;
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
}

function isFull(event: ApiEvent): boolean {
  return event.capacity !== null && event.registeredCount >= event.capacity;
}

interface RegisterButtonProps {
  event: ApiEvent;
  auth: AuthState;
  onRegister: (eventId: string) => Promise<void>;
  onCancel: (eventId: string) => Promise<void>;
}

interface ButtonSpec {
  label: string;
  onClick: () => Promise<void>;
  className: string;
}

function buttonSpecFor(
  event: ApiEvent,
  auth: AuthState,
  onRegister: (eventId: string) => Promise<void>,
  onCancel: (eventId: string) => Promise<void>,
): ButtonSpec | { kind: 'link'; label: string } {
  if (auth.kind === 'anon') {
    return {
      kind: 'link',
      label: isFull(event) ? 'Sign in to join waitlist' : 'Sign in to register',
    };
  }
  const myStatus = auth.statuses.get(event.id);
  if (myStatus === 'registered') {
    return {
      label: 'Cancel registration',
      onClick: () => onCancel(event.id),
      className: 'btn btn-outline btn-sm',
    };
  }
  if (myStatus === 'waitlisted') {
    return {
      label: 'Leave waitlist',
      onClick: () => onCancel(event.id),
      className: 'btn btn-outline btn-sm',
    };
  }
  return {
    label: isFull(event) ? 'Join waitlist' : 'Register',
    onClick: () => onRegister(event.id),
    className: 'btn btn-primary btn-sm',
  };
}

function RegisterButton({ event, auth, onRegister, onCancel }: RegisterButtonProps): ReactElement {
  const [busy, setBusy] = useState(false);
  const spec = buttonSpecFor(event, auth, onRegister, onCancel);

  if ('kind' in spec) {
    return (
      <a href="/api/v1/auth/login" className="btn btn-outline btn-sm">
        {spec.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => runWith(setBusy, spec.onClick)}
      className={spec.className}
    >
      {busy ? '…' : spec.label}
    </button>
  );
}

async function runWith(setBusy: (b: boolean) => void, fn: () => Promise<unknown>): Promise<void> {
  setBusy(true);
  try {
    await fn();
  } finally {
    setBusy(false);
  }
}

function CapacityLabel({ event }: { event: ApiEvent }): ReactElement | null {
  if (event.capacity === null) return null;
  const remaining = Math.max(event.capacity - event.registeredCount, 0);
  if (remaining === 0) {
    return <span className="badge">Full · waitlist open</span>;
  }
  return (
    <span>
      · {event.registeredCount} / {event.capacity} registered
    </span>
  );
}

function StatusBadge({ status }: { status: ActiveStatus | undefined }): ReactElement | null {
  if (status === 'registered') return <span className="badge badge-success">You're in</span>;
  if (status === 'waitlisted') return <span className="badge">On waitlist</span>;
  return null;
}

export function EventsList(): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadInitialState()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'unknown error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRegister = async (eventId: string): Promise<void> => {
    if (state.status !== 'loaded' || state.auth.kind !== 'authed') return;
    const newStatus = await postRegister(eventId, state.auth.accessToken);
    const nextStatuses = new Map(state.auth.statuses);
    nextStatuses.set(eventId, newStatus);
    const nextEvents = state.events.map((e) =>
      e.id === eventId && newStatus === 'registered'
        ? { ...e, registeredCount: e.registeredCount + 1 }
        : e,
    );
    setState({ ...state, events: nextEvents, auth: { ...state.auth, statuses: nextStatuses } });
  };

  const handleCancel = async (eventId: string): Promise<void> => {
    if (state.status !== 'loaded' || state.auth.kind !== 'authed') return;
    const wasRegistered = state.auth.statuses.get(eventId) === 'registered';
    await deleteRegister(eventId, state.auth.accessToken);
    const nextStatuses = new Map(state.auth.statuses);
    nextStatuses.delete(eventId);
    const nextEvents = state.events.map((e) =>
      e.id === eventId && wasRegistered
        ? { ...e, registeredCount: Math.max(e.registeredCount - 1, 0) }
        : e,
    );
    setState({ ...state, events: nextEvents, auth: { ...state.auth, statuses: nextStatuses } });
  };

  if (state.status === 'loading') {
    return <p className="text-gray-500">Loading events…</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="empty-state">
        <p className="empty-heading">Couldn't load events</p>
        <p className="empty-desc">{state.message}</p>
      </div>
    );
  }
  if (state.events.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-heading">No upcoming events</p>
        <p className="empty-desc">Check back soon — new events are added every week.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-4 list-none p-0">
      {state.events.map((event) => {
        const plate = formatDatePlate(event.startsAt);
        const myStatus =
          state.auth.kind === 'authed' ? state.auth.statuses.get(event.id) : undefined;
        return (
          <li key={event.id} className="event-card">
            <div className="date-plate">
              <span className="date-month">{plate.month}</span>
              <span className="date-day">{plate.day}</span>
              <span className="date-weekday">{plate.weekday}</span>
            </div>
            <div className="event-body">
              <span className="event-status">{FORMAT_LABEL[event.format]}</span>
              <h3 className="event-title">{event.title}</h3>
              <p className="event-desc">{event.description}</p>
              <div className="event-meta">
                <span>{formatTimeRange(event.startsAt, event.endsAt)}</span>
                {event.location && <span>· {event.location}</span>}
                <CapacityLabel event={event} />
              </div>
              <div className="event-bottom">
                <RegisterButton
                  event={event}
                  auth={state.auth}
                  onRegister={handleRegister}
                  onCancel={handleCancel}
                />
                <StatusBadge status={myStatus} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
