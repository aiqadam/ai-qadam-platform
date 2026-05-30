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

// Inverse of buildMemberFilter. Best-effort parse of a stored Directus
// filter (e.g. cohort.filter_query) back into the 7 UI primitives so
// clicking a saved cohort in <SavedCohortsPanel> re-populates the
// MembersList form. Recognises the EXACT shapes buildMemberFilter
// emits — anything else is silently dropped (the loaded set is a
// strict subset of what the form can render). Pure; no fetch.

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

export function parseDirectusToMemberFilters(
  directusFilter: Record<string, unknown>,
): MemberFilters {
  const result: MemberFilters = { ...EMPTY_MEMBER_FILTERS };
  // buildMemberFilter emits either a single clause or {_and: [...]}.
  // Accept both; anything else is treated as one root-level clause.
  // Destructure (rather than `directusFilter._and` or `['_and']`) to
  // satisfy both TS's noPropertyAccessFromIndexSignature (TS4111) and
  // Biome's useLiteralKeys at the same time.
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
