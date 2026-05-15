import { type ReactElement, useEffect, useState } from 'react';

// Minimal client-side auth island. On mount: POST /api/v1/auth/refresh with
// the __Host- cookie (same-origin via Vite proxy in dev / Caddy in prod), get
// an access token, fetch /api/v1/auth/me, render either the user info or a
// sign-in prompt. ADR-0016 mentions an SSR optimization (Astro middleware
// running the refresh server-side) — that's a follow-up, this version
// accepts the brief loading flash on first render.

interface Me {
  id: string;
  email: string;
  authentikSubject: string;
}

type State = { status: 'loading' } | { status: 'authed'; me: Me } | { status: 'anon' };

async function loadSession(): Promise<State> {
  const refreshRes = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!refreshRes.ok) return { status: 'anon' };
  const { accessToken } = (await refreshRes.json()) as { accessToken: string };

  const meRes = await fetch('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) return { status: 'anon' };
  const me = (await meRes.json()) as Me;
  return { status: 'authed', me };
}

function signOut(): void {
  // Top-level navigation: API revokes our session, then 302s to Authentik's
  // end_session_endpoint, which 302s back to WEB_BASE_URL.
  window.location.href = '/api/v1/auth/logout';
}

export function AuthGate(): ReactElement {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadSession()
      .catch((): State => ({ status: 'anon' }))
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return <p className="text-gray-500">Loading…</p>;
  }
  if (state.status === 'anon') {
    return (
      <div className="space-y-3">
        <p className="text-gray-700">You're not signed in.</p>
        <a
          href="/api/v1/auth/login"
          className="inline-block rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          Sign in with Authentik
        </a>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-gray-700">
        Signed in as <strong>{state.me.email}</strong>
      </p>
      <p className="text-xs text-gray-500">User id: {state.me.id}</p>
      <button
        type="button"
        onClick={signOut}
        className="inline-block rounded border border-gray-300 px-4 py-2 text-gray-800 hover:bg-gray-100"
      >
        Sign out
      </button>
    </div>
  );
}
