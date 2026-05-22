import { type ReactElement, useCallback, useEffect, useState } from 'react';

// F-R3.0 — /workspace/integrations/telegram cabinet. Read-only shell:
// status panel + bot identity + recent deliveries. Configure / rotate
// write surfaces land in F-R3.1 (PR-3b); until then operators set the
// token via curl against /v1/telegram/admin/configure.
//
// Auth bootstrap follows the sibling cabinet pattern (RbacSyncList): a
// 401 from /v1/auth/refresh → anon redirect; 403 from the Telegram
// admin endpoints → SuperAdmin-only message.

// ─── Types pinned to the API ────────────────────────────────────────────────

interface HeartbeatRead {
  service: 'bot' | 'notifier';
  last_seen_at: string | null;
  ttl_seconds: number | null;
  stale: boolean;
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
  api_heartbeat: { service: 'api'; last_seen_at: string };
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

interface RecentDeliveryRow {
  delivery_key: string;
  outcome: string;
  detail: string | null;
  created_at: string;
}

// ─── State ──────────────────────────────────────────────────────────────────

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'probe_error'; httpStatus: number }
  | {
      phase: 'ready';
      accessToken: string;
      status: StatusResponse;
      deliveries: RecentDeliveryRow[];
    };

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/integrations/telegram'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

async function fetchStatus(token: string): Promise<Response> {
  return fetch('/api/v1/telegram/admin/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function fetchRecent(token: string): Promise<Response> {
  return fetch('/api/v1/telegram/admin/recent-deliveries', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function bootstrap(): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  // Two read-only endpoints — fire in parallel so the first paint is
  // one round-trip away.
  const [statusRes, recentRes] = await Promise.all([
    fetchStatus(accessToken),
    fetchRecent(accessToken),
  ]);

  if (statusRes.status === 401 || recentRes.status === 401) return { phase: 'anon' };
  if (statusRes.status === 403 || recentRes.status === 403) return { phase: 'forbidden' };
  if (!statusRes.ok) return { phase: 'probe_error', httpStatus: statusRes.status };
  if (!recentRes.ok) return { phase: 'probe_error', httpStatus: recentRes.status };

  const status = (await statusRes.json()) as StatusResponse;
  const { rows: deliveries } = (await recentRes.json()) as { rows: RecentDeliveryRow[] };
  return { phase: 'ready', accessToken, status, deliveries };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TelegramCabinet(): ReactElement {
  const [state, setState] = useState<State>({ phase: 'bootstrap' });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void bootstrap().then(setState);
  }, []);

  useEffect(() => {
    if (state.phase === 'anon' && typeof window !== 'undefined') {
      window.location.replace(signInUrl());
    }
  }, [state.phase]);

  const refresh = useCallback(async (): Promise<void> => {
    if (state.phase !== 'ready') return;
    setRefreshing(true);
    try {
      const [statusRes, recentRes] = await Promise.all([
        fetchStatus(state.accessToken),
        fetchRecent(state.accessToken),
      ]);
      if (!statusRes.ok || !recentRes.ok) {
        setState({
          phase: 'probe_error',
          httpStatus: statusRes.ok ? recentRes.status : statusRes.status,
        });
        return;
      }
      const status = (await statusRes.json()) as StatusResponse;
      const { rows: deliveries } = (await recentRes.json()) as { rows: RecentDeliveryRow[] };
      setState({ phase: 'ready', accessToken: state.accessToken, status, deliveries });
    } finally {
      setRefreshing(false);
    }
  }, [state]);

  if (state.phase === 'bootstrap' || state.phase === 'anon')
    return <p style={mutedStyle()}>Loading…</p>;
  if (state.phase === 'forbidden')
    return (
      <p style={mutedStyle()} data-testid="cabinet-forbidden">
        Super-admin access only — ask the platform owner to add you to the
        <code style={inlineCodeStyle()}>aiqadam-super-admin</code> Authentik group.
      </p>
    );
  if (state.phase === 'probe_error')
    return (
      <p style={mutedStyle()} data-testid="cabinet-error">
        Backend error (HTTP {state.httpStatus}).
      </p>
    );

  const { status, deliveries } = state;

  return (
    <div data-testid="cabinet-ready">
      <RefreshBar onRefresh={refresh} refreshing={refreshing} />
      <StatusPanel status={status} />
      <BotIdentity status={status} />
      <RecentDeliveries rows={deliveries} />
      <Footer />
    </div>
  );
}

// ─── Refresh bar ────────────────────────────────────────────────────────────

function RefreshBar({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => Promise<void> | void;
  refreshing: boolean;
}): ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => {
          void onRefresh();
        }}
        disabled={refreshing}
        data-testid="cabinet-refresh"
        style={{
          padding: '6px 12px',
          fontSize: 13,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--foreground)',
          cursor: refreshing ? 'not-allowed' : 'pointer',
          opacity: refreshing ? 0.6 : 1,
        }}
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}

