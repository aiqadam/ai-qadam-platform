import { BadRequestException, Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthentikError } from '../src/modules/admin-invites/authentik.client';
import type { AuthentikClient, AuthentikUser } from '../src/modules/admin-invites/authentik.client';
import { RegistrationService } from '../src/modules/auth/registration.service';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { InteractionsService } from '../src/modules/interactions/interactions.service';

// Unit tests for RegistrationService (ISS-USR-REG-001 — AI-Qadam-branded
// self-registration). Mocks AuthentikClient + DirectusUsersBridgeService +
// DirectusClient + InteractionsService so the spec validates the
// orchestration/failure-handling logic without any live infra — mirrors
// admin-invites-service.spec.ts's mocking style exactly (typed vi.fn()
// fake objects, no Testcontainers), since RegistrationService has the same
// shape: constructor-injected external-API clients, zero direct
// Postgres/Drizzle access. See 06-test-strategy.md for the full rubric
// reasoning behind choosing the mocked-unit tier.

type FakeAuthentik = {
  createUser: ReturnType<typeof vi.fn>;
  setPassword: ReturnType<typeof vi.fn>;
  getUserByEmail: ReturnType<typeof vi.fn>;
  disableUser: ReturnType<typeof vi.fn>;
  resolveGroupNames: ReturnType<typeof vi.fn>;
  setUserGroups: ReturnType<typeof vi.fn>;
  createRecoveryLink: ReturnType<typeof vi.fn>;
};
type FakeDirectusBridge = {
  ensureLinkedByEmail: ReturnType<typeof vi.fn>;
};
type FakeDirectus = {
  patch: ReturnType<typeof vi.fn>;
};
type FakeInteractions = {
  dispatch: ReturnType<typeof vi.fn>;
};

const AK_USER: AuthentikUser = {
  pk: 4242,
  username: 'placeholder.will-be-overridden',
  email: 'placeholder@example.com',
  name: 'Placeholder',
  is_active: true,
  uid: 'ak-uid-4242',
  groups: [],
  groups_obj: [],
  attributes: {},
};

const VALID_INPUT = {
  email: 'new.member@example.com',
  password: 'a-genuinely-long-passphrase-12',
  country: 'kz' as const,
  displayName: 'New Member',
};

let authentik: FakeAuthentik;
let directusBridge: FakeDirectusBridge;
let directus: FakeDirectus;
let interactions: FakeInteractions;
let svc: RegistrationService;

beforeEach(() => {
  authentik = {
    createUser: vi.fn().mockResolvedValue({ ...AK_USER }),
    setPassword: vi.fn().mockResolvedValue(undefined),
    getUserByEmail: vi.fn().mockResolvedValue(null),
    disableUser: vi.fn().mockResolvedValue(undefined),
    resolveGroupNames: vi
      .fn()
      .mockImplementation(async (names: string[]) =>
        names.map((name, i) => ({ pk: `pk-${name}-${i}`, name, is_superuser: false, users: [] })),
      ),
    setUserGroups: vi.fn().mockResolvedValue(undefined),
    createRecoveryLink: vi
      .fn()
      .mockResolvedValue('https://authentik.aiqadam.org/if/flow/recovery/?token=real-one-time-token'),
  };
  directusBridge = {
    ensureLinkedByEmail: vi.fn().mockResolvedValue('directus-uuid-of-new-member'),
  };
  directus = {
    patch: vi.fn().mockResolvedValue(undefined),
  };
  interactions = {
    dispatch: vi.fn().mockResolvedValue({ interactionId: 'interaction-1', deliveries: [] }),
  };
  svc = new RegistrationService(
    authentik as unknown as AuthentikClient,
    directusBridge as unknown as DirectusUsersBridgeService,
    directus as unknown as DirectusClient,
    interactions as unknown as InteractionsService,
  );
});

