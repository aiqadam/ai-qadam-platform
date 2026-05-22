import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import { PostEventCronService } from '../src/modules/workspace/post-event-cron.service';

// F-S1.1c — post-event cron. Mocks Directus + InteractionsService.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let interactions: FakeInteractions;
let svc: PostEventCronService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  interactions = { dispatch: vi.fn().mockResolvedValue({ interactionId: 'i-x', deliveries: [] }) };
  svc = new PostEventCronService(
    dx as unknown as DirectusClient,
    interactions as unknown as InteractionsService,
  );
});

const PAST_EVENT = {
  id: 'evt-past',
  title: 'Tashkent #4',
  starts_at: '2026-05-01T18:00:00.000Z',
  ends_at: '2026-05-01T21:00:00.000Z',
  location: 'Workly',
  country: 'uz',
};
const NEXT_EVENT = {
  id: 'evt-next',
  title: 'Tashkent #5',
  starts_at: '2026-06-15T18:00:00.000Z',
  ends_at: '2026-06-15T21:00:00.000Z',
  location: 'Workly',
  country: 'uz',
};

describe('PostEventCronService.tick', () => {
  it('processes a past event: dispatches speaker_thanks + next_event_teaser + marks processed', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] }) // candidates
      .mockResolvedValueOnce({ data: [{ speaker: { user: { id: 'spk-u' } } }] }) // confirmed speakers
      .mockResolvedValueOnce({ data: [NEXT_EVENT] }) // next event in country
      .mockResolvedValueOnce({
        data: [{ user: 'u-a' }, { user: 'u-b' }, { user: 'u-c' }],
      }); // attendees
    dx.patch.mockResolvedValueOnce({ data: { id: 'evt-past' } });

    const result = await svc.tick();

    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]).toEqual({
      eventId: 'evt-past',
      speakerThanksRecipients: 1,
      nextEventTeaserRecipients: 3,
    });
    expect(interactions.dispatch).toHaveBeenCalledTimes(2);
    const intents = interactions.dispatch.mock.calls.map((c) => c[0].intent);
    expect(intents).toEqual(['speaker_thanks_with_referral_ask', 'next_event_teaser']);
    const teaserPayload = interactions.dispatch.mock.calls[1]?.[0].payload as {
      subject: string;
      text: string;
    };
    expect(teaserPayload.subject).toContain('Tashkent #5');
    expect(teaserPayload.text).toContain('https://aiqadam.org/events/evt-next');

    // post_event_processed=true was set
    const patchBody = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchBody.post_event_processed).toBe(true);
  });

  it('skips speaker_thanks dispatch when no confirmed speakers', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] })
      .mockResolvedValueOnce({ data: [] }) // no confirmed speakers
      .mockResolvedValueOnce({ data: [NEXT_EVENT] })
      .mockResolvedValueOnce({ data: [{ user: 'u-a' }] });
    dx.patch.mockResolvedValueOnce({ data: { id: 'evt-past' } });

    const result = await svc.tick();

    expect(result.processed[0]?.speakerThanksRecipients).toBe(0);
    expect(result.processed[0]?.nextEventTeaserRecipients).toBe(1);
    expect(interactions.dispatch).toHaveBeenCalledTimes(1);
    expect(interactions.dispatch.mock.calls[0]?.[0].intent).toBe('next_event_teaser');
  });

  it('skips next_event_teaser when no next event in country', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] })
      .mockResolvedValueOnce({ data: [{ speaker: { user: { id: 'spk-u' } } }] })
      .mockResolvedValueOnce({ data: [] }); // no next event
    dx.patch.mockResolvedValueOnce({ data: { id: 'evt-past' } });

    const result = await svc.tick();

    expect(result.processed[0]?.nextEventTeaserRecipients).toBe(0);
    const intents = interactions.dispatch.mock.calls.map((c) => c[0].intent);
    expect(intents).toEqual(['speaker_thanks_with_referral_ask']);
  });

  it('marks processed=true even when both dispatches skip (still consumes the event)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] })
      .mockResolvedValueOnce({ data: [] }) // no speakers
      .mockResolvedValueOnce({ data: [] }); // no next event
    dx.patch.mockResolvedValueOnce({ data: { id: 'evt-past' } });

    await svc.tick();
    expect(interactions.dispatch).not.toHaveBeenCalled();
    expect((dx.patch.mock.calls[0]?.[1] as Record<string, unknown>).post_event_processed).toBe(
      true,
    );
  });

  it('candidates filter is published + ends_at < now + post_event_processed=false', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    await svc.tick();
    const call = decodeURIComponent(dx.get.mock.calls[0]?.[0] as string);
    expect(call).toContain('"status":{"_eq":"published"}');
    expect(call).toContain('"ends_at":{"_lt":');
    expect(call).toContain('"post_event_processed":{"_eq":false}');
  });

  it('records error + does NOT mark processed when speaker_thanks dispatch throws', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] })
      .mockResolvedValueOnce({ data: [{ speaker: { user: { id: 'spk-u' } } }] });
    interactions.dispatch.mockRejectedValueOnce(new Error('Resend 503'));

    const result = await svc.tick();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('Resend 503');
    expect(dx.patch).not.toHaveBeenCalled();
  });
});