// ─── Status panel ───────────────────────────────────────────────────────────

// 30s window matches HEARTBEAT_TTL_SEC on the API side. A "fresh"
// timestamp is one whose age is below this; otherwise we show red.
const FRESHNESS_THRESHOLD_SEC = 30;

function isFresh(iso: string | null): boolean {
  if (iso === null) return false;
  const age = (Date.now() - new Date(iso).getTime()) / 1000;
  return age <= FRESHNESS_THRESHOLD_SEC;
}

function StatusPanel({ status }: { status: StatusResponse }): ReactElement {
  const apiFresh = isFresh(status.api_heartbeat.last_seen_at);
  const botFresh = !status.bot_heartbeat.stale;
  const notifierFresh = !status.notifier_heartbeat.stale;

  return (
    <section data-testid="status-panel" style={sectionStyle()}>
      <h2 style={sectionHeadingStyle()}>Status</h2>
      <div style={cardGridStyle()}>
        <StatusCard
          label="API heartbeat"
          fresh={apiFresh}
          value={shortClock(status.api_heartbeat.last_seen_at)}
          hint={status.configured ? 'configured: true' : 'configured: false'}
        />
        <StatusCard
          label="Bot heartbeat"
          fresh={botFresh}
          value={
            status.bot_heartbeat.last_seen_at
              ? shortClock(status.bot_heartbeat.last_seen_at)
              : 'never'
          }
          hint={
            status.bot_heartbeat.ttl_seconds === null
              ? 'key missing'
              : `ttl ${status.bot_heartbeat.ttl_seconds}s`
          }
        />
        <StatusCard
          label="Notifier heartbeat"
          fresh={notifierFresh}
          value={
            status.notifier_heartbeat.last_seen_at
              ? shortClock(status.notifier_heartbeat.last_seen_at)
              : 'never'
          }
          hint={
            status.notifier_heartbeat.ttl_seconds === null
              ? 'key missing'
              : `ttl ${status.notifier_heartbeat.ttl_seconds}s`
          }
        />
        <StatusCard
          label="Outbox"
          fresh={status.outbox.pending === 0}
          value={`${status.outbox.pending} pending`}
          hint={
            status.outbox.oldest_unpublished_age_sec === null
              ? 'queue clean'
              : `oldest ${status.outbox.oldest_unpublished_age_sec}s · DLQ ${status.outbox.dlq_count}`
          }
        />
        <StatusCard
          label="Streams"
          fresh={true}
          value={`${Object.keys(status.streams).length} stream(s)`}
          hint={Object.entries(status.streams)
            .map(
              ([name, m]) => `${name.split('.').slice(-2).join('.')}: ${m.length}/${m.pending_ack}`,
            )
            .join(' · ')}
        />
        <StatusCard
          label="Send log (24h)"
          fresh={status.send_log.last_24h_failed === 0}
          value={`${status.send_log.last_24h_sent} sent`}
          hint={`${status.send_log.last_24h_failed} failed · ${status.send_log.last_24h_opted_out} opted-out`}
        />
      </div>
    </section>
  );
}

