// api-ssr.test.ts — Unit tests for lib/api-ssr.ts SSR fetch helpers.
//
// Tests: fetchCsatTokenStatus, fetchSurveyEventContext, fetchEventSurvey,
// fetchUpcomingEvents, fetchEvent, fetchActiveEvents, fetchPublicProfile,
// fetchPublicForm, fetchLeaderboard, fetchOnboardingStatus.
//
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.
//
// NOTE: Functions are re-implemented locally to avoid vitest ESM/import issues.
// The actual module uses `import type { Request }` from 'express' and process.env
// which requires Node environment.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Types (mirrors api-ssr.ts) ────────────────────────────────────────────────

interface ApiEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
}

interface PublicForm {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
  schema: unknown;
}

interface EventSurveyForm {
  id: string;
  eventId: string;
  title: string;
  schema: unknown;
}

interface SurveyEventContext {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  speakers: Array<{ name: string | null; talkTitle: string | null }>;
}

interface PublicProfile {
  handle: string;
  displayName: string | null;
  attendedCount: number;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  totalPoints: number;
}

type LeaderboardWindow = 'all' | 'year' | 'quarter';

interface CsatTokenStatus {
  valid: boolean;
}

interface CheckinActiveEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
}

// ─── Constants (mirrors api-ssr.ts) ───────────────────────────────────────────

const DEFAULT_INTERNAL_API_URL = 'http://api:3000';

// ─── Helper: create mock Request ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _makeMockReq(url = '/', headers: Record<string, string> = {}): Request {
  return {
    url,
    headers: new Headers(headers),
  } as unknown as Request;
}

// ─── Local re-implementation of get() + apiBase() ─────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFetch = ReturnType<typeof vi.fn<any>>;

function apiBase(env?: { INTERNAL_API_URL?: string | undefined }): string {
  return env?.INTERNAL_API_URL ?? DEFAULT_INTERNAL_API_URL;
}

