import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import { EventMatchesService } from '../src/modules/workspace/event-matches.service';

// F-S1.5 — match-tick logic. Mocks Directus + InteractionsService;
// fake-times the clock so the T-7 window is deterministic.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let interactions: FakeInteractions;
let svc: EventMatchesService;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-08T10:00:00.000Z'));
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  interactions = {
    dispatch: vi.fn().mockResolvedValue({ interactionId: 'i-1', deliveries: [] }),
  };
  svc = new EventMatchesService(
    dx as unknown as DirectusClient,
    interactions as unknown as InteractionsService,
  );
});

const T7_EVENT = {
  id: 'evt-1',
  title: 'Tashkent #5',
  starts_at: '2026-06-15T18:00:00.000Z', // 7d from now
  location: 'Workly',
  country: 'uz',
};

function attendee(
  id: string,
  firstName: string,
  jobTitle: string | null,
  optedIn: boolean,
): { user: Record<string, unknown> } {
  return {
    user: {
      id,
      first_name: firstName,
      last_name: null,
      job_title: jobTitle,
      appear_in_matches: optedIn,
    },
  };
}

describe('EventMatchesService.tick — dispatch path', () => {
  it('dispatches per-recipient with top-N by interest-tag overlap', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [T7_EVENT] }) // candidates
      .mockResolvedValueOnce({ data: [] }) // findAnnouncement
      .mockResolvedValueOnce({
        data: [
          attendee('u-a', 'Aigerim', 'ML Eng', true),
          attendee('u-b', 'Bek', 'Data Eng', true),
          attendee('u-c', 'Chyngyz', 'Director', true),
          attendee('u-d', 'Dilnoza', 'Founder', true),
        ],
      })
      .mockResolvedValueOnce({ data: [] }) // alreadyMatchedUserIds (F-S1.5b)
      .mockResolvedValueOnce({
        data: [
          { member: 'u-a', topic_tag: 'computer-vision' },
          { member: 'u-a', topic_tag: 'mlops' },
          { member: 'u-b', topic_tag: 'mlops' },
          { member: 'u-b', topic_tag: 'data' },
          { member: 'u-c', topic_tag: 'computer-vision' },
          { member: 'u-d', topic_tag: 'fintech' },
        ],
      });
    dx.post.mockResolvedValue({ data: { id: 'ann-1' } });

    const result = await svc.tick();

    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0]?.recipientCount).toBe(4);
    // 4 recipients × 3 matches each = 12 pairs
    expect(result.dispatched[0]?.matchedPairs).toBe(12);
    expect(interactions.dispatch).toHaveBeenCalledTimes(4);

    // Aigerim's first dispatch — top-ranked match should be the one
    // with most shared tags. Aigerim has {computer-vision, mlops};
    // Bek shares mlops (1) and Chyngyz shares computer-vision (1),
    // so they tie; tiebreaker by first_name → Bek (B < C).
    const aDispatch = interactions.dispatch.mock.calls.find(
      (c) => c[0].audience.userIds[0] === 'u-a',
    );
    expect(aDispatch).toBeDefined();
    const aPayload = aDispatch?.[0].payload as { subject: string; text: string };
    expect(aPayload.subject).toContain('3 people');
    expect(aPayload.subject).toContain('Tashkent #5');
    expect(aPayload.text).toContain('Bek');
    expect(aPayload.text).toContain('Chyngyz');
    expect(aPayload.text).toContain('shared interests');
  });

  it('filters out attendees with appear_in_matches=false', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [T7_EVENT] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          attendee('u-a', 'Aigerim', 'ML', true),
          attendee('u-opt-out', 'Hidden', 'Eng', false), // should be silently dropped
        ],
      });
    dx.post.mockResolvedValue({ data: { id: 'ann-x' } });

    const result = await svc.tick();
    // Only u-a remains → < 2 → skip
    expect(result.skipped[0]?.reason).toBe('no_eligible_attendees');
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });

  it('skips event with existing ledger row (already_dispatched)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [T7_EVENT] })
      .mockResolvedValueOnce({ data: [{ id: 'ann-prior' }] });

    const result = await svc.tick();
    expect(result.skipped[0]?.reason).toBe('already_dispatched');
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('includes zero-overlap candidates (better to introduce someone than nobody)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [T7_EVENT] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [attendee('u-a', 'Aigerim', null, true), attendee('u-b', 'Bek', null, true)],
      })
      .mockResolvedValueOnce({ data: [] }) // alreadyMatchedUserIds (F-S1.5b)
      .mockResolvedValueOnce({
        data: [
          { member: 'u-a', topic_tag: 'computer-vision' },
          { member: 'u-b', topic_tag: 'fintech' }, // no overlap
        ],
      });
    dx.post.mockResolvedValue({ data: { id: 'ann-y' } });

    const result = await svc.tick();
    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0]?.matchedPairs).toBe(2); // 2 recipients × 1 candidate each
  });

  it('queries the T-7 window with correct date bounds', async () => {
    dx.get.mockResolvedValue({ data: [] });
    await svc.tick();
    const call = decodeURIComponent(dx.get.mock.calls[0]?.[0] as string);
    expect(call).toContain('"status":{"_eq":"published"}');
    expect(call).toContain('"starts_at":{"_gte":');
    expect(call).toContain('"starts_at":{"_lte":');
  });

  it('F-S1.5b — skips recipients already in member_match_dispatches for the event', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [T7_EVENT] })
      .mockResolvedValueOnce({ data: [] }) // findAnnouncement
      .mockResolvedValueOnce({
        data: [
          attendee('u-a', 'Aigerim', null, true),
          attendee('u-b', 'Bek', null, true),
          attendee('u-c', 'Chyngyz', null, true),
        ],
      })
      .mockResolvedValueOnce({ data: [{ user: 'u-a' }, { user: 'u-b' }] }) // T+3 already fired for u-a, u-b
      .mockResolvedValueOnce({ data: [] }); // interestsByMember
    dx.post.mockResolvedValue({ data: { id: 'ann-z' } });

    const result = await svc.tick();
    // Only u-c gets a plan (u-a and u-b are suppressed)
    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0]?.recipientCount).toBe(1);
    expect(interactions.dispatch).toHaveBeenCalledTimes(1);
    expect(interactions.dispatch.mock.calls[0]?.[0].audience).toEqual({ userIds: ['u-c'] });
  });

  it('F-S1.5b — writes per-(user, event) ledger row alongside event-level row', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [T7_EVENT] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [attendee('u-a', 'Aigerim', null, true), attendee('u-b', 'Bek', null, true)],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });
    dx.post.mockResolvedValue({ data: { id: 'ann-w' } });

    await svc.tick();
    // 2 recipients × 1 member_match_dispatches row each + 1 event_announcements row = 3 posts
    expect(dx.post).toHaveBeenCalledTimes(3);
    const memberDispatchCalls = dx.post.mock.calls
      .map((c) => ({ path: c[0] as string, body: c[1] as Record<string, unknown> }))
      .filter((c) => c.path === '/items/member_match_dispatches');
    expect(memberDispatchCalls).toHaveLength(2);
    expect(memberDispatchCalls.map((c) => c.body.user).sort()).toEqual(['u-a', 'u-b']);
    expect(memberDispatchCalls[0]?.body.kind).toBe('member_match_t_minus_7');
    expect(memberDispatchCalls[0]?.body.event).toBe('evt-1');
  });
});
