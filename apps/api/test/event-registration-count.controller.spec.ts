import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventRegistrationCountController } from '../src/modules/registrations/event-registration-count.controller';

// Decodes the URL and parses the filter JSON from the `?filter=` query param.
function parseFilter(url: string): Record<string, unknown> {
  const u = new URL(url.startsWith('http') ? url : `http://x${url}`);
  const filterStr = decodeURIComponent(u.searchParams.get('filter') ?? '{}');
  return JSON.parse(filterStr);
}

const mockDirectus = {
  get: vi.fn<(url: string) => Promise<{ data: unknown }>>(),
};

const controller = new EventRegistrationCountController(mockDirectus as never);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EventRegistrationCountController.registrationCount', () => {
  it('returns the aggregate count from Directus', async () => {
    mockDirectus.get.mockResolvedValueOnce({ data: [{ count: { id: 2 } }] });

    const result = await controller.registrationCount('evt-full');

    expect(result).toEqual({ registeredCount: 2 });
  });

  it('coerces a string count (Directus numeric shape) to a number', async () => {
    mockDirectus.get.mockResolvedValueOnce({ data: [{ count: { id: '5' } }] });

    const result = await controller.registrationCount('evt-open');

    expect(result).toEqual({ registeredCount: 5 });
  });

  it('returns 0 when the aggregate response has no rows', async () => {
    mockDirectus.get.mockResolvedValueOnce({ data: [] });

    const result = await controller.registrationCount('evt-empty');

    expect(result).toEqual({ registeredCount: 0 });
  });

  it('filters by event id and status IN (registered, attended)', async () => {
    mockDirectus.get.mockResolvedValueOnce({ data: [{ count: { id: 0 } }] });

    await controller.registrationCount('evt-123');

    const call = mockDirectus.get.mock.calls[0]?.[0] as string;
    expect(call).toContain('/items/registrations');
    expect(call).toContain('aggregate[count]=id');

    const filter = parseFilter(call);
    const eventFilter = (filter._and as Record<string, unknown>[]).find(
      (f) => 'event' in f,
    );
    const statusFilter = (filter._and as Record<string, unknown>[]).find(
      (f) => 'status' in f,
    );
    expect(eventFilter).toMatchObject({ event: { _eq: 'evt-123' } });
    expect(statusFilter).toMatchObject({ status: { _in: ['registered', 'attended'] } });
  });

  it('never includes waitlisted/cancelled in the status filter', async () => {
    mockDirectus.get.mockResolvedValueOnce({ data: [{ count: { id: 1 } }] });

    await controller.registrationCount('evt-456');

    const filter = parseFilter(mockDirectus.get.mock.calls[0]?.[0] as string);
    const statusFilter = (filter._and as Record<string, { _in: string[] }>[]).find(
      (f) => 'status' in f,
    ) as { status: { _in: string[] } };
    expect(statusFilter.status._in).not.toContain('waitlisted');
    expect(statusFilter.status._in).not.toContain('cancelled');
  });
});
