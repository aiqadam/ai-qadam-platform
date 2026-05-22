import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import { EventRemindersService } from '../src/modules/workspace/event-reminders.service';

// F-S1.4 — tick() drives the cron from an external scheduler. Tests
// mock Directus + InteractionsService; we control the clock so the
// reminder windows are deterministic.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let interactions: FakeInteractions;
let svc: EventRemindersService;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-10T10:00:00.000Z'));
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  interactions = { dispatch: vi.fn() };
  svc = new EventRemindersService(
    dx as unknown as DirectusClient,
    interactions as unknown as InteractionsService,
  );
});

function eventRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'evt-1',
    title: 'AI Qadam Tashkent #4',
    starts_at: '2026-06-12T12:00:00.000Z', // 50h from now → T-2 window
    ends_at: '2026-06-12T15:00:00.000Z',
    location: 'Workly office',
    country: 'uz',
    ...overrides,
  };
}

describe('EventRemindersService.tick — windowing', () => {
  it('queries each window with the right starts_at range', async () => {
    // No candidates in either window
    dx.get.mockResolvedValue({ data: [] });

    await svc.tick();

    // Called twice — once per window
    expect(dx.get).toHaveBeenCalledTimes(2);
    const t2Call = decodeURIComponent(dx.get.mock.calls[0]?.[0] as string);
    expect(t2Call).toContain('"status":{"_eq":"published"}');
    expect(t2Call).toContain('"starts_at":{"_gte":');
    expect(t2Call).toContain('"starts_at":{"_lte":');
  });
});

describe('EventRemindersService.tick — dispatch path', () => {
  it('dispatches reminder_72h to attendees + records ledger row', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [eventRow({})] }) // T-2 candidates
      .mockResolvedValueOnce({ data: [] }) // findAnnouncement T-2 → none
      .mockResolvedValueOnce({
        data: [{ user: 'u-1' }, { user: 'u-2' }, { user: 'u-3' }],
      }) // attendeesOf
      .mockResolvedValueOnce({ data: [] }); // T-3h candidates
    interactions.dispatch.mockResolvedValueOnce({ interactionId: 'i-72', deliveries: [] });
    dx.post.mockResolvedValueOnce({ data: { id: 'ann-1' } });

    const result = await svc.tick();

    expect(result.dispatched).toEqual([
      {
        eventId: 'evt-1',
        kind: 'reminder_t_minus_2',
        interactionId: 'i-72',
        recipientCount: 3,
      },
    ]);

    const dispatchInput = interactions.dispatch.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(dispatchInput.intent).toBe('reminder_72h');
    expect(dispatchInput.consentBasis).toBe('operational_contract');
    expect((dispatchInput.audience as { userIds: string[] }).userIds).toEqual([
      'u-1',
      'u-2',
      'u-3',
    ]);
    const payload = dispatchInput.payload as { subject: string; text: string };
    expect(payload.subject).toContain('in 3 days');
    expect(payload.text).toContain('Workly office');

    const ledger = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ledger.event).toBe('evt-1');
    expect(ledger.kind).toBe('reminder_t_minus_2');
    expect(ledger.dispatched_interaction_id).toBe('i-72');
    expect(ledger.recipient_count).toBe(3);
  });

  it('dispatches reminder_3h via the T-3h window', async () => {
    const t3Event = eventRow({
      id: 'evt-3h',
      starts_at: '2026-06-10T13:00:00.000Z', // 3h from now
    });
    dx.get
      .mockResolvedValueOnce({ data: [] }) // T-2 candidates
      .mockResolvedValueOnce({ data: [t3Event] }) // T-3h candidates
      .mockResolvedValueOnce({ data: [] }) // findAnnouncement
      .mockResolvedValueOnce({ data: [{ user: 'u-1' }] }); // attendeesOf
    interactions.dispatch.mockResolvedValueOnce({ interactionId: 'i-3h', deliveries: [] });
    dx.post.mockResolvedValueOnce({ data: { id: 'ann-2' } });

    const result = await svc.tick();

    expect(result.dispatched[0]?.kind).toBe('reminder_t_minus_3h');
    const dispatchInput = interactions.dispatch.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(dispatchInput.intent).toBe('reminder_3h');
    const payload = dispatchInput.payload as { subject: string };
    expect(payload.subject).toContain('Doors open');
  });
});

describe('EventRemindersService.tick — idempotency + skip cases', () => {
  it('skips event with existing ledger row (already_dispatched)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [eventRow({})] }) // T-2 candidates
      .mockResolvedValueOnce({
        data: [{ id: 'ann-prior', event: 'evt-1', kind: 'reminder_t_minus_2' }],
      })
      .mockResolvedValueOnce({ data: [] }); // T-3h candidates

    const result = await svc.tick();

    expect(result.dispatched).toEqual([]);
    expect(result.skipped).toEqual([
      { eventId: 'evt-1', kind: 'reminder_t_minus_2', reason: 'already_dispatched' },
    ]);
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });

  it('records no_audience ledger row + does NOT dispatch when zero attendees', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [eventRow({})] }) // T-2 candidates
      .mockResolvedValueOnce({ data: [] }) // findAnnouncement → none
      .mockResolvedValueOnce({ data: [] }) // attendeesOf → empty
      .mockResolvedValueOnce({ data: [] }); // T-3h candidates
    dx.post.mockResolvedValueOnce({ data: { id: 'ann-empty' } });

    const result = await svc.tick();

    expect(result.skipped[0]?.reason).toBe('no_audience');
    expect(interactions.dispatch).not.toHaveBeenCalled();
    const ledger = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ledger.dispatched_interaction_id).toBeNull();
    expect(ledger.recipient_count).toBe(0);
  });

  it('filters attendees on status IN (registered, attended)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [eventRow({})] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ user: 'u-1' }] })
      .mockResolvedValueOnce({ data: [] });
    interactions.dispatch.mockResolvedValueOnce({ interactionId: 'i-1', deliveries: [] });
    dx.post.mockResolvedValueOnce({ data: { id: 'ann-x' } });

    await svc.tick();

    const attendeesCall = decodeURIComponent(dx.get.mock.calls[2]?.[0] as string);
    expect(attendeesCall).toContain('"status":{"_in":["registered","attended"]}');
  });
});
