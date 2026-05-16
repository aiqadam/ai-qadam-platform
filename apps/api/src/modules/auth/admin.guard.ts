import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UsersService } from '../users/users.service';
import { ROLES_KEY, type Role } from './roles.decorator';

// AdminGuard layers on top of AuthGuard. Order matters in @UseGuards:
//   @UseGuards(AuthGuard, AdminGuard)
//   @Roles('country_admin', 'super_admin')
//
// AuthGuard populates req.user from the JWT; AdminGuard looks up the
// current role from users.role (one extra DB read per admin request —
// kept fresh, no JWT-baked-in role to invalidate on role change).
// Routes without a @Roles decorator are allowed through (AdminGuard
// degrades to AuthGuard-only behaviour).

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new UnauthorizedException('AdminGuard requires AuthGuard upstream');
    }

    const user = await this.users.findById(req.user.sub);
    if (!user) {
      throw new ForbiddenException('user not found');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `insufficient role: have '${user.role}', need one of ${required.join(', ')}`,
      );
    }
    return true;
  }
}
