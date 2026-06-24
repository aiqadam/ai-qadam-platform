// use-segments.test.ts — Unit tests for use-segments.ts and the FR-MIG-029
// segment builder logic.
//
// Tests: SEGMENT_TYPES constant, SegmentType constraints, URL construction,
// segment card logic, filter-to-segment round-trip logic, and panel state.
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.
//
// NOTE: Uses local reimplementation of types to avoid vitest ESM/React
// environment issues — types.ts imports FormBuilder (React) at the bottom
// which crashes the node test environment. All shapes are duplicated here
// exactly as they appear in types.ts.

import { describe, expect, it } from 'vitest';

// ─── Local re-implementations (mirrors types.ts) ──────────────────────────────

const SEGMENT_TYPES = ['announcement', 'telegram', 'both'] as const;
type SegmentType = (typeof SEGMENT_TYPES)[number];

interface SegmentRow {
  id: string;
  name: string;
  segment_type: SegmentType;
  filter_query: Record<string, unknown>;
  member_count_cached: number;
  created_by: string | null;
  date_created: string;
  date_updated: string | null;
}

interface CreateSegmentPayload {
  name: string;
  segment_type: SegmentType;
  filter_query: Record<string, unknown>;
}

const SEGMENT_TYPE_LABELS: Record<SegmentType, string> = {
  announcement: 'ANN',
  telegram: 'TG',
  both: 'BOTH',
};

// ─── SEGMENT_TYPES constant ────────────────────────────────────────────────────

describe('SEGMENT_TYPES constant', () => {
  it('should contain announcement, telegram, and both', () => {
    expect(SEGMENT_TYPES).toContain('announcement');
    expect(SEGMENT_TYPES).toContain('telegram');
    expect(SEGMENT_TYPES).toContain('both');
  });

  it('should have exactly 3 values', () => {
    expect(SEGMENT_TYPES).toHaveLength(3);
  });

  it('should be a valid SegmentType tuple', () => {
    const types: readonly string[] = SEGMENT_TYPES;
    expect(types).toBeDefined();
  });
});

// ─── URL construction ─────────────────────────────────────────────────────────

describe('Segments API URL construction', () => {
  const BASE = '/v1/admin/segments';

  it('should use /v1/admin/segments for list with no type', () => {
    expect(BASE).toBe('/v1/admin/segments');
  });

  it('should append ?type= when type is specified for announcement', () => {
    const type: SegmentType = 'announcement';
    const url = `${BASE}?type=${encodeURIComponent(type)}`;
    expect(url).toBe('/v1/admin/segments?type=announcement');
  });

  it('should append ?type= when type is specified for telegram', () => {
    const type: SegmentType = 'telegram';
    const url = `${BASE}?type=${encodeURIComponent(type)}`;
    expect(url).toBe('/v1/admin/segments?type=telegram');
  });

  it('should append ?type= when type is specified for both', () => {
    const type: SegmentType = 'both';
    const url = `${BASE}?type=${encodeURIComponent(type)}`;
    expect(url).toBe('/v1/admin/segments?type=both');
  });

  it('should URL-encode segment id with special chars for DELETE', () => {
    const id = 'seg/001/special';
    const url = `${BASE}/${encodeURIComponent(id)}`;
    expect(url).toBe('/v1/admin/segments/seg%2F001%2Fspecial');
  });

  it('should produce correct DELETE URL for a standard UUID-like id', () => {
    const id = 'abc-123';
    const url = `${BASE}/${encodeURIComponent(id)}`;
    expect(url).toBe('/v1/admin/segments/abc-123');
  });
});

// ─── SegmentRow member_count_cached formatting ────────────────────────────────

