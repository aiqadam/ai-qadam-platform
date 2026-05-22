import { Injectable, Logger } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';
import {
  type AttendeeForMatch,
  type MatchPlan,
  buildMatchPayload,
  rankCandidates,
} from './match-algorithm';

// F-S1.5b — T+3 post-registration member matching.
//
// Mirrors the F-S1.5 T-7 broadcast but trigger model is per-registration
// instead of per-event:
//   - For each registration with date_created <= now-3d AND no prior
//     member_match_dispatches row for (user, event), find 3 other
//     opted-in attendees of the same event and dispatch a match email.
//   - Only fires when event.starts_at > now+7d (else T-7 will catch them
//     and we'd double-dispatch). This is the "T+3 OR T-7 whichever first"
//     semantic from the original spec.
//
// Self-heals across missed ticks via the per-(user, event) ledger row.
// T+3 and T-7 are mutually exclusive per recipient — either service that
// dispatches first writes to member_match_dispatches; the other checks
// it before dispatching.
//
// Job-title overlap: shared via match-algorithm.rankCandidates — same
// scoring as T-7. Recipient's own job_title is read from their user row
// included in the registration expansion.

export interface PostRegTickResult {
  evaluated: number;
  dispatched: Array<{
    userId: string;
    eventId: string;
    interactionId: string;
    matchCount: number;
  }>;
  skipped: Array<{
    userId: string;
    eventId: string;
    reason: 'event_within_t_minus_7' | 'already_matched' | 'no_eligible_peers';
  }>;
  errors: Array<{ userId: string; eventId: string; message: string }>;
}

interface RegistrationRow {
  id: string;
  date_created: string;
  user: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    job_title: string | null;
    appear_in_matches: boolean;
  };
  event: {
    id: string;
    title: string;
    starts_at: string;
    status: string;
  };
}

interface AttendeeRow extends AttendeeForMatch {
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

// Open-ended trigger window: registrations created ≥ 3 days ago. Per-(user, event)
// ledger filters previously-dispatched rows. Cap candidates per tick at 500 so
// a backlog doesn't monopolise a single tick.
const TRIGGER_THRESHOLD_DAYS = 3;
const CANDIDATE_LIMIT_PER_TICK = 500;
const MATCHES_PER_RECIPIENT = 3;
// Only fire T+3 when the event is still > 7 days out. Closer than that,
// T-7 has fired (or will fire) and would re-dispatch — let it own those.
const MIN_EVENT_LEAD_DAYS = 7;

@Injectable()
export class EventMatchesPostRegService {
  private readonly logger = new Logger(EventMatchesPostRegService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly interactions: InteractionsService,
  ) {}

  async tick(): Promise<PostRegTickResult> {
    const result: PostRegTickResult = { evaluated: 0, dispatched: [], skipped: [], errors: [] };
    const candidates = await this.candidateRegistrations();
    result.evaluated = candidates.length;
    if (candidates.length === 0) {
      this.logger.log('event-matches-post-reg tick — no candidates');
      return result;
    }
    // Group by event so we fetch attendee list + interests once per event.
    const byEvent = groupByEvent(candidates);
    for (const [eventId, regs] of byEvent.entries()) {
      await this.processEvent(eventId, regs, result);
    }
    this.logger.log(
      `event-matches-post-reg tick — evaluated=${result.evaluated} dispatched=${result.dispatched.length} skipped=${result.skipped.length} errors=${result.errors.length}`,
    );
    return result;
  }

  private async processEvent(
    eventId: string,
    candidateRegs: RegistrationRow[],
    result: PostRegTickResult,
  ): Promise<void> {
    const firstReg = candidateRegs[0];
    if (!firstReg) return;
    const event = firstReg.event;
    const eventLeadDays = (new Date(event.starts_at).getTime() - Date.now()) / 86_400_000;
    if (eventLeadDays <= MIN_EVENT_LEAD_DAYS) {
      // Event is too close — T-7 owns this window.
      for (const reg of candidateRegs) {
        result.skipped.push({
          userId: reg.user.id,
          eventId,
          reason: 'event_within_t_minus_7',
        });
      }
      return;
    }
    const allAttendees = await this.optedInAttendees(eventId);
    if (allAttendees.length < 2) {
      for (const reg of candidateRegs) {
        result.skipped.push({ userId: reg.user.id, eventId, reason: 'no_eligible_peers' });
      }
      return;
    }
    const interestsByMember = await this.interestsByMember(allAttendees.map((a) => a.user.id));
    const alreadyMatched = await this.alreadyMatchedUserIdsFor(eventId);
    for (const reg of candidateRegs) {
      await this.dispatchSafely(
        reg,
        event,
        allAttendees,
        interestsByMember,
        alreadyMatched,
        result,
      );
    }
  }

