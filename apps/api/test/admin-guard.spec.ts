import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../src/modules/auth/admin.guard';
import { ROLES_KEY, type Role } from '../src/modules/auth/roles.decorator';
import type { UsersService } from '../src/modules/users/users.service';

const fakeUsers = (id: string, role: Role | null): UsersService =>
  ({
    findById: vi.fn(async () => (id ? { id, role: role as Role, email: 't@e.com' } : undefined)),
  }) as unknown as UsersService;

const reflectorReturning = (roles: Role[] | undefined): Reflector =>
  ({
    getAllAndOverride: () => roles,
  }) as unknown as Reflector;

const reqWithUser = (sub: string | undefined): Request =>
  ({
    user: sub ? { sub, authentikSubject: 'ak', email: 'e@e.com' } : undefined,
  }) as unknown as Request;

const ctxFor = (req: Request): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: <T>() => req as T,
      getResponse: <T>() => ({}) as T,
      getNext: <T>() => ({}) as T,
    }),
    getHandler: () => () => undefined,
    getClass: () => Object,
  }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  it('allows requests with no @Roles metadata', async () => {
    const guard = new AdminGuard(reflectorReturning(undefined), fakeUsers('u1', 'member'));
    await expect(guard.canActivate(ctxFor(reqWithUser('u1')))).resolves.toBe(true);
  });

  it('allows requests when role matches one of required', async () => {
    const guard = new AdminGuard(
      reflectorReturning(['country_admin', 'super_admin']),
      fakeUsers('u1', 'super_admin'),
    );
    await expect(guard.canActivate(ctxFor(reqWithUser('u1')))).resolves.toBe(true);
  });

  it('rejects 401 when AuthGuard did not populate req.user', async () => {
    const guard = new AdminGuard(
      reflectorReturning(['country_admin']),
      fakeUsers('u1', 'country_admin'),
    );
    await expect(guard.canActivate(ctxFor(reqWithUser(undefined)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects 403 when user has insufficient role', async () => {
    const guard = new AdminGuard(reflectorReturning(['super_admin']), fakeUsers('u1', 'member'));
    await expect(guard.canActivate(ctxFor(reqWithUser('u1')))).rejects.toThrow(ForbiddenException);
  });

  it('rejects 403 when user is missing from DB', async () => {
    const guard = new AdminGuard(reflectorReturning(['super_admin']), fakeUsers('', 'super_admin'));
    await expect(guard.canActivate(ctxFor(reqWithUser('u1')))).rejects.toThrow(ForbiddenException);
  });
});

// Tiny sanity check: ROLES_KEY is unique enough to avoid Nest metadata collisions.
describe('ROLES_KEY', () => {
  it('is a namespaced string', () => {
    expect(ROLES_KEY).toBe('aiqadam:roles');
  });
});
