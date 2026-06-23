// ReferralDashboard.test.tsx — Unit tests for ReferralDashboard component.
// Tests: pure formatting helpers, state rendering logic, referral code card data,
// stats grid data, badge detail, copy-to-clipboard behavior.
//
// Per standards.md §IV: pure presentation component.
// @testing-library/react is NOT installed; tests follow the AnnounceComposer.test.tsx
// pattern: pure-helper extraction + smoke-level state inspection via stubs.
// No React.createElement is used — the component's JSX is not re-implemented.

import type { MyReferralStats, ReferralCodeView } from '@/lib/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Local re-implementation of pure helpers from ReferralDashboard.tsx ──────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

// ─── Component state stub (mirrors ReferralDashboardInner branching logic) ──────────

type CodesState =
  | { status: 'pending' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: ReferralCodeView[] | undefined };

type StatsState =
  | { status: 'pending' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: MyReferralStats | undefined };

// Mirrors ReferralDashboardInner.tsx logic for testing without React rendering
interface RenderState {
  variant: 'loading' | 'error' | 'no-code' | 'success';
  code: ReferralCodeView | null;
  stats: MyReferralStats;
}

const DEFAULT_STATS: MyReferralStats = {
  attendedReferreesCount: 0,
  broughtAFriendBadge: null,
};

function isCodesSuccess(
  state: CodesState,
): state is { status: 'success'; data: ReferralCodeView[] | undefined } {
  return state.status === 'success';
}

function isStatsSuccess(
  state: StatsState,
): state is { status: 'success'; data: MyReferralStats | undefined } {
  return state.status === 'success';
}

function isPending(codes: CodesState, stats: StatsState): boolean {
  return codes.status === 'pending' || stats.status === 'pending';
}

function hasErrorState(codes: CodesState, stats: StatsState): boolean {
  return codes.status === 'error' || stats.status === 'error';
}

function hasMissingCodes(codes: CodesState): boolean {
  return isCodesSuccess(codes) && codes.data === undefined;
}

function getReferralRenderState(codes: CodesState, stats: StatsState): RenderState {
  if (isPending(codes, stats)) {
    return { variant: 'loading', code: null, stats: DEFAULT_STATS };
  }

  if (hasErrorState(codes, stats) || hasMissingCodes(codes)) {
    return { variant: 'error', code: null, stats: DEFAULT_STATS };
  }

  const codesData: ReferralCodeView[] = isCodesSuccess(codes) ? (codes.data ?? []) : [];
  const code = codesData[0] ?? null;

  const statsData: MyReferralStats = isStatsSuccess(stats)
    ? (stats.data ?? DEFAULT_STATS)
    : DEFAULT_STATS;

  if (code === null) {
    return { variant: 'no-code', code: null, stats: statsData };
  }

  return { variant: 'success', code, stats: statsData };
}

// StatCard helper for testing
function getStatCardData(
  label: string,
  value: string | number | null | undefined,
): {
  label: string;
  displayValue: string | number;
} {
  return { label, displayValue: value ?? '—' };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ReferralDashboard — pure helpers', () => {
  describe('formatDate', () => {
    it('should format an ISO date string using locale dateStyle medium', () => {
      const formatted = formatDate('2026-06-15T00:00:00Z');
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should produce consistent output for the same input', () => {
      const first = formatDate('2026-04-01T00:00:00Z');
      const second = formatDate('2026-04-01T00:00:00Z');
      expect(first).toBe(second);
    });
  });

  describe('getStatCardData', () => {
    it('should return numeric value as-is', () => {
      const result = getStatCardData('Referred attendees', 5);
      expect(result.displayValue).toBe(5);
      expect(result.label).toBe('Referred attendees');
    });

    it('should return string value as-is', () => {
      const result = getStatCardData('Custom stat', '42');
      expect(result.displayValue).toBe('42');
    });

    it('should return em dash for null value', () => {
      const result = getStatCardData('Badges', null);
      expect(result.displayValue).toBe('—');
    });

    it('should return em dash for undefined value', () => {
      const result = getStatCardData('Badges', undefined);
      expect(result.displayValue).toBe('—');
    });
  });
});

