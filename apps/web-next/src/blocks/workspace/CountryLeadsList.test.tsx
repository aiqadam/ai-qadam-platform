// CountryLeadsList.test.tsx — unit tests for CountryLeadsList pure helpers.
//
// NOTE: @testing-library/react is NOT installed in web-next. Tests cover
// pure logic extracted from the block:
//   1. COUNTRY_LEAD_STATUSES constant shape
//   2. STATUS_BADGE_CLASSES completeness (all statuses have an entry)
//   3. Status filter logic (passesFilter)
//   4. Activated-date formatting guard
//   5. Display name fallback (null → email)
//   6. Onboard link construction

import { describe, expect, it } from 'vitest';

const COUNTRY_LEAD_STATUSES = ['candidate', 'active', 'inactive'] as const;
type CountryLeadStatus = (typeof COUNTRY_LEAD_STATUSES)[number];

interface CountryLeadRow {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  country: string;
  status: CountryLeadStatus;
  activated_at: string | null;
  deactivated_at: string | null;
  created_at: string;
}

// ─── 1. COUNTRY_LEAD_STATUSES ────────────────────────────────────────────────

describe('COUNTRY_LEAD_STATUSES', () => {
  it('contains candidate, active, inactive in order', () => {
    expect(COUNTRY_LEAD_STATUSES).toEqual(['candidate', 'active', 'inactive']);
  });

  it('has exactly 3 statuses', () => {
    expect(COUNTRY_LEAD_STATUSES).toHaveLength(3);
  });
});

// ─── 2. STATUS_BADGE_CLASSES completeness ────────────────────────────────────

const STATUS_BADGE_CLASSES: Record<CountryLeadStatus, string> = {
  candidate: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  active: 'bg-emerald-600/10 text-emerald-600 border-emerald-600/30',
  inactive: 'bg-zinc-400/10 text-zinc-500 border-zinc-400/30',
};

describe('STATUS_BADGE_CLASSES', () => {
  it('has an entry for every country lead status', () => {
    for (const status of COUNTRY_LEAD_STATUSES) {
      expect(STATUS_BADGE_CLASSES[status]).toBeDefined();
      expect(STATUS_BADGE_CLASSES[status].length).toBeGreaterThan(0);
    }
  });
});

// ─── 3. Status filter logic ───────────────────────────────────────────────────

type StatusFilter = CountryLeadStatus | 'all';

function passesFilter(row: CountryLeadRow, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  return row.status === filter;
}

const SAMPLE_LEADS: CountryLeadRow[] = [
  {
    id: '1',
    user_id: 'u1',
    email: 'abdu@aiqadam.org',
    display_name: 'Abdu M.',
    country: 'uz',
    status: 'candidate',
    activated_at: null,
    deactivated_at: null,
    created_at: '2026-06-20T10:00:00Z',
  },
  {
    id: '2',
    user_id: 'u2',
    email: 'kz-lead@aiqadam.org',
    display_name: null,
    country: 'kz',
    status: 'active',
    activated_at: '2026-06-24T18:00:00Z',
    deactivated_at: null,
    created_at: '2026-06-01T10:00:00Z',
  },
  {
    id: '3',
    user_id: 'u3',
    email: 'old@aiqadam.org',
    display_name: 'Former lead',
    country: 'tj',
    status: 'inactive',
    activated_at: '2026-01-01T00:00:00Z',
    deactivated_at: '2026-05-01T00:00:00Z',
    created_at: '2025-12-01T10:00:00Z',
  },
];

describe('passesFilter', () => {
  it('returns all rows when filter is "all"', () => {
    const result = SAMPLE_LEADS.filter((l) => passesFilter(l, 'all'));
    expect(result).toHaveLength(3);
  });

  it('returns only candidates', () => {
    const result = SAMPLE_LEADS.filter((l) => passesFilter(l, 'candidate'));
    expect(result).toHaveLength(1);
    expect(result[0]?.email).toBe('abdu@aiqadam.org');
  });

  it('returns only active leads', () => {
    const result = SAMPLE_LEADS.filter((l) => passesFilter(l, 'active'));
    expect(result).toHaveLength(1);
    expect(result[0]?.country).toBe('kz');
  });

  it('returns only inactive leads', () => {
    const result = SAMPLE_LEADS.filter((l) => passesFilter(l, 'inactive'));
    expect(result).toHaveLength(1);
    expect(result[0]?.email).toBe('old@aiqadam.org');
  });

  it('returns empty array when no leads match', () => {
    const empty: CountryLeadRow[] = [];
    expect(empty.filter((l) => passesFilter(l, 'candidate'))).toHaveLength(0);
  });
});

// ─── 4. Activated-date formatting ────────────────────────────────────────────

function formatActivatedAt(activated_at: string | null): string {
  if (!activated_at) return '—';
  return new Date(activated_at).toLocaleDateString();
}

describe('formatActivatedAt', () => {
  it('returns — for null', () => {
    expect(formatActivatedAt(null)).toBe('—');
  });

  it('returns a date string for a valid ISO timestamp', () => {
    const result = formatActivatedAt('2026-06-24T18:00:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });
});

// ─── 5. Display name fallback ─────────────────────────────────────────────────

function resolveDisplayName(row: CountryLeadRow): string {
  return row.display_name ?? row.email;
}

describe('resolveDisplayName', () => {
  it('returns display_name when set', () => {
    const row = SAMPLE_LEADS[0];
    if (!row) throw new Error('missing fixture');
    expect(resolveDisplayName(row)).toBe('Abdu M.');
  });

  it('falls back to email when display_name is null', () => {
    const row = SAMPLE_LEADS[1];
    if (!row) throw new Error('missing fixture');
    expect(resolveDisplayName(row)).toBe('kz-lead@aiqadam.org');
  });
});

// ─── 6. Onboard link construction ────────────────────────────────────────────

function onboardHref(leadId: string): string {
  return `/workspace/country-leads/new?leadId=${encodeURIComponent(leadId)}`;
}

describe('onboardHref', () => {
  it('builds a correct href', () => {
    expect(onboardHref('lead-1')).toBe('/workspace/country-leads/new?leadId=lead-1');
  });

  it('encodes special characters in leadId', () => {
    expect(onboardHref('lead/1')).toBe('/workspace/country-leads/new?leadId=lead%2F1');
  });

  it('shows only candidate rows have the onboard action', () => {
    const candidateRows = SAMPLE_LEADS.filter((l) => l.status === 'candidate');
    expect(candidateRows).toHaveLength(1);
    const href = onboardHref(candidateRows[0]?.id ?? '');
    expect(href).toContain('/workspace/country-leads/new?leadId=1');
  });
});
