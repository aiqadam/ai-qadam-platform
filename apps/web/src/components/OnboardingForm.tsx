import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

// F-S2.7 (ADR-0035) — invitee onboarding form. Lifecycle:
//   1. Read ?token=... from URL
//   2. GET /api/v1/onboard/preview → render invitee email + role + AUP version
//   3. invitee sets password + clicks accept → POST /api/v1/onboard/accept
//   4. Success → redirect to /workspace
// 410 Gone on preview = expired/consumed/revoked/invalid; show the
// corresponding message + no form.

interface InvitePreview {
  email: string;
  display_name: string | null;
  role_groups: string[];
  country: string | null;
  expires_at: string;
  aup_version: string;
}

type State =
  | { phase: 'loading' }
  | { phase: 'gone'; message: string }
  | { phase: 'ready'; preview: InvitePreview; token: string }
  | { phase: 'submitting'; preview: InvitePreview; token: string }
  | { phase: 'done' }
  | { phase: 'error'; message: string; preview: InvitePreview; token: string };

function tokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URL(window.location.href).searchParams.get('token');
}

async function fetchPreview(token: string): Promise<State> {
  const res = await fetch(`/api/v1/onboard/preview?token=${encodeURIComponent(token)}`);
  if (res.status === 410) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { phase: 'gone', message: body.message ?? 'invite_invalid' };
  }
  if (!res.ok) {
    return { phase: 'gone', message: 'invite_invalid' };
  }
  const preview = (await res.json()) as InvitePreview;
  return { phase: 'ready', preview, token };
}

export default function OnboardingForm(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [password, setPassword] = useState('');
  const [aupAccepted, setAupAccepted] = useState(false);

  useEffect(() => {
    const token = tokenFromUrl();
    if (!token) {
      setState({ phase: 'gone', message: 'token_required' });
      return;
    }
    fetchPreview(token).then(setState);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (state.phase !== 'ready') return;
    if (password.length < 12) {
      setState({ ...state, phase: 'error', message: 'password_too_short' as string });
      return;
    }
    if (!aupAccepted) {
      setState({ ...state, phase: 'error', message: 'aup_not_accepted' });
      return;
    }
    setState({ ...state, phase: 'submitting' });
    const res = await fetch('/api/v1/onboard/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: state.token, password, aup_accepted: true }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setState({ ...state, phase: 'error', message: body.message ?? 'unknown_error' });
      return;
    }
    setState({ phase: 'done' });
    setTimeout(() => {
      window.location.href = '/workspace';
    }, 1500);
  }

  if (state.phase === 'loading') {
    return <p style={{ textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</p>;
  }

  if (state.phase === 'gone') {
    return (
      <div style={panelStyle()}>
        <h1 style={h1Style()}>This link can't be used.</h1>
        <p style={pMuted()}>
          The invite has been used, revoked, or expired (<code>{state.message}</code>). Ask your
          admin for a fresh link.
        </p>
      </div>
    );
  }

  if (state.phase === 'done') {
    return (
      <div style={panelStyle()}>
        <h1 style={h1Style()}>Welcome aboard.</h1>
        <p style={pMuted()}>Your account is active. Redirecting to /workspace…</p>
      </div>
    );
  }

  const { preview } = state;
  const submitting = state.phase === 'submitting';
  const errorMessage = state.phase === 'error' ? state.message : null;

  return (
    <form onSubmit={onSubmit} style={panelStyle()}>
      <h1 style={h1Style()}>Welcome, {preview.display_name ?? preview.email.split('@')[0]}.</h1>
      <p style={pMuted()}>
        You're being added as <strong>{preview.role_groups.join(', ')}</strong>
        {preview.country ? ` for ${preview.country.toUpperCase()}` : ''}. Set your password and
        accept the operator agreement to continue.
      </p>

      <label style={labelStyle()}>
        <span>Email</span>
        <input type="email" value={preview.email} readOnly style={inputStyle({ readOnly: true })} />
      </label>

      <label style={labelStyle()}>
        <span>Set password (min 12 characters)</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
          style={inputStyle()}
        />
      </label>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 14,
          margin: '12px 0',
        }}
      >
        <input
          type="checkbox"
          checked={aupAccepted}
          onChange={(e) => setAupAccepted(e.target.checked)}
          required
          style={{ marginTop: 2 }}
        />
        <span>
          I have read and accept the{' '}
          <a href="/policies/aup-v0" target="_blank" rel="noopener noreferrer">
            operator agreement
          </a>{' '}
          ({preview.aup_version}).
        </span>
      </label>

      {errorMessage && (
        <p style={{ color: 'var(--destructive)', fontSize: 14 }}>
          <code>{errorMessage}</code>
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 16 }}
      >
        {submitting ? 'Activating…' : 'Activate account'}
      </button>
    </form>
  );
}

function panelStyle(): React.CSSProperties {
  return {
    padding: 40,
    border: '1px solid var(--border)',
    borderRadius: 16,
    background: 'var(--card)',
  };
}

function h1Style(): React.CSSProperties {
  return {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 28,
    margin: '0 0 12px',
  };
}

function pMuted(): React.CSSProperties {
  return { fontSize: 15, color: 'var(--muted-foreground)', margin: '0 0 24px' };
}

function labelStyle(): React.CSSProperties {
  return { display: 'block', fontSize: 14, margin: '12px 0' };
}

function inputStyle({ readOnly = false }: { readOnly?: boolean } = {}): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: 10,
    fontSize: 14,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: readOnly ? 'var(--muted)' : 'var(--background)',
    color: 'var(--foreground)',
    marginTop: 4,
  };
}
