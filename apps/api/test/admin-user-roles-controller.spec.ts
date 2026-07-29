import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUserRolesController } from '../src/modules/admin-invites/admin-user-roles.controller';
import type {
  AdminUserRoles,
  AdminUserRolesService,
  AdminUserSummary,
} from '../src/modules/admin-invites/admin-user-roles.service';

// FR-ADM-011 — AdminUserRolesController. Direct-instantiation unit test
// with a mocked service, mirroring csat.controller.spec.ts's pattern
// (no NestJS TestingModule — guards are exercised elsewhere via
// SuperAdminGuard's own suite, unchanged by this PR).

type MockService = {
  searchUsers: ReturnType<typeof vi.fn>;
  getRoles: ReturnType<typeof vi.fn>;
  changeRole: ReturnType<typeof vi.fn>;
};

function makeMockService(): MockService {
  return {
    searchUsers: vi.fn(),
    getRoles: vi.fn(),
    changeRole: vi.fn(),
  };
}

function makeReq(sub = 'actor-uuid-1'): Request {
  return { user: { sub, email: 'actor@aiqadam.org' } } as unknown as Request;
}

let svc: MockService;
let ctrl: AdminUserRolesController;

beforeEach(() => {
  svc = makeMockService();
  ctrl = new AdminUserRolesController(svc as unknown as AdminUserRolesService);
});

describe('AdminUserRolesController.search', () => {
  it('returns the users the service resolves', async () => {
    const users: AdminUserSummary[] = [
      { id: 1, email: 'a@aiqadam.org', name: 'A', isActive: true, groups: [] },
    ];
    svc.searchUsers.mockResolvedValueOnce(users);

    const result = await ctrl.search('a@');

    expect(result).toEqual({ users });
    expect(svc.searchUsers).toHaveBeenCalledWith('a@');
  });

  it('rejects a missing query param without calling the service', async () => {
    const rejection = ctrl.search(undefined).catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(svc.searchUsers).not.toHaveBeenCalled();
  });

  it('rejects an empty/whitespace query param', async () => {
    const rejection = ctrl.search('   ').catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(svc.searchUsers).not.toHaveBeenCalled();
  });
});

describe('AdminUserRolesController.getRoles', () => {
  it('parses the numeric id and delegates to the service', async () => {
    const roles: AdminUserRoles = { id: 42, email: 'a@aiqadam.org', name: 'A', groups: [] };
    svc.getRoles.mockResolvedValueOnce(roles);

    const result = await ctrl.getRoles('42');

    expect(result).toEqual(roles);
    expect(svc.getRoles).toHaveBeenCalledWith(42);
  });

  it('rejects a non-numeric id', async () => {
    const rejection = ctrl.getRoles('not-a-number').catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(svc.getRoles).not.toHaveBeenCalled();
  });

  it('rejects a zero/negative id', async () => {
    const rejection = ctrl.getRoles('0').catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
  });
});

describe('AdminUserRolesController.changeRole', () => {
  it('validates and delegates a valid grant body', async () => {
    const roles: AdminUserRoles = {
      id: 42,
      email: 'a@aiqadam.org',
      name: 'A',
      groups: ['aiqadam-member'],
    };
    svc.changeRole.mockResolvedValueOnce(roles);

    const result = await ctrl.changeRole(makeReq(), '42', { grant: 'aiqadam-member' });

    expect(result).toEqual(roles);
    expect(svc.changeRole).toHaveBeenCalledWith(42, { grant: 'aiqadam-member' }, 'actor-uuid-1');
  });

  it('rejects a body with an unknown role group (schema enum enforcement)', async () => {
    const rejection = ctrl
      .changeRole(makeReq(), '42', { grant: 'not-a-real-role' })
      .catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(svc.changeRole).not.toHaveBeenCalled();
  });

  it('rejects a body with an extra unknown field (schema .strict())', async () => {
    const rejection = ctrl
      .changeRole(makeReq(), '42', { grant: 'aiqadam-member', extra_field: 'x' })
      .catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(svc.changeRole).not.toHaveBeenCalled();
  });

  it('rejects when the request has no attached user claims', async () => {
    const reqWithoutUser = {} as unknown as Request;
    const rejection = ctrl
      .changeRole(reqWithoutUser, '42', { grant: 'aiqadam-member' })
      .catch((e: unknown) => e);
    const err = await rejection;
    expect(err).toBeInstanceOf(Error);
    expect(svc.changeRole).not.toHaveBeenCalled();
  });
});
