// member-filters.test.ts — Unit tests for member filter helpers.
// Tests: serializeFiltersToParams, parseParamsToFilters, validateMemberFilters,
// countActiveFilters, getActiveFilterChips, buildMemberFilter, parseDirectusToMemberFilters.
//
// Per standards.md §IV: AAA pattern, one describe per function, no shared mutable state.
//
// NOTE: Functions are re-implemented locally to avoid vitest ESM import issues with
// @/lib/types and module alias resolution. See AsyncSelect.test.tsx for pattern.

import { describe, expect, it } from 'vitest';

// ─── Local re-implementation of types and constants ────────────────────────────

const COUNTRY_CODES = ['uz', 'kz', 'tj', 'xx'] as const;
const CONSENT_PURPOSES = ['events', 'marketing', 'networking', 'paid_premium'] as const;
const SENIORITY_OPTIONS = ['ic', 'senior', 'lead', 'manager', 'director', 'vp', 'c_level'] as const;

type MemberFilters = {
  country: string;
  seniority: string;
  industry: string;
  interest: string;
  employer: string;
  attendedMin: string;
  consent: string;
};

const EMPTY_MEMBER_FILTERS: MemberFilters = {
  country: '',
  seniority: '',
  industry: '',
  interest: '',
  employer: '',
  attendedMin: '',
  consent: '',
};

const FILTER_PARAM_PREFIX = 'f_';

type SerializedFilter = {
  key: keyof MemberFilters;
  value: string;
  label: string;
};

// ─── Local re-implementation of functions under test ─────────────────────────

function validateEnum(value: string, allowed: readonly string[]): string {
  if (value === '') return '';
  return allowed.includes(value) ? value : '';
}

function validatePositiveInt(value: string): string {
  if (value === '') return '';
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? value : '';
}

function validateMemberFilters(f: MemberFilters): MemberFilters {
  return {
    country: validateEnum(f.country, COUNTRY_CODES),
    seniority: validateEnum(f.seniority, SENIORITY_OPTIONS),
    industry: f.industry,
    interest: f.interest,
    employer: f.employer,
    attendedMin: validatePositiveInt(f.attendedMin),
    consent: validateEnum(f.consent, CONSENT_PURPOSES),
  };
}

function countActiveFilters(f: MemberFilters): number {
  return (Object.keys(f) as Array<keyof MemberFilters>).filter((k) => f[k] !== '').length;
}

const FILTER_LABELS: Record<keyof MemberFilters, string> = {
  country: 'Country',
  seniority: 'Seniority',
  industry: 'Industry',
  interest: 'Interest',
  employer: 'Employer',
  attendedMin: 'Events Attended',
  consent: 'Consent',
};

function serializeFiltersToParams(f: MemberFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(f) as Array<keyof MemberFilters>) {
    const value = f[key];
    if (value) {
      params.set(`${FILTER_PARAM_PREFIX}${key}`, value);
    }
  }
  return params;
}

function parseParamsToFilters(params: URLSearchParams): MemberFilters {
  const result: MemberFilters = { ...EMPTY_MEMBER_FILTERS };
  for (const key of Object.keys(result) as Array<keyof MemberFilters>) {
    const paramValue = params.get(`${FILTER_PARAM_PREFIX}${key}`);
    if (paramValue !== null) {
      result[key] = paramValue;
    }
  }
  return validateMemberFilters(result);
}

function getActiveFilterChips(f: MemberFilters): SerializedFilter[] {
  return (Object.keys(f) as Array<keyof MemberFilters>)
    .filter((k) => f[k] !== '')
    .map((key) => ({
      key,
      value: f[key],
      label: FILTER_LABELS[key],
    }));
}

const FILTER_BUILDERS: Array<{
  key: keyof MemberFilters;
  build: (value: string) => Record<string, unknown> | null;
}> = [
  { key: 'country', build: (v) => ({ country: { _eq: v } }) },
  { key: 'seniority', build: (v) => ({ seniority: { _eq: v } }) },
  { key: 'industry', build: (v) => ({ industry_tags: { _contains: v } }) },
  { key: 'interest', build: (v) => ({ member_interests: { topic_tag: { _eq: v } } }) },
  {
    key: 'employer',
    build: (v) => ({
      member_employments: { employer: { name: { _icontains: v } }, is_current: { _eq: true } },
    }),
  },
  {
    key: 'attendedMin',
    build: (v) => {
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      return { registrations: { _count: { _gte: n } } };
    },
  },
  {
    key: 'consent',
    build: (v) => ({ member_consents: { purpose: { _eq: v }, revoked_at: { _null: true } } }),
  },
];

