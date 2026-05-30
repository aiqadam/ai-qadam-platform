// L3 workspace block — <SavedCohortsPanel>.
//
// Read-only list of saved cohorts, rendered above the search bar inside
// the Members cabinet. Mirrors v1's MemberDirectory left rail in spirit
// (named filter sets the operator can reuse) but laid out horizontally
// to fit alongside the search controls without crowding the table.
//
// M2.3b-i ships this read-only display. M2.3b-ii makes each card click-
// loadable into MembersList's applied filter state, plus the
// SaveCohortModal that creates new cohorts.

import { IslandRoot } from '@/lib/island-root';
import type { CohortRow } from '@/lib/types';
import { useCohorts } from '@/lib/use-cohorts';
import type { ReactElement } from 'react';

interface CohortCardProps {
  cohort: CohortRow;
}

function CohortCard({ cohort }: CohortCardProps): ReactElement {
  return (
    <div className="flex min-w-[200px] max-w-[260px] flex-col gap-1 rounded-md border border-border bg-card p-3 text-left">
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
    </div>
  );
}

function SavedCohortsPanelInner(): ReactElement {
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
          Build your first cohort to target announcements precisely. Save modal lands next.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="cohorts-heading" className="space-y-2">
      <Heading />
      <div className="flex flex-wrap gap-2">
        {cohorts.map((c) => (
          <CohortCard key={c.id} cohort={c} />
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

export function SavedCohortsPanel(): ReactElement {
  return (
    <IslandRoot>
      <SavedCohortsPanelInner />
    </IslandRoot>
  );
}
