import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import type { CsatService } from '../src/modules/workspace/csat.service';
import { PostEventCronService } from '../src/modules/workspace/post-event-cron.service';

// F-S1.1c — post-event cron. Mocks Directus + InteractionsService + CsatService.
// F-S1.1c ext (#NNN): added per-recipient CSAT dispatch via dispatcher's
// new renderPayload hook → first dispatch in processEvent.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };
type FakeCsat = { mintToken: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let interactions: FakeInteractions;
let csat: FakeCsat;
let svc: PostEventCronService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  interactions = { dispatch: vi.fn().mockResolvedValue({ interactionId: 'i-x', deliveries: [] }) };
  csat = { mintToken: vi.fn().mockResolvedValue('csat-token-xyz') };
  svc = new PostEventCronService(
    dx as unknown as DirectusClient,
    interactions as unknown as InteractionsService,
    csat as unknown as CsatService,
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
  it('processes a past event: dispatches csat + speaker_thanks + next_event_teaser + marks processed', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] }) // candidates
      .mockResolvedValueOnce({
        data: [{ user: 'u-a' }, { user: 'u-b' }, { user: 'u-c' }],
      }) // F-S1.1c ext — attendees for CSAT
      .mockResolvedValueOnce({ data: [{ speaker: { user: { id: 'spk-u' } } }] }) // confirmed speakers
      .mockResolvedValueOnce({ data: [NEXT_EVENT] }) // next event in country
      .mockResolvedValueOnce({
        data: [{ user: 'u-a' }, { user: 'u-b' }, { user: 'u-c' }],
      }); // attendees for teaser
    dx.patch.mockResolvedValueOnce({ data: { id: 'evt-past' } });

    const result = await svc.tick();

    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]).toEqual({
      eventId: 'evt-past',
      csatRecipients: 3,
      speakerThanksRecipients: 1,
      nextEventTeaserRecipients: 3,
    });
    expect(interactions.dispatch).toHaveBeenCalledTimes(3);
    const intents = interactions.dispatch.mock.calls.map((c) => c[0].intent);
    expect(intents).toEqual(['csat', 'speaker_thanks_with_referral_ask', 'next_event_teaser']);
    const teaserPayload = interactions.dispatch.mock.calls[2]?.[0].payload as {
      subject: string;
      text: string;
    };
    expect(teaserPayload.subject).toContain('Tashkent #5');
    expect(teaserPayload.text).toContain('https://aiqadam.org/events/evt-next');

    // F-S1.1c ext — csat dispatch carried a renderPayload callback.
    const csatCall = interactions.dispatch.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(csatCall.intent).toBe('csat');
    expect(typeof csatCall.renderPayload).toBe('function');
    // post_event_processed=true was set
    const patchBody = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchBody.post_event_processed).toBe(true);
  });

  it('skips speaker_thanks dispatch when no confirmed speakers', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] })
      .mockResolvedValueOnce({ data: [{ user: 'u-a' }] }) // attendees for CSAT
      .mockResolvedValueOnce({ data: [] }) // no confirmed speakers
      .mockResolvedValueOnce({ data: [NEXT_EVENT] })
      .mockResolvedValueOnce({ data: [{ user: 'u-a' }] });
    dx.patch.mockResolvedValueOnce({ data: { id: 'evt-past' } });

    const result = await svc.tick();

    expect(result.processed[0]?.speakerThanksRecipients).toBe(0);
    expect(result.processed[0]?.nextEventTeaserRecipients).toBe(1);
    expect(result.processed[0]?.csatRecipients).toBe(1);
    expect(interactions.dispatch).toHaveBeenCalledTimes(2);
    const intents = interactions.dispatch.mock.calls.map((c) => c[0].intent);
    expect(intents).toEqual(['csat', 'next_event_teaser']);
  });

  it('skips next_event_teaser when no next event in country', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] })
      .mockResolvedValueOnce({ data: [{ user: 'u-a' }] }) // attendees for CSAT
      .mockResolvedValueOnce({ data: [{ speaker: { user: { id: 'spk-u' } } }] })
      .mockResolvedValueOnce({ data: [] }); // no next event
    dx.patch.mockResolvedValueOnce({ data: { id: 'evt-past' } });

    const result = await svc.tick();

    expect(result.processed[0]?.nextEventTeaserRecipients).toBe(0);
    const intents = interactions.dispatch.mock.calls.map((c) => c[0].intent);
    expect(intents).toEqual(['csat', 'speaker_thanks_with_referral_ask']);
  });

  it('marks processed=true even when all dispatches skip (no attendees AND no speakers AND no next event)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] })
      .mockResolvedValueOnce({ data: [] }) // no attendees for CSAT
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

  it('records error + does NOT mark processed when csat dispatch throws (first step)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] })
      .mockResolvedValueOnce({ data: [{ user: 'u-a' }] }); // attendees for CSAT
    interactions.dispatch.mockRejectedValueOnce(new Error('Resend 503'));

    const result = await svc.tick();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('Resend 503');
    expect(dx.patch).not.toHaveBeenCalled();
  });

  // F-S1.1c ext — the renderPayload callback contract.
  it('csat renderPayload mints a token + builds a per-delivery URL', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [PAST_EVENT] })
      .mockResolvedValueOnce({ data: [{ user: 'u-a' }] }) // attendees for CSAT
      .mockResolvedValueOnce({ data: [] }) // no speakers
      .mockResolvedValueOnce({ data: [] }); // no next event
    dx.patch.mockResolvedValueOnce({ data: { id: 'evt-past' } });
    csat.mintToken.mockResolvedValueOnce('jwt-deadbeef');

    await svc.tick();
    const csatCall = interactions.dispatch.mock.calls[0]?.[0];
    expect(csatCall.intent).toBe('csat');
    // Invoke the renderer the way the dispatcher would, with a fake
    // delivery id; verify it mints + composes the URL.
    type Renderer = (ctx: {
      recipient: { userId: string; email: string | null };
      deliveryId: string;
    }) => Promise<{ subject: string; text: string }>;
    const renderer = (csatCall as { renderPayload: Renderer }).renderPayload;
    const rendered = await renderer({
      recipient: { userId: 'u-a', email: 'a@x' },
      deliveryId: 'delivery-1',
    });
    expect(csat.mintToken).toHaveBeenCalledWith('delivery-1');
    expect(rendered.text).toContain('https://aiqadam.org/feedback/csat?t=jwt-deadbeef');
    expect(rendered.subject).toContain('Tashkent #4');
  });
});