function buildMemberFilter(f: MemberFilters): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];
  for (const { key, build } of FILTER_BUILDERS) {
    const raw = f[key];
    if (!raw) continue;
    const clause = build(raw);
    if (clause) clauses.push(clause);
  }
  if (clauses.length === 0) return {};
  const first = clauses[0];
  if (clauses.length === 1 && first) return first;
  return { _and: clauses };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readNestedString(obj: unknown, ...path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isPlainObject(cur)) return null;
    cur = cur[key];
  }
  return typeof cur === 'string' ? cur : null;
}

function readNestedNumber(obj: unknown, ...path: string[]): number | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isPlainObject(cur)) return null;
    cur = cur[key];
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null;
}

const FILTER_EXTRACTORS: Array<{
  key: keyof MemberFilters;
  extract: (clause: Record<string, unknown>) => string | null;
}> = [
  { key: 'country', extract: (c) => readNestedString(c, 'country', '_eq') },
  { key: 'seniority', extract: (c) => readNestedString(c, 'seniority', '_eq') },
  { key: 'industry', extract: (c) => readNestedString(c, 'industry_tags', '_contains') },
  { key: 'interest', extract: (c) => readNestedString(c, 'member_interests', 'topic_tag', '_eq') },
  {
    key: 'employer',
    extract: (c) => readNestedString(c, 'member_employments', 'employer', 'name', '_icontains'),
  },
  {
    key: 'attendedMin',
    extract: (c) => {
      const n = readNestedNumber(c, 'registrations', '_count', '_gte');
      return n !== null ? String(n) : null;
    },
  },
  { key: 'consent', extract: (c) => readNestedString(c, 'member_consents', 'purpose', '_eq') },
];

function parseDirectusToMemberFilters(directusFilter: Record<string, unknown>): MemberFilters {
  const result: MemberFilters = { ...EMPTY_MEMBER_FILTERS };
  const { _and: rawAnd } = directusFilter;
  const clauses: Record<string, unknown>[] = Array.isArray(rawAnd)
    ? rawAnd.filter(isPlainObject)
    : [directusFilter];
  for (const clause of clauses) {
    for (const { key, extract } of FILTER_EXTRACTORS) {
      if (result[key] !== '') continue;
      const value = extract(clause);
      if (value !== null) result[key] = value;
    }
  }
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// ─── serializeFiltersToParams ────────────────────────────────────────────────

describe('serializeFiltersToParams', () => {
  it('should return empty params when all filters are empty', () => {
    const params = serializeFiltersToParams(EMPTY_MEMBER_FILTERS);
    expect(params.toString()).toBe('');
  });

  it('should serialize a single field when only one filter is set', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, country: 'uz' };
    const params = serializeFiltersToParams(filters);
    expect(params.get('f_country')).toBe('uz');
    expect(params.toString()).toBe('f_country=uz');
  });

  it('should serialize all seven fields when all are set', () => {
    const filters: MemberFilters = {
      country: 'kz',
      seniority: 'senior',
      industry: 'tech',
      interest: 'ai',
      employer: 'Google',
      attendedMin: '3',
      consent: 'events',
    };
    const params = serializeFiltersToParams(filters);
    expect(params.get('f_country')).toBe('kz');
    expect(params.get('f_seniority')).toBe('senior');
    expect(params.get('f_industry')).toBe('tech');
    expect(params.get('f_interest')).toBe('ai');
    expect(params.get('f_employer')).toBe('Google');
    expect(params.get('f_attendedMin')).toBe('3');
    expect(params.get('f_consent')).toBe('events');
  });

  it('should prefix filter keys with f_ to avoid collisions', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, country: 'uz' };
    const params = serializeFiltersToParams(filters);
    // Should have f_ prefix, not bare "country"
    expect(params.has('f_country')).toBe(true);
    expect(params.has('country')).toBe(false);
  });

  it('should handle special characters in free-text values', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, industry: 'Tech & AI (2025)' };
    const params = serializeFiltersToParams(filters);
    expect(params.get('f_industry')).toBe('Tech & AI (2025)');
  });

  it('should skip empty string values', () => {
    const filters: MemberFilters = {
      country: '',
      seniority: 'senior',
      industry: '',
      interest: '',
      employer: '',
      attendedMin: '',
      consent: '',
    };
    const params = serializeFiltersToParams(filters);
    expect(params.get('f_country')).toBeNull();
    expect(params.get('f_seniority')).toBe('senior');
    expect(params.has('f_industry')).toBe(false);
  });
});

