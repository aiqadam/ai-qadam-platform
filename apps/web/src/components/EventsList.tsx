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
  location: string | null;
  countryCode: string;
}

type AuthState =
  | { kind: 'anon' }
  | { kind: 'authed'; accessToken: string; registeredIds: Set<string> };

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

async function fetchMyRegistrations(accessToken: string): Promise<Set<string>> {
  const res = await fetch('/api/v1/registrations/mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return new Set();
  const body = (await res.json()) as { registrations: Array<{ event: { id: string } }> };
  return new Set(body.registrations.map((r) => r.event.id));
}

async function loadInitialState(): Promise<State> {
  const events = await fetchEvents();
  const accessToken = await fetchAccessToken();
  if (!accessToken) {
    return { status: 'loaded', events, auth: { kind: 'anon' } };
  }
  const registeredIds = await fetchMyRegistrations(accessToken);
  return { status: 'loaded', events, auth: { kind: 'authed', accessToken, registeredIds } };
}

async function postRegister(eventId: string, accessToken: string): Promise<void> {
  const res = await fetch(`/api/v1/events/${eventId}/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`register failed: HTTP ${res.status}`);
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

interface RegisterButtonProps {
  eventId: string;
  auth: AuthState;
  onRegister: (eventId: string) => Promise<void>;
  onCancel: (eventId: string) => Promise<void>;
}

function RegisterButton({
  eventId,
  auth,
  onRegister,
  onCancel,
}: RegisterButtonProps): ReactElement {
  const [busy, setBusy] = useState(false);

  if (auth.kind === 'anon') {
    return (
      <a href="/api/v1/auth/login" className="btn btn-outline btn-sm">
        Sign in to register
      </a>
    );
  }
  const isRegistered = auth.registeredIds.has(eventId);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          if (isRegistered) {
            await onCancel(eventId);
          } else {
            await onRegister(eventId);
          }
        } finally {
          setBusy(false);
        }
      }}
      className={isRegistered ? 'btn btn-outline btn-sm' : 'btn btn-primary btn-sm'}
    >
      {busy ? '…' : isRegistered ? 'Cancel registration' : 'Register'}
    </button>
  );
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
    await postRegister(eventId, state.auth.accessToken);
    setState({
      ...state,
      auth: {
        ...state.auth,
        registeredIds: new Set([...state.auth.registeredIds, eventId]),
      },
    });
  };

  const handleCancel = async (eventId: string): Promise<void> => {
    if (state.status !== 'loaded' || state.auth.kind !== 'authed') return;
    await deleteRegister(eventId, state.auth.accessToken);
    const next = new Set(state.auth.registeredIds);
    next.delete(eventId);
    setState({ ...state, auth: { ...state.auth, registeredIds: next } });
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
                {event.capacity !== null && <span>· {event.capacity} seats</span>}
              </div>
              <div className="event-bottom">
                <RegisterButton
                  eventId={event.id}
                  auth={state.auth}
                  onRegister={handleRegister}
                  onCancel={handleCancel}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