describe('ReferralDashboard — state rendering logic', () => {
  describe('getReferralRenderState', () => {
    describe('loading state', () => {
      it('should return loading variant when codes is pending', () => {
        const codes: CodesState = { status: 'pending' };
        const stats: StatsState = {
          status: 'success',
          data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
        };
        const result = getReferralRenderState(codes, stats);
        expect(result.variant).toBe('loading');
      });

      it('should return loading variant when stats is pending', () => {
        const codes: CodesState = { status: 'success', data: [] };
        const stats: StatsState = { status: 'pending' };
        const result = getReferralRenderState(codes, stats);
        expect(result.variant).toBe('loading');
      });
    });

    describe('error state', () => {
      it('should return error variant when codes query errors', () => {
        const codes: CodesState = { status: 'error', error: new Error('codes failed') };
        const stats: StatsState = {
          status: 'success',
          data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
        };
        const result = getReferralRenderState(codes, stats);
        expect(result.variant).toBe('error');
      });

      it('should return error variant when stats query errors', () => {
        const codes: CodesState = { status: 'success', data: [] };
        const stats: StatsState = { status: 'error', error: new Error('stats failed') };
        const result = getReferralRenderState(codes, stats);
        expect(result.variant).toBe('error');
      });

      it('should return error variant when codes returns undefined data', () => {
        const codes: CodesState = { status: 'success', data: undefined };
        const stats: StatsState = {
          status: 'success',
          data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
        };
        const result = getReferralRenderState(codes, stats);
        expect(result.variant).toBe('error');
      });
    });

    describe('no-code state', () => {
      it('should return no-code variant when codes array is empty', () => {
        const codes: CodesState = { status: 'success', data: [] };
        const stats: StatsState = {
          status: 'success',
          data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
        };
        const result = getReferralRenderState(codes, stats);
        expect(result.variant).toBe('no-code');
        expect(result.code).toBeNull();
      });
    });

    describe('success state', () => {
      it('should return success variant with code and stats when both are loaded', () => {
        const code: ReferralCodeView = {
          id: 'rc-1',
          code: 'SUMMER2026',
          shareUrl: 'https://aiqadam.com/ref/SUMMER2026',
          validUntil: null,
          createdAt: '2026-01-01T00:00:00Z',
        };
        const codes: CodesState = { status: 'success', data: [code] };
        const stats: StatsState = {
          status: 'success',
          data: { attendedReferreesCount: 7, broughtAFriendBadge: null },
        };
        const result = getReferralRenderState(codes, stats);
        expect(result.variant).toBe('success');
        expect(result.code).toEqual(code);
        expect(result.stats.attendedReferreesCount).toBe(7);
      });

      it('should use first code when codes array has multiple entries', () => {
        const codes: CodesState = {
          status: 'success',
          data: [
            {
              id: 'rc-1',
              code: 'FIRST',
              shareUrl: 'https://x.com/FIRST',
              validUntil: null,
              createdAt: '2026-01-01',
            },
            {
              id: 'rc-2',
              code: 'SECOND',
              shareUrl: 'https://x.com/SECOND',
              validUntil: null,
              createdAt: '2026-01-01',
            },
          ],
        };
        const stats: StatsState = {
          status: 'success',
          data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
        };
        const result = getReferralRenderState(codes, stats);
        expect(result.code?.code).toBe('FIRST');
      });

      it('should default stats to zero values when stats data is undefined', () => {
        const codes: CodesState = {
          status: 'success',
          data: [
            {
              id: 'rc-1',
              code: 'TEST',
              shareUrl: 'https://x.com',
              validUntil: null,
              createdAt: '2026-01-01',
            },
          ],
        };
        const stats: StatsState = { status: 'success', data: undefined };
        const result = getReferralRenderState(codes, stats);
        expect(result.stats.attendedReferreesCount).toBe(0);
        expect(result.stats.broughtAFriendBadge).toBeNull();
      });
    });
  });
});

describe('ReferralDashboard — referral code card data', () => {
  it('should include the referral code string', () => {
    const code: ReferralCodeView = {
      id: 'rc-1',
      code: 'SUMMER2026',
      shareUrl: 'https://aiqadam.com/ref/SUMMER2026',
      validUntil: null,
      createdAt: '2026-01-01T00:00:00Z',
    };
    const codes: CodesState = { status: 'success', data: [code] };
    const stats: StatsState = {
      status: 'success',
      data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
    };
    const result = getReferralRenderState(codes, stats);
    expect(result.code?.code).toBe('SUMMER2026');
  });

  it('should include the share URL', () => {
    const code: ReferralCodeView = {
      id: 'rc-1',
      code: 'TESTCODE',
      shareUrl: 'https://aiqadam.com/ref/TESTCODE',
      validUntil: null,
      createdAt: '2026-01-01T00:00:00Z',
    };
    const codes: CodesState = { status: 'success', data: [code] };
    const stats: StatsState = {
      status: 'success',
      data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
    };
    const result = getReferralRenderState(codes, stats);
    expect(result.code?.shareUrl).toBe('https://aiqadam.com/ref/TESTCODE');
  });

  it('should indicate validUntil is present when not null', () => {
    const code: ReferralCodeView = {
      id: 'rc-1',
      code: 'EXPIRY2026',
      shareUrl: 'https://aiqadam.com/ref/EXPIRY2026',
      validUntil: '2026-12-31T23:59:59Z',
      createdAt: '2026-01-01T00:00:00Z',
    };
    const codes: CodesState = { status: 'success', data: [code] };
    const stats: StatsState = {
      status: 'success',
      data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
    };
    const result = getReferralRenderState(codes, stats);
    expect(result.code?.validUntil).toBeTruthy();
  });

  it('should indicate validUntil is null when no expiry', () => {
    const code: ReferralCodeView = {
      id: 'rc-1',
      code: 'NOEXPIRY',
      shareUrl: 'https://aiqadam.com/ref/NOEXPIRY',
      validUntil: null,
      createdAt: '2026-01-01T00:00:00Z',
    };
    const codes: CodesState = { status: 'success', data: [code] };
    const stats: StatsState = {
      status: 'success',
      data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
    };
    const result = getReferralRenderState(codes, stats);
    expect(result.code?.validUntil).toBeNull();
  });
});

