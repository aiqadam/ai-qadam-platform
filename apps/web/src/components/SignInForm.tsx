import { type FormEvent, type ReactElement, useState } from 'react';

// AI Qadam sign-in form. POSTs email + password to /v1/auth/sign-in.
// On success the API sets the cross-subdomain refresh cookie and
// returns the user + access token; we then redirect to the `next`
// URL (validated server-side to be same-origin) or `/` by default.
//
// The access token isn't persisted client-side here — the page that
// follows calls /v1/auth/refresh on first render and mints a fresh
// access token from the cookie.

interface SignInResponse {
  user: { id: string; email: string; displayName: string | null };
  accessToken: string;
  expiresIn: number;
}

interface Props {
  next: string;
}

export function SignInForm({ next }: Props): ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/sign-in', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          setError('Wrong email or password. Try again.');
        } else if (res.status === 400) {
          setError('Email and password are required.');
        } else {
          setError(`Sign-in failed (HTTP ${res.status}).`);
        }
        return;
      }
      const body = (await res.json()) as SignInResponse;
      // Sanity: refuse to redirect off-origin even if `next` is tampered
      // client-side. Same-origin paths only.
      const target = next.startsWith('/') && !next.startsWith('//') ? next : '/';
      window.location.href = target;
      // body.accessToken is unused on this page — next page's island calls
      // /auth/refresh which mints a fresh one from the cookie.
      void body;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sign-in failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={eyebrow}>Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={input}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={eyebrow}>Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={input}
        />
      </label>
      {error && (
        <div
          style={{
            padding: '10px 12px',
            border: '1px solid color-mix(in oklch, oklch(0.6 0.18 25) 50%, var(--border))',
            background: 'color-mix(in oklch, oklch(0.6 0.18 25) 8%, transparent)',
            borderRadius: 8,
            fontSize: 13,
            color: 'oklch(0.6 0.18 25)',
          }}
        >
          {error}
        </div>
      )}
      <button
        type="submit"
        className="btn btn-primary btn-lg"
        disabled={submitting}
        style={{ marginTop: 6 }}
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--muted-foreground)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--card)',
  color: 'var(--foreground)',
  fontSize: 15,
};
