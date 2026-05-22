import { Fragment, type ReactElement, useEffect, useRef, useState } from 'react';

// R3 PR-3a (ADR-0034) — Telegram integration status panel.
//
// Renders the StatusResponse from GET /v1/telegram/admin/status as
// six sections: bot identity, three heartbeats, outbox, send-log,
// streams. Polls every 5 seconds while the cabinet is open.
//
// Configure + rotate flows land in PR-3b (separate form components
// on the same page). This component is intentionally READ-ONLY so
// the cabinet ships its first signal-of-life today without form
// state to test.
//
// Auth flow mirrors AdminInvitesList: bootstrap via /v1/auth/refresh,
// 401 → redirect to Authentik, 403 → "ask a super-admin", anything
// else → render with the data. SuperAdminGuard on the API enforces
// access; we don't pre-check on the client.

const POLL_MS = 5_000;

interface HeartbeatRead {
  service: 'api' | 'bot' | 'notifier';
  last_seen_at: string | null;
  ttl_seconds?: number | null;
  stale?: boolean;
}

interface StreamMetrics {
  stream: string;
  length: number;
  pending_ack: number;
}

interface StatusResponse {
  configured: boolean;
  bot: {
    id: string;
    username: string;
    last_getMe_ok: string | null;
  } | null;
  api_heartbeat: HeartbeatRead;
  bot_heartbeat: HeartbeatRead;
  notifier_heartbeat: HeartbeatRead;
  outbox: {
    pending: number;
    oldest_unpublished_age_sec: number | null;
    dlq_count: number;
  };
  send_log: {
    last_24h_sent: number;
    last_24h_failed: number;
    last_24h_opted_out: number;
  };
  streams: Record<string, StreamMetrics>;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'probe_error'; httpStatus: number }
  | {
      phase: 'authed';
      accessToken: string;
      status: StatusResponse;
      fetchedAt: number;
      // null = first ok poll; otherwise the error from the most
      // recent failed refresh. We keep showing the last good data
      // even after a transient failure.
      pollError: string | null;
    };

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/integrations/telegram'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

async function fetchStatus(
  accessToken: string,
): Promise<{ ok: true; status: StatusResponse } | { ok: false; httpStatus: number }> {
  const res = await fetch('/api/v1/telegram/admin/status', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { ok: false, httpStatus: res.status };
  return { ok: true, status: (await res.json()) as StatusResponse };
}

async function bootstrap(): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const result = await fetchStatus(accessToken);
  if (!result.ok) {
    if (result.httpStatus === 401) return { phase: 'anon' };
    if (result.httpStatus === 403) return { phase: 'forbidden' };
    return { phase: 'probe_error', httpStatus: result.httpStatus };
  }
  return {
    phase: 'authed',
    accessToken,
    status: result.status,
    fetchedAt: Date.now(),
    pollError: null,
  };
}

