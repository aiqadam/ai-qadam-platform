// L3 workspace block — <CountriesList>.
//
// Countries list cabinet at /workspace/admin/countries. Lists all
// countries with status (active/inactive), locale, currency, and a
// "Provision" action link to the provisioning wizard. Super-admin only.
//
// FR-MIG-012.

import { IslandRoot } from '@/lib/island-root';
import type { CountryRow } from '@/lib/types';
import { useCountries } from '@/lib/use-countries';
import { type ReactElement, type ReactNode, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';

// Country lead count and last event date are fetched per-country in
// follow-up PRs. For now we show status + metadata only.
const STATUS_TONE: Record<string, string> = {
  active: 'border-success/30 text-success bg-success/10',
  inactive: 'border-border text-muted-foreground bg-card',
};

function StatusBadge({ isActive }: { isActive: boolean }): ReactElement {
  return (
    <span
      className={`inline-block font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
        STATUS_TONE[isActive ? 'active' : 'inactive']
      }`}
    >
      {isActive ? 'active' : 'inactive'}
    </span>
  );
}

function renderOrDash(value: string | null | undefined): ReactNode {
  return value && value.trim().length > 0 ? (
    <span className="text-foreground">{value}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

const COLUMNS: ReadonlyArray<DataTableColumn<CountryRow>> = [
  {
    key: 'code',
    label: 'Code',
    width: 'sm',
    render: (r) => <span className="font-mono text-foreground uppercase">{r.code}</span>,
  },
  {
    key: 'name',
    label: 'Name',
    width: 'lg',
    render: (r) => renderOrDash(r.name),
  },
  {
    key: 'locale',
    label: 'Locale',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-[10px] text-muted-foreground">{r.default_locale}</span>
    ),
  },
  {
    key: 'currency',
    label: 'Currency',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-[10px] text-muted-foreground">{r.currency_code}</span>
    ),
  },
  {
    key: 'tz',
    label: 'TZ',
    width: 'sm',
    render: (r) => <span className="font-mono text-[10px] text-muted-foreground">{r.tz}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    width: 'sm',
    render: (r) => <StatusBadge isActive={r.is_active} />,
  },
  {
    key: 'holidays',
    label: 'Holidays',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-[10px] text-muted-foreground">
        {(r.public_holidays ?? []).length}
      </span>
    ),
  },
  {
    key: 'actions',
    label: '',
    align: 'right' as const,
    render: (r) => (
      <a
        href={`/workspace/admin/countries/${encodeURIComponent(r.code)}/provisioning`}
        className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
      >
        Provision
      </a>
    ),
  },
];

function CountriesListInner(): ReactElement {
  const query = useCountries();
  const [page, setPage] = useState(1);

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.length / 20)) : 1;
  const pageData = query.data?.slice((page - 1) * 20, page * 20) ?? [];

  return (
    <DataTable
      columns={COLUMNS}
      rows={pageData}
      rowKey={(r) => r.code}
      pagination={{ page, totalPages, onChange: setPage }}
      isLoading={query.isPending}
      errorMessage={query.error?.message ?? null}
      emptyHeading="No countries configured"
      emptyDescription="Provision a new country to get started."
    />
  );
}

export function CountriesList(): ReactElement {
  return (
    <IslandRoot>
      <CountriesListInner />
    </IslandRoot>
  );
}

export default CountriesList;
