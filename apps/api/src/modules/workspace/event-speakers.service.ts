import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DirectusClient, DirectusError } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';

// F-S1.1b — speaker_added flow.
//
// CRUD on event_speakers + dispatch when a speaker's status flips to
// 'confirmed'. Per-speaker idempotency uses the
// (event_announcements.event, kind='speaker_added', speaker) tuple — the
// `speaker` FK was added to event_announcements alongside this PR.

export const EVENT_SPEAKER_STATUSES = [
  'invited',
  'accepted',
  'confirmed',
  'declined',
  'cancelled',
] as const;
export type EventSpeakerStatus = (typeof EVENT_SPEAKER_STATUSES)[number];

export interface EventSpeakerRow {
  id: string;
  event: string;
  speaker:
    | string
    | {
        id: string;
        headline: string | null;
        user: { id: string; first_name: string | null; last_name: string | null; email: string };
      };
  talk_title: string | null;
  talk_topic: string | null;
  status: EventSpeakerStatus;
  confirmed_at: string | null;
  order_index: number;
}

export interface EventSpeakerView {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerHeadline: string | null;
  talkTitle: string | null;
  talkTopic: string | null;
  status: EventSpeakerStatus;
  confirmedAt: string | null;
  orderIndex: number;
}

export interface CreateEventSpeakerInput {
  speakerId: string;
  talkTitle?: string | null | undefined;
  talkTopic?: string | null | undefined;
  orderIndex?: number | undefined;
}

export interface PatchEventSpeakerInput {
  status?: EventSpeakerStatus | undefined;
  talkTitle?: string | null | undefined;
  talkTopic?: string | null | undefined;
  orderIndex?: number | undefined;
}

interface SpeakerExpansionRow {
  id: string;
  headline: string | null;
  user: { id: string; first_name: string | null; last_name: string | null; email: string };
}

@Injectable()
export class EventSpeakersService {
  private readonly logger = new Logger(EventSpeakersService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly interactions: InteractionsService,
  ) {}

  async list(eventId: string): Promise<EventSpeakerView[]> {
    const filter = encodeURIComponent(JSON.stringify({ event: { _eq: eventId } }));
    const fields =
      'id,event,speaker.id,speaker.headline,speaker.user.id,speaker.user.first_name,speaker.user.last_name,speaker.user.email,talk_title,talk_topic,status,confirmed_at,order_index';
    const res = await this.directus.get<{ data: EventSpeakerRow[] }>(
      `/items/event_speakers?filter=${filter}&fields=${fields}&sort=order_index,date_created&limit=200`,
    );
    return res.data.map(toView);
  }

  async create(eventId: string, input: CreateEventSpeakerInput): Promise<EventSpeakerView> {
    // Dedupe: if (event, speaker) already exists, reject — operator can
    // PATCH to update talk details. Otherwise we'd silently mask a typo.
    const dupe = await this.findExisting(eventId, input.speakerId);
    if (dupe) {
      throw new ConflictException(`speaker ${input.speakerId} already on event ${eventId}`);
    }
    const body: Record<string, unknown> = {
      event: eventId,
      speaker: input.speakerId,
      order_index: input.orderIndex ?? 100,
      status: 'invited',
    };
    if (input.talkTitle !== undefined) body.talk_title = input.talkTitle;
    if (input.talkTopic !== undefined) body.talk_topic = input.talkTopic;
    const res = await this.directus.post<{ data: { id: string } }>('/items/event_speakers', body);
    return this.fetchOne(res.data.id);
  }

