import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DirectusClient } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';
import { TickLockService } from '../internal-cron/tick-lock.service';
import { CsatService } from './csat.service';

// F-S1.1c — post-event followup cron.
//
// Tick endpoint (POST /v1/internal/post-event/tick) called by an external
// scheduler ~hourly. The service finds events past ends_at that haven't
// been processed yet, dispatches:
//   - csat                            → attendees with per-recipient
//                                       tokenized link (F-S1.1c ext, uses
//                                       the new dispatcher renderPayload)
//   - speaker_thanks_with_referral_ask → confirmed speakers (operational)
//   - next_event_teaser              → attendees, IFF next published
//                                       event exists in the same country
// Marks events.post_event_processed = true. Idempotent via that field.
//
// Per ux-and-content-guidelines §13: speaker_thanks_with_referral_ask
// and next_event_teaser canonical subject + body shapes.

export interface PostEventTickResult {
  evaluated: number;
  processed: Array<{
    eventId: string;
    csatRecipients: number;
    speakerThanksRecipients: number;
    nextEventTeaserRecipients: number;
  }>;
  errors: Array<{ eventId: string; message: string }>;
}

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  country: string;
}

interface ConfirmedSpeakerRow {
  speaker: {
    id: string;
    user: { id: string };
  };
}

@Injectable()
export class PostEventCronService {
  private readonly logger = new Logger(PostEventCronService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly interactions: InteractionsService,
    // F-S1.1c ext — used by the per-recipient CSAT renderer to mint a
    // token scoped to each delivery row.
    private readonly csat: CsatService,
    private readonly locks: TickLockService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledTick(): Promise<void> {
    await this.locks.withLock('post-event-cron', 540, async () => {
      const r = await this.tick();
      if (r.processed.length > 0) {
        this.logger.log(`scheduledTick processed=${r.processed.length}`);
      }
    });
  }

  async tick(): Promise<PostEventTickResult> {
    const events = await this.candidates();
    const processed: PostEventTickResult['processed'] = [];
    const errors: PostEventTickResult['errors'] = [];

    for (const event of events) {
      try {
        const counts = await this.processEvent(event);
        processed.push({
          eventId: event.id,
          csatRecipients: counts.csat,
          speakerThanksRecipients: counts.speakerThanks,
          nextEventTeaserRecipients: counts.nextEvent,
        });
      } catch (err) {
        errors.push({
          eventId: event.id,
          message: err instanceof Error ? err.message : 'unknown error',
        });
        this.logger.warn(
          `post-event tick error event=${event.id}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }

    this.logger.log(
      `post-event tick — evaluated=${events.length} processed=${processed.length} errors=${errors.length}`,
    );
    return { evaluated: events.length, processed, errors };
  }

  private async candidates(): Promise<EventRow[]> {
    const now = new Date().toISOString();
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [
          { status: { _eq: 'published' } },
          { ends_at: { _lt: now } },
          { post_event_processed: { _eq: false } },
        ],
      }),
    );
    const res = await this.directus.get<{ data: EventRow[] }>(
      `/items/events?filter=${filter}&fields=id,title,starts_at,ends_at,location,country&limit=200&sort=ends_at`,
    );
    return res.data;
  }

  private async processEvent(
    event: EventRow,
  ): Promise<{ csat: number; speakerThanks: number; nextEvent: number }> {
    const csat = await this.dispatchCsat(event);
    const speakerThanks = await this.dispatchSpeakerThanks(event);
    const nextEvent = await this.dispatchNextEventTeaser(event);
    // Mark processed LAST so a partial failure leaves it false +
    // re-tries on the next tick (consistent with our other crons).
    await this.directus.patch(`/items/events/${encodeURIComponent(event.id)}`, {
      post_event_processed: true,
    });
    return { csat, speakerThanks, nextEvent };
  }

  // F-S1.1c ext — CSAT dispatch with per-recipient tokenised link.
  // The renderer mints a JWT scoped to the freshly-created delivery row
  // (CsatService.mintToken(deliveryId)), then builds the public URL.
  // Consent basis is operational_contract: members opted into "event
  // experience feedback" by registering. Channel: email-only.
  private async dispatchCsat(event: EventRow): Promise<number> {
    const userIds = await this.attendeeUserIds(event.id);
    if (userIds.length === 0) return 0;
    await this.interactions.dispatch({
      initiatorActor: 'system',
      audience: { userIds },
      intent: 'csat',
      // Static fallback in case renderPayload somehow doesn't run (defence
      // in depth). The fallback link goes to the generic CSAT landing
      // without a token — visitor would get an "invalid token" page,
      // which is OK for the edge case.
      payload: buildCsatStaticFallback(event),
      consentBasis: 'operational_contract',
      allowedChannels: ['email'],
      renderPayload: async ({ deliveryId }) => {
        const token = await this.csat.mintToken(deliveryId);
        return buildCsatPayload(event, token);
      },
    });
    return userIds.length;
  }

  private async dispatchSpeakerThanks(event: EventRow): Promise<number> {
    const userIds = await this.confirmedSpeakerUserIds(event.id);
    if (userIds.length === 0) return 0;
    await this.interactions.dispatch({
      initiatorActor: 'system',
      audience: { userIds },
      intent: 'speaker_thanks_with_referral_ask',
      payload: buildSpeakerThanksPayload(event),
      consentBasis: 'operational_contract',
      allowedChannels: ['email'],
    });
    return userIds.length;
  }

  private async dispatchNextEventTeaser(event: EventRow): Promise<number> {
    const next = await this.nextPublishedEventInCountry(event);
    if (!next) return 0;
    const userIds = await this.attendeeUserIds(event.id);
    if (userIds.length === 0) return 0;
    await this.interactions.dispatch({
      initiatorActor: 'system',
      audience: { userIds },
      intent: 'next_event_teaser',
      payload: buildNextEventTeaserPayload(next),
      consentBasis: 'explicit_opt_in',
      consentScope: { purpose: 'events' },
      allowedChannels: ['email'],
    });
    return userIds.length;
  }

  private async confirmedSpeakerUserIds(eventId: string): Promise<string[]> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [{ event: { _eq: eventId } }, { status: { _eq: 'confirmed' } }],
      }),
    );
    const res = await this.directus.get<{ data: ConfirmedSpeakerRow[] }>(
      `/items/event_speakers?filter=${filter}&fields=speaker.user.id&limit=100`,
    );
    return res.data.map((r) => r.speaker?.user?.id).filter((id): id is string => Boolean(id));
  }

  private async attendeeUserIds(eventId: string): Promise<string[]> {
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

  private async nextPublishedEventInCountry(event: EventRow): Promise<EventRow | null> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [
          { country: { _eq: event.country } },
          { status: { _eq: 'published' } },
          { starts_at: { _gt: event.ends_at } },
        ],
      }),
    );
    const res = await this.directus.get<{ data: EventRow[] }>(
      `/items/events?filter=${filter}&fields=id,title,starts_at,ends_at,location,country&sort=starts_at&limit=1`,
    );
    return res.data[0] ?? null;
  }
}

function buildSpeakerThanksPayload(event: EventRow): Record<string, unknown> {
  return {
    subject: `Thank you — ${event.title}`,
    text: `Thank you for speaking at ${event.title}. Your talk shaped the room.\n\nOne ask: if you know someone whose work AI Qadam should feature next, reply to this email with their name. We'll handle the outreach.\n\n— AI Qadam`,
  };
}

function buildNextEventTeaserPayload(next: EventRow): Record<string, unknown> {
  const dateShort = new Date(next.starts_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const link = `https://aiqadam.org/events/${next.id}`;
  const venue = next.location ?? 'venue TBA';
  return {
    subject: `${next.title} — ${dateShort}`,
    text: `Thanks for coming to the last event.\n\nNext one: ${next.title} on ${dateShort} at ${venue}.\n\nRegister: ${link}\n\n— AI Qadam`,
  };
}

// F-S1.1c ext — CSAT payload. Built per-recipient by the renderPayload
// callback (which mints a token scoped to each delivery row). Anonymity:
// the token's `sub` is the delivery_id, NOT the user_id — the response
// row carries no user identity (see csat.service.ts).
function buildCsatPayload(event: EventRow, token: string): Record<string, unknown> {
  const url = `https://aiqadam.org/feedback/csat?t=${encodeURIComponent(token)}`;
  return {
    subject: `How was ${event.title}?`,
    text: `Thank you for coming to ${event.title}. 30 seconds to rate it would help us shape the next one:\n\n${url}\n\nIt's anonymous — your name doesn't get attached to the response.\n\n— AI Qadam`,
  };
}

// Static fallback for the (defence-in-depth) case where the renderer
// doesn't run. Link goes to the public landing without a token; visitor
// sees the "invalid token" path. Acceptable for the edge case.
function buildCsatStaticFallback(event: EventRow): Record<string, unknown> {
  return {
    subject: `How was ${event.title}?`,
    text: `Thank you for coming to ${event.title}. (Feedback link unavailable — please reply to this email with your rating 1-5.)\n\n— AI Qadam`,
  };
}
