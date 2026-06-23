// L3 workspace block — <RbacSyncList>.
//
// Super-admin RBAC sync cabinet island. Reads /v1/admin/rbac-sync/jobs
// (gated by SuperAdminGuard) and renders the sync job list with filter
// tabs and a "Trigger sync" button. Supports retry on individual jobs.

import { IslandRoot } from '@/lib/island-root';
import type { RbacSyncEngineStatus, RbacSyncFilter, RbacSyncJobRow } from '@/lib/types';
import { useRbacSyncJobs, useRetryRbacSyncJob, useTriggerRbacSync } from '@/lib/use-rbac-sync';
import { type ReactElement, useState } from 'react';
import { FilterChip } from './FilterChip';

const STATUS_COLOR: Record<RbacSyncEngineStatus, string> = {
  pending: 'bg-blue-500',
  applied: 'bg-emerald-600',
  failed: 'bg-red-600',
  skipped: 'bg-gray-500',
  dry_run: 'bg-violet-500',
};

const FILTER_TABS: Array<{ key: RbacSyncFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'dry_run', label: 'Dry-run (review)' },
  { key: 'failed', label: 'Failed' },
  { key: 'applied', label: 'Applied' },
  { key: 'pending', label: 'Pending' },
];

function StatusPill({ status }: { status: RbacSyncEngineStatus }): ReactElement {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white ${STATUS_COLOR[status]}`}
    >
      {status}
    </span>
  );
}

function JobRow({
  job,
  isOpen,
  canRetry,
  onToggle,
  onRetry,
}: {
  job: RbacSyncJobRow;
  isOpen: boolean;
  canRetry: boolean;
  onToggle: () => void;
  onRetry: () => void;
}): ReactElement {
  return (
    <>
      <tr className="border-b border-border">
        <td className="px-3 py-3 align-top">
          {job.user_email ?? <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-3 py-3 align-top">
          <code className="font-mono text-[10px] text-muted-foreground">{job.triggered_by}</code>
        </td>
        <td className="px-3 py-3 align-top">
          <StatusPill status={job.directus_status} />
        </td>
        <td className="px-3 py-3 align-top">
          <StatusPill status={job.plausible_status} />
        </td>
        <td className="px-3 py-3 align-top text-xs text-muted-foreground">
          {new Date(job.started_at).toLocaleString()}
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onToggle}
              className="px-2 py-1 text-xs border border-border rounded hover:bg-muted transition-colors"
            >
              {isOpen ? 'Hide' : 'Diff'}
            </button>
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
              >
                Retry
              </button>
            )}
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-muted">
            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap mb-2">
              {JSON.stringify(job.expected_state, null, 2)}
            </pre>
            {(job.directus_error || job.plausible_error) && (
              <p className="text-xs text-destructive">
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

function RbacSyncListInner(): ReactElement {
  const [filter, setFilter] = useState<RbacSyncFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useRbacSyncJobs(filter);
  const { trigger, isPending: isTriggering } = useTriggerRbacSync();
  const { retry } = useRetryRbacSyncJob();

  const handleTrigger = async (): Promise<void> => {
    try {
      await trigger();
    } catch (err) {
      alert(`Trigger failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => (
            <FilterChip
              key={tab.key}
              active={filter === tab.key}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
            </FilterChip>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void handleTrigger()}
          disabled={isTriggering}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isTriggering ? 'Triggering…' : 'Trigger sync'}
        </button>
      </div>

      {query.isPending ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : query.error ? (
        <p className="text-sm text-destructive py-8 text-center">
          Failed to load: {query.error.message}
        </p>
      ) : query.data?.jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No jobs in this state.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                User
              </th>
              <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                Triggered
              </th>
              <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                Directus
              </th>
              <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                Plausible
              </th>
              <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                Started
              </th>
              <th className="px-3 py-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground" />
            </tr>
          </thead>
          <tbody>
            {query.data?.jobs.map((job) => {
              const isOpen = expanded === job.id;
              const canRetry =
                job.directus_status === 'failed' ||
                job.directus_status === 'dry_run' ||
                job.plausible_status === 'failed';
              return (
                <JobRow
                  key={job.id}
                  job={job}
                  isOpen={isOpen}
                  canRetry={canRetry}
                  onToggle={() => setExpanded(isOpen ? null : job.id)}
                  onRetry={() => void retry(job.id)}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function RbacSyncList(): ReactElement {
  return (
    <IslandRoot>
      <RbacSyncListInner />
    </IslandRoot>
  );
}

export default RbacSyncList;