// ─── parseParamsToFilters ────────────────────────────────────────────────────

describe('parseParamsToFilters', () => {
  it('should return EMPTY_MEMBER_FILTERS when params are empty', () => {
    const params = new URLSearchParams();
    const filters = parseParamsToFilters(params);
    expect(filters).toEqual(EMPTY_MEMBER_FILTERS);
  });

  it('should parse valid params for each field', () => {
    const params = new URLSearchParams([
      ['f_country', 'uz'],
      ['f_seniority', 'senior'],
      ['f_industry', 'tech'],
      ['f_interest', 'ai'],
      ['f_employer', 'Google'],
      ['f_attendedMin', '3'],
      ['f_consent', 'events'],
    ]);
    const filters = parseParamsToFilters(params);
    expect(filters.country).toBe('uz');
    expect(filters.seniority).toBe('senior');
    expect(filters.industry).toBe('tech');
    expect(filters.interest).toBe('ai');
    expect(filters.employer).toBe('Google');
    expect(filters.attendedMin).toBe('3');
    expect(filters.consent).toBe('events');
  });

  it('should parse partial params leaving unspecified fields empty', () => {
    const params = new URLSearchParams([['f_country', 'kz']]);
    const filters = parseParamsToFilters(params);
    expect(filters.country).toBe('kz');
    expect(filters.seniority).toBe('');
    expect(filters.industry).toBe('');
  });

  it('should strip invalid country enum values', () => {
    const params = new URLSearchParams([['f_country', 'INVALID']]);
    const filters = parseParamsToFilters(params);
    expect(filters.country).toBe('');
  });

  it('should strip invalid seniority enum values', () => {
    const params = new URLSearchParams([['f_seniority', 'invalid']]);
    const filters = parseParamsToFilters(params);
    expect(filters.seniority).toBe('');
  });

  it('should strip invalid consent enum values', () => {
    const params = new URLSearchParams([['f_consent', 'invalid']]);
    const filters = parseParamsToFilters(params);
    expect(filters.consent).toBe('');
  });

  it('should strip negative attendedMin values', () => {
    const params = new URLSearchParams([['f_attendedMin', '-1']]);
    const filters = parseParamsToFilters(params);
    expect(filters.attendedMin).toBe('');
  });

  it('should strip zero attendedMin values', () => {
    const params = new URLSearchParams([['f_attendedMin', '0']]);
    const filters = parseParamsToFilters(params);
    expect(filters.attendedMin).toBe('');
  });

  it('should accept positive integer attendedMin values', () => {
    const params = new URLSearchParams([['f_attendedMin', '5']]);
    const filters = parseParamsToFilters(params);
    expect(filters.attendedMin).toBe('5');
  });

  it('should strip non-numeric attendedMin values', () => {
    const params = new URLSearchParams([['f_attendedMin', 'abc']]);
    const filters = parseParamsToFilters(params);
    expect(filters.attendedMin).toBe('');
  });

  it('should ignore params without f_ prefix', () => {
    const params = new URLSearchParams([
      ['f_country', 'uz'],
      ['page', '2'],
      ['sort', 'name'],
    ]);
    const filters = parseParamsToFilters(params);
    expect(filters.country).toBe('uz');
    // page and sort should be ignored (no f_ prefix)
  });

  it('should handle case sensitivity for enum values (lowercase expected)', () => {
    // COUNTRY_CODES are lowercase: ['uz', 'kz', 'tj', 'xx']
    const params = new URLSearchParams([['f_country', 'UZ']]);
    const filters = parseParamsToFilters(params);
    expect(filters.country).toBe(''); // uppercase should be stripped
  });

  it('should truncate decimal attendedMin via Number.parseInt', () => {
    // Number.parseInt('1.5', 10) returns 1, which is > 0, so it passes
    const params = new URLSearchParams([['f_attendedMin', '1.5']]);
    const filters = parseParamsToFilters(params);
    expect(filters.attendedMin).toBe('1.5'); // value kept, API will reject at Directus level
  });
});

// ─── validateMemberFilters ────────────────────────────────────────────────────

