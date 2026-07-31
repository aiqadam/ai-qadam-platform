import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TelegramInternalController } from '../src/modules/auth/auth.controller';
import type { TelegramAuthService } from '../src/modules/auth/telegram-auth.service';

// FEAT-BOT-2 (FR-BOT-002 PR 2/6) — POST/DELETE /v1/internal/telegram/register.
// Follows telegram-auth-controller.spec.ts's own direct-instantiation
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
    ...overrides,
  } as unknown as TelegramAuthService;
}

const VALID_BODY = {
  directusUserId: '11111111-1111-1111-1111-111111111111',
  eventId: '22222222-2222-2222-2222-222222222222',
  country: 'uz',
};

// ─────────────────────────────────────────────────────────────────────────────

describe('TelegramInternalController.register (POST /v1/internal/telegram/register)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls registerViaTelegram with the parsed body fields and returns its result', async () => {
    const telegramAuth = makeTelegramAuthService({
      registerViaTelegram: vi
        .fn()
        .mockResolvedValueOnce({ status: 'registered', eventTitle: 'Meetup #1' }),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.register(VALID_BODY);

    expect(result).toEqual({ status: 'registered', eventTitle: 'Meetup #1' });
    expect(telegramAuth.registerViaTelegram).toHaveBeenCalledWith(
      VALID_BODY.directusUserId,
      VALID_BODY.eventId,
      VALID_BODY.country,
    );
  });

  it('throws BadRequestException without calling the service when directusUserId is not a UUID', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.register({ ...VALID_BODY, directusUserId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.registerViaTelegram).not.toHaveBeenCalled();
  });

  it('throws BadRequestException without calling the service when eventId is missing', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);
    const { eventId: _omit, ...bodyWithoutEventId } = VALID_BODY;
    void _omit;

    await expect(controller.register(bodyWithoutEventId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(telegramAuth.registerViaTelegram).not.toHaveBeenCalled();
  });

  it('throws BadRequestException without calling the service when country is not a valid tenant', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.register({ ...VALID_BODY, country: 'xx-invalid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.registerViaTelegram).not.toHaveBeenCalled();
  });

  it('propagates NotFoundException from the service unchanged (event_not_found -> 404)', async () => {
    const telegramAuth = makeTelegramAuthService({
      registerViaTelegram: vi
        .fn()
        .mockRejectedValueOnce(new NotFoundException({ error: 'event_not_found' })),
    });
    const controller = new TelegramInternalController(telegramAuth);

    await expect(controller.register(VALID_BODY)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates ConflictException from the service unchanged (consent_required -> 409)', async () => {
    const telegramAuth = makeTelegramAuthService({
      registerViaTelegram: vi
        .fn()
        .mockRejectedValueOnce(new ConflictException({ error: 'consent_required' })),
    });
    const controller = new TelegramInternalController(telegramAuth);

    await expect(controller.register(VALID_BODY)).rejects.toBeInstanceOf(ConflictException);
  });

  it('is declared on TelegramInternalController, which carries the class-level InternalAuthGuard', () => {
    // Guard enforcement is already tested for this controller class in
    // telegram-auth-controller.spec.ts's own equivalent check — restated
    // here scoped to register/cancel per that file's own precedent
    // ("so a future extraction ... is caught").
    expect(typeof TelegramInternalController.prototype.register).toBe('function');
    expect(typeof TelegramInternalController.prototype.cancel).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('TelegramInternalController.cancel (DELETE /v1/internal/telegram/register)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls cancelViaTelegram with the parsed body fields and returns its result', async () => {
    const telegramAuth = makeTelegramAuthService({
      cancelViaTelegram: vi.fn().mockResolvedValueOnce({ status: 'cancelled' }),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.cancel(VALID_BODY);

    expect(result).toEqual({ status: 'cancelled' });
    expect(telegramAuth.cancelViaTelegram).toHaveBeenCalledWith(
      VALID_BODY.directusUserId,
      VALID_BODY.eventId,
      VALID_BODY.country,
    );
  });

  it('returns status: not_registered without throwing (not an error case)', async () => {
    const telegramAuth = makeTelegramAuthService({
      cancelViaTelegram: vi.fn().mockResolvedValueOnce({ status: 'not_registered' }),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.cancel(VALID_BODY);

    expect(result).toEqual({ status: 'not_registered' });
  });

  it('throws BadRequestException without calling the service when the body is empty', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(controller.cancel({})).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.cancelViaTelegram).not.toHaveBeenCalled();
  });

  it('propagates NotFoundException from the service unchanged (event_not_found -> 404)', async () => {
    const telegramAuth = makeTelegramAuthService({
      cancelViaTelegram: vi
        .fn()
        .mockRejectedValueOnce(new NotFoundException({ error: 'event_not_found' })),
    });
    const controller = new TelegramInternalController(telegramAuth);

    await expect(controller.cancel(VALID_BODY)).rejects.toBeInstanceOf(NotFoundException);
  });
});
