import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../src/modules/auth/auth.controller';
import type { AuthService } from '../src/modules/auth/auth.service';
import type { JtiRevocationService } from '../src/modules/auth/jti-revocation.service';
import type { JwtService } from '../src/modules/auth/jwt.service';
import type { MagicLinkService } from '../src/modules/auth/magic-link.service';
import type { RefreshTokenService } from '../src/modules/auth/refresh-token.service';
import type { RegistrationService } from '../src/modules/auth/registration.service';
import type { TelegramAuthService } from '../src/modules/auth/telegram-auth.service';
import type { UpgradeService } from '../src/modules/auth/upgrade.service';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { LeadsService } from '../src/modules/leads/leads.service';
import type { UsersService } from '../src/modules/users/users.service';

// FR-AUTH-003 AC-1/AC-2/AC-5 — tests for:
//   1. validateProvider() indirectly via login() — allowlist guards
//      against provider injection (SR-1: any non-google/github value
//      throws BadRequestException before startAuthorization is reached).
//   2. login() ?provider= forwarding — ensures startAuthorization
//      receives the provider arg when set, and omits it when absent.
//   3. callback() access_denied early-exit — user cancels OAuth consent
//      → redirect to error page, completeAuthorization is never called
//      (important: openid-client throws OPError for ?error= params, so
//      the guard must fire BEFORE completeAuthorization).

const AUTHORIZE_URL = 'https://auth.example.com/application/o/test/authorize?state=x';
const FLOW_COOKIE = 'aiqadam-oauth-flow';

function makeAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    startAuthorization: vi.fn().mockResolvedValue({
      authorizeUrl: AUTHORIZE_URL,
      flowToken: 'fake-flow-token',
      flowExpiresIn: 600,
    }),
    completeAuthorization: vi.fn().mockResolvedValue(null),
    postLoginRedirectUrl: vi.fn().mockReturnValue('http://localhost:4321/me'),
    ...overrides,
  } as unknown as AuthService;
}

interface MockRes {
  redirect: ReturnType<typeof vi.fn>;
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
}

function makeRes(): MockRes {
  return {
    redirect: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };
}

function makeController(auth: AuthService = makeAuthService()): AuthController {
  return new AuthController(
    auth,
    {} as UsersService,
    {} as RefreshTokenService,
    {} as JwtService,
    {} as JtiRevocationService,
    {} as DirectusUsersBridgeService,
    {} as LeadsService,
    {} as TelegramAuthService,
    {} as RegistrationService,
    {} as MagicLinkService,
    {} as UpgradeService,
  );
}

describe('AuthController.login — ?provider= forwarding (FR-AUTH-003)', () => {
  let res: MockRes;

  beforeEach(() => {
    res = makeRes();
    vi.clearAllMocks();
  });

  it('passes provider=google to startAuthorization and redirects to the authorize URL', async () => {
    const auth = makeAuthService();
    const controller = makeController(auth);

    await controller.login('/me', 'google', res as unknown as Response);

    expect(auth.startAuthorization).toHaveBeenCalledWith({ next: '/me', provider: 'google' });
    expect(res.cookie).toHaveBeenCalledWith(
      FLOW_COOKIE,
      'fake-flow-token',
      expect.objectContaining({ maxAge: 600_000 }),
    );
    expect(res.redirect).toHaveBeenCalledWith(AUTHORIZE_URL);
  });

  it('passes provider=github to startAuthorization', async () => {
    const auth = makeAuthService();
    const controller = makeController(auth);

    await controller.login('/events', 'github', res as unknown as Response);

    expect(auth.startAuthorization).toHaveBeenCalledWith({ next: '/events', provider: 'github' });
  });

  it('omits provider from startAuthorization when ?provider= is absent', async () => {
    const auth = makeAuthService();
    const controller = makeController(auth);

    await controller.login(undefined, undefined, res as unknown as Response);

    // Spread conditional ensures the key is absent entirely (not set to undefined).
    expect(auth.startAuthorization).toHaveBeenCalledWith({ next: '/' });
    expect(auth.startAuthorization).not.toHaveBeenCalledWith(
      expect.objectContaining({ provider: expect.anything() }),
    );
  });

  it('sanitises ?next= back to / when absent', async () => {
    const auth = makeAuthService();
    const controller = makeController(auth);

    await controller.login(undefined, 'google', res as unknown as Response);

    expect(auth.startAuthorization).toHaveBeenCalledWith({ next: '/', provider: 'google' });
  });

  it('throws BadRequestException for an unrecognised provider (SR-1)', async () => {
    const auth = makeAuthService();
    const controller = makeController(auth);

    await expect(
      controller.login('/me', 'facebook', res as unknown as Response),
    ).rejects.toBeInstanceOf(BadRequestException);

    // startAuthorization must NEVER be reached — allowlist fires first.
    expect(auth.startAuthorization).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for a provider injection attempt (SR-1)', async () => {
    const controller = makeController();

    // Ampersand-separated injection attempt must not bypass the allowlist.
    await expect(
      controller.login('/me', 'google&source=evil', res as unknown as Response),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException for an empty string provider', async () => {
    const controller = makeController();

    await expect(
      controller.login('/me', '', res as unknown as Response),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuthController.callback — access_denied early exit (FR-AUTH-003 AC-5)', () => {
  let res: MockRes;

  beforeEach(() => {
    res = makeRes();
    vi.clearAllMocks();
  });

  it('redirects to /auth/sign-in?error=oauth_denied and skips completeAuthorization', async () => {
    const auth = makeAuthService();
    const controller = makeController(auth);
    const req = {
      cookies: {},
      query: { error: 'access_denied' },
      headers: {},
    } as unknown as Request;

    await controller.callback(req, res as unknown as Response);

    // WEB_BASE_URL is 'http://placeholder.invalid' in vitest.config.ts env.
    expect(res.redirect).toHaveBeenCalledWith(
      'http://placeholder.invalid/auth/sign-in?error=oauth_denied',
    );
    expect(auth.completeAuthorization).not.toHaveBeenCalled();
  });

  it('does not fire the access_denied guard when ?error= is absent', async () => {
    // The guard must be conditional — a normal callback (code + state
    // params, no error) must reach completeAuthorization.
    const auth = makeAuthService({
      completeAuthorization: vi.fn().mockRejectedValue(new Error('BadFlowCookie')),
    });
    const controller = makeController(auth);
    const req = {
      cookies: { [FLOW_COOKIE]: 'fake-flow' },
      query: { code: 'abc', state: 'xyz' },
      headers: {},
    } as unknown as Request;

    await expect(controller.callback(req, res as unknown as Response)).rejects.toThrow(
      'BadFlowCookie',
    );
    expect(auth.completeAuthorization).toHaveBeenCalledTimes(1);
  });

  it('does not fire the access_denied guard for unrelated ?error= values', async () => {
    // Only 'access_denied' triggers the guard — other error values proceed
    // to completeAuthorization (which will likely throw OPError, but that
    // is handled by the existing catch block, not the early-exit guard).
    const auth = makeAuthService({
      completeAuthorization: vi.fn().mockRejectedValue(new Error('OPError')),
    });
    const controller = makeController(auth);
    const req = {
      cookies: { [FLOW_COOKIE]: 'fake-flow' },
      query: { error: 'server_error', error_description: 'upstream failure' },
      headers: {},
    } as unknown as Request;

    await expect(controller.callback(req, res as unknown as Response)).rejects.toThrow('OPError');
    expect(auth.completeAuthorization).toHaveBeenCalledTimes(1);
  });
});