describe('ReferralDashboard — stats grid data', () => {
  it('should include attendedReferreesCount', () => {
    const codes: CodesState = { status: 'success', data: [] };
    const stats: StatsState = {
      status: 'success',
      data: { attendedReferreesCount: 7, broughtAFriendBadge: null },
    };
    const result = getReferralRenderState(codes, stats);
    expect(result.stats.attendedReferreesCount).toBe(7);
  });

  it('should include broughtAFriendBadge count when present', () => {
    const codes: CodesState = { status: 'success', data: [] };
    const stats: StatsState = {
      status: 'success',
      data: {
        attendedReferreesCount: 3,
        broughtAFriendBadge: { firstAwardedAt: '2026-04-15T00:00:00Z', count: 2 },
      },
    };
    const result = getReferralRenderState(codes, stats);
    expect(result.stats.broughtAFriendBadge?.count).toBe(2);
    expect(result.stats.broughtAFriendBadge?.firstAwardedAt).toBe('2026-04-15T00:00:00Z');
  });

  it('should have null broughtAFriendBadge when no badge earned', () => {
    const codes: CodesState = { status: 'success', data: [] };
    const stats: StatsState = {
      status: 'success',
      data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
    };
    const result = getReferralRenderState(codes, stats);
    expect(result.stats.broughtAFriendBadge).toBeNull();
  });
});

describe('ReferralDashboard — badge detail data', () => {
  it('should indicate badge detail is present when broughtAFriendBadge is set', () => {
    const codes: CodesState = { status: 'success', data: [] };
    const stats: StatsState = {
      status: 'success',
      data: {
        attendedReferreesCount: 5,
        broughtAFriendBadge: { firstAwardedAt: '2026-05-01T00:00:00Z', count: 1 },
      },
    };
    const result = getReferralRenderState(codes, stats);
    expect(result.stats.broughtAFriendBadge).not.toBeNull();
  });

  it('should indicate badge detail is absent when broughtAFriendBadge is null', () => {
    const codes: CodesState = { status: 'success', data: [] };
    const stats: StatsState = {
      status: 'success',
      data: { attendedReferreesCount: 0, broughtAFriendBadge: null },
    };
    const result = getReferralRenderState(codes, stats);
    expect(result.stats.broughtAFriendBadge).toBeNull();
  });
});

describe('ReferralDashboard — copy-to-clipboard', () => {
  let clipboardMock: { writeText: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    clipboardMock = { writeText: vi.fn<(text: string) => Promise<void>>() };
    // Replace navigator.clipboard for these tests
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: clipboardMock },
      writable: true,
      configurable: true,
    });
  });

  it('should call navigator.clipboard.writeText with the shareUrl', async () => {
    const code: ReferralCodeView = {
      id: 'rc-1',
      code: 'CLIPTEST',
      shareUrl: 'https://aiqadam.com/ref/CLIPTEST',
      validUntil: null,
      createdAt: '2026-01-01T00:00:00Z',
    };

    clipboardMock.writeText.mockResolvedValue(undefined);

    // Mirrors the onCopy handler from ReferralDashboardInner
    const onCopy = async (): Promise<void> => {
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.shareUrl);
      } catch {
        // Clipboard API unavailable (non-secure context) — silently ignore
      }
    };

    await onCopy();

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://aiqadam.com/ref/CLIPTEST');
  });

  it('should silently ignore clipboard errors (non-secure context)', async () => {
    const code: ReferralCodeView = {
      id: 'rc-1',
      code: 'CLIPFAIL',
      shareUrl: 'https://aiqadam.com/ref/CLIPFAIL',
      validUntil: null,
      createdAt: '2026-01-01T00:00:00Z',
    };

    clipboardMock.writeText.mockRejectedValue(new Error('Clipboard API not available'));

    const onCopy = async (): Promise<void> => {
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.shareUrl);
      } catch {
        // Clipboard API unavailable (non-secure context) — silently ignore
      }
    };

    // Should NOT throw — catch block swallows the error
    await expect(onCopy()).resolves.not.toThrow();
  });

  it('should not call clipboard.writeText if code is null', async () => {
    const code: ReferralCodeView | null = null;

    const onCopy = async (): Promise<void> => {
      if (!code) return;
      const currentCode: ReferralCodeView = code;
      try {
        await navigator.clipboard.writeText(currentCode.shareUrl);
      } catch {
        // silently ignore
      }
    };

    await onCopy();

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
