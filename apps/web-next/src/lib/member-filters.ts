// L1 helper — member directory filter translation.
//
// The /v1/workspace/members endpoint takes a RAW Directus filter
// object (the same JSON cohorts.filter_query stores), so the cabinet's
// 7 filter primitives must each translate to a Directus clause. Ported
// verbatim from v1's MemberDirectory FILTER_BUILDERS so a cohort saved
// in v1 resolves identically in v2.
//
// Pure functions + constants only (no fetch) — safe for L3 block import
// under ADR-0038 §Locks #1 (the lock blocks lib/api-* imports + raw
// fetch, not plain helpers).

export interface MemberFilters {
  country: string;
  seniority: string;
  industry: string;
  interest: string;
  employer: string;
  attendedMin: string;
  consent: string;
}

export const EMPTY_MEMBER_FILTERS: MemberFilters = {
  country: '',
  seniority: '',
  industry: '',
  interest: '',
  employer: '',
  attendedMin: '',
  consent: '',
};

// Option lists for the select-driven primitives. country + consent
// reuse the shared constants in lib/types; seniority is members-only.
export const SENIORITY_OPTIONS = [
  'ic',
  'senior',
  'lead',
  'manager',
  'director',
  'vp',
  'c_level',
] as const;

// Each primitive → one Directus filter clause. Table-driven so adding
// a primitive stays a one-line change. Returns null when the raw value
// can't form a valid clause (e.g. non-numeric attendedMin).
const FILTER_BUILDERS: Array<{
  key: keyof MemberFilters;
  build: (value: string) => Record<string, unknown> | null;
}> = [
  { key: 'country', build: (v) => ({ country: { _eq: v } }) },
  { key: 'seniority', build: (v) => ({ seniority: { _eq: v } }) },
  // Directus's directus_users field is `industry_tags`, not `industry`
  // — see apps/api/src/modules/workspace/members.service.ts header.
  // The UI MemberFilters.industry key stays as the public/UX semantic;
  // only the Directus clause key is the schema name.
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

export function buildMemberFilter(f: MemberFilters): Record<string, unknown> {
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

export function countActiveFilters(f: MemberFilters): number {
  return (Object.keys(f) as Array<keyof MemberFilters>).filter((k) => f[k] !== '').length;
}
