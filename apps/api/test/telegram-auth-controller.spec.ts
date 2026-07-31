import {
  BadRequestException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController, TelegramInternalController } from '../src/modules/auth/auth.controller';
import type {
  LookupUserResult,
  TelegramAuthService,
  UpsertTempUserResult,
} from '../src/modules/auth/telegram-auth.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import type { JtiRevocationService } from '../src/modules/auth/jti-revocation.service';
import type { JwtService } from '../src/modules/auth/jwt.service';
import type { RefreshTokenService } from '../src/modules/auth/refresh-token.service';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { LeadsService } from '../src/modules/leads/leads.service';
import type { UsersService } from '../src/modules/users/users.service';
import { InternalAuthGuard } from '../src/modules/internal/internal-auth.guard';

// ── Pattern: direct controller instantiation with mocked service ──────────────
//
// Follows registration-checkin.controller.spec.ts: no NestJS DI overhead,
// tests the full controller method including Zod validation and NestJS
// exception mapping.

// ── Shared mock builders ──────────────────────────────────────────────────────

function makeTelegramAuthService(
  overrides: Partial<TelegramAuthService> = {},
): TelegramAuthService {
  return {
    verifyWidgetHash: vi.fn(),
    exchangeWidgetPayload: vi.fn(),
    upsertTempUser: vi.fn(),
    lookupUser: vi.fn(),
    ...overrides,
  } as unknown as TelegramAuthService;
}

function makeAuthController(telegramAuth: TelegramAuthService): AuthController {
  return new AuthController(
    {} as AuthService,
    {} as UsersService,
    {} as RefreshTokenService,
    {} as JwtService,
    {} as JtiRevocationService,
    {} as DirectusUsersBridgeService,
    {} as LeadsService,
    telegramAuth,
  );
}

interface MockRes {
  setHeader: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
}

function makeRes(): MockRes {
  return {
    setHeader: vi.fn(),
    redirect: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };
}

// ── Valid widget payload fixture (Zod-clean, service call is mocked) ──────────

