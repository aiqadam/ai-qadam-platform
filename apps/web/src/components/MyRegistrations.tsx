import { QRCodeSVG } from 'qrcode.react';
import { type ReactElement, useEffect, useState } from 'react';

type Status = 'registered' | 'waitlisted' | 'cancelled' | 'attended';

interface MineEntry {
  id: string;
  status: Status;
  checkinCode: string;
  checkedInAt: string | null;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location: string | null;
  };
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; entries: MineEntry[] };

interface Props {
  accessToken: string;
}

async function fetchMine(accessToken: string): Promise<MineEntry[]> {
  const res = await fetch('/api/v1/registrations/mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`/me fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as { registrations: MineEntry[] };
  return body.registrations;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function statusBadge(status: Status): { label: string; className: string } {
  if (status === 'registered') return { label: "You're in", className: 'badge badge-success' };
  if (status === 'waitlisted') return { label: 'On waitlist', className: 'badge' };
  if (status === 'attended') return { label: 'Checked in', className: 'badge badge-success' };
  return { label: 'Cancelled', className: 'badge' };
}

export function MyRegistrations({ accessToken }: Props): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchMine(accessToken)
      .then((entries) => {
        if (!cancelled) setState({ status: 'loaded', entries });
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
  }, [accessToken]);

  if (state.status === 'loading') {
    return <p className="text-gray-500">Loading your registrations…</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="empty-state">
        <p className="empty-heading">Couldn't load registrations</p>
        <p className="empty-desc">{state.message}</p>
      </div>
    );
  }
  if (state.entries.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-heading">No upcoming events yet</p>
        <p className="empty-desc">Browse events and register to see them here.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-4 list-none p-0">
      {state.entries.map((entry) => {
        const badge = statusBadge(entry.status);
        const checkinUrl = `${window.location.origin}/checkin?code=${entry.checkinCode}`;
        return (
          <li key={entry.id} className="card flex items-start gap-6">
            <div className="flex-1">
              <h3 className="event-title">{entry.event.title}</h3>
              <p className="event-meta">
                <span>{dateFormatter.format(new Date(entry.event.startsAt))}</span>
                {entry.event.location && <span>· {entry.event.location}</span>}
              </p>
              <p className="mt-3">
                <span className={badge.className}>{badge.label}</span>
              </p>
              {entry.checkedInAt && (
                <p className="mt-2 text-xs text-gray-500">
                  Checked in {dateFormatter.format(new Date(entry.checkedInAt))}
                </p>
              )}
            </div>
            {entry.status === 'registered' && (
              <div className="text-center">
                <QRCodeSVG value={checkinUrl} size={120} />
                <p className="mt-2 text-xs text-gray-500">Show at the door</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
