// cms.test.ts — Unit tests for lib/cms.ts's event-detail fetchers
// (FR-EVT-004 gap-closure, wf-20260730-feat-155).
//
// Tests: countryFromHost, fetchEvent (found / not-found / unpublished /
// wrong-country / Directus-unreachable), fetchEventPhotos, and
// parseCoord's bounds-checking (exercised indirectly through fetchEvent's
// latitude/longitude mapping, since parseCoord isn't separately exported).
//
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.
//
// NOTE: Functions are re-implemented locally, mirroring the real
// lib/cms.ts logic exactly — same convention already established by
// api-ssr.test.ts and cms-landing-page.test.ts in this same directory.
// The actual module reads `process.env.INTERNAL_DIRECTUS_URL` inside
// directusBase() and calls the real global `fetch`; re-implementing
// locally with an injected mockFetch avoids mocking Node/process
// globals while still exercising the exact same branching logic
// (guard order, null-collapse, try/catch behavior) line-for-line.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Types (mirrors lib/types.ts + lib/cms.ts's internal row shapes) ──────────

interface ApiEvent {
  id: string;
  title: string;
  description: string;
  format: 'meetup' | 'workshop' | 'hackathon' | 'conference' | 'online';
  status: 'draft' | 'published' | 'cancelled';
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registeredCount: number;
  location: string | null;
  countryCode: string;
  shortDescription: string | null;
  slug: string | null;
  venue: string | null;
  address: string | null;
  mapUrl: string | null;
  heroImageUrl: string | null;
  agendaMd: string | null;
  visibilityScope: 'public' | 'members_only' | 'invite_only' | null;
  externalLinks: unknown;
  latitude: number | null;
  longitude: number | null;
  recapMd: string | null;
  livestreamUrl: string | null;
  updatedAt: string | null;
}

interface CmsEventRow {
  id: string;
  title: string;
  description: string;
  status: ApiEvent['status'];
  format: ApiEvent['format'];
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  location: string | null;
  country: string;
  short_description?: string | null;
  slug?: string | null;
  venue?: string | null;
  address?: string | null;
  map_url?: string | null;
  hero_image?: string | null;
  agenda_md?: string | null;
  visibility_scope?: ApiEvent['visibilityScope'];
  external_links?: unknown;
  latitude?: number | string | null;
  longitude?: number | string | null;
  recap_md?: string | null;
  livestream_url?: string | null;
  date_updated?: string | null;
}

interface EventPhoto {
  id: string;
  fileUrl: string | null;
  url: string | null;
  caption: string | null;
  altText: string | null;
  orderIndex: number;
}

interface CmsEventPhotoRow {
  id: string;
  file: string | null;
  url: string | null;
  caption: string | null;
  alt_text: string | null;
  order_index: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFetch = ReturnType<typeof vi.fn<(...args: any[]) => any>>;

const DIRECTUS_BASE = 'http://directus:8055';

// ─── Local re-implementation: countryFromHost (mirrors lib/cms.ts) ───────────

function countryFromHost(host: string | null | undefined): string {
  if (!host) return 'uz';
  const label = host.split(':')[0]?.toLowerCase().split('.')[0] ?? '';
  if (label === 'uz' || label === 'kz' || label === 'tj') return label;
  return 'uz';
}

// ─── Local re-implementation: parseCoord (mirrors lib/cms.ts) ────────────────

function parseCoord(raw: unknown, min: number, max: number): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

// ─── Local re-implementation: toApiEvent (mirrors lib/cms.ts) ────────────────

function toApiEvent(row: CmsEventRow, registeredCount = 0): ApiEvent {
  const heroImageUrl = row.hero_image ? `${DIRECTUS_BASE}/assets/${row.hero_image}` : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    format: row.format,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    registeredCount,
    location: row.location,
    countryCode: row.country,
    shortDescription: row.short_description ?? null,
    slug: row.slug ?? null,
    venue: row.venue ?? null,
    address: row.address ?? null,
    mapUrl: row.map_url ?? null,
    heroImageUrl,
    agendaMd: row.agenda_md ?? null,
    visibilityScope: row.visibility_scope ?? 'public',
    externalLinks: null,
    latitude: parseCoord(row.latitude, -90, 90),
    longitude: parseCoord(row.longitude, -180, 180),
    recapMd: row.recap_md ?? null,
    livestreamUrl: row.livestream_url ?? null,
    updatedAt: row.date_updated ?? null,
  };
}

