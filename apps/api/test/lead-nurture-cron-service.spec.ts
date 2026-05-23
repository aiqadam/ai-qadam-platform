import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import { LeadNurtureCronService } from '../src/modules/leads/lead-nurture-cron.service';

// F-S1.6b — lead nurture cron. Mocks Directus + InteractionsService.
//
// Tick walks two windows (T+3, T+7). Each window:
//   1. fetch dispatched lead IDs for the window's kind (ledger)
//   2. fetch candidate leads (state='lead', verified, threshold-aged, NIN dispatched)
//   3. (T+7 only) fetch next upcoming event
//   4. for each candidate → dispatch + record ledger

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let interactions: FakeInteractions;
let svc: LeadNurtureCronService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  interactions = { dispatch: vi.fn().mockResolvedValue({ interactionId: 'i-x', deliveries: [] }) };
  svc = new LeadNurtureCronService(
    dx as unknown as DirectusClient,
    interactions as unknown as InteractionsService,
  );
});

const LEAD_A = {
  id: 'lead-a',
  email: 'a@example.com',
  city: 'Tashkent',
  email_verified_at: '2026-05-15T00:00:00.000Z',
};
const LEAD_B = {
  id: 'lead-b',
  email: 'b@example.com',
  city: null,
  email_verified_at: '2026-05-10T00:00:00.000Z',
};
const UPCOMING_EVENT = {
  id: 'evt-up',
  title: 'AI Qadam · Tashkent #5',
  starts_at: '2026-06-15T18:00:00.000Z',
  location: 'Workly Tashkent',
  country: 'uz',
};

