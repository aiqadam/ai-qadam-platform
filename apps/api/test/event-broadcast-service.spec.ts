import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import { EventBroadcastService } from '../src/modules/workspace/event-broadcast.service';
import type { MembersService } from '../src/modules/workspace/members.service';

// F-S1.1a — EventBroadcastService is a Directus proxy + dispatch
// orchestrator. Tests mock Directus + MembersService + InteractionsService
// (mirrors the F-S3.3 announce pattern).

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeMembers = { resolveToUserIds: ReturnType<typeof vi.fn> };
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let members: FakeMembers;
let interactions: FakeInteractions;
let svc: EventBroadcastService;

const EVENT_ROW = {
  id: 'evt-1',
  title: 'AI Qadam Tashkent #4',
  status: 'published',
  starts_at: '2026-06-15T18:00:00.000Z',
  ends_at: '2026-06-15T21:00:00.000Z',
  capacity: 100,
  location: 'Workly office, Tashkent',
  country: 'uz',
};

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  members = {
    resolveToUserIds: vi
      .fn()
      .mockResolvedValue({ userIds: ['u-1', 'u-2', 'u-3'], truncated: false, total: 3 }),
  };
  interactions = {
    dispatch: vi.fn().mockResolvedValue({ interactionId: 'i-1', deliveries: [] }),
  };
  svc = new EventBroadcastService(
    dx as unknown as DirectusClient,
    members as unknown as MembersService,
    interactions as unknown as InteractionsService,
  );
});

describe('EventBroadcastService.broadcastPublication', () => {
  it('dispatches event_announce to country audience + records the ledger row', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [] }) // findAnnouncement → none
      .mockResolvedValueOnce({ data: EVENT_ROW }); // fetchEvent
    dx.post.mockResolvedValueOnce({ data: { id: 'ann-1' } });

    const result = await svc.broadcastPublication('evt-1');

    expect(result.status).toBe('dispatched');
    expect(result.interactionId).toBe('i-1');
    expect(result.recipientCount).toBe(3);

    // Audience filter is country = event.country (no other filter)
    expect(members.resolveToUserIds).toHaveBeenCalledWith({ country: { _eq: 'uz' } });

    // Dispatch carries the right shape
    const dispatchInput = interactions.dispatch.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(dispatchInput.initiatorActor).toBe('system');
    expect(dispatchInput.intent).toBe('event_announce');
    expect(dispatchInput.consentBasis).toBe('explicit_opt_in');
    expect(dispatchInput.consentScope).toEqual({ purpose: 'events' });
    expect(dispatchInput.allowedChannels).toEqual(['email']);
    expect((dispatchInput.audience as { userIds: string[] }).userIds).toEqual([
      'u-1',
      'u-2',
      'u-3',
    ]);
    const payload = dispatchInput.payload as { subject: string; text: string };
    expect(payload.subject).toContain('AI Qadam Tashkent #4');
    expect(payload.text).toContain('Workly office, Tashkent');
    expect(payload.text).toContain('Cap at 100');
    expect(payload.text).toContain('https://aiqadam.org/events/evt-1');

    // Ledger row carries dispatched_interaction_id + recipient_count
    const ledgerInsert = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ledgerInsert.event).toBe('evt-1');
    expect(ledgerInsert.kind).toBe('published');
    expect(ledgerInsert.dispatched_interaction_id).toBe('i-1');
    expect(ledgerInsert.recipient_count).toBe(3);
  });

  it('is idempotent — second call returns already_dispatched without re-dispatching', async () => {
    dx.get.mockResolvedValueOnce({
      data: [
        {
          id: 'ann-existing',
          event: 'evt-1',
          kind: 'published',
          dispatched_interaction_id: 'i-prior',
          recipient_count: 42,
          sent_at: '2026-06-10T00:00:00.000Z',
        },
      ],
    });

    const result = await svc.broadcastPublication('evt-1');

    expect(result.status).toBe('already_dispatched');
    expect(result.interactionId).toBe('i-prior');
    expect(result.recipientCount).toBe(42);
    expect(interactions.dispatch).not.toHaveBeenCalled();
    expect(members.resolveToUserIds).not.toHaveBeenCalled();
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('records a no_audience ledger row when the country has zero members', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [] }) // findAnnouncement
      .mockResolvedValueOnce({ data: EVENT_ROW }); // fetchEvent
    members.resolveToUserIds.mockResolvedValueOnce({ userIds: [], truncated: false, total: 0 });
    dx.post.mockResolvedValueOnce({ data: { id: 'ann-empty' } });

    const result = await svc.broadcastPublication('evt-1');

    expect(result.status).toBe('no_audience');
    expect(result.interactionId).toBeNull();
    expect(result.recipientCount).toBe(0);
    expect(interactions.dispatch).not.toHaveBeenCalled();
    const ledger = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ledger.dispatched_interaction_id).toBeNull();
    expect(ledger.recipient_count).toBe(0);
  });

  it('omits capacity copy when event.capacity is null', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { ...EVENT_ROW, capacity: null, location: null } });
    dx.post.mockResolvedValueOnce({ data: { id: 'ann-x' } });

    await svc.broadcastPublication('evt-1');

    const payload = interactions.dispatch.mock.calls[0]?.[0].payload as {
      text: string;
    };
    expect(payload.text).not.toContain('Cap at');
    expect(payload.text).toContain('venue TBA');
  });
});
