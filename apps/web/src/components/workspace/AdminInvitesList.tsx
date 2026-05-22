import { type ReactElement, useEffect, useState } from 'react';

// F-S2.7 (ADR-0035) — admin operator list. Pulls /v1/admin/invites
// for a status filter, renders rows with revoke action. token_prefix
// shown for support lookup (never the full token).

// Auto-redirects anon to Authentik (matches workspace shell pattern).
function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/admin/users'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

type Status = 'pending' | 'consumed' | 'revoked' | 'expired';

interface InviteSummary {
  id: string;
  email: string;
  display_name: string | null;
  role_groups: string[];
  country: string | null;
  status: Status;
  token_prefix: string;
  created_at: string;
  expires_at: string;
  delivery_channel: string | null;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'authed'; accessToken: string; invites: InviteSummary[]; status: Status | 'all' };

async function bootstrap(status: Status | 'all'): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!refresh.ok) return { phase: 'anon' };
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const qs = status === 'all' ? '' : `?status=${status}`;
  const res = await fetch(`/api/v1/admin/invites${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 403) return { phase: 'forbidden' };
  if (!res.ok) return { phase: 'anon' };
  const { invites } = (await res.json()) as { invites: InviteSummary[] };
  return { phase: 'authed', accessToken, invites, status };
}

const STATUS_TABS: Array<{ key: Status | 'all'; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'consumed', label: 'Active' },
  { key: 'revoked', label: 'Revoked' },
  { key: 'all', label: 'All' },
];

const STATUS_COLOR: Record<Status, string> = {
  pending: '#3b82f6',
  consumed: '#10b981',
  revoked: '#6b7280',
  expired: '#f59e0b',
};

export default function AdminInvitesList(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });

  useEffect(() => {
    bootstrap('pending').then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon')
    return <p style={mutedStyle()}>Redirecting to sign-in…</p>;
  if (state.phase === 'forbidden')
    return <p style={mutedStyle()}>Admin access only. Ask a super-admin if you need access.</p>;

  async function setStatus(status: Status | 'all'): Promise<void> {
    setState({ phase: 'bootstrap' });
    setState(await bootstrap(status));
  }

  async function revoke(id: string): Promise<void> {
    if (state.phase !== 'authed') return;
    if (!window.confirm('Revoke this invite? The invitee will not be able to use the link.')) {
      return;
    }
    const res = await fetch(`/api/v1/admin/invites/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${state.accessToken}` },
    });
    if (!res.ok) {
      alert(`Failed to revoke: HTTP ${res.status}`);
      return;
    }
    setState(await bootstrap(state.status));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatus(tab.key)}
            className={state.status === tab.key ? 'btn btn-primary' : 'btn'}
            style={{ padding: '6px 12px', fontSize: 14 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {state.invites.length === 0 ? (
        <p style={mutedStyle()}>No invites in this state.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle()}>Email</th>
              <th style={thStyle()}>Role</th>
              <th style={thStyle()}>Country</th>
              <th style={thStyle()}>Status</th>
              <th style={thStyle()}>Token</th>
              <th style={thStyle()}>Expires</th>
              <th style={thStyle()} />
            </tr>
          </thead>
          <tbody>
            {state.invites.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={tdStyle()}>
                  {inv.email}
                  {inv.display_name ? (
                    <span style={{ color: 'var(--muted-foreground)', display: 'block' }}>
                      {inv.display_name}
                    </span>
                  ) : null}
                </td>
                <td style={tdStyle()}>{inv.role_groups.join(', ')}</td>
                <td style={tdStyle()}>{inv.country ?? '—'}</td>
                <td style={tdStyle()}>
                  <span
                    style={{
                      background: STATUS_COLOR[inv.status],
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    {inv.status}
                  </span>
                </td>
                <td style={{ ...tdStyle(), fontFamily: 'monospace', fontSize: 12 }}>
                  {inv.token_prefix}…
                </td>
                <td style={tdStyle()}>{new Date(inv.expires_at).toLocaleDateString()}</td>
                <td style={tdStyle()}>
                  {inv.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => revoke(inv.id)}
                      className="btn"
                      style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                      Revoke
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function mutedStyle(): React.CSSProperties {
  return { fontSize: 15, color: 'var(--muted-foreground)' };
}
function thStyle(): React.CSSProperties {
  return { padding: '8px 12px', fontWeight: 600, fontSize: 13 };
}
function tdStyle(): React.CSSProperties {
  return { padding: '12px', verticalAlign: 'top' };
}
