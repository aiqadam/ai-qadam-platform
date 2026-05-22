import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthentikClient } from './authentik.client';

// F-S2.7 (ADR-0035): super-admin gate for /v1/admin/* routes. Runs
// AFTER AuthGuard — relies on `req.user.authentikSubject` to look up
// the live group membership in Authentik. We do NOT trust a `groups`
// claim in the JWT (we don't emit one yet) and we do NOT cache —
// caching here means a revoked admin keeps their access until the
// cache TTL. This is an admin path; the extra round-trip is fine.
//
// SUPER_ADMIN_GROUP must match the group provisioned by
// scripts/provision-authentik-rbac-groups.sh.

const SUPER_ADMIN_GROUP = 'aiqadam-super-admin';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly authentik: AuthentikClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new UnauthorizedException('AuthGuard did not attach user');
    }
    if (!this.authentik.isConfigured()) {
      throw new ServiceUnavailableException('authentik_admin_not_configured');
    }
    const user = await this.authentik.getUserBySubject(req.user.authentikSubject);
    if (!user) {
      throw new ForbiddenException('authentik_user_not_found');
    }
    if (!user.is_active) {
      throw new ForbiddenException('authentik_user_disabled');
    }
    if (!user.groups.includes(SUPER_ADMIN_GROUP)) {
      throw new ForbiddenException('not_super_admin');
    }
    return true;
  }
}
