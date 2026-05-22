import { type ReactElement, type ReactNode, useEffect, useState } from 'react';

// F-S3.4 — operator events list. Sorted by starts_at desc (newest first).
// Click an event → /workspace/events/[id] control panel.

interface RegistrationCounts {
  registered: number;
  waitlisted: number;
  cancelled: number;
  attended: number;
}

interface EventListItem {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'cancelled';
  format: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  location: string | null;
  country: string;
  counts: RegistrationCounts;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; accessToken: string; email: string; events: EventListItem[] }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  try {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!r.ok) return { phase: 'anon' };
    const { accessToken } = (await r.json()) as { accessToken: string };
    const me = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!me.ok) return { phase: 'anon' };
    const meData = (await me.json()) as { email: string };
    const list = await fetch('/api/v1/workspace/events', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!list.ok) return { phase: 'error', message: `list events: ${list.status}` };
    const { events } = (await list.json()) as { events: EventListItem[] };
    return { phase: 'authed', accessToken, email: meData.email, events };
  } catch (err) {
    return { phase: 'error', message: err instanceof Error ? err.message : 'bootstrap failed' };
  }
}

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/events'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

export default function EventsListPanel(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    void bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  if (state.phase === 'loading' || state.phase === 'anon') {
    return (
      <Shell>
        <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>
      </Shell>
    );
  }
  if (state.phase === 'error') {
    return (
      <Shell>
        <p style={{ color: 'var(--muted-foreground)' }}>Events unavailable: {state.message}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Header email={state.email} count={state.events.length} />
      {state.events.length === 0 ? <Empty /> : <EventsTable events={state.events} />}
    </Shell>
  );
}

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

function Header({ email, count }: { email: string; count: number }): ReactElement {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 28,
          letterSpacing: '-0.02em',
          margin: '0 0 6px',
        }}
      >
        Events
      </h1>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
        {count} {count === 1 ? 'event' : 'events'} · signed in as {email}
      </p>
    </div>
  );
}

function Empty(): ReactElement {
  return (
    <div
      style={{
        padding: 48,
        border: '1px dashed var(--border)',
        borderRadius: 12,
        textAlign: 'center',
        color: 'var(--muted-foreground)',
      }}
    >
      <p style={{ margin: 0, fontSize: 14 }}>
        No events yet. Create one in Directus (engineer task — operator cabinet for event creation
        lands in a follow-up PR).
      </p>
    </div>
  );
}

function EventsTable({ events }: { events: EventListItem[] }): ReactElement {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--card)',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--muted)', textAlign: 'left' }}>
            <Th>Event</Th>
            <Th>When</Th>
            <Th>Status</Th>
            <Th align="right">Registered</Th>
            <Th align="right">Waitlist</Th>
            <Th align="right">Attended</Th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: string; align?: 'right' }): ReactElement {
  return (
    <th
      style={{
        padding: '10px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--muted-foreground)',
        textAlign: align ?? 'left',
        fontWeight: 500,
      }}
    >
      {children}
    </th>
  );
}

function EventRow({ event }: { event: EventListItem }): ReactElement {
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={{ padding: '12px 14px' }}>
        <a
          href={`/workspace/events/${event.id}`}
          style={{ color: 'var(--foreground)', textDecoration: 'none', fontWeight: 500 }}
        >
          {event.title}
        </a>
        {event.location && (
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
            {event.location}
          </p>
        )}
      </td>
      <td style={{ padding: '12px 14px', color: 'var(--muted-foreground)' }}>
        {formatWhen(event.starts_at)}
      </td>
      <td style={{ padding: '12px 14px' }}>
        <StatusPill status={event.status} />
      </td>
      <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {event.counts.registered}
        {event.capacity ? (
          <span style={{ color: 'var(--muted-foreground)' }}>/{event.capacity}</span>
        ) : null}
      </td>
      <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {event.counts.waitlisted || ''}
      </td>
      <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {event.counts.attended || ''}
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: EventListItem['status'] }): ReactElement {
  const styles: Record<EventListItem['status'], { bg: string; fg: string; label: string }> = {
    draft: { bg: 'var(--muted)', fg: 'var(--muted-foreground)', label: 'Draft' },
    published: {
      bg: 'color-mix(in oklch, var(--primary) 15%, var(--card))',
      fg: 'var(--primary)',
      label: 'Published',
    },
    cancelled: {
      bg: 'color-mix(in oklch, var(--destructive, #c00) 12%, var(--card))',
      fg: 'var(--destructive, #c00)',
      label: 'Cancelled',
    },
  };
  const s = styles[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {s.label}
    </span>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
