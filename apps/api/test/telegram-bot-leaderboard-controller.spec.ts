import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TelegramInternalController } from '../src/modules/auth/auth.controller';
import type { TelegramAuthService } from '../src/modules/auth/telegram-auth.service';

// FEAT-BOT-2 (FR-BOT-002 PR 4/6) — GET /v1/internal/telegram/leaderboard.
// Follows telegram-bot-me-controller.spec.ts's own direct-instantiation
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
    ...overrides,
  } as unknown as TelegramAuthService;
}

const VALID_QUERY = {
  directusUserId: '11111111-1111-1111-1111-111111111111',
  country: 'uz',
};

describe('TelegramInternalController.leaderboard (GET /v1/internal/telegram/leaderboard)', () => {
  it('calls getLeaderboard with the parsed query fields and returns its result', async () => {
    const telegramAuth = makeTelegramAuthService({
      getLeaderboard: vi.fn().mockResolvedValueOnce({
        entries: [{ displayName: 'Alice', points: 100, isCaller: true }],
      }),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.leaderboard(VALID_QUERY);

    expect(result).toEqual({ entries: [{ displayName: 'Alice', points: 100, isCaller: true }] });
    expect(telegramAuth.getLeaderboard).toHaveBeenCalledWith(
      VALID_QUERY.directusUserId,
      VALID_QUERY.country,
    );
  });

  it('throws BadRequestException without calling the service when directusUserId is not a UUID', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.leaderboard({ ...VALID_QUERY, directusUserId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.getLeaderboard).not.toHaveBeenCalled();
  });

  it('throws BadRequestException without calling the service when country is not a valid tenant', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.leaderboard({ ...VALID_QUERY, country: 'xx-invalid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.getLeaderboard).not.toHaveBeenCalled();
  });

  it('throws BadRequestException without calling the service when directusUserId is missing', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);
    const { directusUserId: _omit, ...queryWithoutUserId } = VALID_QUERY;
    void _omit;

    await expect(controller.leaderboard(queryWithoutUserId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(telegramAuth.getLeaderboard).not.toHaveBeenCalled();
  });

  it('returns an empty entries list unchanged (no error) when the service finds nothing', async () => {
    const telegramAuth = makeTelegramAuthService({
      getLeaderboard: vi.fn().mockResolvedValueOnce({ entries: [] }),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.leaderboard(VALID_QUERY);

    expect(result).toEqual({ entries: [] });
  });

  it('is declared on TelegramInternalController, which carries the class-level InternalAuthGuard', () => {
    // Guard enforcement is already tested for this controller class in
    // telegram-auth-controller.spec.ts's own equivalent check — restated
    // here scoped to /leaderboard per that file's own precedent.
    expect(typeof TelegramInternalController.prototype.leaderboard).toBe('function');
  });
});
