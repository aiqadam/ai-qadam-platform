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
  // R3 PR-b — service-token rotation metadata. Plaintext never lives
  // here; only the source indicator + rotation audit fields.
  service_token: {
    source: 'db' | 'env' | 'unset';
    rotated_at: string | null;
    rotated_by: string | null;
  };
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
      <TokenForm
        accessToken={state.accessToken}
        configured={status.configured}
        onSaved={() => {
          void refresh();
        }}
      />
      <ServiceTokenSection
        accessToken={state.accessToken}
        meta={status.service_token}
        configured={status.configured}
        onRotated={() => {
          void refresh();
        }}
      />
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
          Not configured yet. Use the form below to paste a BotFather token.
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

// ─── Service token (R3 PR-b) ────────────────────────────────────────────────
//
// Bot ↔ API auth token. Distinct from the BotFather token (which the
// bot uses to talk to Telegram). R2 PR-3 moved this off the env var
// into an encrypted column on tg_config. The cabinet surfaces:
//
//   - source indicator: db / env / unset
//   - rotation audit metadata (when source = db)
//   - "Rotate service token" button → confirmation → POST → one-shot
//     plaintext display with copy-to-clipboard + clear-on-close.
//
// The plaintext is in state ONLY for the time the operator sees the
// modal. It never round-trips through the status endpoint or any
// other GET; rotation is the sole way to obtain it.

interface ServiceTokenSectionProps {
  accessToken: string;
  meta: StatusResponse['service_token'];
  configured: boolean;
  onRotated: () => void;
}

type ServiceTokenState =
  | { phase: 'idle' }
  | { phase: 'confirm' }
  | { phase: 'submitting' }
  | { phase: 'shown'; plaintext: string; rotatedAt: string }
  | { phase: 'error'; message: string };

