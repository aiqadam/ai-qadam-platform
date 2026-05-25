import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DirectusClient } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';
import { TickLockService } from '../internal-cron/tick-lock.service';
import {
  type AttendeeForMatch,
  type MatchPlan,
  buildMatchPayload,
  rankCandidates,
} from './match-algorithm';

// F-S1.5 — pre-event member-to-member matching (T-7 broadcast).
//
// External scheduler ticks /v1/internal/event-matches/tick once a day
// (or whenever — idempotent via event_announcements). For each
// published event with starts_at in the T-7 window, the service finds
// every opted-in attendee and dispatches a "3 people you might want to
// meet" email naming three other opted-in attendees with the highest
// interest-tag + job-title overlap.
//
// F-S1.5b made this service write per-(user, event) rows to
// member_match_dispatches AND filter recipients who already have a row
// (i.e. T+3 already fired for them). T-7 and T+3 are mutually exclusive
// per recipient — whichever cron fires first wins.
//
// Privacy model:
//   - sender (recipient_user) MUST be appear_in_matches=true to receive
//   - candidate (named in payload) MUST be appear_in_matches=true to appear
//   - default appear_in_matches=true; members opt OUT via /me/profile

export type MatchTickKind = 'member_match_t_minus_7';

export interface MatchTickResult {
  evaluated: number;
  dispatched: Array<{
    eventId: string;
    interactionId: string;
    recipientCount: number;
    matchedPairs: number;
  }>;
  skipped: Array<{
    eventId: string;
    reason: 'already_dispatched' | 'no_eligible_attendees';
  }>;
}

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  country: string;
}

interface AnnouncementRow {
  id: string;
  event: string;
  kind: MatchTickKind;
}

interface AttendeeRow extends AttendeeForMatch {
  user: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
    job_title_canonical: string | null;
    appear_in_matches: boolean;
  };
}

interface InterestRow {
  member: string;
  topic_tag: string;
}

// Window: events whose starts_at falls in [now+6.5d, now+7.5d].
// Daily ticker catches each event exactly once; ledger row makes it safe
// to tick more often.
const WINDOW_FROM_HOURS = 6.5 * 24;
const WINDOW_TO_HOURS = 7.5 * 24;
const MATCHES_PER_RECIPIENT = 3;