  async patch(eventSpeakerId: string, input: PatchEventSpeakerInput): Promise<EventSpeakerView> {
    const prior = await this.fetchOne(eventSpeakerId);
    const patchBody: Record<string, unknown> = {};
    if (input.talkTitle !== undefined) patchBody.talk_title = input.talkTitle;
    if (input.talkTopic !== undefined) patchBody.talk_topic = input.talkTopic;
    if (input.orderIndex !== undefined) patchBody.order_index = input.orderIndex;
    if (input.status !== undefined) {
      patchBody.status = input.status;
      if (input.status === 'confirmed' && !prior.confirmedAt) {
        patchBody.confirmed_at = new Date().toISOString();
      }
    }
    await this.directus.patch(
      `/items/event_speakers/${encodeURIComponent(eventSpeakerId)}`,
      patchBody,
    );
    const next = await this.fetchOne(eventSpeakerId);
    // F-S1.1b + F-S1.1b ext — best-effort post-patch side effects.
    // When BOTH apply we sequence broadcast → og-refresh so members get
    // notified first + scrapers see the fresh lineup right after. When
    // only og-refresh applies (no status flip) it runs alone.
    const fieldChanged =
      input.status !== undefined ||
      input.talkTitle !== undefined ||
      input.talkTopic !== undefined ||
      input.orderIndex !== undefined;
    const becameConfirmed = input.status === 'confirmed' && prior.status !== 'confirmed';
    if (becameConfirmed) {
      this.broadcastSpeakerAdded(next)
        .then(() => (fieldChanged ? this.refreshEventOgCard(eventSpeakerId) : undefined))
        .catch((err) =>
          this.logger.warn(
            `speaker_added/og-refresh failed event_speaker=${eventSpeakerId}: ${err instanceof Error ? err.message : 'unknown'}`,
          ),
        );
    } else if (fieldChanged) {
      this.refreshEventOgCard(eventSpeakerId).catch((err) =>
        this.logger.warn(
          `og-refresh failed event_speaker=${eventSpeakerId}: ${err instanceof Error ? err.message : 'unknown'}`,
        ),
      );
    }
    return next;
  }

  /**
   * F-S1.1b ext — bump events.date_updated for `eventId` so the og-card
   * cache-buster query string changes. Called directly by EventsService
   * for the operator-facing "Refresh social card" button.
   */
  async touchEventForOgRefresh(eventId: string): Promise<void> {
    await this.directus.patch(`/items/events/${encodeURIComponent(eventId)}`, {
      date_updated: new Date().toISOString(),
    });
  }

  private async refreshEventOgCard(eventSpeakerId: string): Promise<void> {
    const eventId = await this.eventIdFor(eventSpeakerId);
    await this.touchEventForOgRefresh(eventId);
  }

  async remove(eventSpeakerId: string): Promise<void> {
    await this.directus.delete(`/items/event_speakers/${encodeURIComponent(eventSpeakerId)}`);
  }

