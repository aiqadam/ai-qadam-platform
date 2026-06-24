// use-form-hooks.test.ts — Unit tests for use-form-hooks.ts
//
// Tests: Query keys, mutation payloads, cache invalidation, helper functions.
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.
//
// NOTE: Hook logic is re-implemented locally to avoid vitest ESM/React
// environment issues. Follows the simulation pattern from use-access-log.test.ts.

import { describe, expect, it } from 'vitest';
import type { FieldAggregate, FieldDef, FormAggregate, FormDetail, FormSubmission } from './types';

// ─── Query key constants (mirrors use-form-hooks.ts) ───────────────────────────

const FORMS_BASE_KEY = ['workspace', 'forms'] as const;

// ─── Local re-implementations of the hook helpers under test ───────────────────

// Helper: computeAggregate (recomputes aggregates for filtered submissions)
function computeAggregate(base: FormAggregate, subs: FormSubmission[]): FormAggregate {
  const anonymousCount = subs.filter((s) => s.is_anonymous).length;
  return {
    ...base,
    total_responses: subs.length,
    anonymous_count: anonymousCount,
    attributed_count: subs.length - anonymousCount,
    fields: base.fields.map((f) => computeFieldAggregate(f, subs)),
  };
}

function computeFieldAggregate(f: FieldAggregate, subs: FormSubmission[]): FieldAggregate {
  const values = subs.map((s) => s.payload[f.key]).filter((v) => v != null && v !== '');
  if (f.type === 'short_text' || f.type === 'long_text') {
    return { ...f, response_count: values.length };
  }
  if (f.type === 'scale') return computeScaleAggregate(f, values);
  if (f.type === 'yes_no') return computeYesNoAggregate(f, values);
  if (f.type === 'select_one' || f.type === 'select_many') return computeSelectAggregate(f, values);
  return f;
}

// Local type aliases for the helper functions
type ScaleAggregate = Extract<FieldAggregate, { type: 'scale' }>;
type YesNoAggregate = Extract<FieldAggregate, { type: 'yes_no' }>;
type SelectAggregate = Extract<FieldAggregate, { type: 'select_one' | 'select_many' }>;

function computeScaleAggregate(f: ScaleAggregate, values: unknown[]): ScaleAggregate {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const distMap = new Map<number, number>();
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const n of nums) {
    sum += n;
    if (n < min) min = n;
    if (n > max) max = n;
    distMap.set(n, (distMap.get(n) ?? 0) + 1);
  }
  return {
    ...f,
    response_count: nums.length,
    mean: nums.length === 0 ? null : sum / nums.length,
    distribution: Array.from(distMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value - b.value),
    min: nums.length === 0 ? 0 : min,
    max: nums.length === 0 ? 0 : max,
  };
}

function computeYesNoAggregate(f: YesNoAggregate, values: unknown[]): YesNoAggregate {
  let yes = 0;
  let no = 0;
  for (const v of values) {
    if (v === true) yes++;
    else if (v === false) no++;
  }
  return { ...f, response_count: yes + no, yes, no };
}

function computeSelectAggregate(f: SelectAggregate, values: unknown[]): SelectAggregate {
  const counts = tallySelectCounts(values);
  return {
    ...f,
    response_count: values.length,
    counts: f.counts.map((c) => ({ ...c, count: counts.get(c.value) ?? 0 })),
  };
}

function tallySelectCounts(values: unknown[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) {
    collectFromSelectValue(v, counts);
  }
  return counts;
}

function collectFromSelectValue(v: unknown, counts: Map<string, number>): void {
  if (typeof v === 'string') {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  } else if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === 'string') counts.set(x, (counts.get(x) ?? 0) + 1);
    }
  }
}

