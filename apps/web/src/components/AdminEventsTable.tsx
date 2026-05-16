import { type ReactElement, useEffect, useState } from 'react';

// Admin events table island. Lists all events (incl. drafts + cancelled).
// Same refresh-then-fetch bootstrap as other admin islands. Editing
// happens on /admin/events/[id]; this component only lists + deletes.

interface AdminEvent {
  id: string;
  title: string;
  format: string;
  status: 'draft' | 'published' | 'cancelled';
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registeredCount: number;
  location: string | null;
  countryCode: string;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'ready'; events: AdminEvent[]; accessToken: string }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  const refreshRes = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!refreshRes.ok) return { phase: 'anon' };
  const { accessToken } = (await refreshRes.json()) as { accessToken: string };

  const res = await fetch('/api/v1/admin/events', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 403) return { phase: 'forbidden' };
  if (!res.ok) return { phase: 'error', message: `HTTP ${res.status}` };
  const body = (await res.json()) as { events: AdminEvent[] };
  return { phase: 'ready', events: body.events, accessToken };
}

async function deleteEvent(id: string, accessToken: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/events/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`delete failed: HTTP ${res.status}`);
  }
}

const STATUS_STYLE: Record<AdminEvent['status'], { bg: string; fg: string }> = {
  draft: { bg: 'var(--muted)', fg: 'var(--muted-foreground)' },
  published: {
    bg: 'color-mix(in oklch, var(--primary) 12%, transparent)',
    fg: 'var(--primary)',
  },
  cancelled: {
    bg: 'color-mix(in oklch, oklch(0.6 0.18 25) 12%, transparent)',
    fg: 'oklch(0.6 0.18 25)',
  },
};

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface RowProps {
  event: AdminEvent;
  busy: boolean;
  onDelete: () => void;
}

function Row({ event, busy, onDelete }: RowProps): ReactElement {
  const s = STATUS_STYLE[event.status];
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={{ padding: '12px 16px' }}>
        <a
          href={`/admin/events/${event.id}`}
          style={{
            color: 'inherit',
            textDecoration: 'none',
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          {event.title}
        </a>
        <div
          style={{
            fontSize: 11,
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-mono)',
            marginTop: 2,
          }}
        >
          {event.format.toUpperCase()}
          {event.location && ` · ${event.location}`}
        </div>
      </td>
      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        {dateFmt.format(new Date(event.startsAt))}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span
          style={{
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em',
            background: s.bg,
            color: s.fg,
          }}
        >
          {event.status}
        </span>
      </td>
      <td
        style={{
          padding: '12px 16px',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          textAlign: 'right',
        }}
      >
        {event.capacity != null
          ? `${event.registeredCount} / ${event.capacity}`
          : event.registeredCount}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={onDelete}
          style={{ color: 'oklch(0.6 0.18 25)' }}
        >
          {busy ? '…' : 'Delete'}
        </button>
      </td>
    </tr>
  );
}

function AnonView(): ReactElement {
  return (
    <div
      style={{
        padding: 32,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        textAlign: 'center',
      }}
    >
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, margin: '0 0 8px' }}>
        Sign in required
      </h2>
      <a
        className="btn btn-primary btn-lg"
        href="/api/v1/auth/login"
        style={{ textDecoration: 'none' }}
      >
        Sign in
      </a>
    </div>
  );
}

function ForbiddenView(): ReactElement {
  return (
    <div
      style={{
        padding: 32,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0 }}>
        Your account doesn't have admin access for this country.
      </p>
    </div>
  );
}

export function AdminEventsTable(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrap()
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
  }, []);

  async function handleDelete(id: string): Promise<void> {
    if (state.phase !== 'ready') return;
    if (!window.confirm('Delete this event? Registrations will be removed too.')) return;
    setBusyId(id);
    try {
      await deleteEvent(id, state.accessToken);
      setState({ ...state, events: state.events.filter((e) => e.id !== id) });
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'delete failed',
      });
    } finally {
      setBusyId(null);
    }
  }

  if (state.phase === 'loading')
    return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
  if (state.phase === 'anon') return <AnonView />;
  if (state.phase === 'forbidden') return <ForbiddenView />;
  if (state.phase === 'error')
    return <p style={{ color: 'var(--destructive, #c00)' }}>{state.message}</p>;

  if (state.events.length === 0) {
    return (
      <div
        style={{
          padding: '40px 24px',
          border: '1px dashed var(--border)',
          borderRadius: 12,
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '0 0 12px' }}>
          No events yet.
        </p>
        <a
          className="btn btn-primary btn-sm"
          href="/admin/events/new"
          style={{ textDecoration: 'none' }}
        >
          Create the first one
        </a>
      </div>
    );
  }

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--card)',
      }}
    >
      <thead style={{ background: 'color-mix(in oklch, var(--muted) 40%, transparent)' }}>
        <tr>
          <th
            style={{
              textAlign: 'left',
              padding: '10px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--muted-foreground)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            Title
          </th>
          <th
            style={{
              textAlign: 'left',
              padding: '10px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--muted-foreground)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            Starts
          </th>
          <th
            style={{
              textAlign: 'left',
              padding: '10px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--muted-foreground)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            Status
          </th>
          <th
            style={{
              textAlign: 'right',
              padding: '10px 16px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--muted-foreground)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            Reg
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        {state.events.map((e) => (
          <Row
            key={e.id}
            event={e}
            busy={busyId === e.id}
            onDelete={() => void handleDelete(e.id)}
          />
        ))}
      </tbody>
    </table>
  );
}
