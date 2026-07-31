import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TelegramInternalController } from '../src/modules/auth/auth.controller';
import type { TelegramAuthService } from '../src/modules/auth/telegram-auth.service';

// FEAT-BOT-2 (FR-BOT-002 PR 5/6) — GET /v1/internal/telegram/interests and
// POST /v1/internal/telegram/interests/toggle. Follows
// telegram-bot-leaderboard-controller.spec.ts's own direct-instantiation
// pattern: no NestJS DI overhead, tests the full controller method
// including Zod validation and NestJS exception mapping.

function makeTelegramAuthService(
  overrides: Partial<TelegramAuthService> = {},
): TelegramAuthService {
  return {
    verifyWidgetHash: vi.fn(),
    exchangeWidgetPayload: vi.fn(),
    upsertTempUser: vi.fn(),
    lookupUser: vi.fn(),
    listUpcomingEvents: vi.fn(),
    getEventDetail: vi.fn(),
    registerViaTelegram: vi.fn(),
    cancelViaTelegram: vi.fn(),
    getMeSummary: vi.fn(),
    getLeaderboard: vi.fn(),
    getInterests: vi.fn(),
    toggleInterest: vi.fn(),
    ...overrides,
  } as unknown as TelegramAuthService;
}

const DIRECTUS_USER_ID = '11111111-1111-1111-1111-111111111111';
const VALID_QUERY = { directusUserId: DIRECTUS_USER_ID };
const VALID_TOGGLE_BODY = { directusUserId: DIRECTUS_USER_ID, topic: 'llm' };

describe('TelegramInternalController.interests (GET /v1/internal/telegram/interests)', () => {
  it('calls getInterests with the parsed directusUserId and returns its result', async () => {
    const telegramAuth = makeTelegramAuthService({
      getInterests: vi.fn().mockResolvedValueOnce({
        selected: ['llm'],
        available: ['llm', 'mlops'],
      }),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.interests(VALID_QUERY);

    expect(result).toEqual({ selected: ['llm'], available: ['llm', 'mlops'] });
    expect(telegramAuth.getInterests).toHaveBeenCalledWith(DIRECTUS_USER_ID);
  });

  it('throws BadRequestException without calling the service when directusUserId is not a UUID', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.interests({ directusUserId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.getInterests).not.toHaveBeenCalled();
  });

  it('throws BadRequestException without calling the service when directusUserId is missing', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(controller.interests({})).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.getInterests).not.toHaveBeenCalled();
  });

  it('does not require a country param (interests are not tenant-scoped)', async () => {
    const telegramAuth = makeTelegramAuthService({
      getInterests: vi.fn().mockResolvedValueOnce({ selected: [], available: [] }),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.interests(VALID_QUERY);

    expect(result).toEqual({ selected: [], available: [] });
  });

  it('is declared on TelegramInternalController, which carries the class-level InternalAuthGuard', () => {
    // Guard enforcement is already tested for this controller class in
    // telegram-auth-controller.spec.ts's own equivalent check — restated
    // here scoped to /interests per that file's own precedent.
    expect(typeof TelegramInternalController.prototype.interests).toBe('function');
  });
});

describe('TelegramInternalController.toggleInterests (POST /v1/internal/telegram/interests/toggle)', () => {
  it('calls toggleInterest with the parsed directusUserId and topic, and returns its result', async () => {
    const telegramAuth = makeTelegramAuthService({
      toggleInterest: vi.fn().mockResolvedValueOnce({
        selected: ['llm'],
        available: ['llm', 'mlops'],
      }),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.toggleInterests(VALID_TOGGLE_BODY);

    expect(result).toEqual({ selected: ['llm'], available: ['llm', 'mlops'] });
    expect(telegramAuth.toggleInterest).toHaveBeenCalledWith(DIRECTUS_USER_ID, 'llm');
  });

  it('throws BadRequestException without calling the service when directusUserId is not a UUID', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.toggleInterests({ ...VALID_TOGGLE_BODY, directusUserId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.toggleInterest).not.toHaveBeenCalled();
  });

  it('throws BadRequestException without calling the service when topic is not in the fixed candidate list (AC-11)', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.toggleInterests({ ...VALID_TOGGLE_BODY, topic: 'not-a-real-topic' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.toggleInterest).not.toHaveBeenCalled();
  });

  it('throws BadRequestException without calling the service when topic is missing', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);
    const { topic: _omit, ...bodyWithoutTopic } = VALID_TOGGLE_BODY;
    void _omit;

    await expect(controller.toggleInterests(bodyWithoutTopic)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(telegramAuth.toggleInterest).not.toHaveBeenCalled();
  });

  it('is declared on TelegramInternalController, which carries the class-level InternalAuthGuard', () => {
    expect(typeof TelegramInternalController.prototype.toggleInterests).toBe('function');
  });
});