export default function TelegramStatusPanel(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });
  // Hold the latest state in a ref so the interval closure doesn't
  // capture a stale value.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'authed') return;
    const id = setInterval(() => {
      const current = stateRef.current;
      if (current.phase !== 'authed') return;
      void fetchStatus(current.accessToken).then((result) => {
        if (result.ok) {
          setState({ ...current, status: result.status, fetchedAt: Date.now(), pollError: null });
        } else if (result.httpStatus === 401) {
          // Access token expired; re-bootstrap to refresh.
          void bootstrap().then(setState);
        } else {
          setState({ ...current, pollError: `HTTP ${result.httpStatus}` });
        }
      });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [state.phase]);

  if (state.phase === 'bootstrap' || state.phase === 'anon')
    return <p style={mutedStyle()}>Redirecting to sign-in…</p>;
  if (state.phase === 'forbidden')
    return <p style={mutedStyle()}>Admin access only. Ask a super-admin if you need access.</p>;
  if (state.phase === 'probe_error')
    return (
      <p style={mutedStyle()}>
        Backend error (HTTP {state.httpStatus}). Refresh in a minute, or check API logs.
      </p>
    );

  const { status, fetchedAt, pollError } = state;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <span style={mutedStyle()}>
          Last refreshed {formatRelative(fetchedAt)}
          {pollError ? ` · last poll failed (${pollError})` : ''}
        </span>
      </div>

      {/* Section 1 — Bot identity */}
      <Section title="Bot">
        {status.configured && status.bot ? (
          <DefinitionList
            entries={[
              ['Username', `@${status.bot.username}`],
              ['Bot ID', status.bot.id],
              [
                'Last getMe OK',
                status.bot.last_getMe_ok ? (
                  formatTimestamp(status.bot.last_getMe_ok)
                ) : (
                  <Chip key="getme" color="red" label="never" />
                ),
              ],
            ]}
          />
        ) : (
          <p style={mutedStyle()}>
            Not configured. PR-3b will surface a paste-token form here; for now configure via{' '}
            <code>POST /v1/telegram/admin/configure</code>.
          </p>
        )}
      </Section>

      {/* Section 2 — Heartbeats */}
      <Section title="Heartbeats">
        <DefinitionList
          entries={[
            ['API', <HeartbeatChip key="api" hb={status.api_heartbeat} />],
            ['Bot', <HeartbeatChip key="bot" hb={status.bot_heartbeat} />],
            ['Notifier', <HeartbeatChip key="notifier" hb={status.notifier_heartbeat} />],
          ]}
        />
      </Section>

      {/* Section 3 — Outbox */}
      <Section title="Outbox">
        <DefinitionList
          entries={[
            ['Pending rows', String(status.outbox.pending)],
            [
              'Oldest unpublished',
              status.outbox.oldest_unpublished_age_sec === null
                ? '—'
                : `${status.outbox.oldest_unpublished_age_sec}s ago`,
            ],
            ['DLQ length', String(status.outbox.dlq_count)],
          ]}
        />
      </Section>

      {/* Section 4 — Send log (last 24h) */}
      <Section title="Sends in the last 24h">
        <DefinitionList
          entries={[
            ['Sent', String(status.send_log.last_24h_sent)],
            ['Failed', String(status.send_log.last_24h_failed)],
            ['Opted out', String(status.send_log.last_24h_opted_out)],
          ]}
        />
      </Section>

      {/* Section 5 — Streams */}
      <Section title="Streams">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle()}>Stream</th>
              <th style={thStyle()}>Length</th>
              <th style={thStyle()}>Pending ACK</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(status.streams).map((s) => (
              <tr key={s.stream} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle(), fontFamily: 'monospace' }}>{s.stream}</td>
                <td style={tdStyle()}>{s.length}</td>
                <td style={tdStyle()}>{s.pending_ack}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Section 6 — placeholder for recent deliveries (R3 PR-3b) */}
      <Section title="Recent deliveries">
        <p style={mutedStyle()}>
          Last 10 rows from <code>tg_send_log</code> will appear here in PR-3b (needs new{' '}
          <code>GET /v1/telegram/admin/deliveries</code> endpoint).
        </p>
      </Section>
    </div>
  );
}

// ─── presentational bits ─────────────────────────────────────────────────────

function Section(props: { title: string; children: React.ReactNode }): ReactElement {
  return (
    <section
      style={{
        marginBottom: 24,
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      <h2 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>{props.title}</h2>
      {props.children}
    </section>
  );
}

function DefinitionList(props: {
  entries: Array<[string, React.ReactNode]>;
}): ReactElement {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', margin: 0 }}>
      {props.entries.map(([k, v]) => (
        <Fragment key={k}>
          <dt style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>{k}</dt>
          <dd style={{ margin: 0, fontSize: 14 }}>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Chip(props: { color: 'green' | 'amber' | 'red' | 'gray'; label: string }): ReactElement {
  const bg = {
    green: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
    gray: '#6b7280',
  }[props.color];
  return (
    <span
      style={{
        background: bg,
        color: 'white',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
      }}
    >
      {props.label}
    </span>
  );
}

function HeartbeatChip(props: { hb: HeartbeatRead }): ReactElement {
  // The api heartbeat is always present (the controller writes
  // `new Date().toISOString()` at request time). For bot+notifier,
  // stale=true is the indicator that comes from heartbeat-reader.
  if (props.hb.stale === true) {
    return (
      <span>
        <Chip color="red" label="stale" />{' '}
        <span style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
          never seen OR ttl expired
        </span>
      </span>
    );
  }
  if (!props.hb.last_seen_at) {
    return <Chip color="gray" label="unknown" />;
  }
  return (
    <span>
      <Chip color="green" label="live" />{' '}
      <span style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
        last seen {formatRelative(new Date(props.hb.last_seen_at).getTime())}
      </span>
    </span>
  );
}

function formatRelative(epochMs: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return new Date(epochMs).toLocaleTimeString();
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

function mutedStyle(): React.CSSProperties {
  return { fontSize: 14, color: 'var(--muted-foreground)' };
}
function thStyle(): React.CSSProperties {
  return { padding: '8px 12px', fontWeight: 600, fontSize: 13 };
}
function tdStyle(): React.CSSProperties {
  return { padding: '12px', verticalAlign: 'top' };
}
