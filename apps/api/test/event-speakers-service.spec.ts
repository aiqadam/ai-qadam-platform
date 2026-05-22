import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import { EventSpeakersService } from '../src/modules/workspace/event-speakers.service';

// F-S1.1b — CRUD + the speaker_added broadcast that fires on the
// invited/accepted → confirmed transition.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let interactions: FakeInteractions;
let svc: EventSpeakersService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  interactions = { dispatch: vi.fn().mockResolvedValue({ interactionId: 'i-1', deliveries: [] }) };
  svc = new EventSpeakersService(
    dx as unknown as DirectusClient,
    interactions as unknown as InteractionsService,
  );
});

function buildRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'es-1',
    event: 'evt-1',
    speaker: {
      id: 'spk-1',
      headline: 'Principal ML',
      user: { id: 'u-1', first_name: 'Aigerim', last_name: 'K', email: 'a@x' },
    },
    talk_title: 'Why transformers?',
    talk_topic: 'A walkthrough of attention',
    status: 'invited',
    confirmed_at: null,
    order_index: 100,
    ...overrides,
  };
}

describe('EventSpeakersService.create', () => {
  it('rejects duplicate (event, speaker)', async () => {
    dx.get.mockResolvedValueOnce({ data: [{ id: 'es-existing' }] });
    await expect(svc.create('evt-1', { speakerId: 'spk-1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('inserts new event_speaker with sane defaults', async () => {
    dx.get.mockResolvedValueOnce({ data: [] }); // findExisting
    dx.post.mockResolvedValueOnce({ data: { id: 'es-new' } });
    dx.get.mockResolvedValueOnce({ data: buildRow({ id: 'es-new', status: 'invited' }) });

    const result = await svc.create('evt-1', {
      speakerId: 'spk-1',
      talkTitle: 'Why transformers?',
    });

    expect(result.id).toBe('es-new');
    expect(result.status).toBe('invited');
    expect(result.speakerName).toBe('Aigerim K');
    const body = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.event).toBe('evt-1');
    expect(body.speaker).toBe('spk-1');
    expect(body.status).toBe('invited');
    expect(body.order_index).toBe(100);
  });
});

describe('EventSpeakersService.patch — confirm transition', () => {
  it('fires speaker_added broadcast + records ledger row on invited→confirmed', async () => {
    // Sequence:
    //   fetchOne(prior)
    //   patch
    //   fetchOne(next)
    //   broadcast:
    //     eventIdFor → event id lookup
    //     idempotency check → no existing
    //     eventIdFor (again, used inside) — wait, actually broadcast
    //       calls eventIdFor() twice in current impl. Let me follow.
    //
    // The implementation calls eventIdFor twice (once in the dupe filter,
    // once in fetchEventBrief flow). We mock generously.
    dx.get
      // fetchOne(prior)
      .mockResolvedValueOnce({ data: buildRow({ status: 'invited' }) })
      // fetchOne(next)
      .mockResolvedValueOnce({
        data: buildRow({ status: 'confirmed', confirmed_at: '2026-06-15T00:00:00.000Z' }),
      })
      // broadcastSpeakerAdded → eventIdFor (first)
      .mockResolvedValueOnce({ data: { event: 'evt-1' } })
      // broadcastSpeakerAdded → idempotency check
      .mockResolvedValueOnce({ data: [] })
      // broadcastSpeakerAdded → eventIdFor (second, inside fetchEventBrief flow)
      .mockResolvedValueOnce({ data: { event: 'evt-1' } })
      // broadcastSpeakerAdded → fetchEventBrief
      .mockResolvedValueOnce({
        data: {
          id: 'evt-1',
          title: 'Tashkent #5',
          starts_at: '2026-06-15T18:00:00.000Z',
          location: 'Workly',
        },
      })
      // attendeeUserIdsOf
      .mockResolvedValueOnce({ data: [{ user: 'u-a' }, { user: 'u-b' }] });
    dx.patch.mockResolvedValueOnce({ data: { id: 'es-1' } });
    dx.post.mockResolvedValueOnce({ data: { id: 'ann-1' } });

    const result = await svc.patch('es-1', { status: 'confirmed' });

    expect(result.status).toBe('confirmed');
    // Wait for the .catch() — broadcast runs async + best-effort.
    // We assert by polling the dispatch mock; tick a microtask:
    await new Promise((r) => setTimeout(r, 10));

    // patch wrote confirmed_at
    const patchBody = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchBody.status).toBe('confirmed');
    expect(patchBody.confirmed_at).toBeTypeOf('string');

    // broadcast called dispatch with right shape
    expect(interactions.dispatch).toHaveBeenCalledTimes(1);
    const di = interactions.dispatch.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(di.intent).toBe('speaker_added');
    expect(di.consentBasis).toBe('operational_contract');
    const payload = di.payload as { subject: string; text: string };
    expect(payload.subject).toContain('Aigerim K');
    expect(payload.subject).toContain('Tashkent #5');
    expect(payload.text).toContain('Workly');
    expect((di.audience as { userIds: string[] }).userIds).toEqual(['u-a', 'u-b']);

    // ledger row recorded
    const ledger = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ledger.kind).toBe('speaker_added');
    expect(ledger.speaker).toBe('spk-1');
    expect(ledger.dispatched_interaction_id).toBe('i-1');
    expect(ledger.recipient_count).toBe(2);
  });

  it('does NOT fire on confirmed→confirmed (no transition)', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: buildRow({ status: 'confirmed', confirmed_at: '2026-06-15T00:00:00.000Z' }),
      })
      .mockResolvedValueOnce({
        data: buildRow({ status: 'confirmed', confirmed_at: '2026-06-15T00:00:00.000Z' }),
      });
    dx.patch.mockResolvedValueOnce({ data: { id: 'es-1' } });

    await svc.patch('es-1', { status: 'confirmed', talkTitle: 'New title' });

    expect(interactions.dispatch).not.toHaveBeenCalled();
  });

  it('does NOT fire when status patch is not confirmed', async () => {
    dx.get
      .mockResolvedValueOnce({ data: buildRow({ status: 'invited' }) })
      .mockResolvedValueOnce({ data: buildRow({ status: 'accepted' }) });
    dx.patch.mockResolvedValueOnce({ data: { id: 'es-1' } });

    await svc.patch('es-1', { status: 'accepted' });

    expect(interactions.dispatch).not.toHaveBeenCalled();
  });
});

describe('EventSpeakersService.broadcastSpeakerAdded — idempotency', () => {
  it('skips when a ledger row already exists for (event, speaker)', async () => {
    const es = {
      id: 'es-1',
      speakerId: 'spk-1',
      speakerName: 'Aigerim K',
      speakerHeadline: 'Principal ML',
      talkTitle: null,
      talkTopic: null,
      status: 'confirmed' as const,
      confirmedAt: '2026-06-15T00:00:00.000Z',
      orderIndex: 100,
    };
    dx.get
      .mockResolvedValueOnce({ data: { event: 'evt-1' } }) // eventIdFor
      .mockResolvedValueOnce({ data: [{ id: 'ann-prior' }] }); // idempotency hit

    await svc.broadcastSpeakerAdded(es);

    expect(interactions.dispatch).not.toHaveBeenCalled();
    expect(dx.post).not.toHaveBeenCalled();
  });
});
