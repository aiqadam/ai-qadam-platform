// L3 workspace block — <CronStatusTable>.
//
// Super-admin cron health cabinet island. Reads /v1/workspace/internal-cron/status
// (gated by SuperAdminGuard) and renders the tick status via DataTable.
// Refresh button re-fetches the data.

import { IslandRoot } from '@/lib/island-root';
import type { TickHealthRow } from '@/lib/types';
import { useCronStatus } from '@/lib/use-cron-status';
import { type ReactElement } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';

function formatStaleness(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (60 * 24))}d ago`;
}

function OutcomeBadge({
  outcome,
  consecutiveFailures,
  error,
}: {
  outcome: 'success' | 'failed';
  consecutiveFailures: number;
  error: string | null;
}): ReactElement {
  if (outcome === 'success') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white bg-emerald-600">
        success{consecutiveFailures > 0 ? ' (was failing)' : ''}
      </span>
    );
  }
  return (
    <div className="space-y-1">
      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white bg-red-600">
        failed × {consecutiveFailures}
      </span>
      {error && (
        <div className="text-xs text-muted-foreground max-w-xs truncate" title={error}>
          {error}
        </div>
      )}
    </div>
  );
}

const COLUMNS: ReadonlyArray<DataTableColumn<TickHealthRow>> = [
  {
    key: 'name',
    label: 'Tick',
    render: (r) => (
      <div>
        <div className="font-semibold text-sm text-foreground">{r.label}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{r.name}</div>
      </div>
    ),
  },
  {
    key: 'schedule_description',
    label: 'Schedule',
    render: (r) => <span className="text-sm text-muted-foreground">{r.schedule_description}</span>,
  },
  {
    key: 'last_fire',
    label: 'Last fire',
    render: (r) =>
      r.last_fire === null ? (
        <span className="text-sm text-muted-foreground">never (last 24h)</span>
      ) : (
        <div>
          <div className="text-sm text-foreground">
            {new Date(r.last_fire.last_finished_at).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatStaleness(r.staleness_minutes)}
          </div>
        </div>
      ),
  },
  {
    key: 'duration',
    label: 'Duration',
    render: (r) =>
      r.last_fire === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="text-sm text-foreground">{r.last_fire.last_duration_ms}ms</span>
      ),
  },
  {
    key: 'outcome',
    label: 'Outcome',
    render: (r) =>
      r.last_fire === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <OutcomeBadge
          outcome={r.last_fire.last_outcome}
          consecutiveFailures={r.last_fire.consecutive_failures}
          error={r.last_fire.last_error}
        />
      ),
  },
];

function CronStatusTableInner(): ReactElement {
  const query = useCronStatus();

  return (
    <DataTable
      columns={COLUMNS}
      rows={query.data?.ticks ?? []}
      rowKey={(r) => r.name}
      isLoading={query.isPending}
      errorMessage={query.error?.message ?? null}
      emptyHeading="No cron jobs registered"
      emptyDescription="Cron jobs will appear here once they have been registered."
    />
  );
}

export function CronStatusTable(): ReactElement {
  return (
    <IslandRoot>
      <CronStatusTableInner />
    </IslandRoot>
  );
}

export default CronStatusTable;
