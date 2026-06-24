import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckinEventsController } from '../src/modules/registrations/checkin-events.controller';

// Decodes the URL and parses the filter JSON from the `?filter=` query param.
function parseFilter(url: string): Record<string, unknown> {
  const u = new URL(url.startsWith('http') ? url : `http://x${url}`);
  const filterStr = decodeURIComponent(u.searchParams.get('filter') ?? '{}');
  return JSON.parse(filterStr);
}

// Pattern: direct controller instantiation with a mock-like object.
// The controller only calls this.directus.get, so we match that interface.

const mockDirectus = {
  get: vi.fn<(url: string) => Promise<{ data: unknown }>>(),
};

const controller = new CheckinEventsController(mockDirectus as never);

// Freeze time so the time-window filter is deterministic.
const FIXED_NOW = '2026-06-20T12:00:00Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(FIXED_NOW));
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── fixtures ────────────────────────────────────────────────────────────────

const PUBLISHED_EVENTS = [
  {
    id: 'evt-uz-1',
    title: 'AI Qadam Meetup UZ',
    starts_at: '2026-06-20T10:00:00Z',
    ends_at: '2026-06-20T14:00:00Z',
    location: 'Tashkent',
  },
  {
    id: 'evt-uz-2',
    title: 'AI Qadam Workshop UZ',
    starts_at: '2026-06-20T15:00:00Z',
    ends_at: '2026-06-20T18:00:00Z',
    location: 'Samarkand',
  },
];

// ─── tests ───────────────────────────────────────────────────────────────────

