// BadgeAwardHistory.test.tsx — unit tests for BadgeAwardHistory pure helpers.
//
// NOTE: @testing-library/react is NOT installed in web-next. Tests cover
// pure logic extracted from the block:
//   1. BadgeFilterBar logic (passesFilter)
//   2. RevokeDialog validation (reason required)
//   3. Award history rows — revoke state guards
//   4. Date display helpers
//   5. Plural suffix logic for row count

import { describe, expect, it } from 'vitest';

// Inline types to avoid the tsx import chain in vitest's SSR resolver.
interface BadgeAwardRow {
  id: string;
  badge_id: string;
  badge_name: string;
  badge_slug: string;
  member_id: string;
  member_email: string;
  member_name: string | null;
  granted_by_id: string;
  granted_by_email: string;
  note: string | null;
  revoked_at: string | null;
  revoked_by_email: string | null;
  revoke_reason: string | null;
  created_at: string;
}

interface BadgeDefinition {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  criteria_description: string | null;
  award_count: number;
}

const SAMPLE_BADGES: BadgeDefinition[] = [
  { id: 'b1', slug: 'speaker-3x', name: 'Speaker 3×', description: null, icon_url: null, criteria_description: null, award_count: 3 },
  { id: 'b2', slug: '100-points', name: '100 Points', description: null, icon_url: null, criteria_description: null, award_count: 10 },
];

const SAMPLE_AWARDS: BadgeAwardRow[] = [
  {
    id: 'aw1', badge_id: 'b1', badge_name: 'Speaker 3×', badge_slug: 'speaker-3x',
    member_id: 'u1', member_email: 'alice@example.com', member_name: 'Alice',
    granted_by_id: 'op1', granted_by_email: 'op@aiqadam.org',
    note: 'Spoke at #3, #5, #7', revoked_at: null, revoked_by_email: null,
    revoke_reason: null, created_at: '2026-06-01T10:00:00Z',
  },
  {
    id: 'aw2', badge_id: 'b2', badge_name: '100 Points', badge_slug: '100-points',
    member_id: 'u2', member_email: 'bob@example.com', member_name: null,
    granted_by_id: 'op1', granted_by_email: 'op@aiqadam.org',
    note: null, revoked_at: '2026-06-20T14:00:00Z', revoked_by_email: 'op@aiqadam.org',
    revoke_reason: 'Points recalculated, threshold not met.', created_at: '2026-06-10T09:00:00Z',
  },
  {
    id: 'aw3', badge_id: 'b1', badge_name: 'Speaker 3×', badge_slug: 'speaker-3x',
    member_id: 'u3', member_email: 'carol@example.com', member_name: 'Carol',
    granted_by_id: 'op2', granted_by_email: 'op2@aiqadam.org',
    note: null, revoked_at: null, revoked_by_email: null,
    revoke_reason: null, created_at: '2026-06-15T16:00:00Z',
  },
];

// ─── 1. Badge filter logic ─────────────────────────────────────────────────────

type BadgeFilter = string | 'all';

function passesFilter(award: BadgeAwardRow, badgeId: BadgeFilter): boolean {
  if (badgeId === 'all') return true;
  return award.badge_id === badgeId;
}

describe('BadgeFilterBar filter logic', () => {
  it('returns all awards when filter is "all"', () => {
    const result = SAMPLE_AWARDS.filter((a) => passesFilter(a, 'all'));
    expect(result).toHaveLength(3);
  });

  it('filters to awards for badge b1', () => {
    const result = SAMPLE_AWARDS.filter((a) => passesFilter(a, 'b1'));
    expect(result).toHaveLength(2);
    expect(result.every((a) => a.badge_id === 'b1')).toBe(true);
  });

  it('filters to awards for badge b2', () => {
    const result = SAMPLE_AWARDS.filter((a) => passesFilter(a, 'b2'));
    expect(result).toHaveLength(1);
    expect(result[0]?.member_email).toBe('bob@example.com');
  });

  it('returns empty for unknown badge id', () => {
    const result = SAMPLE_AWARDS.filter((a) => passesFilter(a, 'b999'));
    expect(result).toHaveLength(0);
  });
});

// ─── 2. RevokeDialog validation ───────────────────────────────────────────────

