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

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; events: ApiEvent[] };

async function loadEvents(): Promise<ApiEvent[]> {
  const res = await fetch('/api/v1/events');
  if (!res.ok) {
    throw new Error(`events fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { events: ApiEvent[] };
  return body.events;
}

const FORMAT_LABEL: Record<ApiEvent['format'], string> = {
  meetup: 'Meetup',
  workshop: 'Workshop',
  hackathon: 'Hackathon',
  conference: 'Conference',
  online: 'Online',
};

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

export function EventsList(): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadEvents()
      .then((events) => {
        if (!cancelled) setState({ status: 'loaded', events });
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
            </div>
          </li>
        );
      })}
    </ul>
  );
}
