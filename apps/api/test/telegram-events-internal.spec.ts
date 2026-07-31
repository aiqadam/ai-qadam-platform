import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramInternalController } from '../src/modules/auth/auth.controller';
import { InternalAuthGuard } from '../src/modules/internal/internal-auth.guard';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  TelegramAuthService,
  type TelegramEventDetailResult,
  type TelegramEventListResult,
} from '../src/modules/auth/telegram-auth.service';

// FEAT-BOT-2 (FR-BOT-002 PR 1/6) — GET /v1/internal/telegram/events and
// GET /v1/internal/telegram/events/:id. Two describe blocks: service-level
// (TelegramAuthService.listUpcomingEvents / getEventDetail against a
// mocked DirectusClient, matching telegram-auth-service.spec.ts's
// mockDirectus.get convention) and controller-level (TelegramInternalController,
// matching telegram-auth-controller.spec.ts's direct-instantiation pattern).

// ── shared Directus mock ────────────────────────────────────────────────

function makeAuthentikClientStub() {
  return {
    getUserByTelegramId: vi.fn(),
    getUserByEmail: vi.fn(),
    createUser: vi.fn(),
    patchAttributes: vi.fn(),
    createRecoveryLink: vi.fn(),
  };
}

function makeDirectusClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

function makeService(mockDirectus: ReturnType<typeof makeDirectusClient>): TelegramAuthService {
  return new TelegramAuthService(
    makeAuthentikClientStub() as never,
    mockDirectus as unknown as DirectusClient,
  );
}

function fakeEventListRow(overrides: Partial<{ id: string; title: string; starts_at: string }> = {}) {
  return {
    id: overrides.id ?? 'evt-1',
    title: overrides.title ?? 'Meetup #1',
    starts_at: overrides.starts_at ?? '2026-08-15T18:00:00.000Z',
  };
}

function fakeEventDetailRow(
  overrides: Partial<{
    id: string;
    title: string;
    starts_at: string;
    venue: string | null;
    description: string;
    capacity: number | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 'evt-1',
    title: overrides.title ?? 'Meetup #1',
    starts_at: overrides.starts_at ?? '2026-08-15T18:00:00.000Z',
    venue: overrides.venue === undefined ? 'Tashkent Hub' : overrides.venue,
    description: overrides.description ?? 'A great meetup.',
    capacity: overrides.capacity === undefined ? 50 : overrides.capacity,
  };
}

function countResponse(count: number) {
  return { data: [{ count }] };
}

// ─────────────────────────────────────────────────────────────────────────

