// L3 workspace block — <EventKpiStrip>.
//
// M2.2a KPI bar: live registration counts for the event control panel.
// Renders registration / waitlist / cancelled / attended as a horizontal
// stat row. Reads the same useWorkspaceEvent query as sibling blocks,
// so TanStack serves it from cache (no extra network call).

import { IslandRoot } from '@/lib/island-root';
import { type WorkspaceRegistrationCounts } from '@/lib/types';
import { useWorkspaceEvent } from '@/lib/use-workspace-events';
import { type ReactElement } from 'react';

interface KpiCardProps {
  label: string;
  value: number;
  accent?: boolean;
}

function KpiCard({ label, value, accent }: KpiCardProps): ReactElement {
  return (
    <div className="flex flex-col gap-1 min-w-[4rem]">
      <span
        className={`font-display text-2xl font-semibold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}
      >
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

interface EventKpiStripProps {
  eventId: string;
}

function EventKpiStripInner({ eventId }: EventKpiStripProps): ReactElement {
  const query = useWorkspaceEvent(eventId);

  if (query.isPending || query.error || !query.data) {
    return <div className="h-[4.5rem]" aria-hidden="true" />;
  }

  const counts: WorkspaceRegistrationCounts = query.data.event.counts;

  return (
    <div className="flex items-center gap-8 py-3 px-4 rounded-lg bg-secondary/30 border border-border">
      <KpiCard label="Registered" value={counts.registered} accent />
      <KpiCard label="Waitlisted" value={counts.waitlisted} />
      <KpiCard label="Cancelled" value={counts.cancelled} />
      <KpiCard label="Checked in" value={counts.attended} />
    </div>
  );
}

export function EventKpiStrip(props: EventKpiStripProps): ReactElement {
  return (
    <IslandRoot>
      <EventKpiStripInner {...props} />
    </IslandRoot>
  );
}

export default EventKpiStrip;