describe('LeadNurtureCronService.tick', () => {
  it('dispatches T+3 to a verified lead with no prior ledger row + records ledger', async () => {
    dx.get
      // T+3 ledger lookup → none dispatched
      .mockResolvedValueOnce({ data: [] })
      // T+3 candidates → 1 lead
      .mockResolvedValueOnce({ data: [LEAD_A] })
      // T+7 ledger lookup → none dispatched
      .mockResolvedValueOnce({ data: [] })
      // T+7 candidates → none (no upcoming-event lookup because candidates.length===0)
      .mockResolvedValueOnce({ data: [] });

    const result = await svc.tick();

    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0]).toEqual({
      leadId: 'lead-a',
      kind: 'lead_nurture_value',
      interactionId: 'i-x',
      eventReferenced: null,
    });
    expect(interactions.dispatch).toHaveBeenCalledTimes(1);
    const dispatchCall = interactions.dispatch.mock.calls[0]?.[0];
    expect(dispatchCall.intent).toBe('lead_nurture_value');
    expect(dispatchCall.audience).toEqual({ userIds: ['lead-a'] });
    expect(dispatchCall.consentBasis).toBe('operational_contract');
    expect(dx.post).toHaveBeenCalledTimes(1);
    const ledgerBody = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ledgerBody.lead).toBe('lead-a');
    expect(ledgerBody.kind).toBe('lead_nurture_value');
    expect(ledgerBody.dispatched_interaction_id).toBe('i-x');
  });

  it('dispatches T+7 with event reference + payload contains event title and link', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [] }) // T+3 ledger
      .mockResolvedValueOnce({ data: [] }) // T+3 candidates
      .mockResolvedValueOnce({ data: [] }) // T+7 ledger
      .mockResolvedValueOnce({ data: [LEAD_B] }) // T+7 candidates
      .mockResolvedValueOnce({ data: [UPCOMING_EVENT] }); // next event

    const result = await svc.tick();

    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0]).toEqual({
      leadId: 'lead-b',
      kind: 'lead_nurture_next_event',
      interactionId: 'i-x',
      eventReferenced: 'evt-up',
    });
    const dispatchCall = interactions.dispatch.mock.calls[0]?.[0];
    expect(dispatchCall.intent).toBe('lead_nurture_next_event');
    const payload = dispatchCall.payload as { subject: string; text: string };
    expect(payload.subject).toContain('Tashkent #5');
    expect(payload.text).toContain('https://aiqadam.org/events/evt-up');
    const ledgerBody = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ledgerBody.event_referenced).toBe('evt-up');
  });

  it('skips T+7 (no ledger written) when no upcoming event exists', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [] }) // T+3 ledger
      .mockResolvedValueOnce({ data: [] }) // T+3 candidates
      .mockResolvedValueOnce({ data: [] }) // T+7 ledger
      .mockResolvedValueOnce({ data: [LEAD_A, LEAD_B] }) // T+7 candidates
      .mockResolvedValueOnce({ data: [] }); // no upcoming event

    const result = await svc.tick();

    expect(result.dispatched).toHaveLength(0);
    expect(result.skipped).toEqual([
      { leadId: 'lead-a', kind: 'lead_nurture_next_event', reason: 'no_upcoming_event' },
      { leadId: 'lead-b', kind: 'lead_nurture_next_event', reason: 'no_upcoming_event' },
    ]);
    expect(interactions.dispatch).not.toHaveBeenCalled();
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('excludes leads with existing ledger rows from the candidate query', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [{ lead: 'lead-a' }] }) // T+3 ledger has lead-a
      .mockResolvedValueOnce({ data: [] }) // T+3 candidates (post-filter)
      .mockResolvedValueOnce({ data: [] }) // T+7 ledger
      .mockResolvedValueOnce({ data: [] }); // T+7 candidates

    await svc.tick();

    // The 2nd GET is T+3 candidates — verify _nin clause carries the dispatched lead ID
    const t3CandidateCall = decodeURIComponent(dx.get.mock.calls[1]?.[0] as string);
    expect(t3CandidateCall).toContain('"id":{"_nin":["lead-a"]}');
  });

  it('candidate filter is state=lead + email_verified=true + email_verified_at <= now-Nd', async () => {
    dx.get.mockResolvedValue({ data: [] });
    await svc.tick();
    const t3Call = decodeURIComponent(dx.get.mock.calls[1]?.[0] as string);
    expect(t3Call).toContain('"state":{"_eq":"lead"}');
    expect(t3Call).toContain('"email_verified":{"_eq":true}');
    expect(t3Call).toContain('"email_verified_at":{"_lte":');
  });

  it('records error + does NOT write ledger row when dispatch throws', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [] }) // T+3 ledger
      .mockResolvedValueOnce({ data: [LEAD_A] }) // T+3 candidates
      .mockResolvedValueOnce({ data: [] }) // T+7 ledger
      .mockResolvedValueOnce({ data: [] }) // T+7 candidates
      .mockResolvedValueOnce({ data: [UPCOMING_EVENT] });
    interactions.dispatch.mockRejectedValueOnce(new Error('Resend 503'));

    const result = await svc.tick();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.leadId).toBe('lead-a');
    expect(result.errors[0]?.message).toContain('Resend 503');
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('handles a tick with no candidates in either window', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [] }) // T+3 ledger
      .mockResolvedValueOnce({ data: [] }) // T+3 candidates
      .mockResolvedValueOnce({ data: [] }) // T+7 ledger
      .mockResolvedValueOnce({ data: [] }); // T+7 candidates → upcoming-event lookup is skipped

    const result = await svc.tick();
    expect(result.evaluated).toBe(0);
    expect(result.dispatched).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });
});

