// Unit tests for AdminBootstrapService (FR-ADM-010 — platform-admin
// bootstrap, no manual scripts). Mocks AuthentikClient (FakeAuthentik,
// mirroring admin-invites-service.spec.ts's pattern) and the `env`
// module-level singleton (vi.hoisted + vi.mock, mirroring
// email-service-mode.spec.ts's pattern — env.ADMIN_BOOTSTRAP_* is read
// directly inside admin-bootstrap.service.ts via
// `import { env } from '../../config/env'`, not injected via
// constructor, so overriding it per-test requires the module mock, not
// constructor args).
//
// Per 06-test-strategy.md: rubric score 2 (< 4 integration threshold),
// unit-only. onModuleInit() is the sole public entry point; private
// methods (hasSuperAdminMember/seedAdmin/createOrRecoverSeedUser) are
// exercised indirectly through its behavioral branches, matching
// standards.md's "test the public interface, not internals" guidance.

import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  ADMIN_BOOTSTRAP_EMAIL: 'admin@aiqadam.org',
  ADMIN_BOOTSTRAP_DEFAULT_PASSWORD: 'a-fixed-seed-passw0rd!' as string | undefined,
}));

vi.mock('../src/config/env', () => ({ env: mockEnv }));

// Imports AFTER the mock is hoisted so the module under test sees the fake env.
import { AdminBootstrapService } from '../src/modules/admin-invites/admin-bootstrap.service';
import { AuthentikError } from '../src/modules/admin-invites/authentik.client';
import type { AuthentikClient, AuthentikGroup } from '../src/modules/admin-invites/authentik.client';

// Fixed test fixtures — named per AGENTS.md §1.3 (no magic strings scattered
// through assertions) and so the password-never-logged regression test has
// one unambiguous literal to search the logger spy output for.
const TEST_PASSWORD = 'a-fixed-seed-passw0rd!';
const SUPER_ADMIN_GROUP = 'aiqadam-super-admin';
const GROUP_PK = 'grp-super-admin-pk';
const SEEDED_USER_PK = 777;

type FakeAuthentik = {
  isConfigured: ReturnType<typeof vi.fn>;
  resolveGroupNames: ReturnType<typeof vi.fn>;
  getSuperAdminCount: ReturnType<typeof vi.fn>;
  createUser: ReturnType<typeof vi.fn>;
  setPassword: ReturnType<typeof vi.fn>;
  setUserGroups: ReturnType<typeof vi.fn>;
  ensureForcePasswordChangeFlow: ReturnType<typeof vi.fn>;
  setBootstrapPasswordChangeAttribute: ReturnType<typeof vi.fn>;
  patchAttributes: ReturnType<typeof vi.fn>;
  getUserByEmail: ReturnType<typeof vi.fn>;
};

function group(users: number[], overrides: Partial<AuthentikGroup> = {}): AuthentikGroup {
  return {
    pk: GROUP_PK,
    name: SUPER_ADMIN_GROUP,
    is_superuser: true,
    users,
    ...overrides,
  };
}

const SEEDED_USER = {
  pk: SEEDED_USER_PK,
  attributes: { recovery_email: undefined } as Record<string, unknown>,
};

let authentik: FakeAuthentik;
let svc: AdminBootstrapService;

beforeEach(() => {
  mockEnv.ADMIN_BOOTSTRAP_EMAIL = 'admin@aiqadam.org';
  mockEnv.ADMIN_BOOTSTRAP_DEFAULT_PASSWORD = TEST_PASSWORD;

  authentik = {
    isConfigured: vi.fn().mockReturnValue(true),
    // Default: zero members, so bootstrap proceeds unless a test overrides.
    resolveGroupNames: vi.fn().mockResolvedValue([group([])]),
    // getSuperAdminCount() delegates to resolveGroupNames() in the real
    // implementation — the fake mirrors that so existing tests which
    // override resolveGroupNames() to control the membership check
    // keep working unmodified after the FR-ADM-011 refactor.
    getSuperAdminCount: vi.fn().mockImplementation(async () => {
      const groups = await authentik.resolveGroupNames([SUPER_ADMIN_GROUP]);
      return groups[0]?.users.length ?? 0;
    }),
    createUser: vi.fn().mockResolvedValue(SEEDED_USER),
    setPassword: vi.fn().mockResolvedValue(undefined),
    setUserGroups: vi.fn().mockResolvedValue(undefined),
    ensureForcePasswordChangeFlow: vi.fn().mockResolvedValue(undefined),
    setBootstrapPasswordChangeAttribute: vi.fn().mockResolvedValue(undefined),
    patchAttributes: vi.fn().mockResolvedValue(undefined),
    getUserByEmail: vi.fn().mockResolvedValue(null),
  };
  svc = new AdminBootstrapService(authentik as unknown as AuthentikClient);
});