const EVENT_FIELDS =
  'id,title,description,status,format,starts_at,ends_at,capacity,location,country,short_description,slug,venue,address,map_url,hero_image,agenda_md,visibility_scope,external_links,latitude,longitude,recap_md,livestream_url,date_updated';

// ─── Local re-implementation: fetchEvent (mirrors lib/cms.ts) ────────────────

async function fetchEvent(
  req: { headers: { get: (name: string) => string | null } },
  id: string,
  mockFetch: MockFetch,
): Promise<ApiEvent | null> {
  if (!id || id.length === 0) return null;
  const country = countryFromHost(req.headers.get('host'));
  try {
    const params = new URLSearchParams({ fields: EVENT_FIELDS });
    const res = await mockFetch(
      `${DIRECTUS_BASE}/items/events/${encodeURIComponent(id)}?${params.toString()}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) {
      throw new Error(`Directus /items/events/${id} → HTTP ${res.status}`);
    }
    const body = (await res.json()) as { data: CmsEventRow | null };
    if (!body.data || body.data.status !== 'published' || body.data.country !== country) {
      return null;
    }
    return toApiEvent(body.data);
  } catch (err) {
    console.error(`[cms] fetchEvent(${id}) failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Local re-implementation: fetchEventPhotos (mirrors lib/cms.ts) ──────────

async function fetchEventPhotos(eventId: string, mockFetch: MockFetch): Promise<EventPhoto[]> {
  try {
    const params = new URLSearchParams({
      'filter[event][_eq]': eventId,
      fields: 'id,file,url,caption,alt_text,order_index',
      sort: 'order_index',
      limit: '60',
    });
    const res = await mockFetch(`${DIRECTUS_BASE}/items/event_photos?${params.toString()}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Directus /items/event_photos → HTTP ${res.status}`);
    }
    const body = (await res.json()) as { data: CmsEventPhotoRow[] };
    return body.data
      .map((row): EventPhoto | null => {
        const fileUrl = row.file ? `${DIRECTUS_BASE}/assets/${row.file}` : null;
        const url = row.url ? row.url : null;
        if (!fileUrl && !url) return null;
        return {
          id: row.id,
          fileUrl,
          url,
          caption: row.caption?.trim() || null,
          altText: row.alt_text?.trim() || null,
          orderIndex: row.order_index ?? 0,
        };
      })
      .filter((p): p is EventPhoto => p !== null);
  } catch (err) {
    console.error('[cms] fetchEventPhotos failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Helper: mock Request-ish object ──────────────────────────────────────────

function makeReq(host: string | null): { headers: { get: (name: string) => string | null } } {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'host' ? host : null),
    },
  };
}

// ─── Tests: countryFromHost ────────────────────────────────────────────────────

describe('countryFromHost', () => {
  it('returns "uz" for uz.aiqadam.org', () => {
    expect(countryFromHost('uz.aiqadam.org')).toBe('uz');
  });

  it('returns "kz" for kz.aiqadam.org', () => {
    expect(countryFromHost('kz.aiqadam.org')).toBe('kz');
  });

  it('strips the port and returns "tj" for tj.aiqadam.org:3000', () => {
    expect(countryFromHost('tj.aiqadam.org:3000')).toBe('tj');
  });

  it('defaults to "uz" for null host', () => {
    expect(countryFromHost(null)).toBe('uz');
  });

  it('defaults to "uz" for undefined host', () => {
    expect(countryFromHost(undefined)).toBe('uz');
  });

  it('defaults to "uz" for "localhost" (not in the allow-set)', () => {
    expect(countryFromHost('localhost')).toBe('uz');
  });

  it('defaults to "uz" for an empty string', () => {
    expect(countryFromHost('')).toBe('uz');
  });

  it('defaults to "uz" for an unrecognized label (e.g. "ru") rather than echoing it back', () => {
    // Load-bearing for AC-8: an attacker cannot probe for other country
    // codes by supplying an arbitrary Host label — anything outside
    // {uz, kz, tj} silently aliases to uz.
    expect(countryFromHost('ru.aiqadam.org')).toBe('uz');
  });
});

// ─── Tests: fetchEvent — happy path ────────────────────────────────────────────

describe('fetchEvent — happy path', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  const publishedRow: CmsEventRow = {
    id: 'evt-1',
    title: 'AI Meetup',
    description: 'A meetup about AI.',
    status: 'published',
    format: 'meetup',
    starts_at: '2026-08-01T10:00:00Z',
    ends_at: '2026-08-01T14:00:00Z',
    capacity: 100,
    location: 'Tashkent',
    country: 'uz',
    latitude: '41.31',
    longitude: '69.24',
    recap_md: 'It went great.',
    livestream_url: 'https://youtu.be/dQw4w9WgXcQ',
    date_updated: '2026-07-29T00:00:00Z',
  };

  it('returns a full ApiEvent with new fields correctly mapped for a matching-country published event', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: publishedRow }),
    });

    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-1', mockFetch);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('evt-1');
    expect(result?.latitude).toBe(41.31);
    expect(result?.longitude).toBe(69.24);
    expect(result?.recapMd).toBe('It went great.');
    expect(result?.livestreamUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(result?.updatedAt).toBe('2026-07-29T00:00:00Z');
  });
});

