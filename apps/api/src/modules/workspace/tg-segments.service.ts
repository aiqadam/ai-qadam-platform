import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';

// #294 PR-c — operator-authored audience segments for tg_broadcasts.
//
// Architecture:
//   1. tg_segments.criteria is a Directus-filter-shaped JSON object.
//   2. SegmentResolverService.resolve translates supported criteria to
//      a directus_users query AND-intersected with the universe of
//      "tg-linked, not opted out, in country".
//   3. PR-d's send-now picks segment → resolve() → enqueue dispatches.
//
// We only support a fixed v1 criteria set so the validator can reject
// anything else. Operators write JSON; the validator + resolver narrow
// it; the resolver builds the actual Directus filter.

// ─── Wire shape ──────────────────────────────────────────────────────────

export interface SegmentSummary {
  id: string;
  name: string;
  country: string;
  created_by: string | null;
  date_created: string;
  date_updated: string | null;
}

export interface SegmentDetail extends SegmentSummary {
  criteria: SegmentCriteria;
}

export interface SegmentPreview {
  segment_id: string;
  match_count: number;
  // Sample of up to 5 names (anonymized to "First L.") for operator
  // confidence. Empty when no members match or when the segment
  // resolves to "no scope" (criteria evaluates trivially false).
  sample: { display_name: string }[];
}

// ─── Criteria DSL (v1) ────────────────────────────────────────────────────

// Top-level: _and / _or wrapping leaf criteria. Leaf = supported field.
export interface SegmentCriteria {
  _and?: LeafCriterion[];
  _or?: LeafCriterion[];
}

export type LeafCriterion =
  | { country: { _eq?: string; _in?: string[] } }
  | { linked_within_days: { _gte: number } }
  | { registered_for_event: { _eq: string } }
  | { preferred_topics: { _contains: string } };

const SUPPORTED_FIELDS = [
  'country',
  'linked_within_days',
  'registered_for_event',
  'preferred_topics',
] as const;
type SupportedField = (typeof SUPPORTED_FIELDS)[number];

// ─── Inputs ──────────────────────────────────────────────────────────────

export interface CreateSegmentInput {
  name: string;
  country: string;
  criteria: SegmentCriteria;
}

export interface UpdateSegmentInput {
  name?: string;
  criteria?: SegmentCriteria;
}

// ─── Internal row shape ──────────────────────────────────────────────────

interface SegmentRow {
  id: string;
  name: string;
  country: string;
  criteria: unknown;
  created_by: string | null;
  date_created: string;
  date_updated: string | null;
}

@Injectable()
export class TgSegmentsService {
  constructor(private readonly directus: DirectusClient) {}

  async list(filters: { country?: string | null } = {}): Promise<{ items: SegmentSummary[] }> {
    const { country = null } = filters;
    const parts: string[] = [
      'fields=id,name,country,created_by,date_created,date_updated',
      'sort=-date_created',
      'limit=200',
    ];
    if (country) parts.push(`filter[country][_eq]=${encodeURIComponent(country)}`);
    const res = await this.directus.get<{ data: SegmentRow[] }>(
      `/items/tg_segments?${parts.join('&')}`,
    );
    return { items: res.data.map(rowToSummary) };
  }

  async get(id: string): Promise<SegmentDetail> {
    const res = await this.directus.get<{ data: SegmentRow | null }>(
      `/items/tg_segments/${encodeURIComponent(id)}?fields=*`,
    );
    if (!res.data) {
      throw new NotFoundException({ error: 'segment_not_found' });
    }
    return rowToDetail(res.data);
  }

  async create(input: CreateSegmentInput): Promise<SegmentDetail> {
    validateCriteria(input.criteria);
    const body = {
      name: input.name,
      country: input.country,
      criteria: input.criteria,
    };
    const res = await this.directus.post<{ data: SegmentRow }>('/items/tg_segments', body);
    return rowToDetail(res.data);
  }

  async update(id: string, input: UpdateSegmentInput): Promise<SegmentDetail> {
    if (input.criteria !== undefined) validateCriteria(input.criteria);
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.criteria !== undefined) patch.criteria = input.criteria;
    const res = await this.directus.patch<{ data: SegmentRow }>(
      `/items/tg_segments/${encodeURIComponent(id)}`,
      patch,
    );
    return rowToDetail(res.data);
  }

  async delete(id: string): Promise<void> {
    await this.directus.delete(`/items/tg_segments/${encodeURIComponent(id)}`);
  }

  // resolve() — translate criteria + scope intersection to a directus_users
  // filter, then count. PR-d will reuse this to get the actual member ID
  // list before enqueueing dispatches.
  async preview(id: string): Promise<SegmentPreview> {
    const segment = await this.get(id);
    const filter = buildResolverFilter(segment.criteria, segment.country);
    // Aggregate count first (cheap).
    const filterParam = encodeURIComponent(JSON.stringify(filter));
    const countQuery = `aggregate[count]=id&filter=${filterParam}`;
    const countRes = await this.directus.get<{
      data: Array<{ count: { id: number | string } }>;
    }>(`/users?${countQuery}`);
    const match_count = Number(countRes.data[0]?.count?.id ?? 0);

    // Sample 5 names for operator confidence. Anonymized to "First L."
    let sample: { display_name: string }[] = [];
    if (match_count > 0) {
      const sampleQuery = `fields=first_name,last_name&limit=5&filter=${filterParam}`;
      const sampleRes = await this.directus.get<{
        data: Array<{ first_name: string | null; last_name: string | null }>;
      }>(`/users?${sampleQuery}`);
      sample = sampleRes.data.map((r) => ({ display_name: anonymizeName(r) }));
    }
    return { segment_id: id, match_count, sample };
  }
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────

