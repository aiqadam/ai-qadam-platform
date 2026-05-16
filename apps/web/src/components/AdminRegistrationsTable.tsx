import { type ReactElement, useEffect, useState } from 'react';

// Admin registrations table for a single event. Lists every registration
// (all statuses) joined with user info. Read-only in B4 v1 — cancel /
// promote actions land in a follow-up alongside the corresponding
// admin endpoints.

type Status = 'registered' | 'waitlisted' | 'cancelled' | 'attended';

interface AdminRegistration {
  id: string;
  status: Status;
  createdAt: string;
  checkedInAt: string | null;
  cancelledAt: string | null;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    handle: string | null;
  };
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'not_found' }
  | { phase: 'ready'; rows: AdminRegistration[] }
  | { phase: 'error'; message: string };

async function bootstrap(eventId: string): Promise<State> {
  const refreshRes = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!refreshRes.ok) return { phase: 'anon' };
  const { accessToken } = (await refreshRes.json()) as { accessToken: string };

  const res = await fetch(`/api/v1/admin/events/${eventId}/registrations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 403) return { phase: 'forbidden' };
  if (res.status === 404) return { phase: 'not_found' };
  if (!res.ok) return { phase: 'error', message: `HTTP ${res.status}` };
  const body = (await res.json()) as { registrations: AdminRegistration[] };
  return { phase: 'ready', rows: body.registrations };
}

const STATUS_STYLE: Record<Status, { bg: string; fg: string }> = {
  registered: {
    bg: 'color-mix(in oklch, var(--primary) 12%, transparent)',
    fg: 'var(--primary)',
  },
  waitlisted: { bg: 'var(--muted)', fg: 'var(--muted-foreground)' },
  attended: {
    bg: 'color-mix(in oklch, oklch(0.7 0.13 145) 15%, transparent)',
    fg: 'oklch(0.6 0.18 145)',
  },
  cancelled: { bg: 'var(--muted)', fg: 'var(--muted-foreground)' },
};

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function displayNameFor(u: AdminRegistration['user']): string {
  return u.displayName ?? u.email.split('@')[0] ?? u.email;
}

interface Props {
  eventId: string;
}

export function AdminRegistrationsTable({ eventId }: Props): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    bootstrap(eventId)
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
  }, [eventId]);

  if (state.phase === 'loading')
    return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
  if (state.phase === 'anon')
    return <p style={{ color: 'var(--muted-foreground)' }}>Sign in required.</p>;
  if (state.phase === 'forbidden')
    return <p style={{ color: 'var(--muted-foreground)' }}>Not authorized for this country.</p>;
  if (state.phase === 'not_found')
    return <p style={{ color: 'var(--muted-foreground)' }}>Event not found.</p>;
  if (state.phase === 'error')
    return <p style={{ color: 'var(--destructive, #c00)' }}>{state.message}</p>;

  if (state.rows.length === 0) {
    return (
      <div
        style={{
          padding: '40px 24px',
          border: '1px dashed var(--border)',
          borderRadius: 12,
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0 }}>
          No registrations yet for this event.
        </p>
      </div>
    );
  }

  const counts: Record<Status, number> = {
    registered: 0,
    waitlisted: 0,
    attended: 0,
    cancelled: 0,
  };
  for (const r of state.rows) counts[r.status] += 1;

  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 16,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--muted-foreground)',
        }}
      >
        <span>
          <strong style={{ color: 'var(--foreground)' }}>{counts.registered}</strong> registered
        </span>
        <span>
          <strong style={{ color: 'var(--foreground)' }}>{counts.waitlisted}</strong> waitlist
        </span>
        <span>
          <strong style={{ color: 'var(--foreground)' }}>{counts.attended}</strong> attended
        </span>
        <span>
          <strong style={{ color: 'var(--foreground)' }}>{counts.cancelled}</strong> cancelled
        </span>
      </div>

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
            <th style={headStyle}>Member</th>
            <th style={headStyle}>Status</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>Registered</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>Checked in</th>
          </tr>
        </thead>
        <tbody>
          {state.rows.map((r) => {
            const s = STATUS_STYLE[r.status];
            const name = displayNameFor(r.user);
            return (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ fontSize: 14 }}>{name}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-mono)',
                      marginTop: 2,
                    }}
                  >
                    {r.user.handle ? `@${r.user.handle}` : r.user.email}
                  </div>
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.04em',
                      background: s.bg,
                      color: s.fg,
                    }}
                  >
                    {r.status}
                  </span>
                </td>
                <td style={cellMono}>{dateFmt.format(new Date(r.createdAt))}</td>
                <td style={cellMono}>
                  {r.checkedInAt ? dateFmt.format(new Date(r.checkedInAt)) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

const headStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 16px',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--muted-foreground)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 500,
};

const cellMono: React.CSSProperties = {
  padding: '10px 16px',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  textAlign: 'right',
  color: 'var(--muted-foreground)',
};
