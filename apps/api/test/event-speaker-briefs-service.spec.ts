import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import { EventSpeakerBriefsService } from '../src/modules/workspace/event-speaker-briefs.service';

// F-S1.4b — T-7 speaker brief cron. Mocks Directus + InteractionsService.
//
// Tick:
//   1. fetch candidate events in T-7 window
//   2. for each event:
//        2a. fetch confirmed event_speakers (with speaker.user expansion)
//        2b. fetch registered audience count
//        2c. for each speaker (with userId):
//              - check event_announcements (event, kind, speaker)
//              - dispatch + record

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let interactions: FakeInteractions;
let svc: EventSpeakerBriefsService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  interactions = { dispatch: vi.fn().mockResolvedValue({ interactionId: 'i-x', deliveries: [] }) };
  svc = new EventSpeakerBriefsService(
    dx as unknown as DirectusClient,
    interactions as unknown as InteractionsService,
  );
});

const EVENT = {
  id: 'evt-1',
  title: 'Tashkent #5',
  starts_at: '2026-06-15T18:00:00.000Z',
  location: 'Workly',
  country: 'uz',
};
const SPEAKER_ROW_A = {
  id: 'es-a',
  talk_title: 'Practical LLM eval',
  speaker: {
    id: 'spk-a',
    user: { id: 'usr-a', first_name: 'Alice', last_name: 'Karim', email: 'a@example.com' },
  },
};
const SPEAKER_ROW_B = {
  id: 'es-b',
  talk_title: null,
  speaker: {
    id: 'spk-b',
    user: { id: 'usr-b', first_name: null, last_name: null, email: 'b@example.com' },
  },
};

describe('EventSpeakerBriefsService.tick', () => {
  it('dispatches a personal brief per confirmed speaker + records per-speaker ledger', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [EVENT] }) // candidates
      .mockResolvedValueOnce({ data: [SPEAKER_ROW_A, SPEAKER_ROW_B] }) // confirmed speakers
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 42 } }) // registered count
      .mockResolvedValueOnce({ data: [] }) // ledger lookup for spk-a
      .mockResolvedValueOnce({ data: [] }); // ledger lookup for spk-b

    const result = await svc.tick();

    expect(result.dispatched).toHaveLength(2);
    expect(interactions.dispatch).toHaveBeenCalledTimes(2);
    const firstCall = interactions.dispatch.mock.calls[0]?.[0];
    expect(firstCall.intent).toBe('speaker_brief');
    expect(firstCall.audience).toEqual({ userIds: ['usr-a'] });
    expect(firstCall.consentBasis).toBe('operational_contract');
    const payload = firstCall.payload as { subject: string; text: string };
    expect(payload.subject).toContain('Tashkent #5');
    expect(payload.text).toContain('Practical LLM eval');
    expect(payload.text).toContain('42 registered');
    // Per-speaker ledger rows include the speaker FK
    expect(dx.post).toHaveBeenCalledTimes(2);
    const ledgerBody = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ledgerBody.event).toBe('evt-1');
    expect(ledgerBody.kind).toBe('reminder_t_minus_7_speaker');
    expect(ledgerBody.speaker).toBe('spk-a');
  });

  it('skips speakers with no linked Directus user', async () => {
    const noUserRow = {
      id: 'es-c',
      talk_title: 'Talk C',
      speaker: { id: 'spk-c', user: null },
    };
    dx.get
      .mockResolvedValueOnce({ data: [EVENT] })
      .mockResolvedValueOnce({ data: [noUserRow] })
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } });

    const result = await svc.tick();
    expect(result.dispatched).toHaveLength(0);
    expect(result.skipped).toEqual([{ eventId: 'evt-1', speakerId: 'spk-c', reason: 'no_user' }]);
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });

  it('skips speakers whose (event, speaker) ledger row already exists', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [EVENT] })
      .mockResolvedValueOnce({ data: [SPEAKER_ROW_A] })
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 1 } })
      .mockResolvedValueOnce({ data: [{ id: 'ann-existing' }] }); // ledger has prior row

    const result = await svc.tick();
    expect(result.dispatched).toHaveLength(0);
    expect(result.skipped).toEqual([
      { eventId: 'evt-1', speakerId: 'spk-a', reason: 'already_dispatched' },
    ]);
    expect(interactions.dispatch).not.toHaveBeenCalled();
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('candidates filter is status=published + starts_at in [156h, 180h]', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    await svc.tick();
    const call = decodeURIComponent(dx.get.mock.calls[0]?.[0] as string);
    expect(call).toContain('"status":{"_eq":"published"}');
    expect(call).toContain('"starts_at":{"_gte":');
    expect(call).toContain('"starts_at":{"_lte":');
  });

  it('confirmed-speakers filter is event=eventId AND status=confirmed', async () => {
    dx.get.mockResolvedValueOnce({ data: [EVENT] }).mockResolvedValueOnce({ data: [] });
    await svc.tick();
    const call = decodeURIComponent(dx.get.mock.calls[1]?.[0] as string);
    expect(call).toContain('"event":{"_eq":"evt-1"}');
    expect(call).toContain('"status":{"_eq":"confirmed"}');
  });

  it('records error + does NOT write ledger when dispatch throws', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [EVENT] })
      .mockResolvedValueOnce({ data: [SPEAKER_ROW_A] })
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 5 } })
      .mockResolvedValueOnce({ data: [] });
    interactions.dispatch.mockRejectedValueOnce(new Error('Resend 503'));

    const result = await svc.tick();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('Resend 503');
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('skips event entirely when no confirmed speakers (no registered-count fetch)', async () => {
    dx.get.mockResolvedValueOnce({ data: [EVENT] }).mockResolvedValueOnce({ data: [] }); // zero speakers
    const result = await svc.tick();
    expect(result.dispatched).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.evaluated).toBe(0);
    // Only 2 GETs (candidates + speakers); no registered-count fetch
    expect(dx.get).toHaveBeenCalledTimes(2);
  });
});