describe('TelegramAuthService.listUpcomingEvents', () => {
  let mockDirectus: ReturnType<typeof makeDirectusClient>;
  let service: TelegramAuthService;

  beforeEach(() => {
    mockDirectus = makeDirectusClient();
    service = makeService(mockDirectus);
    vi.restoreAllMocks();
  });

  it('returns items mapped to the narrow wire shape plus offset/limit/total', async () => {
    mockDirectus.get
      .mockResolvedValueOnce({ data: [fakeEventListRow({ id: 'evt-1' }), fakeEventListRow({ id: 'evt-2' })] })
      .mockResolvedValueOnce(countResponse(3)) // total
      .mockResolvedValueOnce(countResponse(2)) // registrationCount for evt-1
      .mockResolvedValueOnce(countResponse(0)); // registrationCount for evt-2

    const result = await service.listUpcomingEvents('uz', 0, 5);

    expect(result.items).toEqual([
      { id: 'evt-1', title: 'Meetup #1', startsAt: '2026-08-15T18:00:00.000Z', registrationCount: 2 },
      { id: 'evt-2', title: 'Meetup #1', startsAt: '2026-08-15T18:00:00.000Z', registrationCount: 0 },
    ]);
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(5);
    expect(result.total).toBe(3);
  });

  it('scopes the list query to the requested country', async () => {
    mockDirectus.get.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce(countResponse(0));

    await service.listUpcomingEvents('kz', 0, 5);

    const listCallUrl = mockDirectus.get.mock.calls[0]?.[0] as string;
    expect(listCallUrl).toContain('filter[country][_eq]=kz');
    expect(listCallUrl).toContain('filter[status][_eq]=published');
    expect(listCallUrl).toContain('filter[visibility_scope][_eq]=public');
  });

  it('passes offset/limit through to the Directus query', async () => {
    mockDirectus.get.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce(countResponse(0));

    await service.listUpcomingEvents('uz', 10, 5);

    const listCallUrl = mockDirectus.get.mock.calls[0]?.[0] as string;
    expect(listCallUrl).toContain('offset=10');
    expect(listCallUrl).toContain('limit=5');
  });

  it('returns an empty items array with total=0 when no events match, without crashing', async () => {
    mockDirectus.get.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce(countResponse(0));

    const result = await service.listUpcomingEvents('tj', 0, 5);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('TelegramAuthService.getEventDetail', () => {
  let mockDirectus: ReturnType<typeof makeDirectusClient>;
  let service: TelegramAuthService;

  beforeEach(() => {
    mockDirectus = makeDirectusClient();
    service = makeService(mockDirectus);
    vi.restoreAllMocks();
  });

  it('returns full detail with isRegistered=false when no directusUserId is supplied', async () => {
    mockDirectus.get
      .mockResolvedValueOnce({ data: [fakeEventDetailRow()] }) // findPublishedEvent
      .mockResolvedValueOnce(countResponse(7)); // registrationCount

    const result = await service.getEventDetail('evt-1', null);

    expect(result).toEqual<TelegramEventDetailResult>({
      id: 'evt-1',
      title: 'Meetup #1',
      startsAt: '2026-08-15T18:00:00.000Z',
      venue: 'Tashkent Hub',
      description: 'A great meetup.',
      capacity: 50,
      registrationCount: 7,
      isRegistered: false,
    });
    // isUserRegistered must not be called when directusUserId is null.
    expect(mockDirectus.get).toHaveBeenCalledTimes(2);
  });

  it('returns isRegistered=true when a matching non-cancelled registration exists for the caller', async () => {
    mockDirectus.get
      .mockResolvedValueOnce({ data: [fakeEventDetailRow()] })
      .mockResolvedValueOnce(countResponse(7))
      .mockResolvedValueOnce({ data: [{ id: 'reg-1' }] });

    const result = await service.getEventDetail('evt-1', 'dir-user-1');

    expect(result.isRegistered).toBe(true);
    const regCallUrl = mockDirectus.get.mock.calls[2]?.[0] as string;
    expect(regCallUrl).toContain('filter[user][_eq]=dir-user-1');
    expect(regCallUrl).toContain('filter[status][_neq]=cancelled');
  });

  it('returns isRegistered=false when directusUserId is supplied but no registration matches', async () => {
    mockDirectus.get
      .mockResolvedValueOnce({ data: [fakeEventDetailRow()] })
      .mockResolvedValueOnce(countResponse(0))
      .mockResolvedValueOnce({ data: [] });

    const result = await service.getEventDetail('evt-1', 'dir-user-2');

    expect(result.isRegistered).toBe(false);
  });

  it('throws NotFoundException with { error: "event_not_found" } when no published/public event matches the id', async () => {
    mockDirectus.get.mockResolvedValueOnce({ data: [] });

    await expect(service.getEventDetail('missing-evt', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    mockDirectus.get.mockResolvedValueOnce({ data: [] });
    try {
      await service.getEventDetail('missing-evt', null);
      expect.unreachable('getEventDetail should have thrown');
    } catch (e) {
      const body = (e as NotFoundException).getResponse() as { error: string };
      expect(body).toEqual({ error: 'event_not_found' });
    }
  });

  it('applies the published+public guard to the detail lookup query', async () => {
    mockDirectus.get.mockResolvedValueOnce({ data: [fakeEventDetailRow()] }).mockResolvedValueOnce(
      countResponse(0),
    );

    await service.getEventDetail('evt-1', null);

    const detailCallUrl = mockDirectus.get.mock.calls[0]?.[0] as string;
    expect(detailCallUrl).toContain('filter[status][_eq]=published');
    expect(detailCallUrl).toContain('filter[visibility_scope][_eq]=public');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Controller layer — matches telegram-auth-controller.spec.ts's direct
// instantiation + explicit Zod-boundary assertions convention.

function makeTelegramAuthServiceMock(
  overrides: Partial<TelegramAuthService> = {},
): TelegramAuthService {
  return {
    verifyWidgetHash: vi.fn(),
    exchangeWidgetPayload: vi.fn(),
    upsertTempUser: vi.fn(),
    lookupUser: vi.fn(),
    listUpcomingEvents: vi.fn(),
    getEventDetail: vi.fn(),
    ...overrides,
  } as unknown as TelegramAuthService;
}

describe('TelegramInternalController.listEvents (GET /v1/internal/telegram/events)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls listUpcomingEvents with parsed country/offset/limit and returns its result', async () => {
    const expected: TelegramEventListResult = {
      items: [{ id: 'evt-1', title: 'Meetup', startsAt: '2026-08-15T18:00:00.000Z', registrationCount: 1 }],
      offset: 0,
      limit: 5,
      total: 1,
    };
    const telegramAuth = makeTelegramAuthServiceMock({
      listUpcomingEvents: vi.fn().mockResolvedValueOnce(expected),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.listEvents({ country: 'uz', offset: '0', limit: '5' });

    expect(result).toEqual(expected);
    expect(telegramAuth.listUpcomingEvents).toHaveBeenCalledWith('uz', 0, 5);
  });

  it('defaults offset=0 and limit=5 when omitted', async () => {
    const telegramAuth = makeTelegramAuthServiceMock({
      listUpcomingEvents: vi.fn().mockResolvedValueOnce({ items: [], offset: 0, limit: 5, total: 0 }),
    });
    const controller = new TelegramInternalController(telegramAuth);

    await controller.listEvents({ country: 'kz' });

    expect(telegramAuth.listUpcomingEvents).toHaveBeenCalledWith('kz', 0, 5);
  });

  it('throws BadRequestException without calling the service when country is missing', async () => {
    const telegramAuth = makeTelegramAuthServiceMock();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(controller.listEvents({})).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.listUpcomingEvents).not.toHaveBeenCalled();
  });

  it('throws BadRequestException without calling the service when country is not a valid tenant', async () => {
    const telegramAuth = makeTelegramAuthServiceMock();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(controller.listEvents({ country: 'us' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(telegramAuth.listUpcomingEvents).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when limit exceeds the 50 cap', async () => {
    const telegramAuth = makeTelegramAuthServiceMock();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.listEvents({ country: 'uz', limit: '51' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.listUpcomingEvents).not.toHaveBeenCalled();
  });

  it('is declared on TelegramInternalController, which carries the class-level InternalAuthGuard', () => {
    expect(typeof TelegramInternalController.prototype.listEvents).toBe('function');
    const guards: (new (...args: unknown[]) => unknown)[] | undefined = Reflect.getMetadata(
      '__guards__',
      TelegramInternalController,
    );
    expect(guards?.some((g) => g === InternalAuthGuard)).toBe(true);
  });
});

describe('TelegramInternalController.getEventDetail (GET /v1/internal/telegram/events/:id)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const VALID_UUID = '11111111-1111-1111-1111-111111111111';

  it('calls getEventDetail with the parsed id and directusUserId and returns its result', async () => {
    const expected: TelegramEventDetailResult = {
      id: VALID_UUID,
      title: 'Meetup',
      startsAt: '2026-08-15T18:00:00.000Z',
      venue: 'Hub',
      description: 'Desc',
      capacity: 20,
      registrationCount: 3,
      isRegistered: true,
    };
    const telegramAuth = makeTelegramAuthServiceMock({
      getEventDetail: vi.fn().mockResolvedValueOnce(expected),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.getEventDetail(
      { id: VALID_UUID },
      { directusUserId: '22222222-2222-2222-2222-222222222222' },
    );

    expect(result).toEqual(expected);
    expect(telegramAuth.getEventDetail).toHaveBeenCalledWith(
      VALID_UUID,
      '22222222-2222-2222-2222-222222222222',
    );
  });

  it('passes directusUserId=null when the query param is omitted', async () => {
    const telegramAuth = makeTelegramAuthServiceMock({
      getEventDetail: vi.fn().mockResolvedValueOnce({
        id: VALID_UUID,
        title: 'Meetup',
        startsAt: '2026-08-15T18:00:00.000Z',
        venue: null,
        description: 'Desc',
        capacity: null,
        registrationCount: 0,
        isRegistered: false,
      }),
    });
    const controller = new TelegramInternalController(telegramAuth);

    await controller.getEventDetail({ id: VALID_UUID }, {});

    expect(telegramAuth.getEventDetail).toHaveBeenCalledWith(VALID_UUID, null);
  });

  it('throws BadRequestException without calling the service when id is not a UUID', async () => {
    const telegramAuth = makeTelegramAuthServiceMock();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.getEventDetail({ id: 'not-a-uuid' }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.getEventDetail).not.toHaveBeenCalled();
  });

  it('propagates NotFoundException with { error: "event_not_found" } body from the service', async () => {
    const telegramAuth = makeTelegramAuthServiceMock({
      getEventDetail: vi.fn().mockRejectedValueOnce(new NotFoundException({ error: 'event_not_found' })),
    });
    const controller = new TelegramInternalController(telegramAuth);

    try {
      await controller.getEventDetail({ id: VALID_UUID }, {});
      expect.unreachable('getEventDetail should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const body = (e as NotFoundException).getResponse() as { error: string };
      expect(body).toEqual({ error: 'event_not_found' });
    }
  });

  it('is declared on TelegramInternalController, which carries the class-level InternalAuthGuard', () => {
    expect(typeof TelegramInternalController.prototype.getEventDetail).toBe('function');
    const guards: (new (...args: unknown[]) => unknown)[] | undefined = Reflect.getMetadata(
      '__guards__',
      TelegramInternalController,
    );
    expect(guards?.some((g) => g === InternalAuthGuard)).toBe(true);
  });
});