const VALID_EXCHANGE_BODY = {
  id: '123456789',
  first_name: 'Aigerim',
  username: 'aigerim_k',
  auth_date: Math.floor(Date.now() / 1000),
  // 64 lower-case hex chars — Zod just validates the shape; HMAC is checked by the service.
  hash: 'a'.repeat(64),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('AuthController.telegramExchange (POST /v1/auth/telegram/exchange)', () => {
  let res: MockRes;

  beforeEach(() => {
    res = makeRes();
    vi.clearAllMocks();
  });

  it('calls exchangeWidgetPayload and 302-redirects to the recovery URL on a valid payload', async () => {
    const RECOVERY_URL = 'https://auth.aiqadam.org/recovery/one-time-link';
    const telegramAuth = makeTelegramAuthService({
      exchangeWidgetPayload: vi.fn().mockResolvedValueOnce(RECOVERY_URL),
    });
    const controller = makeAuthController(telegramAuth);

    await controller.telegramExchange(VALID_EXCHANGE_BODY, res as unknown as Response);

    expect(telegramAuth.exchangeWidgetPayload).toHaveBeenCalledOnce();
    expect(telegramAuth.exchangeWidgetPayload).toHaveBeenCalledWith(
      expect.objectContaining({ id: VALID_EXCHANGE_BODY.id }),
    );
    expect(res.redirect).toHaveBeenCalledWith(HttpStatus.FOUND, RECOVERY_URL);
  });

  it('sets Cache-Control: no-store before the redirect to prevent proxy caching of one-use URLs', async () => {
    const telegramAuth = makeTelegramAuthService({
      exchangeWidgetPayload: vi.fn().mockResolvedValueOnce('https://auth.aiqadam.org/recovery/x'),
    });
    const controller = makeAuthController(telegramAuth);

    await controller.telegramExchange(VALID_EXCHANGE_BODY, res as unknown as Response);

    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    // setHeader must be called BEFORE redirect.
    const setHeaderOrder = res.setHeader.mock.invocationCallOrder[0];
    const redirectOrder = res.redirect.mock.invocationCallOrder[0];
    expect(setHeaderOrder).toBeLessThan(redirectOrder as number);
  });

  it('throws BadRequestException without calling the service when the body fails Zod validation', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = makeAuthController(telegramAuth);
    const invalidBody = { id: 'not-numeric!', hash: 'tooshort' };

    await expect(
      controller.telegramExchange(invalidBody, res as unknown as Response),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(telegramAuth.exchangeWidgetPayload).not.toHaveBeenCalled();
  });

  it('propagates UnauthorizedException from the service unchanged (hmac_invalid → 401)', async () => {
    const telegramAuth = makeTelegramAuthService({
      exchangeWidgetPayload: vi.fn().mockRejectedValueOnce(
        new UnauthorizedException('telegram_hmac_invalid'),
      ),
    });
    const controller = makeAuthController(telegramAuth);

    await expect(
      controller.telegramExchange(VALID_EXCHANGE_BODY, res as unknown as Response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('propagates ServiceUnavailableException from the service unchanged (not_configured → 503)', async () => {
    const telegramAuth = makeTelegramAuthService({
      exchangeWidgetPayload: vi.fn().mockRejectedValueOnce(
        new ServiceUnavailableException('telegram_not_configured'),
      ),
    });
    const controller = makeAuthController(telegramAuth);

    await expect(
      controller.telegramExchange(VALID_EXCHANGE_BODY, res as unknown as Response),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('verifies @Throttle decorator metadata is present on telegramExchange with limit=5 and ttl=900_000', () => {
    // The actual rate-limit enforcement is owned by @nestjs/throttler; here
    // we verify the decorator is correctly applied so a refactor that removes
    // it is caught immediately.
    //
    // @nestjs/throttler@6 stores each field under its own per-name key
    // (THROTTLER_LIMIT + name, THROTTLER_TTL + name, ...) via separate
    // Reflect.defineMetadata calls — not a single THROTTLER:THROTTLE key
    // holding a nested { default: { limit, ttl } } object.
    const limit: number | undefined = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      AuthController.prototype.telegramExchange,
    );
    const ttl: number | undefined = Reflect.getMetadata(
      'THROTTLER:TTLdefault',
      AuthController.prototype.telegramExchange,
    );

    expect(limit).toBe(5);
    expect(ttl).toBe(900_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('TelegramInternalController.upsertTempUser (POST /v1/internal/telegram/upsert-temp-user)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls upsertTempUser and returns the result for a valid body', async () => {
    const expectedResult: UpsertTempUserResult = {
      authentikUserId: 55,
      directusUserId: null,
      isNew: true,
    };
    const telegramAuth = makeTelegramAuthService({
      upsertTempUser: vi.fn().mockResolvedValueOnce(expectedResult),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.upsertTempUser({
      telegramId: '555555555',
      firstName: 'Aigerim',
      username: 'aigerim_k',
    });

    expect(result).toEqual(expectedResult);
    expect(telegramAuth.upsertTempUser).toHaveBeenCalledWith('555555555', 'Aigerim', 'aigerim_k');
  });

  it('throws BadRequestException without calling the service when telegramId is not numeric', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.upsertTempUser({ telegramId: 'not-a-number', firstName: 'Test' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(telegramAuth.upsertTempUser).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when firstName is missing', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.upsertTempUser({ telegramId: '123456789' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(telegramAuth.upsertTempUser).not.toHaveBeenCalled();
  });

  it('passes username=undefined to the service when username is omitted from body', async () => {
    const telegramAuth = makeTelegramAuthService({
      upsertTempUser: vi.fn().mockResolvedValueOnce({
        authentikUserId: 66,
        directusUserId: null,
        isNew: false,
      } as UpsertTempUserResult),
    });
    const controller = new TelegramInternalController(telegramAuth);

    await controller.upsertTempUser({ telegramId: '666666666', firstName: 'Bobur' });

    expect(telegramAuth.upsertTempUser).toHaveBeenCalledWith('666666666', 'Bobur', undefined);
  });

  it('verifies InternalAuthGuard is applied at the TelegramInternalController class level', () => {
    // Guard enforcement logic is tested in apps/api/test/internal.spec.ts.
    // Here we verify the decorator wiring isn't accidentally removed.
    const guards: (new (...args: unknown[]) => unknown)[] | undefined = Reflect.getMetadata(
      '__guards__',
      TelegramInternalController,
    );

    expect(Array.isArray(guards)).toBe(true);
    expect(guards?.some((g) => g === InternalAuthGuard)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FEAT-BOT-1 — Integration: TelegramInternalController.lookup +
// TelegramAuthService.lookupUser wired together (mocked service, real Zod
// validation + NestJS exception mapping exercised end-to-end at the
// controller-method level). Matches internal.spec.ts / checkin.integration.spec.ts
// convention — no Testcontainers Postgres, this endpoint has no Drizzle table.

describe('TelegramInternalController.lookup (POST /v1/internal/telegram/lookup)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── AC-1: full request/response cycle, happy path ────────────────────────

  it('returns the LookupUserResult from the service for a valid body', async () => {
    const expectedResult: LookupUserResult = {
      directusUserId: 'dir-user-1',
      isTemp: false,
      country: 'uz',
    };
    const telegramAuth = makeTelegramAuthService({
      lookupUser: vi.fn().mockResolvedValueOnce(expectedResult),
    });
    const controller = new TelegramInternalController(telegramAuth);

    const result = await controller.lookup({ telegramId: '123456789' });

    expect(result).toEqual(expectedResult);
    expect(telegramAuth.lookupUser).toHaveBeenCalledWith('123456789');
  });

  // ── Malformed/missing body → 400 (Zod at controller boundary) ────────────
  // Mirrors ensureLinkedUser's existing "rejects a body without email" /
  // "rejects a non-email" tests one-for-one (internal.spec.ts).

  it('throws BadRequestException without calling the service when the body is empty', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(controller.lookup({})).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.lookupUser).not.toHaveBeenCalled();
  });

  it('throws BadRequestException without calling the service when telegramId is not numeric', async () => {
    const telegramAuth = makeTelegramAuthService();
    const controller = new TelegramInternalController(telegramAuth);

    await expect(
      controller.lookup({ telegramId: 'not-numeric' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(telegramAuth.lookupUser).not.toHaveBeenCalled();
  });

  // ── AC-3: no Authentik user → 404, full controller path ──────────────────
  // Asserts the exact body, not just the status class — this is the
  // "distinguish unknown-user from API-down" contract the bot's
  // AuthMiddleware depends on structurally.

  it('propagates NotFoundException with { error: "telegram_user_not_found" } body when the service finds no user', async () => {
    const telegramAuth = makeTelegramAuthService({
      lookupUser: vi.fn().mockRejectedValueOnce(
        new NotFoundException({ error: 'telegram_user_not_found' }),
      ),
    });
    const controller = new TelegramInternalController(telegramAuth);

    try {
      await controller.lookup({ telegramId: '999999999' });
      expect.unreachable('lookup should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const body = (e as NotFoundException).getResponse() as { error: string };
      expect(body).toEqual({ error: 'telegram_user_not_found' });
    }
  });

  // ── AC-4: InternalAuthGuard applied to the new route ──────────────────────
  // Reuses (does not duplicate) the guard-behavior tests already in
  // internal.spec.ts's InternalAuthGuard describe block. The decisive
  // structural check per 02-impact-analysis.md Risk Flag #1 ("a misplaced
  // route outside TelegramInternalController would silently lose
  // protection") is that `lookup` lives in the SAME class as
  // `upsertTempUser`, which the class-level guard test above already
  // covers — restated here scoped to `lookup` specifically so a future
  // extraction of `lookup` into its own controller is caught.

  it('is declared on TelegramInternalController, which carries the class-level InternalAuthGuard', () => {
    expect(typeof TelegramInternalController.prototype.lookup).toBe('function');
    const guards: (new (...args: unknown[]) => unknown)[] | undefined = Reflect.getMetadata(
      '__guards__',
      TelegramInternalController,
    );
    expect(guards?.some((g) => g === InternalAuthGuard)).toBe(true);
  });

  // ── AC-5: read-path idempotency across two rapid identical calls ─────────

  it('returns an identical result across two rapid identical calls with no extra service calls beyond lookupUser', async () => {
    const expectedResult: LookupUserResult = {
      directusUserId: null,
      isTemp: true,
      country: null,
    };
    const lookupUserMock = vi.fn().mockResolvedValue(expectedResult);
    const telegramAuth = makeTelegramAuthService({ lookupUser: lookupUserMock });
    const controller = new TelegramInternalController(telegramAuth);

    const first = await controller.lookup({ telegramId: '444444444' });
    const second = await controller.lookup({ telegramId: '444444444' });

    expect(first).toEqual(expectedResult);
    expect(second).toEqual(expectedResult);
    expect(lookupUserMock).toHaveBeenCalledTimes(2);
    expect(lookupUserMock).toHaveBeenNthCalledWith(1, '444444444');
    expect(lookupUserMock).toHaveBeenNthCalledWith(2, '444444444');
  });
});
