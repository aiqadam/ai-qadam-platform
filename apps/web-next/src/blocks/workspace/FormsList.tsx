// L3 workspace block — <FormsList>.
//
// Operator forms-library cabinet island. Read-only list of all form
// templates the operator team manages — post-event surveys, sponsor
// onboarding forms, etc. Status + country filter chips + DataTable
// with submission counts.
//
// Per-form detail page (builder + responses inbox + aggregate) is
// deferred to PR 2.10 — those need separate slices for builder
// fields + submissions table + chart visualisation.

import {
  COUNTRY_CODES,
  type CountryCode,
  WORKSPACE_FORM_STATUSES,
  type WorkspaceFormRow,
  type WorkspaceFormStatus,
} from '@/lib/types';
import { useWorkspaceForms } from '@/lib/use-workspace-forms';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';

const STATUS_TONE: Record<WorkspaceFormStatus, string> = {
  draft: 'border-border text-muted-foreground bg-card',
  published: 'border-primary/30 text-primary bg-primary/10',
  archived: 'border-border text-muted-foreground bg-card opacity-60',
};

function StatusBadge({ status }: { status: WorkspaceFormStatus }): ReactElement {
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

const COLUMNS: ReadonlyArray<DataTableColumn<WorkspaceFormRow>> = [
  {
    key: 'title',
    label: 'Title',
    width: 'lg',
    render: (r) => (
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-foreground truncate">{r.title}</span>
        <span className="font-mono text-[10px] text-muted-foreground truncate">@{r.slug}</span>
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
    key: 'country',
    label: 'CC',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-[10px] uppercase text-muted-foreground">{r.country}</span>
    ),
  },
  {
    key: 'anon',
    label: 'Anon',
    width: 'sm',
    render: (r) => (
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {r.allow_anonymous ? 'yes' : 'no'}
      </span>
    ),
  },
  {
    key: 'submissions',
    label: 'Submissions',
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">
        <span className="text-foreground">{r.submission_count.toLocaleString()}</span> total
      </span>
    ),
  },
  {
    key: 'updated',
    label: 'Updated',
    width: 'sm',
    render: (r) =>
      r.date_updated ? (
        <time
          dateTime={r.date_updated}
          className="font-mono text-[10px] text-muted-foreground whitespace-nowrap"
        >
          {new Date(r.date_updated).toISOString().slice(0, 10)}
        </time>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

function passesStatusFilter(row: WorkspaceFormRow, status: WorkspaceFormStatus | 'all'): boolean {
  return status === 'all' || row.status === status;
}

function passesCountryFilter(row: WorkspaceFormRow, country: CountryCode | 'all'): boolean {
  return country === 'all' || row.country === country;
}

export function FormsList(): ReactElement {
  const query = useWorkspaceForms();
  const [status, setStatus] = useState<WorkspaceFormStatus | 'all'>('all');
  const [country, setCountry] = useState<CountryCode | 'all'>('all');

  const rows = useMemo(() => {
    if (!query.data) return [];
    return query.data.forms.filter(
      (f) => passesStatusFilter(f, status) && passesCountryFilter(f, country),
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
          {WORKSPACE_FORM_STATUSES.map((s) => (
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
        emptyHeading="No matching forms"
        emptyDescription="Adjust the filters or create one via the forms-builder cabinet."
      />

      {query.data && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {rows.length} shown · {query.data.forms.length} total
        </p>
      )}
    </div>
  );
}

export default FormsList;
