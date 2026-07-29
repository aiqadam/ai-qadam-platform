import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUserRolesService } from '../src/modules/admin-invites/admin-user-roles.service';
import type { AuthentikClient, AuthentikGroup, AuthentikUser } from '../src/modules/admin-invites/authentik.client';
import type { AuditEventsService } from '../src/modules/audit/audit-events.service';

// Unit tests for AdminUserRolesService (FR-ADM-011 — admin user/role
// management). Mocks AuthentikClient + AuditEventsService following the
// established FakeAuthentik/FakeAudit pattern from
// admin-invites-service.spec.ts / admin-bootstrap.service.spec.ts.
//
// No Testcontainers-Authentik double exists in this repo (confirmed by
// grep and by admin-bootstrap.service.ts's own comment) — hand-mocked
// unit tests are this feature's substitute for an integration tier, per
// 06-test-strategy.md.

type FakeAuthentik = {
  getUserById: ReturnType<typeof vi.fn>;
  listActiveUsers: ReturnType<typeof vi.fn>;
  resolveGroupNames: ReturnType<typeof vi.fn>;
  setUserGroups: ReturnType<typeof vi.fn>;
  getSuperAdminCount: ReturnType<typeof vi.fn>;
};
type FakeAudit = {
  emit: ReturnType<typeof vi.fn>;
};

const ACTOR_ID = 'actor-uuid-1';
const TARGET_PK = 42;
const SUPER_ADMIN_GROUP = 'aiqadam-super-admin';

function authentikUser(overrides: Partial<AuthentikUser> = {}): AuthentikUser {
  return {
    pk: TARGET_PK,
    username: 'target.user',
    email: 'target.user@example.org',
    name: 'Target User',
    is_active: true,
    uid: 'target-uid',
    groups: [],
    groups_obj: [],
    attributes: {},
    ...overrides,
  };
}

function group(name: string, pk = `${name}-pk`): AuthentikGroup {
  return { pk, name, is_superuser: name === SUPER_ADMIN_GROUP, users: [] };
}

let authentik: FakeAuthentik;
let audit: FakeAudit;
let svc: AdminUserRolesService;

beforeEach(() => {
  authentik = {
    getUserById: vi.fn().mockResolvedValue(authentikUser()),
    listActiveUsers: vi.fn().mockResolvedValue([]),
    // Default: resolve every requested name to a matching group 1:1.
    resolveGroupNames: vi.fn().mockImplementation((names: string[]) =>
      Promise.resolve(names.map((n) => group(n))),
    ),
    setUserGroups: vi.fn().mockResolvedValue(undefined),
    getSuperAdminCount: vi.fn().mockResolvedValue(0),
  };
  audit = { emit: vi.fn().mockResolvedValue(undefined) };
  svc = new AdminUserRolesService(
    authentik as unknown as AuthentikClient,
    audit as unknown as AuditEventsService,
  );
});

describe('AdminUserRolesService.searchUsers', () => {
  it('returns users matching email or name, case-insensitively', async () => {
    // Arrange
    authentik.listActiveUsers.mockResolvedValue([
      authentikUser({ pk: 1, email: 'aigerim.k@aiqadam.org', name: 'Aigerim K.' }),
      authentikUser({ pk: 2, email: 'other@aiqadam.org', name: 'Someone Else' }),
    ]);

    // Act
    const result = await svc.searchUsers('AIGERIM');

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]?.email).toBe('aigerim.k@aiqadam.org');
  });

  it('throws BadRequestException for an empty query', async () => {
    // Act
    const rejection = svc.searchUsers('   ').catch((err: unknown) => err);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(authentik.listActiveUsers).not.toHaveBeenCalled();
  });

  it('returns raw group names, not plain-language labels', async () => {
    // Arrange
    authentik.listActiveUsers.mockResolvedValue([
      authentikUser({
        groups_obj: [{ pk: 'g1', name: 'aiqadam-country-lead-uz' }],
      }),
    ]);

    // Act
    const result = await svc.searchUsers('target');

    // Assert — the API layer must not pre-label; that's a frontend concern.
    expect(result[0]?.groups).toEqual(['aiqadam-country-lead-uz']);
  });
});

describe('AdminUserRolesService.getRoles', () => {
  it('returns the raw group list for an existing user', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(
      authentikUser({ groups_obj: [{ pk: 'g1', name: 'aiqadam-member' }] }),
    );

    // Act
    const result = await svc.getRoles(TARGET_PK);

    // Assert
    expect(result.groups).toEqual(['aiqadam-member']);
  });

  it('throws NotFoundException for an unknown user', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(null);

    // Act
    const rejection = svc.getRoles(TARGET_PK).catch((err: unknown) => err);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
  });
});

