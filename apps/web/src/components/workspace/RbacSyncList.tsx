import { type ReactElement, useEffect, useState } from 'react';

// F-S2.2-g — /workspace/admin/rbac-sync cabinet. Auto-redirects anon
// to Authentik (matches sibling cabinets); surfaces 403 cleanly when
// the signed-in user isn't a super-admin.

function signInUrl(): string {
  const next =
    typeof window === 'undefined'
      ? '/workspace/admin/rbac-sync'
      : window.location.pathname + window.location.search;
  return `/api/v1/auth/login?next=${encodeURIComponent(next)}`;
}

type EngineStatus = 'pending' | 'applied' | 'failed' | 'skipped' | 'dry_run';

interface ExpectedState {
  directus: { policies: string[]; filter_country: string | null };
  plausible: { sites: string[]; role: 'admin' | 'viewer' };
}

interface JobRow {
  id: string;
  user: string | null;
  user_email: string | null;
  triggered_by: 'webhook' | 'poll' | 'manual_retry' | 'activate_country';
  expected_state: ExpectedState;
  directus_status: EngineStatus;
  directus_error: string | null;
  plausible_status: EngineStatus;
  plausible_error: string | null;
  attempt: number;
  started_at: string;
  finished_at: string | null;
}

type State =
  | { phase: 'bootstrap' }
  | { phase: 'anon' }
  | { phase: 'forbidden' }
  | { phase: 'probe_error'; httpStatus: number }
  | { phase: 'ready'; accessToken: string; jobs: JobRow[]; filter: FilterKey };

type FilterKey = 'all' | 'pending' | 'applied' | 'failed' | 'dry_run';

const STATUS_COLOR: Record<EngineStatus, string> = {
  pending: '#3b82f6',
  applied: '#10b981',
  failed: '#dc2626',
  skipped: '#6b7280',
  dry_run: '#a78bfa',
};

const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'dry_run', label: 'Dry-run (review)' },
  { key: 'failed', label: 'Failed' },
  { key: 'applied', label: 'Applied' },
  { key: 'pending', label: 'Pending' },
];

async function bootstrap(filter: FilterKey): Promise<State> {
  const refresh = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (refresh.status === 401) return { phase: 'anon' };
  if (!refresh.ok) return { phase: 'probe_error', httpStatus: refresh.status };
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const qs =
    filter === 'all' ? '' : filter === 'failed' ? '?only_failed=true' : `?status=${filter}`;
  const res = await fetch(`/api/v1/admin/rbac-sync/jobs${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 403) return { phase: 'forbidden' };
  if (res.status === 401) return { phase: 'anon' };
  if (!res.ok) return { phase: 'probe_error', httpStatus: res.status };
  const { jobs } = (await res.json()) as { jobs: JobRow[] };
  return { phase: 'ready', accessToken, jobs, filter };
}

export default function RbacSyncList(): ReactElement {
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

  async function setFilter(filter: FilterKey): Promise<void> {
    setState({ phase: 'bootstrap' });
    setState(await bootstrap(filter));
  }

  async function retry(jobId: string): Promise<void> {
    if (state.phase !== 'ready') return;
    const res = await fetch(`/api/v1/admin/rbac-sync/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.accessToken}` },
    });
    if (!res.ok) {
      alert(`Retry failed: HTTP ${res.status}`);
      return;
    }
    setState(await bootstrap(state.filter));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={state.filter === tab.key ? 'btn btn-primary' : 'btn'}
            style={{ padding: '6px 12px', fontSize: 14 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {state.jobs.length === 0 ? (
        <p style={mutedStyle()}>No jobs in this state.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle()}>User</th>
              <th style={thStyle()}>Triggered</th>
              <th style={thStyle()}>Directus</th>
              <th style={thStyle()}>Plausible</th>
              <th style={thStyle()}>Started</th>
              <th style={thStyle()} />
            </tr>
          </thead>
          <tbody>
            {state.jobs.map((job) => {
              const isOpen = expanded === job.id;
              const canRetry =
                job.directus_status === 'failed' ||
                job.directus_status === 'dry_run' ||
                job.plausible_status === 'failed';
              return (
                <Row
                  key={job.id}
                  job={job}
                  isOpen={isOpen}
                  canRetry={canRetry}
                  onToggle={() => setExpanded(isOpen ? null : job.id)}
                  onRetry={() => retry(job.id)}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Row({
  job,
  isOpen,
  canRetry,
  onToggle,
  onRetry,
}: {
  job: JobRow;
  isOpen: boolean;
  canRetry: boolean;
  onToggle: () => void;
  onRetry: () => void;
}): ReactElement {
  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={tdStyle()}>
          {job.user_email ?? <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
        </td>
        <td style={tdStyle()}>
          <code style={{ fontSize: 12 }}>{job.triggered_by}</code>
        </td>
        <td style={tdStyle()}>{statusPill(job.directus_status)}</td>
        <td style={tdStyle()}>{statusPill(job.plausible_status)}</td>
        <td style={{ ...tdStyle(), color: 'var(--muted-foreground)', fontSize: 12 }}>
          {new Date(job.started_at).toLocaleString()}
        </td>
        <td style={tdStyle()}>
          <button
            type="button"
            onClick={onToggle}
            className="btn"
            style={{ fontSize: 12, padding: '4px 8px', marginRight: 4 }}
          >
            {isOpen ? 'Hide' : 'Diff'}
          </button>
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              Retry
            </button>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={6} style={{ padding: '12px 16px', background: 'var(--muted)' }}>
            <pre style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(job.expected_state, null, 2)}
            </pre>
            {(job.directus_error || job.plausible_error) && (
              <p style={{ marginTop: 8, fontSize: 12, color: 'var(--destructive)' }}>
                {job.directus_error && <span>Directus: {job.directus_error} · </span>}
                {job.plausible_error && <span>Plausible: {job.plausible_error}</span>}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function statusPill(status: EngineStatus): ReactElement {
  return (
    <span
      style={{
        background: STATUS_COLOR[status],
        color: 'white',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
      }}
    >
      {status}
    </span>
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
