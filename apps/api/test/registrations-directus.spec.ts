import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  CheckinIneligibleError,
  CheckinNotFoundError,
  RegistrationIneligibleError,
  RegistrationNotFoundError,
  RegistrationsDirectusService,
} from '../src/modules/registrations/registrations-directus.service';

// Pure-mock tests: this service is REST-only, so no Testcontainers Postgres
// needed. We stub DirectusClient + DirectusUsersBridgeService directly.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeBridge = {
  ensureLinked: ReturnType<typeof vi.fn>;
  resolveDirectusId: ReturnType<typeof vi.fn>;
};

function makeService(fake: FakeDirectus, bridge: FakeBridge) {
  return new RegistrationsDirectusService(
    fake as unknown as DirectusClient,
    bridge as unknown as DirectusUsersBridgeService,
  );
}

const USER = 'aaaaaaaa-aaaa-4000-8000-000000000001';
const DIRECTUS_USER = 'bbbbbbbb-bbbb-4000-8000-000000000002';
const EVENT = 'cccccccc-cccc-4000-8000-000000000003';
const REG = 'dddddddd-dddd-4000-8000-000000000004';
const COUNTRY = 'uz';

function happyEvent() {
  return { data: { id: EVENT, country: COUNTRY, status: 'published' } };
}
function regRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REG,
    event: EVENT,
    user: DIRECTUS_USER,
    status: 'registered',
    checkin_code: 'ccccccc1-ccc1-4000-8000-000000000099',
    checked_in_at: null,
    cancelled_at: null,
    date_created: '2026-05-18T00:00:00Z',
    date_updated: null,
    ...overrides,
  };
}

let fake: FakeDirectus;
let bridge: FakeBridge;
let svc: RegistrationsDirectusService;