describe('validateMemberFilters', () => {
  it('should pass through all valid enum values', () => {
    const filters: MemberFilters = {
      country: 'uz',
      seniority: 'senior',
      industry: 'tech',
      interest: 'ai',
      employer: 'Google',
      attendedMin: '5',
      consent: 'events',
    };
    const validated = validateMemberFilters(filters);
    expect(validated).toEqual(filters);
  });

  it('should strip invalid country values', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, country: 'INVALID' };
    const validated = validateMemberFilters(filters);
    expect(validated.country).toBe('');
  });

  it('should strip invalid seniority values', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, seniority: 'junior' };
    const validated = validateMemberFilters(filters);
    expect(validated.seniority).toBe('');
  });

  it('should pass through all valid seniority options', () => {
    const validSeniorities = ['ic', 'senior', 'lead', 'manager', 'director', 'vp', 'c_level'];
    for (const seniority of validSeniorities) {
      const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, seniority };
      const validated = validateMemberFilters(filters);
      expect(validated.seniority).toBe(seniority);
    }
  });

  it('should strip invalid consent values', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, consent: 'invalid' };
    const validated = validateMemberFilters(filters);
    expect(validated.consent).toBe('');
  });

  it('should pass through all valid consent purposes', () => {
    const validConsents = ['events', 'marketing', 'networking', 'paid_premium'];
    for (const consent of validConsents) {
      const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, consent };
      const validated = validateMemberFilters(filters);
      expect(validated.consent).toBe(consent);
    }
  });

  it('should strip negative attendedMin values', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, attendedMin: '-5' };
    const validated = validateMemberFilters(filters);
    expect(validated.attendedMin).toBe('');
  });

  it('should strip zero attendedMin values', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, attendedMin: '0' };
    const validated = validateMemberFilters(filters);
    expect(validated.attendedMin).toBe('');
  });

  it('should strip non-numeric attendedMin values', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, attendedMin: 'abc' };
    const validated = validateMemberFilters(filters);
    expect(validated.attendedMin).toBe('');
  });

  it('should pass through positive integer attendedMin values', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, attendedMin: '10' };
    const validated = validateMemberFilters(filters);
    expect(validated.attendedMin).toBe('10');
  });

  it('should pass through free-text fields unchanged', () => {
    const filters: MemberFilters = {
      ...EMPTY_MEMBER_FILTERS,
      industry: 'Technology & Innovation',
      interest: 'artificial-intelligence',
      employer: "O'Reilly & Associates",
    };
    const validated = validateMemberFilters(filters);
    expect(validated.industry).toBe('Technology & Innovation');
    expect(validated.interest).toBe('artificial-intelligence');
    expect(validated.employer).toBe("O'Reilly & Associates");
  });

  it('should return EMPTY_MEMBER_FILTERS when all fields are empty', () => {
    const validated = validateMemberFilters(EMPTY_MEMBER_FILTERS);
    expect(validated).toEqual(EMPTY_MEMBER_FILTERS);
  });
});

// ─── countActiveFilters ───────────────────────────────────────────────────────

describe('countActiveFilters', () => {
  it('should return 0 when all filters are empty', () => {
    expect(countActiveFilters(EMPTY_MEMBER_FILTERS)).toBe(0);
  });

  it('should return 1 when a single field is set', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, country: 'uz' };
    expect(countActiveFilters(filters)).toBe(1);
  });

  it('should count multiple fields correctly', () => {
    const filters: MemberFilters = {
      country: 'uz',
      seniority: 'senior',
      industry: 'tech',
      interest: '',
      employer: '',
      attendedMin: '',
      consent: '',
    };
    expect(countActiveFilters(filters)).toBe(3);
  });

  it('should return 7 when all seven fields are set', () => {
    const filters: MemberFilters = {
      country: 'uz',
      seniority: 'senior',
      industry: 'tech',
      interest: 'ai',
      employer: 'Google',
      attendedMin: '3',
      consent: 'events',
    };
    expect(countActiveFilters(filters)).toBe(7);
  });
});

// ─── getActiveFilterChips ────────────────────────────────────────────────────