function StatusCard({
  label,
  fresh,
  value,
  hint,
}: {
  label: string;
  fresh: boolean;
  value: string;
  hint: string;
}): ReactElement {
  return (
    <div
      data-testid={`status-card-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      style={{
        padding: '14px 16px',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--card)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: fresh ? '#10b981' : '#dc2626',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{label}</span>
      </div>
      <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)' }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{hint}</span>
    </div>
  );
}

// ─── Bot identity ───────────────────────────────────────────────────────────

function BotIdentity({ status }: { status: StatusResponse }): ReactElement {
  if (!status.configured || status.bot === null) {
    return (
      <section data-testid="bot-identity" style={sectionStyle()}>
        <h2 style={sectionHeadingStyle()}>Bot identity</h2>
        <p style={mutedStyle()}>
          Not configured yet. Until the configure form ships, set the token via
          <code style={inlineCodeStyle()}>POST /v1/telegram/admin/configure</code>.
        </p>
      </section>
    );
  }

  const { bot } = status;
  return (
    <section data-testid="bot-identity" style={sectionStyle()}>
      <h2 style={sectionHeadingStyle()}>Bot identity</h2>
      <div
        style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 14 }}
      >
        <span style={{ color: 'var(--muted-foreground)' }}>Username</span>
        <span>
          <a
            href={`https://t.me/${bot.username}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--foreground)' }}
          >
            @{bot.username}
          </a>
        </span>
        <span style={{ color: 'var(--muted-foreground)' }}>Bot ID</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>{bot.id}</span>
        <span style={{ color: 'var(--muted-foreground)' }}>Last getMe ok</span>
        <span>{bot.last_getMe_ok ? shortClock(bot.last_getMe_ok) : '—'}</span>
      </div>
    </section>
  );
}

// ─── Recent deliveries ──────────────────────────────────────────────────────

const OUTCOME_COLOR: Record<string, string> = {
  sent: '#10b981',
  opted_out: '#6b7280',
  blocked: '#dc2626',
  bad_request: '#dc2626',
  unknown_error: '#dc2626',
  expired: '#dc2626',
  retry: '#f59e0b',
};

function RecentDeliveries({ rows }: { rows: RecentDeliveryRow[] }): ReactElement {
  return (
    <section data-testid="recent-deliveries" style={sectionStyle()}>
      <h2 style={sectionHeadingStyle()}>Recent deliveries</h2>
      {rows.length === 0 ? (
        <p style={mutedStyle()}>No deliveries yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted-foreground)' }}>
              <th style={thStyle()}>Time</th>
              <th style={thStyle()}>Outcome</th>
              <th style={thStyle()}>Delivery key</th>
              <th style={thStyle()}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.delivery_key} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={tdStyle()}>{shortClock(row.created_at)}</td>
                <td style={tdStyle()}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: OUTCOME_COLOR[row.outcome] ?? '#6b7280',
                      marginRight: 6,
                    }}
                  />
                  {row.outcome}
                </td>
                <td style={{ ...tdStyle(), fontFamily: 'var(--font-mono)' }}>{row.delivery_key}</td>
                <td style={{ ...tdStyle(), color: 'var(--muted-foreground)' }}>
                  {row.detail ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ─── Footer / cross-links ───────────────────────────────────────────────────

function Footer(): ReactElement {
  return (
    <section style={{ ...sectionStyle(), borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <p style={mutedStyle()}>
        For long-window analytics and per-template breakdowns, see the
        <a
          href="https://analytics.aiqadam.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: 4 }}
        >
          Plausible dashboard
        </a>
        .
      </p>
    </section>
  );
}

// ─── Style helpers ──────────────────────────────────────────────────────────

function sectionStyle(): React.CSSProperties {
  return { marginBottom: 32 };
}

function sectionHeadingStyle(): React.CSSProperties {
  return {
    fontSize: 16,
    fontWeight: 600,
    margin: '0 0 12px',
    color: 'var(--foreground)',
  };
}

function cardGridStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  };
}

function thStyle(): React.CSSProperties {
  return { padding: '8px 12px', fontWeight: 500, fontSize: 11, textTransform: 'uppercase' };
}

function tdStyle(): React.CSSProperties {
  return { padding: '10px 12px', verticalAlign: 'top' };
}

function mutedStyle(): React.CSSProperties {
  return { color: 'var(--muted-foreground)', fontSize: 14 };
}

function inlineCodeStyle(): React.CSSProperties {
  return {
    fontFamily: 'var(--font-mono)',
    background: 'var(--card)',
    padding: '1px 6px',
    borderRadius: 4,
    fontSize: 12,
    margin: '0 4px',
  };
}

// Format an ISO-8601 string as `HH:MM:SS` in the operator's local TZ.
// The full ISO string is useful for log forensics but too noisy for a
// status card.
function shortClock(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString();
  } catch {
    return iso;
  }
}
