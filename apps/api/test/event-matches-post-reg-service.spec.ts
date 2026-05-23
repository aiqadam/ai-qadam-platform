import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import { EventMatchesPostRegService } from '../src/modules/workspace/event-matches-post-reg.service';

// F-S1.5b — T+3 post-registration match cron. Mocks Directus + Interactions.
//
// Per processEvent: candidate-registrations → (per unique event) attendees →
// interests → already-matched lookup → per-registration dispatch + ledger.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let interactions: FakeInteractions;
let svc: EventMatchesPostRegService;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-08T10:00:00.000Z'));
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  interactions = { dispatch: vi.fn().mockResolvedValue({ interactionId: 'i-1', deliveries: [] }) };
  svc = new EventMatchesPostRegService(
    dx as unknown as DirectusClient,
    interactions as unknown as InteractionsService,
  );
});

const EVENT_FAR = {
  id: 'evt-far',
  title: 'Almaty #2',
  starts_at: '2026-07-01T18:00:00.000Z', // 23 days out
  status: 'published',
};
const EVENT_NEAR = {
  id: 'evt-near',
  title: 'Bishkek #1',
  starts_at: '2026-06-13T18:00:00.000Z', // 5 days out (< T-7)
  status: 'published',
};

function reg(
  id: string,
  userId: string,
  firstName: string,
  jobTitle: string | null,
  event: typeof EVENT_FAR,
) {
  return {
    id,
    date_created: '2026-06-04T00:00:00.000Z', // 4 days ago — past T+3
    user: {
      id: userId,
      first_name: firstName,
      last_name: null,
      job_title: jobTitle,
      appear_in_matches: true,
    },
    event,
  };
}

function attendee(id: string, firstName: string, jobTitle: string | null) {
  return {
    user: {
      id,
      first_name: firstName,
      last_name: null,
      job_title: jobTitle,
      appear_in_matches: true,
    },
  };
}

describe('EventMatchesPostRegService.tick', () => {
  it('dispatches T+3 + records member_match_dispatches when event is > 7d out', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [reg('r-1', 'u-a', 'Aigerim', 'ML Eng', EVENT_FAR)] })
      .mockResolvedValueOnce({
        data: [
          attendee('u-a', 'Aigerim', 'ML Eng'),
          attendee('u-b', 'Bek', 'ML Eng'), // same job title → job-match boost
          attendee('u-c', 'Chyngyz', 'Founder'),
        ],
      })
      .mockResolvedValueOnce({ data: [] }) // interestsByMember
      .mockResolvedValueOnce({ data: [] }) // alreadyMatchedUserIds
      .mockResolvedValueOnce({ data: [] }); // F-S1.5b ext — connectionsByMember

    const result = await svc.tick();

    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0]?.userId).toBe('u-a');
    expect(result.dispatched[0]?.eventId).toBe('evt-far');
    expect(interactions.dispatch).toHaveBeenCalledTimes(1);
    const payload = interactions.dispatch.mock.calls[0]?.[0].payload as { text: string };
    // Bek should rank above Chyngyz because of job-title match
    expect(payload.text.indexOf('Bek')).toBeGreaterThan(-1);
    expect(payload.text.indexOf('same job title')).toBeGreaterThan(-1);
    // Ledger row written
    const memberPost = dx.post.mock.calls.find((c) => c[0] === '/items/member_match_dispatches');
    expect(memberPost?.[1]).toMatchObject({
      user: 'u-a',
      event: 'evt-far',
      kind: 'member_match_t_plus_3',
    });
  });

  it('skips registrations whose event is within T-7 window (T-7 cron owns it)', async () => {
    dx.get.mockResolvedValueOnce({
      data: [reg('r-near', 'u-near', 'X', null, EVENT_NEAR)],
    });

    const result = await svc.tick();
    expect(result.skipped).toEqual([
      { userId: 'u-near', eventId: 'evt-near', reason: 'event_within_t_minus_7' },
    ]);
    expect(interactions.dispatch).not.toHaveBeenCalled();
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('skips when recipient already has member_match_dispatches row (T-7 fired first)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [reg('r-1', 'u-a', 'Aigerim', null, EVENT_FAR)] })
      .mockResolvedValueOnce({
        data: [attendee('u-a', 'Aigerim', null), attendee('u-b', 'Bek', null)],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ user: 'u-a' }] }) // u-a already matched by T-7
      .mockResolvedValueOnce({ data: [] }); // F-S1.5b ext — connectionsByMember

    const result = await svc.tick();
    expect(result.skipped).toEqual([
      { userId: 'u-a', eventId: 'evt-far', reason: 'already_matched' },
    ]);
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });

  it('skips when event has < 2 opted-in attendees (no peers to match)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [reg('r-1', 'u-a', 'Solo', null, EVENT_FAR)] })
      .mockResolvedValueOnce({ data: [attendee('u-a', 'Solo', null)] }); // only the recipient

    const result = await svc.tick();
    expect(result.skipped).toEqual([
      { userId: 'u-a', eventId: 'evt-far', reason: 'no_eligible_peers' },
    ]);
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });

  it('candidate filter is date_created<=now-3d + status registered/attended + user opted-in', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    await svc.tick();
    const call = decodeURIComponent(dx.get.mock.calls[0]?.[0] as string);
    expect(call).toContain('"date_created":{"_lte":');
    expect(call).toContain('"status":{"_in":["registered","attended"]}');
    expect(call).toContain('"appear_in_matches":{"_eq":true}');
    expect(call).toContain('"status":{"_eq":"published"}'); // event.status
  });

  it('records error + does NOT write ledger when dispatch throws', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [reg('r-1', 'u-a', 'Aigerim', null, EVENT_FAR)] })
      .mockResolvedValueOnce({
        data: [attendee('u-a', 'Aigerim', null), attendee('u-b', 'Bek', null)],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] }); // F-S1.5b ext — connectionsByMember
    interactions.dispatch.mockRejectedValueOnce(new Error('Resend 503'));

    const result = await svc.tick();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('Resend 503');
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('handles multiple candidate registrations on the same event with one attendee/interests fetch', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [
          reg('r-1', 'u-a', 'Aigerim', null, EVENT_FAR),
          reg('r-2', 'u-b', 'Bek', null, EVENT_FAR),
        ],
      })
      .mockResolvedValueOnce({
        data: [
          attendee('u-a', 'Aigerim', null),
          attendee('u-b', 'Bek', null),
          attendee('u-c', 'Chyngyz', null),
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] }); // F-S1.5b ext — connectionsByMember

    const result = await svc.tick();
    // Both u-a and u-b dispatched
    expect(result.dispatched).toHaveLength(2);
    expect(interactions.dispatch).toHaveBeenCalledTimes(2);
    // Per-event fetches happened once each (5 total GETs: candidates,
    // attendees, interests, alreadyMatched, connections)
    expect(dx.get).toHaveBeenCalledTimes(5);
  });
});
