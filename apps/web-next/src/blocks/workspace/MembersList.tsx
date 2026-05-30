// L3 workspace block — <MembersList>.
//
// React island for the /workspace/members cabinet. Owns pagination +
// search + filter state; reads via useMembersSearch and renders rows
// through the generic <DataTable>.
//
// PR 2.2 shipped list + search; M2.3a adds the 7-primitive filter
// sheet (<MembersFilterPanel> over the <Drawer> atom). Cohort
// save/load rides on this same applied-filter state in M2.3b.

import { Button, Input } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import {
  EMPTY_MEMBER_FILTERS,
  type MemberFilters,
  buildMemberFilter,
  parseDirectusToMemberFilters,
} from '@/lib/member-filters';
import type { CohortRow, MemberRow } from '@/lib/types';
import { useMembersSearch } from '@/lib/use-members';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';
import { MembersFilterPanel } from './MembersFilterPanel';
import { SaveCohortModal } from './SaveCohortModal';
import { SavedCohortsPanel } from './SavedCohortsPanel';

const PAGE_SIZE = 50;

const COLUMNS: ReadonlyArray<DataTableColumn<MemberRow>> = [
  {
    key: 'email',
    label: 'Email',
    width: 'lg',
    render: (r) => <span className="text-foreground">{r.email}</span>,
  },
  {
    key: 'name',
    label: 'Name',
    width: 'md',
    render: (r) => {
      const name = r.first_name?.trim() || null;
      return name ? (
        <span className="text-foreground">{name}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  },
  {
    key: 'job_title',
    label: 'Role',
    render: (r) => renderOrDash(r.job_title),
  },
  {
    key: 'seniority',
    label: 'Seniority',
    width: 'sm',
    render: (r) =>
      r.seniority ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {r.seniority}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: 'city',
    label: 'City',
    width: 'sm',
    render: (r) => renderOrDash(r.city),
  },
  {
    key: 'state',
    label: 'State',
    width: 'sm',
    render: (r) =>
      r.state ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {r.state}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

function renderOrDash(value: string | null | undefined): ReactNode {
  return value && value.trim().length > 0 ? (
    <span className="text-foreground">{value}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

interface SearchBarProps {
  onCommit: (q: string) => void;
}
function SearchBar({ onCommit }: SearchBarProps): ReactElement {
  const [input, setInput] = useState('');
  const [committed, setCommitted] = useState(false);
  const submit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setCommitted(input.trim().length > 0);
    onCommit(input.trim());
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2 flex-1 min-w-[260px] max-w-md">
      <Input
        type="search"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search by email, name, or role…"
        className="flex-1"
      />
      <button
        type="submit"
        className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-background transition-colors"
      >
        Search
      </button>
      {committed && (
        <button
          type="button"
          onClick={() => {
            setInput('');
            setCommitted(false);
            onCommit('');
          }}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-background transition-colors"
        >
          Clear
        </button>
      )}
    </form>
  );
}

interface ToolbarProps {
  filters: MemberFilters;
  hasFilter: boolean;
  onCommitQuery: (q: string) => void;
  onApplyFilters: (next: MemberFilters) => void;
  onOpenSave: () => void;
}
function Toolbar({
  filters,
  hasFilter,
  onCommitQuery,
  onApplyFilters,
  onOpenSave,
}: ToolbarProps): ReactElement {
  const saveButtonTitle = hasFilter
    ? 'Save the current filter as a cohort'
    : 'Apply at least one filter to save a cohort';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBar onCommit={onCommitQuery} />
      <MembersFilterPanel applied={filters} onApply={onApplyFilters} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasFilter}
        onClick={onOpenSave}
        title={saveButtonTitle}
      >
        Save as cohort
      </Button>
    </div>
  );
}

function MembersListInner(): ReactElement {
  const [page, setPage] = useState(1);
  const [committedQuery, setCommittedQuery] = useState('');
  const [filters, setFilters] = useState<MemberFilters>(EMPTY_MEMBER_FILTERS);
  const [saveOpen, setSaveOpen] = useState(false);

  const filterObj = useMemo(() => buildMemberFilter(filters), [filters]);
  const hasFilter = Object.keys(filterObj).length > 0;

  const query = useMembersSearch({
    ...(committedQuery.length > 0 ? { q: committedQuery } : {}),
    ...(hasFilter ? { filter: filterObj } : {}),
    page,
    limit: PAGE_SIZE,
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;
  const narrowed = committedQuery.length > 0 || hasFilter;

  const onCommitQuery = (q: string): void => {
    setCommittedQuery(q);
    setPage(1);
  };
  const applyFilters = (next: MemberFilters): void => {
    setFilters(next);
    setPage(1);
  };
  const loadCohort = (cohort: CohortRow): void => {
    setFilters(parseDirectusToMemberFilters(cohort.filter_query));
    setCommittedQuery('');
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <SavedCohortsPanel onLoadCohort={loadCohort} />

      <Toolbar
        filters={filters}
        hasFilter={hasFilter}
        onCommitQuery={onCommitQuery}
        onApplyFilters={applyFilters}
        onOpenSave={() => setSaveOpen(true)}
      />

      <SaveCohortModal open={saveOpen} onOpenChange={setSaveOpen} filterQuery={filterObj} />

      <DataTable
        columns={COLUMNS}
        rows={query.data?.members ?? []}
        rowKey={(r) => r.id}
        pagination={{ page, totalPages, onChange: setPage }}
        isLoading={query.isPending}
        errorMessage={query.error?.message ?? null}
        emptyHeading={narrowed ? 'No matches' : 'No members yet'}
        emptyDescription={narrowed ? 'No members match the current search + filters.' : ''}
      />

      {query.data && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {query.data.total.toLocaleString()} members
          {narrowed ? ' match' : ' total'}
        </p>
      )}
    </div>
  );
}

export function MembersList(): ReactElement {
  return (
    <IslandRoot>
      <MembersListInner />
    </IslandRoot>
  );
}

export default MembersList;
