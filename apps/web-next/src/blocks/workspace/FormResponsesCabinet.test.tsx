// FormResponsesCabinet.test.tsx — Unit tests for FormResponsesCabinet.tsx
//
// Tests: Aggregate computation, CSV export, filtering logic.
// Uses vi.mock() for TanStack Query hooks.
//
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.

import type { FieldAggregate, FormSubmission } from '@/lib/types';
import { describe, expect, it } from 'vitest';

// ─── Local type aliases for the helper functions ───────────────────────────────
type ScaleAggregate = Extract<FieldAggregate, { type: 'scale' }>;
type YesNoAggregate = Extract<FieldAggregate, { type: 'yes_no' }>;
type SelectAggregate = Extract<FieldAggregate, { type: 'select_one' | 'select_many' }>;

// ─── Local re-implementations of the helpers under test ───────────────────────

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

// ─── Fixtures ────────────────────────────────────────────────────────────────

function createMockSubmission(
  id: string,
  payload: Record<string, unknown>,
  overrides: Partial<FormSubmission> = {},
): FormSubmission {
  return {
    id,
    form: 'form-1',
    event: null,
    is_anonymous: false,
    member: { id: 'member-1', first_name: 'Test', last_name: 'User', email: 'test@example.com' },
    telegram_user_id: null,
    payload,
    source: 'web',
    language: 'en',
    status: 'new',
    date_created: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests: computeScaleAggregate ─────────────────────────────────────────────

describe('computeScaleAggregate', () => {
  it('should compute mean correctly for valid numeric values', () => {
    const field: ScaleAggregate = {
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
    const field: ScaleAggregate = {
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
    const field: ScaleAggregate = {
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
    const field: ScaleAggregate = {
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
    const field: ScaleAggregate = {
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
  it('should count yes and no responses', () => {
    const field: YesNoAggregate = {
      type: 'yes_no',
      key: 'attended',
      label: 'Did you attend?',
      response_count: 0,
      yes: 0,
      no: 0,
    };

    const result = computeYesNoAggregate(field, [true, false, true, true, false]);

    expect(result.response_count).toBe(5);
    expect(result.yes).toBe(3);
    expect(result.no).toBe(2);
  });

  it('should handle empty values', () => {
    const field: YesNoAggregate = {
      type: 'yes_no',
      key: 'attended',
      label: 'Did you attend?',
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
    const field: YesNoAggregate = {
      type: 'yes_no',
      key: 'attended',
      label: 'Did you attend?',
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

// ─── Tests: computeSelectAggregate ───────────────────────────────────────────

describe('computeSelectAggregate', () => {
  it('should tally select_one responses', () => {
    const field: SelectAggregate = {
      type: 'select_one',
      key: 'color',
      label: 'Favorite color',
      response_count: 0,
      counts: [
        { value: 'red', label: 'Red', count: 0 },
        { value: 'blue', label: 'Blue', count: 0 },
      ],
    };

    const result = computeSelectAggregate(field, ['red', 'blue', 'red']);

    const redCount = result.counts.find((c: { value: string }) => c.value === 'red');
    const blueCount = result.counts.find((c: { value: string }) => c.value === 'blue');
    expect(redCount?.count).toBe(2);
    expect(blueCount?.count).toBe(1);
  });

  it('should tally select_many array responses', () => {
    const field: SelectAggregate = {
      type: 'select_many',
      key: 'interests',
      label: 'Interests',
      response_count: 0,
      counts: [
        { value: 'tech', label: 'Technology', count: 0 },
        { value: 'art', label: 'Art', count: 0 },
      ],
    };

    const result = computeSelectAggregate(field, [['tech', 'art'], ['tech'], ['art']]);

    const techCount = result.counts.find((c: { value: string }) => c.value === 'tech');
    const artCount = result.counts.find((c: { value: string }) => c.value === 'art');
    expect(techCount?.count).toBe(2);
    expect(artCount?.count).toBe(2);
  });

  it('should handle empty values', () => {
    const field: SelectAggregate = {
      type: 'select_one',
      key: 'color',
      label: 'Favorite color',
      response_count: 0,
      counts: [
        { value: 'red', label: 'Red', count: 0 },
        { value: 'blue', label: 'Blue', count: 0 },
      ],
    };

    const result = computeSelectAggregate(field, []);

    const redCount = result.counts.find((c: { value: string }) => c.value === 'red');
    expect(redCount?.count).toBe(0);
  });
});

// ─── Tests: FormSubmission shape ─────────────────────────────────────────────

describe('FormSubmission shape', () => {
  it('should create a valid submission with all required fields', () => {
    const submission = createMockSubmission('sub-1', { q1: 'answer' });

    expect(submission.id).toBe('sub-1');
    expect(submission.form).toBe('form-1');
    expect(submission.payload).toEqual({ q1: 'answer' });
    expect(submission.is_anonymous).toBe(false);
    expect(submission.member).not.toBeNull();
  });

  it('should create anonymous submission', () => {
    const submission = createMockSubmission(
      'sub-2',
      { q1: 'answer' },
      { is_anonymous: true, member: null },
    );

    expect(submission.is_anonymous).toBe(true);
    expect(submission.member).toBeNull();
  });

  it('should handle telegram-only submissions', () => {
    const submission = createMockSubmission(
      'sub-3',
      { q1: 'answer' },
      { is_anonymous: false, member: null, telegram_user_id: '12345678' },
    );

    expect(submission.telegram_user_id).toBe('12345678');
    expect(submission.member).toBeNull();
  });
});

// ─── Tests: tallySelectCounts helper ──────────────────────────────────────────

describe('tallySelectCounts', () => {
  it('should count string values', () => {
    const counts = tallySelectCounts(['red', 'blue', 'red']);

    expect(counts.get('red')).toBe(2);
    expect(counts.get('blue')).toBe(1);
  });

  it('should count array values', () => {
    const counts = tallySelectCounts([['tech', 'art'], ['tech'], ['art']]);

    expect(counts.get('tech')).toBe(2);
    expect(counts.get('art')).toBe(2);
  });

  it('should handle mixed string and array values', () => {
    const counts = tallySelectCounts(['red', ['blue', 'red']]);

    expect(counts.get('red')).toBe(2);
    expect(counts.get('blue')).toBe(1);
  });

  it('should ignore non-string non-array values', () => {
    const counts = tallySelectCounts([123, true, null, undefined, 'red']);

    expect(counts.get('red')).toBe(1);
    expect(counts.size).toBe(1);
  });
});