// F-S1.6b ext — topic-personalised + city-scoped event picker.
describe('pickEventForLead — per-lead event scoring', () => {
  // Re-import the export to avoid touching the service singleton.
  // (vitest will reuse the module across describe blocks.)
  // Imported dynamically inside each test to keep the existing block's
  // mock state isolated.
  const EVENT_TASHKENT_LLMS = {
    id: 'e-uz-llms',
    title: 'Tashkent · LLM eval',
    starts_at: '2026-07-10T18:00:00.000Z',
    location: 'Workly Tashkent',
    country: 'uz',
    topic_tags: ['LLMs', 'mlops'],
  };
  const EVENT_ALMATY_CV = {
    id: 'e-kz-cv',
    title: 'Almaty · Computer Vision',
    starts_at: '2026-07-05T18:00:00.000Z',
    location: 'Astana Hub Almaty',
    country: 'kz',
    topic_tags: ['computer-vision'],
  };
  const EVENT_TASHKENT_GENERIC = {
    id: 'e-uz-generic',
    title: 'Tashkent · Meetup',
    starts_at: '2026-06-30T18:00:00.000Z',
    location: 'Workly Tashkent',
    country: 'uz',
    topic_tags: null,
  };
  const EVENT_TOPIC_ONLY = {
    id: 'e-tj-mlops',
    title: 'Dushanbe · MLOps',
    starts_at: '2026-06-25T18:00:00.000Z',
    location: 'Innovation Center Dushanbe',
    country: 'tj',
    topic_tags: ['mlops', 'devtools'],
  };

  it('picks city_and_topics when both match (city beats earlier topic-only event)', async () => {
    const { pickEventForLead } = await import('../src/modules/leads/lead-nurture-cron.service');
    const lead = { city: 'Tashkent', interest_topics: ['LLMs', 'mlops'] };
    // EVENT_TOPIC_ONLY is earlier but topic-only (score 2)
    // EVENT_TASHKENT_LLMS has city + 2 topics (score 12)
    // EVENT_TASHKENT_GENERIC has city only (score 10)
    const result = pickEventForLead(lead, [
      EVENT_TASHKENT_GENERIC,
      EVENT_TOPIC_ONLY,
      EVENT_TASHKENT_LLMS,
    ]);
    expect(result?.event.id).toBe(EVENT_TASHKENT_LLMS.id);
    expect(result?.reason).toBe('city_and_topics');
    expect(result?.sharedTopics).toEqual(['LLMs', 'mlops']);
  });

  it('picks city-only when lead has no matching topics', async () => {
    const { pickEventForLead } = await import('../src/modules/leads/lead-nurture-cron.service');
    const lead = { city: 'Tashkent', interest_topics: ['fintech'] };
    const result = pickEventForLead(lead, [EVENT_ALMATY_CV, EVENT_TASHKENT_GENERIC]);
    expect(result?.event.id).toBe(EVENT_TASHKENT_GENERIC.id);
    expect(result?.reason).toBe('city');
  });

  it('picks topic-only when lead has no city', async () => {
    const { pickEventForLead } = await import('../src/modules/leads/lead-nurture-cron.service');
    const lead = { city: null, interest_topics: ['mlops'] };
    const result = pickEventForLead(lead, [EVENT_ALMATY_CV, EVENT_TOPIC_ONLY]);
    expect(result?.event.id).toBe(EVENT_TOPIC_ONLY.id);
    expect(result?.reason).toBe('topics');
    expect(result?.sharedTopics).toEqual(['mlops']);
  });

  it('falls back to earliest event when nothing matches', async () => {
    const { pickEventForLead } = await import('../src/modules/leads/lead-nurture-cron.service');
    const lead = { city: 'Bishkek', interest_topics: ['robotics'] };
    const result = pickEventForLead(lead, [EVENT_TASHKENT_GENERIC, EVENT_ALMATY_CV]);
    expect(result?.event.id).toBe(EVENT_TASHKENT_GENERIC.id); // earliest
    expect(result?.reason).toBe('fallback');
    expect(result?.sharedTopics).toEqual([]);
  });

  it('returns null when no events at all', async () => {
    const { pickEventForLead } = await import('../src/modules/leads/lead-nurture-cron.service');
    const lead = { city: 'Tashkent', interest_topics: ['LLMs'] };
    expect(pickEventForLead(lead, [])).toBeNull();
  });

  it('city match is case-insensitive substring', async () => {
    const { pickEventForLead } = await import('../src/modules/leads/lead-nurture-cron.service');
    const lead = { city: 'tashkent', interest_topics: null }; // lowercase
    const result = pickEventForLead(lead, [EVENT_ALMATY_CV, EVENT_TASHKENT_GENERIC]);
    expect(result?.event.id).toBe(EVENT_TASHKENT_GENERIC.id);
    expect(result?.reason).toBe('city');
  });
});
