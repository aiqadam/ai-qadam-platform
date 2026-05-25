import { type ReactElement, useEffect, useState } from 'react';

// #294 PR-a — read-view cabinet for tg_broadcasts. Composer + send-now
// land in PR-b / PR-d. Same auth-bootstrap pattern as TelegramCabinet.

type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

interface BroadcastSummary {
  id: string;
  title: string;
  country: string;
  status: BroadcastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  audience_segment: string | null;
  has_image: boolean;
  inline_buttons_count: number;
  // #294 PR-e — 'none' / 'weekly' / 'monthly'
  recurrence: 'none' | 'weekly' | 'monthly';
  created_by: string | null;
  date_created: string;
  date_updated: string | null;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'probe_error'; httpStatus: number }
  | { phase: 'ready'; accessToken: string; items: BroadcastSummary[] };

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/integrations/telegram/broadcasts'
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

  const res = await fetch('/api/v1/workspace/tg-broadcasts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) return { phase: 'anon' };
  if (res.status === 403) return { phase: 'forbidden' };
  if (!res.ok) return { phase: 'probe_error', httpStatus: res.status };

  const { items } = (await res.json()) as { items: BroadcastSummary[] };
  return { phase: 'ready', accessToken, items };
}

const STATUS_LABEL: Record<BroadcastStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_COLOR: Record<BroadcastStatus, string> = {
  draft: '#6b7280',
  scheduled: '#2563eb',
  sending: '#d97706',
  sent: '#16a34a',
  failed: '#dc2626',
  cancelled: '#475569',
};

export default function TgBroadcastsList(): ReactElement {
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

  if (state.phase === 'forbidden')
    return (
      <p style={mutedStyle()}>
        Operator access only — sign in via the workspace landing page first.
      </p>
    );

  if (state.phase === 'probe_error')
    return <p style={mutedStyle()}>Failed to load broadcasts (HTTP {state.httpStatus}).</p>;

  // #391 — operator cancels an in-flight send. Re-fetch after to
  // reflect the flipped status + final partial sent_count.
  const cancel = async (broadcastId: string): Promise<void> => {
    if (
      !window.confirm(
        'Cancel this in-flight broadcast? Already-queued envelopes will still deliver; only further enqueues stop.',
      )
    )
      return;
    if (state.phase !== 'ready') return;
    const res = await fetch(
      `/api/v1/workspace/tg-broadcasts/${encodeURIComponent(broadcastId)}/cancel`,
      { method: 'POST', headers: { Authorization: `Bearer ${state.accessToken}` } },
    );
    if (!res.ok) {
      window.alert(`Cancel failed (HTTP ${res.status}). The send may have already finished.`);
      return;
    }
    setState({ phase: 'bootstrap' });
    setState(await bootstrap());
  };

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <a href="/workspace/integrations/telegram/broadcasts/new" style={newButtonStyle()}>
          + New broadcast
        </a>
      </div>
      {state.items.length === 0 ? (
        <p style={mutedStyle()} data-testid="empty-broadcasts">
          No broadcasts yet. Use "New broadcast" to compose one.
        </p>
      ) : (
        <table style={tableStyle()} data-testid="broadcasts-table">
          <thead>
            <tr>
              <th style={thStyle()}>Title</th>
              <th style={thStyle()}>Country</th>
              <th style={thStyle()}>Status</th>
              <th style={thStyle()}>Scheduled</th>
              <th style={thStyle()}>Sent</th>
              <th style={thStyle()}>Created</th>
              <th style={thStyle()} />
            </tr>
          </thead>
          <tbody>
            {state.items.map((b) => (
              <tr key={b.id}>
                <td style={tdStyle()}>
                  <a href={`/workspace/integrations/telegram/broadcasts/${b.id}`}>{b.title}</a>
                  {b.recurrence !== 'none' && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      ↻ {b.recurrence}
                    </span>
                  )}
                </td>
                <td style={tdStyle()}>{b.country.toUpperCase()}</td>
                <td style={tdStyle()}>
                  <span style={statusChipStyle(b.status)}>{STATUS_LABEL[b.status]}</span>
                </td>
                <td style={tdStyle()}>{formatDate(b.scheduled_at)}</td>
                <td style={tdStyle()}>
                  {b.sent_at ? `${b.sent_count} · ${formatDate(b.sent_at)}` : '—'}
                </td>
                <td style={tdStyle()}>{formatDate(b.date_created)}</td>
                <td style={tdStyle()}>
                  {b.status === 'sending' && (
                    <button
                      type="button"
                      onClick={() => void cancel(b.id)}
                      style={cancelButtonStyle()}
                      data-testid={`cancel-${b.id}`}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function cancelButtonStyle(): React.CSSProperties {
  return {
    padding: '4px 10px',
    background: 'transparent',
    color: '#dc2626',
    border: '1px solid #dc2626',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
  };
}

function newButtonStyle(): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '8px 16px',
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    textDecoration: 'none',
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function mutedStyle(): React.CSSProperties {
  return { color: 'var(--muted-foreground)', fontSize: 14 };
}

function tableStyle(): React.CSSProperties {
  return {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  };
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
  return {
    padding: '12px',
    borderBottom: '1px solid var(--border)',
    verticalAlign: 'top',
  };
}

function statusChipStyle(status: BroadcastStatus): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    color: 'white',
    background: STATUS_COLOR[status],
  };
}
