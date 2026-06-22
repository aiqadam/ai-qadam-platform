import { Injectable, Logger } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';
import { MembersService } from './members.service';

// F-S1.1a — state-driven dispatch on event lifecycle. Today only
// `published` (draft → published flip) fires; F-S1.1b adds
// `speaker_added`, F-S1.1c adds `post_event_followup`. Each kind is
// idempotent via the (event, kind) row in `event_announcements`.
//
// Audience for `published`: every member in the event's country. The
// dispatcher then runs per-recipient consent checks against the
// `events` purpose (member_consents) at delivery time, so anyone who
// revoked consent is silently skipped (delivery state = skipped_consent
// in the deliveries table — operator sees the breakdown).
//
// Per [ux-and-content-guidelines.md §13](docs/04-development/design-system/ux-and-content-guidelines.md#13-notification-copy-library)
// canonical subject + body shape for `event_announce`.

export type AnnouncementKind = 'published' | 'speaker_added' | 'post_event_followup';

export interface BroadcastResult {
  status: 'dispatched' | 'already_dispatched' | 'no_audience';
  interactionId: string | null;
  recipientCount: number;
}

interface EventRow {
  id: string;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  location: string | null;
  country: string;
}

interface AnnouncementRow {
  id: string;
  event: string;
  kind: AnnouncementKind;
  dispatched_interaction_id: string | null;
  recipient_count: number;
  sent_at: string;
}

@Injectable()
export class EventBroadcastService {
  private readonly logger = new Logger(EventBroadcastService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly members: MembersService,
    private readonly interactions: InteractionsService,
  ) {}

  /**
   * Dispatch `event_announce` to every consented member in the event's
   * country. Idempotent on (event, kind='published'): second call returns
   * `already_dispatched`.
   */
  async broadcastPublication(eventId: string): Promise<BroadcastResult> {
    const existing = await this.findAnnouncement(eventId, 'published');
    if (existing) {
      this.logger.log(
        `publication broadcast skipped — already dispatched event=${eventId} interaction=${existing.dispatched_interaction_id}`,
      );
      return {
        status: 'already_dispatched',
        interactionId: existing.dispatched_interaction_id,
        recipientCount: existing.recipient_count,
      };
    }

    const event = await this.fetchEvent(eventId);
    const { userIds, total } = await this.members.resolveToUserIds({
      country: { _eq: event.country },
    });
    if (userIds.length === 0) {
      await this.recordAnnouncement(eventId, 'published', null, 0);
      this.logger.log(
        `publication broadcast — no audience event=${eventId} country=${event.country}`,
      );
      return { status: 'no_audience', interactionId: null, recipientCount: 0 };
    }

    const { interactionId } = await this.interactions.dispatch({
      initiatorActor: 'system',
      audience: { userIds },
      intent: 'event_announce',
      payload: buildAnnouncePayload(event),
      consentBasis: 'explicit_opt_in',
      consentScope: { purpose: 'events' },
      allowedChannels: ['email'],
    });

    await this.recordAnnouncement(eventId, 'published', interactionId, total);
    this.logger.log(
      `publication broadcast dispatched event=${eventId} interaction=${interactionId} audience=${userIds.length}`,
    );
    return { status: 'dispatched', interactionId, recipientCount: userIds.length };
  }

  private async findAnnouncement(
    eventId: string,
    kind: AnnouncementKind,
  ): Promise<AnnouncementRow | null> {
    const filter = encodeURIComponent(
      JSON.stringify({ event: { _eq: eventId }, kind: { _eq: kind } }),
    );
    const res = await this.directus.get<{ data: AnnouncementRow[] }>(
      `/items/event_announcements?filter=${filter}&fields=id,event,kind,dispatched_interaction_id,recipient_count,sent_at&limit=1`,
    );
    return res.data[0] ?? null;
  }

  private async fetchEvent(eventId: string): Promise<EventRow> {
    const res = await this.directus.get<{ data: EventRow }>(
      `/items/events/${encodeURIComponent(eventId)}?fields=id,title,status,starts_at,ends_at,capacity,location,country`,
    );
    if (!res.data) throw new Error(`event ${eventId} not found`);
    return res.data;
  }

  private async recordAnnouncement(
    eventId: string,
    kind: AnnouncementKind,
    interactionId: string | null,
    recipientCount: number,
  ): Promise<void> {
    await this.directus.post('/items/event_announcements', {
      event: eventId,
      kind,
      dispatched_interaction_id: interactionId,
      recipient_count: recipientCount,
    });
  }
}

function buildAnnouncePayload(event: EventRow): Record<string, unknown> {
  // Per ux-and-content-guidelines §13 `event_announce` row. v1 uses a
  // pragmatic substitute set: no per-recipient first_name (dispatcher
  // doesn't render templates yet — see [feedback-vertical-features…]),
  // venue inline, registration link absolute. Personalization (first_name,
  // country_lead_first_name, first_speaker_or_topic_hook) lands when the
  // dispatcher gains a template renderer.
  const dateShort = formatDateShort(event.starts_at);
  const dateLong = formatDateLong(event.starts_at);
  const venue = event.location ?? 'venue TBA';
  const capacityHint = event.capacity ? `Cap at ${event.capacity}; first-come basis.` : '';
  const registerLink = `https://aiqadam.org/events/${event.id}`;
  return {
    subject: `${event.title} — ${dateShort}`,
    text: `The next AI Qadam event is on.\n\n${event.title} on ${dateLong}. ${venue}.\n\nRegistration is open now: ${registerLink}\n${capacityHint}\n\n— AI Qadam`,
  };
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