describe('AdminBootstrapService.onModuleInit — degraded mode', () => {
  it('skips with a warning when AuthentikClient is not configured', async () => {
    // Arrange
    authentik.isConfigured.mockReturnValue(false);
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act
    await svc.onModuleInit();

    // Assert
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/AUTHENTIK_ADMIN_TOKEN/));
    expect(authentik.resolveGroupNames).not.toHaveBeenCalled();
    expect(authentik.createUser).not.toHaveBeenCalled();
    expect(authentik.setPassword).not.toHaveBeenCalled();
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
    expect(authentik.patchAttributes).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips with a warning when ADMIN_BOOTSTRAP_DEFAULT_PASSWORD is unset', async () => {
    // Arrange
    mockEnv.ADMIN_BOOTSTRAP_DEFAULT_PASSWORD = undefined;
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act
    await svc.onModuleInit();

    // Assert
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/ADMIN_BOOTSTRAP_DEFAULT_PASSWORD/));
    expect(authentik.resolveGroupNames).not.toHaveBeenCalled();
    expect(authentik.createUser).not.toHaveBeenCalled();
    expect(authentik.setPassword).not.toHaveBeenCalled();
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
    expect(authentik.patchAttributes).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe('AdminBootstrapService.onModuleInit — already bootstrapped (AC-2)', () => {
  it('is a total no-op when aiqadam-super-admin already has >=1 member', async () => {
    // Arrange
    authentik.resolveGroupNames.mockResolvedValue([group([123])]);

    // Act
    await svc.onModuleInit();

    // Assert — the no-op must be total, not partial.
    expect(authentik.createUser).not.toHaveBeenCalled();
    expect(authentik.setPassword).not.toHaveBeenCalled();
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
    expect(authentik.patchAttributes).not.toHaveBeenCalled();
  });

  it('treats a resolved group with exactly 1 member as already bootstrapped (>=1 boundary)', async () => {
    // Arrange
    authentik.resolveGroupNames.mockResolvedValue([group([1])]);

    // Act
    await svc.onModuleInit();

    // Assert
    expect(authentik.createUser).not.toHaveBeenCalled();
  });

  it('treats an empty resolveGroupNames() result as zero members and proceeds to bootstrap', async () => {
    // Arrange — hasSuperAdminMember()'s optional-chaining path: groups[0] is undefined.
    authentik.resolveGroupNames.mockResolvedValueOnce([]).mockResolvedValueOnce([group([])]);

    // Act
    await svc.onModuleInit();

    // Assert
    expect(authentik.createUser).toHaveBeenCalledTimes(1);
  });
});

describe('AdminBootstrapService.onModuleInit — zero-member bootstrap (AC-1)', () => {
  it('creates, passwords, groups, and patches the seeded admin exactly once with expected args', async () => {
    // Arrange — default beforeEach: resolveGroupNames() resolves to a
    // zero-member group on every call (used both for the membership check
    // and for the group-pk lookup in seedAdmin()).
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    // Act
    await svc.onModuleInit();

    // Assert
    expect(authentik.createUser).toHaveBeenCalledTimes(1);
    expect(authentik.createUser).toHaveBeenCalledWith({
      email: 'admin@aiqadam.org',
      username: 'admin',
      name: 'AI Qadam Platform Admin',
    });

    expect(authentik.setPassword).toHaveBeenCalledTimes(1);
    expect(authentik.setPassword).toHaveBeenCalledWith(SEEDED_USER_PK, TEST_PASSWORD);

    expect(authentik.setUserGroups).toHaveBeenCalledTimes(1);
    expect(authentik.setUserGroups).toHaveBeenCalledWith(SEEDED_USER_PK, [GROUP_PK]);

    expect(authentik.ensureForcePasswordChangeFlow).toHaveBeenCalledTimes(1);
    expect(authentik.setBootstrapPasswordChangeAttribute).toHaveBeenCalledTimes(1);
    expect(authentik.setBootstrapPasswordChangeAttribute).toHaveBeenCalledWith(SEEDED_USER_PK);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/admin@aiqadam\.org.*777.*aiqadam-super-admin/),
    );

    logSpy.mockRestore();
  });

  it('uses the ExpressionPolicy flow mechanism, not the deprecated patchAttributes call', async () => {
    // Arrange
    authentik.createUser.mockResolvedValue({
      pk: SEEDED_USER_PK,
      attributes: { recovery_email: 'preexisting@example.org' },
    });

    // Act
    await svc.onModuleInit();

    // Assert — the new mechanism uses setBootstrapPasswordChangeAttribute,
    // never the deprecated patchAttributes call for the old attribute key.
    expect(authentik.ensureForcePasswordChangeFlow).toHaveBeenCalledTimes(1);
    expect(authentik.setBootstrapPasswordChangeAttribute).toHaveBeenCalledWith(SEEDED_USER_PK);
    expect(authentik.patchAttributes).not.toHaveBeenCalledWith(
      SEEDED_USER_PK,
      expect.objectContaining({ ak_login_password_change_required: expect.anything() }),
    );
  });
});

