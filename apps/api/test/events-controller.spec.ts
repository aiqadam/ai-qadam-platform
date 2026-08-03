import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventSpeakersService } from '../src/modules/workspace/event-speakers.service';
import { EventsController } from '../src/modules/workspace/events.controller';
import type { EventDetail, EventsService } from '../src/modules/workspace/events.service';

// Security review MAJOR-2 (wf-20260803-feat-197 retry 1) — patchEventSchema.title
// gained a `.regex(/^[^"\\]*$/)` guard. No test file anywhere in apps/api/test/
// previously exercised EventsController/patchEventSchema (events-service.spec.ts
// calls EventsService.patch() directly, bypassing the controller's Zod
// boundary entirely). This file fills that gap, scoped to the title regex
// guard only — mirrors events-service.spec.ts's hand-rolled-fake mocking
// style for its own dependencies.

type FakeEventsService = {
  list: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  upsertFollowup: ReturnType<typeof vi.fn>;
};

const EVENT_DETAIL: EventDetail = {
  id: 'evt-1',
  title: 'AI Qadam Meetup',
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
  counts: { registered: 0, waitlisted: 0, cancelled: 0, attended: 0 },
  followups: [],
};

function fakeRequest(): Request {
  return { user: { id: 'operator-1' } } as unknown as Request;
}

let events: FakeEventsService;
let controller: EventsController;

beforeEach(() => {
  events = {
    list: vi.fn(),
    getById: vi.fn(),
    patch: vi.fn(),
    upsertFollowup: vi.fn(),
  };
  controller = new EventsController(
    events as unknown as EventsService,
    {} as unknown as EventSpeakersService,
  );
});

describe('EventsController.patch — patchEventSchema.title regex guard', () => {
  it('throws BadRequestException and never calls EventsService.patch when title contains a quote', async () => {
    const body = { title: 'Meetup: "AI in Practice"' };

    await expect(controller.patch(fakeRequest(), 'evt-1', body)).rejects.toThrow(
      BadRequestException,
    );

    expect(events.patch).not.toHaveBeenCalled();
  });

  it('throws BadRequestException and never calls EventsService.patch when title contains a backslash', async () => {
    const body = { title: 'Back\\slash' };

    await expect(controller.patch(fakeRequest(), 'evt-1', body)).rejects.toThrow(
      BadRequestException,
    );

    expect(events.patch).not.toHaveBeenCalled();
  });

  it('calls EventsService.patch when title has neither a quote nor a backslash', async () => {
    events.patch.mockResolvedValueOnce(EVENT_DETAIL);
    const body = { title: 'AI Qadam Meetup' };

    const result = await controller.patch(fakeRequest(), 'evt-1', body);

    expect(events.patch).toHaveBeenCalledWith('evt-1', expect.objectContaining({ title: 'AI Qadam Meetup' }));
    expect(result.event).toBe(EVENT_DETAIL);
  });
});

describe('EventsController.patch — patchEventSchema.title boundary/compat checks', () => {
  it('allows title to be omitted entirely (still optional)', async () => {
    events.patch.mockResolvedValueOnce(EVENT_DETAIL);
    const body = { capacity: 100 };

    const result = await controller.patch(fakeRequest(), 'evt-1', body);

    expect(events.patch).toHaveBeenCalledWith('evt-1', expect.objectContaining({ capacity: 100 }));
    expect(result.event).toBe(EVENT_DETAIL);
  });

  it('passes a 200-char boundary title with no forbidden characters', async () => {
    events.patch.mockResolvedValueOnce(EVENT_DETAIL);
    const title200 = 'x'.repeat(200);
    const body = { title: title200 };

    const result = await controller.patch(fakeRequest(), 'evt-1', body);

    expect(events.patch).toHaveBeenCalledWith('evt-1', expect.objectContaining({ title: title200 }));
    expect(result.event).toBe(EVENT_DETAIL);
  });
});
