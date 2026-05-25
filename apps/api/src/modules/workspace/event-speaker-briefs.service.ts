import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DirectusClient } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';
import { TickLockService } from '../internal-cron/tick-lock.service';

// F-S1.4b — T-7 speaker brief cron.
//
// Mirrors F-S1.4 reminders + F-S1.5 matches: one tick endpoint, hourly,
// finds events in the T-7 window, fans out per-speaker. Each confirmed
// speaker on a T-7 event gets one personal brief covering their talk
// title + venue + current registered audience count.
//
// Idempotency tuple is (event, kind='reminder_t_minus_7_speaker', speaker)
// — reuses the event_announcements.speaker FK added in F-S1.1b for
// speaker_added. One row per (event, speaker) prevents re-sending if the
// cron runs multiple times in the window.
//
// Why per-speaker dispatch (not one announcement per event): the brief
// is personal — "your talk", their title, their slot — so each speaker
// gets a separately tracked dispatch.

export type SpeakerBriefKind = 'reminder_t_minus_7_speaker';
const KIND: SpeakerBriefKind = 'reminder_t_minus_7_speaker';
const INTENT = 'speaker_brief';

// T-7 days = 168h. Window [156h, 180h] gives a 24h tolerance — wide
// enough that an hourly cron catches each event exactly once even if a
// tick is skipped. Per-(event, speaker) ledger prevents double-sending.
const WINDOW_FROM_HOURS = 156;
const WINDOW_TO_HOURS = 180;

export interface TickResult {
  evaluated: number;
  dispatched: Array<{
    eventId: string;
    speakerId: string;
    interactionId: string;
  }>;
  skipped: Array<{
    eventId: string;
    speakerId: string;
    reason: 'already_dispatched' | 'no_user';
  }>;
  errors: Array<{ eventId: string; speakerId: string; message: string }>;
}

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  country: string;
}

interface SpeakerEntry {
  eventSpeakerId: string;
  speakerId: string;
  userId: string | null;
  talkTitle: string | null;
  speakerName: string;
}

interface SpeakerExpansionRow {
  id: string;
  speaker: {
    id: string;
    user: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
    } | null;
  } | null;
  talk_title: string | null;
}

