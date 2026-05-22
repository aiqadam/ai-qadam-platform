import { Injectable, Logger } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';

// F-S1.4 — pre-event reminder cron.
//
// Tick endpoint (POST /v1/internal/event-reminders/tick) called by an
// external scheduler every ~10 min. The service finds events whose
// starts_at falls in the T-2-days or T-3-hours window, looks up
// registered attendees, dispatches the reminder, and records the
// idempotency row in event_announcements.
//
// Idempotent on (event, kind) — second tick is a no-op for events
// already announced.
//
// Scope cut (v1):
//   - T-7 days speaker brief refresh — needs the speakers schema that
//     lands in F-S1.1b. Will be added then.
//   - "What you should bring" personalisation — out of v1 scope.
//
// Per [ux-and-content-guidelines.md §13]: reminder_72h + reminder_3h
// canonical subject + body shapes.

export type ReminderKind = 'reminder_t_minus_2' | 'reminder_t_minus_3h';

export interface TickResult {
  evaluated: number;
  dispatched: Array<{
    eventId: string;
    kind: ReminderKind;
    interactionId: string;
    recipientCount: number;
  }>;
  skipped: Array<{
    eventId: string;
    kind: ReminderKind;
    reason: 'already_dispatched' | 'no_audience';
  }>;
}

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  country: string;
}

interface AnnouncementRow {
  id: string;
  event: string;
  kind: ReminderKind;
}

type CandidateOutcome =
  | {
      result: 'dispatched';
      eventId: string;
      kind: ReminderKind;
      interactionId: string;
      recipientCount: number;
    }
  | {
      result: 'skipped';
      eventId: string;
      kind: ReminderKind;
      reason: 'already_dispatched' | 'no_audience';
    };

interface ReminderWindow {
  kind: ReminderKind;
  // Inclusive lower + upper bounds for events.starts_at, expressed as
  // hours offset from now. Window width gives the scheduler a tolerance
  // band — e.g. T-2 window of [42h, 54h] catches an event 48h out
  // regardless of when the scheduler ticks within that range.
  fromHours: number;
  toHours: number;
}

const REMINDER_WINDOWS: ReminderWindow[] = [
  // T-2: [38h, 58h] — wide enough that a 10-minute tick cadence catches
  // every event exactly once even if a tick is skipped (cron miss / api
  // restart). The (event, kind) ledger row prevents double-sending.
  { kind: 'reminder_t_minus_2', fromHours: 38, toHours: 58 },
  // T-3h: [2h, 4h]. Tighter band — closer to the event we care more
  // about timing than tolerance.
  { kind: 'reminder_t_minus_3h', fromHours: 2, toHours: 4 },
];

@Injectable()
export class EventRemindersService {
  private readonly logger = new Logger(EventRemindersService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly interactions: InteractionsService,
  ) {}

  async tick(): Promise<TickResult> {
    const dispatched: TickResult['dispatched'] = [];
    const skipped: TickResult['skipped'] = [];
    let evaluated = 0;

    for (const window of REMINDER_WINDOWS) {
      const candidates = await this.candidatesForWindow(window);
      evaluated += candidates.length;
      for (const event of candidates) {
        const outcome = await this.processCandidate(event, window.kind);
        if (outcome.result === 'dispatched') {
          dispatched.push({
            eventId: outcome.eventId,
            kind: outcome.kind,
            interactionId: outcome.interactionId,
            recipientCount: outcome.recipientCount,
          });
        } else {
          skipped.push({
            eventId: outcome.eventId,
            kind: outcome.kind,
            reason: outcome.reason,
          });
        }
      }
    }

    this.logger.log(
      `event-reminders tick — evaluated=${evaluated} dispatched=${dispatched.length} skipped=${skipped.length}`,
    );
    return { evaluated, dispatched, skipped };
  }

  private async candidatesForWindow(window: ReminderWindow): Promise<EventRow[]> {
    const now = Date.now();
    const from = new Date(now + window.fromHours * 3600 * 1000).toISOString();
    const to = new Date(now + window.toHours * 3600 * 1000).toISOString();
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [
          { status: { _eq: 'published' } },
          { starts_at: { _gte: from } },
          { starts_at: { _lte: to } },
        ],
      }),
    );
    const fields = 'id,title,starts_at,ends_at,location,country';
    const res = await this.directus.get<{ data: EventRow[] }>(
      `/items/events?filter=${filter}&fields=${fields}&limit=200&sort=starts_at`,
    );
    return res.data;
  }

  private async processCandidate(event: EventRow, kind: ReminderKind): Promise<CandidateOutcome> {
    const existing = await this.findAnnouncement(event.id, kind);
    if (existing) {
      return { result: 'skipped', eventId: event.id, kind, reason: 'already_dispatched' };
    }
    const attendeeUserIds = await this.attendeesOf(event.id);
    if (attendeeUserIds.length === 0) {
      await this.recordAnnouncement(event.id, kind, null, 0);
      return { result: 'skipped', eventId: event.id, kind, reason: 'no_audience' };
    }
    const intent = kind === 'reminder_t_minus_2' ? 'reminder_72h' : 'reminder_3h';
    const { interactionId } = await this.interactions.dispatch({
      initiatorActor: 'system',
      audience: { userIds: attendeeUserIds },
      intent,
      payload: buildReminderPayload(event, kind),
      // operational_contract — service-level "you registered, here's
      // the heads-up". Not marketing. Bypasses the per-purpose consent
      // gate inside the dispatcher.
      consentBasis: 'operational_contract',
      allowedChannels: ['email'],
    });
    await this.recordAnnouncement(event.id, kind, interactionId, attendeeUserIds.length);
    return {
      result: 'dispatched',
      eventId: event.id,
      kind,
      interactionId,
      recipientCount: attendeeUserIds.length,
    };
  }

  private async findAnnouncement(
    eventId: string,
    kind: ReminderKind,
  ): Promise<AnnouncementRow | null> {
    const filter = encodeURIComponent(
      JSON.stringify({ event: { _eq: eventId }, kind: { _eq: kind } }),
    );
    const res = await this.directus.get<{ data: AnnouncementRow[] }>(
      `/items/event_announcements?filter=${filter}&fields=id,event,kind&limit=1`,
    );
    return res.data[0] ?? null;
  }

  private async attendeesOf(eventId: string): Promise<string[]> {
    // status IN (registered, attended) — exclude waitlisted (they
    // haven't been promoted) and cancelled.
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
    kind: ReminderKind,
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

function buildReminderPayload(event: EventRow, kind: ReminderKind): Record<string, unknown> {
  // Per [ux-and-content-guidelines.md §13] reminder_72h / reminder_3h
  // rows. v1 omits per-recipient personalisation (first_name etc.) —
  // dispatcher template-renderer lands later.
  const dateShort = formatDateShort(event.starts_at);
  const venue = event.location ?? 'venue TBA';
  const link = `https://aiqadam.org/events/${event.id}`;
  if (kind === 'reminder_t_minus_2') {
    return {
      subject: `${event.title} in 3 days — bring a question`,
      text: `You're registered for ${event.title} on ${dateShort} at ${venue}.\n\nBring one question you'd want to ask the speakers. Even if you don't ask it out loud, having it framed makes the room work.\n\nDetails: ${link}\n\n— AI Qadam`,
    };
  }
  // reminder_t_minus_3h
  return {
    subject: 'Doors open in 3 hours',
    text: `${event.title} starts in ~3 hours at ${venue}.\n\nDetails + map: ${link}\n\nSee you soon.\n\n— AI Qadam`,
  };
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
