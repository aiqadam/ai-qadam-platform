import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

// F-S2.7 + F-S2.12 — invitee onboarding form, post-DMS cutover.
//
// Steps:
//   1. preview invite (F-S2.7) — render email + role + AUP version
//   2. password + AUP (F-S2.7) — POST /v1/onboard/accept
//   3. mailbox-ready terminal screen (F-S2.12) — show the operator
//      their @aiqadam.org mailbox + webmail URL + IMAP/SMTP settings.
//      The DMS/LDAP backend (F-S2.12 mailserver) already provisioned
//      the mailbox at the moment the Authentik password was set; no
//      additional API call is needed.
//
// The pre-F-S2.12 phases (`email_intro` / `email_submitting` /
// `email_pending` / `email_finalizing` / `email_ready` / `email_failed`)
// drove the Cloudflare-forwarding + Resend-sub-key flow. They were
// deleted with that flow.
//
// 410 Gone on preview at step 1 = expired/consumed/revoked/invalid;
// nothing rendered past the "this link can't be used" message.

interface InvitePreview {
  email: string;
  display_name: string | null;
  role_groups: string[];
  country: string | null;
  expires_at: string;
  aup_version: string;
  // F-S2.12: deterministic mailbox local-part, derived server-side
  // from the invite email (see usernameFromEmail in admin-invites
  // service). The form trusts the server value rather than rederiving
  // it client-side so the two can never drift.
  username: string;
}

type State =
  | { phase: 'loading' }
  | { phase: 'gone'; message: string }
  | { phase: 'auth_ready'; preview: InvitePreview; token: string }
  | { phase: 'auth_submitting'; preview: InvitePreview; token: string }
  | { phase: 'auth_error'; preview: InvitePreview; token: string; message: string }
  | { phase: 'mailbox_ready'; preview: InvitePreview };

const PASSWORD_MIN = 12;
const WEBMAIL_URL = 'https://webmail.aiqadam.org/';
const MAIL_HOST = 'mail.aiqadam.org';
const IMAP_PORT = 993;
const SMTP_PORT = 465;

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
  if (!res.ok) return { phase: 'gone', message: 'invite_invalid' };
  const preview = (await res.json()) as InvitePreview;
  return { phase: 'auth_ready', preview, token };
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

  if (state.phase === 'loading') return <Loading />;
  if (state.phase === 'gone') return <GonePanel message={state.message} />;

  if (
    state.phase === 'auth_ready' ||
    state.phase === 'auth_submitting' ||
    state.phase === 'auth_error'
  ) {
    return (
      <AuthStep
        state={state}
        password={password}
        setPassword={setPassword}
        aupAccepted={aupAccepted}
        setAupAccepted={setAupAccepted}
        onSubmit={async (e) => {
          e.preventDefault();
          if (state.phase !== 'auth_ready') return;
          if (password.length < PASSWORD_MIN) {
            setState({ ...state, phase: 'auth_error', message: 'password_too_short' });
            return;
          }
          if (!aupAccepted) {
            setState({ ...state, phase: 'auth_error', message: 'aup_not_accepted' });
            return;
          }
          setState({ ...state, phase: 'auth_submitting' });
          const res = await fetch('/api/v1/onboard/accept', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: state.token, password, aup_accepted: true }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { message?: string };
            setState({
              ...state,
              phase: 'auth_error',
              message: body.message ?? 'unknown_error',
            });
            return;
          }
          setState({ phase: 'mailbox_ready', preview: state.preview });
        }}
      />
    );
  }

  if (state.phase === 'mailbox_ready') {
    return <MailboxReadyStep preview={state.preview} />;
  }

  return <Loading />;
}

// ─────────────────────────── presentational ────────────────────────────

function Loading(): ReactElement {
  return <p style={{ textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</p>;
}

function GonePanel({ message }: { message: string }): ReactElement {
  return (
    <div style={panelStyle()}>
      <h1 style={h1Style()}>This link can't be used.</h1>
      <p style={pMuted()}>
        The invite has been used, revoked, or expired (<code>{message}</code>). Ask your admin for a
        fresh link.
      </p>
    </div>
  );
}

function StepHeader({ step }: { step: 1 | 2 }): ReactElement {
  const labels = ['Sign in', 'Your mailbox'];
  return (
    <div style={{ display: 'flex', gap: 8, margin: '0 0 16px', fontSize: 12 }}>
      {labels.map((label, i) => (
        <span
          key={label}
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            background: i + 1 === step ? 'var(--accent, #10b981)' : 'var(--muted)',
            color: i + 1 === step ? '#fff' : 'var(--muted-foreground)',
            fontWeight: i + 1 === step ? 600 : 400,
          }}
        >
          {i + 1}. {label}
        </span>
      ))}
    </div>
  );
}

