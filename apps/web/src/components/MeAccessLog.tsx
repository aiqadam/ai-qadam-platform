import { type ReactElement, useEffect, useState } from 'react';
import { getAuthState } from '../lib/auth-bootstrap';

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/me/access-log'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

type Severity = 'info' | 'high' | 'critical';

interface AccessEvent {
  id: string;
  event: string;
  severity: Severity;
  target_kind: string | null;
  ts: string;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'probe_error'; httpStatus: number }
  | { phase: 'ready'; events: AccessEvent[] };

const SEV_COLOR: Record<Severity, string> = {
  info: '#6b7280',
  high: '#f59e0b',
  critical: '#dc2626',
};

async function bootstrap(): Promise<State> {
  const auth = await getAuthState();
  if (!auth) return { phase: 'anon' };
  const { accessToken } = auth;
  const res = await fetch('/api/v1/me/access-log', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) return { phase: 'anon' };
  if (!res.ok) return { phase: 'probe_error', httpStatus: res.status };
  const { events } = (await res.json()) as { events: AccessEvent[] };
  return { phase: 'ready', events };
}

export default function MeAccessLog(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });

  useEffect(() => {
    bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon') window.location.replace(signInUrl());
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon') return <p style={muted()}>Loading…</p>;
  if (state.phase === 'probe_error')
    return <p style={muted()}>Couldn't load (HTTP {state.httpStatus}).</p>;

  if (state.events.length === 0) {
    return <p style={muted()}>No recent events touching your account.</p>;
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 12,
        background: 'var(--card)',
        overflow: 'hidden',
      }}
    >
      {state.events.map((e, i) => (
        <div
          key={e.id}
          style={{
            padding: '12px 16px',
            borderBottom: i < state.events.length - 1 ? '1px solid var(--border)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 14,
          }}
        >
          <span
            style={{
              background: SEV_COLOR[e.severity],
              color: 'white',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 11,
              minWidth: 56,
              textAlign: 'center',
            }}
          >
            {e.severity}
          </span>
          <div style={{ flex: 1 }}>
            <code style={{ fontSize: 13 }}>{e.event}</code>
            {e.target_kind && (
              <span style={{ color: 'var(--muted-foreground)', fontSize: 12, marginLeft: 8 }}>
                · {e.target_kind}
              </span>
            )}
          </div>
          <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
            {new Date(e.ts).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function muted(): React.CSSProperties {
  return { fontSize: 14, color: 'var(--muted-foreground)' };
}