@Injectable()
export class EventMatchesService {
  private readonly logger = new Logger(EventMatchesService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly interactions: InteractionsService,
    private readonly locks: TickLockService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledTick(): Promise<void> {
    await this.locks.withLock('event-matches', 540, async () => {
      const r = await this.tick();
      if (r.dispatched.length > 0) {
        this.logger.log(`scheduledTick dispatched=${r.dispatched.length}`);
      }
    });
  }

  async tick(): Promise<MatchTickResult> {
    const events = await this.candidateEvents();
    const dispatched: MatchTickResult['dispatched'] = [];
    const skipped: MatchTickResult['skipped'] = [];

    for (const event of events) {
      const outcome = await this.processEvent(event);
      if (outcome.kind === 'dispatched') {
        dispatched.push({
          eventId: outcome.eventId,
          interactionId: outcome.interactionId,
          recipientCount: outcome.recipientCount,
          matchedPairs: outcome.matchedPairs,
        });
      } else {
        skipped.push({ eventId: outcome.eventId, reason: outcome.reason });
      }
    }

    this.logger.log(
      `event-matches tick — evaluated=${events.length} dispatched=${dispatched.length} skipped=${skipped.length}`,
    );
    return { evaluated: events.length, dispatched, skipped };
  }

  private async candidateEvents(): Promise<EventRow[]> {
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
    const res = await this.directus.get<{ data: EventRow[] }>(
      `/items/events?filter=${filter}&fields=id,title,starts_at,location,country&limit=200&sort=starts_at`,
    );
    return res.data;
  }

  private async processEvent(event: EventRow): Promise<
    | {
        kind: 'dispatched';
        eventId: string;
        interactionId: string;
        recipientCount: number;
        matchedPairs: number;
      }
    | { kind: 'skipped'; eventId: string; reason: 'already_dispatched' | 'no_eligible_attendees' }
  > {
    if (await this.findAnnouncement(event.id)) {
      return { kind: 'skipped', eventId: event.id, reason: 'already_dispatched' };
    }
    const attendees = await this.optedInAttendees(event.id);
    if (attendees.length < 2) {
      await this.recordAnnouncement(event.id, null, 0);
      return { kind: 'skipped', eventId: event.id, reason: 'no_eligible_attendees' };
    }
    const alreadyMatched = await this.alreadyMatchedUserIds(event.id);
    const userIds = attendees.map((a) => a.user.id);
    const [interestsByMember, connectionsByMember] = await Promise.all([
      this.interestsByMember(userIds),
      this.connectionsByMember(userIds),
    ]);
    const plans = this.buildPlans(
      event,
      attendees,
      interestsByMember,
      alreadyMatched,
      connectionsByMember,
    );
    if (plans.length === 0) {
      await this.recordAnnouncement(event.id, null, 0);
      return { kind: 'skipped', eventId: event.id, reason: 'no_eligible_attendees' };
    }
    const firstInteractionId = await this.dispatchAll(plans, event.id);
    await this.recordAnnouncement(event.id, firstInteractionId, plans.length);
    return {
      kind: 'dispatched',
      eventId: event.id,
      interactionId: firstInteractionId ?? '',
      recipientCount: plans.length,
      matchedPairs: plans.reduce((n, p) => n + p.matches.length, 0),
    };
  }

  private buildPlans(
    event: EventRow,
    attendees: AttendeeRow[],
    interestsByMember: Map<string, Set<string>>,
    alreadyMatched: Set<string>,
    connectionsByMember: Map<string, Set<string>>,
  ): MatchPlan[] {
    const plans: MatchPlan[] = [];
    for (const me of attendees) {
      if (alreadyMatched.has(me.user.id)) continue;
      const others = attendees.filter((a) => a.user.id !== me.user.id);
      const myTags = interestsByMember.get(me.user.id) ?? new Set<string>();
      const ranked = rankCandidates(others, interestsByMember, myTags, {
        myJobTitle: me.user.job_title,
        myJobTitleCanonical: me.user.job_title_canonical ?? null,
        alreadyConnected: connectionsByMember.get(me.user.id) ?? new Set<string>(),
      });
      if (ranked.length === 0) continue;
      plans.push({
        recipientId: me.user.id,
        eventTitle: event.title,
        eventStartsAt: event.starts_at,
        matches: ranked.slice(0, MATCHES_PER_RECIPIENT),
      });
    }
    return plans;
  }

  private async dispatchAll(plans: MatchPlan[], eventId: string): Promise<string | null> {
    let firstInteractionId: string | null = null;
    for (const plan of plans) {
      const dispatchResult = await this.interactions.dispatch({
        initiatorActor: 'system',
        audience: { userIds: [plan.recipientId] },
        intent: 'member_match',
        payload: buildMatchPayload(plan),
        consentBasis: 'explicit_opt_in',
        consentScope: { purpose: 'events' },
        allowedChannels: ['email'],
      });
      await this.recordMemberDispatch(plan.recipientId, eventId, dispatchResult.interactionId);
      if (firstInteractionId == null) firstInteractionId = dispatchResult.interactionId;
    }
    return firstInteractionId;
  }

  private async findAnnouncement(eventId: string): Promise<AnnouncementRow | null> {
    const filter = encodeURIComponent(
      JSON.stringify({ event: { _eq: eventId }, kind: { _eq: 'member_match_t_minus_7' } }),
    );
    const res = await this.directus.get<{ data: AnnouncementRow[] }>(
      `/items/event_announcements?filter=${filter}&fields=id,event,kind&limit=1`,
    );
    return res.data[0] ?? null;
  }

  private async optedInAttendees(eventId: string): Promise<AttendeeRow[]> {
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [
          { event: { _eq: eventId } },
          { status: { _in: ['registered', 'attended'] } },
          { user: { appear_in_matches: { _eq: true } } },
        ],
      }),
    );
    const fields =
      'user.id,user.first_name,user.last_name,user.job_title,user.job_title_canonical,user.appear_in_matches';
    const res = await this.directus.get<{ data: AttendeeRow[] }>(
      `/items/registrations?filter=${filter}&fields=${fields}&limit=2000`,
    );
    return res.data.filter((row) => row.user?.appear_in_matches === true);
  }

  private async interestsByMember(memberIds: string[]): Promise<Map<string, Set<string>>> {
    if (memberIds.length === 0) return new Map();
    const filter = encodeURIComponent(JSON.stringify({ member: { _in: memberIds } }));
    const res = await this.directus.get<{ data: InterestRow[] }>(
      `/items/member_interests?filter=${filter}&fields=member,topic_tag&limit=5000`,
    );
    const out = new Map<string, Set<string>>();
    for (const row of res.data) {
      const set = out.get(row.member) ?? new Set<string>();
      set.add(row.topic_tag);
      out.set(row.member, set);
    }
    return out;
  }

  // F-S1.5b ext — pre-fetch all member_connections rows touching any of
  // the event's attendees so the ranker can demote pairs the recipient
  // has already met. Returns Map<userId, Set<other user IDs>> with both
  // directions of each edge written (edges are undirected logically).
  private async connectionsByMember(memberIds: string[]): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    if (memberIds.length === 0) return out;
    const filter = encodeURIComponent(
      JSON.stringify({
        _or: [{ member_a: { _in: memberIds } }, { member_b: { _in: memberIds } }],
      }),
    );
    const res = await this.directus.get<{ data: Array<{ member_a: string; member_b: string }> }>(
      `/items/member_connections?filter=${filter}&fields=member_a,member_b&limit=10000`,
    );
    for (const edge of res.data) {
      const a = out.get(edge.member_a) ?? new Set<string>();
      a.add(edge.member_b);
      out.set(edge.member_a, a);
      const b = out.get(edge.member_b) ?? new Set<string>();
      b.add(edge.member_a);
      out.set(edge.member_b, b);
    }
    return out;
  }

  private async alreadyMatchedUserIds(eventId: string): Promise<Set<string>> {
    const filter = encodeURIComponent(JSON.stringify({ event: { _eq: eventId } }));
    const res = await this.directus.get<{ data: Array<{ user: string }> }>(
      `/items/member_match_dispatches?filter=${filter}&fields=user&limit=5000`,
    );
    return new Set(res.data.map((r) => r.user));
  }

  private async recordMemberDispatch(
    userId: string,
    eventId: string,
    interactionId: string,
  ): Promise<void> {
    await this.directus.post('/items/member_match_dispatches', {
      user: userId,
      event: eventId,
      kind: 'member_match_t_minus_7',
      dispatched_interaction_id: interactionId,
    });
  }

  private async recordAnnouncement(
    eventId: string,
    interactionId: string | null,
    recipientCount: number,
  ): Promise<void> {
    await this.directus.post('/items/event_announcements', {
      event: eventId,
      kind: 'member_match_t_minus_7',
      dispatched_interaction_id: interactionId,
      recipient_count: recipientCount,
    });
  }
}
