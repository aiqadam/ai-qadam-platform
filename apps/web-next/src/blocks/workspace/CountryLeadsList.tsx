// L3 workspace block — <CountryLeadsList>.
//
// Super-admin cabinet at /workspace/country-leads. Lists all country leads
// (candidate / active / inactive) with country badge and activation date.
// "Onboard new lead" button links to /workspace/country-leads/new.
// FR-MIG-028.

import { IslandRoot } from '@/lib/island-root';
import type { CountryLeadRow, CountryLeadStatus } from '@/lib/types';
import { COUNTRY_LEAD_STATUSES } from '@/lib/types';
import { useCountryLeads } from '@/lib/use-country-leads';
import { type ReactElement, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';
import { FilterChip } from './FilterChip';

type StatusFilter = CountryLeadStatus | 'all';

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  ...COUNTRY_LEAD_STATUSES.map((s) => ({ value: s as StatusFilter, label: s })),
];

const STATUS_BADGE_CLASSES: Record<CountryLeadStatus, string> = {
  candidate: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  active: 'bg-emerald-600/10 text-emerald-600 border-emerald-600/30',
  inactive: 'bg-zinc-400/10 text-zinc-500 border-zinc-400/30',
};

function StatusBadge({ status }: { status: CountryLeadStatus }): ReactElement {
  return (
    <span
      className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_BADGE_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}

const COLUMNS: ReadonlyArray<DataTableColumn<CountryLeadRow>> = [
  {
    key: 'email',
    label: 'Lead',
    width: 'lg',
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <span className="text-foreground font-medium">
          {r.display_name ?? r.email}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{r.email}</span>
      </div>
    ),
  },
  {
    key: 'country',
    label: 'Country',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-xs uppercase text-muted-foreground">{r.country}</span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    width: 'sm',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'activated_at',
    label: 'Activated',
    render: (r) =>
      r.activated_at ? (
        <span className="font-mono text-[10px] text-muted-foreground">
          {new Date(r.activated_at).toLocaleDateString()}
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      ),
  },
  {
    key: 'id',
    label: 'Action',
    width: 'sm',
    render: (r) =>
      r.status === 'candidate' ? (
        <a
          href={`/workspace/country-leads/new?leadId=${encodeURIComponent(r.id)}`}
          className="text-xs text-primary hover:underline"
        >
          Onboard →
        </a>
      ) : null,
  },
];

function CountryLeadsHeader(): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Country leads
      </span>
      <a
        href="/workspace/country-leads/new"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        + Onboard new lead
      </a>
    </div>
  );
}

function StatusFilterBar({
  active,
  onChange,
}: {
  active: StatusFilter;
  onChange: (s: StatusFilter) => void;
}): ReactElement {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Status
      </span>
      {STATUS_FILTERS.map((f) => (
        <FilterChip key={f.value} active={active === f.value} onClick={() => onChange(f.value)}>
          {f.label}
        </FilterChip>
      ))}
    </div>
  );
}

function CountryLeadsListInner(): ReactElement {
  const query = useCountryLeads();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const rows = useMemo(() => {
    if (!query.data) return [];
    if (statusFilter === 'all') return query.data.leads;
    return query.data.leads.filter((l) => l.status === statusFilter);
  }, [query.data, statusFilter]);

  return (
    <div className="space-y-4">
      <CountryLeadsHeader />
      <StatusFilterBar active={statusFilter} onChange={setStatusFilter} />
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        isLoading={query.isPending}
        errorMessage={query.error?.message ?? null}
        emptyHeading="No country leads yet"
        emptyDescription="Onboard a candidate to create the first country lead record."
      />
      {query.data && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {rows.length} shown · {query.data.leads.length} total
        </p>
      )}
    </div>
  );
}

export function CountryLeadsList(): ReactElement {
  return (
    <IslandRoot>
      <CountryLeadsListInner />
    </IslandRoot>
  );
}
