// L3 workspace block — <EventFollowups>.
//
// Second tier of the event control panel (M2.2b): the post-event
// followups checklist + the regenerate-social-card action. Reads the
// event detail (followups[]) via useWorkspaceEvent — same query key as
// <EventEditForm>, so TanStack serves it from cache (one network call
// for the page). Each of the four followup kinds toggles completed +
// holds an optional note, persisted via PUT :id/followups/:kind.

import { Button } from '@/kit';
import { IslandRoot } from '@/lib/island-root';
import {
  EVENT_FOLLOWUP_KINDS,
  type EventFollowupKind,
  type WorkspaceEventFollowup,
} from '@/lib/types';
import {
  useRegenerateSocialCard,
  useUpsertFollowup,
  useWorkspaceEvent,
} from '@/lib/use-workspace-events';
import { type ReactElement, useState } from 'react';

const KIND_LABEL: Record<EventFollowupKind, string> = {
  retrospective: 'Retrospective',
  thank_you_sent: 'Thank-you sent',
  recap_posted: 'Recap posted',
  sponsor_report_delivered: 'Sponsor report delivered',
};

function byKind(
  followups: WorkspaceEventFollowup[],
): Partial<Record<EventFollowupKind, WorkspaceEventFollowup>> {
  const map: Partial<Record<EventFollowupKind, WorkspaceEventFollowup>> = {};
  for (const f of followups) map[f.kind] = f;
  return map;
}

function FollowupRow({
  eventId,
  kind,
  existing,
}: {
  eventId: string;
  kind: EventFollowupKind;
  existing: WorkspaceEventFollowup | undefined;
}): ReactElement {
  const upsert = useUpsertFollowup(eventId);
  const [note, setNote] = useState(existing?.body_md ?? '');
  const completed = existing?.completed_at != null;

  const toggle = (): void => {
    upsert.mutate({ kind, completed: !completed });
  };
  const saveNote = (): void => {
    upsert.mutate({ kind, body_md: note.trim() === '' ? null : note.trim() });
  };

  return (
    <li className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={upsert.isPending}
          aria-pressed={completed}
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] transition-colors ${
            completed
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-transparent hover:border-primary/40'
          }`}
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground m-0">{KIND_LABEL[kind]}</p>
          {completed && existing?.completed_at && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground m-0 mt-0.5">
              done {new Date(existing.completed_at).toISOString().slice(0, 10)}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={20000}
          placeholder="Notes (optional)"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="button" variant="outline" onClick={saveNote} disabled={upsert.isPending}>
          Save note
        </Button>
      </div>
      {upsert.error && <p className="text-xs text-destructive m-0">{upsert.error.message}</p>}
    </li>
  );
}

function RegenCardRow({ eventId }: { eventId: string }): ReactElement {
  const regen = useRegenerateSocialCard(eventId);
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground m-0">Social card</p>
        <p className="text-xs text-muted-foreground m-0 mt-0.5">
          Bust the OG-image cache so scrapers re-fetch a fresh preview.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {regen.isSuccess && <span className="text-xs text-primary">✓ Regenerated</span>}
        {regen.error && <span className="text-xs text-destructive">{regen.error.message}</span>}
        <Button
          type="button"
          variant="outline"
          onClick={() => regen.mutate()}
          disabled={regen.isPending}
        >
          {regen.isPending ? 'Working…' : 'Regenerate'}
        </Button>
      </div>
    </div>
  );
}

function EventFollowupsInner({ eventId }: { eventId: string }): ReactElement {
  const query = useWorkspaceEvent(eventId);

  if (query.isPending || query.error || !query.data) {
    // The sibling <EventEditForm> already surfaces load/error state for
    // this same query; stay quiet here to avoid a duplicate message.
    return <div className="hidden" aria-hidden="true" />;
  }

  const map = byKind(query.data.event.followups);

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground m-0">Followups</h2>
        <ul className="list-none p-0 m-0 space-y-2">
          {EVENT_FOLLOWUP_KINDS.map((kind) => (
            <FollowupRow key={kind} eventId={eventId} kind={kind} existing={map[kind]} />
          ))}
        </ul>
      </section>
      <RegenCardRow eventId={eventId} />
    </div>
  );
}

export function EventFollowups(props: { eventId: string }): ReactElement {
  return (
    <IslandRoot>
      <EventFollowupsInner {...props} />
    </IslandRoot>
  );
}

export default EventFollowups;
