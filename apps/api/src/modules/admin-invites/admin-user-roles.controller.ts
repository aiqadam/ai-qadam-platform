import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import {
  ALLOWED_COUNTRIES,
  type AdminUserRoles,
  type AdminUserSummary,
  type AllowedCountry,
  AdminUserRolesService,
  HUMAN_ROLE_GROUPS,
  type HumanRoleGroup,
} from './admin-user-roles.service';
import { SuperAdminGuard } from './super-admin.guard';

// FR-ADM-011 — admin user/role management. Same guard chain as
// AdminInvitesController (FR-ADM-005/FR-ADM-007's established pattern):
// AuthGuard attaches verified claims, SuperAdminGuard live-checks
// Authentik group membership on every request (no caching — a revoked
// admin must lose access immediately, not after a TTL).

const changeRoleSchema = z
  .object({
    grant: z.enum([...HUMAN_ROLE_GROUPS] as [HumanRoleGroup, ...HumanRoleGroup[]]).optional(),
    revoke: z.enum([...HUMAN_ROLE_GROUPS] as [HumanRoleGroup, ...HumanRoleGroup[]]).optional(),
    country: z.enum([...ALLOWED_COUNTRIES] as [AllowedCountry, ...AllowedCountry[]]).optional(),
  })
  .strict();

@Controller('v1/admin/users')
@UseGuards(AuthGuard, SuperAdminGuard)
export class AdminUserRolesController {
  constructor(private readonly userRoles: AdminUserRolesService) {}

  @Get()
  async search(@Query('q') q?: string): Promise<{ users: AdminUserSummary[] }> {
    if (!q || q.trim().length === 0) {
      throw new BadRequestException('query_param_q_required');
    }
    const users = await this.userRoles.searchUsers(q);
    return { users };
  }

  @Get(':id/roles')
  async getRoles(@Param('id') id: string): Promise<AdminUserRoles> {
    return this.userRoles.getRoles(parsePk(id));
  }

  @Patch(':id/roles')
  async changeRole(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminUserRoles> {
    const callerId = requireUserId(req);
    const parsed = changeRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.userRoles.changeRole(parsePk(id), parsed.data, callerId);
  }
}

function parsePk(id: string): number {
  const pk = Number(id);
  if (!Number.isInteger(pk) || pk <= 0) {
    throw new BadRequestException('invalid_user_id');
  }
  return pk;
}

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}
