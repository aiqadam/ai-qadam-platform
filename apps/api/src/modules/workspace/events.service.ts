import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DirectusClient, DirectusError } from '../directus/directus.client';
import { EventBroadcastService } from './event-broadcast.service';

// F-S3.4 — operator-side event control panel data.
//
// Proxies Directus reads/writes for the event-management cabinet:
//   - listing the operator's events with registration counts
//   - reading a single event with its followups + registration breakdown
//   - patching editable fields (title, description, status, dates, capacity,
//     location)
//   - upserting an event_followup row (mark complete + write body_md)
//
// Country scoping waits on ADR-0021 RBAC (Sprint 2.2). Today every
// authenticated operator sees every event — same posture as F-S3.2 +
// F-S3.3 cabinets.

const FOLLOWUP_KINDS = [
  'retrospective',
  'thank_you_sent',
  'recap_posted',
  'sponsor_report_delivered',
] as const;
export type FollowupKind = (typeof FOLLOWUP_KINDS)[number];

export interface EventRow {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'cancelled';
  format: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  location: string | null;
  country: string;
  date_created: string;
  date_updated: string | null;
  // PR-D3 — FK to forms.id; null when no in-house survey is attached.
  // Coexists with events.feedback_survey_url (external URL escape
  // hatch from #322): in-house form wins when both are set.
  post_event_survey_form?: string | null;
}

export interface RegistrationCounts {
  registered: number;
  waitlisted: number;
  cancelled: number;
  attended: number;
}

export interface EventListItem extends EventRow {
  counts: RegistrationCounts;
}

export interface EventFollowup {
  id: string;
  kind: FollowupKind;
  body_md: string | null;
  due_at: string | null;
  completed_at: string | null;
}

export interface EventDetail extends EventListItem {
  followups: EventFollowup[];
}

function isFollowupKind(value: string): value is FollowupKind {
  return (FOLLOWUP_KINDS as readonly string[]).includes(value);
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly broadcast: EventBroadcastService,
  ) {}

  async list(): Promise<EventListItem[]> {
    const res = await this.directus.get<{ data: EventRow[] }>(
      '/items/events?sort=-starts_at&limit=200&fields=*',
    );
    const events = res.data;
    const counts = await this.countsForEvents(events.map((e) => e.id));
    return events.map((e) => ({ ...e, counts: counts[e.id] ?? emptyCounts() }));
  }

  async getById(id: string): Promise<EventDetail> {
    const eventRes = await this.directus
      .get<{ data: EventRow }>(`/items/events/${encodeURIComponent(id)}?fields=*`)
      .catch((err) => {
        if (err instanceof DirectusError && err.status === 404) return null;
        throw err;
      });
    if (!eventRes?.data) throw new NotFoundException(`event ${id} not found`);
    const [counts, followups] = await Promise.all([
      this.countsForEvents([id]),
      this.followupsForEvent(id),
    ]);
    return {
      ...eventRes.data,
      counts: counts[id] ?? emptyCounts(),
      followups,
    };
  }

  async patch(id: string, body: PatchEventInput): Promise<EventDetail> {
    // F-S1.1a — detect draft → published flip to fire the event_announce
    // dispatch. We snapshot the prior status BEFORE the patch so the
    // broadcast only fires on a true transition (re-saving an already-
    // published event with the same status is a no-op).
    let priorStatus: EventRow['status'] | null = null;
    if (body.status === 'published') {
      const prior = await this.directus
        .get<{ data: { status: EventRow['status'] } }>(
          `/items/events/${encodeURIComponent(id)}?fields=status`,
        )
        .catch(() => null);
      priorStatus = prior?.data?.status ?? null;
    }

    await this.directus.patch(`/items/events/${encodeURIComponent(id)}`, body);

    if (body.status === 'published' && priorStatus !== 'published') {
      // Best-effort: never let a broadcast failure block the patch
      // response. EventBroadcastService itself is idempotent on
      // (event, kind='published') via the event_announcements row.
      this.broadcast.broadcastPublication(id).catch((err) => {
        this.logger.warn(
          `publication broadcast failed event=${id}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      });
    }

    return this.getById(id);
  }

  async upsertFollowup(
    eventId: string,
    kind: FollowupKind,
    body: UpsertFollowupInput,
  ): Promise<EventFollowup> {
    const existing = await this.findFollowup(eventId, kind);
    const patchBody: Record<string, unknown> = {};
    if (body.body_md !== undefined) patchBody.body_md = body.body_md;
    if (body.completed !== undefined) {
      patchBody.completed_at = body.completed ? new Date().toISOString() : null;
    }
    if (existing) {
      const res = await this.directus.patch<{ data: EventFollowup }>(
        `/items/event_followups/${encodeURIComponent(existing.id)}`,
        patchBody,
      );
      return res.data;
    }
    const res = await this.directus.post<{ data: EventFollowup }>('/items/event_followups', {
      event: eventId,
      kind,
      ...patchBody,
    });
    return res.data;
  }

  private async countsForEvents(eventIds: string[]): Promise<Record<string, RegistrationCounts>> {
    if (eventIds.length === 0) return {};
    const filter = encodeURIComponent(JSON.stringify({ event: { _in: eventIds } }));
    const res = await this.directus.get<{
      data: Array<{ event: string; status: string; count: { id: number } }>;
    }>(
      `/items/registrations?filter=${filter}&aggregate[count]=id&groupBy[]=event&groupBy[]=status&limit=-1`,
    );
    const out: Record<string, RegistrationCounts> = {};
    for (const row of res.data) {
      if (!out[row.event]) out[row.event] = emptyCounts();
      const slot = out[row.event];
      if (slot) applyCountToSlot(slot, row.status, row.count.id);
    }
    return out;
  }

  private async followupsForEvent(eventId: string): Promise<EventFollowup[]> {
    const filter = encodeURIComponent(JSON.stringify({ event: { _eq: eventId } }));
    const res = await this.directus.get<{ data: EventFollowup[] }>(
      `/items/event_followups?filter=${filter}&sort=kind&fields=id,kind,body_md,due_at,completed_at&limit=20`,
    );
    return res.data.filter((f) => isFollowupKind(f.kind));
  }

  private async findFollowup(eventId: string, kind: FollowupKind): Promise<{ id: string } | null> {
    const filter = encodeURIComponent(
      JSON.stringify({ event: { _eq: eventId }, kind: { _eq: kind } }),
    );
    const res = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/event_followups?filter=${filter}&fields=id&limit=1`,
    );
    return res.data[0] ?? null;
  }
}

function emptyCounts(): RegistrationCounts {
  return { registered: 0, waitlisted: 0, cancelled: 0, attended: 0 };
}

function applyCountToSlot(slot: RegistrationCounts, status: string, n: number): void {
  switch (status) {
    case 'registered':
      slot.registered = n;
      break;
    case 'waitlisted':
      slot.waitlisted = n;
      break;
    case 'cancelled':
      slot.cancelled = n;
      break;
    case 'attended':
      slot.attended = n;
      break;
    default:
  }
}

export interface PatchEventInput {
  title?: string | undefined;
  description?: string | undefined;
  status?: EventRow['status'] | undefined;
  starts_at?: string | undefined;
  ends_at?: string | undefined;
  capacity?: number | null | undefined;
  location?: string | null | undefined;
  // PR-D3 — operator picks the in-house form template attached as
  // post-event survey. Nullable to "detach" the form.
  post_event_survey_form?: string | null | undefined;
}

export interface UpsertFollowupInput {
  body_md?: string | null | undefined;
  completed?: boolean | undefined;
}