// ─── Regression test (issue-resolution Step 6 mandatory constraint) ───────
//
// Before this PR, POST /v1/auth/register did not exist at all (any request
// 404'd) — so this happy-path test, exercising RegistrationService's full
// successful provisioning sequence, is the practical equivalent of "would
// have failed before the fix." It ALSO pins the specific fixed behavior
// from the security retry pass (SecurityReviewer's MAJOR-1 finding): the
// resolved recoveryUrl must be the literal '/v1/auth/login' string, never
// the real Authentik recovery URL — the original vulnerable version of
// this same code path returned the real URL directly to the caller, which
// was a deterministic email-enumeration oracle via the Location header.
describe('register — happy path (regression test for ISS-USR-REG-001 / guards SecurityReviewer MAJOR-1)', () => {
  it('provisions a full Authentik + Directus account and resolves to the fixed, non-leaking recoveryUrl literal', async () => {
    // Arrange — see beforeEach; VALID_INPUT is a fresh, never-before-seen email.

    // Act
    const result = await svc.register(VALID_INPUT);

    // Assert — Authentik user creation with a derived username.
    expect(authentik.createUser).toHaveBeenCalledTimes(1);
    const createUserArg = authentik.createUser.mock.calls[0]?.[0] as {
      email: string;
      username: string;
      name: string;
    };
    expect(createUserArg.email).toBe(VALID_INPUT.email);
    expect(createUserArg.name).toBe(VALID_INPUT.displayName);
    expect(createUserArg.username).toMatch(/^[a-z0-9.]+$/);

    // Assert — password set with the submitted (not re-derived) password.
    expect(authentik.setPassword).toHaveBeenCalledWith(AK_USER.pk, VALID_INPUT.password);

    // Assert — baseline member group resolved + assigned.
    expect(authentik.resolveGroupNames).toHaveBeenCalledWith(['aiqadam-member']);
    expect(authentik.setUserGroups).toHaveBeenCalledWith(AK_USER.pk, ['pk-aiqadam-member-0']);

    // Assert — Directus link + country write.
    expect(directusBridge.ensureLinkedByEmail).toHaveBeenCalledWith({
      email: VALID_INPUT.email,
      displayName: VALID_INPUT.displayName,
    });
    expect(directus.patch).toHaveBeenCalledWith('/users/directus-uuid-of-new-member', {
      country: VALID_INPUT.country,
    });

    // Assert — recovery link minted and emailed, never returned to the caller.
    expect(authentik.createRecoveryLink).toHaveBeenCalledWith(AK_USER.pk);
    expect(interactions.dispatch).toHaveBeenCalledTimes(1);
    const dispatchArg = interactions.dispatch.mock.calls[0]?.[0] as {
      audience: { userIds: string[] };
      consentBasis: string;
      allowedChannels: string[];
      payload: { text: string };
    };
    expect(dispatchArg.audience).toEqual({ userIds: ['directus-uuid-of-new-member'] });
    expect(dispatchArg.consentBasis).toBe('operational_contract');
    expect(dispatchArg.allowedChannels).toEqual(['email']);
    expect(dispatchArg.payload.text).toContain(
      'https://authentik.aiqadam.org/if/flow/recovery/?token=real-one-time-token',
    );

    // Assert — THE regression-guarding assertion: the resolved value is
    // the fixed literal, not the real Authentik recovery URL.
    expect(result).toEqual({ recoveryUrl: '/v1/auth/login' });
  });
});

describe('register — duplicate email (non-leak regression test)', () => {
  it('never calls createUser and resolves to the byte-identical result as a genuine success', async () => {
    // Arrange
    authentik.getUserByEmail.mockResolvedValueOnce({ ...AK_USER, email: VALID_INPUT.email });

    // Act
    const result = await svc.register(VALID_INPUT);

    // Assert — no account-creation side effects for an email that already exists.
    expect(authentik.createUser).toHaveBeenCalledTimes(0);
    expect(authentik.setPassword).not.toHaveBeenCalled();
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
    expect(directusBridge.ensureLinkedByEmail).not.toHaveBeenCalled();
    expect(interactions.dispatch).not.toHaveBeenCalled();

    // Assert — byte-identical response shape to the happy path (the actual
    // non-leak property: a scripted client cannot distinguish "new
    // registration" from "already registered" via this response).
    expect(result).toEqual({ recoveryUrl: '/v1/auth/login' });
  });
});

describe('register — orphaned-account rollback', () => {
  it('disables the orphan and throws a generic failure when setPassword fails, with no further side effects', async () => {
    // Arrange
    authentik.setPassword.mockRejectedValueOnce(new Error('authentik 503: transient'));

    // Act
    const rejection = svc.register(VALID_INPUT).catch((err: unknown) => err);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe('registration_failed');

    // Assert — the orphan was disabled using the pk returned by createUser.
    expect(authentik.disableUser).toHaveBeenCalledWith(AK_USER.pk);

    // Assert — no partial provisioning beyond create + failed setPassword + disable.
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
    expect(directusBridge.ensureLinkedByEmail).not.toHaveBeenCalled();
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });

  it('still throws the generic registration_failed error (not a crash, not a leak) when disableUser itself also fails', async () => {
    // Arrange
    authentik.setPassword.mockRejectedValueOnce(new Error('authentik 503: transient'));
    authentik.disableUser.mockRejectedValueOnce(new Error('authentik 500: disable also failed'));
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act — the secondary disableUser failure must not mask or replace the
    // primary registration_failed error, and must not crash the request
    // with an unhandled rejection.
    const rejection = svc.register(VALID_INPUT).catch((err: unknown) => err);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe('registration_failed');

    // Assert — a warning was logged for the secondary (disableUser) failure,
    // proving it was observed/handled rather than silently swallowed.
    expect(warnSpy).toHaveBeenCalled();
    expect(authentik.disableUser).toHaveBeenCalledWith(AK_USER.pk);
    warnSpy.mockRestore();
  });
});

