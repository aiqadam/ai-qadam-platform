import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';
import { AnnounceService } from '../src/modules/workspace/announce.service';
import { CohortsService } from '../src/modules/workspace/cohorts.service';
import { MembersService } from '../src/modules/workspace/members.service';

// F-S3.3 — AnnounceService tests. Mocks Directus + the
// InteractionsService dispatcher; verifies the cohort→userIds resolution
// and dispatcher invocation shape.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeInteractions = { dispatch: ReturnType<typeof vi.fn> };

const OPERATOR_ID = '11111111-1111-4000-8000-000000000001';
const COHORT_ID = '22222222-2222-4000-8000-000000000002';

let dx: FakeDirectus;
let dispatcher: FakeInteractions;
let members: MembersService;
let cohorts: CohortsService;
let announce: AnnounceService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  dispatcher = { dispatch: vi.fn() };
  members = new MembersService(dx as unknown as DirectusClient);
  cohorts = new CohortsService(dx as unknown as DirectusClient, members);
  announce = new AnnounceService(cohorts, members, dispatcher as unknown as InteractionsService);
});

describe('AnnounceService.preview', () => {
  it('returns cohort name + current count and includes footer text', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: {
          id: COHORT_ID,
          name: 'UZ Active 90d',
          slug: 'uz-active-90d',
          filter_query: { country: { _eq: 'uz' } },
          member_count_cached: 100,
        },
      })
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 142 } });

    const result = await announce.preview(COHORT_ID, 'Next event', 'Hi everyone\n\nCome through.');
    expect(result.cohortName).toBe('UZ Active 90d');
    expect(result.estimatedRecipients).toBe(142);
    expect(result.subject).toBe('Next event');
    expect(result.text).toContain('Come through.');
    expect(result.text).toContain('— AI Qadam');
    expect(result.text).toContain('Manage your email preferences');
    expect(result.truncated).toBe(false);
  });

  it('flags truncated=true when audience exceeds MAX_DISPATCH_AUDIENCE', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: {
          id: COHORT_ID,
          name: 'Big',
          slug: 'big',
          filter_query: {},
          member_count_cached: 0,
        },
      })
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 10_000 } });
    const r = await announce.preview(COHORT_ID, 's', 'b');
    expect(r.truncated).toBe(true);
  });

  it('rejects missing fields', async () => {
    await expect(announce.preview('', 's', 'b')).rejects.toThrow();
    await expect(announce.preview(COHORT_ID, '', 'b')).rejects.toThrow();
    await expect(announce.preview(COHORT_ID, 's', '')).rejects.toThrow();
  });
});

describe('AnnounceService.send', () => {
  it('dispatches with the expected shape: operator initiator, intent, audience', async () => {
    // cohort lookup
    dx.get
      .mockResolvedValueOnce({
        data: {
          id: COHORT_ID,
          name: 'UZ Fintech CEOs',
          slug: 'uz-fintech-ceos',
          filter_query: { _and: [{ country: { _eq: 'uz' } }] },
          member_count_cached: 47,
        },
      })
      // current count for delta
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 47 } })
      // resolveToUserIds: count
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 3 } })
      // resolveToUserIds: fetch
      .mockResolvedValueOnce({
        data: [{ id: 'u-1' }, { id: 'u-2' }, { id: 'u-3' }],
      });
    dispatcher.dispatch.mockResolvedValueOnce({
      interactionId: 'i-1',
      deliveries: [
        {
          state: 'sent',
          deliveryId: 'd-1',
          recipientUserId: 'u-1',
          channel: 'email',
          failureReason: null,
        },
        {
          state: 'skipped_consent',
          deliveryId: 'd-2',
          recipientUserId: 'u-2',
          channel: 'email',
          failureReason: null,
        },
        {
          state: 'failed',
          deliveryId: 'd-3',
          recipientUserId: 'u-3',
          channel: 'email',
          failureReason: 'smtp',
        },
      ],
    });

    const sent = await announce.send(
      {
        cohortId: COHORT_ID,
        subject: 'Hello',
        body: 'Test body',
        consentBasis: 'explicit_opt_in',
      },
      OPERATOR_ID,
    );

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    const call = dispatcher.dispatch.mock.calls[0]?.[0] as {
      initiatorActor: string;
      intent: string;
      audience: { userIds: string[] };
      consentBasis: string;
      allowedChannels: string[];
      payload: { subject: string; text: string; html: string };
    };
    expect(call.initiatorActor).toBe('operator');
    expect(call.intent).toBe('operator_announcement');
    expect(call.audience.userIds).toEqual(['u-1', 'u-2', 'u-3']);
    expect(call.consentBasis).toBe('explicit_opt_in');
    expect(call.allowedChannels).toEqual(['email']);
    expect(call.payload.subject).toBe('Hello');
    expect(call.payload.text).toContain('Test body');
    expect(call.payload.html).toContain('Test body');

    expect(sent.interactionId).toBe('i-1');
    expect(sent.recipientCount).toBe(3);
    expect(sent.deliveriesSummary).toEqual({
      sent: 1,
      skipped_consent: 1,
      failed: 1,
      other: 0,
    });
  });

  it('refuses to dispatch when cohort resolves to zero members', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: {
          id: COHORT_ID,
          name: 'Empty',
          slug: 'empty',
          filter_query: { country: { _eq: 'xx' } },
          member_count_cached: 0,
        },
      })
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } })
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } });

    await expect(
      announce.send(
        { cohortId: COHORT_ID, subject: 's', body: 'b', consentBasis: 'explicit_opt_in' },
        OPERATOR_ID,
      ),
    ).rejects.toThrow(/0 members/);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
