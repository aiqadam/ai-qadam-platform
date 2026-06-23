// L3 workspace block — <MembersList>.
//
// React island for the /workspace/members cabinet. Owns pagination +
// search + filter state; reads via useMembersSearch and renders rows
// through the generic <DataTable>.
//
// PR 2.2 shipped list + search; M2.3a adds the 7-primitive filter
// sheet (<MembersFilterPanel> over the <Drawer> atom). Cohort
// save/load rides on this same applied-filter state in M2.3b.
// M2.3c adds active-filter chips bar and URL param sync.

import { Button, Input } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import {
  EMPTY_MEMBER_FILTERS,
  type MemberFilters,
  buildMemberFilter,
  getActiveFilterChips,
  parseDirectusToMemberFilters,
  parseParamsToFilters,
  serializeFiltersToParams,
} from '@/lib/member-filters';
import type { CohortRow, MemberRow } from '@/lib/types';
import { useMembersSearch } from '@/lib/use-members';
import { type ReactElement, type ReactNode, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';
import { FilterChip } from './FilterChip';
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

interface FilterChipsBarProps {
  filters: MemberFilters;
  onRemoveFilter: (key: keyof MemberFilters) => void;
  onClearAll: () => void;
}

function FilterChipsBar({
  filters,
  onRemoveFilter,
  onClearAll,
}: FilterChipsBarProps): ReactElement | null {
  const chips = getActiveFilterChips(filters);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Active filters
      </span>
      {chips.map((chip) => (
        <FilterChip key={chip.key} active={true} onClick={() => onRemoveFilter(chip.key)}>
          {chip.label}: {chip.value}
        </FilterChip>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="font-mono text-[11px] px-2 py-1 rounded border border-border bg-card text-muted-foreground hover:border-destructive/40 hover:text-destructive transition-colors"
      >
        Clear all
      </button>
    </div>
  );
}

// Custom hook for filter state + URL sync. Extracted from MembersListInner
// to keep cognitive complexity below 10 (Biome max-cyclomatic: 10).
function useFilterState() {
  const [filters, setFilters] = useState<MemberFilters>(EMPTY_MEMBER_FILTERS);
  const [initialized, setInitialized] = useState(false);

  // Read filters from URL on mount (browser only).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilters(parseParamsToFilters(params));
    setInitialized(true);
  }, []);

  const syncFiltersToUrl = (next: MemberFilters): void => {
    const params = serializeFiltersToParams(next);
    const search = params.toString();
    const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    window.history.pushState({}, '', newUrl);
  };

  const applyFilters = (next: MemberFilters): void => {
    setFilters(next);
    syncFiltersToUrl(next);
  };

  const removeFilter = (key: keyof MemberFilters): void => {
    const next: MemberFilters = { ...filters, [key]: '' };
    applyFilters(next);
  };

  const clearAllFilters = (): void => {
    applyFilters(EMPTY_MEMBER_FILTERS);
  };

  const loadCohortFilters = (cohort: CohortRow): void => {
    const parsed = parseDirectusToMemberFilters(cohort.filter_query);
    applyFilters(parsed);
  };

  return {
    filters,
    initialized,
    applyFilters,
    removeFilter,
    clearAllFilters,
    loadCohortFilters,
  };
}

// Extracted to a sub-component to keep MembersListInner cognitive complexity ≤ 10.
interface MembersTableProps {
  query: ReturnType<typeof useMembersSearch>;
  page: number;
  totalPages: number;
  narrowed: boolean;
  onPageChange: (p: number) => void;
}

function MembersTable({
  query,
  page,
  totalPages,
  narrowed,
  onPageChange,
}: MembersTableProps): ReactElement {
  return (
    <>
      <DataTable
        columns={COLUMNS}
        rows={query.data?.members ?? []}
        rowKey={(r) => r.id}
        pagination={{ page, totalPages, onChange: onPageChange }}
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
    </>
  );
}

function MembersListInner(): ReactElement {
  const [page, setPage] = useState(1);
  const [committedQuery, setCommittedQuery] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const { filters, initialized, applyFilters, removeFilter, clearAllFilters, loadCohortFilters } =
    useFilterState();

  const filterObj = useMemo(() => buildMemberFilter(filters), [filters]);
  const hasFilter = Object.keys(filterObj).length > 0;

  const query = useMembersSearch({
    ...(committedQuery.length > 0 ? { q: committedQuery } : {}),
    ...(hasFilter && initialized ? { filter: filterObj } : {}),
    page,
    limit: PAGE_SIZE,
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;
  const narrowed = committedQuery.length > 0 || hasFilter;

  const onCommitQuery = (q: string): void => {
    setCommittedQuery(q);
    setPage(1);
  };

  const loadCohort = (cohort: CohortRow): void => {
    loadCohortFilters(cohort);
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

      <FilterChipsBar
        filters={filters}
        onRemoveFilter={removeFilter}
        onClearAll={clearAllFilters}
      />

      <SaveCohortModal open={saveOpen} onOpenChange={setSaveOpen} filterQuery={filterObj} />

      <MembersTable
        query={query}
        page={page}
        totalPages={totalPages}
        narrowed={narrowed}
        onPageChange={setPage}
      />
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
