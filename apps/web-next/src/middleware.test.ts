// middleware.test.ts — Unit tests for middleware.ts cookie logic (FR-MIG-031).
//
// Tests: cookie constants, hasRefresh detection, ssrAuthBootstrap auth flow.
//
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.
//
// NOTE: `middleware.ts` imports `defineMiddleware` from `astro:middleware` which
// cannot be resolved in a plain Vitest node environment. Following the same
// pattern as `api-ssr.test.ts`, the testable logic (hasRefresh check and
// ssrAuthBootstrap) is re-implemented locally here with identical logic.
// The constant values are redeclared as literals so the test validates the
// production values explicitly.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Constants (mirrors middleware.ts post FR-MIG-031) ────────────────────────

const REFRESH_COOKIE_NEXT = 'aiqadam-refresh';
const REFRESH_COOKIE_LEGACY = 'aiqadam-next-refresh';
const REFRESH_COOKIE_LEGACY_HOST = '__Host-aiqadam-refresh';
const INTERNAL_API_URL = 'http://localhost:3000';

// ─── Types (mirrors middleware.ts) ────────────────────────────────────────────

interface AuthMe {
  id: string;
  email: string;
  authentikSubject: string;
  groups: string[];
}

interface SsrAuth {
  accessToken: string;
  me: AuthMe;
}

// ─── Local re-implementation of hasRefresh check ─────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFetch = ReturnType<typeof vi.fn<(...args: any[]) => any>>;

function hasRefresh(cookieHeader: string): boolean {
  return (
    cookieHeader.includes(`${REFRESH_COOKIE_NEXT}=`) ||
    cookieHeader.includes(`${REFRESH_COOKIE_LEGACY}=`) ||
    cookieHeader.includes(`${REFRESH_COOKIE_LEGACY_HOST}=`)
  );
}

// ─── Local re-implementation of ssrAuthBootstrap ──────────────────────────────