describe('AdminUserRolesService.changeRole — input validation', () => {
  it('rejects a body with neither grant nor revoke', async () => {
    const rejection = svc.changeRole(TARGET_PK, {}, ACTOR_ID).catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
  });

  it('rejects a body with both grant and revoke', async () => {
    const rejection = svc
      .changeRole(TARGET_PK, { grant: 'aiqadam-member', revoke: 'aiqadam-speaker' }, ACTOR_ID)
      .catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
  });

  it('rejects a country-scoped role grant with no country', async () => {
    const rejection = svc
      .changeRole(TARGET_PK, { grant: 'aiqadam-organizer' }, ACTOR_ID)
      .catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
  });

  it('rejects a non-scoped role grant WITH a country', async () => {
    const rejection = svc
      .changeRole(TARGET_PK, { grant: 'aiqadam-member', country: 'uz' }, ACTOR_ID)
      .catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
  });
});

describe('AdminUserRolesService.changeRole — grant (read-merge-write)', () => {
  it('adds the target group to the existing set and writes the full resulting list', async () => {
    // Arrange
    authentik.getUserById
      .mockResolvedValueOnce(authentikUser({ groups_obj: [{ pk: 'g1', name: 'aiqadam-member' }] }))
      .mockResolvedValueOnce(
        authentikUser({
          groups_obj: [
            { pk: 'g1', name: 'aiqadam-member' },
            { pk: 'g2', name: 'aiqadam-speaker' },
          ],
        }),
      );

    // Act
    const result = await svc.changeRole(TARGET_PK, { grant: 'aiqadam-speaker' }, ACTOR_ID);

    // Assert
    expect(authentik.resolveGroupNames).toHaveBeenCalledWith(
      expect.arrayContaining(['aiqadam-member', 'aiqadam-speaker']),
    );
    expect(authentik.setUserGroups).toHaveBeenCalledWith(
      TARGET_PK,
      expect.arrayContaining(['aiqadam-member-pk', 'aiqadam-speaker-pk']),
    );
    expect(result.groups).toEqual(['aiqadam-member', 'aiqadam-speaker']);
  });

  it('resolves country-scoped groups with the country suffix', async () => {
    // Act
    await svc.changeRole(TARGET_PK, { grant: 'aiqadam-organizer', country: 'uz' }, ACTOR_ID);

    // Assert
    expect(authentik.resolveGroupNames).toHaveBeenCalledWith(['aiqadam-organizer-uz']);
  });
});

describe('AdminUserRolesService.changeRole — revoke (read-merge-write)', () => {
  it('removes the target group from the existing set', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(
      authentikUser({
        groups_obj: [
          { pk: 'g1', name: 'aiqadam-member' },
          { pk: 'g2', name: 'aiqadam-speaker' },
        ],
      }),
    );

    // Act
    await svc.changeRole(TARGET_PK, { revoke: 'aiqadam-speaker' }, ACTOR_ID);

    // Assert
    expect(authentik.resolveGroupNames).toHaveBeenCalledWith(['aiqadam-member']);
  });
});

describe('AdminUserRolesService.changeRole — super-admin cap (AC-3)', () => {
  it('allows a super_admin grant when count is below the cap (boundary: 2 -> allowed)', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(authentikUser({ groups_obj: [] }));
    authentik.getSuperAdminCount.mockResolvedValue(2);

    // Act
    await svc.changeRole(TARGET_PK, { grant: 'aiqadam-super-admin' }, ACTOR_ID);

    // Assert
    expect(authentik.setUserGroups).toHaveBeenCalled();
  });

  it('blocks a super_admin grant at the cap (boundary: 3 -> blocked) citing ADR-0021', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(authentikUser({ groups_obj: [] }));
    authentik.getSuperAdminCount.mockResolvedValue(3);

    // Act
    const rejection = svc
      .changeRole(TARGET_PK, { grant: 'aiqadam-super-admin' }, ACTOR_ID)
      .catch((e: unknown) => e);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/adr_0021/);
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
  });

  it('skips the cap check entirely for a no-op grant (user already a member)', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(
      authentikUser({ groups_obj: [{ pk: 'g1', name: SUPER_ADMIN_GROUP }] }),
    );
    authentik.getSuperAdminCount.mockResolvedValue(3);

    // Act
    await svc.changeRole(TARGET_PK, { grant: 'aiqadam-super-admin' }, ACTOR_ID);

    // Assert — no exception, cap primitive never consulted for a no-op.
    expect(authentik.getSuperAdminCount).not.toHaveBeenCalled();
    expect(authentik.setUserGroups).toHaveBeenCalled();
  });
});

