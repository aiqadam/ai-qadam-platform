import { type ReactElement, useEffect, useState } from 'react';

// #392 — cabinet for in-process cron tick health. Same bootstrap +
// auth pattern as the rest of /workspace.

interface TickMetadata {
  name: string;
  last_started_at: string;
  last_finished_at: string;
  last_duration_ms: number;
  last_outcome: 'success' | 'failed';
  last_error: string | null;
  last_holder: string;
  consecutive_failures: number;
}

interface TickHealthRow {
  name: string;
  label: string;
  schedule_description: string;
  last_fire: TickMetadata | null;
  staleness_minutes: number | null;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'probe_error'; httpStatus: number }
  | { phase: 'ready'; ticks: TickHealthRow[]; accessToken: string };

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/admin/cron'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

async function bootstrap(): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const res = await fetch('/api/v1/workspace/internal-cron/status', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) return { phase: 'anon' };
  if (res.status === 403) return { phase: 'forbidden' };
  if (!res.ok) return { phase: 'probe_error', httpStatus: res.status };
  const { ticks } = (await res.json()) as { ticks: TickHealthRow[] };
  return { phase: 'ready', ticks, accessToken };
}

export default function InternalCronStatusTable(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });

  useEffect(() => {
    void bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon')
    return <p style={mutedStyle()}>Loading…</p>;
  if (state.phase === 'forbidden') return <p style={mutedStyle()}>Operator access only.</p>;
  if (state.phase === 'probe_error')
    return <p style={mutedStyle()}>Failed to load (HTTP {state.httpStatus}).</p>;

  const refresh = async (): Promise<void> => {
    setState({ phase: 'bootstrap' });
    setState(await bootstrap());
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button type="button" onClick={() => void refresh()} style={refreshBtnStyle()}>
          ↻ Refresh
        </button>
      </div>
      <table style={tableStyle()} data-testid="cron-status-table">
        <thead>
          <tr>
            <th style={thStyle()}>Tick</th>
            <th style={thStyle()}>Schedule</th>
            <th style={thStyle()}>Last fire</th>
            <th style={thStyle()}>Duration</th>
            <th style={thStyle()}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {state.ticks.map((t) => (
            <tr key={t.name}>
              <td style={tdStyle()}>
                <strong>{t.label}</strong>
                <div style={mutedStyle()}>
                  <code>{t.name}</code>
                </div>
              </td>
              <td style={tdStyle()}>{t.schedule_description}</td>
              <td style={tdStyle()}>
                {t.last_fire === null ? (
                  <span style={mutedStyle()}>never (last 24h)</span>
                ) : (
                  <>
                    {new Date(t.last_fire.last_finished_at).toLocaleString()}
                    <div style={mutedStyle()}>{formatStaleness(t.staleness_minutes)}</div>
                  </>
                )}
              </td>
              <td style={tdStyle()}>
                {t.last_fire === null ? '—' : `${t.last_fire.last_duration_ms}ms`}
              </td>
              <td style={tdStyle()}>
                {t.last_fire === null ? (
                  '—'
                ) : t.last_fire.last_outcome === 'success' ? (
                  <span style={chipStyle('success')}>
                    success{t.last_fire.consecutive_failures > 0 ? ' (was failing)' : ''}
                  </span>
                ) : (
                  <>
                    <span style={chipStyle('failed')}>
                      failed × {t.last_fire.consecutive_failures}
                    </span>
                    {t.last_fire.last_error && (
                      <div style={{ ...mutedStyle(), marginTop: 4, maxWidth: 320 }}>
                        {t.last_fire.last_error}
                      </div>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function formatStaleness(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (60 * 24))}d ago`;
}

function tableStyle(): React.CSSProperties {
  return { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
}
function thStyle(): React.CSSProperties {
  return {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    fontWeight: 600,
    color: 'var(--muted-foreground)',
  };
}
function tdStyle(): React.CSSProperties {
  return { padding: '12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' };
}
function mutedStyle(): React.CSSProperties {
  return { color: 'var(--muted-foreground)', fontSize: 12 };
}
function chipStyle(outcome: 'success' | 'failed'): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    color: 'white',
    background: outcome === 'success' ? '#16a34a' : '#dc2626',
  };
}
function refreshBtnStyle(): React.CSSProperties {
  return {
    padding: '6px 12px',
    background: 'transparent',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  };
}
