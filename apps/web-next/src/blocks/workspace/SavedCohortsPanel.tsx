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
import { useCohorts } from '@/lib/use-cohorts';
import type { ReactElement } from 'react';

interface CohortCardProps {
  cohort: CohortRow;
  onClick?: (cohort: CohortRow) => void;
}

function CohortCard({ cohort, onClick }: CohortCardProps): ReactElement {
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

  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => onClick(cohort)}
        title={`Load "${cohort.name}" into the search filters`}
        className="flex min-w-[200px] max-w-[260px] flex-col gap-1 rounded-md border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </button>
    );
  }
  return (
    <div className="flex min-w-[200px] max-w-[260px] flex-col gap-1 rounded-md border border-border bg-card p-3 text-left">
      {body}
    </div>
  );
}

interface SavedCohortsPanelProps {
  onLoadCohort?: (cohort: CohortRow) => void;
}

function SavedCohortsPanelInner({ onLoadCohort }: SavedCohortsPanelProps): ReactElement {
  const query = useCohorts();

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
      <div className="flex flex-wrap gap-2">
        {cohorts.map((c) => (
          <CohortCard key={c.id} cohort={c} {...(onLoadCohort ? { onClick: onLoadCohort } : {})} />
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
