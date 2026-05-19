import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { PreferencesService } from '../src/modules/preferences/preferences.service';

// Pure-mock. Directus is the only side effect.

const USER = '11111111-1111-4000-8000-000000000001';

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let dx: FakeDirectus;
let svc: PreferencesService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  svc = new PreferencesService(dx as unknown as DirectusClient);
});

describe('PreferencesService.list', () => {
  it('returns all three topics as ungranted when no records exist', async () => {
    // One GET per topic; all empty
    dx.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const summary = await svc.list(USER);

    expect(summary).toHaveLength(3);
    expect(summary.every((s) => s.granted === false)).toBe(true);
    expect(summary.every((s) => s.lastChangedAt === null)).toBe(true);
    expect(summary.map((s) => s.topic).sort()).toEqual([
      'newsletter',
      'speaker_promo',
      'sponsor_offer',
    ]);
    expect(dx.get).toHaveBeenCalledTimes(3);
  });

  it('marks topic granted when latest matching record has revoked_at=null', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [{ id: 'r-1', granted_at: '2026-01-01T00:00:00Z', revoked_at: null }],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const summary = await svc.list(USER);
    const newsletter = summary.find((s) => s.topic === 'newsletter');
    expect(newsletter).toEqual({
      topic: 'newsletter',
      granted: true,
      lastChangedAt: '2026-01-01T00:00:00Z',
    });
  });

  it('marks topic NOT granted when latest matching record is revoked', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [
          {
            id: 'r-2',
            granted_at: '2026-02-01T00:00:00Z',
            revoked_at: '2026-02-01T00:00:00Z',
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const summary = await svc.list(USER);
    const newsletter = summary.find((s) => s.topic === 'newsletter');
    expect(newsletter?.granted).toBe(false);
    expect(newsletter?.lastChangedAt).toBe('2026-02-01T00:00:00Z');
  });

  it('queries Directus with the right filter shape per topic', async () => {
    dx.get.mockResolvedValue({ data: [] });
    await svc.list(USER);

    expect(dx.get).toHaveBeenCalledTimes(3);
    const urls = dx.get.mock.calls.map((c) => c[0] as string);
    for (const url of urls) {
      expect(url).toContain('/items/consent_records');
      expect(url).toContain('sort=-granted_at');
      expect(url).toContain('limit=1');
    }
    const parseFilter = (url: string) => {
      const param = new URL(`http://x${url}`).searchParams.get('filter');
      return JSON.parse(param ?? '{}');
    };
    const filters = urls.map(parseFilter);
    const intents = filters.map((f) => f.intent_class._eq).sort();
    expect(intents).toEqual(['newsletter', 'speaker_promo', 'sponsor_offer']);
    for (const filter of filters) {
      expect(filter.user._eq).toBe(USER);
      expect(filter.scope._null).toBe(true);
    }
  });
});

describe('PreferencesService.set', () => {
  it('grant → POSTs row with revoked_at null', async () => {
    dx.post.mockResolvedValueOnce({ data: { id: 'new-1' } });
    const res = await svc.set(USER, 'newsletter', true);

    expect(dx.post).toHaveBeenCalledTimes(1);
    expect(dx.post.mock.calls[0]?.[0]).toBe('/items/consent_records');
    const body = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.user).toBe(USER);
    expect(body.initiator_actor_class).toBe('operator');
    expect(body.intent_class).toBe('newsletter');
    expect(body.scope).toBeNull();
    expect(body.revoked_at).toBeNull();
    expect(typeof body.granted_at).toBe('string');
    expect(body.source).toBe('preferences_page');

    expect(res.topic).toBe('newsletter');
    expect(res.granted).toBe(true);
    expect(res.lastChangedAt).toBeTruthy();
  });

  it('revoke → POSTs row with revoked_at set to the same instant as granted_at', async () => {
    dx.post.mockResolvedValueOnce({ data: { id: 'new-2' } });
    await svc.set(USER, 'sponsor_offer', false);

    const body = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.initiator_actor_class).toBe('sponsor');
    expect(body.intent_class).toBe('sponsor_offer');
    expect(body.granted_at).toBe(body.revoked_at);
  });

  it('returns the new state without re-reading', async () => {
    dx.post.mockResolvedValueOnce({ data: { id: 'new-3' } });
    const res = await svc.set(USER, 'speaker_promo', true);

    expect(res).toEqual({
      topic: 'speaker_promo',
      granted: true,
      lastChangedAt: expect.any(String),
    });
    // No follow-up GET — we trust the just-written row's state
    expect(dx.get).not.toHaveBeenCalled();
  });
});
