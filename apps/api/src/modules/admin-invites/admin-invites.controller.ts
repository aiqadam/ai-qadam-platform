import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
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
  type InviteSummary,
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
    // display_name is REQUIRED — it drives the Authentik username
    // (firstname.lastname), upn (<user>@aiqadam.org), and mailboxEmail.
    // Deriving from the email local-part produces broken handles for
    // recovery-style addresses (e.g. kambetbayeva@gmail.com would yield
    // "kambetbayeva" instead of "aigerim.kambetbayeva"). Lesson paid for
    // 2026-05-25.
    display_name: z.string().trim().min(1).max(120),
    role_groups: z
      .array(z.enum([...ALLOWED_ROLE_GROUPS] as [RoleGroup, ...RoleGroup[]]))
      .min(1)
      .max(8),
    country: z.enum(['uz', 'kz', 'tj', 'xx']).optional(),
    delivery_channel: z.enum(['email', 'telegram', 'copy_paste']),
    notes: z.string().max(2000).optional(),
    // F-S2.8: optional. When set + email is @aiqadam.org, the service
    // provisions Cloudflare Email Routing + per-operator Resend key.
    destination_gmail: z.string().trim().toLowerCase().email().max(254).optional(),
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

  @Get()
  async list(@Query('status') status?: string): Promise<{ invites: InviteSummary[] }> {
    const allowed = ['pending', 'consumed', 'revoked', 'expired'] as const;
    const filter = allowed.find((s) => s === status);
    const invites = await this.invites.listInvites(filter);
    return { invites };
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
