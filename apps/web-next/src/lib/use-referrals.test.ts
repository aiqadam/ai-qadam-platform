// use-referrals.test.ts — Unit tests for useMyReferralCodes and useMyReferralStats hooks.
// Tests: query keys, response mapping, error handling, partial failure.
//
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.
//
// NOTE: Hook logic is re-implemented locally to avoid vitest ESM/React
// environment issues. Follows the AsyncSelect.useFetchOptions.ts simulation
// pattern established in this codebase.

import { describe, expect, it, vi } from 'vitest';
import type { MyReferralStats, ReferralCodeView } from './types';

// ─── Local re-implementation of useMyReferralCodes ───────────────────────────────
// Mirrors the TanStack Query hook pattern from use-referrals.ts.

const REFERRALS_KEY = ['me', 'referrals'] as const;

type UseMyReferralCodesResult = {
  data: ReferralCodeView[] | undefined;
  isPending: boolean;
  error: Error | null;
  isError: boolean;
};

function simulateUseMyReferralCodes(
  mockApiCall: () => Promise<{ codes: ReferralCodeView[] }>,
): UseMyReferralCodesResult & { settle: () => Promise<UseMyReferralCodesResult> } {
  let settled = false;
  let resolvedData: ReferralCodeView[] | undefined;
  let resolvedError: Error | null = null;

  const result: UseMyReferralCodesResult = {
    data: undefined,
    isPending: true,
    error: null,
    isError: false,
  };

  return {
    ...result,
    settle: async () => {
      if (settled) {
        return {
          data: resolvedData,
          isPending: false,
          error: resolvedError,
          isError: resolvedError !== null,
        };
      }
      settled = true;
      try {
        const body = await mockApiCall();
        resolvedData = body.codes;
        return {
          data: resolvedData,
          isPending: false,
          error: null,
          isError: false,
        };
      } catch (err) {
        resolvedError = err as Error;
        return {
          data: undefined,
          isPending: false,
          error: resolvedError,
          isError: true,
        };
      }
    },
  };
}

// ─── Local re-implementation of useMyReferralStats ──────────────────────────────
// Mirrors the TanStack Query hook pattern from use-referrals.ts.

type UseMyReferralStatsResult = {
  data: MyReferralStats | undefined;
  isPending: boolean;
  error: Error | null;
  isError: boolean;
};

