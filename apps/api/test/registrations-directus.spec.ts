import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { EulaService } from '../src/modules/eula/eula.service';
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

// Default fake EulaService — every event resolves to null EULA, so the
// registration flow is a no-op for consent. Per-test override available
// by passing your own object.
function makeService(
  fake: FakeDirectus,
  bridge: FakeBridge,
  eulas: {
    resolveForEvent: ReturnType<typeof vi.fn>;
    recordAcceptance: ReturnType<typeof vi.fn>;
  } = {
    resolveForEvent: vi.fn().mockResolvedValue(null),
    recordAcceptance: vi.fn().mockResolvedValue(undefined),
  },
) {
  return new RegistrationsDirectusService(
    fake as unknown as DirectusClient,
    bridge as unknown as DirectusUsersBridgeService,
    eulas as unknown as EulaService,
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

  // F-S5.3 — brought-a-friend referral bonus on attendance.
  const REFERRER = 'rrrrrrrr-rrrr-4000-8000-000000000001';
  const enrichedWithReferral = (status = 'registered', referredBy: string | null = REFERRER) => ({
    ...regRow({ status, checked_in_at: null }),
    referred_by: referredBy,
    event: {
      id: EVENT,
      title: 'AI Drinks UZ',
      starts_at: '2026-06-01T18:00:00Z',
      ends_at: '2026-06-01T21:00:00Z',
      location: 'Tashkent',
      country: 'uz',
    },
  });

  it('F-S5.3 — awards +25 referral_attended + brought_a_friend badge when referee attends', async () => {
    fake.get
      .mockResolvedValueOnce({ data: [enrichedWithReferral('registered')] }) // initial fetch
      .mockResolvedValueOnce({ data: [] }) // point_awards dedupe — empty
      .mockResolvedValueOnce({ data: [] }); // member_badges dedupe — empty
    fake.patch.mockResolvedValueOnce({
      data: enrichedWithReferral('attended'),
    });
    fake.post.mockResolvedValueOnce({}); // point_awards insert
    fake.post.mockResolvedValueOnce({}); // member_badges insert

    const result = await svc.checkin(CODE);
    expect(result.alreadyCheckedIn).toBe(false);
    expect(fake.post).toHaveBeenCalledTimes(2);
    const ptsPost = fake.post.mock.calls[0];
    expect(ptsPost?.[0]).toBe('/items/point_awards');
    expect(ptsPost?.[1]).toMatchObject({
      user: REFERRER,
      source: 'referral_attended',
      source_ref: REG,
      points: 25,
      country: 'uz',
    });
    const badgePost = fake.post.mock.calls[1];
    expect(badgePost?.[0]).toBe('/items/member_badges');
    expect(badgePost?.[1]).toMatchObject({
      user: REFERRER,
      badge_type: 'brought_a_friend',
      source_ref: REG,
    });
  });

  it('F-S5.3 — no bonus when referred_by is null', async () => {
    fake.get.mockResolvedValueOnce({ data: [enrichedWithReferral('registered', null)] });
    fake.patch.mockResolvedValueOnce({ data: enrichedWithReferral('attended', null) });

    await svc.checkin(CODE);
    expect(fake.post).not.toHaveBeenCalled();
  });

  it('F-S5.3 — skips bonus when point_awards dedupe row already exists', async () => {
    fake.get
      .mockResolvedValueOnce({ data: [enrichedWithReferral('registered')] })
      .mockResolvedValueOnce({ data: [{ id: 'existing-pa' }] }); // dedupe hit
    fake.patch.mockResolvedValueOnce({ data: enrichedWithReferral('attended') });

    await svc.checkin(CODE);
    expect(fake.post).not.toHaveBeenCalled();
  });

  it('F-S5.3 — awards points but skips badge when badge dedupe hit', async () => {
    fake.get
      .mockResolvedValueOnce({ data: [enrichedWithReferral('registered')] })
      .mockResolvedValueOnce({ data: [] }) // point_awards dedupe — empty
      .mockResolvedValueOnce({ data: [{ id: 'existing-badge' }] }); // badge dedupe hit
    fake.patch.mockResolvedValueOnce({ data: enrichedWithReferral('attended') });
    fake.post.mockResolvedValueOnce({}); // point_awards insert succeeds

    await svc.checkin(CODE);
    expect(fake.post).toHaveBeenCalledTimes(1);
    expect(fake.post.mock.calls[0]?.[0]).toBe('/items/point_awards');
  });

  it('F-S5.3 — best-effort: bonus dispatch failure does not block check-in', async () => {
    fake.get
      .mockResolvedValueOnce({ data: [enrichedWithReferral('registered')] })
      .mockResolvedValueOnce({ data: [] });
    fake.patch.mockResolvedValueOnce({ data: enrichedWithReferral('attended') });
    fake.post.mockRejectedValueOnce(new Error('directus 503'));

    const result = await svc.checkin(CODE);
    expect(result.alreadyCheckedIn).toBe(false);
    expect(result.registration.status).toBe('attended');
  });
});