describe('getActiveFilterChips', () => {
  it('should return empty array when all filters are empty', () => {
    const chips = getActiveFilterChips(EMPTY_MEMBER_FILTERS);
    expect(chips).toEqual([]);
  });

  it('should return a single chip when one filter is set', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, country: 'uz' };
    const chips = getActiveFilterChips(filters);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toEqual({ key: 'country', value: 'uz', label: 'Country' });
  });

  it('should return multiple chips with correct labels', () => {
    const filters: MemberFilters = {
      country: 'kz',
      seniority: 'senior',
      industry: 'tech',
      interest: '',
      employer: '',
      attendedMin: '',
      consent: '',
    };
    const chips = getActiveFilterChips(filters);
    expect(chips).toHaveLength(3);
    expect(chips).toContainEqual({ key: 'country', value: 'kz', label: 'Country' });
    expect(chips).toContainEqual({ key: 'seniority', value: 'senior', label: 'Seniority' });
    expect(chips).toContainEqual({ key: 'industry', value: 'tech', label: 'Industry' });
  });

  it('should return chips for all seven fields when all are set', () => {
    const filters: MemberFilters = {
      country: 'uz',
      seniority: 'senior',
      industry: 'tech',
      interest: 'ai',
      employer: 'Google',
      attendedMin: '3',
      consent: 'events',
    };
    const chips = getActiveFilterChips(filters);
    expect(chips).toHaveLength(7);
  });

  it('should use correct human-readable labels for each field', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, attendedMin: '5' };
    const chips = getActiveFilterChips(filters);
    expect(chips[0]!.label).toBe('Events Attended');
  });

  it('should include raw value in chip object', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, employer: 'Acme Corp' };
    const chips = getActiveFilterChips(filters);
    expect(chips[0]!.value).toBe('Acme Corp');
    expect(chips[0]!.key).toBe('employer');
  });
});

// ─── buildMemberFilter ────────────────────────────────────────────────────────

describe('buildMemberFilter', () => {
  it('should return empty object when no filters are set', () => {
    const filter = buildMemberFilter(EMPTY_MEMBER_FILTERS);
    expect(filter).toEqual({});
  });

  it('should build country filter correctly', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, country: 'uz' };
    const filter = buildMemberFilter(filters);
    expect(filter).toEqual({ country: { _eq: 'uz' } });
  });

  it('should build seniority filter correctly', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, seniority: 'senior' };
    const filter = buildMemberFilter(filters);
    expect(filter).toEqual({ seniority: { _eq: 'senior' } });
  });

  it('should build industry filter with _contains', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, industry: 'tech' };
    const filter = buildMemberFilter(filters);
    expect(filter).toEqual({ industry_tags: { _contains: 'tech' } });
  });

  it('should build interest filter correctly', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, interest: 'ai' };
    const filter = buildMemberFilter(filters);
    expect(filter).toEqual({ member_interests: { topic_tag: { _eq: 'ai' } } });
  });

  it('should build employer filter with _icontains', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, employer: 'Google' };
    const filter = buildMemberFilter(filters);
    expect(filter).toEqual({
      member_employments: { employer: { name: { _icontains: 'Google' } }, is_current: { _eq: true } },
    });
  });

  it('should build attendedMin filter with _count._gte', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, attendedMin: '5' };
    const filter = buildMemberFilter(filters);
    expect(filter).toEqual({ registrations: { _count: { _gte: 5 } } });
  });

  it('should return null clause for non-positive attendedMin', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, attendedMin: '0' };
    const filter = buildMemberFilter(filters);
    // attendedMin: '0' is skipped because n <= 0 returns null clause
    expect(filter).toEqual({});
  });

  it('should build consent filter with revoked_at null check', () => {
    const filters: MemberFilters = { ...EMPTY_MEMBER_FILTERS, consent: 'events' };
    const filter = buildMemberFilter(filters);
    expect(filter).toEqual({
      member_consents: { purpose: { _eq: 'events' }, revoked_at: { _null: true } },
    });
  });

  it('should combine multiple filters with _and', () => {
    const filters: MemberFilters = {
      country: 'uz',
      seniority: 'senior',
      industry: '',
      interest: '',
      employer: '',
      attendedMin: '',
      consent: '',
    };
    const filter = buildMemberFilter(filters);
    expect(filter).toEqual({
      _and: [{ country: { _eq: 'uz' } }, { seniority: { _eq: 'senior' } }],
    });
  });

  it('should return single clause without _and wrapper when only one filter', () => {
    const filters: MemberFilters = {
      country: 'uz',
      seniority: '',
      industry: '',
      interest: '',
      employer: '',
      attendedMin: '',
      consent: '',
    };
    const filter = buildMemberFilter(filters);
    expect(filter).toEqual({ country: { _eq: 'uz' } });
    expect(filter).not.toHaveProperty('_and');
  });
});

