import { Injectable, Logger } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';

// F-S1.5 — pre-event member-to-member matching.
//
// External scheduler ticks /v1/internal/event-matches/tick once a day
// (or whenever — idempotent via event_announcements). For each
// published event with starts_at in the T-7 window, the service finds
// every opted-in attendee and dispatches a "3 people you might want to
// meet" email naming three other opted-in attendees with the highest
// interest-tag overlap.
//
// Privacy model:
//   - sender (recipient_user) MUST be appear_in_matches=true to receive
//   - candidate (named in payload) MUST be appear_in_matches=true to appear
//   - default appear_in_matches=true; members opt OUT via /me/profile
//
// Per ux-and-content-guidelines §13 there is no canonical "member_match"
// intent yet — the payload shape here defines it for v1.

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

interface AttendeeRow {
  user: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
    appear_in_matches: boolean;
  };
}

interface InterestRow {
  member: string;
  topic_tag: string;
}

interface MatchCandidate {
  userId: string;
  firstName: string | null;
  jobTitle: string | null;
  sharedTags: string[];
}

interface MatchPlan {
  recipientId: string;
  eventTitle: string;
  eventStartsAt: string;
  matches: MatchCandidate[];
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
  ) {}

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
    const interestsByMember = await this.interestsByMember(attendees.map((a) => a.user.id));
    const plans = buildMatchPlans(event, attendees, interestsByMember);
    if (plans.length === 0) {
      await this.recordAnnouncement(event.id, null, 0);
      return { kind: 'skipped', eventId: event.id, reason: 'no_eligible_attendees' };
    }
    const firstInteractionId = await this.dispatchAll(plans);
    await this.recordAnnouncement(event.id, firstInteractionId, plans.length);
    return {
      kind: 'dispatched',
      eventId: event.id,
      interactionId: firstInteractionId ?? '',
      recipientCount: plans.length,
      matchedPairs: plans.reduce((n, p) => n + p.matches.length, 0),
    };
  }

  private async dispatchAll(plans: MatchPlan[]): Promise<string | null> {
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
    const fields = 'user.id,user.first_name,user.last_name,user.job_title,user.appear_in_matches';
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

function rankByOverlap(
  others: AttendeeRow[],
  interestsByMember: Map<string, Set<string>>,
  myTags: Set<string>,
): MatchCandidate[] {
  const scored: Array<{ row: AttendeeRow; shared: string[] }> = [];
  for (const other of others) {
    const tags = interestsByMember.get(other.user.id) ?? new Set();
    const shared: string[] = [];
    for (const tag of tags) {
      if (myTags.has(tag)) shared.push(tag);
    }
    scored.push({ row: other, shared });
  }
  // Sort: most-shared-tags first; ties broken by name for determinism.
  scored.sort((a, b) => {
    if (b.shared.length !== a.shared.length) return b.shared.length - a.shared.length;
    const an = a.row.user.first_name ?? '';
    const bn = b.row.user.first_name ?? '';
    return an.localeCompare(bn);
  });
  // v1: include zero-overlap candidates too — better to introduce SOME
  // people than nobody. Sort still surfaces overlap-rich candidates first.
  return scored.map(({ row, shared }) => ({
    userId: row.user.id,
    firstName: row.user.first_name,
    jobTitle: row.user.job_title,
    sharedTags: shared,
  }));
}

function buildMatchPlans(
  event: EventRow,
  attendees: AttendeeRow[],
  interestsByMember: Map<string, Set<string>>,
): MatchPlan[] {
  const plans: MatchPlan[] = [];
  for (const me of attendees) {
    const others = attendees.filter((a) => a.user.id !== me.user.id);
    const myTags = interestsByMember.get(me.user.id) ?? new Set();
    const ranked = rankByOverlap(others, interestsByMember, myTags);
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

function buildMatchPayload(plan: MatchPlan): Record<string, unknown> {
  const dateShort = new Date(plan.eventStartsAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const lines = plan.matches.map((m) => {
    const name = m.firstName ?? 'A fellow attendee';
    const role = m.jobTitle ? ` (${m.jobTitle})` : '';
    const tags =
      m.sharedTags.length > 0 ? ` — shared interests: ${m.sharedTags.slice(0, 3).join(', ')}` : '';
    return `• ${name}${role}${tags}`;
  });
  const intro = `${plan.eventTitle} is on ${dateShort}. Three other registered attendees you might want to find:`;
  const outro =
    'Introduce yourself in the room — or in the Telegram group if you have it. We picked these based on overlapping interest tags from your profile.';
  const optOut = 'Want out of these match emails? Toggle "Appear in matches" off in /me/profile.';
  return {
    subject: `${plan.matches.length} people at ${plan.eventTitle} you might want to meet`,
    text: `${intro}\n\n${lines.join('\n')}\n\n${outro}\n\n— AI Qadam\n\n${optOut}`,
  };
}
