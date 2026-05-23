import { Injectable, Logger } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';
import { InteractionsService } from '../interactions/interactions.service';

// F-S1.6b — lead nurture cron.
//
// Two dispatches per verified lead:
//   T+3 (lead_nurture_value)       — community value pitch
//   T+7 (lead_nurture_next_event)  — preview of the next upcoming event
//
// Tick endpoint (POST /v1/internal/lead-nurture/tick) is called by an
// external scheduler hourly. Each kind has an open-ended candidate
// window — "verified ≥ N days ago AND no ledger row for this kind yet" —
// so a missed tick self-heals on the next one.
//
// Conversion (state='lead' → 'member' via Authentik signup) drops the
// lead out of the candidate filter, so unsent nurture rows for converted
// leads simply never fire. No cleanup pass needed.
//
// T+7 only dispatches when an upcoming published event exists. If none,
// we skip WITHOUT recording the ledger row — the next tick re-evaluates
// once an event is scheduled. (Trade-off: a lead who verified during a
// dry period gets the teaser late, not never.)

export type LeadNurtureKind = 'lead_nurture_value' | 'lead_nurture_next_event';

export interface TickResult {
  evaluated: number;
  dispatched: Array<{
    leadId: string;
    kind: LeadNurtureKind;
    interactionId: string;
    eventReferenced: string | null;
  }>;
  skipped: Array<{
    leadId: string;
    kind: LeadNurtureKind;
    reason: 'no_upcoming_event';
  }>;
  errors: Array<{ leadId: string; kind: LeadNurtureKind; message: string }>;
}

interface LeadRow {
  id: string;
  email: string;
  city: string | null;
  email_verified_at: string;
  interest_topics: string[] | null;
}

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  country: string;
  topic_tags: string[] | null;
}

// F-S1.6b ext — per-lead event scoring + match metadata for copy variation.
export type EventMatchReason = 'city_and_topics' | 'city' | 'topics' | 'fallback';

interface RankedEvent {
  event: EventRow;
  reason: EventMatchReason;
  sharedTopics: string[];
}

interface NurtureWindow {
  kind: LeadNurtureKind;
  intent: string;
  // Minimum days since email_verified_at before this dispatch fires.
  thresholdDays: number;
  requiresUpcomingEvent: boolean;
}

const NURTURE_WINDOWS: NurtureWindow[] = [
  {
    kind: 'lead_nurture_value',
    intent: 'lead_nurture_value',
    thresholdDays: 3,
    requiresUpcomingEvent: false,
  },
  {
    kind: 'lead_nurture_next_event',
    intent: 'lead_nurture_next_event',
    thresholdDays: 7,
    requiresUpcomingEvent: true,
  },
];

// Bound work per tick. Lead capture volume is low (<100/day expected);
// 500 leaves a 5x headroom and prevents a single tick from monopolising
// the Directus connection if the ledger somehow fell behind.
const CANDIDATE_LIMIT_PER_TICK = 500;

// F-S1.6b ext — how many upcoming events we fetch up-front for per-lead
// scoring. ~3-6 months of cadence is enough for personalisation; beyond
// that the city or topics that matter today may not match tomorrow.
const UPCOMING_EVENTS_FETCH_LIMIT = 50;

@Injectable()
export class LeadNurtureCronService {
  private readonly logger = new Logger(LeadNurtureCronService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly interactions: InteractionsService,
  ) {}

  async tick(): Promise<TickResult> {
    const result: TickResult = { evaluated: 0, dispatched: [], skipped: [], errors: [] };
    for (const window of NURTURE_WINDOWS) {
      await this.processWindow(window, result);
    }
    this.logger.log(
      `lead-nurture tick — evaluated=${result.evaluated} dispatched=${result.dispatched.length} skipped=${result.skipped.length} errors=${result.errors.length}`,
    );
    return result;
  }

  private async processWindow(window: NurtureWindow, result: TickResult): Promise<void> {
    const candidates = await this.candidatesFor(window);
    result.evaluated += candidates.length;
    if (candidates.length === 0) return;
    const upcomingEvents = window.requiresUpcomingEvent ? await this.upcomingEvents() : [];
    if (window.requiresUpcomingEvent && upcomingEvents.length === 0) {
      for (const lead of candidates) {
        result.skipped.push({ leadId: lead.id, kind: window.kind, reason: 'no_upcoming_event' });
      }
      return;
    }
    for (const lead of candidates) {
      await this.dispatchSafely(lead, window, upcomingEvents, result);
    }
  }