@Injectable()
export class EventSpeakerBriefsService {
  private readonly logger = new Logger(EventSpeakerBriefsService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly interactions: InteractionsService,
    private readonly locks: TickLockService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledTick(): Promise<void> {
    await this.locks.withLock('event-speaker-briefs', 540, async () => {
      const r = await this.tick();
      if (r.dispatched.length > 0) {
        this.logger.log(`scheduledTick dispatched=${r.dispatched.length}`);
      }
    });
  }

  async tick(): Promise<TickResult> {
    const result: TickResult = { evaluated: 0, dispatched: [], skipped: [], errors: [] };
    const events = await this.candidatesInWindow();
    for (const event of events) {
      await this.processEvent(event, result);
    }
    this.logger.log(
      `event-speaker-briefs tick — events=${events.length} evaluated=${result.evaluated} dispatched=${result.dispatched.length} skipped=${result.skipped.length} errors=${result.errors.length}`,
    );
    return result;
  }

  private async processEvent(event: EventRow, result: TickResult): Promise<void> {
    const speakers = await this.confirmedSpeakersOf(event.id);
    result.evaluated += speakers.length;
    if (speakers.length === 0) return;
    const registeredCount = await this.registeredCountOf(event.id);
    for (const speaker of speakers) {
      await this.dispatchSafely(event, speaker, registeredCount, result);
    }
  }

  private async dispatchSafely(
    event: EventRow,
    speaker: SpeakerEntry,
    registeredCount: number,
    result: TickResult,
  ): Promise<void> {
    if (!speaker.userId) {
      result.skipped.push({
        eventId: event.id,
        speakerId: speaker.speakerId,
        reason: 'no_user',
      });
      return;
    }
    const alreadyDispatched = await this.findAnnouncement(event.id, speaker.speakerId);
    if (alreadyDispatched) {
      result.skipped.push({
        eventId: event.id,
        speakerId: speaker.speakerId,
        reason: 'already_dispatched',
      });
      return;
    }
    try {
      const { interactionId } = await this.interactions.dispatch({
        initiatorActor: 'system',
        audience: { userIds: [speaker.userId] },
        intent: INTENT,
        payload: buildBriefPayload(event, speaker, registeredCount),
        consentBasis: 'operational_contract',
        allowedChannels: ['email'],
      });
      await this.recordAnnouncement(event.id, speaker.speakerId, interactionId, 1);
      result.dispatched.push({
        eventId: event.id,
        speakerId: speaker.speakerId,
        interactionId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `speaker-brief dispatch failed event=${event.id} speaker=${speaker.speakerId}: ${message}`,
      );
      result.errors.push({ eventId: event.id, speakerId: speaker.speakerId, message });
    }
  }

  private async candidatesInWindow(): Promise<EventRow[]> {
    const now = Date.now();
    const from = new Date(now + WINDOW_FROM_HOURS * 3600 * 1000).toISOString();
    const to = new Date(now + WINDOW_TO_HOURS * 3600 * 1000).toISOString();
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [
          { status: { _eq: 'published' } },
          { starts_at: { _gte: from } },
          { starts_at: { _lte: to } },
        ],
      }),
    );
    const fields = 'id,title,starts_at,location,country';
    const res = await this.directus.get<{ data: EventRow[] }>(
      `/items/events?filter=${filter}&fields=${fields}&sort=starts_at&limit=200`,
    );
    return res.data;
  }

  private async confirmedSpeakersOf(eventId: string): Promise<SpeakerEntry[]> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [{ event: { _eq: eventId } }, { status: { _eq: 'confirmed' } }],
      }),
    );
    const fields =
      'id,talk_title,speaker.id,speaker.user.id,speaker.user.first_name,speaker.user.last_name,speaker.user.email';
    const res = await this.directus.get<{ data: SpeakerExpansionRow[] }>(
      `/items/event_speakers?filter=${filter}&fields=${fields}&limit=200&sort=order_index`,
    );
    return res.data.map(toSpeakerEntry);
  }

  private async registeredCountOf(eventId: string): Promise<number> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [{ event: { _eq: eventId } }, { status: { _in: ['registered', 'attended'] } }],
      }),
    );
    const res = await this.directus.get<{
      data: Array<{ id: string }>;
      meta?: { filter_count?: number };
    }>(`/items/registrations?filter=${filter}&fields=id&limit=1&meta=filter_count`);
    return res.meta?.filter_count ?? res.data.length;
  }

  private async findAnnouncement(
    eventId: string,
    speakerId: string,
  ): Promise<{ id: string } | null> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [
          { event: { _eq: eventId } },
          { kind: { _eq: KIND } },
          { speaker: { _eq: speakerId } },
        ],
      }),
    );
    const res = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/event_announcements?filter=${filter}&fields=id&limit=1`,
    );
    return res.data[0] ?? null;
  }

  private async recordAnnouncement(
    eventId: string,
    speakerId: string,
    interactionId: string,
    recipientCount: number,
  ): Promise<void> {
    await this.directus.post('/items/event_announcements', {
      event: eventId,
      kind: KIND,
      speaker: speakerId,
      dispatched_interaction_id: interactionId,
      recipient_count: recipientCount,
    });
  }
}

function toSpeakerEntry(row: SpeakerExpansionRow): SpeakerEntry {
  const speaker = row.speaker;
  const user = speaker?.user ?? null;
  const first = user?.first_name ?? null;
  const last = user?.last_name ?? null;
  const name = [first, last].filter((s) => s && s.length > 0).join(' ');
  return {
    eventSpeakerId: row.id,
    speakerId: speaker?.id ?? '',
    userId: user?.id ?? null,
    talkTitle: row.talk_title,
    speakerName: name || user?.email || '(speaker)',
  };
}

function buildBriefPayload(
  event: EventRow,
  speaker: SpeakerEntry,
  registeredCount: number,
): Record<string, unknown> {
  const dateShort = formatDateShort(event.starts_at);
  const venue = event.location ?? 'venue TBA';
  const link = `https://aiqadam.org/events/${event.id}`;
  const talkLine = speaker.talkTitle ? `Your talk: "${speaker.talkTitle}".\n\n` : '';
  const audienceLine =
    registeredCount > 0
      ? `Audience so far: ${registeredCount} registered (final count locks ~24h before).`
      : 'Audience size still building — final count locks ~24h before.';
  return {
    subject: `${event.title} in 7 days — your speaker brief`,
    text: `Hi ${speaker.speakerName.split(' ')[0] || 'there'},\n\n${event.title} is one week out — ${dateShort} at ${venue}.\n\n${talkLine}${audienceLine}\n\nIf you need to adjust your talk title, slot, or cancel, reply to this email — we'll route it to the organizer.\n\nEvent page: ${link}\n\n— AI Qadam`,
  };
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