beforeEach(() => {
  fake = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  bridge = {
    ensureLinked: vi.fn(),
    resolveDirectusId: vi.fn().mockResolvedValue(DIRECTUS_USER),
  };
  svc = makeService(fake, bridge);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('register', () => {
  it('creates a new registration and returns the settled (post-flow) row', async () => {
    fake.get
      .mockResolvedValueOnce(happyEvent()) // event lookup
      .mockResolvedValueOnce({ data: [] }) // findActiveByUserEvent — none exists
      .mockResolvedValueOnce({ data: regRow({ status: 'waitlisted' }) }); // settled re-read after flow
    fake.post.mockResolvedValueOnce({ data: regRow() }); // create

    const view = await svc.register({ userId: USER, eventId: EVENT, countryCode: COUNTRY });

    expect(view.id).toBe(REG);
    expect(view.eventId).toBe(EVENT);
    // The capacity flow may have demoted us to waitlisted between
    // create + re-read. Our view reflects the post-flow state.
    expect(view.status).toBe('waitlisted');
    expect(fake.post).toHaveBeenCalledWith('/items/registrations', {
      user: DIRECTUS_USER,
      event: EVENT,
    });
  });

  it('is idempotent: returns the existing active row without creating a duplicate', async () => {
    fake.get.mockResolvedValueOnce(happyEvent()).mockResolvedValueOnce({ data: [regRow()] }); // findActive returns existing
    const view = await svc.register({ userId: USER, eventId: EVENT, countryCode: COUNTRY });
    expect(view.id).toBe(REG);
    expect(fake.post).not.toHaveBeenCalled();
  });

  it('rejects with NotFound when event is in a different tenant', async () => {
    fake.get.mockResolvedValueOnce({
      data: { id: EVENT, country: 'kz', status: 'published' },
    });
    await expect(
      svc.register({ userId: USER, eventId: EVENT, countryCode: COUNTRY }),
    ).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it('rejects with NotFound when event is unpublished', async () => {
    fake.get.mockResolvedValueOnce({
      data: { id: EVENT, country: COUNTRY, status: 'draft' },
    });
    await expect(
      svc.register({ userId: USER, eventId: EVENT, countryCode: COUNTRY }),
    ).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it('rejects with Ineligible when user has no Directus link yet', async () => {
    bridge.resolveDirectusId.mockResolvedValueOnce(null);
    await expect(
      svc.register({ userId: USER, eventId: EVENT, countryCode: COUNTRY }),
    ).rejects.toBeInstanceOf(RegistrationIneligibleError);
  });
});

describe('cancel', () => {
  it('PATCHes the active reg to cancelled when one exists', async () => {
    fake.get.mockResolvedValueOnce(happyEvent()).mockResolvedValueOnce({ data: [regRow()] });
    fake.patch.mockResolvedValueOnce({
      data: regRow({ status: 'cancelled', cancelled_at: '2026-05-18T01:00:00Z' }),
    });

    const view = await svc.cancel({ userId: USER, eventId: EVENT, countryCode: COUNTRY });

    expect(view?.status).toBe('cancelled');
    const patchCall = fake.patch.mock.calls[0];
    expect(patchCall?.[0]).toBe(`/items/registrations/${REG}`);
    expect(patchCall?.[1]).toMatchObject({ status: 'cancelled' });
    expect((patchCall?.[1] as Record<string, string>).cancelled_at).toBeTruthy();
  });

  it('returns null when no active reg exists (already cancelled or never registered)', async () => {
    fake.get.mockResolvedValueOnce(happyEvent()).mockResolvedValueOnce({ data: [] });
    const view = await svc.cancel({ userId: USER, eventId: EVENT, countryCode: COUNTRY });
    expect(view).toBeNull();
    expect(fake.patch).not.toHaveBeenCalled();
  });
});

describe('listMine', () => {
  it('returns view-shaped entries, sorted desc by date_created, filtered by tenant', async () => {
    const enriched = {
      ...regRow(),
      event: {
        id: EVENT,
        title: 'AI Drinks UZ',
        starts_at: '2026-06-01T18:00:00Z',
        ends_at: '2026-06-01T21:00:00Z',
        location: 'Tashkent',
      },
    };
    fake.get.mockResolvedValueOnce({ data: [enriched] });

    const entries = await svc.listMine({ userId: USER, countryCode: COUNTRY });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.registration.eventId).toBe(EVENT);
    expect(entries[0]?.event.title).toBe('AI Drinks UZ');
    expect(entries[0]?.event.startsAt).toBe('2026-06-01T18:00:00Z');
    // Assert the country filter was applied
    const call = fake.get.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter%5Bevent%5D%5Bcountry%5D%5B_eq%5D=uz');
    expect(call).toContain('filter%5Bstatus%5D%5B_neq%5D=cancelled');
  });

  it('returns empty array when user has no regs', async () => {
    fake.get.mockResolvedValueOnce({ data: [] });
    const entries = await svc.listMine({ userId: USER, countryCode: COUNTRY });
    expect(entries).toEqual([]);
  });
});

describe('checkin', () => {
  const CODE = 'eeeeeeee-eeee-4000-8000-000000000005';
  const enriched = (status = 'registered', checkedInAt: string | null = null) => ({
    ...regRow({ status, checked_in_at: checkedInAt }),
    event: {
      id: EVENT,
      title: 'AI Drinks UZ',
      starts_at: '2026-06-01T18:00:00Z',
      ends_at: '2026-06-01T21:00:00Z',
      location: 'Tashkent',
    },
  });

  it('PATCHes status to attended on first scan', async () => {
    fake.get.mockResolvedValueOnce({ data: [enriched('registered')] });
    fake.patch.mockResolvedValueOnce({
      data: enriched('attended', '2026-06-01T18:30:00Z'),
    });

    const result = await svc.checkin(CODE);

    expect(result.alreadyCheckedIn).toBe(false);
    expect(result.registration.status).toBe('attended');
    const patchCall = fake.patch.mock.calls[0];
    expect(patchCall?.[0]).toBe(`/items/registrations/${REG}`);
    expect(patchCall?.[1]).toMatchObject({ status: 'attended' });
  });

  it('returns alreadyCheckedIn=true and skips PATCH for an attended row (re-scan is safe)', async () => {
    fake.get.mockResolvedValueOnce({
      data: [enriched('attended', '2026-06-01T18:30:00Z')],
    });
    const result = await svc.checkin(CODE);
    expect(result.alreadyCheckedIn).toBe(true);
    expect(fake.patch).not.toHaveBeenCalled();
  });

  it('throws NotFound on unknown code', async () => {
    fake.get.mockResolvedValueOnce({ data: [] });
    await expect(svc.checkin(CODE)).rejects.toBeInstanceOf(CheckinNotFoundError);
  });

  it('throws Ineligible on a cancelled reg', async () => {
    fake.get.mockResolvedValueOnce({ data: [enriched('cancelled')] });
    await expect(svc.checkin(CODE)).rejects.toBeInstanceOf(CheckinIneligibleError);
  });

  it('throws Ineligible on a waitlisted reg', async () => {
    fake.get.mockResolvedValueOnce({ data: [enriched('waitlisted')] });
    await expect(svc.checkin(CODE)).rejects.toBeInstanceOf(CheckinIneligibleError);
  });
});
