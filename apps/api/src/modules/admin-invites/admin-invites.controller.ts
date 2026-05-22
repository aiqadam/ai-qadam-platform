import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import {
  ALLOWED_ROLE_GROUPS,
  AdminInvitesService,
  type CreateInviteResult,
  type RoleGroup,
} from './admin-invites.service';
import { SuperAdminGuard } from './super-admin.guard';

// F-S2.7 (ADR-0035) — admin surface for operator invites. Routes are
// gated by AuthGuard + SuperAdminGuard chain: AuthGuard attaches the
// caller's verified claims; SuperAdminGuard looks up live group state
// in Authentik. List + status fetch ship in PR-4 alongside the
// onboarding endpoints.

const createSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    display_name: z.string().trim().min(1).max(120).optional(),
    role_groups: z
      .array(z.enum([...ALLOWED_ROLE_GROUPS] as [RoleGroup, ...RoleGroup[]]))
      .min(1)
      .max(8),
    country: z.enum(['uz', 'kz', 'tj', 'xx']).optional(),
    delivery_channel: z.enum(['email', 'telegram', 'copy_paste']),
    notes: z.string().max(2000).optional(),
  })
  .strict();

@Controller('v1/admin/invites')
@UseGuards(AuthGuard, SuperAdminGuard)
export class AdminInvitesController {
  constructor(private readonly invites: AdminInvitesService) {}

  @Post()
  async create(@Req() req: Request, @Body() body: unknown): Promise<CreateInviteResult> {
    const callerId = requireUserId(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.invites.createInvite(parsed.data, callerId);
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@Req() req: Request, @Param('id') id: string): Promise<void> {
    const callerId = requireUserId(req);
    await this.invites.revokeInvite(id, callerId);
  }
}

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}