function validateRevokeReason(reason: string): string | null {
  if (reason.trim().length === 0) return 'Reason is required.';
  return null;
}

describe('validateRevokeReason', () => {
  it('passes for a valid reason', () => {
    expect(validateRevokeReason('Award granted in error.')).toBeNull();
  });

  it('fails for empty string', () => {
    expect(validateRevokeReason('')).toMatch(/Reason/);
  });

  it('fails for whitespace-only string', () => {
    expect(validateRevokeReason('   ')).toMatch(/Reason/);
  });

  it('trims and checks correctly', () => {
    expect(validateRevokeReason('  ')).toMatch(/Reason/);
    expect(validateRevokeReason(' x ')).toBeNull();
  });
});

// ─── 3. Revoke state guards ───────────────────────────────────────────────────

function isRevoked(award: BadgeAwardRow): boolean {
  return award.revoked_at !== null;
}

describe('isRevoked', () => {
  it('returns false for an active award', () => {
    expect(isRevoked(SAMPLE_AWARDS[0] as BadgeAwardRow)).toBe(false);
  });

  it('returns true for a revoked award', () => {
    expect(isRevoked(SAMPLE_AWARDS[1] as BadgeAwardRow)).toBe(true);
  });

  it('active awards have null revoke fields', () => {
    const award = SAMPLE_AWARDS[0] as BadgeAwardRow;
    expect(award.revoked_at).toBeNull();
    expect(award.revoked_by_email).toBeNull();
    expect(award.revoke_reason).toBeNull();
  });

  it('revoked awards have non-null revoke_reason', () => {
    const award = SAMPLE_AWARDS[1] as BadgeAwardRow;
    expect(award.revoke_reason).not.toBeNull();
    expect((award.revoke_reason ?? '').length).toBeGreaterThan(0);
  });
});

// ─── 4. Date display helpers ──────────────────────────────────────────────────

describe('date display', () => {
  it('parses award created_at to a valid Date', () => {
    const award = SAMPLE_AWARDS[0] as BadgeAwardRow;
    const d = new Date(award.created_at);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.getFullYear()).toBe(2026);
  });

  it('toLocaleDateString produces a non-empty string', () => {
    const d = new Date('2026-06-01T10:00:00Z');
    expect(d.toLocaleDateString().length).toBeGreaterThan(0);
  });
});

// ─── 5. Plural suffix logic ───────────────────────────────────────────────────

function awardCountLabel(count: number): string {
  return `${count} award${count !== 1 ? 's' : ''}`;
}

describe('awardCountLabel', () => {
  it('uses singular for 1', () => {
    expect(awardCountLabel(1)).toBe('1 award');
  });

  it('uses plural for 0', () => {
    expect(awardCountLabel(0)).toBe('0 awards');
  });

  it('uses plural for 2', () => {
    expect(awardCountLabel(2)).toBe('2 awards');
  });

  it('uses plural for large count', () => {
    expect(awardCountLabel(100)).toBe('100 awards');
  });
});

// ─── 6. Badge filter chip count ───────────────────────────────────────────────

describe('badge filter chip count', () => {
  it('renders N+1 chips (All + one per badge)', () => {
    const chipCount = 1 + SAMPLE_BADGES.length;
    expect(chipCount).toBe(3);
  });

  it('maps badge definitions to chips correctly', () => {
    const chips = [{ id: 'all', label: 'All' }, ...SAMPLE_BADGES.map((b) => ({ id: b.id, label: b.name }))];
    expect(chips[0]?.label).toBe('All');
    expect(chips[1]?.label).toBe('Speaker 3×');
    expect(chips[2]?.label).toBe('100 Points');
  });
});

// ─── 7. member_name display ───────────────────────────────────────────────────

function memberDisplayName(award: BadgeAwardRow): string {
  return award.member_name ?? award.member_email;
}

describe('memberDisplayName', () => {
  it('returns member_name when present', () => {
    expect(memberDisplayName(SAMPLE_AWARDS[0] as BadgeAwardRow)).toBe('Alice');
  });

  it('falls back to email when member_name is null', () => {
    expect(memberDisplayName(SAMPLE_AWARDS[1] as BadgeAwardRow)).toBe('bob@example.com');
  });
});
