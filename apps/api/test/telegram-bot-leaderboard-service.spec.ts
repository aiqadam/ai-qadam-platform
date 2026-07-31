import { describe, expect, it, vi } from 'vitest';
import type { AuthentikClient } from '../src/modules/admin-invites/authentik.client';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { LeaderboardEntry, PointsDirectusService } from '../src/modules/points/points-directus.service';
import type { RegistrationsDirectusService } from '../src/modules/registrations/registrations-directus.service';
import { TelegramAuthService } from '../src/modules/auth/telegram-auth.service';

// FEAT-BOT-2 (FR-BOT-002 PR 4/6) — TelegramAuthService.getLeaderboard
// (GET /v1/internal/telegram/leaderboard). Follows
// telegram-bot-me-service.spec.ts's own direct-instantiation-with-mocks
// pattern (no NestJS DI overhead) — the closest sibling, since both
// aggregate PointsDirectusService + DirectusUsersBridgeService.

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
const COUNTRY = 'uz';

const ALICE: LeaderboardEntry = {
  userId: 'platform-alice',
  email: 'alice@example.com',
  displayName: 'Alice',
  handle: 'alice_k',
  totalPoints: 100,
};
const BOB: LeaderboardEntry = {
  userId: 'platform-bob',
  email: 'bob@example.com',
  displayName: 'Bob',
  handle: null,
  totalPoints: 80,
};

describe('TelegramAuthService.getLeaderboard', () => {
  it('calls leaderboard() with the country and a limit of 10', async () => {
    const points = makePointsService({ leaderboard: vi.fn().mockResolvedValueOnce([]) });
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce('platform-caller'),
    });
    const service = makeService({ points, bridge });

    await service.getLeaderboard(DIRECTUS_USER_ID, COUNTRY);

    expect(points.leaderboard).toHaveBeenCalledWith({ countryCode: COUNTRY, limit: 10 });
  });

  it('marks isCaller=true only on the entry matching the resolved platform userId', async () => {
    const points = makePointsService({
      leaderboard: vi.fn().mockResolvedValueOnce([ALICE, BOB]),
    });
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(BOB.userId),
    });
    const service = makeService({ points, bridge });

    const result = await service.getLeaderboard(DIRECTUS_USER_ID, COUNTRY);

    expect(result).toEqual({
      entries: [
        { displayName: 'Alice', points: 100, isCaller: false },
        { displayName: 'Bob', points: 80, isCaller: true },
      ],
    });
  });

  it('marks every entry isCaller=false when the caller does not appear in the top 10', async () => {
    const points = makePointsService({
      leaderboard: vi.fn().mockResolvedValueOnce([ALICE, BOB]),
    });
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce('platform-someone-else'),
    });
    const service = makeService({ points, bridge });

    const result = await service.getLeaderboard(DIRECTUS_USER_ID, COUNTRY);

    expect(result.entries.every((e) => e.isCaller === false)).toBe(true);
  });

  it('degrades to no highlight (not a throw) when the bridge cannot resolve the caller identity', async () => {
    const points = makePointsService({
      leaderboard: vi.fn().mockResolvedValueOnce([ALICE]),
    });
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ points, bridge });

    const result = await service.getLeaderboard(DIRECTUS_USER_ID, COUNTRY);

    expect(result).toEqual({ entries: [{ displayName: 'Alice', points: 100, isCaller: false }] });
  });

  it('never includes email or handle in the response shape (PII narrowing)', async () => {
    const points = makePointsService({ leaderboard: vi.fn().mockResolvedValueOnce([ALICE]) });
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ points, bridge });

    const result = await service.getLeaderboard(DIRECTUS_USER_ID, COUNTRY);

    const entry = result.entries[0] as Record<string, unknown>;
    expect(entry.email).toBeUndefined();
    expect(entry.handle).toBeUndefined();
    expect(entry.userId).toBeUndefined();
  });

  it('falls back to handle, then a generic label, when displayName is null', async () => {
    const noDisplayName: LeaderboardEntry = { ...BOB, displayName: null, handle: 'bob_h' };
    const noNameAtAll: LeaderboardEntry = { ...BOB, userId: 'platform-nameless', displayName: null, handle: null };
    const points = makePointsService({
      leaderboard: vi.fn().mockResolvedValueOnce([noDisplayName, noNameAtAll]),
    });
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ points, bridge });

    const result = await service.getLeaderboard(DIRECTUS_USER_ID, COUNTRY);

    expect(result.entries[0]?.displayName).toBe('bob_h');
    expect(result.entries[1]?.displayName).toBe('Member');
  });

  it('returns an empty entries list when leaderboard() has nothing for this country', async () => {
    const points = makePointsService({ leaderboard: vi.fn().mockResolvedValueOnce([]) });
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ points, bridge });

    const result = await service.getLeaderboard(DIRECTUS_USER_ID, COUNTRY);

    expect(result).toEqual({ entries: [] });
  });

  it('fetches the leaderboard and resolves the caller identity in parallel', async () => {
    const callOrder: string[] = [];
    const points = makePointsService({
      leaderboard: vi.fn().mockImplementationOnce(async () => {
        callOrder.push('leaderboard-start');
        await Promise.resolve();
        callOrder.push('leaderboard-end');
        return [];
      }),
    });
    const bridge = makeDirectusBridge({
      resolveUserIdFromDirectusId: vi.fn().mockImplementationOnce(async () => {
        callOrder.push('resolve-start');
        await Promise.resolve();
        callOrder.push('resolve-end');
        return null;
      }),
    });
    const service = makeService({ points, bridge });

    await service.getLeaderboard(DIRECTUS_USER_ID, COUNTRY);

    expect(callOrder.indexOf('leaderboard-start')).toBeLessThan(callOrder.indexOf('resolve-end'));
    expect(callOrder.indexOf('resolve-start')).toBeLessThan(callOrder.indexOf('leaderboard-end'));
  });
});
