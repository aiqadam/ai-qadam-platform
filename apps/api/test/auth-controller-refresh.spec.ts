import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../src/modules/auth/auth.controller';
import type { AuthService } from '../src/modules/auth/auth.service';
import type { JtiRevocationService } from '../src/modules/auth/jti-revocation.service';
import type { JwtService } from '../src/modules/auth/jwt.service';
import {
  RefreshTokenInvalidError,
  RefreshTokenReplayError,
  type RefreshTokenService,
} from '../src/modules/auth/refresh-token.service';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { LeadsService } from '../src/modules/leads/leads.service';
import type { UsersService } from '../src/modules/users/users.service';

// Regression test for the 2026-05-23 production incident: a revoked
// refresh cookie made /v1/auth/refresh return 500 because
// RefreshTokenInvalidError (a plain Error subclass) wasn't caught and
// Nest's default filter mapped it to 500. The AdminUserCreateForm
// bootstrap interprets non-401 errors as backend brokenness ("Backend
// error checking admin permission") instead of redirecting to sign-in,
// leaving the workspace cabinet apparently down.
//
// The fix: catch RefreshTokenInvalidError + RefreshTokenReplayError in
// the controller, clear the cookies, throw UnauthorizedException so
// the browser sees a clean 401 + the form redirects to Authentik.

interface MockRes {
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
}

function makeReq(cookieValue?: string): Request {
  return {
    cookies: cookieValue === undefined ? {} : { 'aiqadam-refresh': cookieValue },
    headers: {},
  } as unknown as Request;
}

function makeRes(): MockRes {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  };
}

function makeController(refreshTokens: Partial<RefreshTokenService>): AuthController {
  return new AuthController(
    {} as AuthService,
    {} as UsersService,
    refreshTokens as RefreshTokenService,
    {} as JwtService,
    {} as JtiRevocationService,
    {} as DirectusUsersBridgeService,
    {} as LeadsService,
  );
}

describe('AuthController.refresh — error mapping', () => {
  let res: MockRes;

  beforeEach(() => {
    res = makeRes();
  });

  it('throws UnauthorizedException (401) on RefreshTokenInvalidError (revoked cookie)', async () => {
    const controller = makeController({
      consume: vi.fn().mockRejectedValue(new RefreshTokenInvalidError('revoked')),
    });
    await expect(
      controller.refresh(makeReq('stale-token-value'), res as unknown as Response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // Cookies cleared so the browser doesn't keep replaying the bad cookie.
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('throws UnauthorizedException (401) on RefreshTokenInvalidError (expired)', async () => {
    const controller = makeController({
      consume: vi.fn().mockRejectedValue(new RefreshTokenInvalidError('expired')),
    });
    await expect(
      controller.refresh(makeReq('expired-token'), res as unknown as Response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws UnauthorizedException (401) on RefreshTokenReplayError (family killed)', async () => {
    const controller = makeController({
      consume: vi.fn().mockRejectedValue(new RefreshTokenReplayError()),
    });
    await expect(
      controller.refresh(makeReq('replayed-token'), res as unknown as Response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('throws UnauthorizedException (401) when refresh cookie is absent', async () => {
    const controller = makeController({
      consume: vi.fn(),
    });
    await expect(controller.refresh(makeReq(), res as unknown as Response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('re-throws non-domain errors unchanged (NOT mapped to 401)', async () => {
    const dbError = new Error('connection terminated unexpectedly');
    const controller = makeController({
      consume: vi.fn().mockRejectedValue(dbError),
    });
    await expect(controller.refresh(makeReq('any-token'), res as unknown as Response)).rejects.toBe(
      dbError,
    );
    // Cookies NOT cleared — the cookie is fine, server isn't.
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});