  private async dispatchSafely(
    reg: RegistrationRow,
    event: RegistrationRow['event'],
    allAttendees: AttendeeRow[],
    interestsByMember: Map<string, Set<string>>,
    alreadyMatched: Set<string>,
    result: PostRegTickResult,
  ): Promise<void> {
    if (alreadyMatched.has(reg.user.id)) {
      result.skipped.push({ userId: reg.user.id, eventId: event.id, reason: 'already_matched' });
      return;
    }
    const myTags = interestsByMember.get(reg.user.id) ?? new Set<string>();
    const others = allAttendees.filter((a) => a.user.id !== reg.user.id);
    const ranked = rankCandidates(others, interestsByMember, myTags, reg.user.job_title);
    if (ranked.length === 0) {
      result.skipped.push({ userId: reg.user.id, eventId: event.id, reason: 'no_eligible_peers' });
      return;
    }
    const plan: MatchPlan = {
      recipientId: reg.user.id,
      eventTitle: event.title,
      eventStartsAt: event.starts_at,
      matches: ranked.slice(0, MATCHES_PER_RECIPIENT),
    };
    try {
      const dispatchResult = await this.interactions.dispatch({
        initiatorActor: 'system',
        audience: { userIds: [reg.user.id] },
        intent: 'member_match',
        payload: buildMatchPayload(plan),
        consentBasis: 'explicit_opt_in',
        consentScope: { purpose: 'events' },
        allowedChannels: ['email'],
      });
      await this.recordMemberDispatch(reg.user.id, event.id, dispatchResult.interactionId);
      alreadyMatched.add(reg.user.id); // prevent double-dispatch within this tick
      result.dispatched.push({
        userId: reg.user.id,
        eventId: event.id,
        interactionId: dispatchResult.interactionId,
        matchCount: plan.matches.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `event-matches-post-reg dispatch failed user=${reg.user.id} event=${event.id}: ${message}`,
      );
      result.errors.push({ userId: reg.user.id, eventId: event.id, message });
    }
  }

  private async candidateRegistrations(): Promise<RegistrationRow[]> {
    const threshold = new Date(Date.now() - TRIGGER_THRESHOLD_DAYS * 86_400_000).toISOString();
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [
          { date_created: { _lte: threshold } },
          { status: { _in: ['registered', 'attended'] } },
          { user: { appear_in_matches: { _eq: true } } },
          { event: { status: { _eq: 'published' } } },
        ],
      }),
    );
    const fields =
      'id,date_created,user.id,user.first_name,user.last_name,user.job_title,user.appear_in_matches,event.id,event.title,event.starts_at,event.status';
    const res = await this.directus.get<{ data: RegistrationRow[] }>(
      `/items/registrations?filter=${filter}&fields=${fields}&limit=${CANDIDATE_LIMIT_PER_TICK}&sort=date_created`,
    );
    return res.data.filter((r) => r.user?.appear_in_matches === true && r.event != null);
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

  private async alreadyMatchedUserIdsFor(eventId: string): Promise<Set<string>> {
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
      kind: 'member_match_t_plus_3',
      dispatched_interaction_id: interactionId,
    });
  }
}

function groupByEvent(regs: RegistrationRow[]): Map<string, RegistrationRow[]> {
  const out = new Map<string, RegistrationRow[]>();
  for (const r of regs) {
    if (!r.event) continue;
    const list = out.get(r.event.id) ?? [];
    list.push(r);
    out.set(r.event.id, list);
  }
  return out;
}
