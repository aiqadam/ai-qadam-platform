// L3 workspace block — <SavedCohortsPanel>.
//
// List of saved cohorts, rendered above the search bar inside the
// Members cabinet. Mirrors v1's MemberDirectory left rail in spirit
// (named filter sets the operator can reuse) but laid out horizontally
// to fit alongside the search controls without crowding the table.
//
// M2.3b-i shipped read-only display. M2.3b-ii added SaveCohortModal.
// M2.3b-iii (this PR) wires click-to-load: when the parent passes
// `onLoadCohort`, each card becomes a button that calls back with the
// row, and <MembersList> applies its filter via parseDirectusToMember-
// Filters. Outside that wiring the panel stays display-only.

import { IslandRoot } from '@/lib/island-root';
import type { CohortRow } from '@/lib/types';
import { useCohorts, useDeleteCohort } from '@/lib/use-cohorts';
import type { ReactElement } from 'react';

interface CohortCardProps {
  cohort: CohortRow;
  onLoad?: (cohort: CohortRow) => void;
  // Pending vs delete is tracked at the panel level (one mutation, one
  // in-flight id) so the card only needs a flag + a handler.
  onDelete: (cohort: CohortRow) => void;
  isDeleting: boolean;
}

function CohortCard({ cohort, onLoad, onDelete, isDeleting }: CohortCardProps): ReactElement {
  // Avoid nested-button accessibility issue: the card body is a button
  // only when onLoad is supplied; the Delete control lives in a footer
  // ROW outside the load button.
  const bodyClass =
    'flex flex-col gap-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm';
  const body = (
    <>
      <div className="truncate text-sm font-medium text-foreground" title={cohort.name}>
        {cohort.name}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {cohort.member_count_cached.toLocaleString()} members
      </div>
      {cohort.description ? (
        <div className="line-clamp-2 text-xs text-muted-foreground" title={cohort.description}>
          {cohort.description}
        </div>
      ) : null}
    </>
  );
  return (
    <div className="flex min-w-[200px] max-w-[260px] flex-col gap-2 rounded-md border border-border bg-card p-3">
      {onLoad ? (
        <button
          type="button"
          onClick={() => onLoad(cohort)}
          disabled={isDeleting}
          title={`Load "${cohort.name}" into the search filters`}
          className={`${bodyClass} hover:bg-muted/50 disabled:opacity-50`}
        >
          {body}
        </button>
      ) : (
        <div className={bodyClass}>{body}</div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onDelete(cohort)}
          disabled={isDeleting}
          className="font-mono text-[10px] uppercase tracking-wider text-destructive hover:underline disabled:opacity-50"
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

interface SavedCohortsPanelProps {
  onLoadCohort?: (cohort: CohortRow) => void;
}

function SavedCohortsPanelInner({ onLoadCohort }: SavedCohortsPanelProps): ReactElement {
  const query = useCohorts();
  const deleteMutation = useDeleteCohort();
  // Track which cohort is in-flight so other cards stay enabled.
  const deletingId =
    deleteMutation.isPending && typeof deleteMutation.variables === 'string'
      ? deleteMutation.variables
      : null;
  const handleDelete = (cohort: CohortRow): void => {
    deleteMutation.mutate(cohort.id);
  };

  if (query.isPending) {
    return (
      <section aria-labelledby="cohorts-heading" className="space-y-2">
        <Heading />
        <p className="text-xs text-muted-foreground">Loading cohorts…</p>
      </section>
    );
  }

  if (query.error) {
    return (
      <section aria-labelledby="cohorts-heading" className="space-y-2">
        <Heading />
        <p className="text-xs text-destructive">Cohorts unavailable: {query.error.message}</p>
      </section>
    );
  }

  const cohorts = query.data ?? [];

  if (cohorts.length === 0) {
    return (
      <section aria-labelledby="cohorts-heading" className="space-y-2">
        <Heading />
        <p className="text-xs text-muted-foreground">
          Apply at least one filter, then "Save as cohort" — saved cohorts will appear here for
          one-click recall.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="cohorts-heading" className="space-y-2">
      <Heading />
      {deleteMutation.error ? (
        <p className="text-xs text-destructive" role="alert">
          Couldn't delete cohort: {deleteMutation.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {cohorts.map((c) => (
          <CohortCard
            key={c.id}
            cohort={c}
            {...(onLoadCohort ? { onLoad: onLoadCohort } : {})}
            onDelete={handleDelete}
            isDeleting={deletingId === c.id}
          />
        ))}
      </div>
    </section>
  );
}

function Heading(): ReactElement {
  return (
    <h2
      id="cohorts-heading"
      className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
    >
      Saved cohorts
    </h2>
  );
}

export function SavedCohortsPanel(props: SavedCohortsPanelProps = {}): ReactElement {
  return (
    <IslandRoot>
      <SavedCohortsPanelInner {...props} />
    </IslandRoot>
  );
}