describe('AdminUserRolesService.changeRole — super-admin floor (self-lockout guard)', () => {
  it('allows a super_admin revoke when count is above the floor (boundary: 2 -> allowed)', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(
      authentikUser({ groups_obj: [{ pk: 'g1', name: SUPER_ADMIN_GROUP }] }),
    );
    authentik.getSuperAdminCount.mockResolvedValue(2);

    // Act
    await svc.changeRole(TARGET_PK, { revoke: 'aiqadam-super-admin' }, ACTOR_ID);

    // Assert
    expect(authentik.setUserGroups).toHaveBeenCalled();
  });

  it('blocks a super_admin revoke at the floor (boundary: 1 -> blocked)', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(
      authentikUser({ groups_obj: [{ pk: 'g1', name: SUPER_ADMIN_GROUP }] }),
    );
    authentik.getSuperAdminCount.mockResolvedValue(1);

    // Act
    const rejection = svc
      .changeRole(TARGET_PK, { revoke: 'aiqadam-super-admin' }, ACTOR_ID)
      .catch((e: unknown) => e);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/floor_breached/);
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
  });

  it('skips the floor check entirely for a no-op revoke (user not a member)', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(authentikUser({ groups_obj: [] }));
    authentik.getSuperAdminCount.mockResolvedValue(1);

    // Act
    await svc.changeRole(TARGET_PK, { revoke: 'aiqadam-super-admin' }, ACTOR_ID);

    // Assert
    expect(authentik.getSuperAdminCount).not.toHaveBeenCalled();
  });
});

describe('AdminUserRolesService.changeRole — re-read integrity (regression for GitHub issue #107)', () => {
  it('returns the RE-READ post-change state, not an assumption from the write request', async () => {
    // Arrange — the write "succeeds" (no throw), but the re-read shows a
    // DIFFERENT state than what was requested (simulating the exact
    // silent-failure class #107 reported).
    authentik.getUserById
      .mockResolvedValueOnce(authentikUser({ groups_obj: [] })) // pre-change read
      .mockResolvedValueOnce(authentikUser({ groups_obj: [] })); // POST-change re-read: grant did NOT actually apply

    // Act
    const result = await svc.changeRole(TARGET_PK, { grant: 'aiqadam-member' }, ACTOR_ID);

    // Assert — the response must reflect the re-read (empty), proving no
    // optimistic "the request said grant, so return granted" shortcut.
    expect(result.groups).toEqual([]);
  });

  it('throws if the user disappears between write and re-read', async () => {
    // Arrange
    authentik.getUserById
      .mockResolvedValueOnce(authentikUser({ groups_obj: [] }))
      .mockResolvedValueOnce(null);

    // Act
    const rejection = svc
      .changeRole(TARGET_PK, { grant: 'aiqadam-member' }, ACTOR_ID)
      .catch((e: unknown) => e);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
  });
});

describe('AdminUserRolesService.changeRole — unresolved-group guard (security finding)', () => {
  it('refuses to write when resolveGroupNames() drops a group instead of silently truncating', async () => {
    // Arrange — user has TWO existing groups, but resolveGroupNames()
    // only resolves one of them (simulating a stale/renamed group).
    authentik.getUserById.mockResolvedValue(
      authentikUser({
        groups_obj: [
          { pk: 'g1', name: 'aiqadam-member' },
          { pk: 'g2', name: 'aiqadam-speaker' },
        ],
      }),
    );
    authentik.resolveGroupNames.mockResolvedValue([group('aiqadam-member')]);

    // Act
    const rejection = svc
      .changeRole(TARGET_PK, { grant: 'aiqadam-sponsor-rep' }, ACTOR_ID)
      .catch((e: unknown) => e);

    // Assert
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/groups_unresolved/);
    expect(authentik.setUserGroups).not.toHaveBeenCalled();
  });
});

describe('AdminUserRolesService.changeRole — audit trail (AC-5)', () => {
  it('emits exactly one audit event with actor, target, role, and before/after state', async () => {
    // Arrange
    authentik.getUserById
      .mockResolvedValueOnce(authentikUser({ groups_obj: [] }))
      .mockResolvedValueOnce(
        authentikUser({ groups_obj: [{ pk: 'g1', name: 'aiqadam-member' }] }),
      );

    // Act
    await svc.changeRole(TARGET_PK, { grant: 'aiqadam-member' }, ACTOR_ID);

    // Assert
    expect(audit.emit).toHaveBeenCalledTimes(1);
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin.role.granted',
        severity: 'high',
        actorId: ACTOR_ID,
        targetKind: 'user',
        targetId: String(TARGET_PK),
        payload: expect.objectContaining({
          role: 'aiqadam-member',
          before: [],
          after: ['aiqadam-member'],
        }),
      }),
    );
  });

  it('emits admin.role.revoked for a revoke', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(
      authentikUser({ groups_obj: [{ pk: 'g1', name: 'aiqadam-member' }] }),
    );

    // Act
    await svc.changeRole(TARGET_PK, { revoke: 'aiqadam-member' }, ACTOR_ID);

    // Assert
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'admin.role.revoked' }),
    );
  });
});