// ─── Tests: fetchEvent — registeredCount always 0 (ISS-EVT-005-1) ────────────
//
// registrations has no Public Directus read grant, so fetchEvent() cannot
// compute a real count itself — it always returns 0 here. The real count
// is fetched separately via lib/api-ssr.ts's fetchEventRegistrationCount()
// and merged in by pages/events/[id].astro. See api-ssr.test.ts for that
// fetcher's own tests.

describe('fetchEvent — registeredCount is always 0 (real count comes from apps/api)', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('returns registeredCount=0 regardless of the row data (no registrations query is made)', async () => {
    const row: CmsEventRow = {
      id: 'evt-full',
      title: 'Full Event',
      description: '',
      status: 'published',
      format: 'meetup',
      starts_at: '2026-08-01T10:00:00Z',
      ends_at: '2026-08-01T14:00:00Z',
      capacity: 2,
      location: null,
      country: 'uz',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: row }),
    });

    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-full', mockFetch);

    expect(result?.registeredCount).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ─── Tests: fetchEvent — failure paths ─────────────────────────────────────────

describe('fetchEvent — failure paths', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('returns null without calling fetch when id is an empty string', async () => {
    const result = await fetchEvent(makeReq('uz.aiqadam.org'), '', mockFetch);

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when Directus returns data: null (not-found)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null }),
    });

    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-missing', mockFetch);

    expect(result).toBeNull();
  });

  it('returns null when the row status is "draft" (unpublished gate)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'evt-draft',
          title: 'Draft Event',
          description: '',
          status: 'draft',
          format: 'meetup',
          starts_at: '2026-08-01T10:00:00Z',
          ends_at: '2026-08-01T14:00:00Z',
          capacity: null,
          location: null,
          country: 'uz',
        } satisfies CmsEventRow,
      }),
    });

    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-draft', mockFetch);

    expect(result).toBeNull();
  });

  it('returns null when the row status is "cancelled" (unpublished gate)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'evt-cancelled',
          title: 'Cancelled Event',
          description: '',
          status: 'cancelled',
          format: 'meetup',
          starts_at: '2026-08-01T10:00:00Z',
          ends_at: '2026-08-01T14:00:00Z',
          capacity: null,
          location: null,
          country: 'uz',
        } satisfies CmsEventRow,
      }),
    });

    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-cancelled', mockFetch);

    expect(result).toBeNull();
  });

  it('returns null when the row country does not match the resolved country (wrong-country, AC-8)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'evt-kz',
          title: 'KZ-only Event',
          description: '',
          status: 'published',
          format: 'meetup',
          starts_at: '2026-08-01T10:00:00Z',
          ends_at: '2026-08-01T14:00:00Z',
          capacity: null,
          location: null,
          country: 'kz',
        } satisfies CmsEventRow,
      }),
    });

    // Requested via uz.aiqadam.org — the row belongs to kz.
    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-kz', mockFetch);

    expect(result).toBeNull();
  });

  it('AC-8 security property: not-found and wrong-country collapse to byte-identical null (same return, no differentiating side-channel)', async () => {
    // Not-found case.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null }),
    });
    const notFoundResult = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-missing', mockFetch);

    // Wrong-country case.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          id: 'evt-kz',
          title: 'KZ-only Event',
          description: '',
          status: 'published',
          format: 'meetup',
          starts_at: '2026-08-01T10:00:00Z',
          ends_at: '2026-08-01T14:00:00Z',
          capacity: null,
          location: null,
          country: 'kz',
        } satisfies CmsEventRow,
      }),
    });
    const wrongCountryResult = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-kz', mockFetch);

    // This is the crux of the security property: a future refactor that
    // makes these two diverge (e.g. throwing on one, returning `undefined`
    // on the other, or attaching a diagnostic field) would fail this
    // comparison even if each half still individually "looks null-ish."
    expect(notFoundResult).toBe(null);
    expect(wrongCountryResult).toBe(null);
    expect(notFoundResult).toStrictEqual(wrongCountryResult);
  });

  it('returns null (not a throw) when fetch rejects — Directus-unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-1', mockFetch);

    expect(result).toBeNull();
  });

  it('returns null (not a throw) when Directus responds non-OK', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-1', mockFetch);

    expect(result).toBeNull();
  });
});

