import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { DirectusError } from '../src/modules/directus/directus.client';
import { EventsService } from '../src/modules/workspace/events.service';

// F-S3.4 — EventsService is a thin Directus REST proxy. Tests mock the
// client; no Testcontainers needed for this layer (mirrors workspace
// services pattern from F-S3.2/3.3).

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let dx: FakeDirectus;
let svc: EventsService;

const EVENT_ROW = {
  id: 'evt-1',
  title: 'Test event',
  description: 'desc',
  status: 'published',
  format: 'meetup',
  starts_at: '2026-06-01T18:00:00.000Z',
  ends_at: '2026-06-01T20:00:00.000Z',
  capacity: 50,
  location: 'Tashkent',
  country: 'uz',
  date_created: '2026-05-01T00:00:00.000Z',
  date_updated: null,
};

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  svc = new EventsService(dx as unknown as DirectusClient);
});

describe('EventsService.list', () => {
  it('returns events with registration counts grouped by status', async () => {
    dx.get.mockResolvedValueOnce({ data: [EVENT_ROW] }).mockResolvedValueOnce({
      data: [
        { event: 'evt-1', status: 'registered', count: { id: 42 } },
        { event: 'evt-1', status: 'attended', count: { id: 33 } },
        { event: 'evt-1', status: 'waitlisted', count: { id: 5 } },
      ],
    });

    const events = await svc.list();

    expect(events).toHaveLength(1);
    expect(events[0]?.counts).toEqual({
      registered: 42,
      waitlisted: 5,
      cancelled: 0,
      attended: 33,
    });
    const listCall = dx.get.mock.calls[0]?.[0] as string;
    expect(listCall).toContain('/items/events?sort=-starts_at');
    const aggCall = dx.get.mock.calls[1]?.[0] as string;
    expect(aggCall).toContain('aggregate[count]=id');
    expect(aggCall).toContain('groupBy[]=event');
    expect(aggCall).toContain('groupBy[]=status');
  });

  it('returns empty counts when no events', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    const events = await svc.list();
    expect(events).toEqual([]);
    // No aggregate call when no events
    expect(dx.get).toHaveBeenCalledTimes(1);
  });
});

describe('EventsService.getById', () => {
  it('returns event + counts + followups', async () => {
    dx.get
      .mockResolvedValueOnce({ data: EVENT_ROW })
      .mockResolvedValueOnce({
        data: [{ event: 'evt-1', status: 'registered', count: { id: 10 } }],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'fu-1',
            kind: 'retrospective',
            body_md: 'good event',
            due_at: null,
            completed_at: null,
          },
          {
            id: 'fu-2',
            kind: 'unknown_kind', // should be filtered out
            body_md: null,
            due_at: null,
            completed_at: null,
          },
        ],
      });

    const detail = await svc.getById('evt-1');

    expect(detail.id).toBe('evt-1');
    expect(detail.counts.registered).toBe(10);
    expect(detail.followups).toHaveLength(1);
    expect(detail.followups[0]?.kind).toBe('retrospective');
  });

  it('throws NotFoundException on 404', async () => {
    dx.get.mockRejectedValueOnce(new DirectusError(404, '/items/events/missing', 'not found'));
    await expect(svc.getById('missing')).rejects.toThrow(/event missing not found/);
  });
});

describe('EventsService.patch', () => {
  it('PATCHes Directus + refetches detail', async () => {
    dx.patch.mockResolvedValueOnce({ data: EVENT_ROW });
    dx.get
      .mockResolvedValueOnce({ data: { ...EVENT_ROW, title: 'Renamed' } })
      .mockResolvedValueOnce({ data: [] }) // counts
      .mockResolvedValueOnce({ data: [] }); // followups

    const next = await svc.patch('evt-1', { title: 'Renamed', capacity: 100 });

    expect(next.title).toBe('Renamed');
    const patchCall = dx.patch.mock.calls[0];
    expect(patchCall?.[0]).toBe('/items/events/evt-1');
    expect(patchCall?.[1]).toEqual({ title: 'Renamed', capacity: 100 });
  });
});

describe('EventsService.upsertFollowup', () => {
  it('creates a new followup row when none exists', async () => {
    dx.get.mockResolvedValueOnce({ data: [] }); // findFollowup → none
    dx.post.mockResolvedValueOnce({
      data: {
        id: 'fu-new',
        kind: 'retrospective',
        body_md: 'notes',
        due_at: null,
        completed_at: null,
      },
    });

    const result = await svc.upsertFollowup('evt-1', 'retrospective', { body_md: 'notes' });

    expect(result.id).toBe('fu-new');
    const postCall = dx.post.mock.calls[0];
    expect(postCall?.[0]).toBe('/items/event_followups');
    expect(postCall?.[1]).toMatchObject({
      event: 'evt-1',
      kind: 'retrospective',
      body_md: 'notes',
    });
  });

  it('patches existing followup when present', async () => {
    dx.get.mockResolvedValueOnce({ data: [{ id: 'fu-existing' }] });
    dx.patch.mockResolvedValueOnce({
      data: {
        id: 'fu-existing',
        kind: 'thank_you_sent',
        body_md: null,
        due_at: null,
        completed_at: '2026-06-02T00:00:00.000Z',
      },
    });

    const result = await svc.upsertFollowup('evt-1', 'thank_you_sent', { completed: true });

    expect(result.completed_at).not.toBeNull();
    const patchCall = dx.patch.mock.calls[0];
    expect(patchCall?.[0]).toBe('/items/event_followups/fu-existing');
    expect((patchCall?.[1] as Record<string, unknown>).completed_at).toBeTypeOf('string');
  });

  it('sets completed_at to null when completed=false', async () => {
    dx.get.mockResolvedValueOnce({ data: [{ id: 'fu-existing' }] });
    dx.patch.mockResolvedValueOnce({
      data: {
        id: 'fu-existing',
        kind: 'recap_posted',
        body_md: null,
        due_at: null,
        completed_at: null,
      },
    });

    await svc.upsertFollowup('evt-1', 'recap_posted', { completed: false });
    expect((dx.patch.mock.calls[0]?.[1] as Record<string, unknown>).completed_at).toBeNull();
  });
});