interface AuthStepProps {
  state:
    | { phase: 'auth_ready'; preview: InvitePreview; token: string }
    | { phase: 'auth_submitting'; preview: InvitePreview; token: string }
    | { phase: 'auth_error'; preview: InvitePreview; token: string; message: string };
  password: string;
  setPassword: (v: string) => void;
  aupAccepted: boolean;
  setAupAccepted: (v: boolean) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}
function AuthStep(p: AuthStepProps): ReactElement {
  const submitting = p.state.phase === 'auth_submitting';
  const errorMessage = p.state.phase === 'auth_error' ? p.state.message : null;
  const { preview } = p.state;
  return (
    <form onSubmit={p.onSubmit} style={panelStyle()}>
      <StepHeader step={1} />
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
          value={p.password}
          onChange={(e) => p.setPassword(e.target.value)}
          required
          minLength={PASSWORD_MIN}
          maxLength={256}
          autoComplete="new-password"
          style={inputStyle()}
        />
      </label>
      <label style={checkboxLabelStyle()}>
        <input
          type="checkbox"
          checked={p.aupAccepted}
          onChange={(e) => p.setAupAccepted(e.target.checked)}
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
        {submitting ? 'Activating…' : 'Continue → your mailbox'}
      </button>
    </form>
  );
}

function MailboxReadyStep({ preview }: { preview: InvitePreview }): ReactElement {
  const mailbox = `${preview.username}@aiqadam.org`;
  return (
    <div style={panelStyle()}>
      <StepHeader step={2} />
      <h1 style={{ ...h1Style(), color: 'var(--accent, #10b981)' }}>
        ✓ Your AI Qadam mailbox is ready.
      </h1>
      <p style={pMuted()}>
        Sign in at <strong>{WEBMAIL_URL}</strong> with the email and password below to read and send
        mail from your new <code>@aiqadam.org</code> address.
      </p>

      <h2 style={h2Style()}>Webmail</h2>
      <table style={tableStyle()}>
        <tbody>
          <tr>
            <td>URL</td>
            <td>
              <a href={WEBMAIL_URL} target="_blank" rel="noopener noreferrer">
                <code>{WEBMAIL_URL}</code>
              </a>
            </td>
          </tr>
          <tr>
            <td>Email</td>
            <td>
              <code>{mailbox}</code>
            </td>
          </tr>
          <tr>
            <td>Password</td>
            <td>The same one you just set.</td>
          </tr>
        </tbody>
      </table>

      <h2 style={h2Style()}>Mobile / desktop mail client (optional)</h2>
      <p style={pMuted()}>
        Apple Mail, Outlook, Thunderbird, and the iOS/Android Gmail apps all support IMAP/SMTP. Use
        these settings:
      </p>
      <table style={tableStyle()}>
        <tbody>
          <tr>
            <td>Username</td>
            <td>
              <code>{mailbox}</code>
            </td>
          </tr>
          <tr>
            <td>Password</td>
            <td>The same one you just set.</td>
          </tr>
          <tr>
            <td>IMAP server</td>
            <td>
              <code>
                {MAIL_HOST}:{IMAP_PORT}
              </code>{' '}
              (SSL/TLS)
            </td>
          </tr>
          <tr>
            <td>SMTP server</td>
            <td>
              <code>
                {MAIL_HOST}:{SMTP_PORT}
              </code>{' '}
              (SSL/TLS)
            </td>
          </tr>
        </tbody>
      </table>

      <a className="btn btn-primary" href="/workspace" style={{ marginTop: 16 }}>
        Go to /workspace →
      </a>
    </div>
  );
}

// ─────────────────────────── styles ────────────────────────────

function panelStyle(): React.CSSProperties {
  return {
    padding: 40,
    border: '1px solid var(--border)',
    borderRadius: 16,
    background: 'var(--card)',
  };
}
function h1Style(): React.CSSProperties {
  return { fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 28, margin: '0 0 12px' };
}
function h2Style(): React.CSSProperties {
  return {
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    fontSize: 18,
    margin: '24px 0 8px',
  };
}
function pMuted(): React.CSSProperties {
  return { fontSize: 15, color: 'var(--muted-foreground)', margin: '0 0 24px', lineHeight: 1.55 };
}
function labelStyle(): React.CSSProperties {
  return { display: 'block', fontSize: 14, margin: '12px 0' };
}
function checkboxLabelStyle(): React.CSSProperties {
  return { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, margin: '12px 0' };
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
function tableStyle(): React.CSSProperties {
  return {
    width: '100%',
    margin: '8px 0 16px',
    fontSize: 13,
    borderCollapse: 'collapse',
  };
}
