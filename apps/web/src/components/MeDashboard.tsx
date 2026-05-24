import { QRCodeSVG } from 'qrcode.react';
import { type ReactElement, useEffect, useState } from 'react';
import { getAuthState } from '../lib/auth-bootstrap';

// /me dashboard per design s3-2. Client-side island:
//   1. getAuthState() — shared bootstrap, deduped with other islands on
//      the page (Nav.tsx, etc). If anon, render sign-in CTA.
//   2. GET /api/v1/registrations/mine with the access token from step 1.
//   3. Render stat cards (upcoming / attended / waitlisted) + registrations
//      list with QR codes for active registrations.
//
// Points / streak / "speaking at" cards are deferred until per-user
// points endpoint + speakers schema exist.

type Status = 'registered' | 'waitlisted' | 'cancelled' | 'attended';

interface Me {
  id: string;
  email: string;
  authentikSubject: string;
}

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

interface Session {
  me: Me;
  accessToken: string;
  registrations: MineEntry[];
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; session: Session }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  const auth = await getAuthState();
  if (!auth) return { phase: 'anon' };
  const { me, accessToken } = auth;

  const mineRes = await fetch('/api/v1/registrations/mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const mineBody = mineRes.ok
    ? ((await mineRes.json()) as { registrations: MineEntry[] })
    : { registrations: [] };

  return {
    phase: 'authed',
    session: { me, accessToken, registrations: mineBody.registrations },
  };
}

async function signOut(): Promise<void> {
  // Pull a fresh access token so the API can deny-list THIS jti
  // immediately (sign-out reads Authorization: Bearer to know what to
  // revoke). Then POST /sign-out — the response carries the Authentik
  // end_session URL we must navigate the browser to so the IdP session
  // is killed (SSO ⇒ SLO). Falling back to /auth/signed-out only when
  // the API can't produce a hint-bearing logout URL means our local
  // session is gone but the user's Authentik session lingers, which is
  // a security regression — keep the fallback strictly for failure
  // cases (no id_token row, network error).
  let bearer = '';
  try {
    const refresh = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (refresh.ok) {
      bearer = ((await refresh.json()) as { accessToken: string }).accessToken;
    }
  } catch {
    // refresh failed — fine, /sign-out still clears the refresh cookie.
  }
  let logoutUrl: string | null = null;
  try {
    const res = await fetch('/api/v1/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    });
    if (res.ok) {
      logoutUrl = ((await res.json()) as { logoutUrl: string | null }).logoutUrl;
    }
  } catch {
    // local clear still happened via cookie expiry on the server.
  }
  window.location.href = logoutUrl ?? '/auth/signed-out';
}

function nextHere(): string {
  return `${window.location.pathname}${window.location.search}`;
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

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

function statusBadgeStyle(status: Status): { label: string; bg: string; fg: string } {
  if (status === 'registered') {
    return {
      label: "You're in",
      bg: 'color-mix(in oklch, var(--primary) 12%, transparent)',
      fg: 'var(--primary)',
    };
  }
  if (status === 'attended') {
    return {
      label: 'Checked in',
      bg: 'color-mix(in oklch, var(--success, oklch(0.7 0.13 145)) 12%, transparent)',
      fg: 'var(--success, oklch(0.7 0.13 145))',
    };
  }
  if (status === 'waitlisted') {
    return { label: 'On waitlist', bg: 'var(--muted)', fg: 'var(--muted-foreground)' };
  }
  return { label: 'Cancelled', bg: 'var(--muted)', fg: 'var(--muted-foreground)' };
}

interface RegistrationRowProps {
  entry: MineEntry;
}

function RegistrationRow({ entry }: RegistrationRowProps): ReactElement {
  const badge = statusBadgeStyle(entry.status);
  const checkinUrl = `${window.location.origin}/checkin?code=${entry.checkinCode}`;
  const showQR = entry.status === 'registered';
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: showQR ? '1fr 140px' : '1fr',
        gap: 20,
        padding: 20,
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        alignItems: 'center',
      }}
    >
      <div>
        <a
          href={`/events/${entry.event.id}`}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 17,
            color: 'inherit',
            textDecoration: 'none',
            display: 'block',
            marginBottom: 6,
          }}
        >
          {entry.event.title}
        </a>
        <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 10px' }}>
          {dateFmt.format(new Date(entry.event.startsAt))}
          {entry.event.location && ` · ${entry.event.location}`}
        </p>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 6,
            background: badge.bg,
            color: badge.fg,
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em',
          }}
        >
          {badge.label}
        </span>
        {entry.checkedInAt && (
          <p
            style={{
              marginTop: 8,
              fontSize: 11,
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Checked in {dateFmt.format(new Date(entry.checkedInAt))}
          </p>
        )}
      </div>
      {showQR && (
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              padding: 8,
              background: 'white',
              borderRadius: 8,
              display: 'inline-block',
            }}
          >
            <QRCodeSVG value={checkinUrl} size={110} />
          </div>
          <p
            style={{
              marginTop: 6,
              fontSize: 10,
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Show at the door
          </p>
        </div>
      )}
    </li>
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
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 22,
          margin: '0 0 8px',
        }}
      >
        Sign in to see your dashboard
      </h2>
      <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: '0 0 20px' }}>
        Track your registrations, see your check-in QR codes, and earn points for attending.
      </p>
      <a
        className="btn btn-primary btn-lg"
        href={`/auth/sign-in?next=${encodeURIComponent(nextHere())}`}
        style={{ textDecoration: 'none' }}
      >
        Sign in with Authentik
      </a>
    </div>
  );
}

interface DashboardProps {
  session: Session;
}

function Dashboard({ session }: DashboardProps): ReactElement {
  const upcoming = session.registrations.filter(
    (r) => r.status === 'registered' && new Date(r.event.startsAt) > new Date(),
  );
  const attended = session.registrations.filter((r) => r.status === 'attended');
  const waitlisted = session.registrations.filter((r) => r.status === 'waitlisted');
  const active = [...upcoming, ...waitlisted, ...attended].sort(
    (a, b) => new Date(b.event.startsAt).getTime() - new Date(a.event.startsAt).getTime(),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 36,
              letterSpacing: '-0.025em',
              margin: '0 0 4px',
            }}
          >
            Hi, {session.me.email.split('@')[0]}
          </h1>
          <p
            style={{
              fontSize: 13,
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
              margin: 0,
            }}
          >
            {session.me.email}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            className="btn btn-outline btn-sm"
            href="/me/preferences"
            style={{ textDecoration: 'none' }}
          >
            Preferences
          </a>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatCard label="Upcoming" value={upcoming.length} />
        <StatCard label="Attended" value={attended.length} />
        <StatCard label="On waitlist" value={waitlisted.length} />
        <StatCard label="Points" value="—" hint="See the leaderboard" />
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
          Your registrations
        </h2>
        {active.length === 0 ? (
          <div
            style={{
              padding: '40px 24px',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0 }}>
              No registrations yet.{' '}
              <a href="/events" style={{ color: 'var(--primary)' }}>
                Browse events →
              </a>
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
              gap: 12,
            }}
          >
            {active.map((entry) => (
              <RegistrationRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function MeDashboard(): ReactElement {
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

  if (state.phase === 'loading') {
    return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
  }
  if (state.phase === 'error') {
    return <p style={{ color: 'var(--destructive, #c00)' }}>{state.message}</p>;
  }
  if (state.phase === 'anon') return <AnonView />;
  return <Dashboard session={state.session} />;
}
