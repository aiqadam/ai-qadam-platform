import { type ReactElement, type ReactNode, useEffect, useState } from 'react';

// F-S3.7 — operator approval queue (empty-shell v1).
//
// Cabinet renders pending items returned from /api/v1/workspace/approvals.
// v1 sources are all not-ready, so we show the honest empty state plus
// the per-source roadmap. As sources flip `ready: true` (sponsor F-S3.5,
// speaker F-S4.x, dispatcher-flag), they populate this cabinet without
// any UI change.

type ApprovalKind = 'sponsor_onboarding' | 'speaker_proposal' | 'operator_assisted_interaction';

interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  title: string;
  submittedAt: string;
  summary: string;
  href: string;
}

interface ApprovalsResult {
  items: ApprovalItem[];
  sources: Array<{ kind: ApprovalKind; ready: boolean; note: string }>;
}

type State =
  | { phase: 'loading' }
  | { phase: 'anon' }
  | { phase: 'authed'; email: string; result: ApprovalsResult }
  | { phase: 'error'; message: string };

const KIND_LABELS: Record<ApprovalKind, string> = {
  sponsor_onboarding: 'Sponsor onboarding',
  speaker_proposal: 'Speaker proposal',
  operator_assisted_interaction: 'Operator-assisted message',
};

async function bootstrap(): Promise<State> {
  try {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!r.ok) return { phase: 'anon' };
    const { accessToken } = (await r.json()) as { accessToken: string };
    const me = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!me.ok) return { phase: 'anon' };
    const meData = (await me.json()) as { email: string };
    const list = await fetch('/api/v1/workspace/approvals', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!list.ok) return { phase: 'error', message: `list approvals: ${list.status}` };
    const result = (await list.json()) as ApprovalsResult;
    return { phase: 'authed', email: meData.email, result };
  } catch (err) {
    return { phase: 'error', message: err instanceof Error ? err.message : 'bootstrap failed' };
  }
}

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/approvals'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

export default function ApprovalsQueue(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    void bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  if (state.phase === 'loading' || state.phase === 'anon') {
    return (
      <Shell>
        <p style={{ color: 'var(--muted-foreground)' }}>Loading…</p>
      </Shell>
    );
  }
  if (state.phase === 'error') {
    return (
      <Shell>
        <p style={{ color: 'var(--muted-foreground)' }}>Approvals unavailable: {state.message}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Header email={state.email} count={state.result.items.length} />
      {state.result.items.length === 0 ? (
        <Empty sources={state.result.sources} />
      ) : (
        <ItemsList items={state.result.items} />
      )}
    </Shell>
  );
}

function Header({ email, count }: { email: string; count: number }): ReactElement {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 28,
          letterSpacing: '-0.02em',
          margin: '0 0 6px',
        }}
      >
        Approvals
      </h1>
      <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>
        {count} {count === 1 ? 'item' : 'items'} pending · signed in as {email}
      </p>
    </div>
  );
}

function Empty({ sources }: { sources: ApprovalsResult['sources'] }): ReactElement {
  const ready = sources.filter((s) => s.ready);
  const notReady = sources.filter((s) => !s.ready);
  return (
    <div>
      <div
        style={{
          padding: 48,
          border: '1px dashed var(--border)',
          borderRadius: 12,
          textAlign: 'center',
          color: 'var(--muted-foreground)',
          marginBottom: 24,
        }}
      >
        <p style={{ margin: 0, fontSize: 14 }}>
          {ready.length === 0
            ? 'Nothing waiting yet. As approval sources land, items will appear here.'
            : 'Nothing waiting right now. Check back later.'}
        </p>
      </div>
      {notReady.length > 0 && (
        <section>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--muted-foreground)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: '0 0 12px',
            }}
          >
            Roadmap — sources arriving in future releases
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notReady.map((s) => (
              <div
                key={s.kind}
                style={{
                  padding: '12px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--card)',
                }}
              >
                <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{KIND_LABELS[s.kind]}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
                  {s.note}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ItemsList({ items }: { items: ApprovalItem[] }): ReactElement {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--card)',
      }}
    >
      {items.map((item, i) => (
        <a
          key={item.id}
          href={item.href}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
            padding: '14px 18px',
            borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            textDecoration: 'none',
            color: 'var(--foreground)',
          }}
        >
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--muted-foreground)',
                margin: '0 0 4px',
              }}
            >
              {KIND_LABELS[item.kind]}
            </p>
            <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{item.title}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
              {item.summary}
            </p>
          </div>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--muted-foreground)',
              margin: 0,
              alignSelf: 'center',
            }}
          >
            {formatRelative(item.submittedAt)}
          </p>
        </a>
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function Shell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          padding: '24px 16px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            margin: '0 0 12px',
            padding: '0 8px',
          }}
        >
          Workspace
        </p>
        <NavLink href="/workspace" label="Dashboard" />
        <NavLink href="/workspace/members" label="Members" />
        <NavLink href="/workspace/announce" label="Announce" />
        <NavLink href="/workspace/events" label="Events" />
        <NavLink href="/workspace/approvals" label="Approvals" active />
      </aside>
      <main style={{ flex: 1, padding: '32px 48px', maxWidth: 1180 }}>{children}</main>
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
}: { href: string; label: string; active?: boolean }): ReactElement {
  return (
    <a
      href={href}
      className="app-nav-link"
      style={{
        display: 'block',
        padding: '8px 12px',
        ...(active ? { background: 'var(--card)', borderRadius: 6 } : {}),
      }}
    >
      {label}
    </a>
  );
}
