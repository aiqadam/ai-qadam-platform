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