function ServiceTokenSection({
  accessToken,
  meta,
  configured,
  onRotated,
}: ServiceTokenSectionProps): ReactElement {
  const [state, setState] = useState<ServiceTokenState>({ phase: 'idle' });
  const [copied, setCopied] = useState(false);

  const rotate = useCallback(async (): Promise<void> => {
    setState({ phase: 'submitting' });
    try {
      const res = await fetch('/api/v1/telegram/admin/rotate-service-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        const detail = body?.error ?? body?.message ?? `HTTP ${res.status}`;
        setState({ phase: 'error', message: detail });
        return;
      }
      const ok = (await res.json()) as { plaintext: string; rotated_at: string };
      setState({ phase: 'shown', plaintext: ok.plaintext, rotatedAt: ok.rotated_at });
      setCopied(false);
      onRotated();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'network error';
      setState({ phase: 'error', message: reason });
    }
  }, [accessToken, onRotated]);

  const onCopy = useCallback((): void => {
    if (state.phase !== 'shown') return;
    void navigator.clipboard.writeText(state.plaintext).then(() => setCopied(true));
  }, [state]);

  const onDismiss = useCallback((): void => {
    setState({ phase: 'idle' });
    setCopied(false);
  }, []);

  const sourceLabel: Record<typeof meta.source, { text: string; color: string }> = {
    db: { text: 'DB (encrypted)', color: 'var(--primary)' },
    env: { text: 'env fallback', color: '#f59e0b' },
    unset: { text: 'NOT SET', color: '#ef4444' },
  };
  const src = sourceLabel[meta.source];

  return (
    <section data-testid="service-token-section" style={sectionStyle()}>
      <h2 style={sectionHeadingStyle()}>Service token</h2>
      <p style={{ ...mutedStyle(), marginBottom: 12 }}>
        The bot uses this token in <code style={inlineCodeStyle()}>Authorization: Bearer</code> when
        calling the API. Rotate when an operator leaves or you suspect compromise.
      </p>

      <div style={{ ...statusLineStyle(), marginBottom: 8 }}>
        <span style={mutedStyle()}>Source: </span>
        <span style={{ color: src.color, fontWeight: 600 }} data-testid="service-token-source">
          {src.text}
        </span>
        {meta.source === 'env' && (
          <span style={{ ...mutedStyle(), marginLeft: 8, fontSize: 12 }}>
            (rotate to migrate into encrypted DB storage)
          </span>
        )}
      </div>

      {meta.rotated_at && (
        <div style={{ ...statusLineStyle(), marginBottom: 12 }}>
          <span style={mutedStyle()}>Last rotated: </span>
          <code style={inlineCodeStyle()}>{shortClock(meta.rotated_at)}</code>
          {meta.rotated_by && (
            <span style={{ ...mutedStyle(), marginLeft: 8 }}>
              by <code style={inlineCodeStyle()}>{meta.rotated_by.slice(0, 8)}…</code>
            </span>
          )}
        </div>
      )}

      {state.phase === 'idle' && (
        <button
          type="button"
          onClick={() => setState({ phase: 'confirm' })}
          disabled={!configured}
          data-testid="service-token-rotate"
          style={primaryButtonStyle(!configured)}
        >
          Rotate service token
        </button>
      )}

      {!configured && (
        <p style={{ ...mutedStyle(), marginTop: 8, fontSize: 12 }}>
          Configure the BotFather token first; the bot must exist before its service token can
          rotate.
        </p>
      )}

      {state.phase === 'confirm' && (
        <div data-testid="service-token-confirm" style={confirmBoxStyle()}>
          <p style={{ margin: '0 0 8px' }}>
            <strong>Confirm rotation.</strong> The current service token will stop working
            immediately after this. You must paste the new token into the bot's environment within
            ~30s, then the bot will restart and reconnect.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                void rotate();
              }}
              data-testid="service-token-confirm-rotate"
              style={primaryButtonStyle(false)}
            >
              Yes, rotate now
            </button>
            <button
              type="button"
              onClick={() => setState({ phase: 'idle' })}
              style={secondaryButtonStyle()}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.phase === 'submitting' && <p style={mutedStyle()}>Minting + persisting token…</p>}

      {state.phase === 'shown' && (
        <div data-testid="service-token-shown" style={confirmBoxStyle()}>
          <p style={{ margin: '0 0 8px' }}>
            <strong>New service token (copy now — won't be shown again):</strong>
          </p>
          <code
            data-testid="service-token-plaintext"
            style={{
              display: 'block',
              padding: 12,
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              wordBreak: 'break-all',
              marginBottom: 8,
            }}
          >
            {state.plaintext}
          </code>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={onCopy}
              style={primaryButtonStyle(false)}
              data-testid="service-token-copy"
            >
              {copied ? 'Copied ✓' : 'Copy to clipboard'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              style={secondaryButtonStyle()}
              data-testid="service-token-dismiss"
            >
              I've saved it
            </button>
          </div>
        </div>
      )}

      {state.phase === 'error' && (
        <div
          data-testid="service-token-error"
          style={{ ...confirmBoxStyle(), borderColor: '#ef4444' }}
        >
          <p style={{ margin: 0, color: '#ef4444' }}>Rotation failed: {state.message}</p>
          <button
            type="button"
            onClick={() => setState({ phase: 'idle' })}
            style={{ ...secondaryButtonStyle(), marginTop: 8 }}
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    fontSize: 13,
    borderRadius: 6,
    border: '1px solid var(--primary)',
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    padding: '8px 14px',
    fontSize: 13,
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--foreground)',
    cursor: 'pointer',
  };
}

function confirmBoxStyle(): React.CSSProperties {
  return {
    padding: 12,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--card)',
    marginTop: 8,
  };
}

// ─── Token form (configure / rotate) ────────────────────────────────────────
//
// One component, two modes. When `configured === false` it's the
// first-time configure form: paste the BotFather token, Validate &
// Save, and on success the parent re-fetches status → the cabinet
// flips to "configured: true". When `configured === true` it's the
// rotate form, gated behind a confirmation step so an operator
// doesn't replace the live token by clicking through too fast.
//
// On submit we POST to either /admin/configure or /admin/rotate-token.
// Both endpoints share the same body schema and the same success
// shape (ConfigureResponse), so the form handles them uniformly. The
// API publishes bot:reload_requested + notifier:reload_requested on
// every save (F-R2.6) — we surface that as a "bot restarts within
// ~30s" hint.
//
// Token format hint: BotFather tokens look like `123456789:AABBCC-…`.
// We don't validate locally (the API does isBotFatherTokenShape +
// getMe); we just show the format hint so the operator knows what to
// paste.

const TOKEN_FORMAT_HINT = '123456789:AABBCC-DD_EEffgg…';

interface TokenFormState {
  token: string;
  // 'rotate-confirm' is the "Are you sure?" step before we actually
  // POST. Hidden in the configure-first-time flow.
  phase: 'edit' | 'rotate-confirm' | 'submitting' | 'success' | 'error';
  // Last message shown — green on success, red on error. Kept on the
  // state so we can render an inline status line without a separate
  // toast system.
  message: string | null;
}

function TokenForm({
  accessToken,
  configured,
  onSaved,
}: {
  accessToken: string;
  configured: boolean;
  onSaved: () => void;
}): ReactElement {
  const [form, setForm] = useState<TokenFormState>({
    token: '',
    phase: 'edit',
    message: null,
  });

  const isRotating = configured;
  const endpoint = isRotating
    ? '/api/v1/telegram/admin/rotate-token'
    : '/api/v1/telegram/admin/configure';
  const action = isRotating ? 'Rotate' : 'Validate & Save';

  const submit = useCallback(async (): Promise<void> => {
    setForm((f) => ({ ...f, phase: 'submitting', message: null }));
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ token: form.token.trim() }),
      });
      if (!res.ok) {
        // Surface the API error string next to the field. The configure
        // endpoint returns 400 with a Zod-flattened body OR a
        // BadRequestException with { error: 'getme_failed', detail }
        // — try both shapes and fall back to the HTTP status text.
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          detail?: string;
          message?: string;
        } | null;
        const detail = body?.detail ?? body?.error ?? body?.message ?? `HTTP ${res.status}`;
        setForm({ token: form.token, phase: 'error', message: detail });
        return;
      }
      const ok = (await res.json()) as { bot_username: string };
      setForm({
        token: '',
        phase: 'success',
        message: `Saved. Bot @${ok.bot_username} will restart within ~30s and pick up the new token.`,
      });
      onSaved();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'network error';
      setForm({ token: form.token, phase: 'error', message: reason });
    }
  }, [accessToken, endpoint, form.token, onSaved]);

  const onClick = useCallback((): void => {
    if (isRotating && form.phase === 'edit') {
      setForm((f) => ({ ...f, phase: 'rotate-confirm' }));
      return;
    }
    void submit();
  }, [form.phase, isRotating, submit]);

  const onCancelConfirm = useCallback((): void => {
    setForm((f) => ({ ...f, phase: 'edit' }));
  }, []);

  const disabled =
    form.phase === 'submitting' ||
    form.token.trim().length === 0 ||
    form.phase === 'rotate-confirm';

  return (
    <section data-testid="token-form" style={sectionStyle()}>
      <h2 style={sectionHeadingStyle()}>{isRotating ? 'Rotate token' : 'Configure bot token'}</h2>
      <p style={{ ...mutedStyle(), marginBottom: 12 }}>
        Paste a BotFather token (format <code style={inlineCodeStyle()}>{TOKEN_FORMAT_HINT}</code>).
        We validate it against Telegram's <code style={inlineCodeStyle()}>getMe</code> before
        saving; the encrypted blob lives in <code style={inlineCodeStyle()}>tg_config</code> at
        rest.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          data-testid="token-input"
          placeholder={TOKEN_FORMAT_HINT}
          value={form.token}
          onChange={(e) => {
            setForm((f) => ({ ...f, token: e.target.value, message: null, phase: 'edit' }));
          }}
          disabled={form.phase === 'submitting'}
          style={{
            flex: 1,
            minWidth: 280,
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
          }}
        />
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          data-testid="token-submit"
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: disabled ? 'transparent' : 'var(--foreground)',
            color: disabled ? 'var(--muted-foreground)' : 'var(--background)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {form.phase === 'submitting' ? 'Saving…' : action}
        </button>
      </div>
      <TokenFormFooter
        phase={form.phase}
        message={form.message}
        onConfirm={() => {
          void submit();
        }}
        onCancel={onCancelConfirm}
      />
    </section>
  );
}