describe('register — Directus link failure is non-fatal', () => {
  it('resolves successfully with no Directus patch or email dispatch when ensureLinkedByEmail returns null', async () => {
    // Arrange — best-effort Directus bridge could not link/create a row.
    directusBridge.ensureLinkedByEmail.mockResolvedValueOnce(null);

    // Act
    const result = await svc.register(VALID_INPUT);

    // Assert — nothing to patch, nobody to email.
    expect(directus.patch).not.toHaveBeenCalled();
    expect(interactions.dispatch).not.toHaveBeenCalled();

    // Assert — registration still succeeds; Authentik-side work already
    // completed by this point must not be thrown away over a best-effort
    // Directus metadata step.
    expect(authentik.createUser).toHaveBeenCalledTimes(1);
    expect(authentik.setPassword).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ recoveryUrl: '/v1/auth/login' });
  });
});

describe('register — email dispatch failure is non-fatal', () => {
  it('still resolves successfully when interactions.dispatch rejects', async () => {
    // Arrange
    interactions.dispatch.mockRejectedValueOnce(new Error('smtp: connection refused'));

    // Act
    const result = await svc.register(VALID_INPUT);

    // Assert — best-effort .catch()-wrapped dispatch does not fail the
    // already-successful registration.
    expect(result).toEqual({ recoveryUrl: '/v1/auth/login' });
  });
});

// ─── Regression tests (ISS-USR-REG-002 — Steps 2/3/5/8 error-handling) ─────
//
// Before this fix, RegistrationService.register() had three fully
// unguarded external call sites (Steps 2, 5, 8) plus a partially-guarded
// one (Step 3, only 4xx AuthentikErrors converted). AuthentikError extends
// plain Error, not HttpException, so any of these thrown uncaught fell
// through to NestJS's default exception filter as a bare, undiagnosable
// 500. Each test below pins the NEW behavior specifically (exact exception
// class, exact message, exact mock call counts) so it would fail against
// the pre-fix code — see 06-test-strategy.md for the rubric/mapping.

describe('register — duplicate-check failure (Step 2 regression, ISS-USR-REG-002)', () => {
  it('converts a getUserByEmail failure to a generic registration_failed error without attempting to create anything', async () => {
    // Arrange — Authentik unreachable/unauthorized during the duplicate check.
    authentik.getUserByEmail.mockRejectedValueOnce(new AuthentikError(401, '/core/users/', 'unauthorized'));

    // Act
    const rejection = svc.register(VALID_INPUT).catch((err: unknown) => err);

    // Assert — converted to the same generic, non-leaking error Steps 3/4/5 use.
    const err = await rejection;
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe('registration_failed');

    // Assert — no Authentik user was ever attempted (nothing to clean up;
    // no Authentik user exists yet at Step 2, unlike the Step 4/5 orphan cases).
    expect(authentik.createUser).not.toHaveBeenCalled();
    expect(authentik.setPassword).not.toHaveBeenCalled();
    expect(directusBridge.ensureLinkedByEmail).not.toHaveBeenCalled();
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });
});

describe('register — create-user failure widened to non-4xx errors (Step 3 regression, ISS-USR-REG-002)', () => {
  it('converts a 5xx AuthentikError from createUser to BadRequestException instead of rethrowing the raw error', async () => {
    // Arrange — before this fix, only 4xx AuthentikErrors were converted;
    // a 5xx rethrew unhandled straight past this catch.
    authentik.createUser.mockRejectedValueOnce(new AuthentikError(503, '/core/users/', 'upstream unavailable'));

    // Act
    const rejection = svc.register(VALID_INPUT).catch((err: unknown) => err);

    // Assert — the rejection IS a BadRequestException, not the raw AuthentikError.
    const err = await rejection;
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err).not.toBeInstanceOf(AuthentikError);
    expect((err as BadRequestException).message).toBe('registration_failed');

    // Assert — no further provisioning was attempted.
    expect(authentik.setPassword).not.toHaveBeenCalled();
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
  });

  it('converts a raw network TypeError from createUser to BadRequestException instead of rethrowing the raw error', async () => {
    // Arrange — a plain transport failure (e.g. fetch failed), not an AuthentikError at all.
    authentik.createUser.mockRejectedValueOnce(new TypeError('fetch failed'));

    // Act
    const rejection = svc.register(VALID_INPUT).catch((err: unknown) => err);

    // Assert — still converted, not leaked as a raw TypeError.
    const err = await rejection;
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe('registration_failed');
  });
});

