import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Unit tests for MagicLinkService (FR-AUTH-004). Mocks AuthentikClient
// (same FakeAuthentik style as registration-service.spec.ts) and the
// `env` module-level singleton (vi.hoisted + vi.mock, mirroring
// admin-bootstrap.service.spec.ts's pattern) since
// AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID is read directly inside
// magic-link.service.ts via `import { env } from '../../config/env'`,
// not constructor-injected.
//
// Per 06-test-strategy.md's Unit Test Plan: the six requestMagicLink
// failure-path cases below are each a DISTINCT test, not one combined
// test — this is what makes the controller-level anti-enumeration
// regression test (magic-link-controller.spec.ts) actually true rather
// than merely asserted at one call site.

const mockEnv = vi.hoisted(() => ({
  AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID: 'stage-uuid-1234' as string | undefined,
  AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN: 'magic-link.aiqadam.internal' as string | undefined,
}));

vi.mock('../src/config/env', () => ({ env: mockEnv }));

// Imports AFTER the mock is hoisted so the module under test sees the fake env.
import { AuthentikError } from '../src/modules/admin-invites/authentik.client';
import type { AuthentikClient, AuthentikUser } from '../src/modules/admin-invites/authentik.client';
import { MagicLinkService, magicLinkRequestSchema } from '../src/modules/auth/magic-link.service';

type FakeAuthentik = {
  isConfigured: ReturnType<typeof vi.fn>;
  getUserByEmail: ReturnType<typeof vi.fn>;
  createUser: ReturnType<typeof vi.fn>;
  sendMagicLinkEmail: ReturnType<typeof vi.fn>;
};

const AK_USER: AuthentikUser = {
  pk: 909,
  username: 'placeholder',
  email: 'placeholder@example.com',
  name: 'Placeholder',
  is_active: true,
  uid: 'ak-uid-909',
  groups: [],
  groups_obj: [],
  attributes: {},
};

const TEST_EMAIL = 'sign.in@example.com';
const STAGE_UUID = 'stage-uuid-1234';
const BRAND_DOMAIN = 'magic-link.aiqadam.internal';

let authentik: FakeAuthentik;
let svc: MagicLinkService;

beforeEach(() => {
  mockEnv.AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID = STAGE_UUID;
  mockEnv.AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN = BRAND_DOMAIN;
  authentik = {
    isConfigured: vi.fn().mockReturnValue(true),
    getUserByEmail: vi.fn().mockResolvedValue({ ...AK_USER, email: TEST_EMAIL }),
    createUser: vi.fn().mockResolvedValue({ ...AK_USER }),
    sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  };
  svc = new MagicLinkService(authentik as unknown as AuthentikClient);
});

// ─── magicLinkRequestSchema ─────────────────────────────────────────────
//
// Re-exports emailField(200) — emailField's own canonicalization/rejection
// rules (trim/lowercase, plus-addressing, malformed, max length) already
// have exhaustive dedicated coverage in email-schema.spec.ts. These tests
// only confirm magicLinkRequestSchema is wired to emailField correctly,
// not re-derive emailField's own behavior.