// Renders the per-phase footer below the input row: rotate-confirm
// box, success status line, or error status line. Extracted to keep
// TokenForm's cognitive complexity inside the project's linter budget
// — the conditional-render tree is the same in either place, the
// split is purely about which function owns the branches.
function TokenFormFooter({
  phase,
  message,
  onConfirm,
  onCancel,
}: {
  phase: TokenFormState['phase'];
  message: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactElement | null {
  if (phase === 'rotate-confirm') {
    return <RotateConfirm onConfirm={onConfirm} onCancel={onCancel} />;
  }
  if (phase === 'success' && message) {
    return (
      <p data-testid="token-success" style={{ ...statusLineStyle(), color: '#10b981' }}>
        ✓ {message}
      </p>
    );
  }
  if (phase === 'error' && message) {
    return (
      <p data-testid="token-error" style={{ ...statusLineStyle(), color: '#dc2626' }}>
        ✗ {message}
      </p>
    );
  }
  return null;
}

function RotateConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}): ReactElement {
  return (
    <div
      data-testid="rotate-confirm"
      style={{
        marginTop: 12,
        padding: 14,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--card)',
      }}
    >
      <p style={{ ...mutedStyle(), margin: '0 0 8px' }}>
        Rotating replaces the live token. The bot will restart within ~30s; any in-flight pollers
        will reconnect against the new credential. Continue?
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onConfirm}
          data-testid="rotate-confirm-yes"
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #dc2626',
            background: '#dc2626',
            color: 'white',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Rotate now
        </button>
        <button
          type="button"
          onClick={onCancel}
          data-testid="rotate-confirm-cancel"
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--foreground)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
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

function statusLineStyle(): React.CSSProperties {
  return { marginTop: 12, fontSize: 13, fontWeight: 500 };
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
