import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

// F-S2.7 (ADR-0035) — admin form. POST /api/v1/admin/invites returns
// { invite_id, invite_url, token_prefix, expires_at }; the URL contains
// the plaintext token shown ONCE. UX: render the URL in a copy-button
// success panel; do NOT navigate away.

// Auto-redirects anon to Authentik (matches workspace shell pattern).
function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/admin/users/new'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

type Role = 'aiqadam-super-admin' | 'aiqadam-staff';
// country-lead roles intentionally omitted until ENABLE_COUNTRY_LEAD_INVITES
// flips per G-1; surface server's 400 country_lead_invites_disabled if
// any caller tries via API.

const ROLE_LABELS: Record<Role, string> = {
  'aiqadam-super-admin': 'Super-admin (full admin)',
  'aiqadam-staff': 'Staff (workspace cabinets, no admin)',
};
const ROLE_KEYS: Role[] = ['aiqadam-staff', 'aiqadam-super-admin'];

interface CreateResult {
  invite_id: string;
  invite_url: string;
  token_prefix: string;
  expires_at: string;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'probe_error'; httpStatus: number }
  | { phase: 'ready'; accessToken: string }
  | { phase: 'submitting'; accessToken: string }
  | { phase: 'done'; accessToken: string; result: CreateResult }
  | { phase: 'error'; accessToken: string; message: string };

async function bootstrap(): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  // Probe authorization by trying the (cheap) list call. 403 = not
  // super-admin; 5xx = backend issue (don't redirect-loop the user
  // through a sign-in that already worked).
  const probe = await fetch('/api/v1/admin/invites?status=pending', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (probe.status === 403) return { phase: 'forbidden' };
  if (probe.status === 401) return { phase: 'anon' };
  if (!probe.ok) return { phase: 'probe_error', httpStatus: probe.status };
  return { phase: 'ready', accessToken };
}

export default function AdminUserCreateForm(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('aiqadam-staff');
  const [deliveryChannel, setDeliveryChannel] = useState<'email' | 'copy_paste'>('copy_paste');
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon') {
    return <p style={mutedStyle()}>Redirecting to sign-in…</p>;
  }
  if (state.phase === 'forbidden') {
    return (
      <p style={mutedStyle()}>
        Your account doesn't have admin permission. Ask a super-admin if you need access.
      </p>
    );
  }
  if (state.phase === 'probe_error') {
    return (
      <p style={mutedStyle()}>
        Backend error checking admin permission (HTTP {state.httpStatus}). Refresh in a minute, or
        check API logs.
      </p>
    );
  }

  if (state.phase === 'done') {
    return (
      <div style={panelStyle()}>
        <h2 style={{ ...h2Style(), color: 'var(--accent, #10b981)' }}>✓ Invite created</h2>
        <p style={mutedStyle()}>
          Share this link with the invitee. It expires{' '}
          <strong>{new Date(state.result.expires_at).toLocaleString()}</strong> and can only be used
          once. <strong>You will NOT see this URL again</strong> — copy it now.
        </p>
        <div
          style={{
            padding: 12,
            background: 'var(--muted)',
            borderRadius: 8,
            wordBreak: 'break-all',
            fontFamily: 'monospace',
            fontSize: 13,
            margin: '16px 0',
          }}
        >
          {state.result.invite_url}
        </div>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await navigator.clipboard.writeText(state.result.invite_url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
        <a className="btn" href="/workspace/admin/users" style={{ marginLeft: 8 }}>
          Back to operators
        </a>
      </div>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (state.phase !== 'ready') return;
    setState({ ...state, phase: 'submitting' });
    const res = await fetch('/api/v1/admin/invites', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email,
        display_name: displayName || undefined,
        role_groups: [role],
        delivery_channel: deliveryChannel,
        notes: notes || undefined,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setState({ ...state, phase: 'error', message: body.message ?? `HTTP ${res.status}` });
      return;
    }
    const result = (await res.json()) as CreateResult;
    setState({ ...state, phase: 'done', result });
  }

  const submitting = state.phase === 'submitting';
  const errorMsg = state.phase === 'error' ? state.message : null;

  return (
    <form onSubmit={onSubmit} style={panelStyle()}>
      <label style={labelStyle()}>
        <span>Email (use first.last@aiqadam.org for staff)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={254}
          style={inputStyle()}
        />
      </label>

      <label style={labelStyle()}>
        <span>Display name (optional)</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={120}
          style={inputStyle()}
        />
      </label>

      <label style={labelStyle()}>
        <span>Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={inputStyle()}>
          {ROLE_KEYS.map((k) => (
            <option key={k} value={k}>
              {ROLE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <label style={labelStyle()}>
        <span>Delivery</span>
        <select
          value={deliveryChannel}
          onChange={(e) => setDeliveryChannel(e.target.value as 'email' | 'copy_paste')}
          style={inputStyle()}
        >
          <option value="copy_paste">Copy/paste (you'll get a URL to share)</option>
          <option value="email">Email (sent automatically — coming soon)</option>
        </select>
      </label>

      <label style={labelStyle()}>
        <span>Notes (internal, optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={3}
          style={inputStyle()}
        />
      </label>

      {errorMsg && (
        <p style={{ color: 'var(--destructive)', fontSize: 14 }}>
          <code>{errorMsg}</code>
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary"
        style={{ marginTop: 16 }}
      >
        {submitting ? 'Minting invite…' : 'Create invite'}
      </button>
    </form>
  );
}

function panelStyle(): React.CSSProperties {
  return {
    padding: 32,
    border: '1px solid var(--border)',
    borderRadius: 16,
    background: 'var(--card)',
  };
}
function h2Style(): React.CSSProperties {
  return { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24, margin: '0 0 12px' };
}
function mutedStyle(): React.CSSProperties {
  return { fontSize: 15, color: 'var(--muted-foreground)', margin: '0 0 16px' };
}
function labelStyle(): React.CSSProperties {
  return { display: 'block', fontSize: 14, margin: '12px 0' };
}
function inputStyle(): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: 10,
    fontSize: 14,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--background)',
    color: 'var(--foreground)',
    marginTop: 4,
  };
}