  private async dispatchSafely(
    lead: LeadRow,
    window: NurtureWindow,
    upcomingEvents: EventRow[],
    result: TickResult,
  ): Promise<void> {
    try {
      const ranked = window.requiresUpcomingEvent ? pickEventForLead(lead, upcomingEvents) : null;
      result.dispatched.push(await this.dispatchOne(lead, window, ranked));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `lead-nurture dispatch failed lead=${lead.id} kind=${window.kind}: ${message}`,
      );
      result.errors.push({ leadId: lead.id, kind: window.kind, message });
    }
  }

  private async candidatesFor(window: NurtureWindow): Promise<LeadRow[]> {
    const threshold = new Date(Date.now() - window.thresholdDays * 86_400_000).toISOString();
    const dispatchedLeadIds = await this.dispatchedLeadIdsFor(window.kind);
    const filterObj: Record<string, unknown> = {
      _and: [
        { state: { _eq: 'lead' } },
        { email_verified: { _eq: true } },
        { email_verified_at: { _lte: threshold } },
      ],
    };
    if (dispatchedLeadIds.length > 0) {
      (filterObj._and as Array<Record<string, unknown>>).push({
        id: { _nin: dispatchedLeadIds },
      });
    }
    const filter = encodeURIComponent(JSON.stringify(filterObj));
    const fields = 'id,email,city,email_verified_at,interest_topics';
    const res = await this.directus.get<{ data: LeadRow[] }>(
      `/users?filter=${filter}&fields=${fields}&limit=${CANDIDATE_LIMIT_PER_TICK}&sort=email_verified_at`,
    );
    return res.data;
  }

  private async dispatchedLeadIdsFor(kind: LeadNurtureKind): Promise<string[]> {
    // Fetch the lead IDs that already have a ledger row for this kind, so
    // the candidate query can _nin them out. Bounded — once the ledger
    // grows large the cron filter should switch to a left-join shape, but
    // at <10k rows this is fine.
    const filter = encodeURIComponent(JSON.stringify({ kind: { _eq: kind } }));
    const res = await this.directus.get<{ data: Array<{ lead: string }> }>(
      `/items/lead_nurture_dispatches?filter=${filter}&fields=lead&limit=10000`,
    );
    return res.data.map((r) => r.lead);
  }

  // F-S1.6b ext — fetches the next batch of upcoming events for per-lead
  // scoring (city / topic match). Sorted by starts_at so the tiebreak
  // among equal-scoring events naturally picks the soonest.
  private async upcomingEvents(): Promise<EventRow[]> {
    const now = new Date().toISOString();
    const filter = encodeURIComponent(
      JSON.stringify({
        _and: [{ status: { _eq: 'published' } }, { starts_at: { _gt: now } }],
      }),
    );
    const fields = 'id,title,starts_at,location,country,topic_tags';
    const res = await this.directus.get<{ data: EventRow[] }>(
      `/items/events?filter=${filter}&fields=${fields}&sort=starts_at&limit=${UPCOMING_EVENTS_FETCH_LIMIT}`,
    );
    return res.data;
  }

  private async dispatchOne(
    lead: LeadRow,
    window: NurtureWindow,
    ranked: RankedEvent | null,
  ): Promise<TickResult['dispatched'][number]> {
    const payload =
      window.kind === 'lead_nurture_value'
        ? buildValuePayload(lead)
        : buildNextEventPayload(lead, ranked as RankedEvent);
    const { interactionId } = await this.interactions.dispatch({
      initiatorActor: 'system',
      audience: { userIds: [lead.id] },
      intent: window.intent,
      payload,
      consentBasis: 'operational_contract',
      allowedChannels: ['email'],
    });
    const eventReferenced =
      window.kind === 'lead_nurture_next_event' ? (ranked?.event.id ?? null) : null;
    await this.recordDispatch(lead.id, window.kind, interactionId, eventReferenced);
    return { leadId: lead.id, kind: window.kind, interactionId, eventReferenced };
  }

  private async recordDispatch(
    leadId: string,
    kind: LeadNurtureKind,
    interactionId: string,
    eventReferenced: string | null,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      lead: leadId,
      kind,
      dispatched_interaction_id: interactionId,
    };
    if (eventReferenced) body.event_referenced = eventReferenced;
    await this.directus.post('/items/lead_nurture_dispatches', body);
  }
}

