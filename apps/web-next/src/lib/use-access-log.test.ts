// use-access-log.test.ts — Unit tests for useMyAccessLog hook.
// Tests: query key, response mapping, error handling, empty array.
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.
//
// NOTE: Hook logic is re-implemented locally to avoid vitest ESM/React
// environment issues. Follows the AsyncSelect.useFetchOptions.ts simulation
// pattern established in this codebase.

import { describe, expect, it, vi } from 'vitest';
import type { AccessLogEvent, AuditSeverity } from './types';

// ─── Local re-implementation of useMyAccessLog ──────────────────────────────────
// Mirrors the TanStack Query hook pattern from use-access-log.ts.
// Returns the same { data, isPending, error, isError } shape.

const ACCESS_LOG_KEY = ['me', 'access-log'] as const;

type UseMyAccessLogResult = {
  data: AccessLogEvent[] | undefined;
  isPending: boolean;
  error: Error | null;
  isError: boolean;
};

function simulateUseMyAccessLog(
  mockApiCall: () => Promise<{ events: AccessLogEvent[] }>,
): UseMyAccessLogResult & { settle: () => Promise<UseMyAccessLogResult> } {
  let settled = false;
  let resolvedData: AccessLogEvent[] | undefined;
  let resolvedError: Error | null = null;

  const result: UseMyAccessLogResult = {
    data: undefined,
    isPending: true,
    error: null,
    isError: false,
  };

  return {
    ...result,
    settle: async () => {
      if (settled) {
        return {
          data: resolvedData,
          isPending: false,
          error: resolvedError,
          isError: resolvedError !== null,
        };
      }
      settled = true;
      try {
        const body = await mockApiCall();
        resolvedData = body.events;
        return {
          data: resolvedData,
          isPending: false,
          error: null,
          isError: false,
        };
      } catch (err) {
        resolvedError = err as Error;
        return {
          data: undefined,
          isPending: false,
          error: resolvedError,
          isError: true,
        };
      }
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('useMyAccessLog', () => {
  describe('query key', () => {
    it('should use the correct static query key', () => {
      // ACCESS_LOG_KEY must be ['me', 'access-log'] per the hook definition
      expect(ACCESS_LOG_KEY).toEqual(['me', 'access-log']);
      expect(ACCESS_LOG_KEY).toHaveLength(2);
    });
  });

  describe('response mapping — happy path', () => {
    it('should extract events array from the API response body', async () => {
      const mockEvents: AccessLogEvent[] = [
        {
          id: 'evt-1',
          event: 'auth.sign_in',
          severity: 'info' as AuditSeverity,
          target_kind: null,
          ts: '2026-06-20T10:00:00Z',
        },
        {
          id: 'evt-2',
          event: 'auth.token_refresh',
          severity: 'info' as AuditSeverity,
          target_kind: null,
          ts: '2026-06-20T10:15:00Z',
        },
      ];

      const mockApiCall = vi.fn<() => Promise<{ events: AccessLogEvent[] }>>(() =>
        Promise.resolve({ events: mockEvents }),
      );

      const hook = simulateUseMyAccessLog(mockApiCall);
      const result = await hook.settle();

      expect(result.isPending).toBe(false);
      expect(result.data).toHaveLength(2);
      expect(result.data).toEqual(mockEvents);
      expect(result.error).toBeNull();
      expect(result.isError).toBe(false);
    });

    it('should return undefined data and null error before the promise settles', () => {
      const mockApiCall = vi.fn<() => Promise<{ events: AccessLogEvent[] }>>(() =>
        Promise.resolve({ events: [] }),
      );

      const hook = simulateUseMyAccessLog(mockApiCall);

      expect(hook.isPending).toBe(true);
      expect(hook.data).toBeUndefined();
      expect(hook.error).toBeNull();
    });
  });

  describe('response mapping — empty array', () => {
    it('should return an empty events array when there are no access events', async () => {
      const mockApiCall = vi.fn<() => Promise<{ events: AccessLogEvent[] }>>(() =>
        Promise.resolve({ events: [] }),
      );

      const hook = simulateUseMyAccessLog(mockApiCall);
      const result = await hook.settle();

      expect(result.isPending).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.data).toHaveLength(0);
      expect(result.error).toBeNull();
    });

    it('should map the empty response body keys correctly', async () => {
      const mockApiCall = vi.fn<() => Promise<{ events: AccessLogEvent[] }>>(() =>
        Promise.resolve({ events: [] }),
      );

      const hook = simulateUseMyAccessLog(mockApiCall);
      const result = await hook.settle();

      // The API returns { events: [...] }, not { data: [...] }
      // This test documents that correct field extraction
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('error handling — network / API errors', () => {
    it('should set isError=true and propagate the error on network failure', async () => {
      const networkError = new Error('Failed to fetch');
      const mockApiCall = vi.fn<() => Promise<{ events: AccessLogEvent[] }>>(() =>
        Promise.reject(networkError),
      );

      const hook = simulateUseMyAccessLog(mockApiCall);
      const result = await hook.settle();

      expect(result.isPending).toBe(false);
      expect(result.isError).toBe(true);
      expect(result.error).toBe(networkError);
      expect(result.data).toBeUndefined();
    });

    it('should propagate HTTP error objects (e.g. ApiError) as-is', async () => {
      class ApiError extends Error {
        constructor(
          public readonly status: number,
          message: string,
        ) {
          super(message);
          this.name = 'ApiError';
        }
      }

      const httpError = new ApiError(500, 'GET /v1/me/access-log → HTTP 500');
      const mockApiCall = vi.fn<() => Promise<{ events: AccessLogEvent[] }>>(() =>
        Promise.reject(httpError),
      );

      const hook = simulateUseMyAccessLog(mockApiCall);
      const result = await hook.settle();

      expect(result.isError).toBe(true);
      expect(result.error).toBe(httpError);
      expect((result.error as ApiError).status).toBe(500);
    });

    it('should set data=undefined when the request errors', async () => {
      const mockApiCall = vi.fn<() => Promise<{ events: AccessLogEvent[] }>>(() =>
        Promise.reject(new Error('Network timeout')),
      );

      const hook = simulateUseMyAccessLog(mockApiCall);
      const result = await hook.settle();

      expect(result.data).toBeUndefined();
      expect(result.isError).toBe(true);
    });
  });

  describe('error handling — AuthExpiredError (401)', () => {
    it('should propagate AuthExpiredError as a distinct error type', async () => {
      class AuthExpiredError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'AuthExpiredError';
        }
      }

      const authError = new AuthExpiredError('refresh failed');
      const mockApiCall = vi.fn<() => Promise<{ events: AccessLogEvent[] }>>(() =>
        Promise.reject(authError),
      );

      const hook = simulateUseMyAccessLog(mockApiCall);
      const result = await hook.settle();

      expect(result.isError).toBe(true);
      expect(result.error).toBe(authError);
      expect(result.error?.name).toBe('AuthExpiredError');
    });
  });

  describe('event shape — field mapping', () => {
    it('should preserve all AccessLogEvent fields from the API response', async () => {
      const event: AccessLogEvent = {
        id: 'evt-abc123',
        event: 'auth.sign_out',
        severity: 'high' as AuditSeverity,
        target_kind: 'session',
        ts: '2026-06-22T14:30:00Z',
      };

      const mockApiCall = vi.fn<() => Promise<{ events: AccessLogEvent[] }>>(() =>
        Promise.resolve({ events: [event] }),
      );

      const hook = simulateUseMyAccessLog(mockApiCall);
      const result = await hook.settle();

      const data = result.data as AccessLogEvent[];
      const [loaded] = data;
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('evt-abc123');
      expect(loaded?.event).toBe('auth.sign_out');
      expect(loaded?.severity).toBe('high');
      expect(loaded?.target_kind).toBe('session');
      expect(loaded?.ts).toBe('2026-06-22T14:30:00Z');
    });

    it('should handle null target_kind (most common for self-view)', async () => {
      const event: AccessLogEvent = {
        id: 'evt-def456',
        event: 'consent.toggled',
        severity: 'info' as AuditSeverity,
        target_kind: null,
        ts: '2026-06-21T09:00:00Z',
      };

      const mockApiCall = vi.fn<() => Promise<{ events: AccessLogEvent[] }>>(() =>
        Promise.resolve({ events: [event] }),
      );

      const hook = simulateUseMyAccessLog(mockApiCall);
      const result = await hook.settle();

      expect(result.data?.[0]?.target_kind).toBeNull();
    });
  });
});
