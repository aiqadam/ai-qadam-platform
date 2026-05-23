import { type FormEvent, type ReactElement, useEffect, useState } from 'react';

// F-S2.7 + F-S2.8.2 — invitee onboarding form, full self-service flow.
//
// Steps:
//   1. preview invite (existing F-S2.7) — render email + role + AUP version
//   2. password + AUP (existing F-S2.7) — POST /v1/onboard/accept
//   3. destination Gmail input (F-S2.8.2) — POST /v1/onboard/email-routing/destination
//      → CF sends operator a verification email
//   4. polling spinner (F-S2.8.2) — GET /v1/onboard/email-routing/status every 8s
//      until destination_verified=true or 5min timeout
//   5. finalize (F-S2.8.2) — POST /v1/onboard/email-routing/finalize
//      → returns Resend API key plaintext ONCE
//   6. Resend key reveal + Gmail Send-as instructions (F-S2.8.2)
//   7. button → /workspace
//
// 410 Gone on preview at step 1 = expired/consumed/revoked/invalid;
// nothing rendered past the "this link can't be used" message.
//
// Operator's token is the credential for all email-routing endpoints —
// no separate auth.

interface InvitePreview {
  email: string;
  display_name: string | null;
  role_groups: string[];
  country: string | null;
  expires_at: string;
  aup_version: string;
}

interface EmailRoutingStatus {
  email_setup_status: 'not_started' | 'destination_pending' | 'ready' | 'failed';
  destination_gmail: string | null;
  destination_verified: boolean;
  cf_rule_id: string | null;
  email_setup_failed_reason: string | null;
}

type State =
  | { phase: 'loading' }
  | { phase: 'gone'; message: string }
  | { phase: 'auth_ready'; preview: InvitePreview; token: string }
  | { phase: 'auth_submitting'; preview: InvitePreview; token: string }
  | { phase: 'auth_error'; preview: InvitePreview; token: string; message: string }
  | { phase: 'email_intro'; preview: InvitePreview; token: string }
  | { phase: 'email_submitting'; preview: InvitePreview; token: string; destination: string }
  | {
      phase: 'email_pending';
      preview: InvitePreview;
      token: string;
      destination: string;
      pollCount: number;
      pollLastAt: number;
    }
  | { phase: 'email_finalizing'; preview: InvitePreview; token: string; destination: string }
  | {
      phase: 'email_ready';
      preview: InvitePreview;
      token: string;
      destination: string;
      resendKeyPlaintext: string;
    }
  | {
      phase: 'email_failed';
      preview: InvitePreview;
      token: string;
      destination: string;
      message: string;
    };

