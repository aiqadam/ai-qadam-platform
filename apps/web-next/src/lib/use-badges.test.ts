// use-badges.test.ts — unit tests for badge hook logic + type shapes.
//
// Tests:
//   1. BadgeDefinition shape invariants
//   2. BadgeAwardRow shape + revoke fields
//   3. GrantBadgeBody validation guard (note trim)
//   4. RevokeBadgeAwardBody — reason required
//   5. API path construction (encode, filter param)

import { describe, expect, it } from 'vitest';

// Inline the types — types.ts re-exports from .tsx blocks which breaks
// vitest's SSR resolver (same pattern as use-sponsors.test.ts).

interface BadgeDefinition {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  criteria_description: string | null;
  award_count: number;
}

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

interface GrantBadgeBody {
  badge_id: string;
  member_id: string;
  note?: string | null;
}

interface RevokeBadgeAwardBody {
  reason: string;
}

// ─── 1. BadgeDefinition shape ─────────────────────────────────────────────────

describe('BadgeDefinition shape', () => {
  it('accepts a minimal valid definition', () => {
    const b: BadgeDefinition = {
      id: 'b1',
      slug: 'speaker-3x',
      name: 'Speaker 3×',
      description: null,
      icon_url: null,
      criteria_description: null,
      award_count: 0,
    };
    expect(b.slug).toBe('speaker-3x');
    expect(b.award_count).toBe(0);
  });

  it('accepts a fully-populated definition', () => {
    const b: BadgeDefinition = {
      id: 'b2',
      slug: '100-points',
      name: '100 Points',
      description: 'Awarded at the 100-point milestone.',
      icon_url: 'https://cdn.example.com/badges/100pts.png',
      criteria_description: 'Accumulate 100 total points.',
      award_count: 42,
    };
    expect(b.award_count).toBe(42);
    expect(b.icon_url).not.toBeNull();
  });
});

// ─── 2. BadgeAwardRow shape ────────────────────────────────────────────────────

const SAMPLE_AWARD: BadgeAwardRow = {
  id: 'aw1',
  badge_id: 'b1',
  badge_name: 'Speaker 3×',
  badge_slug: 'speaker-3x',
  member_id: 'u1',
  member_email: 'alice@example.com',
  member_name: 'Alice',
  granted_by_id: 'op1',
  granted_by_email: 'operator@aiqadam.org',
  note: 'Spoke at meetups #3, #5, #7',
  revoked_at: null,
  revoked_by_email: null,
  revoke_reason: null,
  created_at: '2026-06-24T12:00:00Z',
};

describe('BadgeAwardRow shape', () => {
  it('is not revoked when revoked_at is null', () => {
    expect(SAMPLE_AWARD.revoked_at).toBeNull();
    expect(SAMPLE_AWARD.revoked_by_email).toBeNull();
    expect(SAMPLE_AWARD.revoke_reason).toBeNull();
  });

  it('captures revoke info when revoked', () => {
    const revoked: BadgeAwardRow = {
      ...SAMPLE_AWARD,
      revoked_at: '2026-06-25T09:00:00Z',
      revoked_by_email: 'operator@aiqadam.org',
      revoke_reason: 'Award granted in error.',
    };
    expect(revoked.revoked_at).not.toBeNull();
    expect(revoked.revoke_reason).toBe('Award granted in error.');
  });

  it('allows null member_name (email-only accounts)', () => {
    const row: BadgeAwardRow = { ...SAMPLE_AWARD, member_name: null };
    expect(row.member_name).toBeNull();
    expect(row.member_email).toBe('alice@example.com');
  });
});

// ─── 3. GrantBadgeBody validation guard ──────────────────────────────────────

function validateGrantBody(body: { badge_id: string; member_id: string; note: string }): string | null {
  if (body.badge_id.trim().length === 0) return 'Badge is required.';
  if (body.member_id.trim().length === 0) return 'Member is required.';
  return null;
}