describe('AdminBootstrapService — missing-group failure', () => {
  it('throws when the aiqadam-super-admin group cannot be resolved at assignment time', async () => {
    // Arrange — first resolveGroupNames() call (membership check) sees zero
    // members so bootstrap proceeds; the second call (group-pk lookup
    // inside seedAdmin()) returns no matching group at all.
    authentik.resolveGroupNames.mockResolvedValueOnce([group([])]).mockResolvedValueOnce([]);

    // Act
    const rejection = svc.onModuleInit().catch((err: unknown) => err);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Authentik group not found/);
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
    expect(authentik.patchAttributes).not.toHaveBeenCalled();
  });

  it('throws when the resolved group has no pk', async () => {
    // Arrange
    authentik.resolveGroupNames
      .mockResolvedValueOnce([group([])])
      .mockResolvedValueOnce([group([], { pk: undefined as unknown as string })]);

    // Act
    const rejection = svc.onModuleInit().catch((err: unknown) => err);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Authentik group not found/);
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
  });
});

describe('AdminBootstrapService — duplicate-email recovery', () => {
  it('recovers via getUserByEmail() on a 4xx createUser() rejection and continues without re-calling setPassword()', async () => {
    // Arrange
    const recoveredUser = { pk: 555, attributes: { recovery_email: undefined } };
    authentik.createUser.mockRejectedValueOnce(
      new AuthentikError(400, '/api/v3/core/users/', '{"email":["already taken"]}'),
    );
    authentik.getUserByEmail.mockResolvedValueOnce(recoveredUser);
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act
    await svc.onModuleInit();

    // Assert — continues on the RECOVERED user's pk, not a newly-created one.
    expect(authentik.getUserByEmail).toHaveBeenCalledWith('admin@aiqadam.org');
    expect(authentik.setPassword).not.toHaveBeenCalled();
    expect(authentik.setUserGroups).toHaveBeenCalledWith(555, [GROUP_PK]);
    expect(authentik.ensureForcePasswordChangeFlow).toHaveBeenCalledTimes(1);
    expect(authentik.setBootstrapPasswordChangeAttribute).toHaveBeenCalledWith(555);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/recovering by email lookup/));

    warnSpy.mockRestore();
  });

  it('rethrows the original 4xx error when no existing user is found to recover', async () => {
    // Arrange
    const conflict = new AuthentikError(400, '/api/v3/core/users/', '{"email":["already taken"]}');
    authentik.createUser.mockRejectedValueOnce(conflict);
    authentik.getUserByEmail.mockResolvedValueOnce(null);
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act
    const rejection = svc.onModuleInit().catch((err: unknown) => err);

    // Assert
    const err = await rejection;
    expect(err).toBe(conflict);
    expect(authentik.setPassword).not.toHaveBeenCalled();
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/cannot recover/));

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('AdminBootstrapService — 5xx error boundary', () => {
  it('rethrows a 5xx createUser() failure without attempting recovery', async () => {
    // Arrange
    const serverError = new AuthentikError(500, '/api/v3/core/users/', '{"detail":"boom"}');
    authentik.createUser.mockRejectedValueOnce(serverError);
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // Act
    const rejection = svc.onModuleInit().catch((err: unknown) => err);

    // Assert — the 4xx-only recovery branch must not trigger on 5xx.
    const err = await rejection;
    expect(err).toBe(serverError);
    expect(authentik.getUserByEmail).not.toHaveBeenCalled();
    expect(authentik.setPassword).not.toHaveBeenCalled();
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/failed unexpectedly/));

    errorSpy.mockRestore();
  });

  it('rethrows a plain (non-AuthentikError) createUser() rejection without attempting recovery', async () => {
    // Arrange — an unexpected error shape (e.g. network failure), not an AuthentikError at all.
    const networkError = new Error('fetch failed: ECONNRESET');
    authentik.createUser.mockRejectedValueOnce(networkError);
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // Act
    const rejection = svc.onModuleInit().catch((err: unknown) => err);

    // Assert
    const err = await rejection;
    expect(err).toBe(networkError);
    expect(authentik.getUserByEmail).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe('AdminBootstrapService — password never logged (AC-3, regression)', () => {
  it('never logs the seeded password in the zero-member bootstrap path', async () => {
    // Arrange
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    // Act
    await svc.onModuleInit();

    // Assert
    const allCallArgs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls, ...debugSpy.mock.calls];
    const allLoggedStrings = allCallArgs.flat().map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)));
    expect(allLoggedStrings.some((s) => s.includes(TEST_PASSWORD))).toBe(false);
    expect(allLoggedStrings.some((s) => s.includes('ADMIN_BOOTSTRAP_DEFAULT_PASSWORD='))).toBe(false);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('never logs the seeded password on the duplicate-email recovery path', async () => {
    // Arrange
    authentik.createUser.mockRejectedValueOnce(
      new AuthentikError(400, '/api/v3/core/users/', '{"email":["already taken"]}'),
    );
    authentik.getUserByEmail.mockResolvedValueOnce({ pk: 555, attributes: {} });
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    // Act
    await svc.onModuleInit();

    // Assert
    const allCallArgs = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls, ...debugSpy.mock.calls];
    const allLoggedStrings = allCallArgs.flat().map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)));
    expect(allLoggedStrings.some((s) => s.includes(TEST_PASSWORD))).toBe(false);

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
  });
});
