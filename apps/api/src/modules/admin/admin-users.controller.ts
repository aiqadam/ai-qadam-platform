import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { type Role, Roles } from '../auth/roles.decorator';
import { UsersService } from '../users/users.service';

// /v1/admin/users — wraps our users table for the admin UI. Authentik
// integration (group sync, invite flow) is deferred to Phase 2.2 — needs
// Listmonk + AUTHENTIK_API_TOKEN promoted to env var.

interface AdminUserResponse {
  id: string;
  email: string;
  displayName: string | null;
  handle: string | null;
  role: Role;
  createdAt: string;
  lastLoginAt: string;
}

interface PatchRoleBody {
  role?: string;
}

const ROLES: ReadonlySet<Role> = new Set(['member', 'organizer', 'country_admin', 'super_admin']);

@Controller('v1/admin/users')
@UseGuards(AuthGuard, AdminGuard)
@Roles('super_admin')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(): Promise<{ users: AdminUserResponse[] }> {
    const rows = await this.users.listAll();
    return {
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        handle: u.handle,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt.toISOString(),
      })),
    };
  }

  @Patch(':userId/role')
  async updateRole(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() req: Request,
    @Body() body: PatchRoleBody,
  ): Promise<AdminUserResponse> {
    if (!body.role || !ROLES.has(body.role as Role)) {
      throw new BadRequestException(`role must be one of ${Array.from(ROLES).join(', ')}`);
    }
    // Refuse to self-demote — keeps a foot in the door against accidental
    // lockout. To genuinely change your own role, use another super_admin.
    if (req.user && req.user.sub === userId) {
      throw new BadRequestException('cannot change your own role');
    }
    const updated = await this.users.updateRole({ userId, role: body.role as Role });
    if (!updated) throw new NotFoundException(`user ${userId} not found`);
    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      handle: updated.handle,
      role: updated.role,
      createdAt: updated.createdAt.toISOString(),
      lastLoginAt: updated.lastLoginAt.toISOString(),
    };
  }
}