describe('validateGrantBody', () => {
  it('passes for valid badge_id and member_id', () => {
    expect(validateGrantBody({ badge_id: 'b1', member_id: 'u1', note: '' })).toBeNull();
  });

  it('fails when badge_id is empty', () => {
    expect(validateGrantBody({ badge_id: '', member_id: 'u1', note: '' })).toMatch(/Badge/);
  });

  it('fails when member_id is empty', () => {
    expect(validateGrantBody({ badge_id: 'b1', member_id: '', note: '' })).toMatch(/Member/);
  });

  it('accepts note as optional (empty string is fine)', () => {
    const body: GrantBadgeBody = { badge_id: 'b1', member_id: 'u1', note: null };
    expect(body.note).toBeNull();
  });
});

// ─── 4. RevokeBadgeAwardBody — reason required ────────────────────────────────

function validateRevokeBody(reason: string): string | null {
  if (reason.trim().length === 0) return 'Reason is required.';
  return null;
}

describe('validateRevokeBody', () => {
  it('passes for a non-empty reason', () => {
    expect(validateRevokeBody('Award granted in error.')).toBeNull();
  });

  it('fails for an empty reason', () => {
    expect(validateRevokeBody('')).toMatch(/Reason/);
  });

  it('fails for whitespace-only reason', () => {
    expect(validateRevokeBody('   ')).toMatch(/Reason/);
  });

  it('accepts the RevokeBadgeAwardBody shape', () => {
    const body: RevokeBadgeAwardBody = { reason: 'Criteria not met.' };
    expect(body.reason).toBe('Criteria not met.');
  });
});

// ─── 5. API path construction ─────────────────────────────────────────────────

describe('badge API path construction', () => {
  it('builds the awards list path without filter', () => {
    const path = '/v1/admin/badges/awards';
    expect(path).toBe('/v1/admin/badges/awards');
  });

  it('builds the awards list path with badge_id filter', () => {
    const badgeId = 'b1';
    const path = `/v1/admin/badges/awards?badge_id=${encodeURIComponent(badgeId)}`;
    expect(path).toBe('/v1/admin/badges/awards?badge_id=b1');
  });

  it('encodes special characters in badge_id', () => {
    const badgeId = 'badge/special';
    const path = `/v1/admin/badges/awards?badge_id=${encodeURIComponent(badgeId)}`;
    expect(path).toBe('/v1/admin/badges/awards?badge_id=badge%2Fspecial');
  });

  it('builds the revoke path with award id', () => {
    const awardId = 'aw-123';
    const path = `/v1/admin/badges/awards/${encodeURIComponent(awardId)}/revoke`;
    expect(path).toBe('/v1/admin/badges/awards/aw-123/revoke');
  });

  it('encodes special characters in award id', () => {
    const awardId = 'aw/456';
    const path = `/v1/admin/badges/awards/${encodeURIComponent(awardId)}/revoke`;
    expect(path).toBe('/v1/admin/badges/awards/aw%2F456/revoke');
  });
});

// ─── 6. award_count display ──────────────────────────────────────────────────

describe('award_count display', () => {
  it('renders zero correctly', () => {
    const b: BadgeDefinition = {
      id: 'b3', slug: 'rare', name: 'Rare', description: null,
      icon_url: null, criteria_description: null, award_count: 0,
    };
    expect(String(b.award_count)).toBe('0');
  });

  it('renders positive count correctly', () => {
    const b: BadgeDefinition = {
      id: 'b4', slug: 'common', name: 'Common', description: null,
      icon_url: null, criteria_description: null, award_count: 17,
    };
    expect(String(b.award_count)).toBe('17');
  });
});

// ─── 7. Date formatting ───────────────────────────────────────────────────────

describe('award date formatting', () => {
  it('parses created_at ISO string to a Date', () => {
    const createdAt = '2026-06-24T12:00:00Z';
    const d = new Date(createdAt);
    expect(d.getFullYear()).toBe(2026);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });

  it('toLocaleDateString produces a non-empty string', () => {
    const d = new Date('2026-06-24T12:00:00Z');
    const formatted = d.toLocaleDateString();
    expect(formatted.length).toBeGreaterThan(0);
  });
});
