import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { ConsentService } from '../src/modules/interactions/consent.service';

// Pure-mock vitest. The Directus call is the only side effect; we mock it.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const USER = '11111111-1111-4000-8000-000000000001';

let dx: FakeDirectus;
let svc: ConsentService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  svc = new ConsentService(dx as unknown as DirectusClient);
});

describe('ConsentService.check — trivial bases', () => {
  it('operational_contract always passes', async () => {
    const res = await svc.check({
      userId: USER,
      initiatorActor: 'system',
      intent: 'registered',
      consentBasis: 'operational_contract',
    });
    expect(res).toEqual({ ok: true });
    expect(dx.get).not.toHaveBeenCalled();
  });

  it('b2b_contract passes for non-client initiators', async () => {
    for (const initiatorActor of ['sponsor', 'speaker', 'operator', 'system'] as const) {
      const res = await svc.check({
        userId: USER,
        initiatorActor,
        intent: 'sponsor_offer',
        consentBasis: 'b2b_contract',
      });
      expect(res.ok).toBe(true);
    }
  });

  it('b2b_contract is rejected when initiator is a client', async () => {
    const res = await svc.check({
      userId: USER,
      initiatorActor: 'client',
      intent: 'sponsor_offer',
      consentBasis: 'b2b_contract',
    });
    expect(res).toEqual({
      ok: false,
      reason: 'b2b_contract requires non-client initiator',
    });
  });
});

describe('ConsentService.check — explicit_opt_in', () => {
  it('rejects when no matching consent_records exist', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    const res = await svc.check({
      userId: USER,
      initiatorActor: 'operator',
      intent: 'newsletter',
      consentBasis: 'explicit_opt_in',
    });
    expect(res).toEqual({
      ok: false,
      reason: 'no consent_record for user×operator×newsletter',
    });
  });

  it('passes when latest matching record is not revoked', async () => {
    dx.get.mockResolvedValueOnce({
      data: [{ id: 'c-1', granted_at: '2026-01-01T00:00:00Z', revoked_at: null, scope: null }],
    });
    const res = await svc.check({
      userId: USER,
      initiatorActor: 'operator',
      intent: 'newsletter',
      consentBasis: 'explicit_opt_in',
    });
    expect(res).toEqual({ ok: true });
  });

  it('rejects when latest matching record is revoked', async () => {
    dx.get.mockResolvedValueOnce({
      data: [
        {
          id: 'c-2',
          granted_at: '2026-02-01T00:00:00Z',
          revoked_at: '2026-03-01T00:00:00Z',
          scope: null,
        },
      ],
    });
    const res = await svc.check({
      userId: USER,
      initiatorActor: 'operator',
      intent: 'newsletter',
      consentBasis: 'explicit_opt_in',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('revoked');
  });

  it('honors most-recent-wins via sort=-granted_at', async () => {
    // Caller sorts descending; we return descending → first row is latest.
    dx.get.mockResolvedValueOnce({
      data: [
        { id: 'newest', granted_at: '2026-03-01T00:00:00Z', revoked_at: null, scope: null },
        {
          id: 'older',
          granted_at: '2026-01-01T00:00:00Z',
          revoked_at: '2026-02-01T00:00:00Z',
          scope: null,
        },
      ],
    });
    const res = await svc.check({
      userId: USER,
      initiatorActor: 'operator',
      intent: 'newsletter',
      consentBasis: 'explicit_opt_in',
    });
    expect(res).toEqual({ ok: true });
  });

  it('scope: null on record matches any request scope (broad grant)', async () => {
    dx.get.mockResolvedValueOnce({
      data: [{ id: 'broad', granted_at: '2026-01-01T00:00:00Z', revoked_at: null, scope: null }],
    });
    const res = await svc.check({
      userId: USER,
      initiatorActor: 'sponsor',
      intent: 'sponsor_offer',
      consentBasis: 'explicit_opt_in',
      consentScope: { sponsor_id: 'sp-1' },
    });
    expect(res).toEqual({ ok: true });
  });

  it('scoped record only matches matching scope', async () => {
    dx.get.mockResolvedValueOnce({
      data: [
        {
          id: 'narrow',
          granted_at: '2026-01-01T00:00:00Z',
          revoked_at: null,
          scope: { sponsor_id: 'sp-1' },
        },
      ],
    });
    const matched = await svc.check({
      userId: USER,
      initiatorActor: 'sponsor',
      intent: 'sponsor_offer',
      consentBasis: 'explicit_opt_in',
      consentScope: { sponsor_id: 'sp-1' },
    });
    expect(matched).toEqual({ ok: true });

    dx.get.mockResolvedValueOnce({
      data: [
        {
          id: 'narrow',
          granted_at: '2026-01-01T00:00:00Z',
          revoked_at: null,
          scope: { sponsor_id: 'sp-1' },
        },
      ],
    });
    const otherSponsor = await svc.check({
      userId: USER,
      initiatorActor: 'sponsor',
      intent: 'sponsor_offer',
      consentBasis: 'explicit_opt_in',
      consentScope: { sponsor_id: 'sp-2' },
    });
    expect(otherSponsor.ok).toBe(false);
  });

  it('passes filter to Directus with the correct shape', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    await svc.check({
      userId: USER,
      initiatorActor: 'operator',
      intent: 'newsletter',
      consentBasis: 'explicit_opt_in',
    });
    const url = dx.get.mock.calls[0]?.[0] as string;
    expect(url).toContain('/items/consent_records');
    expect(url).toContain('sort=-granted_at');
    const filterParam = new URL(`http://x${url}`).searchParams.get('filter');
    const parsed = JSON.parse(filterParam ?? '{}');
    expect(parsed.user._eq).toBe(USER);
    expect(parsed.initiator_actor_class._eq).toBe('operator');
    expect(parsed.intent_class._eq).toBe('newsletter');
  });

  it('maps initiator_actor=team to initiator_actor_class=system in the filter', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    await svc.check({
      userId: USER,
      initiatorActor: 'team',
      intent: 'team_invite',
      consentBasis: 'explicit_opt_in',
    });
    const url = dx.get.mock.calls[0]?.[0] as string;
    const filterParam = new URL(`http://x${url}`).searchParams.get('filter');
    const parsed = JSON.parse(filterParam ?? '{}');
    expect(parsed.initiator_actor_class._eq).toBe('system');
  });
});

describe('ConsentService.check — deferred bases', () => {
  it('event_eula is deferred (returns ok=false with 5.5/7 note)', async () => {
    const res = await svc.check({
      userId: USER,
      initiatorActor: 'system',
      intent: 'event_announce',
      consentBasis: 'event_eula',
      consentScope: { event_id: 'e-1' },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('5.5/7');
  });

  it('client_initiated is deferred (returns ok=false with not-implemented note)', async () => {
    const res = await svc.check({
      userId: USER,
      initiatorActor: 'operator',
      intent: 'support_ack',
      consentBasis: 'client_initiated',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('not yet implemented');
  });
});