const POLL_INTERVAL_MS = 8000;
const POLL_MAX_ATTEMPTS = 38; // ~5 min
const PASSWORD_MIN = 12;

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
  const [destinationDraft, setDestinationDraft] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    const token = tokenFromUrl();
    if (!token) {
      setState({ phase: 'gone', message: 'token_required' });
      return;
    }
    fetchPreview(token).then(setState);
  }, []);

  // F-S2.8.2 — poll the status endpoint while destination_pending.
  // Cleans up automatically when state phase changes (effect re-runs)
  // OR component unmounts.
  useEffect(() => {
    if (state.phase !== 'email_pending') return;
    if (state.pollCount >= POLL_MAX_ATTEMPTS) {
      setState({
        phase: 'email_failed',
        preview: state.preview,
        token: state.token,
        destination: state.destination,
        message: 'verification_timeout',
      });
      return;
    }
    const { token } = state;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch(
          `/api/v1/onboard/email-routing/status?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as EmailRoutingStatus;
        if (cancelled) return;
        if (body.destination_verified) {
          setState((s) => (s.phase === 'email_pending' ? { ...s, phase: 'email_finalizing' } : s));
          return;
        }
        setState((s) =>
          s.phase === 'email_pending'
            ? { ...s, pollCount: s.pollCount + 1, pollLastAt: Date.now() }
            : s,
        );
      } catch {
        // soft-fail — try again next tick
      }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state]);

  // F-S2.8.2 — call finalize as soon as we transition to email_finalizing.
  useEffect(() => {
    if (state.phase !== 'email_finalizing') return;
    const { token, preview, destination } = state;
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/v1/onboard/email-routing/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (cancelled) return;
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setState({
          phase: 'email_failed',
          preview,
          token,
          destination,
          message: body.message ?? 'finalize_failed',
        });
        return;
      }
      const body = (await res.json()) as { resend_key_plaintext: string };
      setState({
        phase: 'email_ready',
        preview,
        token,
        destination,
        resendKeyPlaintext: body.resend_key_plaintext,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

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
          setState({ phase: 'email_intro', preview: state.preview, token: state.token });
        }}
      />
    );
  }

  if (state.phase === 'email_intro' || state.phase === 'email_submitting') {
    return (
      <DestinationStep
        preview={state.preview}
        destination={destinationDraft}
        setDestination={setDestinationDraft}
        submitting={state.phase === 'email_submitting'}
        onSubmit={async (e) => {
          e.preventDefault();
          if (state.phase !== 'email_intro') return;
          const dest = destinationDraft.trim().toLowerCase();
          if (!dest.includes('@')) return;
          setState({
            phase: 'email_submitting',
            preview: state.preview,
            token: state.token,
            destination: dest,
          });
          const res = await fetch('/api/v1/onboard/email-routing/destination', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token: state.token, destination_gmail: dest }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { message?: string };
            setState({
              phase: 'email_failed',
              preview: state.preview,
              token: state.token,
              destination: dest,
              message: body.message ?? 'destination_submit_failed',
            });
            return;
          }
          const body = (await res.json()) as { verified: boolean };
          if (body.verified) {
            // Destination was already verified (e.g. operator re-used one)
            // → skip polling and finalize immediately.
            setState({
              phase: 'email_finalizing',
              preview: state.preview,
              token: state.token,
              destination: dest,
            });
          } else {
            setState({
              phase: 'email_pending',
              preview: state.preview,
              token: state.token,
              destination: dest,
              pollCount: 0,
              pollLastAt: Date.now(),
            });
          }
        }}
      />
    );
  }

  if (state.phase === 'email_pending') {
    return (
      <PendingStep
        destination={state.destination}
        pollCount={state.pollCount}
        pollLastAt={state.pollLastAt}
      />
    );
  }

  if (state.phase === 'email_finalizing') {
    return (
      <div style={panelStyle()}>
        <StepHeader step={3} />
        <h1 style={h1Style()}>Finishing setup…</h1>
        <p style={pMuted()}>Creating your forwarding rule and minting your sending key.</p>
        <Spinner />
      </div>
    );
  }

  if (state.phase === 'email_ready') {
    return (
      <ReadyStep
        preview={state.preview}
        destination={state.destination}
        resendKey={state.resendKeyPlaintext}
        copied={keyCopied}
        onCopyKey={async () => {
          await navigator.clipboard.writeText(state.resendKeyPlaintext);
          setKeyCopied(true);
          setTimeout(() => setKeyCopied(false), 2000);
        }}
      />
    );
  }

  if (state.phase === 'email_failed') {
    return (
      <FailedStep
        message={state.message}
        onRetry={() => {
          setState({ phase: 'email_intro', preview: state.preview, token: state.token });
        }}
        onSkip={() => {
          window.location.href = '/workspace';
        }}
      />
    );
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

function StepHeader({ step }: { step: 1 | 2 | 3 }): ReactElement {
  const labels = ['Sign in', 'Forwarding', 'Sending'];
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
        {submitting ? 'Activating…' : 'Continue → email setup'}
      </button>
    </form>
  );
}

interface DestinationStepProps {
  preview: InvitePreview;
  destination: string;
  setDestination: (v: string) => void;
  submitting: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}
function DestinationStep(p: DestinationStepProps): ReactElement {
  return (
    <form onSubmit={p.onSubmit} style={panelStyle()}>
      <StepHeader step={2} />
      <h1 style={h1Style()}>Where should we forward your AI Qadam email?</h1>
      <p style={pMuted()}>
        Mail sent to <strong>{p.preview.email}</strong> will be forwarded to the personal address
        you enter here. Cloudflare will send you a one-click verification email to confirm.
      </p>
      <label style={labelStyle()}>
        <span>Your personal email (Gmail recommended)</span>
        <input
          type="email"
          value={p.destination}
          onChange={(e) => p.setDestination(e.target.value)}
          required
          maxLength={254}
          autoComplete="email"
          placeholder="you@gmail.com"
          style={inputStyle()}
        />
      </label>
      <button
        type="submit"
        disabled={p.submitting || !p.destination.includes('@')}
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 16 }}
      >
        {p.submitting ? 'Provisioning…' : 'Send me the verification email'}
      </button>
    </form>
  );
}

function PendingStep({
  destination,
  pollCount,
  pollLastAt,
}: {
  destination: string;
  pollCount: number;
  pollLastAt: number;
}): ReactElement {
  const elapsedSec = Math.floor((Date.now() - pollLastAt) / 1000);
  return (
    <div style={panelStyle()}>
      <StepHeader step={2} />
      <h1 style={h1Style()}>Check your inbox.</h1>
      <p style={pMuted()}>
        Cloudflare just sent a verification email to <strong>{destination}</strong>. Open it and
        click <strong>Verify email address</strong>. This page auto-advances the moment they confirm
        — no need to refresh.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
        <Spinner />
        <span style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
          Waiting for verification… (checked {pollCount} time{pollCount === 1 ? '' : 's'}; last ~
          {elapsedSec}s ago)
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
        Email not arriving? Check spam. Sender is <code>noreply@notify.cloudflare.com</code>. If
        nothing within 2 minutes, ping your admin to check Cloudflare → Routing → Activity log.
      </p>
    </div>
  );
}

function Spinner(): ReactElement {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 18,
        height: 18,
        border: '2px solid var(--muted)',
        borderTopColor: 'var(--accent, #10b981)',
        borderRadius: '50%',
        animation: 'aiqadam-spin 0.9s linear infinite',
      }}
    />
  );
}

function ReadyStep({
  preview,
  destination,
  resendKey,
  copied,
  onCopyKey,
}: {
  preview: InvitePreview;
  destination: string;
  resendKey: string;
  copied: boolean;
  onCopyKey: () => void;
}): ReactElement {
  return (
    <div style={panelStyle()}>
      <StepHeader step={3} />
      <h1 style={{ ...h1Style(), color: 'var(--accent, #10b981)' }}>
        ✓ Forwarding live. One last step.
      </h1>
      <p style={pMuted()}>
        Mail to <strong>{preview.email}</strong> now lands in <strong>{destination}</strong>. To
        send mail FROM <strong>{preview.email}</strong> in Gmail, finish the Send-as setup below.
      </p>

      <h2 style={h2Style()}>Your Resend API key (shown ONCE)</h2>
      <p style={pMuted()}>
        Paste this into Gmail's SMTP config in step 4 below. You will NOT see it again — save it in
        your password manager now.
      </p>
      <div style={codeBlockStyle()}>{resendKey}</div>
      <button type="button" className="btn" onClick={onCopyKey} style={{ marginBottom: 24 }}>
        {copied ? '✓ Copied' : 'Copy key'}
      </button>

      <h2 style={h2Style()}>Gmail Send-as setup (10 min, one-time)</h2>
      <ol style={olStyle()}>
        <li>
          In Gmail (the one you forwarded to):{' '}
          <strong>Settings ⚙ → See all settings → Accounts and Import</strong>.
        </li>
        <li>
          Under <strong>Send mail as</strong>, click <strong>Add another email address</strong>.
        </li>
        <li>
          First popup: <strong>Name</strong> = your name, <strong>Email</strong> ={' '}
          <code>{preview.email}</code>, <strong>UNCHECK "Treat as alias"</strong>. Click{' '}
          <strong>Next Step</strong>.
        </li>
        <li>
          Second popup (SMTP):
          <table style={tableStyle()}>
            <tbody>
              <tr>
                <td>SMTP Server</td>
                <td>
                  <code>smtp.resend.com</code>
                </td>
              </tr>
              <tr>
                <td>Port</td>
                <td>
                  <code>587</code>
                </td>
              </tr>
              <tr>
                <td>Username</td>
                <td>
                  <code>resend</code>
                </td>
              </tr>
              <tr>
                <td>Password</td>
                <td>(paste the Resend key you just copied)</td>
              </tr>
              <tr>
                <td>Secured connection</td>
                <td>
                  <strong>TLS</strong> (radio button — not SSL)
                </td>
              </tr>
            </tbody>
          </table>
          Click <strong>Add Account</strong>.
        </li>
        <li>
          Gmail sends a verification code to <code>{preview.email}</code> — which forwards back to{' '}
          <code>{destination}</code>. Click the link in that email (or paste the 9-digit code).
        </li>
        <li>
          Back in <strong>Accounts and Import</strong>, find{' '}
          <strong>When replying to a message</strong> and select{' '}
          <strong>Reply from the same address the message was sent to</strong>.
        </li>
      </ol>

      <p style={pMuted()}>
        Full troubleshooting + screenshots-by-words:{' '}
        <a
          href="https://github.com/viktordrukker/aiqadam/blob/main/docs/runbooks/operator-email-send-as.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          docs/runbooks/operator-email-send-as.md
        </a>
        .
      </p>

      <a className="btn btn-primary" href="/workspace" style={{ marginTop: 16 }}>
        Go to /workspace →
      </a>
    </div>
  );
}

function FailedStep({
  message,
  onRetry,
  onSkip,
}: {
  message: string;
  onRetry: () => void;
  onSkip: () => void;
}): ReactElement {
  return (
    <div style={panelStyle()}>
      <h1 style={{ ...h1Style(), color: 'var(--destructive)' }}>Email setup hit a snag.</h1>
      <p style={pMuted()}>
        We couldn't finish setting up your forwarding (<code>{message}</code>). Your account is
        still active — you can sign in and try again, or ping your admin.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="btn" onClick={onSkip}>
          Skip — go to /workspace
        </button>
      </div>
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
function codeBlockStyle(): React.CSSProperties {
  return {
    padding: 12,
    background: 'var(--muted)',
    borderRadius: 8,
    wordBreak: 'break-all',
    fontFamily: 'monospace',
    fontSize: 13,
    margin: '12px 0',
  };
}
function olStyle(): React.CSSProperties {
  return { paddingLeft: 22, margin: '0 0 16px', fontSize: 14, lineHeight: 1.7 };
}
function tableStyle(): React.CSSProperties {
  return {
    width: '100%',
    margin: '8px 0',
    fontSize: 13,
    borderCollapse: 'collapse',
  };
}
