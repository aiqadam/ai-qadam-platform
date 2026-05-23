import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { ReferralsService } from '../src/modules/referrals/referrals.service';

// F-S3.9 — referrals service is a thin Directus REST proxy plus a
// code-mint helper. Tests mock the Directus client + bridge.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeBridge = { ensureLinked: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let bridge: FakeBridge;
let svc: ReferralsService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  bridge = { ensureLinked: vi.fn().mockResolvedValue('du-user-1') };
  svc = new ReferralsService(
    dx as unknown as DirectusClient,
    bridge as unknown as DirectusUsersBridgeService,
  );
});

describe('ReferralsService.issueForUser', () => {
  it('mints a new code when the user has none', async () => {
    dx.get.mockResolvedValueOnce({ data: [] }); // fetchByOwner → empty
    dx.post.mockResolvedValueOnce({
      data: {
        id: 'rc-1',
        code: 'abc123',
        owner_user: 'du-user-1',
        valid_until: null,
        date_created: '2026-05-22T00:00:00.000Z',
      },
    });

    const view = await svc.issueForUser('u-1', 'a@b.c');

    expect(view.code).toBe('abc123');
    expect(view.shareUrl).toContain('aiqadam.org/?ref=abc123');
    const postCall = dx.post.mock.calls[0];
    expect(postCall?.[0]).toBe('/items/referral_codes');
    expect((postCall?.[1] as Record<string, unknown>).owner_user).toBe('du-user-1');
    expect((postCall?.[1] as Record<string, unknown>).code).toMatch(/^[a-z0-9]{6}$/);
  });

  it('returns the existing active code idempotently (no second insert)', async () => {
    dx.get.mockResolvedValueOnce({
      data: [
        {
          id: 'rc-existing',
          code: 'qwer56',
          owner_user: 'du-user-1',
          valid_until: null,
          date_created: '2026-05-20T00:00:00.000Z',
        },
      ],
    });

    const view = await svc.issueForUser('u-1', 'a@b.c');

    expect(view.code).toBe('qwer56');
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('skips expired codes when picking an active one + mints fresh', async () => {
    dx.get.mockResolvedValueOnce({
      data: [
        {
          id: 'rc-old',
          code: 'expir1',
          owner_user: 'du-user-1',
          valid_until: '2020-01-01T00:00:00.000Z',
          date_created: '2019-12-01T00:00:00.000Z',
        },
      ],
    });
    dx.post.mockResolvedValueOnce({
      data: {
        id: 'rc-fresh',
        code: 'newco1',
        owner_user: 'du-user-1',
        valid_until: null,
        date_created: '2026-05-22T00:00:00.000Z',
      },
    });

    const view = await svc.issueForUser('u-1', 'a@b.c');
    expect(view.code).toBe('newco1');
    expect(dx.post).toHaveBeenCalledTimes(1);
  });

  it('throws when bridge cannot link the user', async () => {
    bridge.ensureLinked.mockResolvedValueOnce(null);
    await expect(svc.issueForUser('u-x', 'x@x')).rejects.toThrow(/resolve directus user/);
  });
});

describe('ReferralsService.listMine', () => {
  it('returns the owner rows mapped to views', async () => {
    dx.get.mockResolvedValueOnce({
      data: [
        {
          id: 'rc-1',
          code: 'aaaaaa',
          owner_user: 'du-user-1',
          valid_until: null,
          date_created: '2026-05-20T00:00:00.000Z',
        },
      ],
    });

    const codes = await svc.listMine('u-1', 'a@b.c');
    expect(codes).toHaveLength(1);
    expect(codes[0]?.shareUrl).toContain('?ref=aaaaaa');
  });

  it('returns [] when bridge cannot link the user', async () => {
    bridge.ensureLinked.mockResolvedValueOnce(null);
    const codes = await svc.listMine('u-x', 'x@x');
    expect(codes).toEqual([]);
  });
});

describe('ReferralsService.resolveCode', () => {
  it('returns owner_user_id on a valid match', async () => {
    dx.get.mockResolvedValueOnce({
      data: [{ id: 'rc-1', owner_user: 'du-owner-9', valid_until: null }],
    });
    const result = await svc.resolveCode('myref1');
    expect(result?.ownerUserId).toBe('du-owner-9');
    const call = dx.get.mock.calls[0]?.[0] as string;
    const filterPart = decodeURIComponent(call.split('filter=')[1]?.split('&')[0] ?? '');
    expect(filterPart).toBe('{"code":{"_eq":"myref1"}}');
  });

  it('normalizes whitespace + case before lookup', async () => {
    dx.get.mockResolvedValueOnce({ data: [{ id: 'rc-1', owner_user: 'du-x', valid_until: null }] });
    await svc.resolveCode('  AbCdEf  ');
    const call = dx.get.mock.calls[0]?.[0] as string;
    expect(decodeURIComponent(call)).toContain('"code":{"_eq":"abcdef"}');
  });

  it('returns null when no match', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    expect(await svc.resolveCode('nopenope')).toBeNull();
  });

  it('returns null when code is expired', async () => {
    dx.get.mockResolvedValueOnce({
      data: [{ id: 'rc-x', owner_user: 'du-x', valid_until: '2020-01-01T00:00:00.000Z' }],
    });
    expect(await svc.resolveCode('expir1')).toBeNull();
  });

  it('returns null for empty/oversize input', async () => {
    expect(await svc.resolveCode('')).toBeNull();
    expect(await svc.resolveCode('a'.repeat(30))).toBeNull();
    expect(dx.get).not.toHaveBeenCalled();
  });
});

// F-S5.3 — brought-a-friend stats.
describe('ReferralsService.getMyStats', () => {
  it('returns counts + first-badge timestamp when present', async () => {
    dx.get
      // countReferralAttendedPoints
      .mockResolvedValueOnce({ data: [{ id: 'pa-1' }], meta: { filter_count: 3 } })
      // fetchFirstBroughtAFriendBadge
      .mockResolvedValueOnce({
        data: [{ id: 'b-1', date_created: '2026-05-20T10:00:00.000Z' }],
        meta: { filter_count: 2 },
      });
    const result = await svc.getMyStats('u-1', 'a@example.com');
    expect(result.attendedReferreesCount).toBe(3);
    expect(result.broughtAFriendBadge).toEqual({
      firstAwardedAt: '2026-05-20T10:00:00.000Z',
      count: 2,
    });
  });

  it('returns zero count + null badge when no rows exist', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } })
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } });
    const result = await svc.getMyStats('u-1', 'a@example.com');
    expect(result.attendedReferreesCount).toBe(0);
    expect(result.broughtAFriendBadge).toBeNull();
  });

  it('returns empty stats when bridge cannot link the user', async () => {
    bridge.ensureLinked.mockResolvedValueOnce(null);
    const result = await svc.getMyStats('u-1', 'a@example.com');
    expect(result).toEqual({ attendedReferreesCount: 0, broughtAFriendBadge: null });
    expect(dx.get).not.toHaveBeenCalled();
  });

  it('queries the right filters (user + source/badge_type)', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } })
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } });
    await svc.getMyStats('u-1', 'a@example.com');
    const pointsCall = decodeURIComponent(dx.get.mock.calls[0]?.[0] as string);
    const badgeCall = decodeURIComponent(dx.get.mock.calls[1]?.[0] as string);
    expect(pointsCall).toContain('"source":{"_eq":"referral_attended"}');
    expect(pointsCall).toContain('"user":{"_eq":"du-user-1"}');
    expect(badgeCall).toContain('"badge_type":{"_eq":"brought_a_friend"}');
  });
});