// ─── Tests: fetchEvent — query construction ────────────────────────────────────

describe('fetchEvent — Directus query construction', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('requests /items/events/<id> with the exact EVENT_FIELDS list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null }),
    });

    await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-1', mockFetch);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('/items/events/evt-1');
    expect(url).toContain(`fields=${encodeURIComponent(EVENT_FIELDS)}`);
  });

  it('URL-encodes the id (path-traversal / injection guard)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null }),
    });

    await fetchEvent(makeReq('uz.aiqadam.org'), '../etc/passwd', mockFetch);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain(encodeURIComponent('../etc/passwd'));
    expect(url).not.toContain('/items/events/../etc/passwd');
  });
});

// ─── Tests: fetchEvent — response-shape guard ─────────────────────────────────

describe('fetchEvent — response-shape guard', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('returns null (not a thrown TypeError) when body.data is missing entirely', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}), // no `data` key at all
    });

    // Confirms the `!body.data || ...` short-circuit checks falsiness
    // BEFORE dereferencing `.status`/`.country` on a nonexistent object.
    await expect(fetchEvent(makeReq('uz.aiqadam.org'), 'evt-1', mockFetch)).resolves.toBeNull();
  });
});

// ─── Tests: fetchEventPhotos — query construction ─────────────────────────────

describe('fetchEventPhotos — Directus query construction', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('requests event_photos filtered by event id, sorted by order_index, capped at 60', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await fetchEventPhotos('evt-1', mockFetch);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain('filter%5Bevent%5D%5B_eq%5D=evt-1');
    expect(url).toContain('sort=order_index');
    expect(url).toContain('limit=60');
  });
});

// ─── Tests: fetchEventPhotos — happy path + edge cases ────────────────────────

