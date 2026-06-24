// L3 workspace block — <SavedSegmentsPanel>.
//
// FR-MIG-029 — lists unified audience segments (from /v1/admin/segments)
// below the Members filter panel. Each segment shows its name, type badge,
// cached member count, and quick-load / delete controls.
//
// Loading a segment restores the filter state exactly as cohort loading
// does — the parent passes `onLoadSegment` which calls back with the
// stored filter_query. Deleting a segment calls useDeleteSegment.

import { IslandRoot } from '@/lib/island-root';
import type { SegmentRow, SegmentType } from '@/lib/types';
import { useDeleteSegment, useSegments } from '@/lib/use-segments';
import type { ReactElement } from 'react';

const SEGMENT_TYPE_LABELS: Record<SegmentType, string> = {
  announcement: 'ANN',
  telegram: 'TG',
  both: 'BOTH',
};

interface SegmentCardProps {
  segment: SegmentRow;
  onLoad?: (segment: SegmentRow) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

function SegmentCard({ segment, onLoad, onDelete, isDeleting }: SegmentCardProps): ReactElement {
  const bodyClass =
    'flex flex-col gap-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm';

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span
          className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-muted-foreground"
          title={`Segment type: ${segment.segment_type}`}
        >
          {SEGMENT_TYPE_LABELS[segment.segment_type]}
        </span>
        <span className="truncate text-sm font-medium text-foreground" title={segment.name}>
          {segment.name}
        </span>
      </div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {segment.member_count_cached.toLocaleString()} members
      </div>
    </>
  );

  return (
    <div className="flex min-w-[200px] max-w-[260px] flex-col gap-2 rounded-md border border-border bg-card p-3">
      {onLoad ? (
        <button
          type="button"
          onClick={() => onLoad(segment)}
          disabled={isDeleting}
          title={`Load "${segment.name}" into the search filters`}
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
          onClick={() => onDelete(segment.id)}
          disabled={isDeleting}
          className="font-mono text-[10px] uppercase tracking-wider text-destructive hover:underline disabled:opacity-50"
        >
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

interface SavedSegmentsPanelProps {
  onLoadSegment?: (filterQuery: Record<string, unknown>) => void;
}

function SavedSegmentsPanelInner({ onLoadSegment }: SavedSegmentsPanelProps): ReactElement {
  const query = useSegments();
  const deleteMutation = useDeleteSegment();
  const deletingId =
    deleteMutation.isPending && typeof deleteMutation.variables === 'string'
      ? deleteMutation.variables
      : null;

  const handleDelete = (id: string): void => {
    deleteMutation.mutate(id);
  };

  if (query.isPending) {
    return (
      <section aria-labelledby="segments-heading" className="space-y-2">
        <Heading />
        <p className="text-xs text-muted-foreground">Loading segments…</p>
      </section>
    );
  }

  if (query.error) {
    return (
      <section aria-labelledby="segments-heading" className="space-y-2">
        <Heading />
        <p className="text-xs text-destructive">Segments unavailable: {query.error.message}</p>
      </section>
    );
  }

  const segments = query.data ?? [];

  if (segments.length === 0) {
    return (
      <section aria-labelledby="segments-heading" className="space-y-2">
        <Heading />
        <p className="text-xs text-muted-foreground">
          Open the Filters panel, apply filters, then toggle "Save as segment" to create a reusable
          audience.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="segments-heading" className="space-y-2">
      <Heading />
      {deleteMutation.error ? (
        <p className="text-xs text-destructive" role="alert">
          Couldn't delete segment: {deleteMutation.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {segments.map((s) => (
          <SegmentCard
            key={s.id}
            segment={s}
            {...(onLoadSegment ? { onLoad: (seg) => onLoadSegment(seg.filter_query) } : {})}
            onDelete={handleDelete}
            isDeleting={deletingId === s.id}
          />
        ))}
      </div>
    </section>
  );
}

function Heading(): ReactElement {
  return (
    <h2
      id="segments-heading"
      className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
    >
      Saved segments
    </h2>
  );
}

export function SavedSegmentsPanel(props: SavedSegmentsPanelProps = {}): ReactElement {
  return (
    <IslandRoot>
      <SavedSegmentsPanelInner {...props} />
    </IslandRoot>
  );
}

export default SavedSegmentsPanel;