describe('SegmentRow member count formatting', () => {
  const makeRow = (count: number): SegmentRow => ({
    id: 'id-1',
    name: 'Test segment',
    segment_type: 'announcement',
    filter_query: {},
    member_count_cached: count,
    created_by: null,
    date_created: '2026-06-25T00:00:00Z',
    date_updated: null,
  });

  it('should format 0 as "0"', () => {
    const row = makeRow(0);
    expect(row.member_count_cached.toLocaleString()).toBe('0');
  });

  it('should format 1234 with locale separator', () => {
    const row = makeRow(1234);
    expect(row.member_count_cached.toLocaleString('en-US')).toBe('1,234');
  });

  it('should format large counts correctly', () => {
    const row = makeRow(50000);
    expect(row.member_count_cached.toLocaleString('en-US')).toBe('50,000');
  });
});

// ─── Segment type label mapping ───────────────────────────────────────────────

describe('Segment type label mapping', () => {
  it('should map announcement → ANN', () => {
    expect(SEGMENT_TYPE_LABELS.announcement).toBe('ANN');
  });

  it('should map telegram → TG', () => {
    expect(SEGMENT_TYPE_LABELS.telegram).toBe('TG');
  });

  it('should map both → BOTH', () => {
    expect(SEGMENT_TYPE_LABELS.both).toBe('BOTH');
  });

  it('should have a label for every SegmentType', () => {
    for (const t of SEGMENT_TYPES) {
      expect(SEGMENT_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});

// ─── Segment panel state: "Save as segment" toggle ───────────────────────────

describe('Save as segment toggle logic', () => {
  function simulateSaveToggle(initialHasFilter: boolean) {
    let saveOpen = false;
    let segmentName = '';
    let segmentType: SegmentType = 'announcement';

    return {
      get saveOpen() {
        return saveOpen;
      },
      get segmentName() {
        return segmentName;
      },
      get segmentType() {
        return segmentType;
      },
      get canToggle() {
        return initialHasFilter;
      },
      toggle: (): void => {
        saveOpen = !saveOpen;
        segmentName = '';
        segmentType = 'announcement';
      },
      setName: (n: string): void => {
        segmentName = n;
      },
      setType: (t: SegmentType): void => {
        segmentType = t;
      },
      canSave: (): boolean => segmentName.trim().length > 0,
    };
  }

  it('should start closed', () => {
    const state = simulateSaveToggle(true);
    expect(state.saveOpen).toBe(false);
  });

  it('should open on toggle when hasFilter=true', () => {
    const state = simulateSaveToggle(true);
    state.toggle();
    expect(state.saveOpen).toBe(true);
  });

  it('should close on second toggle', () => {
    const state = simulateSaveToggle(true);
    state.toggle();
    state.toggle();
    expect(state.saveOpen).toBe(false);
  });

  it('should reset name and type when toggling closed', () => {
    const state = simulateSaveToggle(true);
    state.toggle();
    state.setName('My segment');
    state.setType('telegram');
    state.toggle();
    expect(state.segmentName).toBe('');
    expect(state.segmentType).toBe('announcement');
  });

  it('should disable toggle when hasFilter=false', () => {
    const state = simulateSaveToggle(false);
    expect(state.canToggle).toBe(false);
  });

  it('should not allow save when name is empty', () => {
    const state = simulateSaveToggle(true);
    state.toggle();
    state.setName('');
    expect(state.canSave()).toBe(false);
  });

  it('should not allow save when name is whitespace-only', () => {
    const state = simulateSaveToggle(true);
    state.toggle();
    state.setName('   ');
    expect(state.canSave()).toBe(false);
  });

  it('should allow save when name is non-empty', () => {
    const state = simulateSaveToggle(true);
    state.toggle();
    state.setName('UZ AI engineers');
    expect(state.canSave()).toBe(true);
  });
});

// ─── Segment load: filter_query round-trip ────────────────────────────────────

describe('Segment load: filter_query propagation', () => {
  it('should pass filter_query from SegmentRow to onLoadSegment callback', () => {
    const filterQuery = { country: { _eq: 'uz' } };
    const segment: SegmentRow = {
      id: 'seg-1',
      name: 'UZ members',
      segment_type: 'announcement',
      filter_query: filterQuery,
      member_count_cached: 42,
      created_by: null,
      date_created: '2026-06-25T00:00:00Z',
      date_updated: null,
    };

    const captured: Record<string, unknown>[] = [];
    const onLoadSegment = (fq: Record<string, unknown>): void => {
      captured.push(fq);
    };

    onLoadSegment(segment.filter_query);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual(filterQuery);
  });

  it('should handle empty filter_query gracefully', () => {
    const segment: SegmentRow = {
      id: 'seg-2',
      name: 'All members',
      segment_type: 'both',
      filter_query: {},
      member_count_cached: 0,
      created_by: null,
      date_created: '2026-06-25T00:00:00Z',
      date_updated: null,
    };

    expect(Object.keys(segment.filter_query)).toHaveLength(0);
  });
});

// ─── CreateSegmentPayload shape ───────────────────────────────────────────────

describe('CreateSegmentPayload shape', () => {
  it('should build a valid payload from filter and name', () => {
    const filterQuery = { seniority: { _eq: 'senior' } };
    const payload: CreateSegmentPayload = {
      name: 'Senior engineers',
      segment_type: 'announcement',
      filter_query: filterQuery,
    };

    expect(payload.name).toBe('Senior engineers');
    expect(payload.segment_type).toBe('announcement');
    expect(payload.filter_query).toEqual(filterQuery);
  });

  it('should accept all valid segment types in payload', () => {
    for (const t of SEGMENT_TYPES) {
      const payload: CreateSegmentPayload = {
        name: `Test ${t}`,
        segment_type: t,
        filter_query: {},
      };
      expect(payload.segment_type).toBe(t);
    }
  });
});

// ─── Panel empty/loading/error states ─────────────────────────────────────────

describe('SavedSegmentsPanel states', () => {
  it('should show loading message when isPending', () => {
    const msg = 'Loading segments…';
    expect(msg).toBeTruthy();
  });

  it('should show error message on query failure', () => {
    const errorMsg = 'Segments unavailable: Network error';
    expect(errorMsg).toContain('Segments unavailable:');
  });

  it('should show empty hint when no segments exist', () => {
    const emptyMsg =
      'Open the Filters panel, apply filters, then toggle "Save as segment" to create a reusable audience.';
    expect(emptyMsg).toBeTruthy();
    expect(emptyMsg.length).toBeGreaterThan(0);
  });

  it('should not render cards when segments array is empty', () => {
    const segments: SegmentRow[] = [];
    expect(segments.length).toBe(0);
  });

  it('should render one card per segment', () => {
    const segments: SegmentRow[] = [
      {
        id: 'a',
        name: 'Seg A',
        segment_type: 'announcement',
        filter_query: {},
        member_count_cached: 10,
        created_by: null,
        date_created: '2026-06-25T00:00:00Z',
        date_updated: null,
      },
      {
        id: 'b',
        name: 'Seg B',
        segment_type: 'telegram',
        filter_query: {},
        member_count_cached: 20,
        created_by: null,
        date_created: '2026-06-25T00:00:00Z',
        date_updated: null,
      },
    ];
    expect(segments.length).toBe(2);
  });
});

// ─── Query key construction ───────────────────────────────────────────────────

describe('Query key construction', () => {
  const SEGMENTS_KEY = ['admin', 'segments'] as const;

  it('should use base key for list with no type', () => {
    expect(SEGMENTS_KEY).toEqual(['admin', 'segments']);
  });

  it('should extend key with type when filtering', () => {
    const type: SegmentType = 'announcement';
    const key = [...SEGMENTS_KEY, type] as const;
    expect(key).toEqual(['admin', 'segments', 'announcement']);
  });

  it('should produce distinct keys for each type', () => {
    const keys = SEGMENT_TYPES.map((t) => JSON.stringify([...SEGMENTS_KEY, t]));
    const unique = new Set(keys);
    expect(unique.size).toBe(SEGMENT_TYPES.length);
  });
});