describe('register — group-assignment failure orphan mitigation (Step 5 regression, ISS-USR-REG-002)', () => {
  it('disables the orphan and throws a generic failure when resolveGroupNames fails, with no further side effects', async () => {
    // Arrange — createUser + setPassword already succeeded (see beforeEach);
    // the group-resolution call itself now fails.
    authentik.resolveGroupNames.mockRejectedValueOnce(new AuthentikError(503, '/core/groups/', 'transient'));

    // Act
    const rejection = svc.register(VALID_INPUT).catch((err: unknown) => err);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe('registration_failed');

    // Assert — the orphan (already has a password by this point) was disabled.
    expect(authentik.disableUser).toHaveBeenCalledWith(AK_USER.pk);

    // Assert — no partial provisioning beyond the failed group assignment.
    expect(directusBridge.ensureLinkedByEmail).not.toHaveBeenCalled();
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });

  it('disables the orphan and throws a generic failure when setUserGroups fails, with no further side effects', async () => {
    // Arrange — resolveGroupNames succeeds, but assigning the resolved groups fails.
    authentik.setUserGroups.mockRejectedValueOnce(new AuthentikError(500, '/core/users/4242/groups/', 'boom'));

    // Act
    const rejection = svc.register(VALID_INPUT).catch((err: unknown) => err);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe('registration_failed');

    // Assert — the orphan was disabled using the pk returned by createUser.
    expect(authentik.disableUser).toHaveBeenCalledWith(AK_USER.pk);
    expect(directusBridge.ensureLinkedByEmail).not.toHaveBeenCalled();
    expect(interactions.dispatch).not.toHaveBeenCalled();
  });
});

describe('register — recovery-link mint failure is non-fatal (Step 8 regression, ISS-USR-REG-002)', () => {
  it('still resolves successfully and skips the welcome email when createRecoveryLink fails', async () => {
    // Arrange — everything up through the Directus/country write succeeds
    // (see beforeEach); only the recovery-link mint fails.
    authentik.createRecoveryLink.mockRejectedValueOnce(new AuthentikError(503, '/core/users/4242/recovery/', 'down'));

    // Act
    const result = await svc.register(VALID_INPUT);

    // Assert — registration, having already fully succeeded in Authentik +
    // Directus by this point, must not be failed over a recovery-link blip.
    expect(result).toEqual({ recoveryUrl: '/v1/auth/login' });

    // Assert — welcome email was never dispatched (recoveryUrl stayed null).
    expect(interactions.dispatch).not.toHaveBeenCalled();

    // Assert — everything prior to the recovery-link mint did complete.
    expect(authentik.setUserGroups).toHaveBeenCalledTimes(1);
    expect(directus.patch).toHaveBeenCalledWith('/users/directus-uuid-of-new-member', {
      country: VALID_INPUT.country,
    });
  });
});

describe('deriveUsername (private, exercised black-box through register())', () => {
  it('produces a lowercase [a-z0-9.] username for a mixed-case email with a plus-tag', async () => {
    await svc.register({ ...VALID_INPUT, email: 'Weird.Email+Tag@Example.com' });

    const createUserArg = authentik.createUser.mock.calls[0]?.[0] as { username: string };
    expect(createUserArg.username).toMatch(/^[a-z0-9.]+$/);
    expect(createUserArg.username).not.toBe('');
    // The '+tag' portion must be stripped (not [a-z0-9.]) and the result
    // lowercased — 'weird.email' should be the recognizable base, with a
    // random hex suffix appended after a separating dot.
    expect(createUserArg.username.startsWith('weird.email')).toBe(true);
  });

  it('falls back to a non-empty "user"-based username when the local-part is empty after cleaning', async () => {
    await svc.register({ ...VALID_INPUT, email: '+++@example.com' });

    const createUserArg = authentik.createUser.mock.calls[0]?.[0] as { username: string };
    expect(createUserArg.username).toMatch(/^[a-z0-9.]+$/);
    expect(createUserArg.username).not.toBe('');
    expect(createUserArg.username.startsWith('user')).toBe(true);
  });
});
