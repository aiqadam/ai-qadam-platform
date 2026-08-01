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
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { LeadsService } from '../src/modules/leads/leads.service';
import type { User } from '../src/modules/users/schema';
import type { UsersService } from '../src/modules/users/users.service';

// FR-AUTH-004 AC-7 guard — no dedicated callback() test existed before
// this workflow (grep confirmed: auth-controller-refresh.spec.ts /
// auth-controller-signout.spec.ts cover sibling methods only). This
// workflow's ONLY change to callback() is a comment-only FR-AUTH-006
// extension-seam marker at the upsertByAuthentikSubject() call site — no
// behavioral change. Scope stays narrow, per 06-test-strategy.md: confirm
// the funnel still calls upsertByAuthentikSubject + mintSession exactly
// once each on a successful flow, NOT a full re-test of the OIDC exchange
// (that's AuthService.completeAuthorization's own test territory).

const AUTHENTIK_SUB = 'authentik|abc123';
const USER_EMAIL = 'member@example.com';

const COMPLETE_AUTHORIZATION_RESULT = {
  sub: AUTHENTIK_SUB,
  email: USER_EMAIL,
  displayName: 'Test Member',
  idToken: 'fake.id.token',
  groups: ['aiqadam-member'],
  next: '/me',
};

const UPSERTED_USER = {
  id: 'user-uuid-1',
  authentikSubject: AUTHENTIK_SUB,
  email: USER_EMAIL,
  displayName: 'Test Member',
} as unknown as User;

function makeAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    completeAuthorization: vi.fn().mockResolvedValue(COMPLETE_AUTHORIZATION_RESULT),
    postLoginRedirectUrl: vi.fn().mockReturnValue('http://localhost:4321/me'),
    mintSession: vi.fn().mockResolvedValue({
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      refreshExpiresAt: new Date('2026-08-15T00:00:00Z'),
    }),
    ...overrides,
  } as unknown as AuthService;
}

function makeUsersService(overrides: Partial<UsersService> = {}): UsersService {
  return {
    upsertByAuthentikSubject: vi.fn().mockResolvedValue(UPSERTED_USER),
    ...overrides,
  } as unknown as UsersService;
}

function makeDirectusBridge(overrides: Partial<DirectusUsersBridgeService> = {}): DirectusUsersBridgeService {
  return {
    ensureLinked: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as DirectusUsersBridgeService;
}

function makeLeads(overrides: Partial<LeadsService> = {}): LeadsService {
  return {
    convertLeadToMember: vi.fn().mockResolvedValue({ converted: false }),
    ...overrides,
  } as unknown as LeadsService;
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

function makeReq(): Request {
  return {
    cookies: { 'aiqadam-oauth-flow': 'fake-flow-cookie' },
    query: { code: 'fake-code', state: 'fake-state' },
    headers: {},
  } as unknown as Request;
}

function makeAuthController(overrides: {
  auth?: AuthService;
  users?: UsersService;
  directusBridge?: DirectusUsersBridgeService;
  leads?: LeadsService;
}): AuthController {
  return new AuthController(
    overrides.auth ?? makeAuthService(),
    overrides.users ?? makeUsersService(),
    {} as RefreshTokenService,
    {} as JwtService,
    {} as JtiRevocationService,
    overrides.directusBridge ?? makeDirectusBridge(),
    overrides.leads ?? makeLeads(),
    {} as TelegramAuthService,
    {} as RegistrationService,
    {} as MagicLinkService,
  );
}

describe('AuthController.callback — funnel regression guard (FR-AUTH-004 AC-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls upsertByAuthentikSubject and mintSession exactly once each on a successful flow', async () => {
    const auth = makeAuthService();
    const users = makeUsersService();
    const controller = makeAuthController({ auth, users });
    const res = makeRes();

    await controller.callback(makeReq(), res as unknown as Response);

    expect(users.upsertByAuthentikSubject).toHaveBeenCalledTimes(1);
    expect(users.upsertByAuthentikSubject).toHaveBeenCalledWith({
      authentikSubject: AUTHENTIK_SUB,
      email: USER_EMAIL,
      displayName: 'Test Member',
    });
    expect(auth.mintSession).toHaveBeenCalledTimes(1);
    expect(auth.mintSession).toHaveBeenCalledWith({
      userId: UPSERTED_USER.id,
      authentikSubject: UPSERTED_USER.authentikSubject,
      email: UPSERTED_USER.email,
      idToken: COMPLETE_AUTHORIZATION_RESULT.idToken,
      groups: COMPLETE_AUTHORIZATION_RESULT.groups,
    });
  });

  it('sets the refresh cookie and redirects to the resolved post-login URL — single funnel, no parallel session-issuance path', async () => {
    const auth = makeAuthService();
    const controller = makeAuthController({ auth });
    const res = makeRes();

    await controller.callback(makeReq(), res as unknown as Response);

    expect(res.cookie).toHaveBeenCalledWith(
      'aiqadam-refresh',
      'fake-refresh-token',
      expect.objectContaining({ expires: new Date('2026-08-15T00:00:00Z') }),
    );
    expect(res.redirect).toHaveBeenCalledWith('http://localhost:4321/me');
  });
});