function buildValuePayload(lead: LeadRow): Record<string, unknown> {
  const cityLine = lead.city ? ` in ${lead.city}` : '';
  return {
    subject: 'Why AI Qadam exists',
    text: `Hi,\n\nA few days ago you signed up for AI Qadam updates${cityLine}. Here's the short version of why we're worth your attention:\n\n• We host in-person meetups for AI engineers across Central Asia. Practitioners only — no recruiter pitches.\n• Every meetup pairs a working engineer's talk with a workshop or hands-on demo.\n• You'll meet people who are actually shipping AI systems in the region, not just thinking about it.\n\nNo event scheduled in your city yet? We'll tell you the moment one is. Until then, thanks for being on the list.\n\n— AI Qadam`,
  };
}

function buildNextEventIntro(lead: LeadRow, ranked: RankedEvent): string {
  const cityLabel = lead.city ?? 'your city';
  const topicLabel = ranked.sharedTopics.slice(0, 2).join(' + ');
  switch (ranked.reason) {
    case 'city_and_topics':
      return `Hi,\n\nWe lined up something in ${cityLabel} that touches the topics you flagged — ${topicLabel}:`;
    case 'city':
      return `Hi,\n\nNew AI Qadam event in ${cityLabel}:`;
    case 'topics':
      return `Hi,\n\nThe next AI Qadam meetup overlaps with what you're into (${topicLabel}):`;
    default:
      return 'Hi,\n\nThe next AI Qadam meetup is happening:';
  }
}

function buildNextEventCityNote(lead: LeadRow, event: EventRow, reason: EventMatchReason): string {
  if (reason !== 'fallback' || !lead.city || !event.location) return '';
  if (event.location.toLowerCase().includes(lead.city.toLowerCase())) return '';
  return `\n\nNot in ${lead.city} — but the talks are worth the trip if you can make it.`;
}

function buildNextEventPayload(lead: LeadRow, ranked: RankedEvent): Record<string, unknown> {
  const event = ranked.event;
  const dateShort = formatDateShort(event.starts_at);
  const venue = event.location ?? 'venue TBA';
  const link = `https://aiqadam.org/events/${event.id}`;
  const intro = buildNextEventIntro(lead, ranked);
  const cityNote = buildNextEventCityNote(lead, event, ranked.reason);
  return {
    subject: `${event.title} — ${dateShort}`,
    text: `${intro}\n\n${event.title}\n${dateShort} · ${venue}\n\n${link}${cityNote}\n\nSeats are limited — register early if you want to come.\n\n— AI Qadam`,
  };
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// F-S1.6b ext — score each upcoming event for this lead, return the
// highest-scoring + the reason. Scoring:
//   +10 if event.location contains lead.city (case-insensitive substring)
//   +1 per overlapping interest_topic ↔ event.topic_tag
// Tiebreak: earliest starts_at (preserved by the input sort).
// Fallback (no event scores > 0): the first event in the list (earliest).
export function pickEventForLead(
  lead: { city: string | null; interest_topics: string[] | null },
  events: EventRow[],
): RankedEvent | null {
  if (events.length === 0) return null;
  const cityLower = lead.city ? lead.city.trim().toLowerCase() : null;
  const leadTopics = new Set(lead.interest_topics ?? []);
  let best: RankedEvent | null = null;
  let bestScore = 0;
  for (const event of events) {
    const scored = scoreEventForLead(event, cityLower, leadTopics);
    if (scored.score > bestScore) {
      bestScore = scored.score;
      best = { event, reason: scored.reason, sharedTopics: scored.shared };
    }
  }
  if (best) return best;
  return { event: events[0] as EventRow, reason: 'fallback', sharedTopics: [] };
}

interface ScoredEvent {
  score: number;
  reason: EventMatchReason;
  shared: string[];
}

function scoreEventForLead(
  event: EventRow,
  cityLower: string | null,
  leadTopics: Set<string>,
): ScoredEvent {
  const cityMatch = Boolean(
    cityLower && event.location && event.location.toLowerCase().includes(cityLower),
  );
  const shared = (event.topic_tags ?? []).filter((t) => leadTopics.has(t));
  const score = (cityMatch ? 10 : 0) + shared.length;
  const reason: EventMatchReason =
    cityMatch && shared.length > 0 ? 'city_and_topics' : cityMatch ? 'city' : 'topics';
  return { score, reason, shared };
}