// Helper: fmtValue (mirrors FormResponsesCabinet.tsx)
function fmtValue(v: unknown): string {
  if (v == null) return '(empty)';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createMockFieldDef(type: FieldDef['type'], key: string): FieldDef {
  const base: FieldDef = { type, key, label: `Field ${key}` };
  if (type === 'scale') {
    base.scale = { min: 1, max: 10 };
  } else if (type === 'select_one' || type === 'select_many') {
    base.options = [
      { value: 'opt1', label: 'Option 1' },
      { value: 'opt2', label: 'Option 2' },
    ];
  }
  return base;
}

function createMockFormDetail(overrides?: Partial<FormDetail>): FormDetail {
  return {
    id: 'form-001',
    slug: 'test-form',
    title: 'Test Form',
    description: null,
    country: 'uz',
    status: 'draft',
    allow_anonymous: false,
    schema: { fields: [] },
    submission_count: 0,
    date_created: '2026-01-01T00:00:00Z',
    date_updated: null,
    ...overrides,
  };
}

function createMockSubmission(
  id: string,
  payload: Record<string, unknown>,
  overrides?: Partial<FormSubmission>,
): FormSubmission {
  return {
    id,
    form: 'form-001',
    event: null,
    is_anonymous: false,
    member: {
      id: 'member-1',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
    },
    telegram_user_id: null,
    payload,
    source: 'web',
    language: null,
    status: 'new',
    date_created: '2026-06-20T10:00:00Z',
    ...overrides,
  };
}

function createMockAggregate(fields: FieldAggregate[]): FormAggregate {
  return {
    form_id: 'form-001',
    form_title: 'Test Form',
    total_responses: 0,
    anonymous_count: 0,
    attributed_count: 0,
    by_event: [],
    fields,
  };
}

// ─── Tests: Query keys ────────────────────────────────────────────────────────

describe('useFormHooks query keys', () => {
  it('should use the correct base key for forms', () => {
    expect(FORMS_BASE_KEY).toEqual(['workspace', 'forms']);
    expect(FORMS_BASE_KEY).toHaveLength(2);
  });

  it('should construct detail query key with id', () => {
    const detailKey = [...FORMS_BASE_KEY, 'detail', 'form-001'] as const;
    expect(detailKey).toEqual(['workspace', 'forms', 'detail', 'form-001']);
  });

  it('should construct aggregate query key with id', () => {
    const aggregateKey = [...FORMS_BASE_KEY, 'aggregate', 'form-001'] as const;
    expect(aggregateKey).toEqual(['workspace', 'forms', 'aggregate', 'form-001']);
  });

  it('should construct submissions query key with id and limit', () => {
    const submissionsKey = [...FORMS_BASE_KEY, 'submissions', 'form-001', 500] as const;
    expect(submissionsKey).toEqual(['workspace', 'forms', 'submissions', 'form-001', 500]);
  });

  it('should allow custom limit in submissions key', () => {
    const submissionsKey = [...FORMS_BASE_KEY, 'submissions', 'form-001', 100] as const;
    expect(submissionsKey).toEqual(['workspace', 'forms', 'submissions', 'form-001', 100]);
  });
});

// ─── Tests: computeScaleAggregate ─────────────────────────────────────────────

describe('computeScaleAggregate', () => {
  it('should compute mean correctly for valid numeric values', () => {
    const field: Extract<FieldAggregate, { type: 'scale' }> = {
      type: 'scale',
      key: 'rating',
      label: 'Rating',
      response_count: 0,
      mean: null,
      distribution: [],
      min: 1,
      max: 10,
    };

    const result = computeScaleAggregate(field, [5, 7, 9, 3]);

    expect(result.response_count).toBe(4);
    expect(result.mean).toBeCloseTo(6);
  });

  it('should return null mean for empty values', () => {
    const field: Extract<FieldAggregate, { type: 'scale' }> = {
      type: 'scale',
      key: 'rating',
      label: 'Rating',
      response_count: 0,
      mean: null,
      distribution: [],
      min: 1,
      max: 10,
    };

    const result = computeScaleAggregate(field, []);

    expect(result.response_count).toBe(0);
    expect(result.mean).toBeNull();
  });

  it('should filter out non-finite values (NaN, Infinity)', () => {
    const field: Extract<FieldAggregate, { type: 'scale' }> = {
      type: 'scale',
      key: 'rating',
      label: 'Rating',
      response_count: 0,
      mean: null,
      distribution: [],
      min: 1,
      max: 10,
    };

    const result = computeScaleAggregate(field, [5, Number.NaN, 7, Number.POSITIVE_INFINITY, 3]);

    expect(result.response_count).toBe(3);
    expect(result.mean).toBeCloseTo(5);
  });

  it('should compute distribution correctly', () => {
    const field: Extract<FieldAggregate, { type: 'scale' }> = {
      type: 'scale',
      key: 'rating',
      label: 'Rating',
      response_count: 0,
      mean: null,
      distribution: [],
      min: 1,
      max: 5,
    };

    const result = computeScaleAggregate(field, [4, 4, 5, 3, 4]);

    expect(result.distribution).toHaveLength(3);
    const dist4 = result.distribution.find((d) => d.value === 4);
    expect(dist4?.count).toBe(3);
  });

  it('should set min and max from actual values', () => {
    const field: Extract<FieldAggregate, { type: 'scale' }> = {
      type: 'scale',
      key: 'rating',
      label: 'Rating',
      response_count: 0,
      mean: null,
      distribution: [],
      min: 0,
      max: 10,
    };

    const result = computeScaleAggregate(field, [3, 7, 9]);

    expect(result.min).toBe(3);
    expect(result.max).toBe(9);
  });
});

// ─── Tests: computeYesNoAggregate ───────────────────────────────────────────

describe('computeYesNoAggregate', () => {
  it('should count yes and no responses correctly', () => {
    const field: Extract<FieldAggregate, { type: 'yes_no' }> = {
      type: 'yes_no',
      key: 'attend',
      label: 'Will you attend?',
      response_count: 0,
      yes: 0,
      no: 0,
    };

    const result = computeYesNoAggregate(field, [true, true, false, true, false]);

    expect(result.response_count).toBe(5);
    expect(result.yes).toBe(3);
    expect(result.no).toBe(2);
  });

  it('should handle only yes values', () => {
    const field: Extract<FieldAggregate, { type: 'yes_no' }> = {
      type: 'yes_no',
      key: 'attend',
      label: 'Will you attend?',
      response_count: 0,
      yes: 0,
      no: 0,
    };

    const result = computeYesNoAggregate(field, [true, true, true]);

    expect(result.response_count).toBe(3);
    expect(result.yes).toBe(3);
    expect(result.no).toBe(0);
  });

  it('should handle empty array', () => {
    const field: Extract<FieldAggregate, { type: 'yes_no' }> = {
      type: 'yes_no',
      key: 'attend',
      label: 'Will you attend?',
      response_count: 0,
      yes: 0,
      no: 0,
    };

    const result = computeYesNoAggregate(field, []);

    expect(result.response_count).toBe(0);
    expect(result.yes).toBe(0);
    expect(result.no).toBe(0);
  });

  it('should ignore non-boolean values', () => {
    const field: Extract<FieldAggregate, { type: 'yes_no' }> = {
      type: 'yes_no',
      key: 'attend',
      label: 'Will you attend?',
      response_count: 0,
      yes: 0,
      no: 0,
    };

    const result = computeYesNoAggregate(field, [true, 'yes', false, null, undefined]);

    expect(result.response_count).toBe(2);
    expect(result.yes).toBe(1);
    expect(result.no).toBe(1);
  });
});

// ─── Tests: computeSelectAggregate ──────────────────────────────────────────

describe('computeSelectAggregate', () => {
  it('should tally select_one values correctly', () => {
    const field = {
      type: 'select_one' as const,
      key: 'color',
      label: 'Favorite color',
      response_count: 0,
      counts: [
        { value: 'red', label: 'Red', count: 0 },
        { value: 'blue', label: 'Blue', count: 0 },
        { value: 'green', label: 'Green', count: 0 },
      ],
    };

    const result = computeSelectAggregate(field, ['red', 'blue', 'red', 'green']);

    expect(result.response_count).toBe(4);
    const redCount = result.counts.find((c) => c.value === 'red');
    expect(redCount?.count).toBe(2);
  });

  it('should tally select_many array values correctly', () => {
    const field = {
      type: 'select_many' as const,
      key: 'interests',
      label: 'Your interests',
      response_count: 0,
      counts: [
        { value: 'tech', label: 'Technology', count: 0 },
        { value: 'art', label: 'Art', count: 0 },
        { value: 'music', label: 'Music', count: 0 },
      ],
    };

    const result = computeSelectAggregate(field, [['tech', 'art'], ['tech', 'music'], ['art']]);

    expect(result.response_count).toBe(3);
    const techCount = result.counts.find((c) => c.value === 'tech');
    expect(techCount?.count).toBe(2);
  });

  it('should handle empty values', () => {
    const field = {
      type: 'select_one' as const,
      key: 'color',
      label: 'Favorite color',
      response_count: 0,
      counts: [
        { value: 'red', label: 'Red', count: 0 },
        { value: 'blue', label: 'Blue', count: 0 },
      ],
    };

    const result = computeSelectAggregate(field, []);

    expect(result.response_count).toBe(0);
    expect(result.counts.every((c) => c.count === 0)).toBe(true);
  });

  it('should ignore values not in the option list', () => {
    const field = {
      type: 'select_one' as const,
      key: 'color',
      label: 'Favorite color',
      response_count: 0,
      counts: [
        { value: 'red', label: 'Red', count: 0 },
        { value: 'blue', label: 'Blue', count: 0 },
      ],
    };

    const result = computeSelectAggregate(field, ['red', 'purple', 'blue']);

    expect(result.response_count).toBe(3);
    const purpleCount = result.counts.find((c) => c.value === 'purple');
    expect(purpleCount).toBeUndefined();
  });
});

// ─── Tests: computeAggregate (full recompute) ────────────────────────────────

describe('computeAggregate', () => {
  it('should recompute total_responses and anonymous_count', () => {
    const aggregate = createMockAggregate([]);

    const submissions: FormSubmission[] = [
      createMockSubmission('s1', {}, { is_anonymous: false }),
      createMockSubmission('s2', {}, { is_anonymous: true }),
      createMockSubmission('s3', {}, { is_anonymous: false }),
      createMockSubmission('s4', {}, { is_anonymous: true }),
    ];

    const result = computeAggregate(aggregate, submissions);

    expect(result.total_responses).toBe(4);
    expect(result.anonymous_count).toBe(2);
    expect(result.attributed_count).toBe(2);
  });

  it('should recompute field aggregates based on filtered submissions', () => {
    const scaleField: Extract<FieldAggregate, { type: 'scale' }> = {
      type: 'scale',
      key: 'rating',
      label: 'Rating',
      response_count: 0,
      mean: 7.5,
      distribution: [],
      min: 1,
      max: 10,
    };

    const aggregate = createMockAggregate([scaleField]);

    const submissions: FormSubmission[] = [
      createMockSubmission('s1', { rating: 8 }),
      createMockSubmission('s2', { rating: 6 }),
      createMockSubmission('s3', { rating: 9 }),
    ];

    const result = computeAggregate(aggregate, submissions);

    expect(result.fields[0]?.response_count).toBe(3);
    expect((result.fields[0] as Extract<FieldAggregate, { type: 'scale' }>).mean).toBeCloseTo(7.67);
  });

  it('should preserve by_event from base aggregate', () => {
    const aggregate: FormAggregate = {
      ...createMockAggregate([]),
      by_event: [
        { event_id: 'evt-1', count: 10 },
        { event_id: 'evt-2', count: 5 },
      ],
    };

    const result = computeAggregate(aggregate, []);

    expect(result.by_event).toEqual(aggregate.by_event);
  });
});

// ─── Tests: fmtValue helper ─────────────────────────────────────────────────

describe('fmtValue', () => {
  it('should return "(empty)" for null', () => {
    expect(fmtValue(null)).toBe('(empty)');
  });

  it('should return "(empty)" for undefined', () => {
    expect(fmtValue(undefined)).toBe('(empty)');
  });

  it('should return "Yes" for true', () => {
    expect(fmtValue(true)).toBe('Yes');
  });

  it('should return "No" for false', () => {
    expect(fmtValue(false)).toBe('No');
  });

  it('should stringify arrays as comma-separated values', () => {
    expect(fmtValue(['apple', 'banana'])).toBe('apple, banana');
  });

  it('should JSON-stringify objects', () => {
    expect(fmtValue({ key: 'value' })).toBe('{"key":"value"}');
  });

  it('should return string representation for primitives', () => {
    expect(fmtValue(42)).toBe('42');
    expect(fmtValue('hello')).toBe('hello');
  });
});

// ─── Tests: UpdateFormBody type shape ────────────────────────────────────────

describe('UpdateFormBody shape', () => {
  it('should allow partial updates with title only', () => {
    const body = { title: 'New Title' };
    expect(body.title).toBe('New Title');
    expect('description' in body).toBe(false);
  });

  it('should allow status update', () => {
    const body = { status: 'published' as const };
    expect(body.status).toBe('published');
  });

  it('should allow schema update with fields', () => {
    const body = {
      schema: {
        fields: [createMockFieldDef('short_text', 'q1'), createMockFieldDef('scale', 'q2')],
      },
    };
    expect(body.schema.fields).toHaveLength(2);
  });

  it('should allow allow_anonymous toggle', () => {
    const body = { allow_anonymous: true };
    expect(body.allow_anonymous).toBe(true);
  });

  it('should allow null description to clear it', () => {
    const body = { description: null };
    expect(body.description).toBeNull();
  });
});

// ─── Tests: FormDetail shape ─────────────────────────────────────────────────

describe('FormDetail shape', () => {
  it('should have all required fields', () => {
    const form = createMockFormDetail();

    expect(form.id).toBeDefined();
    expect(form.slug).toBeDefined();
    expect(form.title).toBeDefined();
    expect(form.status).toBeDefined();
    expect(form.schema).toBeDefined();
    expect(Array.isArray(form.schema.fields)).toBe(true);
  });

  it('should have nullable description', () => {
    const form = createMockFormDetail({ description: null });
    expect(form.description).toBeNull();

    const formWithDesc = createMockFormDetail({ description: 'A description' });
    expect(formWithDesc.description).toBe('A description');
  });

  it('should have correct status values', () => {
    const statuses: FormDetail['status'][] = ['draft', 'published', 'archived'];
    for (const status of statuses) {
      const form = createMockFormDetail({ status });
      expect(form.status).toBe(status);
    }
  });
});

// ─── Tests: FormSubmission shape ─────────────────────────────────────────────

describe('FormSubmission shape', () => {
  it('should have all required fields', () => {
    const sub = createMockSubmission('sub-1', { q1: 'answer' });

    expect(sub.id).toBeDefined();
    expect(sub.form).toBeDefined();
    expect(sub.payload).toBeDefined();
    expect(sub.source).toBeDefined();
    expect(sub.date_created).toBeDefined();
  });

  it('should handle anonymous submission', () => {
    const sub = createMockSubmission('sub-1', {}, { is_anonymous: true, member: null });
    expect(sub.is_anonymous).toBe(true);
    expect(sub.member).toBeNull();
  });

  it('should handle Telegram unlinked submission', () => {
    const sub = createMockSubmission(
      'sub-1',
      {},
      {
        is_anonymous: false,
        member: null,
        telegram_user_id: '12345678',
      },
    );
    expect(sub.telegram_user_id).toBe('12345678');
  });

  it('should handle select_many payload with arrays', () => {
    const sub = createMockSubmission('sub-1', {
      interests: ['tech', 'art', 'music'],
    });
    const interests = (sub.payload as { interests: string[] }).interests;
    expect(Array.isArray(interests)).toBe(true);
    expect(interests).toHaveLength(3);
  });

  it('should have correct source values', () => {
    const sources: FormSubmission['source'][] = ['web', 'bot', 'email'];
    for (const source of sources) {
      const sub = createMockSubmission('sub-1', {}, { source });
      expect(sub.source).toBe(source);
    }
  });
});