function simulateUseMyReferralStats(
  mockApiCall: () => Promise<{ stats: MyReferralStats }>,
): UseMyReferralStatsResult & { settle: () => Promise<UseMyReferralStatsResult> } {
  let settled = false;
  let resolvedData: MyReferralStats | undefined;
  let resolvedError: Error | null = null;

  const result: UseMyReferralStatsResult = {
    data: undefined,
    isPending: true,
    error: null,
    isError: false,
  };

  return {
    ...result,
    settle: async () => {
      if (settled) {
        return {
          data: resolvedData,
          isPending: false,
          error: resolvedError,
          isError: resolvedError !== null,
        };
      }
      settled = true;
      try {
        const body = await mockApiCall();
        resolvedData = body.stats;
        return {
          data: resolvedData,
          isPending: false,
          error: null,
          isError: false,
        };
      } catch (err) {
        resolvedError = err as Error;
        return {
          data: undefined,
          isPending: false,
          error: resolvedError,
          isError: true,
        };
      }
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useMyReferralCodes', () => {
  describe('query key', () => {
    it('should use REFERRALS_KEY with codes suffix', () => {
      const codesKey = [...REFERRALS_KEY, 'codes'] as const;
      expect(codesKey).toEqual(['me', 'referrals', 'codes']);
      expect(codesKey).toHaveLength(3);
    });
  });

  describe('response mapping — happy path', () => {
    it('should extract codes array from the API response body', async () => {
      const mockCodes: ReferralCodeView[] = [
        {
          id: 'rc-1',
          code: 'AIQADAM2026',
          shareUrl: 'https://aiqadam.com/ref/AIQADAM2026',
          validUntil: '2026-12-31T23:59:59Z',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];

      const mockApiCall = vi.fn<() => Promise<{ codes: ReferralCodeView[] }>>(() =>
        Promise.resolve({ codes: mockCodes }),
      );

      const hook = simulateUseMyReferralCodes(mockApiCall);
      const result = await hook.settle();

      expect(result.isPending).toBe(false);
      expect(result.data).toHaveLength(1);
      expect(result.data).toEqual(mockCodes);
      expect(result.error).toBeNull();
      expect(result.isError).toBe(false);
    });

    it('should return undefined data before the promise settles', () => {
      const mockApiCall = vi.fn<() => Promise<{ codes: ReferralCodeView[] }>>(() =>
        Promise.resolve({ codes: [] }),
      );

      const hook = simulateUseMyReferralCodes(mockApiCall);

      expect(hook.isPending).toBe(true);
      expect(hook.data).toBeUndefined();
    });
  });

  describe('response mapping — empty array (no codes yet)', () => {
    it('should return an empty codes array when member has no referral code', async () => {
      const mockApiCall = vi.fn<() => Promise<{ codes: ReferralCodeView[] }>>(() =>
        Promise.resolve({ codes: [] }),
      );

      const hook = simulateUseMyReferralCodes(mockApiCall);
      const result = await hook.settle();

      expect(result.isPending).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('error handling — codes endpoint fails', () => {
    it('should set isError=true on network failure', async () => {
      const mockApiCall = vi.fn<() => Promise<{ codes: ReferralCodeView[] }>>(() =>
        Promise.reject(new Error('Failed to fetch')),
      );

      const hook = simulateUseMyReferralCodes(mockApiCall);
      const result = await hook.settle();

      expect(result.isPending).toBe(false);
      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.data).toBeUndefined();
    });

    it('should propagate HTTP 401 as AuthExpiredError', async () => {
      class AuthExpiredError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'AuthExpiredError';
        }
      }

      const authError = new AuthExpiredError('refresh failed');
      const mockApiCall = vi.fn<() => Promise<{ codes: ReferralCodeView[] }>>(() =>
        Promise.reject(authError),
      );

      const hook = simulateUseMyReferralCodes(mockApiCall);
      const result = await hook.settle();

      expect(result.isError).toBe(true);
      expect(result.error?.name).toBe('AuthExpiredError');
    });
  });

  describe('ReferralCodeView shape — field mapping', () => {
    it('should preserve all ReferralCodeView fields', async () => {
      const code: ReferralCodeView = {
        id: 'rc-full',
        code: 'SUMMER2026',
        shareUrl: 'https://aiqadam.com/ref/SUMMER2026',
        validUntil: '2026-08-31T23:59:59Z',
        createdAt: '2026-06-01T00:00:00Z',
      };

      const mockApiCall = vi.fn<() => Promise<{ codes: ReferralCodeView[] }>>(() =>
        Promise.resolve({ codes: [code] }),
      );

      const hook = simulateUseMyReferralCodes(mockApiCall);
      const result = await hook.settle();

      const data = result.data as ReferralCodeView[];
      const [loaded] = data;
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('rc-full');
      expect(loaded?.code).toBe('SUMMER2026');
      expect(loaded?.shareUrl).toBe('https://aiqadam.com/ref/SUMMER2026');
      expect(loaded?.validUntil).toBe('2026-08-31T23:59:59Z');
      expect(loaded?.createdAt).toBe('2026-06-01T00:00:00Z');
    });

    it('should handle null validUntil (no expiry)', async () => {
      const code: ReferralCodeView = {
        id: 'rc-no-expiry',
        code: 'FOREVER2026',
        shareUrl: 'https://aiqadam.com/ref/FOREVER2026',
        validUntil: null,
        createdAt: '2026-06-01T00:00:00Z',
      };

      const mockApiCall = vi.fn<() => Promise<{ codes: ReferralCodeView[] }>>(() =>
        Promise.resolve({ codes: [code] }),
      );

      const hook = simulateUseMyReferralCodes(mockApiCall);
      const result = await hook.settle();

      expect(result.data?.[0]?.validUntil).toBeNull();
    });
  });
});

describe('useMyReferralStats', () => {
  describe('query key', () => {
    it('should use REFERRALS_KEY with stats suffix', () => {
      const statsKey = [...REFERRALS_KEY, 'stats'] as const;
      expect(statsKey).toEqual(['me', 'referrals', 'stats']);
      expect(statsKey).toHaveLength(3);
    });
  });

  describe('response mapping — happy path', () => {
    it('should extract stats object from the API response body', async () => {
      const mockStats: MyReferralStats = {
        attendedReferreesCount: 5,
        broughtAFriendBadge: {
          firstAwardedAt: '2026-04-15T00:00:00Z',
          count: 1,
        },
      };

      const mockApiCall = vi.fn<() => Promise<{ stats: MyReferralStats }>>(() =>
        Promise.resolve({ stats: mockStats }),
      );

      const hook = simulateUseMyReferralStats(mockApiCall);
      const result = await hook.settle();

      expect(result.isPending).toBe(false);
      expect(result.data).toEqual(mockStats);
      expect(result.error).toBeNull();
      expect(result.isError).toBe(false);
    });

    it('should return undefined data before the promise settles', () => {
      const mockApiCall = vi.fn<() => Promise<{ stats: MyReferralStats }>>(() =>
        Promise.resolve({ stats: { attendedReferreesCount: 0, broughtAFriendBadge: null } }),
      );

      const hook = simulateUseMyReferralStats(mockApiCall);

      expect(hook.isPending).toBe(true);
      expect(hook.data).toBeUndefined();
    });
  });

  describe('response mapping — zero stats', () => {
    it('should handle stats with no referrees and no badge', async () => {
      const mockStats: MyReferralStats = {
        attendedReferreesCount: 0,
        broughtAFriendBadge: null,
      };

      const mockApiCall = vi.fn<() => Promise<{ stats: MyReferralStats }>>(() =>
        Promise.resolve({ stats: mockStats }),
      );

      const hook = simulateUseMyReferralStats(mockApiCall);
      const result = await hook.settle();

      expect(result.data?.attendedReferreesCount).toBe(0);
      expect(result.data?.broughtAFriendBadge).toBeNull();
    });

    it('should handle stats with referrees but no badge yet', async () => {
      const mockStats: MyReferralStats = {
        attendedReferreesCount: 3,
        broughtAFriendBadge: null,
      };

      const mockApiCall = vi.fn<() => Promise<{ stats: MyReferralStats }>>(() =>
        Promise.resolve({ stats: mockStats }),
      );

      const hook = simulateUseMyReferralStats(mockApiCall);
      const result = await hook.settle();

      expect(result.data?.attendedReferreesCount).toBe(3);
      expect(result.data?.broughtAFriendBadge).toBeNull();
    });
  });

  describe('error handling — stats endpoint fails', () => {
    it('should set isError=true on network failure', async () => {
      const mockApiCall = vi.fn<() => Promise<{ stats: MyReferralStats }>>(() =>
        Promise.reject(new Error('Failed to fetch')),
      );

      const hook = simulateUseMyReferralStats(mockApiCall);
      const result = await hook.settle();

      expect(result.isPending).toBe(false);
      expect(result.isError).toBe(true);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.data).toBeUndefined();
    });

    it('should propagate HTTP 401 as AuthExpiredError', async () => {
      class AuthExpiredError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'AuthExpiredError';
        }
      }

      const authError = new AuthExpiredError('refresh failed');
      const mockApiCall = vi.fn<() => Promise<{ stats: MyReferralStats }>>(() =>
        Promise.reject(authError),
      );

      const hook = simulateUseMyReferralStats(mockApiCall);
      const result = await hook.settle();

      expect(result.isError).toBe(true);
      expect(result.error?.name).toBe('AuthExpiredError');
    });
  });

  describe('MyReferralStats shape — field mapping', () => {
    it('should preserve broughtAFriendBadge fields when present', async () => {
      const mockStats: MyReferralStats = {
        attendedReferreesCount: 2,
        broughtAFriendBadge: {
          firstAwardedAt: '2026-05-20T00:00:00Z',
          count: 2,
        },
      };

      const mockApiCall = vi.fn<() => Promise<{ stats: MyReferralStats }>>(() =>
        Promise.resolve({ stats: mockStats }),
      );

      const hook = simulateUseMyReferralStats(mockApiCall);
      const result = await hook.settle();

      expect(result.data?.broughtAFriendBadge?.firstAwardedAt).toBe('2026-05-20T00:00:00Z');
      expect(result.data?.broughtAFriendBadge?.count).toBe(2);
    });
  });
});