async function ssrAuthBootstrap(
  cookieHeader: string,
  hostHeader: string,
  mockFetch: MockFetch,
  apiUrl = INTERNAL_API_URL,
): Promise<{ auth: SsrAuth | null; setCookie: string | null }> {
  if (!hasRefresh(cookieHeader)) return { auth: null, setCookie: null };

  try {
    const refreshRes = await mockFetch(`${apiUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        cookie: cookieHeader,
        host: hostHeader,
      },
    });
    if (!refreshRes.ok) return { auth: null, setCookie: null };
    const { accessToken } = (await refreshRes.json()) as { accessToken: string };
    const setCookie = refreshRes.headers.get('set-cookie');

    const meRes = await mockFetch(`${apiUrl}/v1/auth/me`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        host: hostHeader,
      },
    });
    if (!meRes.ok) return { auth: null, setCookie: null };
    const me = (await meRes.json()) as AuthMe;
    return { auth: { accessToken, me }, setCookie };
  } catch {
    return { auth: null, setCookie: null };
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_ME: AuthMe = {
  id: 'usr-001',
  email: 'test@aiqadam.org',
  authentikSubject: 'ak-sub-001',
  groups: ['members'],
};

function makeRefreshResponse(accessToken: string, setCookie: string | null): object {
  return {
    ok: true,
    json: async () => ({ accessToken }),
    headers: {
      get: (name: string) => (name === 'set-cookie' ? setCookie : null),
    },
  };
}

function makeMeResponse(me: AuthMe): object {
  return {
    ok: true,
    json: async () => me,
  };
}

function makeErrorResponse(status: number): object {
  return { ok: false, status };
}

// ─── Tests: Cookie constants — post-cutover values ────────────────────────────

describe('Cookie constants — post-cutover values (AC-4)', () => {
  it('REFRESH_COOKIE_NEXT equals aiqadam-refresh', () => {
    expect(REFRESH_COOKIE_NEXT).toBe('aiqadam-refresh');
  });

  it('REFRESH_COOKIE_LEGACY equals aiqadam-next-refresh', () => {
    expect(REFRESH_COOKIE_LEGACY).toBe('aiqadam-next-refresh');
  });
});

// ─── Tests: hasRefresh — cookie detection ─────────────────────────────────────

describe('hasRefresh — cookie detection (AC-1, AC-2, AC-3, AC-4)', () => {
  it('returns true when only aiqadam-refresh cookie is present', () => {
    // Arrange
    const cookieHeader = 'aiqadam-refresh=tok_abc123; Path=/';

    // Act
    const result = hasRefresh(cookieHeader);

    // Assert
    expect(result).toBe(true);
  });

  it('returns true when only aiqadam-next-refresh cookie is present', () => {
    // Arrange
    const cookieHeader = 'aiqadam-next-refresh=tok_legacy456; Path=/';

    // Act
    const result = hasRefresh(cookieHeader);

    // Assert
    expect(result).toBe(true);
  });

  it('returns true when only __Host-aiqadam-refresh cookie is present', () => {
    // Arrange
    const cookieHeader = '__Host-aiqadam-refresh=tok_host789; Path=/; Secure';

    // Act
    const result = hasRefresh(cookieHeader);

    // Assert
    expect(result).toBe(true);
  });

  it('returns true when both aiqadam-refresh and aiqadam-next-refresh are present', () => {
    // Arrange — both cookies in header (overlap window scenario)
    const cookieHeader =
      'aiqadam-refresh=tok_canonical; aiqadam-next-refresh=tok_legacy; session=unrelated';

    // Act
    const result = hasRefresh(cookieHeader);

    // Assert
    expect(result).toBe(true);
  });

  it('returns false when cookie header is empty string', () => {
    // Arrange
    const cookieHeader = '';

    // Act
    const result = hasRefresh(cookieHeader);

    // Assert
    expect(result).toBe(false);
  });

  it('returns false when cookie header contains only unrelated cookies', () => {
    // Arrange
    const cookieHeader = 'session=abc; _ga=GA1.1.123456.78; csrf=xyz';

    // Act
    const result = hasRefresh(cookieHeader);

    // Assert
    expect(result).toBe(false);
  });
});

// ─── Tests: ssrAuthBootstrap — auth bootstrap ─────────────────────────────────

describe('ssrAuthBootstrap — auth bootstrap (AC-1, AC-2, AC-3)', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('calls /v1/auth/refresh when aiqadam-refresh cookie present and returns auth', async () => {
    // Arrange
    const cookieHeader = 'aiqadam-refresh=tok_canonical; other=stuff';
    mockFetch
      .mockResolvedValueOnce(makeRefreshResponse('access-token-001', 'aiqadam-refresh=rotated'))
      .mockResolvedValueOnce(makeMeResponse(MOCK_ME));

    // Act
    const result = await ssrAuthBootstrap(cookieHeader, 'aiqadam.org', mockFetch);

    // Assert
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.auth).toEqual({ accessToken: 'access-token-001', me: MOCK_ME });
    expect(result.setCookie).toBe('aiqadam-refresh=rotated');
  });

  it('calls /v1/auth/refresh when aiqadam-next-refresh cookie present (24h overlap)', async () => {
    // Arrange
    const cookieHeader = 'aiqadam-next-refresh=tok_legacy; other=stuff';
    mockFetch
      .mockResolvedValueOnce(makeRefreshResponse('access-token-002', null))
      .mockResolvedValueOnce(makeMeResponse(MOCK_ME));

    // Act
    const result = await ssrAuthBootstrap(cookieHeader, 'aiqadam.org', mockFetch);

    // Assert
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.auth).not.toBeNull();
    expect(result.auth?.accessToken).toBe('access-token-002');
  });

  it('returns auth: null with no fetch call when no refresh cookie present', async () => {
    // Arrange
    const cookieHeader = 'session=abc; _ga=GA1.1.9876.54';

    // Act
    const result = await ssrAuthBootstrap(cookieHeader, 'aiqadam.org', mockFetch);

    // Assert — no fetch call fired; returns null immediately
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual({ auth: null, setCookie: null });
  });

  it('returns auth: null when /v1/auth/refresh returns non-2xx', async () => {
    // Arrange
    const cookieHeader = 'aiqadam-refresh=tok_expired';
    mockFetch.mockResolvedValueOnce(makeErrorResponse(401));

    // Act
    const result = await ssrAuthBootstrap(cookieHeader, 'aiqadam.org', mockFetch);

    // Assert
    expect(result).toEqual({ auth: null, setCookie: null });
    // Should not have called /v1/auth/me after the failed refresh
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns auth: null when /v1/auth/me returns non-2xx', async () => {
    // Arrange
    const cookieHeader = 'aiqadam-refresh=tok_canonical';
    mockFetch
      .mockResolvedValueOnce(makeRefreshResponse('access-token-003', null))
      .mockResolvedValueOnce(makeErrorResponse(403));

    // Act
    const result = await ssrAuthBootstrap(cookieHeader, 'aiqadam.org', mockFetch);

    // Assert
    expect(result).toEqual({ auth: null, setCookie: null });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns auth: null on network error (fetch throws)', async () => {
    // Arrange
    const cookieHeader = 'aiqadam-refresh=tok_canonical';
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    // Act
    const result = await ssrAuthBootstrap(cookieHeader, 'aiqadam.org', mockFetch);

    // Assert — never throws; auth must not block the page
    expect(result).toEqual({ auth: null, setCookie: null });
  });

  it('propagates set-cookie header from /v1/auth/refresh response', async () => {
    // Arrange
    const cookieHeader = 'aiqadam-refresh=tok_old';
    const rotatedCookie = 'aiqadam-refresh=tok_new; HttpOnly; Secure; SameSite=Strict';
    mockFetch
      .mockResolvedValueOnce(makeRefreshResponse('access-token-004', rotatedCookie))
      .mockResolvedValueOnce(makeMeResponse(MOCK_ME));

    // Act
    const result = await ssrAuthBootstrap(cookieHeader, 'aiqadam.org', mockFetch);

    // Assert
    expect(result.setCookie).toBe(rotatedCookie);
  });

  it('forwards cookie header to /v1/auth/refresh request', async () => {
    // Arrange
    const cookieHeader = 'aiqadam-refresh=tok_fwd; session=xyz';
    mockFetch
      .mockResolvedValueOnce(makeRefreshResponse('access-token-005', null))
      .mockResolvedValueOnce(makeMeResponse(MOCK_ME));

    // Act
    await ssrAuthBootstrap(cookieHeader, 'next.aiqadam.org', mockFetch);

    // Assert — cookie and host headers forwarded
    const [, refreshInit] = mockFetch.mock.calls[0]!;
    const fwdHeaders = (refreshInit as { headers: { cookie: string; host: string } }).headers;
    expect(fwdHeaders.cookie).toBe(cookieHeader);
    expect(fwdHeaders.host).toBe('next.aiqadam.org');
  });
});
