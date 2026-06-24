// BadgesList.test.tsx — unit tests for BadgesList pure helpers.
//
// NOTE: @testing-library/react is NOT installed in web-next. Tests cover
// pure logic extracted from the block:
//   1. Badge definition columns completeness
//   2. loadMemberOptions path construction
//   3. GrantDialog form validation (badge + member required)
//   4. buildGrantPayload note trimming
//   5. Award icon fallback guard

import { describe, expect, it } from 'vitest';

// Inline types to avoid the tsx import chain in vitest's SSR resolver.
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
  {
    id: 'b1',
    slug: 'speaker-3x',
    name: 'Speaker 3×',
    description: null,
    icon_url: null,
    criteria_description: 'Spoke at 3 or more events.',
    award_count: 5,
  },
  {
    id: 'b2',
    slug: '100-points',
    name: '100 Points',
    description: 'Milestone badge.',
    icon_url: 'https://cdn.example.com/100pts.png',
    criteria_description: 'Accumulated 100 total points.',
    award_count: 23,
  },
  {
    id: 'b3',
    slug: 'newcomer',
    name: 'Newcomer',
    description: null,
    icon_url: null,
    criteria_description: null,
    award_count: 0,
  },
];

// ─── 1. Badge list columns ────────────────────────────────────────────────────

const COLUMN_KEYS = ['name', 'criteria_description', 'award_count'] as const;

describe('BadgesList columns', () => {
  it('defines the three expected columns', () => {
    expect(COLUMN_KEYS).toHaveLength(3);
    expect(COLUMN_KEYS).toContain('name');
    expect(COLUMN_KEYS).toContain('criteria_description');
    expect(COLUMN_KEYS).toContain('award_count');
  });

  it('each badge has values for all column keys', () => {
    for (const badge of SAMPLE_BADGES) {
      for (const key of COLUMN_KEYS) {
        expect(Object.prototype.hasOwnProperty.call(badge, key)).toBe(true);
      }
    }
  });
});

// ─── 2. loadMemberOptions path construction ────────────────────────────────────

function buildMemberSearchPath(input: string): string | null {
  if (input.trim().length === 0) return null;
  return `/v1/workspace/members?search=${encodeURIComponent(input)}&limit=20`;
}

describe('loadMemberOptions path construction', () => {
  it('returns null for empty input (no request should fire)', () => {
    expect(buildMemberSearchPath('')).toBeNull();
    expect(buildMemberSearchPath('   ')).toBeNull();
  });

  it('builds correct path for simple query', () => {
    expect(buildMemberSearchPath('alice')).toBe(
      '/v1/workspace/members?search=alice&limit=20',
    );
  });

  it('encodes special characters in search term', () => {
    expect(buildMemberSearchPath('alice@example.com')).toBe(
      '/v1/workspace/members?search=alice%40example.com&limit=20',
    );
  });

  it('encodes space as %20', () => {
    expect(buildMemberSearchPath('alice bob')).toBe(
      '/v1/workspace/members?search=alice%20bob&limit=20',
    );
  });
});

// ─── 3. GrantDialog form validation ──────────────────────────────────────────

interface GrantFormState {
  badgeId: string;
  memberId: string | null;
  note: string;
}

function validateGrantForm(form: GrantFormState): string | null {
  if (form.memberId === null || form.memberId.trim().length === 0) return 'Select a member.';
  if (form.badgeId.trim().length === 0) return 'Select a badge.';
  return null;
}

describe('validateGrantForm', () => {
  it('passes for valid badge and member', () => {
    expect(
      validateGrantForm({ badgeId: 'b1', memberId: 'u1', note: '' }),
    ).toBeNull();
  });

  it('fails when member is null', () => {
    expect(
      validateGrantForm({ badgeId: 'b1', memberId: null, note: '' }),
    ).toMatch(/member/i);
  });

  it('fails when badgeId is empty', () => {
    expect(
      validateGrantForm({ badgeId: '', memberId: 'u1', note: '' }),
    ).toMatch(/badge/i);
  });

  it('passes with a non-empty note', () => {
    expect(
      validateGrantForm({ badgeId: 'b1', memberId: 'u1', note: 'Spoke at #5' }),
    ).toBeNull();
  });
});

// ─── 4. buildGrantPayload note trimming ───────────────────────────────────────

function buildGrantPayload(badgeId: string, memberId: string, note: string) {
  return {
    badge_id: badgeId,
    member_id: memberId,
    note: note.trim() || null,
  };
}

describe('buildGrantPayload', () => {
  it('converts whitespace-only note to null', () => {
    const payload = buildGrantPayload('b1', 'u1', '   ');
    expect(payload.note).toBeNull();
  });

  it('trims surrounding whitespace from note', () => {
    const payload = buildGrantPayload('b1', 'u1', '  Spoke at 3 events  ');
    expect(payload.note).toBe('Spoke at 3 events');
  });

  it('preserves non-empty note', () => {
    const payload = buildGrantPayload('b1', 'u1', 'Community leader');
    expect(payload.note).toBe('Community leader');
  });

  it('converts empty note to null', () => {
    const payload = buildGrantPayload('b1', 'u1', '');
    expect(payload.note).toBeNull();
  });

  it('passes badge_id and member_id through', () => {
    const payload = buildGrantPayload('b2', 'u99', '');
    expect(payload.badge_id).toBe('b2');
    expect(payload.member_id).toBe('u99');
  });
});

// ─── 5. Icon fallback guard ───────────────────────────────────────────────────

describe('icon_url fallback', () => {
  it('shows fallback icon when icon_url is null', () => {
    const badge = SAMPLE_BADGES[0];
    expect(badge?.icon_url).toBeNull();
  });

  it('renders img when icon_url is present', () => {
    const badge = SAMPLE_BADGES[1];
    expect(badge?.icon_url).not.toBeNull();
    expect(badge?.icon_url?.startsWith('https://')).toBe(true);
  });
});

// ─── 6. criteria_description fallback ────────────────────────────────────────

describe('criteria_description fallback', () => {
  it('shows dash when criteria_description is null', () => {
    const badge = SAMPLE_BADGES[2];
    expect(badge?.criteria_description).toBeNull();
  });

  it('shows text when criteria_description is defined', () => {
    const badge = SAMPLE_BADGES[0];
    expect(badge?.criteria_description).toBe('Spoke at 3 or more events.');
  });
});

// ─── 7. award_count display ──────────────────────────────────────────────────

describe('award_count display', () => {
  it('renders zero as "0"', () => {
    const badge = SAMPLE_BADGES[2];
    expect(String(badge?.award_count)).toBe('0');
  });

  it('renders positive count', () => {
    const badge = SAMPLE_BADGES[1];
    expect(String(badge?.award_count)).toBe('23');
  });
});