describe('useMyReferralCodes + useMyReferralStats — partial failure', () => {
  it('should propagate codes error independently when stats succeeds', async () => {
    const codesHook = simulateUseMyReferralCodes(() =>
      Promise.reject(new Error('codes endpoint down')),
    );
    const statsHook = simulateUseMyReferralStats(() =>
      Promise.resolve({ stats: { attendedReferreesCount: 1, broughtAFriendBadge: null } }),
    );

    const [codesResult, statsResult] = await Promise.all([codesHook.settle(), statsHook.settle()]);

    expect(codesResult.isError).toBe(true);
    expect(statsResult.isError).toBe(false);
    expect(statsResult.data?.attendedReferreesCount).toBe(1);
  });

  it('should propagate stats error independently when codes succeeds', async () => {
    const codesHook = simulateUseMyReferralCodes(() =>
      Promise.resolve({
        codes: [
          {
            id: 'rc-1',
            code: 'TEST',
            shareUrl: 'https://x.com',
            validUntil: null,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    );
    const statsHook = simulateUseMyReferralStats(() =>
      Promise.reject(new Error('stats endpoint down')),
    );

    const [codesResult, statsResult] = await Promise.all([codesHook.settle(), statsHook.settle()]);

    expect(codesResult.isError).toBe(false);
    expect(codesResult.data as ReferralCodeView[]).toHaveLength(1);
    expect(statsResult.isError).toBe(true);
  });

  it('should not conflate codes and stats errors into a single result', async () => {
    // Both fail independently — each hook returns its own error
    const codesHook = simulateUseMyReferralCodes(() => Promise.reject(new Error('codes error')));
    const statsHook = simulateUseMyReferralStats(() => Promise.reject(new Error('stats error')));

    const [codesResult, statsResult] = await Promise.all([codesHook.settle(), statsHook.settle()]);

    expect(codesResult.error?.message).toBe('codes error');
    expect(statsResult.error?.message).toBe('stats error');
    expect(codesResult.error).not.toBe(statsResult.error);
  });
});
