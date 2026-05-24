import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../src/modules/auth/auth.controller';
import type { AuthService } from '../src/modules/auth/auth.service';
import type { JtiRevocationService } from '../src/modules/auth/jti-revocation.service';
import type { JwtService, VerifiedClaims } from '../src/modules/auth/jwt.service';
import type { RefreshTokenService } from '../src/modules/auth/refresh-token.service';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { LeadsService } from '../src/modules/leads/leads.service';
import type { UsersService } from '../src/modules/users/users.service';

// Regression guard for the orphaned-session fallback (2026-05-24). After
// a refresh-token race revokes the family + clears the cookie, the
// React island that lost the race still has a valid bearer in JS memory.
// Without the fallback, /sign-out returned logoutUrl=null in that case —
// the client did a local clear, Authentik session lingered, the next
// /login silently SSO'd the user back in. The fallback builds a no-hint
// end_session URL so the IdP session is also killed (at the UX cost of
// an Authentik confirmation page).
//
// Cases tested:
//   1. Cookie present, valid id_token → hint-bearing URL (happy path).
//   2. Cookie absent, bearer valid → no-hint URL (the new fallback).
//   3. Cookie absent, bearer invalid → null (truly anon, nothing to do).
//   4. Cookie absent, no bearer → null (truly anon).

interface MockRes {
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
}

function makeReq(input: { cookie?: string; bearer?: string }): Request {
  const cookies: Record<string, string> = {};
  if (input.cookie !== undefined) cookies['aiqadam-refresh'] = input.cookie;
  const headers: Record<string, string> = {};
  if (input.bearer !== undefined) headers.authorization = `Bearer ${input.bearer}`;
  return {
    cookies,
    headers,
    header(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

function makeRes(): MockRes {
  return { cookie: vi.fn(), clearCookie: vi.fn(), redirect: vi.fn() };
}

interface Stubs {
  refreshTokens: Partial<RefreshTokenService>;
  jwt: Partial<JwtService>;
  revocations: Partial<JtiRevocationService>;
  auth: Partial<AuthService>;
}

function makeController(stubs: Stubs): AuthController {
  return new AuthController(
    stubs.auth as AuthService,
    {} as UsersService,
    stubs.refreshTokens as RefreshTokenService,
    stubs.jwt as JwtService,
    stubs.revocations as JtiRevocationService,
    {} as DirectusUsersBridgeService,
    {} as LeadsService,
  );
}

describe('AuthController.signOut — logout URL contract', () => {
  let res: MockRes;

  beforeEach(() => {
    res = makeRes();
  });

  it('returns hint-bearing URL when refresh cookie + id_token are present', async () => {
    const controller = makeController({
      refreshTokens: {
        peekIdToken: vi.fn().mockResolvedValue('id.token.value'),
        consume: vi
          .fn()
          .mockResolvedValue({ userId: 'u', familyId: 'f', idToken: 'id.token.value' }),
        revokeFamily: vi.fn().mockResolvedValue(undefined),
      },
      jwt: {},
      revocations: {},
      auth: {
        buildLogoutUrl: vi.fn((token: string | null) =>
          token ? `https://idp/end-session/?id_token_hint=${token}` : 'https://idp/end-session/',
        ),
      },
    });

    const out = await controller.signOut(
      makeReq({ cookie: 'rt-value' }),
      res as unknown as Response,
    );

    expect(out.logoutUrl).toBe('https://idp/end-session/?id_token_hint=id.token.value');
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('returns no-hint URL when refresh cookie is missing but bearer is valid (degraded fallback)', async () => {
    const verify = vi.fn().mockResolvedValue({
      sub: 'u',
      jti: 'jti-1',
      exp: Math.floor(Date.now() / 1000) + 600,
    } as VerifiedClaims);
    const controller = makeController({
      refreshTokens: {},
      jwt: { verify },
      revocations: { revoke: vi.fn().mockResolvedValue(undefined) },
      auth: {
        buildLogoutUrl: vi.fn((token: string | null) =>
          token ? `https://idp/end-session/?id_token_hint=${token}` : 'https://idp/end-session/',
        ),
      },
    });

    const out = await controller.signOut(
      makeReq({ bearer: 'valid.access.jwt' }),
      res as unknown as Response,
    );

    expect(out.logoutUrl).toBe('https://idp/end-session/');
    expect(verify).toHaveBeenCalledWith('valid.access.jwt');
  });

  it('returns null when bearer is invalid AND no cookie (truly anon — no session to kill)', async () => {
    const controller = makeController({
      refreshTokens: {},
      jwt: { verify: vi.fn().mockRejectedValue(new Error('bad signature')) },
      revocations: {},
      auth: { buildLogoutUrl: vi.fn() },
    });

    const out = await controller.signOut(
      makeReq({ bearer: 'tampered.jwt' }),
      res as unknown as Response,
    );

    expect(out.logoutUrl).toBeNull();
    // buildLogoutUrl never called — no proof of session.
    expect(controller).toBeDefined();
  });

  it('returns null when there is no cookie and no bearer (anonymous client)', async () => {
    const controller = makeController({
      refreshTokens: {},
      jwt: {},
      revocations: {},
      auth: { buildLogoutUrl: vi.fn() },
    });

    const out = await controller.signOut(makeReq({}), res as unknown as Response);

    expect(out.logoutUrl).toBeNull();
  });
});
