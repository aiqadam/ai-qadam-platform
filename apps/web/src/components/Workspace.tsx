import { type ReactElement, useEffect, useState } from 'react';
import { type AuthMe, getAuthState } from '../lib/auth-bootstrap';
import AppLauncher from './AppLauncher';

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
// 2026-05-25: switched from a private bootstrap fetch to the shared
// `getAuthState()` helper. The private fetch raced NavAccountMenu's
// /auth/refresh call on the same page — the loser's refresh-token-
// replay trip revoked the entire refresh family and cleared the cookie
// mid-render, producing a "Nav says Sign in, body says signed-in as X"
// inconsistency plus a cross-user RBAC leak window. The shared helper
// reads the SSR-injected `window.__AIQADAM_AUTH__` blob first (zero
// round-trips) and dedupes any fallback /refresh through a module-level
// in-flight Promise.

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; me: AuthMe }
  | { phase: 'error'; message: string };

async function bootstrap(): Promise<State> {
  try {
    const auth = await getAuthState();
    if (!auth) return { phase: 'anon' };
    return { phase: 'authed', me: auth.me };
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

  // Anon viewers auto-redirect to Authentik immediately — no
  // intermediate "Sign in" button click. The workspace IS the operator
  // surface (ADR-0032) so any anon visit IS an intent to sign in.
  // Effect runs whenever state transitions to 'anon'; useEffect's
  // dependency tracking handles re-renders without re-redirecting.
  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  if (state.phase === 'loading' || state.phase === 'anon') {
    // 'anon' shows the same loading frame for the split second before
    // the redirect fires — no flash of a sign-in CTA the user might
    // try to interact with.
    return <ShellFrame title="Workspace">{<Loading />}</ShellFrame>;
  }

  if (state.phase === 'error') {
    return (
      <ShellFrame title="Workspace">
        <ErrorState message={state.message} />
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
        <SidebarLink href="/workspace/members" label="Members" />
        <SidebarLink href="/workspace/announce" label="Announce" />
        <SidebarLink href="/workspace/events" label="Events" />
        <SidebarLink href="/workspace/approvals" label="Approvals" />
        {/* Per-role cabinet links visible to everyone until S2.2 RBAC sync
            adds per-role gates. */}
        <SidebarSectionLabel label="Integrations" />
        <SidebarLink href="/workspace/integrations/telegram" label="Telegram" />
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

// Section divider for the sidebar. First introduced for Integrations →
// Telegram (F-R3.0). Future per-section integration cards (Discord,
// WhatsApp, …) sit under the same label.
function SidebarSectionLabel({ label }: { label: string }): ReactElement {
  return (
    <p
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--muted-foreground)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        margin: '12px 0 4px',
        padding: '0 12px',
      }}
    >
      {label}
    </p>
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

      <AppLauncher />
    </div>
  );
}
