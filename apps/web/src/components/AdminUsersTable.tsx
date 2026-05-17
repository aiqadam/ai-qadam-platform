import { type ReactElement, useEffect, useState } from 'react';

// /admin/users table with inline role editor. Gated server-side on
// super_admin (country_admin can't see this route — see B1 / B5 backend).

type Role = 'member' | 'organizer' | 'country_admin' | 'super_admin';

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  handle: string | null;
  role: Role;
  createdAt: string;
  lastLoginAt: string;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'ready'; users: AdminUser[]; accessToken: string; meId: string | null }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  const refreshRes = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!refreshRes.ok) return { phase: 'anon' };
  const { accessToken } = (await refreshRes.json()) as { accessToken: string };

  const meRes = await fetch('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meId = meRes.ok ? ((await meRes.json()) as { id: string }).id : null;

  const res = await fetch('/api/v1/admin/users', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 403) return { phase: 'forbidden' };
  if (!res.ok) return { phase: 'error', message: `HTTP ${res.status}` };
  const body = (await res.json()) as { users: AdminUser[] };
  return { phase: 'ready', users: body.users, accessToken, meId };
}

async function patchRole(userId: string, role: Role, accessToken: string): Promise<AdminUser> {
  const res = await fetch(`/api/v1/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return (await res.json()) as AdminUser;
}

const ROLES: ReadonlyArray<Role> = ['member', 'organizer', 'country_admin', 'super_admin'];

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

interface RowProps {
  user: AdminUser;
  isSelf: boolean;
  busy: boolean;
  onChange: (role: Role) => void;
}

function Row({ user, isSelf, busy, onChange }: RowProps): ReactElement {
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={{ padding: '10px 16px' }}>
        <div style={{ fontSize: 14 }}>{user.displayName ?? user.email}</div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-mono)',
            marginTop: 2,
          }}
        >
          {user.handle ? `@${user.handle}` : user.email}
        </div>
      </td>
      <td style={{ padding: '10px 16px' }}>
        <select
          value={user.role}
          disabled={isSelf || busy}
          onChange={(e) => onChange(e.target.value as Role)}
          style={{
            padding: '5px 8px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--card)',
            color: 'var(--foreground)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            opacity: isSelf ? 0.5 : 1,
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {isSelf && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 10,
              color: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            (you)
          </span>
        )}
      </td>
      <td style={cellMono}>{dateFmt.format(new Date(user.createdAt))}</td>
      <td style={cellMono}>{dateFmt.format(new Date(user.lastLoginAt))}</td>
    </tr>
  );
}

export function AdminUsersTable(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  async function changeRole(userId: string, role: Role): Promise<void> {
    if (state.phase !== 'ready') return;
    setBusyId(userId);
    setSubmitError(null);
    try {
      const updated = await patchRole(userId, role, state.accessToken);
      setState({
        ...state,
        users: state.users.map((u) => (u.id === userId ? updated : u)),
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'role update failed');
    } finally {
      setBusyId(null);
    }
  }

  if (state.phase === 'loading')
    return <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>;
  if (state.phase === 'anon')
    return <p style={{ color: 'var(--muted-foreground)' }}>Sign in required.</p>;
  if (state.phase === 'forbidden')
    return <p style={{ color: 'var(--muted-foreground)' }}>Super-admin role required.</p>;
  if (state.phase === 'error')
    return <p style={{ color: 'var(--destructive, #c00)' }}>{state.message}</p>;

  return (
    <>
      {submitError && (
        <div
          style={{
            padding: '10px 12px',
            border: '1px solid color-mix(in oklch, oklch(0.6 0.18 25) 50%, var(--border))',
            background: 'color-mix(in oklch, oklch(0.6 0.18 25) 8%, transparent)',
            borderRadius: 8,
            fontSize: 13,
            color: 'oklch(0.6 0.18 25)',
            marginBottom: 16,
          }}
        >
          {submitError}
        </div>
      )}
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
            <th style={headStyle}>Role</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>Joined</th>
            <th style={{ ...headStyle, textAlign: 'right' }}>Last login</th>
          </tr>
        </thead>
        <tbody>
          {state.users.map((u) => (
            <Row
              key={u.id}
              user={u}
              isSelf={state.meId === u.id}
              busy={busyId === u.id}
              onChange={(role) => void changeRole(u.id, role)}
            />
          ))}
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