export function rowToSummary(row: SegmentRow): SegmentSummary {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    created_by: row.created_by,
    date_created: row.date_created,
    date_updated: row.date_updated,
  };
}

export function rowToDetail(row: SegmentRow): SegmentDetail {
  return {
    ...rowToSummary(row),
    criteria: narrowCriteria(row.criteria),
  };
}

// ─── Criteria validation ──────────────────────────────────────────────────

export function validateCriteria(c: unknown): asserts c is SegmentCriteria {
  if (!c || typeof c !== 'object') {
    throw new BadRequestException({ error: 'invalid_criteria', reason: 'must be object' });
  }
  const obj = c as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1 || (keys[0] !== '_and' && keys[0] !== '_or')) {
    throw new BadRequestException({
      error: 'invalid_criteria',
      reason: 'top-level must be { _and: [...] } or { _or: [...] }',
    });
  }
  const arr = obj[keys[0] as '_and' | '_or'];
  if (!Array.isArray(arr)) {
    throw new BadRequestException({
      error: 'invalid_criteria',
      reason: `${keys[0]} must be array`,
    });
  }
  for (const leaf of arr) validateLeaf(leaf);
}

function validateLeaf(leaf: unknown): void {
  if (!leaf || typeof leaf !== 'object') {
    throw new BadRequestException({ error: 'invalid_criteria', reason: 'leaf must be object' });
  }
  const obj = leaf as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1) {
    throw new BadRequestException({
      error: 'invalid_criteria',
      reason: 'leaf must have exactly one field',
    });
  }
  const field = keys[0] as string;
  if (!(SUPPORTED_FIELDS as readonly string[]).includes(field)) {
    throw new BadRequestException({
      error: 'invalid_criteria',
      reason: `unsupported field: ${field}`,
      supported: SUPPORTED_FIELDS,
    });
  }
  validateLeafOp(field as SupportedField, obj[field]);
}

function validateLeafOp(field: SupportedField, op: unknown): void {
  if (!op || typeof op !== 'object') {
    throw new BadRequestException({ error: 'invalid_criteria', reason: `${field} op required` });
  }
  const obj = op as Record<string, unknown>;
  switch (field) {
    case 'country':
      if (typeof obj._eq === 'string' || Array.isArray(obj._in)) return;
      throw new BadRequestException({
        error: 'invalid_criteria',
        reason: 'country: { _eq } or { _in: [...] }',
      });
    case 'linked_within_days':
      if (typeof obj._gte === 'number' && obj._gte > 0) return;
      throw new BadRequestException({
        error: 'invalid_criteria',
        reason: 'linked_within_days: { _gte: <positive number> }',
      });
    case 'registered_for_event':
      if (typeof obj._eq === 'string' && isUuid(obj._eq)) return;
      throw new BadRequestException({
        error: 'invalid_criteria',
        reason: 'registered_for_event: { _eq: <uuid> }',
      });
    case 'preferred_topics':
      if (typeof obj._contains === 'string' && obj._contains.length > 0) return;
      throw new BadRequestException({
        error: 'invalid_criteria',
        reason: 'preferred_topics: { _contains: <slug> }',
      });
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

// Defensive narrow when reading rows; falls back to empty _and.
function narrowCriteria(raw: unknown): SegmentCriteria {
  try {
    validateCriteria(raw);
    return raw;
  } catch {
    return { _and: [] };
  }
}

// ─── Resolver: criteria → directus_users filter ──────────────────────────

// Always-on scope intersection:
//   - telegram_user_id IS NOT NULL  (the user is bot-linked)
//   - telegram_opted_out_at IS NULL  (user not opted out)
//   - country matches the segment's country
// User-defined criteria AND-intersect onto this scope.

export function buildResolverFilter(criteria: SegmentCriteria, segmentCountry: string): unknown {
  const scope = [
    { telegram_user_id: { _nnull: true } },
    { telegram_opted_out_at: { _null: true } },
    { country: { _eq: segmentCountry } },
  ];
  const userLeaves = (criteria._and ?? criteria._or ?? []).map(translateLeaf);
  if (criteria._or !== undefined && userLeaves.length > 0) {
    return { _and: [...scope, { _or: userLeaves }] };
  }
  return { _and: [...scope, ...userLeaves] };
}

function translateLeaf(leaf: LeafCriterion): unknown {
  // country / preferred_topics translate directly. registered_for_event
  // needs a M2M reverse-lookup through registrations. linked_within_days
  // translates to date math against telegram_linked_at.
  if ('country' in leaf) return leaf;
  if ('preferred_topics' in leaf) return leaf;
  if ('linked_within_days' in leaf) {
    const cutoff = new Date(Date.now() - leaf.linked_within_days._gte * 86_400_000).toISOString();
    return { telegram_linked_at: { _gte: cutoff } };
  }
  if ('registered_for_event' in leaf) {
    // Directus filter syntax for reverse-relation existence check.
    return { registrations: { event: { _eq: leaf.registered_for_event._eq } } };
  }
  return {}; // unreachable when validator passed
}

function anonymizeName(r: { first_name: string | null; last_name: string | null }): string {
  const first = (r.first_name ?? '').trim();
  const last = (r.last_name ?? '').trim();
  if (first && last) return `${first} ${last[0]}.`;
  if (first) return first;
  if (last) return last;
  return '(unnamed)';
}
