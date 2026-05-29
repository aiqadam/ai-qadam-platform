// L3 workspace block — <EventsList>.
//
// Operator event control-panel cabinet island. Read-only list of all
// events the caller can see (country scoping rides on ADR-0021 RBAC
// on the API side; the cabinet just renders whatever the endpoint
// returns). Filter chips for status; counts surface registered /
// waitlisted / attended at a glance.

import { IslandRoot } from '@/lib/island-root';
import {
  COUNTRY_CODES,
  type CountryCode,
  WORKSPACE_EVENT_STATUSES,
  type WorkspaceEventListItem,
  type WorkspaceEventStatus,
} from '@/lib/types';
import { useWorkspaceEvents } from '@/lib/use-workspace-events';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';

const STATUS_TONE: Record<WorkspaceEventStatus, string> = {
  draft: 'border-border text-muted-foreground bg-card',
  published: 'border-primary/30 text-primary bg-primary/10',
  cancelled: 'border-destructive/30 text-destructive bg-destructive/10',
};

function StatusBadge({ status }: { status: WorkspaceEventStatus }): ReactElement {
  return (
    <span
      className={`inline-block font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_TONE[status]}`}
    >
      {status}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-mono text-[11px] px-2 py-1 rounded border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-muted-foreground border-border hover:border-primary/40'
      }`}
    >
      {children}
    </button>
  );
}

const COLUMNS: ReadonlyArray<DataTableColumn<WorkspaceEventListItem>> = [
  {
    key: 'starts_at',
    label: 'Starts',
    width: 'sm',
    render: (r) => (
      <time
        dateTime={r.starts_at}
        className="font-mono text-[10px] text-muted-foreground whitespace-nowrap"
      >
        {new Date(r.starts_at).toISOString().slice(0, 16).replace('T', ' ')}
      </time>
    ),
  },
  {
    key: 'title',
    label: 'Title',
    width: 'lg',
    render: (r) => (
      <div className="flex flex-col gap-0.5 min-w-0">
        <a
          href={`/workspace/events/${r.id}`}
          className="text-foreground hover:text-primary truncate font-medium"
        >
          {r.title}
        </a>
        {r.location && <span className="text-xs text-muted-foreground truncate">{r.location}</span>}
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    width: 'sm',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'format',
    label: 'Format',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {r.format}
      </span>
    ),
  },
  {
    key: 'country',
    label: 'CC',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-[10px] uppercase text-muted-foreground">{r.country}</span>
    ),
  },
  {
    key: 'counts',
    label: 'Registrations',
    render: (r) => {
      const capacityHint = r.capacity != null ? ` / ${r.capacity}` : '';
      return (
        <span className="font-mono text-xs text-muted-foreground">
          <span className="text-foreground">{r.counts.registered}</span>
          {capacityHint} reg
          {r.counts.waitlisted > 0 && ` · ${r.counts.waitlisted} wait`}
          {r.counts.attended > 0 && ` · ${r.counts.attended} att`}
        </span>
      );
    },
  },
];

function passesStatusFilter(
  row: WorkspaceEventListItem,
  status: WorkspaceEventStatus | 'all',
): boolean {
  return status === 'all' || row.status === status;
}

function passesCountryFilter(row: WorkspaceEventListItem, country: CountryCode | 'all'): boolean {
  return country === 'all' || row.country === country;
}

function EventsListInner(): ReactElement {
  const query = useWorkspaceEvents();
  const [status, setStatus] = useState<WorkspaceEventStatus | 'all'>('all');
  const [country, setCountry] = useState<CountryCode | 'all'>('all');

  const rows = useMemo(() => {
    if (!query.data) return [];
    return query.data.events.filter(
      (e) => passesStatusFilter(e, status) && passesCountryFilter(e, country),
    );
  }, [query.data, status, country]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Status
          </span>
          <FilterChip active={status === 'all'} onClick={() => setStatus('all')}>
            all
          </FilterChip>
          {WORKSPACE_EVENT_STATUSES.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {s}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Country
          </span>
          <FilterChip active={country === 'all'} onClick={() => setCountry('all')}>
            all
          </FilterChip>
          {COUNTRY_CODES.map((c) => (
            <FilterChip key={c} active={country === c} onClick={() => setCountry(c)}>
              {c}
            </FilterChip>
          ))}
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        errorMessage={query.error?.message ?? null}
        emptyHeading="No matching events"
        emptyDescription="Adjust the filters or create one via the operator playbook."
      />

      {query.data && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {rows.length} shown · {query.data.events.length} total
        </p>
      )}
    </div>
  );
}

export function EventsList(): ReactElement {
  return (
    <IslandRoot>
      <EventsListInner />
    </IslandRoot>
  );
}

export default EventsList;
