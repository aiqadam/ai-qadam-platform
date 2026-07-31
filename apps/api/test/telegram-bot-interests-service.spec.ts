import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthentikClient } from '../src/modules/admin-invites/authentik.client';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { MemberInterest, MeProfileService } from '../src/modules/me-profile/me-profile.service';
import type { PointsDirectusService } from '../src/modules/points/points-directus.service';
import type { RegistrationsDirectusService } from '../src/modules/registrations/registrations-directus.service';
import { TelegramAuthService } from '../src/modules/auth/telegram-auth.service';

// FEAT-BOT-2 (FR-BOT-002 PR 5/6) — TelegramAuthService.getInterests /
// .toggleInterest (GET /v1/internal/telegram/interests, POST
// .../interests/toggle). Follows telegram-bot-leaderboard-service.spec.ts's
// own direct-instantiation-with-mocks pattern (no NestJS DI overhead).
//
// The AC-7 mixed-intent scenario (topic has both a 'learn' row and a
// 'mentor' row, toggle off, assert removeInterest was called ONLY for the
// 'learn' row's id, never for the 'mentor' row's id) is the load-bearing
// test per 02-impact-analysis.md's Risk Flag #2 — a single off-by-one in
// the toggle-off filter predicate would silently delete web-authored data.

function makeDirectusBridge(
  overrides: Partial<DirectusUsersBridgeService> = {},
): DirectusUsersBridgeService {
  return {
    resolveUserIdFromDirectusId: vi.fn(),
    resolveUserAndEmailFromDirectusId: vi.fn(),
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

function makeMeProfileService(overrides: Partial<MeProfileService> = {}): MeProfileService {
  return {
    listInterests: vi.fn(),
    addInterest: vi.fn(),
    removeInterest: vi.fn(),
    ...overrides,
  } as unknown as MeProfileService;
}

function makeService(input: {
  bridge?: DirectusUsersBridgeService;
  registrations?: RegistrationsDirectusService;
  points?: PointsDirectusService;
  directus?: DirectusClient;
  meProfile?: MeProfileService;
}): TelegramAuthService {
  return new TelegramAuthService(
    {} as AuthentikClient,
    input.directus ?? makeDirectusClient(),
    input.bridge ?? makeDirectusBridge(),
    input.registrations ?? makeRegistrationsService(),
    input.points ?? makePointsService(),
    input.meProfile ?? makeMeProfileService(),
  );
}

const DIRECTUS_USER_ID = 'dir-user-1';
const PLATFORM_USER_ID = 'platform-user-1';
const EMAIL = 'member@example.com';

function interestRow(topic: string, intent: MemberInterest['intent'], id: string): MemberInterest {
  return { id, topic_tag: topic, intent };
}

describe('TelegramAuthService.getInterests', () => {
  it('throws 404 telegram_user_not_found when the bridge cannot resolve the identity', async () => {
    const bridge = makeDirectusBridge({
      resolveUserAndEmailFromDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ bridge });

    await expect(service.getInterests(DIRECTUS_USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns all topics unselected when the member has no member_interests rows (AC-1)', async () => {
    const bridge = makeDirectusBridge({
      resolveUserAndEmailFromDirectusId: vi
        .fn()
        .mockResolvedValueOnce({ userId: PLATFORM_USER_ID, email: EMAIL }),
    });
    const meProfile = makeMeProfileService({ listInterests: vi.fn().mockResolvedValueOnce([]) });
    const service = makeService({ bridge, meProfile });

    const result = await service.getInterests(DIRECTUS_USER_ID);

    expect(result.selected).toEqual([]);
    expect(result.available).toEqual([
      'llm',
      'mlops',
      'computer-vision',
      'product',
      'career',
      'ethics',
      'infra',
    ]);
  });

  it('marks a topic selected when any intent row exists for it (AC-2)', async () => {
    const bridge = makeDirectusBridge({
      resolveUserAndEmailFromDirectusId: vi
        .fn()
        .mockResolvedValueOnce({ userId: PLATFORM_USER_ID, email: EMAIL }),
    });
    const meProfile = makeMeProfileService({
      listInterests: vi.fn().mockResolvedValueOnce([interestRow('llm', 'mentor', 'row-1')]),
    });
    const service = makeService({ bridge, meProfile });

    const result = await service.getInterests(DIRECTUS_USER_ID);

    expect(result.selected).toEqual(['llm']);
  });

  it('filters selected down to the known INTEREST_TOPICS set, ignoring stray topic_tags', async () => {
    const bridge = makeDirectusBridge({
      resolveUserAndEmailFromDirectusId: vi
        .fn()
        .mockResolvedValueOnce({ userId: PLATFORM_USER_ID, email: EMAIL }),
    });
    const meProfile = makeMeProfileService({
      listInterests: vi
        .fn()
        .mockResolvedValueOnce([interestRow('llm', 'learn', 'row-1'), interestRow('some-legacy-tag', 'learn', 'row-2')]),
    });
    const service = makeService({ bridge, meProfile });

    const result = await service.getInterests(DIRECTUS_USER_ID);

    expect(result.selected).toEqual(['llm']);
  });

  it('orders selected topics per INTEREST_TOPICS order, not insertion order', async () => {
    const bridge = makeDirectusBridge({
      resolveUserAndEmailFromDirectusId: vi
        .fn()
        .mockResolvedValueOnce({ userId: PLATFORM_USER_ID, email: EMAIL }),
    });
    const meProfile = makeMeProfileService({
      listInterests: vi
        .fn()
        .mockResolvedValueOnce([interestRow('infra', 'learn', 'row-1'), interestRow('llm', 'learn', 'row-2')]),
    });
    const service = makeService({ bridge, meProfile });

    const result = await service.getInterests(DIRECTUS_USER_ID);

    expect(result.selected).toEqual(['llm', 'infra']);
  });
});

describe('TelegramAuthService.toggleInterest', () => {
  it('throws 404 telegram_user_not_found when the bridge cannot resolve the identity', async () => {
    const bridge = makeDirectusBridge({
      resolveUserAndEmailFromDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ bridge });

    await expect(service.toggleInterest(DIRECTUS_USER_ID, 'llm')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('toggle-on: calls addInterest with intent=learn when no row exists for the topic (AC-3)', async () => {
    const bridge = makeDirectusBridge({
      // mockResolvedValue (not Once): toggleInterest calls the bridge
      // once directly, then again via its internal getInterests()
      // re-fetch at the end — both calls resolve the same identity.
      resolveUserAndEmailFromDirectusId: vi
        .fn()
        .mockResolvedValue({ userId: PLATFORM_USER_ID, email: EMAIL }),
    });
    const meProfile = makeMeProfileService({
      listInterests: vi
        .fn()
        .mockResolvedValueOnce([]) // toggle-time check
        .mockResolvedValueOnce([interestRow('llm', 'learn', 'row-1')]), // getInterests() re-fetch
      addInterest: vi.fn().mockResolvedValueOnce(interestRow('llm', 'learn', 'row-1')),
    });
    const service = makeService({ bridge, meProfile });

    const result = await service.toggleInterest(DIRECTUS_USER_ID, 'llm');

    expect(meProfile.addInterest).toHaveBeenCalledWith(PLATFORM_USER_ID, EMAIL, 'llm', 'learn');
    expect(meProfile.removeInterest).not.toHaveBeenCalled();
    expect(result.selected).toEqual(['llm']);
  });

  it('toggle-off (single intent): calls removeInterest for the existing learn row (AC-4)', async () => {
    const bridge = makeDirectusBridge({
      resolveUserAndEmailFromDirectusId: vi
        .fn()
        .mockResolvedValue({ userId: PLATFORM_USER_ID, email: EMAIL }),
    });
    const meProfile = makeMeProfileService({
      listInterests: vi
        .fn()
        .mockResolvedValueOnce([interestRow('llm', 'learn', 'row-1')]) // toggle-time check
        .mockResolvedValueOnce([]), // getInterests() re-fetch, post-removal
      removeInterest: vi.fn().mockResolvedValueOnce(undefined),
    });
    const service = makeService({ bridge, meProfile });

    const result = await service.toggleInterest(DIRECTUS_USER_ID, 'llm');

    expect(meProfile.removeInterest).toHaveBeenCalledTimes(1);
    expect(meProfile.removeInterest).toHaveBeenCalledWith(PLATFORM_USER_ID, EMAIL, 'row-1');
    expect(meProfile.addInterest).not.toHaveBeenCalled();
    expect(result.selected).toEqual([]);
  });

  // AC-7 — the load-bearing test. A member has BOTH a 'learn' row and a
  // 'mentor' row for the same topic (learn created via a prior bot toggle,
  // mentor created via the web /me/profile cabinet). Toggling off via the
  // bot must remove ONLY the learn row — the mentor row must survive
  // untouched. A single off-by-one in the filter predicate (e.g. matching
  // by topic only, forgetting the intent condition) would silently delete
  // web-authored cross-surface data — exactly what this test exists to
  // catch.
  it('toggle-off (mixed intent, AC-7): removes ONLY the learn-intent row, leaving the mentor-intent row untouched', async () => {
    const learnRow = interestRow('llm', 'learn', 'row-learn');
    const mentorRow = interestRow('llm', 'mentor', 'row-mentor');
    const bridge = makeDirectusBridge({
      resolveUserAndEmailFromDirectusId: vi
        .fn()
        .mockResolvedValue({ userId: PLATFORM_USER_ID, email: EMAIL }),
    });
    const meProfile = makeMeProfileService({
      listInterests: vi
        .fn()
        .mockResolvedValueOnce([learnRow, mentorRow]) // toggle-time check: topic is "selected" (any intent)
        .mockResolvedValueOnce([mentorRow]), // getInterests() re-fetch, post-removal: mentor row still present
      removeInterest: vi.fn().mockResolvedValueOnce(undefined),
    });
    const service = makeService({ bridge, meProfile });

    const result = await service.toggleInterest(DIRECTUS_USER_ID, 'llm');

    expect(meProfile.removeInterest).toHaveBeenCalledTimes(1);
    expect(meProfile.removeInterest).toHaveBeenCalledWith(PLATFORM_USER_ID, EMAIL, 'row-learn');
    expect(meProfile.removeInterest).not.toHaveBeenCalledWith(
      PLATFORM_USER_ID,
      EMAIL,
      'row-mentor',
    );
    // The topic is still "selected" from the button's point of view
    // because the mentor row survives — any intent counts as present.
    expect(result.selected).toEqual(['llm']);
  });

  // Defensive case per 02-impact-analysis.md Risk Flag #2 point 2: the
  // toggle path must not assume at most one 'learn' row exists, even
  // though addInterest's own dedup means this shouldn't normally happen.
  it('toggle-off: removes ALL learn-intent rows for the topic if more than one somehow exists', async () => {
    const learnRowA = interestRow('llm', 'learn', 'row-learn-a');
    const learnRowB = interestRow('llm', 'learn', 'row-learn-b');
    const bridge = makeDirectusBridge({
      resolveUserAndEmailFromDirectusId: vi
        .fn()
        .mockResolvedValue({ userId: PLATFORM_USER_ID, email: EMAIL }),
    });
    const meProfile = makeMeProfileService({
      listInterests: vi
        .fn()
        .mockResolvedValueOnce([learnRowA, learnRowB])
        .mockResolvedValueOnce([]),
      removeInterest: vi.fn().mockResolvedValue(undefined),
    });
    const service = makeService({ bridge, meProfile });

    await service.toggleInterest(DIRECTUS_USER_ID, 'llm');

    expect(meProfile.removeInterest).toHaveBeenCalledTimes(2);
    expect(meProfile.removeInterest).toHaveBeenCalledWith(PLATFORM_USER_ID, EMAIL, 'row-learn-a');
    expect(meProfile.removeInterest).toHaveBeenCalledWith(PLATFORM_USER_ID, EMAIL, 'row-learn-b');
  });

  it('toggling a topic with only a non-learn row (e.g. mentor-only) removes nothing, since no learn row exists', async () => {
    const mentorRow = interestRow('llm', 'mentor', 'row-mentor');
    const bridge = makeDirectusBridge({
      resolveUserAndEmailFromDirectusId: vi
        .fn()
        .mockResolvedValue({ userId: PLATFORM_USER_ID, email: EMAIL }),
    });
    const meProfile = makeMeProfileService({
      listInterests: vi
        .fn()
        .mockResolvedValueOnce([mentorRow]) // toggle-time check: selected (any intent)
        .mockResolvedValueOnce([mentorRow]), // getInterests() re-fetch: unchanged
      removeInterest: vi.fn(),
      addInterest: vi.fn(),
    });
    const service = makeService({ bridge, meProfile });

    const result = await service.toggleInterest(DIRECTUS_USER_ID, 'llm');

    expect(meProfile.removeInterest).not.toHaveBeenCalled();
    expect(meProfile.addInterest).not.toHaveBeenCalled();
    expect(result.selected).toEqual(['llm']);
  });
});
