import { type ReactElement, useEffect, useState } from 'react';

// /admin dashboard island. Same refresh-then-fetch pattern as MeDashboard
// — but the fetch target /v1/admin/dashboard is AdminGuard-gated, so a
// 403 lands us in the "not authorized" view rather than blowing up.

interface DashboardResponse {
  tenant: string;
  stats: {
    upcomingEvents: number;
    registrationsThisWeek: number;
    pointsThisWeek: number;
  };
  topMembers: Array<{
    userId: string;
    displayName: string | null;
    email: string;
    totalPoints: number;
  }>;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'ready'; data: DashboardResponse }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  const refreshRes = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!refreshRes.ok) return { phase: 'anon' };
  const { accessToken } = (await refreshRes.json()) as { accessToken: string };

  const res = await fetch('/api/v1/admin/dashboard', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 403) return { phase: 'forbidden' };
  if (!res.ok) return { phase: 'error', message: `HTTP ${res.status}` };
  return { phase: 'ready', data: (await res.json()) as DashboardResponse };
}

interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
}

function StatCard({ label, value, hint }: StatCardProps): ReactElement {
  return (
    <div
      style={{
        padding: 20,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--muted-foreground)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 32,
          letterSpacing: '-0.02em',
          margin: 0,
        }}
      >
        {value}
      </p>
      {hint && <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0 }}>{hint}</p>}
    </div>
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
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, margin: '0 0 8px' }}>
        Not authorized
      </h2>
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '0 0 16px' }}>
        Your account doesn't have admin access for this country.
      </p>
      <a className="btn btn-outline" href="/me" style={{ textDecoration: 'none' }}>
        Go to /me
      </a>
    </div>
  );
}

function topMemberLabel(m: { displayName: string | null; email: string }): string {
  return m.displayName ?? m.email.split('@')[0] ?? m.email;
}

interface ReadyViewProps {
  data: DashboardResponse;
}

function ReadyView({ data }: ReadyViewProps): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <header>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 32,
            letterSpacing: '-0.025em',
            margin: '0 0 4px',
          }}
        >
          Admin · {data.tenant.toUpperCase()}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
          Last 7 days of activity in this country.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <StatCard label="Upcoming events" value={data.stats.upcomingEvents} />
        <StatCard label="Registrations · 7d" value={data.stats.registrationsThisWeek} />
        <StatCard
          label="Points awarded · 7d"
          value={data.stats.pointsThisWeek.toLocaleString('en-US')}
        />
      </div>

      <section>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: '-0.015em',
            margin: '0 0 16px',
          }}
        >
          Top members
        </h2>
        {data.topMembers.length === 0 ? (
          <div
            style={{
              padding: '40px 24px',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0 }}>
              No points awarded yet.
            </p>
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {data.topMembers.map((m, i) => (
              <li
                key={m.userId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 100px',
                  alignItems: 'center',
                  padding: '12px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  background: 'var(--card)',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 14 }}>{topMemberLabel(m)}</span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'var(--primary)',
                    textAlign: 'right',
                  }}
                >
                  {m.totalPoints.toLocaleString('en-US')} pts
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function AdminDashboard(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });

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

  if (state.phase === 'loading')
    return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
  if (state.phase === 'anon') return <AnonView />;
  if (state.phase === 'forbidden') return <ForbiddenView />;
  if (state.phase === 'error')
    return <p style={{ color: 'var(--destructive, #c00)' }}>{state.message}</p>;
  return <ReadyView data={state.data} />;
}
