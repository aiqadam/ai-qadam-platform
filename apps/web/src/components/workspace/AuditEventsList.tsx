import { type ReactElement, useEffect, useState } from 'react';

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/admin/audit'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

type Severity = 'info' | 'high' | 'critical';

interface EventRow {
  id: string;
  event: string;
  severity: Severity;
  actor_id: string | null;
  actor_email: string | null;
  target_kind: string | null;
  target_id: string | null;
  country: string | null;
  payload_json: Record<string, unknown> | null;
  ts: string;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'probe_error'; httpStatus: number }
  | { phase: 'ready'; accessToken: string; events: EventRow[]; severity: SeverityFilter };

type SeverityFilter = 'all' | Severity;

const SEV_COLOR: Record<Severity, string> = {
  info: '#6b7280',
  high: '#f59e0b',
  critical: '#dc2626',
};

const SEV_TABS: Array<{ key: SeverityFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'info', label: 'Info' },
];

async function bootstrap(severity: SeverityFilter): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const qs = severity === 'all' ? '' : `?severity=${severity}`;
  const res = await fetch(`/api/v1/admin/audit/events${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 403) return { phase: 'forbidden' };
  if (res.status === 401) return { phase: 'anon' };
  if (!res.ok) return { phase: 'probe_error', httpStatus: res.status };
  const { events } = (await res.json()) as { events: EventRow[] };
  return { phase: 'ready', accessToken, events, severity };
}

export default function AuditEventsList(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    bootstrap('all').then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon') window.location.replace(signInUrl());
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon')
    return <p style={mutedStyle()}>Loading…</p>;
  if (state.phase === 'forbidden') return <p style={mutedStyle()}>Admin access only.</p>;
  if (state.phase === 'probe_error')
    return <p style={mutedStyle()}>Backend error (HTTP {state.httpStatus}).</p>;

  async function setSeverity(severity: SeverityFilter): Promise<void> {
    setState({ phase: 'bootstrap' });
    setState(await bootstrap(severity));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {SEV_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSeverity(t.key)}
            className={state.severity === t.key ? 'btn btn-primary' : 'btn'}
            style={{ padding: '6px 12px', fontSize: 14 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {state.events.length === 0 ? (
        <p style={mutedStyle()}>No events.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle()}>When</th>
              <th style={thStyle()}>Event</th>
              <th style={thStyle()}>Sev</th>
              <th style={thStyle()}>Actor</th>
              <th style={thStyle()}>Target</th>
              <th style={thStyle()} />
            </tr>
          </thead>
          <tbody>
            {state.events.map((e) => {
              const isOpen = expanded === e.id;
              return (
                <>
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...tdStyle(), fontSize: 12, color: 'var(--muted-foreground)' }}>
                      {new Date(e.ts).toLocaleString()}
                    </td>
                    <td style={tdStyle()}>
                      <code style={{ fontSize: 13 }}>{e.event}</code>
                    </td>
                    <td style={tdStyle()}>
                      <span
                        style={{
                          background: SEV_COLOR[e.severity],
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        {e.severity}
                      </span>
                    </td>
                    <td style={tdStyle()}>
                      {e.actor_email ?? <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle(), fontSize: 13 }}>
                      {e.target_kind ? (
                        <>
                          <code style={{ fontSize: 12 }}>{e.target_kind}</code>
                          {e.target_id && (
                            <span style={{ color: 'var(--muted-foreground)' }}>
                              :{e.target_id.slice(0, 8)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle()}>
                      {e.payload_json && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : e.id)}
                          className="btn"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                        >
                          {isOpen ? 'Hide' : 'Payload'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && e.payload_json && (
                    <tr>
                      <td colSpan={6} style={{ padding: '8px 16px', background: 'var(--muted)' }}>
                        <pre style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify(e.payload_json, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function mutedStyle(): React.CSSProperties {
  return { fontSize: 15, color: 'var(--muted-foreground)' };
}
function thStyle(): React.CSSProperties {
  return { padding: '8px 12px', fontWeight: 600, fontSize: 13 };
}
function tdStyle(): React.CSSProperties {
  return { padding: '12px', verticalAlign: 'top' };
}
