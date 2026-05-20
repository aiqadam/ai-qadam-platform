import { type ReactElement, useEffect, useState } from 'react';

// /workspace — the single landing surface for operators, per ADR-0032
// ("operator-facing tools must SSO via Authentik or embed in workspace").
//
// Placeholder RBAC: this shell ships before ADR-0021 (RBAC manifest) is
// Accepted and before S2.2 (RBAC sync service) lands. Until then the
// only gate is "is logged in" (authenticated against Authentik). The
// role-aware sidebar + cabinet routing arrives when those land — this
// component is structured so adding role gates is a per-card change,
// not a rewrite.
//
// Auth bootstrap is the same pattern as MeDashboard.tsx — refresh
// cookie → access token → /v1/auth/me. Anon viewers see a sign-in
// prompt, not a 401.

interface Me {
  id: string;
  email: string;
  authentikSubject: string;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; me: Me }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  try {
    const refresh = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!refresh.ok) return { phase: 'anon' };
    const { accessToken } = (await refresh.json()) as { accessToken: string };

    const meRes = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) return { phase: 'anon' };
    const me = (await meRes.json()) as Me;
    return { phase: 'authed', me };
  } catch (err) {
    return {
      phase: 'error',
      message: err instanceof Error ? err.message : 'bootstrap failed',
    };
  }
}

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

export default function Workspace(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    void bootstrap().then(setState);
  }, []);

  if (state.phase === 'loading') {
    return <ShellFrame title="Workspace">{<Loading />}</ShellFrame>;
  }

  if (state.phase === 'error') {
    return (
      <ShellFrame title="Workspace">
        <ErrorState message={state.message} />
      </ShellFrame>
    );
  }

  if (state.phase === 'anon') {
    return (
      <ShellFrame title="Workspace">
        <AnonGate />
      </ShellFrame>
    );
  }

  return (
    <ShellFrame title="Workspace" userEmail={state.me.email}>
      <AuthedShell email={state.me.email} />
    </ShellFrame>
  );
}

interface ShellFrameProps {
  title: string;
  userEmail?: string;
  children: ReactElement;
}

function ShellFrame({ title, userEmail, children }: ShellFrameProps): ReactElement {
  return (
    <div
      style={{ display: 'flex', minHeight: 'calc(100vh - 56px)', background: 'var(--background)' }}
    >
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: 0,
            padding: '0 8px 12px',
          }}
        >
          {title}
        </p>
        <SidebarLink href="/workspace" label="Dashboard" />
        {/* Per-role cabinet links land here when S2.2 RBAC sync ships;
            until then we expose only the launcher + dashboard. */}
        <div style={{ flex: 1 }} />
        {userEmail && (
          <p
            style={{
              fontSize: 12,
              color: 'var(--muted-foreground)',
              padding: '0 8px',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {userEmail}
          </p>
        )}
      </aside>
      <main style={{ flex: 1, padding: '32px 48px', maxWidth: 1180 }}>{children}</main>
    </div>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }): ReactElement {
  const active = typeof window !== 'undefined' && window.location.pathname === href;
  return (
    <a
      href={href}
      style={{
        padding: '8px 12px',
        borderRadius: 6,
        textDecoration: 'none',
        color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
        background: active ? 'var(--card)' : 'transparent',
        fontSize: 14,
        fontWeight: active ? 500 : 400,
      }}
    >
      {label}
    </a>
  );
}

function Loading(): ReactElement {
  return <p style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>Loading workspace…</p>;
}

function ErrorState({ message }: { message: string }): ReactElement {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 12px' }}>
        Workspace unavailable
      </h1>
      <p style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>{message}</p>
    </div>
  );
}

function AnonGate(): ReactElement {
  return (
    <div style={{ maxWidth: 520 }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          margin: '0 0 12px',
          letterSpacing: '-0.01em',
        }}
      >
        Workspace
      </h1>
      <p
        style={{
          color: 'var(--muted-foreground)',
          fontSize: 15,
          lineHeight: 1.6,
          margin: '0 0 24px',
        }}
      >
        Single landing for AI Qadam operators — admins, sponsors, country leads, and speakers. Sign
        in with your Authentik account to continue.
      </p>
      <a
        href={signInUrl()}
        className="btn btn-primary"
        style={{ textDecoration: 'none', display: 'inline-block' }}
      >
        Sign in
      </a>
    </div>
  );
}

function AuthedShell({ email }: { email: string }): ReactElement {
  return (
    <div>
      <header style={{ marginBottom: 32 }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: '0 0 6px',
          }}
        >
          Signed in as {email}
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          Workspace
        </h1>
      </header>

      <section
        style={{
          padding: 24,
          border: '1px dashed var(--border)',
          borderRadius: 12,
          background: 'var(--card)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: '0 0 8px',
          }}
        >
          Coming next
        </p>
        <p style={{ margin: '0 0 4px', fontSize: 14 }}>
          App launcher with cards for the tools you can access.
        </p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted-foreground)' }}>
          Per-role gates land when{' '}
          <a href="/docs/adr/0021-rbac-manifest" style={{ color: 'var(--primary)' }}>
            ADR-0021
          </a>{' '}
          is Accepted and Sprint 2.2 RBAC sync ships. Until then everyone sees the same dashboard.
        </p>
      </section>
    </div>
  );
}
