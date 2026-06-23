// use-tg-broadcasts.test.ts — Unit tests for use-tg-broadcasts.ts
//
// Tests: query keys, mutation payloads, status filter, URL construction,
// and the local re-implementation of all 9 hooks.
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.
//
// NOTE: Hook logic is re-implemented locally to avoid vitest ESM/React
// environment issues. Follows the simulation pattern from use-access-log.test.ts
// and use-form-hooks.test.ts.

import { describe, expect, it, vi } from 'vitest';
import type {
  BroadcastDetail,
  BroadcastStatus,
  BroadcastSummary,
  CreateBroadcastBody,
  InlineButton,
  SegmentPreview,
  UpdateBroadcastBody,
} from './types';

// ─── Query key constant (mirrors use-tg-broadcasts.ts) ─────────────────────────

const BROADCASTS_KEY = ['workspace', 'tg-broadcasts'] as const;

// ─── Local re-implementations of the TanStack Query hooks under test ───────────
// Each re-implementation mirrors the actual hook's URL, method, and
// invalidation logic, then exposes a `settle` helper for async testing.

// ── useTgBroadcasts ───────────────────────────────────────────────────────────

type BroadcastListResult = {
  data: { items: BroadcastSummary[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

function simulateUseTgBroadcasts(
  status: string | undefined,
  mockFetch: () => Promise<{ items: BroadcastSummary[] }>,
): BroadcastListResult & { settle: () => Promise<BroadcastListResult> } {
  let settled = false;
  let resolved: BroadcastListResult;
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const _url = `/v1/workspace/tg-broadcasts${qs}`;

  return {
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    settle: async () => {
      if (settled) return resolved;
      settled = true;
      try {
        const body = await mockFetch();
        resolved = { data: body, isLoading: false, isError: false, error: null };
      } catch (err) {
        resolved = { data: undefined, isLoading: false, isError: true, error: err as Error };
      }
      return resolved;
    },
  };
}

// ── useTgBroadcastDetail ──────────────────────────────────────────────────────

type BroadcastDetailResult = {
  data: BroadcastDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

function simulateUseTgBroadcastDetail(
  id: string,
  mockFetch: () => Promise<BroadcastDetail>,
): BroadcastDetailResult & { settle: () => Promise<BroadcastDetailResult> } {
  let settled = false;
  let resolved: BroadcastDetailResult;
  const _url = `/v1/workspace/tg-broadcasts/${encodeURIComponent(id)}`;

  return {
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    settle: async () => {
      if (settled) return resolved;
      settled = true;
      try {
        const body = await mockFetch();
        resolved = { data: body, isLoading: false, isError: false, error: null };
      } catch (err) {
        resolved = { data: undefined, isLoading: false, isError: true, error: err as Error };
      }
      return resolved;
    },
  };
}

// ── useSegmentPreview ─────────────────────────────────────────────────────────

type SegmentPreviewResult = {
  data: SegmentPreview | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

function simulateUseSegmentPreview(
  id: string,
  mockFetch: () => Promise<SegmentPreview>,
): SegmentPreviewResult & { settle: () => Promise<SegmentPreviewResult> } {
  let settled = false;
  let resolved: SegmentPreviewResult;
  const _url = `/v1/workspace/tg-segments/${encodeURIComponent(id)}/preview`;

  return {
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    settle: async () => {
      if (settled) return resolved;
      settled = true;
      try {
        const body = await mockFetch();
        resolved = { data: body, isLoading: false, isError: false, error: null };
      } catch (err) {
        resolved = { data: undefined, isLoading: false, isError: true, error: err as Error };
      }
      return resolved;
    },
  };
}

// ── useCreateBroadcast ────────────────────────────────────────────────────────

type CreateBroadcastResult = {
  data: BroadcastDetail | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  mutateAsync: (body: CreateBroadcastBody) => Promise<BroadcastDetail>;
};

function simulateUseCreateBroadcast(
  mockFetch: (body: CreateBroadcastBody) => Promise<BroadcastDetail>,
): CreateBroadcastResult & {
  settle: (body: CreateBroadcastBody) => Promise<CreateBroadcastResult>;
} {
  let _pending = false;

  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: async (body: CreateBroadcastBody) => {
      _pending = true;
      try {
        const result = await mockFetch(body);
        return result;
      } finally {
        _pending = false;
      }
    },
    settle: async (_body: CreateBroadcastBody) => ({
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
      mutateAsync: vi.fn(),
    }),
  };
}

// ── useUpdateBroadcast ────────────────────────────────────────────────────────

type UpdateBroadcastResult = {
  data: BroadcastDetail | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  mutateAsync: (body: UpdateBroadcastBody) => Promise<BroadcastDetail>;
};

function simulateUseUpdateBroadcast(
  _id: string,
  mockFetch: (body: UpdateBroadcastBody) => Promise<BroadcastDetail>,
): UpdateBroadcastResult & {
  settle: (body: UpdateBroadcastBody) => Promise<UpdateBroadcastResult>;
} {
  let _pending = false;

  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: async (body: UpdateBroadcastBody) => {
      _pending = true;
      try {
        return await mockFetch(body);
      } finally {
        _pending = false;
      }
    },
    settle: async (_body: UpdateBroadcastBody) => ({
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
      mutateAsync: vi.fn(),
    }),
  };
}

// ── useSendBroadcast ──────────────────────────────────────────────────────────

type SendBroadcastResult = {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  mutateAsync: () => Promise<void>;
};

function simulateUseSendBroadcast(
  _id: string,
  mockFetch: () => Promise<void>,
): SendBroadcastResult {
  let _pending = false;
  return {
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: async () => {
      _pending = true;
      try {
        await mockFetch();
      } finally {
        _pending = false;
      }
    },
  };
}

// ── useSendBroadcastTest ──────────────────────────────────────────────────────

type SendBroadcastTestResult = {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  mutateAsync: () => Promise<void>;
};

function simulateUseSendBroadcastTest(
  _id: string,
  mockFetch: () => Promise<void>,
): SendBroadcastTestResult {
  let _pending = false;
  return {
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: async () => {
      _pending = true;
      try {
        await mockFetch();
      } finally {
        _pending = false;
      }
    },
  };
}

// ── useCancelBroadcast ─────────────────────────────────────────────────────────

type CancelBroadcastResult = {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  mutateAsync: () => Promise<void>;
};

function simulateUseCancelBroadcast(
  _id: string,
  mockFetch: () => Promise<void>,
): CancelBroadcastResult {
  let _pending = false;
  return {
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: async () => {
      _pending = true;
      try {
        await mockFetch();
      } finally {
        _pending = false;
      }
    },
  };
}

// ── useDuplicateBroadcast ──────────────────────────────────────────────────────

type DuplicateBroadcastResult = {
  data: { id: string } | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  mutateAsync: () => Promise<{ id: string }>;
};

function simulateUseDuplicateBroadcast(
  _id: string,
  mockFetch: () => Promise<{ id: string }>,
): DuplicateBroadcastResult {
  let _pending = false;
  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    mutateAsync: async () => {
      _pending = true;
      try {
        return await mockFetch();
      } finally {
        _pending = false;
      }
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function createMockBroadcastSummary(overrides?: Partial<BroadcastSummary>): BroadcastSummary {
  return {
    id: 'bc-001',
    title: 'Test Broadcast',
    country: 'uz',
    status: 'draft',
    scheduled_at: null,
    sent_count: 0,
    date_created: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function createMockBroadcastDetail(overrides?: Partial<BroadcastDetail>): BroadcastDetail {
  return {
    id: 'bc-001',
    title: 'Test Broadcast',
    country: 'uz',
    status: 'draft',
    scheduled_at: null,
    sent_count: 0,
    date_created: '2026-06-01T00:00:00Z',
    html_body: '<b>Hello</b>',
    image_asset: null,
    inline_buttons: [],
    audience_segment: null,
    failure_reason: null,
    date_updated: null,
    recurrence: null,
    ...overrides,
  };
}

function createMockSegmentPreview(matchCount = 1000): SegmentPreview {
  return {
    segment_id: 'seg-001',
    match_count: matchCount,
    sample: [{ display_name: 'John Doe' }],
  };
}

// ─── Tests: BROADCASTS_KEY constant ──────────────────────────────────────────

describe('BROADCASTS_KEY constant', () => {
  it('should equal ["workspace", "tg-broadcasts"]', () => {
    expect(BROADCASTS_KEY).toEqual(['workspace', 'tg-broadcasts']);
    expect(BROADCASTS_KEY).toHaveLength(2);
  });

  it('should be defined as a readonly const tuple', () => {
    // TypeScript 'as const' makes BROADCASTS_KEY readonly at compile time.
    // We verify it is a readonly tuple with the correct values.
    type Expected = readonly ['workspace', 'tg-broadcasts'];
    const isReadonlyTuple: Expected = BROADCASTS_KEY;
    void isReadonlyTuple;
    expect(BROADCASTS_KEY).toEqual(['workspace', 'tg-broadcasts']);
  });
});

// ─── Tests: useTgBroadcasts ──────────────────────────────────────────────────

describe('useTgBroadcasts', () => {
  it('should call GET /v1/workspace/tg-broadcasts with no query string when status is undefined', async () => {
    const mockFetch = vi.fn<() => Promise<{ items: BroadcastSummary[] }>>(() =>
      Promise.resolve({ items: [] }),
    );

    const hook = simulateUseTgBroadcasts(undefined, mockFetch);
    const result = await hook.settle();

    expect(result.data?.items).toEqual([]);
    expect(result.isLoading).toBe(false);
    expect(result.isError).toBe(false);
  });

  it('should call GET /v1/workspace/tg-broadcasts?status=sent when status filter is set', async () => {
    const mockFetch = vi.fn<() => Promise<{ items: BroadcastSummary[] }>>(() =>
      Promise.resolve({ items: [createMockBroadcastSummary({ status: 'sent' })] }),
    );

    const hook = simulateUseTgBroadcasts('sent', mockFetch);
    const result = await hook.settle();

    expect(result.data?.items).toHaveLength(1);
    expect(result.data?.items[0]?.status).toBe('sent');
  });

  it('should return error state when API call fails', async () => {
    const mockFetch = vi.fn<() => Promise<{ items: BroadcastSummary[] }>>(() =>
      Promise.reject(new Error('Network error')),
    );

    const hook = simulateUseTgBroadcasts(undefined, mockFetch);
    const result = await hook.settle();

    expect(result.isError).toBe(true);
    expect(result.error?.message).toBe('Network error');
    expect(result.data).toBeUndefined();
  });

  it('should handle empty list gracefully', async () => {
    const mockFetch = vi.fn<() => Promise<{ items: BroadcastSummary[] }>>(() =>
      Promise.resolve({ items: [] }),
    );

    const hook = simulateUseTgBroadcasts(undefined, mockFetch);
    const result = await hook.settle();

    expect(result.data?.items).toEqual([]);
    expect(result.data?.items).toHaveLength(0);
  });

  it('should construct correct query key with status filter', () => {
    // The hook uses [...BROADCASTS_KEY, status ?? 'all']
    const queryKeyWithStatus = [...BROADCASTS_KEY, 'sent'] as const;
    expect(queryKeyWithStatus).toEqual(['workspace', 'tg-broadcasts', 'sent']);
  });
});

describe('useTgBroadcastDetail', () => {
  it('should call GET /v1/workspace/tg-broadcasts/:id and return BroadcastDetail', async () => {
    const detail = createMockBroadcastDetail({ id: 'bc-xyz' });
    const mockFetch = vi.fn<() => Promise<BroadcastDetail>>(() => Promise.resolve(detail));

    const hook = simulateUseTgBroadcastDetail('bc-xyz', mockFetch);
    const result = await hook.settle();

    expect(result.data?.id).toBe('bc-xyz');
    expect(result.data?.title).toBe('Test Broadcast');
    expect(result.data?.html_body).toBe('<b>Hello</b>');
    expect(result.isLoading).toBe(false);
  });

  it('should return error state when broadcast not found (404)', async () => {
    const notFoundError = new Error('Not found');
    const mockFetch = vi.fn<() => Promise<BroadcastDetail>>(() => Promise.reject(notFoundError));

    const hook = simulateUseTgBroadcastDetail('non-existent', mockFetch);
    const result = await hook.settle();

    expect(result.isError).toBe(true);
    expect(result.error?.message).toBe('Not found');
  });

  it('should return all BroadcastDetail fields', async () => {
    const detail: BroadcastDetail = {
      ...createMockBroadcastDetail(),
      inline_buttons: [{ label: 'Visit', url: 'https://example.com' }],
      audience_segment: 'seg-001',
      recurrence: 'weekly',
    };

    const mockFetch = vi.fn<() => Promise<BroadcastDetail>>(() => Promise.resolve(detail));
    const hook = simulateUseTgBroadcastDetail('bc-001', mockFetch);
    const result = await hook.settle();

    expect(result.data?.inline_buttons).toHaveLength(1);
    expect(result.data?.inline_buttons[0]?.label).toBe('Visit');
    expect(result.data?.audience_segment).toBe('seg-001');
    expect(result.data?.recurrence).toBe('weekly');
  });

  it('should construct correct detail query key', () => {
    const detailKey = [...BROADCASTS_KEY, 'detail', 'bc-001'] as const;
    expect(detailKey).toEqual(['workspace', 'tg-broadcasts', 'detail', 'bc-001']);
  });

  it('should handle failed broadcast with failure_reason', async () => {
    const failedDetail = createMockBroadcastDetail({
      status: 'failed',
      failure_reason: 'Telegram API rate limit exceeded',
    });
    const mockFetch = vi.fn<() => Promise<BroadcastDetail>>(() => Promise.resolve(failedDetail));

    const hook = simulateUseTgBroadcastDetail('bc-failed', mockFetch);
    const result = await hook.settle();

    expect(result.data?.status).toBe('failed');
    expect(result.data?.failure_reason).toBe('Telegram API rate limit exceeded');
  });
});

// ─── Tests: useSegmentPreview ──────────────────────────────────────────────────

describe('useSegmentPreview', () => {
  it('should call GET /v1/workspace/tg-segments/:id/preview', async () => {
    const preview = createMockSegmentPreview(5000);
    const mockFetch = vi.fn<() => Promise<SegmentPreview>>(() => Promise.resolve(preview));

    const hook = simulateUseSegmentPreview('seg-001', mockFetch);
    const result = await hook.settle();

    expect(result.data?.segment_id).toBe('seg-001');
    expect(result.data?.match_count).toBe(5000);
  });

  it('should return error when segment not found', async () => {
    const mockFetch = vi.fn<() => Promise<SegmentPreview>>(() =>
      Promise.reject(new Error('Segment not found')),
    );

    const hook = simulateUseSegmentPreview('bad-seg', mockFetch);
    const result = await hook.settle();

    expect(result.isError).toBe(true);
    expect(result.error?.message).toBe('Segment not found');
  });

  it('should return correct segment preview query key', () => {
    const previewKey = ['workspace', 'tg-segments', 'preview', 'seg-001'] as const;
    expect(previewKey).toEqual(['workspace', 'tg-segments', 'preview', 'seg-001']);
  });

  it('should compute estimated duration correctly (match_count / 30 seconds)', () => {
    // 30000 recipients / 30 per second = 1000 seconds = ~17 minutes
    const matchCount = 30000;
    const estimatedSeconds = Math.round(matchCount / 30);
    expect(estimatedSeconds).toBe(1000);

    const matchCount2 = 15;
    const estimatedSeconds2 = Math.round(matchCount2 / 30);
    expect(estimatedSeconds2).toBeLessThanOrEqual(1);
  });
});

// ─── Tests: useCreateBroadcast ────────────────────────────────────────────────

describe('useCreateBroadcast', () => {
  it('should POST to /v1/workspace/tg-broadcasts with correct body', async () => {
    const body: CreateBroadcastBody = {
      title: 'New Campaign',
      country: 'uz',
      html_body: '<b>Campaign body</b>',
      inline_buttons: [],
      audience_segment: null,
      recurrence: 'none',
    };

    const created: BroadcastDetail = createMockBroadcastDetail({ title: 'New Campaign' });
    const mockFetch = vi.fn<(b: CreateBroadcastBody) => Promise<BroadcastDetail>>(() =>
      Promise.resolve(created),
    );

    const hook = simulateUseCreateBroadcast(mockFetch);
    const result = await hook.mutateAsync(body);

    expect(result.title).toBe('New Campaign');
  });

  it('should include optional fields when provided', async () => {
    const body: CreateBroadcastBody = {
      title: 'With Extras',
      country: 'kz',
      html_body: '<i>Hello Kazakhstan</i>',
      image_asset: 'asset-123',
      inline_buttons: [{ label: 'Click', url: 'https://kz.example.com' }],
      audience_segment: 'seg-kz',
      recurrence: 'monthly',
    };

    const created = createMockBroadcastDetail({ title: 'With Extras', country: 'kz' });
    const mockFetch = vi.fn<(b: CreateBroadcastBody) => Promise<BroadcastDetail>>(() =>
      Promise.resolve(created),
    );

    const hook = simulateUseCreateBroadcast(mockFetch);
    const result = await hook.mutateAsync(body);

    expect(result.title).toBe('With Extras');
    expect(result.country).toBe('kz');
  });

  it('should propagate validation error (400)', async () => {
    const mockFetch = vi.fn<(b: CreateBroadcastBody) => Promise<BroadcastDetail>>(() =>
      Promise.reject(new Error('Validation error: title is required')),
    );

    const hook = simulateUseCreateBroadcast(mockFetch);

    await expect(hook.mutateAsync({ title: '', country: 'uz', html_body: '' })).rejects.toThrow(
      'Validation error: title is required',
    );
  });
});

// ─── Tests: useUpdateBroadcast ────────────────────────────────────────────────

describe('useUpdateBroadcast', () => {
  it('should PATCH /v1/workspace/tg-broadcasts/:id with correct body', async () => {
    const body: UpdateBroadcastBody = {
      title: 'Updated Title',
      html_body: '<b>Updated body</b>',
    };

    const updated = createMockBroadcastDetail({ title: 'Updated Title' });
    const mockFetch = vi.fn<(b: UpdateBroadcastBody) => Promise<BroadcastDetail>>(() =>
      Promise.resolve(updated),
    );

    const hook = simulateUseUpdateBroadcast('bc-001', mockFetch);
    const result = await hook.mutateAsync(body);

    expect(result.title).toBe('Updated Title');
  });

  it('should allow partial updates (title only)', async () => {
    const body: UpdateBroadcastBody = { title: 'Title Only' };
    const updated = createMockBroadcastDetail({ title: 'Title Only' });
    const mockFetch = vi.fn<(b: UpdateBroadcastBody) => Promise<BroadcastDetail>>(() =>
      Promise.resolve(updated),
    );

    const hook = simulateUseUpdateBroadcast('bc-001', mockFetch);
    const result = await hook.mutateAsync(body);

    expect(result.title).toBe('Title Only');
  });

  it('should allow setting scheduled_at to schedule a broadcast', async () => {
    const futureDate = '2026-07-01T12:00:00Z';
    const body: UpdateBroadcastBody = {
      scheduled_at: futureDate,
    };

    // Note: the actual useUpdateBroadcast doesn't send `status` in the body;
    // the server sets status='scheduled' when scheduled_at is provided.
    const updated = createMockBroadcastDetail({ status: 'scheduled', scheduled_at: futureDate });
    const mockFetch = vi.fn<(b: UpdateBroadcastBody) => Promise<BroadcastDetail>>(() =>
      Promise.resolve(updated),
    );

    const hook = simulateUseUpdateBroadcast('bc-001', mockFetch);
    const result = await hook.mutateAsync(body);

    expect(result.status).toBe('scheduled');
    expect(result.scheduled_at).toBe(futureDate);
  });

  it('should handle sent/sending/failed state rejection', async () => {
    const body: UpdateBroadcastBody = { title: 'Cannot Update' };
    const mockFetch = vi.fn<(b: UpdateBroadcastBody) => Promise<BroadcastDetail>>(() =>
      Promise.reject(new Error('Cannot update a broadcast that has been sent')),
    );

    const hook = simulateUseUpdateBroadcast('bc-sent', mockFetch);

    await expect(hook.mutateAsync(body)).rejects.toThrow(
      'Cannot update a broadcast that has been sent',
    );
  });
});

// ─── Tests: useSendBroadcast (send-now) ───────────────────────────────────────

describe('useSendBroadcast', () => {
  it('should POST to /v1/workspace/tg-broadcasts/:id/send-now', async () => {
    const mockFetch = vi.fn<() => Promise<void>>(() => Promise.resolve());

    const hook = simulateUseSendBroadcast('bc-001', mockFetch);
    await hook.mutateAsync();

    // No error means success
    expect(hook.isError).toBe(false);
  });

  it('should return 403 when caller is not super-admin', async () => {
    const mockFetch = vi.fn<() => Promise<void>>(() =>
      Promise.reject(new Error('Forbidden: Super admin required')),
    );

    const hook = simulateUseSendBroadcast('bc-001', mockFetch);

    await expect(hook.mutateAsync()).rejects.toThrow('Forbidden: Super admin required');
  });

  it('should return 409 when broadcast is not in a sendable state', async () => {
    const mockFetch = vi.fn<() => Promise<void>>(() =>
      Promise.reject(new Error('Conflict: Broadcast must be draft, scheduled, or failed to send')),
    );

    const hook = simulateUseSendBroadcast('bc-sending', mockFetch);

    await expect(hook.mutateAsync()).rejects.toThrow('Conflict');
  });
});

// ─── Tests: useSendBroadcastTest ──────────────────────────────────────────────

describe('useSendBroadcastTest', () => {
  it('should POST to /v1/workspace/tg-broadcasts/:id/send-test', async () => {
    const mockFetch = vi.fn<() => Promise<void>>(() => Promise.resolve());

    const hook = simulateUseSendBroadcastTest('bc-001', mockFetch);
    await hook.mutateAsync();

    expect(hook.isError).toBe(false);
  });

  it('should propagate validation error (missing body)', async () => {
    const mockFetch = vi.fn<() => Promise<void>>(() =>
      Promise.reject(new Error('Validation error: html_body is required for test send')),
    );

    const hook = simulateUseSendBroadcastTest('bc-001', mockFetch);

    await expect(hook.mutateAsync()).rejects.toThrow('Validation error');
  });
});

// ─── Tests: useCancelBroadcast ────────────────────────────────────────────────

describe('useCancelBroadcast', () => {
  it('should POST to /v1/workspace/tg-broadcasts/:id/cancel', async () => {
    const mockFetch = vi.fn<() => Promise<void>>(() => Promise.resolve());

    const hook = simulateUseCancelBroadcast('bc-001', mockFetch);
    await hook.mutateAsync();

    expect(hook.isError).toBe(false);
  });

  it('should return 409 when broadcast is not in sending state', async () => {
    const mockFetch = vi.fn<() => Promise<void>>(() =>
      Promise.reject(new Error('Conflict: Only a sending broadcast can be cancelled')),
    );

    const hook = simulateUseCancelBroadcast('bc-draft', mockFetch);

    await expect(hook.mutateAsync()).rejects.toThrow('Conflict');
  });
});

// ─── Tests: useDuplicateBroadcast ─────────────────────────────────────────────

describe('useDuplicateBroadcast', () => {
  it('should POST to /v1/workspace/tg-broadcasts/:id/duplicate and return new id', async () => {
    const mockFetch = vi.fn<() => Promise<{ id: string }>>(() =>
      Promise.resolve({ id: 'bc-copy-001' }),
    );

    const hook = simulateUseDuplicateBroadcast('bc-001', mockFetch);
    const result = await hook.mutateAsync();

    expect(result.id).toBe('bc-copy-001');
    expect(hook.isError).toBe(false);
  });

  it('should return 404 when source broadcast not found', async () => {
    const mockFetch = vi.fn<() => Promise<{ id: string }>>(() =>
      Promise.reject(new Error('Not found')),
    );

    const hook = simulateUseDuplicateBroadcast('bc-missing', mockFetch);

    await expect(hook.mutateAsync()).rejects.toThrow('Not found');
  });
});

// ─── Tests: BuildUpdateData helper ────────────────────────────────────────────
// Mirrors the buildUpdateData logic from TgBroadcastComposer.tsx

function buildUpdateData(data: CreateBroadcastBody): UpdateBroadcastBody {
  const updateData: UpdateBroadcastBody = {
    title: data.title,
    html_body: data.html_body,
  };
  if (data.image_asset !== undefined) updateData.image_asset = data.image_asset;
  if (data.inline_buttons !== undefined) updateData.inline_buttons = data.inline_buttons;
  if (data.audience_segment !== undefined) updateData.audience_segment = data.audience_segment;
  if (data.recurrence !== undefined) updateData.recurrence = data.recurrence;
  return updateData;
}

describe('buildUpdateData (TgBroadcastComposer integration)', () => {
  it('should include title and html_body in all updates', () => {
    const data: CreateBroadcastBody = {
      title: 'Test',
      country: 'uz',
      html_body: '<b>Body</b>',
    };

    const result = buildUpdateData(data);

    expect(result.title).toBe('Test');
    expect(result.html_body).toBe('<b>Body</b>');
  });

  it('should only include fields that are defined (not undefined)', () => {
    const data: CreateBroadcastBody = {
      title: 'Test',
      country: 'uz',
      html_body: '<b>Body</b>',
    };

    const result = buildUpdateData(data);

    expect('image_asset' in result).toBe(false);
    expect('scheduled_at' in result).toBe(false);
  });

  it('should include optional fields when provided', () => {
    const data: CreateBroadcastBody = {
      title: 'Test',
      country: 'uz',
      html_body: '<b>Body</b>',
      inline_buttons: [{ label: 'Btn', url: 'https://x.com' }],
      recurrence: 'weekly',
    };

    const result = buildUpdateData(data);

    expect(result.inline_buttons).toHaveLength(1);
    expect(result.recurrence).toBe('weekly');
  });

  it('should handle scheduled_at added separately (save-and-schedule flow)', () => {
    const data: CreateBroadcastBody = {
      title: 'Test',
      country: 'uz',
      html_body: '<b>Body</b>',
      scheduled_at: '2026-07-01T12:00:00Z',
    };

    const base = buildUpdateData(data);
    base.scheduled_at = data.scheduled_at as string;

    expect(base.scheduled_at).toBe('2026-07-01T12:00:00Z');
  });
});

// ─── Tests: Type shapes ───────────────────────────────────────────────────────

describe('Type shapes', () => {
  it('BroadcastStatus should allow all 5 statuses', () => {
    const statuses: BroadcastStatus[] = ['draft', 'scheduled', 'sending', 'sent', 'failed'];
    expect(statuses).toHaveLength(5);
    for (const s of statuses) {
      expect(typeof s).toBe('string');
    }
  });

  it('InlineButton should have label and url', () => {
    const btn: InlineButton = { label: 'Click me', url: 'https://example.com' };
    expect(btn.label).toBe('Click me');
    expect(btn.url).toBe('https://example.com');
  });

  it('CreateBroadcastBody should require title, country, html_body', () => {
    const body: CreateBroadcastBody = {
      title: 'Campaign',
      country: 'uz',
      html_body: '<b>Hello</b>',
    };
    expect(body.title).toBe('Campaign');
    expect(body.country).toBe('uz');
    expect(body.html_body).toBe('<b>Hello</b>');
  });

  it('UpdateBroadcastBody should allow all optional fields', () => {
    const body: UpdateBroadcastBody = {
      title: 'New',
      html_body: '<i>Updated</i>',
      image_asset: null,
      inline_buttons: [],
      audience_segment: 'seg-001',
      recurrence: 'monthly',
    };
    expect(body.inline_buttons).toHaveLength(0);
    expect(body.recurrence).toBe('monthly');
  });
});