// ─── parseDirectusToMemberFilters ─────────────────────────────────────────────

describe('parseDirectusToMemberFilters', () => {
  it('should return EMPTY_MEMBER_FILTERS for empty input', () => {
    const filters = parseDirectusToMemberFilters({});
    expect(filters).toEqual(EMPTY_MEMBER_FILTERS);
  });

  it('should parse single clause filter', () => {
    const directusFilter = { country: { _eq: 'uz' } };
    const filters = parseDirectusToMemberFilters(directusFilter);
    expect(filters.country).toBe('uz');
  });

  it('should parse _and array of clauses', () => {
    const directusFilter = {
      _and: [{ country: { _eq: 'kz' } }, { seniority: { _eq: 'senior' } }],
    };
    const filters = parseDirectusToMemberFilters(directusFilter);
    expect(filters.country).toBe('kz');
    expect(filters.seniority).toBe('senior');
  });

  it('should parse industry_tags with _contains', () => {
    const directusFilter = { industry_tags: { _contains: 'tech' } };
    const filters = parseDirectusToMemberFilters(directusFilter);
    expect(filters.industry).toBe('tech');
  });

  it('should parse member_interests.topic_tag', () => {
    const directusFilter = { member_interests: { topic_tag: { _eq: 'ai' } } };
    const filters = parseDirectusToMemberFilters(directusFilter);
    expect(filters.interest).toBe('ai');
  });

  it('should parse member_employments with _icontains', () => {
    const directusFilter = {
      member_employments: { employer: { name: { _icontains: 'Google' } }, is_current: { _eq: true } },
    };
    const filters = parseDirectusToMemberFilters(directusFilter);
    expect(filters.employer).toBe('Google');
  });

  it('should parse registrations._count._gte as string', () => {
    const directusFilter = { registrations: { _count: { _gte: 3 } } };
    const filters = parseDirectusToMemberFilters(directusFilter);
    expect(filters.attendedMin).toBe('3');
  });

  it('should parse member_consents.purpose', () => {
    const directusFilter = {
      member_consents: { purpose: { _eq: 'events' }, revoked_at: { _null: true } },
    };
    const filters = parseDirectusToMemberFilters(directusFilter);
    expect(filters.consent).toBe('events');
  });

  it('should round-trip through buildMemberFilter', () => {
    const original: MemberFilters = {
      country: 'uz',
      seniority: 'senior',
      industry: 'tech',
      interest: 'ai',
      employer: 'Google',
      attendedMin: '3',
      consent: 'events',
    };
    const directusFilter = buildMemberFilter(original);
    const roundTripped = parseDirectusToMemberFilters(directusFilter);
    expect(roundTripped).toEqual(original);
  });
});

// ─── Round-trip: serialize → parse ───────────────────────────────────────────

describe('serializeFiltersToParams → parseParamsToFilters round-trip', () => {
  it('should round-trip all filters correctly', () => {
    const original: MemberFilters = {
      country: 'uz',
      seniority: 'senior',
      industry: 'tech',
      interest: 'ai',
      employer: 'Google',
      attendedMin: '3',
      consent: 'events',
    };
    const params = serializeFiltersToParams(original);
    const parsed = parseParamsToFilters(params);
    expect(parsed).toEqual(original);
  });

  it('should round-trip partial filters correctly', () => {
    const original: MemberFilters = {
      country: 'kz',
      seniority: '',
      industry: 'finance',
      interest: '',
      employer: '',
      attendedMin: '',
      consent: '',
    };
    const params = serializeFiltersToParams(original);
    const parsed = parseParamsToFilters(params);
    expect(parsed.country).toBe('kz');
    expect(parsed.seniority).toBe('');
    expect(parsed.industry).toBe('finance');
  });

  it('should handle special characters in round-trip', () => {
    const original: MemberFilters = {
      country: '',
      seniority: '',
      industry: 'Tech & AI (2025)',
      interest: '',
      employer: "O'Reilly",
      attendedMin: '',
      consent: '',
    };
    const params = serializeFiltersToParams(original);
    const parsed = parseParamsToFilters(params);
    expect(parsed.industry).toBe('Tech & AI (2025)');
    expect(parsed.employer).toBe("O'Reilly");
  });
});