describe('magicLinkRequestSchema', () => {
  it('accepts a plain email and canonicalizes it (trim + lowercase)', () => {
    const res = magicLinkRequestSchema.safeParse({ email: '  Sign.In@Example.com  ' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.email).toBe('sign.in@example.com');
  });

  it('rejects a malformed email', () => {
    const res = magicLinkRequestSchema.safeParse({ email: 'not-an-email' });
    expect(res.success).toBe(false);
  });

  it('rejects a plus-addressed email', () => {
    const res = magicLinkRequestSchema.safeParse({ email: 'sign.in+tag@example.com' });
    expect(res.success).toBe(false);
  });

  it('rejects an email exceeding the 200-char max length', () => {
    const long = `${'a'.repeat(200)}@example.com`;
    const res = magicLinkRequestSchema.safeParse({ email: long });
    expect(res.success).toBe(false);
  });
});

// ─── MagicLinkService.requestMagicLink ──────────────────────────────────

describe('MagicLinkService.requestMagicLink — existing user found', () => {
  it('calls sendMagicLinkEmail with the existing user pk + configured stage UUID, never createUser', async () => {
    // Arrange — see beforeEach; getUserByEmail resolves to an existing user.

    // Act
    await svc.requestMagicLink(TEST_EMAIL);

    // Assert
    expect(authentik.getUserByEmail).toHaveBeenCalledWith(TEST_EMAIL);
    expect(authentik.createUser).not.toHaveBeenCalled();
    expect(authentik.sendMagicLinkEmail).toHaveBeenCalledWith(AK_USER.pk, STAGE_UUID, BRAND_DOMAIN);
  });
});

describe('MagicLinkService.requestMagicLink — no user found', () => {
  it('derives a username, calls createUser, then sendMagicLinkEmail with the newly-created pk', async () => {
    // Arrange
    authentik.getUserByEmail.mockResolvedValueOnce(null);
    const NEW_USER = { ...AK_USER, pk: 12345, email: TEST_EMAIL };
    authentik.createUser.mockResolvedValueOnce(NEW_USER);

    // Act
    await svc.requestMagicLink(TEST_EMAIL);

    // Assert — createUser called with a derived username + the real email.
    expect(authentik.createUser).toHaveBeenCalledTimes(1);
    const createUserArg = authentik.createUser.mock.calls[0]?.[0] as {
      email: string;
      username: string;
      name: string;
      attributes: Record<string, unknown>;
    };
    expect(createUserArg.email).toBe(TEST_EMAIL);
    expect(createUserArg.username).toMatch(/^[a-z0-9.]+$/);
    expect(createUserArg.attributes).toEqual({});

    // Assert — the email is sent to the NEW user's pk, not the old fixture's.
    expect(authentik.sendMagicLinkEmail).toHaveBeenCalledWith(NEW_USER.pk, STAGE_UUID, BRAND_DOMAIN);
  });
});

describe('MagicLinkService.requestMagicLink — configuration gaps (not swallowed)', () => {
  it('throws ServiceUnavailableException("authentik_not_configured") when the admin client is not configured, no Authentik calls made', async () => {
    // Arrange
    authentik.isConfigured.mockReturnValue(false);

    // Act / Assert
    await expect(svc.requestMagicLink(TEST_EMAIL)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(svc.requestMagicLink(TEST_EMAIL)).rejects.toMatchObject({
      message: 'authentik_not_configured',
    });
    expect(authentik.getUserByEmail).not.toHaveBeenCalled();
    expect(authentik.createUser).not.toHaveBeenCalled();
    expect(authentik.sendMagicLinkEmail).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException("magic_link_not_configured") when the email stage UUID is unset, no Authentik calls made', async () => {
    // Arrange
    mockEnv.AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID = undefined;

    // Act / Assert
    await expect(svc.requestMagicLink(TEST_EMAIL)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(svc.requestMagicLink(TEST_EMAIL)).rejects.toMatchObject({
      message: 'magic_link_not_configured',
    });
    expect(authentik.getUserByEmail).not.toHaveBeenCalled();
    expect(authentik.createUser).not.toHaveBeenCalled();
    expect(authentik.sendMagicLinkEmail).not.toHaveBeenCalled();
  });

  // Step 8 retry fix — see this file's header comment + 07-test-results.md's
  // CRITICAL FINDING. AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN is the Host-header
  // value that actually determines which Authentik flow the sent email's
  // link targets; missing it is the same class of deployment/config gap as
  // a missing email stage UUID, so it fails closed identically.
  it('throws ServiceUnavailableException("magic_link_not_configured") when the brand domain is unset, no Authentik calls made', async () => {
    // Arrange
    mockEnv.AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN = undefined;

    // Act / Assert
    await expect(svc.requestMagicLink(TEST_EMAIL)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(svc.requestMagicLink(TEST_EMAIL)).rejects.toMatchObject({
      message: 'magic_link_not_configured',
    });
    expect(authentik.getUserByEmail).not.toHaveBeenCalled();
    expect(authentik.createUser).not.toHaveBeenCalled();
    expect(authentik.sendMagicLinkEmail).not.toHaveBeenCalled();
  });
});

// ─── Anti-enumeration guarantee: internal errors are swallowed, never
// rethrown, at every step after the configuration check. Each step is a
// SEPARATE test per the test strategy's explicit "isolate which internal
// step failed" discipline. ─────────────────────────────────────────────

describe('MagicLinkService.requestMagicLink — internal errors are swallowed (anti-enumeration)', () => {
  it('resolves (does not rethrow) when getUserByEmail throws an AuthentikError', async () => {
    // Arrange
    authentik.getUserByEmail.mockRejectedValueOnce(
      new AuthentikError(503, '/core/users/', 'upstream unavailable'),
    );
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act / Assert — resolves undefined, no throw.
    await expect(svc.requestMagicLink(TEST_EMAIL)).resolves.toBeUndefined();

    // Assert — swallow was logged, not silent.
    expect(warnSpy).toHaveBeenCalled();
    expect(authentik.createUser).not.toHaveBeenCalled();
    expect(authentik.sendMagicLinkEmail).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('resolves (does not rethrow) when getUserByEmail throws a generic Error', async () => {
    // Arrange
    authentik.getUserByEmail.mockRejectedValueOnce(new TypeError('fetch failed'));
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act / Assert
    await expect(svc.requestMagicLink(TEST_EMAIL)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('resolves (does not rethrow) when createUser throws mid-request (no existing user found)', async () => {
    // Arrange
    authentik.getUserByEmail.mockResolvedValueOnce(null);
    authentik.createUser.mockRejectedValueOnce(
      new AuthentikError(500, '/core/users/', 'internal error'),
    );
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act / Assert
    await expect(svc.requestMagicLink(TEST_EMAIL)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    expect(authentik.sendMagicLinkEmail).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('resolves (does not rethrow) when sendMagicLinkEmail throws', async () => {
    // Arrange
    authentik.sendMagicLinkEmail.mockRejectedValueOnce(
      new AuthentikError(502, '/core/users/909/recovery_email/', 'bad gateway'),
    );
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act / Assert
    await expect(svc.requestMagicLink(TEST_EMAIL)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─── deriveUsername (private, exercised black-box through
// requestMagicLink's effect on createUser's call args — same technique
// registration-service.spec.ts uses for RegistrationService.deriveUsername) ──

describe('MagicLinkService — username derivation (exercised via createUser call args)', () => {
  beforeEach(() => {
    authentik.getUserByEmail.mockResolvedValue(null);
  });

  it('slugifies the local-part to lowercase [a-z0-9.] with a randomBytes(3)-hex suffix', async () => {
    await svc.requestMagicLink('Weird.Email@example.com');

    const createUserArg = authentik.createUser.mock.calls[0]?.[0] as { username: string };
    // base '.' suffix (6 hex chars from randomBytes(3).toString('hex')).
    expect(createUserArg.username).toMatch(/^[a-z0-9.]+\.[0-9a-f]{6}$/);
    expect(createUserArg.username.startsWith('weird.email')).toBe(true);
  });

  it('falls back to a "user"-based base when the local-part has no valid characters', async () => {
    // A local-part that survives Zod's emailField (no '+', valid per
    // z.string().email()) but is entirely stripped by deriveUsername's
    // [^a-z0-9.] filter, leaving an empty slug.
    await svc.requestMagicLink('___@example.com');

    const createUserArg = authentik.createUser.mock.calls[0]?.[0] as { username: string };
    expect(createUserArg.username).toMatch(/^[a-z0-9.]+\.[0-9a-f]{6}$/);
    expect(createUserArg.username.startsWith('user')).toBe(true);
  });
});
