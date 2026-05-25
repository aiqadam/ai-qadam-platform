// L3 workspace block — <DataTable>.
//
// Generic paginated table powering every list cabinet under /workspace.
// Pure presentation: receives `columns` + `rows` + optional pagination
// state via props; consumers own the fetch + state (per ADR-0038
// §Locks #1, blocks don't fetch their own data).
//
// Sort + filter integration land in follow-up PRs once a second cabinet
// reuses the table. PR 2.2 ships the read-only column rendering + a
// simple prev/next pagination control.
//
// Usage:
//   <DataTable
//     columns={[
//       { key: 'email', label: 'Email', render: (r) => r.email },
//       { key: 'name',  label: 'Name',  render: (r) => r.first_name ?? '—' },
//     ]}
//     rows={data?.members ?? []}
//     pagination={{ page, totalPages, onChange: setPage }}
//     isLoading={isPending}
//     emptyHeading="No members yet"
//   />

import { type ReactElement, type ReactNode } from 'react';

export interface DataTableColumn<TRow> {
  key: string;
  label: string;
  render: (row: TRow) => ReactNode;
  width?: 'auto' | 'sm' | 'md' | 'lg';
  align?: 'left' | 'right';
}

export interface DataTablePagination {
  page: number;
  totalPages: number;
  onChange: (nextPage: number) => void;
}

interface Props<TRow> {
  columns: ReadonlyArray<DataTableColumn<TRow>>;
  rows: ReadonlyArray<TRow>;
  // Stable per-row key extractor. Defaults to row.id when present.
  rowKey?: (row: TRow) => string;
  pagination?: DataTablePagination;
  isLoading?: boolean;
  errorMessage?: string | null;
  emptyHeading?: string;
  emptyDescription?: string;
}

const WIDTH_CLASS: Record<NonNullable<DataTableColumn<unknown>['width']>, string> = {
  auto: '',
  sm: 'w-32',
  md: 'w-48',
  lg: 'w-64',
};

export function DataTable<TRow>({
  columns,
  rows,
  rowKey,
  pagination,
  isLoading = false,
  errorMessage = null,
  emptyHeading = 'No rows',
  emptyDescription = '',
}: Props<TRow>): ReactElement {
  const keyOf = (row: TRow, idx: number): string => {
    if (rowKey) return rowKey(row);
    const id = (row as { id?: unknown }).id;
    return typeof id === 'string' ? id : String(idx);
  };

  if (errorMessage) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {errorMessage}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-background">
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2.5 font-medium ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  } ${col.width ? WIDTH_CLASS[col.width] : ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  <p className="font-medium text-foreground m-0">{emptyHeading}</p>
                  {emptyDescription && <p className="text-xs mt-1 m-0">{emptyDescription}</p>}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={keyOf(row, idx)}
                  className="border-b border-border last:border-b-0 hover:bg-background/40 transition-colors"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 align-middle ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-background">
          <span className="font-mono text-[11px] text-muted-foreground">
            Page {pagination.page} / {pagination.totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => pagination.onChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || isLoading}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => pagination.onChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || isLoading}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