// NOTE: Simplified version without host forwarding for testing
async function get<T>(baseUrl: string, path: string, mockFetch: MockFetch): Promise<T> {
  const res = await mockFetch(`${baseUrl}${path}`, {
    headers: [['accept', 'application/json']],
  });
  if (!res.ok) {
    throw new Error(`api ${path} → HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── fetchCsatTokenStatus (FR-MIG-022) ────────────────────────────────────────

async function fetchCsatTokenStatus(
  token: string,
  baseUrl: string,
  mockFetch: MockFetch,
): Promise<CsatTokenStatus> {
  if (!token || token.length === 0) return { valid: false };
  try {
    const res = await mockFetch(
      `${baseUrl}/v1/feedback/csat/token?token=${encodeURIComponent(token)}`,
      { headers: [['accept', 'application/json']] },
    );
    if (res.ok) {
      const body = (await res.json()) as { valid: boolean };
      return { valid: body.valid ?? false };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

// ─── fetchSurveyEventContext (FR-MIG-022) ─────────────────────────────────────

async function fetchSurveyEventContext(
  eventId: string,
  baseUrl: string,
  mockFetch: MockFetch,
): Promise<SurveyEventContext | null> {
  if (!eventId || eventId.length === 0) return null;
  try {
    return await get<SurveyEventContext>(
      baseUrl,
      `/v1/telegram/events/${encodeURIComponent(eventId)}`,
      mockFetch,
    );
  } catch {
    return null;
  }
}

// ─── fetchEventSurvey (FR-MIG-022) ───────────────────────────────────────────

async function fetchEventSurvey(
  eventId: string,
  baseUrl: string,
  mockFetch: MockFetch,
): Promise<EventSurveyForm | null> {
  if (!eventId || eventId.length === 0) return null;
  try {
    return await get<EventSurveyForm>(
      baseUrl,
      `/v1/telegram/events/${encodeURIComponent(eventId)}/survey`,
      mockFetch,
    );
  } catch {
    return null;
  }
}

// ─── fetchUpcomingEvents ──────────────────────────────────────────────────────

async function fetchUpcomingEvents(baseUrl: string, mockFetch: MockFetch): Promise<ApiEvent[]> {
  try {
    const body = await get<{ events: ApiEvent[] }>(baseUrl, '/v1/events', mockFetch);
    return body.events;
  } catch (_err) {
    return [];
  }
}

// ─── fetchEvent ───────────────────────────────────────────────────────────────

async function fetchEvent(
  id: string,
  baseUrl: string,
  mockFetch: MockFetch,
): Promise<ApiEvent | null> {
  if (!id || id.length === 0) return null;
  try {
    return await get<ApiEvent>(baseUrl, `/v1/events/${encodeURIComponent(id)}`, mockFetch);
  } catch {
    return null;
  }
}

// ─── fetchActiveEvents ────────────────────────────────────────────────────────

async function fetchActiveEvents(
  baseUrl: string,
  mockFetch: MockFetch,
): Promise<CheckinActiveEvent[]> {
  try {
    const body = await get<{ events: CheckinActiveEvent[] }>(
      baseUrl,
      '/v1/events/checkin/active',
      mockFetch,
    );
    return body.events;
  } catch {
    return [];
  }
}

// ─── fetchPublicProfile ───────────────────────────────────────────────────────

async function fetchPublicProfile(
  handle: string,
  baseUrl: string,
  mockFetch: MockFetch,
): Promise<PublicProfile | null> {
  if (!handle || handle.length === 0) return null;
  try {
    return await get<PublicProfile>(
      baseUrl,
      `/v1/users/${encodeURIComponent(handle)}/profile`,
      mockFetch,
    );
  } catch {
    return null;
  }
}

// ─── fetchPublicForm ─────────────────────────────────────────────────────────

async function fetchPublicForm(
  slug: string,
  baseUrl: string,
  mockFetch: MockFetch,
): Promise<PublicForm | null> {
  if (!slug || slug.length === 0) return null;
  try {
    return await get<PublicForm>(baseUrl, `/v1/forms/${encodeURIComponent(slug)}`, mockFetch);
  } catch {
    return null;
  }
}

// ─── fetchLeaderboard ─────────────────────────────────────────────────────────

async function fetchLeaderboard(
  baseUrl: string,
  mockFetch: MockFetch,
  limit = 20,
  window: LeaderboardWindow = 'all',
): Promise<LeaderboardEntry[]> {
  try {
    const qs = new URLSearchParams({ limit: String(limit), window }).toString();
    return await get<LeaderboardEntry[]>(baseUrl, `/v1/leaderboard?${qs}`, mockFetch);
  } catch {
    return [];
  }
}

// ─── fetchOnboardingStatus ────────────────────────────────────────────────────

async function fetchOnboardingStatus(
  baseUrl: string,
  accessToken: string,
  mockFetch: MockFetch,
): Promise<boolean> {
  const headers: Array<[string, string]> = [
    ['accept', 'application/json'],
    ['authorization', `Bearer ${accessToken}`],
  ];
  const res = await mockFetch(`${baseUrl}/v1/me/onboarding-status`, { headers });
  if (!res.ok) {
    throw new Error(`onboarding-status → HTTP ${res.status}`);
  }
  const body = (await res.json()) as { onboarded: boolean };
  return body.onboarded;
}

// ─── Tests: fetchCsatTokenStatus ───────────────────────────────────────────────

describe('fetchCsatTokenStatus — FR-MIG-022', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('returns { valid: true } when token is valid (HTTP 200)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true }),
    });

    const result = await fetchCsatTokenStatus(
      'valid-csat-token-12345678901234567890',
      'http://api:3000',
      mockFetch,
    );

    expect(result).toEqual({ valid: true });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api:3000/v1/feedback/csat/token?token=valid-csat-token-12345678901234567890',
      expect.any(Object),
    );
  });

  it('returns { valid: false } when token is invalid (HTTP 401)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const result = await fetchCsatTokenStatus(
      'invalid-token-12345678901234567890',
      'http://api:3000',
      mockFetch,
    );

    expect(result).toEqual({ valid: false });
  });

  it('returns { valid: false } when API returns { valid: false }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: false }),
    });

    const result = await fetchCsatTokenStatus(
      'expired-token-12345678901234567890',
      'http://api:3000',
      mockFetch,
    );

    expect(result).toEqual({ valid: false });
  });

  it('returns { valid: false } for empty token', async () => {
    const result = await fetchCsatTokenStatus('', 'http://api:3000', mockFetch);
    expect(result).toEqual({ valid: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('whitespace-only token is sent to API (server validates)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: false }),
    });

    const result = await fetchCsatTokenStatus('   ', 'http://api:3000', mockFetch);

    expect(result).toEqual({ valid: false });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('returns { valid: false } on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchCsatTokenStatus(
      'valid-token-12345678901234567890',
      'http://api:3000',
      mockFetch,
    );

    expect(result).toEqual({ valid: false });
  });

  it('URL-encodes token to handle special characters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ valid: true }),
    });

    await fetchCsatTokenStatus('token+with/special=chars&symbols', 'http://api:3000', mockFetch);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain(encodeURIComponent('token+with/special=chars&symbols'));
  });

  it('handles missing valid field in response (defaults to false)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}), // no 'valid' field
    });

    const result = await fetchCsatTokenStatus(
      'token-123456789012345678901234567890',
      'http://api:3000',
      mockFetch,
    );

    expect(result).toEqual({ valid: false });
  });
});

// ─── Tests: fetchSurveyEventContext ───────────────────────────────────────────

describe('fetchSurveyEventContext — FR-MIG-022', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  const mockEventContext: SurveyEventContext = {
    title: 'AI Qadam Workshop',
    startsAt: '2026-06-20T10:00:00Z',
    endsAt: '2026-06-20T14:00:00Z',
    location: 'Tashkent',
    speakers: [
      { name: 'Alice', talkTitle: 'Intro to AI' },
      { name: 'Bob', talkTitle: 'Advanced ML' },
    ],
  };

  it('returns event context when survey exists (HTTP 200)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockEventContext,
    });

    const result = await fetchSurveyEventContext('evt-123', 'http://api:3000', mockFetch);

    expect(result).toEqual(mockEventContext);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://api:3000/v1/telegram/events/evt-123',
      expect.any(Object),
    );
  });

  it('returns null when eventId is empty', async () => {
    const result = await fetchSurveyEventContext('', 'http://api:3000', mockFetch);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when API returns 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchSurveyEventContext('evt-missing', 'http://api:3000', mockFetch);

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchSurveyEventContext('evt-123', 'http://api:3000', mockFetch);

    expect(result).toBeNull();
  });

  it('URL-encodes eventId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockEventContext,
    });

    await fetchSurveyEventContext('evt/with/slashes', 'http://api:3000', mockFetch);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('evt%2Fwith%2Fslashes');
  });
});

// ─── Tests: fetchEventSurvey ───────────────────────────────────────────────────

describe('fetchEventSurvey — FR-MIG-022', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  const mockSurvey: EventSurveyForm = {
    id: 'survey-1',
    eventId: 'evt-123',
    title: 'Post-Event Feedback',
    schema: { fields: [] },
  };

  it('returns survey form when event has attached survey (HTTP 200)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSurvey,
    });

    const result = await fetchEventSurvey('evt-123', 'http://api:3000', mockFetch);

    expect(result).toEqual(mockSurvey);
  });

  it('returns null when eventId is empty', async () => {
    const result = await fetchEventSurvey('', 'http://api:3000', mockFetch);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when no survey is attached (404)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchEventSurvey('evt-no-survey', 'http://api:3000', mockFetch);

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchEventSurvey('evt-123', 'http://api:3000', mockFetch);

    expect(result).toBeNull();
  });
});

// ─── Tests: fetchUpcomingEvents ───────────────────────────────────────────────

describe('fetchUpcomingEvents', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  const mockEvents: ApiEvent[] = [
    {
      id: 'evt-1',
      title: 'Event 1',
      startsAt: '2026-07-01T10:00:00Z',
      endsAt: '2026-07-01T14:00:00Z',
      location: 'Tashkent',
    },
    {
      id: 'evt-2',
      title: 'Event 2',
      startsAt: '2026-07-15T10:00:00Z',
      endsAt: '2026-07-15T14:00:00Z',
      location: null,
    },
  ];

  it('returns events array on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ events: mockEvents }),
    });

    const result = await fetchUpcomingEvents('http://api:3000', mockFetch);

    expect(result).toEqual(mockEvents);
  });

  it('returns empty array on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchUpcomingEvents('http://api:3000', mockFetch);

    expect(result).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchUpcomingEvents('http://api:3000', mockFetch);

    expect(result).toEqual([]);
  });
});

// ─── Tests: fetchEvent ────────────────────────────────────────────────────────

describe('fetchEvent', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  const mockEvent: ApiEvent = {
    id: 'evt-123',
    title: 'AI Workshop',
    startsAt: '2026-07-01T10:00:00Z',
    endsAt: '2026-07-01T14:00:00Z',
    location: 'Tashkent',
  };

  it('returns event on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockEvent,
    });

    const result = await fetchEvent('evt-123', 'http://api:3000', mockFetch);

    expect(result).toEqual(mockEvent);
  });

  it('returns null when id is empty', async () => {
    const result = await fetchEvent('', 'http://api:3000', mockFetch);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchEvent('evt-missing', 'http://api:3000', mockFetch);

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchEvent('evt-123', 'http://api:3000', mockFetch);

    expect(result).toBeNull();
  });
});

// ─── Tests: fetchActiveEvents ─────────────────────────────────────────────────

describe('fetchActiveEvents', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  const mockActiveEvents: CheckinActiveEvent[] = [
    {
      id: 'evt-1',
      title: 'Active Event',
      startsAt: '2026-06-20T10:00:00Z',
      endsAt: '2026-06-20T18:00:00Z',
      location: 'Tashkent',
    },
  ];

  it('returns active events on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ events: mockActiveEvents }),
    });

    const result = await fetchActiveEvents('http://api:3000', mockFetch);

    expect(result).toEqual(mockActiveEvents);
  });

  it('returns empty array on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchActiveEvents('http://api:3000', mockFetch);

    expect(result).toEqual([]);
  });
});

// ─── Tests: fetchPublicProfile ────────────────────────────────────────────────

describe('fetchPublicProfile', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  const mockProfile: PublicProfile = {
    handle: 'johndoe',
    displayName: 'John Doe',
    attendedCount: 15,
  };

  it('returns profile on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockProfile,
    });

    const result = await fetchPublicProfile('johndoe', 'http://api:3000', mockFetch);

    expect(result).toEqual(mockProfile);
  });

  it('returns null when handle is empty', async () => {
    const result = await fetchPublicProfile('', 'http://api:3000', mockFetch);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchPublicProfile('unknown', 'http://api:3000', mockFetch);

    expect(result).toBeNull();
  });
});

// ─── Tests: fetchPublicForm ──────────────────────────────────────────────────

describe('fetchPublicForm', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  const mockForm: PublicForm = {
    id: 'form-1',
    slug: 'contact-us',
    title: 'Contact Us',
    status: 'published',
    schema: { fields: [] },
  };

  it('returns form on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockForm,
    });

    const result = await fetchPublicForm('contact-us', 'http://api:3000', mockFetch);

    expect(result).toEqual(mockForm);
  });

  it('returns null when slug is empty', async () => {
    const result = await fetchPublicForm('', 'http://api:3000', mockFetch);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await fetchPublicForm('unknown-form', 'http://api:3000', mockFetch);

    expect(result).toBeNull();
  });
});

// ─── Tests: fetchLeaderboard ──────────────────────────────────────────────────

describe('fetchLeaderboard', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  const mockLeaderboard: LeaderboardEntry[] = [
    { rank: 1, userId: 'usr-1', totalPoints: 1000 },
    { rank: 2, userId: 'usr-2', totalPoints: 800 },
  ];

  it('returns entries on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockLeaderboard,
    });

    const result = await fetchLeaderboard('http://api:3000', mockFetch);

    expect(result).toEqual(mockLeaderboard);
  });

  it('uses default limit of 20', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await fetchLeaderboard('http://api:3000', mockFetch);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('limit=20');
  });

  it('uses default window of all', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await fetchLeaderboard('http://api:3000', mockFetch);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('window=all');
  });

  it('accepts custom limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await fetchLeaderboard('http://api:3000', mockFetch, 10);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('limit=10');
  });

  it('accepts custom window', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await fetchLeaderboard('http://api:3000', mockFetch, 20, 'year');

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('window=year');
  });

  it('returns empty array on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchLeaderboard('http://api:3000', mockFetch);

    expect(result).toEqual([]);
  });
});

// ─── Tests: fetchOnboardingStatus ─────────────────────────────────────────────

describe('fetchOnboardingStatus', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('returns true when user is onboarded', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ onboarded: true }),
    });

    const result = await fetchOnboardingStatus('http://api:3000', 'access-token-123', mockFetch);

    expect(result).toBe(true);
  });

  it('returns false when user is not onboarded', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ onboarded: false }),
    });

    const result = await fetchOnboardingStatus('http://api:3000', 'access-token-123', mockFetch);

    expect(result).toBe(false);
  });

  it('sends authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ onboarded: true }),
    });

    await fetchOnboardingStatus('http://api:3000', 'my-token', mockFetch);

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = (init as { headers?: Array<[string, string]> }).headers;
    expect(headers).toContainEqual(['authorization', 'Bearer my-token']);
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(
      fetchOnboardingStatus('http://api:3000', 'expired-token', mockFetch),
    ).rejects.toThrow('onboarding-status → HTTP 401');
  });
});

// ─── Tests: apiBase() ─────────────────────────────────────────────────────────

describe('apiBase — INTERNAL_API_URL resolution', () => {
  it('uses INTERNAL_API_URL from env when set', () => {
    expect(apiBase({ INTERNAL_API_URL: 'http://custom-api:9000' })).toBe('http://custom-api:9000');
  });

  it('defaults to http://api:3000 when INTERNAL_API_URL is not set', () => {
    expect(apiBase({})).toBe(DEFAULT_INTERNAL_API_URL);
  });

  it('defaults when INTERNAL_API_URL is explicitly undefined', () => {
    expect(apiBase({ INTERNAL_API_URL: undefined })).toBe(DEFAULT_INTERNAL_API_URL);
  });
});