  /**
   * Dispatch `speaker_added` to every registered/attended user of the
   * event. Idempotent per (event, speaker) via event_announcements.
   * Marked public for tests + potential future re-broadcast hook.
   */
  async broadcastSpeakerAdded(es: EventSpeakerView): Promise<void> {
    // Idempotency check.
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [
          { event: { _eq: await this.eventIdFor(es.id) } },
          { kind: { _eq: 'speaker_added' } },
          { speaker: { _eq: es.speakerId } },
        ],
      }),
    );
    const dupe = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/event_announcements?filter=${filter}&fields=id&limit=1`,
    );
    if (dupe.data.length > 0) {
      this.logger.log(
        `speaker_added skipped — already dispatched event_speaker=${es.id} speaker=${es.speakerId}`,
      );
      return;
    }
    const eventId = await this.eventIdFor(es.id);
    const event = await this.fetchEventBrief(eventId);
    const userIds = await this.attendeeUserIdsOf(eventId);
    if (userIds.length === 0) {
      await this.recordAnnouncement(eventId, es.speakerId, null, 0);
      this.logger.log(
        `speaker_added no-audience event=${eventId} speaker=${es.speakerId} — no attendees yet`,
      );
      return;
    }
    const { interactionId } = await this.interactions.dispatch({
      initiatorActor: 'system',
      audience: { userIds },
      intent: 'speaker_added',
      payload: buildSpeakerAddedPayload(es, event),
      consentBasis: 'operational_contract',
      allowedChannels: ['email'],
    });
    await this.recordAnnouncement(eventId, es.speakerId, interactionId, userIds.length);
    this.logger.log(
      `speaker_added dispatched event=${eventId} speaker=${es.speakerId} interaction=${interactionId} audience=${userIds.length}`,
    );
  }

  private async fetchOne(eventSpeakerId: string): Promise<EventSpeakerView> {
    const fields =
      'id,event,speaker.id,speaker.headline,speaker.user.id,speaker.user.first_name,speaker.user.last_name,speaker.user.email,talk_title,talk_topic,status,confirmed_at,order_index';
    const res = await this.directus
      .get<{ data: EventSpeakerRow }>(
        `/items/event_speakers/${encodeURIComponent(eventSpeakerId)}?fields=${fields}`,
      )
      .catch((err) => {
        if (err instanceof DirectusError && err.status === 404) return null;
        throw err;
      });
    if (!res?.data) throw new NotFoundException(`event_speaker ${eventSpeakerId} not found`);
    return toView(res.data);
  }

  private async eventIdFor(eventSpeakerId: string): Promise<string> {
    const res = await this.directus.get<{ data: { event: string } }>(
      `/items/event_speakers/${encodeURIComponent(eventSpeakerId)}?fields=event`,
    );
    if (!res.data) throw new NotFoundException(`event_speaker ${eventSpeakerId} not found`);
    return res.data.event;
  }

  private async findExisting(eventId: string, speakerId: string): Promise<{ id: string } | null> {
    const filter = encodeURIComponent(
      JSON.stringify({ event: { _eq: eventId }, speaker: { _eq: speakerId } }),
    );
    const res = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/event_speakers?filter=${filter}&fields=id&limit=1`,
    );
    return res.data[0] ?? null;
  }

  private async fetchEventBrief(eventId: string): Promise<{
    id: string;
    title: string;
    starts_at: string;
    location: string | null;
  }> {
    const res = await this.directus.get<{
      data: { id: string; title: string; starts_at: string; location: string | null };
    }>(`/items/events/${encodeURIComponent(eventId)}?fields=id,title,starts_at,location`);
    return res.data;
  }

  private async attendeeUserIdsOf(eventId: string): Promise<string[]> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [{ event: { _eq: eventId } }, { status: { _in: ['registered', 'attended'] } }],
      }),
    );
    const res = await this.directus.get<{ data: Array<{ user: string }> }>(
      `/items/registrations?filter=${filter}&fields=user&limit=5000`,
    );
    return res.data.map((r) => r.user);
  }

  private async recordAnnouncement(
    eventId: string,
    speakerId: string,
    interactionId: string | null,
    recipientCount: number,
  ): Promise<void> {
    await this.directus.post('/items/event_announcements', {
      event: eventId,
      kind: 'speaker_added',
      speaker: speakerId,
      dispatched_interaction_id: interactionId,
      recipient_count: recipientCount,
    });
  }
}

function toView(row: EventSpeakerRow): EventSpeakerView {
  const speakerExpansion: SpeakerExpansionRow | null =
    typeof row.speaker === 'string' ? null : row.speaker;
  const first = speakerExpansion?.user?.first_name ?? null;
  const last = speakerExpansion?.user?.last_name ?? null;
  const name = [first, last].filter((s) => s && s.length > 0).join(' ');
  return {
    id: row.id,
    speakerId: typeof row.speaker === 'string' ? row.speaker : row.speaker.id,
    speakerName: name || speakerExpansion?.user?.email || '(unknown speaker)',
    speakerHeadline: speakerExpansion?.headline ?? null,
    talkTitle: row.talk_title,
    talkTopic: row.talk_topic,
    status: row.status,
    confirmedAt: row.confirmed_at,
    orderIndex: row.order_index,
  };
}

function buildSpeakerAddedPayload(
  es: EventSpeakerView,
  event: { title: string; starts_at: string; location: string | null },
): Record<string, unknown> {
  const dateShort = new Date(event.starts_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const role = es.speakerHeadline ? ` (${es.speakerHeadline})` : '';
  const topic = es.talkTopic ? `They'll talk about "${es.talkTitle ?? es.talkTopic}".` : '';
  const venue = event.location ? ` at ${event.location}` : '';
  return {
    subject: `${es.speakerName} joins ${event.title}`,
    text: `${es.speakerName}${role} just confirmed for ${event.title} on ${dateShort}${venue}.\n\n${topic}\n\nYou're already registered — see you there.\n\n— AI Qadam`.trim(),
  };
}