describe('CheckinEventsController.activeEvents', () => {
  describe('happy path — events in country scope', () => {
    it('returns published events within the time window, scoped to UZ', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: PUBLISHED_EVENTS });

      const result = await controller.activeEvents(
        { country: 'uz' },
        { tenant: { code: 'uz' } } as never,
      );

      expect(result.events).toHaveLength(2);
      expect(result.events[0]?.id).toBe('evt-uz-1');
      expect(result.events[0]?.title).toBe('AI Qadam Meetup UZ');
    });

    it('does NOT apply country filter when country param is absent (empty query)', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: PUBLISHED_EVENTS });

      await controller.activeEvents({}, { tenant: { code: 'uz' } } as never);

      // When country is absent from query, country is undefined (falsy),
      // so no country filter is added to the query.
      expect(mockDirectus.get).toHaveBeenCalled();
      const filter = parseFilter(mockDirectus.get.mock.calls[0]?.[0] as string);
      const countryFilter = filter._and?.find((f: Record<string, unknown>) => 'country' in f);
      expect(countryFilter).toBeUndefined();
    });

    it('returns empty events array when no events are active', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: [] });

      const result = await controller.activeEvents(
        { country: 'uz' },
        {} as never,
      );

      expect(result.events).toEqual([]);
    });

    it('queries with country filter when country param is provided', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: [] });

      await controller.activeEvents({ country: 'uz' }, {} as never);

      const filter = parseFilter(mockDirectus.get.mock.calls[0]?.[0] as string);
      const countryFilter = filter._and?.find((f: Record<string, unknown>) => 'country' in f);
      expect(countryFilter).toMatchObject({ country: { _eq: 'uz' } });
    });
  });

  describe('country filter — query param overrides middleware', () => {
    it('uses explicit country param even when X-Tenant provides a different value', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: PUBLISHED_EVENTS });

      await controller.activeEvents(
        { country: 'uz' },
        { tenant: { code: 'kz' } } as never,
      );

      const filter = parseFilter(mockDirectus.get.mock.calls[0]?.[0] as string);
      // The explicit param must win over middleware.
      const countryFilter = filter._and?.find((f: Record<string, unknown>) => 'country' in f);
      expect(countryFilter).toMatchObject({ country: { _eq: 'uz' } });
    });
  });

  describe('time window filter', () => {
    it('requests events where starts_at <= now <= ends_at + 24h', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: [] });

      await controller.activeEvents({ country: 'uz' }, {} as never);

      const filter = parseFilter(mockDirectus.get.mock.calls[0]?.[0] as string);
      // Now is 2026-06-20T12:00:00Z; buffer is 24h so upper bound is 2026-06-21T12:00:00Z.
      // Fake timers produce milliseconds in ISO strings.
      const startsAtFilter = filter._and?.find((f: Record<string, unknown>) => 'starts_at' in f);
      const endsAtFilter = filter._and?.find((f: Record<string, unknown>) => 'ends_at' in f);
      expect((startsAtFilter as Record<string, Record<string, string>>).starts_at._lte).toMatch(/^2026-06-20T12:00:00/);
      expect((endsAtFilter as Record<string, Record<string, string>>).ends_at._gte).toMatch(/^2026-06-21T12:00:00/);
    });

    it('accepts custom buffer_hours param', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: [] });

      await controller.activeEvents({ country: 'uz', buffer_hours: 48 }, {} as never);

      const filter = parseFilter(mockDirectus.get.mock.calls[0]?.[0] as string);
      const endsAtFilter = filter._and?.find((f: Record<string, unknown>) => 'ends_at' in f);
      expect((endsAtFilter as Record<string, Record<string, string>>).ends_at._gte).toMatch(/^2026-06-22T12:00:00/);
    });

    it('ignores out-of-range buffer_hours without throwing', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: [] });

      // Zod schema clamps 0-168; pass 999 which is above the max.
      // @ts-expect-error — intentionally passing out-of-range number.
      await controller.activeEvents({ country: 'uz', buffer_hours: 999 }, {} as never);

      // Should not throw; directus.get should be called.
      expect(mockDirectus.get).toHaveBeenCalled();
    });
  });

  describe('parameter validation', () => {
    it('ignores invalid buffer_hours and falls back to default 24', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: [] });

      // @ts-expect-error — intentionally passing invalid type to test runtime validation.
      await controller.activeEvents({ country: 'uz', buffer_hours: 'abc' }, {} as never);

      const filter = parseFilter(mockDirectus.get.mock.calls[0]?.[0] as string);
      const endsAtFilter = filter._and?.find((f: Record<string, unknown>) => 'ends_at' in f);
      // Should default to 24h buffer.
      expect((endsAtFilter as Record<string, Record<string, string>>).ends_at._gte).toMatch(/^2026-06-21T12:00:00/);
    });

    it('ignores country when it is not exactly 2 characters', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: [] });

      // @ts-expect-error — intentionally passing invalid type to test runtime validation.
      await controller.activeEvents({ country: 'UZB' }, {} as never);

      const filter = parseFilter(mockDirectus.get.mock.calls[0]?.[0] as string);
      // country filter should not be in the query.
      const countryFilter = filter._and?.find((f: Record<string, unknown>) => 'country' in f);
      expect(countryFilter).toBeUndefined();
    });
  });

  describe('response shape', () => {
    it('maps snake_case Directus fields to camelCase', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: PUBLISHED_EVENTS });

      const result = await controller.activeEvents({ country: 'uz' }, {} as never);

      const evt = result.events[0];
      expect(evt).toHaveProperty('id');
      expect(evt).toHaveProperty('title');
      expect(evt).toHaveProperty('startsAt');
      expect(evt).toHaveProperty('endsAt');
      expect(evt).toHaveProperty('location');
      expect(evt).not.toHaveProperty('starts_at');
      expect(evt).not.toHaveProperty('ends_at');
    });

    it('sorts events by starts_at descending', async () => {
      mockDirectus.get.mockResolvedValueOnce({ data: PUBLISHED_EVENTS });

      await controller.activeEvents({ country: 'uz' }, {} as never);

      const call = mockDirectus.get.mock.calls[0]?.[0] as string;
      expect(call).toContain('sort=-starts_at');
    });
  });
});