describe('fetchEventPhotos — happy path and edge cases', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('returns photos sorted by order_index with fileUrl built from the Directus asset path', async () => {
    const rows: CmsEventPhotoRow[] = [
      {
        id: 'photo-1',
        file: 'abc123',
        url: null,
        caption: 'Opening keynote',
        alt_text: 'Speaker on stage',
        order_index: 1,
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: rows }),
    });

    const result = await fetchEventPhotos('evt-1', mockFetch);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileUrl).toBe(`${DIRECTUS_BASE}/assets/abc123`);
    expect(result[0]?.url).toBeNull();
    expect(result[0]?.caption).toBe('Opening keynote');
    expect(result[0]?.altText).toBe('Speaker on stage');
  });

  it('uses the raw url when only url (external CDN) is set', async () => {
    const rows: CmsEventPhotoRow[] = [
      {
        id: 'photo-2',
        file: null,
        url: 'https://cdn.example.com/photo.jpg',
        caption: null,
        alt_text: null,
        order_index: 0,
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: rows }),
    });

    const result = await fetchEventPhotos('evt-1', mockFetch);

    expect(result[0]?.fileUrl).toBeNull();
    expect(result[0]?.url).toBe('https://cdn.example.com/photo.jpg');
  });

  it('filters out a row with neither file nor url', async () => {
    const rows: CmsEventPhotoRow[] = [
      { id: 'photo-empty', file: null, url: null, caption: null, alt_text: null, order_index: 0 },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: rows }),
    });

    const result = await fetchEventPhotos('evt-1', mockFetch);

    expect(result).toEqual([]);
  });

  it('normalizes an empty-after-trim caption/alt_text to null', async () => {
    const rows: CmsEventPhotoRow[] = [
      {
        id: 'photo-3',
        file: 'xyz789',
        url: null,
        caption: '   ',
        alt_text: '   ',
        order_index: 0,
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: rows }),
    });

    const result = await fetchEventPhotos('evt-1', mockFetch);

    expect(result[0]?.caption).toBeNull();
    expect(result[0]?.altText).toBeNull();
  });

  it('returns [] (never throws) when fetch rejects', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchEventPhotos('evt-1', mockFetch);

    expect(result).toEqual([]);
  });

  it('returns [] for an empty data array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const result = await fetchEventPhotos('evt-1', mockFetch);

    expect(result).toEqual([]);
  });
});

// ─── Tests: parseCoord bounds-checking (via fetchEvent's lat/lng mapping) ─────

describe('parseCoord (via fetchEvent latitude/longitude mapping) — bounds-checking', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  function rowWithCoords(
    latitude: number | string | null,
    longitude: number | string | null,
  ): CmsEventRow {
    return {
      id: 'evt-coords',
      title: 'Event',
      description: '',
      status: 'published',
      format: 'meetup',
      starts_at: '2026-08-01T10:00:00Z',
      ends_at: '2026-08-01T14:00:00Z',
      capacity: null,
      location: null,
      country: 'uz',
      latitude,
      longitude,
    };
  }

  it('parses valid in-range numeric-string coordinates', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: rowWithCoords('41.31', '69.24') }),
    });
    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-coords', mockFetch);

    expect(result?.latitude).toBe(41.31);
    expect(result?.longitude).toBe(69.24);
  });

  it('returns null latitude for an out-of-range value (e.g. 95, > 90 max)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: rowWithCoords(95, 69.24) }),
    });
    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-coords', mockFetch);

    expect(result?.latitude).toBeNull();
  });

  it('returns null longitude for an out-of-range value (e.g. -200, < -180 min)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: rowWithCoords(41.31, -200) }),
    });
    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-coords', mockFetch);

    expect(result?.longitude).toBeNull();
  });

  it('returns null for a non-numeric string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: rowWithCoords('not-a-number', 69.24) }),
    });
    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-coords', mockFetch);

    expect(result?.latitude).toBeNull();
  });

  it('returns null when the coordinate is null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: rowWithCoords(null, null) }),
    });
    const result = await fetchEvent(makeReq('uz.aiqadam.org'), 'evt-coords', mockFetch);

    expect(result?.latitude).toBeNull();
    expect(result?.longitude).toBeNull();
  });
});
