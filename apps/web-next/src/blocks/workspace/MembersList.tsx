// L3 workspace block — <MembersList>.
//
// React island for the /workspace/members cabinet. Owns pagination
// state + the search query input; reads via useMembersSearch and
// renders rows through the generic <DataTable>.
//
// PR 2.2 ships only the read-only list + page-size 50 + a search box.
// Filters (country, seniority, industry, …) + cohort save/load come
// in 2.2b/2.2c follow-ups that build the same hook + DataTable
// without changing this block's contract.

import { Input } from '@/kit';
import type { MemberRow } from '@/lib/types';
import { useMembersSearch } from '@/lib/use-members';
import { type ReactElement, type ReactNode, useState } from 'react';
import { DataTable, type DataTableColumn } from './DataTable';

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
      const name = r.display_name?.trim() || r.first_name?.trim() || null;
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

export function MembersList(): ReactElement {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');

  const query = useMembersSearch({
    ...(committedQuery.length > 0 ? { q: committedQuery } : {}),
    page,
    limit: PAGE_SIZE,
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

  const onSearch = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setCommittedQuery(searchInput.trim());
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onSearch} className="flex items-center gap-2 max-w-md">
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by email, name, or role…"
          className="flex-1"
        />
        <button
          type="submit"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-background transition-colors"
        >
          Search
        </button>
        {committedQuery.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setCommittedQuery('');
              setPage(1);
            }}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-background transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      <DataTable
        columns={COLUMNS}
        rows={query.data?.members ?? []}
        rowKey={(r) => r.id}
        pagination={{ page, totalPages, onChange: setPage }}
        isLoading={query.isPending}
        errorMessage={query.error?.message ?? null}
        emptyHeading={committedQuery.length > 0 ? 'No matches' : 'No members yet'}
        emptyDescription={committedQuery.length > 0 ? `Nothing matches "${committedQuery}".` : ''}
      />

      {query.data && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {query.data.total.toLocaleString()} members total
        </p>
      )}
    </div>
  );
}

export default MembersList;
