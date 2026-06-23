// L3 workspace block — <TgBroadcastsList>.
//
// Telegram broadcast list cabinet. DataTable with status filter dropdown,
// title/country/status/scheduled/sent/created columns, plus create button.
//
// FR-MIG-015.
//
// AGENTS.md §5: Presentation-only — no direct API calls inside the block.

import { Button } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import { type BroadcastStatus, type BroadcastSummary } from '@/lib/types';
import { useTgBroadcasts } from '@/lib/use-tg-broadcasts';
import { Plus } from 'lucide-react';
import { type ReactElement, useCallback, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';

const STATUS_LABELS: Record<BroadcastStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
};

const STATUS_COLORS: Record<BroadcastStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  sending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  sent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

function StatusChip({ status }: { status: BroadcastStatus }): ReactElement {
  return (
    <span className={`rounded px-2 py-0.5 font-mono text-xs uppercase ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function TgBroadcastsListInner(): ReactElement {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const query = useTgBroadcasts(statusFilter || undefined);

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
  }, []);

  const columns: ReadonlyArray<DataTableColumn<BroadcastSummary>> = [
    {
      key: 'title',
      label: 'Title',
      width: 'lg',
      render: (r) => <span className="font-medium text-foreground">{r.title}</span>,
    },
    {
      key: 'country',
      label: 'Country',
      width: 'sm',
      render: (r) => (
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs uppercase text-muted-foreground">
          {r.country}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 'sm',
      render: (r) => <StatusChip status={r.status} />,
    },
    {
      key: 'scheduled',
      label: 'Scheduled',
      width: 'md',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'sent',
      label: 'Sent',
      width: 'sm',
      render: (r) => (
        <span className="font-mono text-sm text-muted-foreground">{r.sent_count}</span>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      width: 'md',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {new Date(r.date_created).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      width: 'sm',
      render: (r) => (
        <Button variant="outline" size="sm" asChild>
          <a href={`/workspace/integrations/telegram/broadcasts/${r.id}`}>View</a>
        </Button>
      ),
    },
  ];

  if (query.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Failed to load broadcasts. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label
            htmlFor="status-filter"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={handleStatusChange}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="sending">Sending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <Button asChild>
          <a href="/workspace/integrations/telegram/broadcasts/new">
            <Plus className="mr-1.5 h-4 w-4" />
            New broadcast
          </a>
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(r) => r.id}
        isLoading={query.isLoading}
        emptyHeading="No broadcasts yet"
        emptyDescription="Create your first broadcast to reach your Telegram audience."
      />
    </div>
  );
}

export function TgBroadcastsList(): ReactElement {
  return (
    <IslandRoot>
      <TgBroadcastsListInner />
    </IslandRoot>
  );
}

export default TgBroadcastsList;
