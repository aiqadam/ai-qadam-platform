import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthentikClient } from '../src/modules/admin-invites/authentik.client';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { PointsDirectusService } from '../src/modules/points/points-directus.service';
import type { RegistrationsDirectusService } from '../src/modules/registrations/registrations-directus.service';
import { TelegramAuthService } from '../src/modules/auth/telegram-auth.service';

// FEAT-BOT-2 (FR-BOT-002 PR 3/6) — TelegramAuthService.getMeSummary
// (GET /v1/internal/telegram/me, the NEW aiogram-bot internal surface —
// not to be confused with the pre-existing telegram-me-service.spec.ts,
// which covers the older, superseded apps/api/src/modules/telegram/
// module's telegram-me.service.ts; see auth.controller.ts's own
// "Internal Telegram controller" section comment for the module split).
// Follows telegram-register-service.spec.ts's own direct-instantiation-
// with-mocks pattern (no NestJS DI overhead).

function makeDirectusBridge(
  overrides: Partial<DirectusUsersBridgeService> = {},
): DirectusUsersBridgeService {
  return {
    resolveUserIdFromDirectusId: vi.fn(),
    resolveDirectusId: vi.fn(),
    ensureLinked: vi.fn(),
    ensureLinkedByEmail: vi.fn(),
    ...overrides,
  } as unknown as DirectusUsersBridgeService;
}

function makeRegistrationsService(
  overrides: Partial<RegistrationsDirectusService> = {},
): RegistrationsDirectusService {
  return {
    register: vi.fn(),
    cancel: vi.fn(),
    listMine: vi.fn(),
    checkin: vi.fn(),
    checkinWithEvent: vi.fn(),
    ...overrides,
  } as unknown as RegistrationsDirectusService;
}

function makePointsService(overrides: Partial<PointsDirectusService> = {}): PointsDirectusService {
  return {
    leaderboard: vi.fn(),
    totalForUser: vi.fn(),
    awardFirstJoinPoints: vi.fn(),
    ...overrides,
  } as unknown as PointsDirectusService;
}

function makeDirectusClient(overrides: Partial<DirectusClient> = {}): DirectusClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as DirectusClient;
}

function makeService(input: {
  bridge?: DirectusUsersBridgeService;
  registrations?: RegistrationsDirectusService;
  points?: PointsDirectusService;
  directus?: DirectusClient;
}): TelegramAuthService {
  return new TelegramAuthService(
    {} as AuthentikClient,
    input.directus ?? makeDirectusClient(),
    input.bridge ?? makeDirectusBridge(),
    input.registrations ?? makeRegistrationsService(),
    input.points ?? makePointsService(),
  );
}

const DIRECTUS_USER_ID = 'dir-user-1';
const PLATFORM_USER_ID = 'platform-user-1';
const COUNTRY = 'uz';

const SAMPLE_ENTRY = {
  registration: {
    id: 'reg-1',
    eventId: 'evt-1',
    status: 'registered' as const,
    checkinCode: 'abc123',
    checkedInAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    cancelledAt: null,
  },
  event: {
    id: 'evt-1',
    title: 'Meetup #1',
    startsAt: '2026-08-15T18:00:00.000Z',
    endsAt: '2026-08-15T20:00:00.000Z',
    location: 'Tashkent',
  },
};

describe('TelegramAuthService.getMeSummary', () => {
  it('resolves directusUserId -> platform userId via the bridge, then aggregates registrations + points', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      listMine: vi.fn().mockResolvedValueOnce([SAMPLE_ENTRY]),
    });
    const points = makePointsService({
      totalForUser: vi.fn().mockResolvedValueOnce(135),
    });
    const service = makeService({ bridge, registrations, points });

    const result = await service.getMeSummary(DIRECTUS_USER_ID, COUNTRY);

    expect(bridge.resolveUserIdFromDirectusId).toHaveBeenCalledWith(DIRECTUS_USER_ID);
    expect(registrations.listMine).toHaveBeenCalledWith({
      userId: PLATFORM_USER_ID,
      countryCode: COUNTRY,
    });
    expect(points.totalForUser).toHaveBeenCalledWith(DIRECTUS_USER_ID, COUNTRY);
    expect(result).toEqual({
      registrations: [
        {
          id: 'reg-1',
          status: 'registered',
          event: SAMPLE_ENTRY.event,
        },
      ],
      pointsTotal: 135,
    });
  });

  it('returns an empty registrations list and pointsTotal 0 for a user with no activity', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      listMine: vi.fn().mockResolvedValueOnce([]),
    });
    const points = makePointsService({
      totalForUser: vi.fn().mockResolvedValueOnce(0),
    });
    const service = makeService({ bridge, registrations, points });

    const result = await service.getMeSummary(DIRECTUS_USER_ID, COUNTRY);

    expect(result).toEqual({ registrations: [], pointsTotal: 0 });
  });

  it('throws NotFoundException {telegram_user_not_found} when the bridge cannot resolve a platform user, without calling listMine/totalForUser', async () => {
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const registrations = makeRegistrationsService();
    const points = makePointsService();
    const service = makeService({ bridge, registrations, points });

    await expect(service.getMeSummary(DIRECTUS_USER_ID, COUNTRY)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(registrations.listMine).not.toHaveBeenCalled();
    expect(points.totalForUser).not.toHaveBeenCalled();
  });

  it('fetches registrations and points in parallel (both calls happen before either resolves)', async () => {
    const callOrder: string[] = [];
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(PLATFORM_USER_ID),
    });
    const registrations = makeRegistrationsService({
      listMine: vi.fn().mockImplementationOnce(async () => {
        callOrder.push('listMine-start');
        await Promise.resolve();
        callOrder.push('listMine-end');
        return [];
      }),
    });
    const points = makePointsService({
      totalForUser: vi.fn().mockImplementationOnce(async () => {
        callOrder.push('totalForUser-start');
        await Promise.resolve();
        callOrder.push('totalForUser-end');
        return 0;
      }),
    });
    const service = makeService({ bridge, registrations, points });

    await service.getMeSummary(DIRECTUS_USER_ID, COUNTRY);

    // Both start before either finishes -> Promise.all, not sequential awaits.
    expect(callOrder.indexOf('listMine-start')).toBeLessThan(callOrder.indexOf('totalForUser-end'));
    expect(callOrder.indexOf('totalForUser-start')).toBeLessThan(callOrder.indexOf('listMine-end'));
  });
});
