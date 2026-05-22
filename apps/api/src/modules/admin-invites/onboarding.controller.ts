import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminInvitesService, type InvitePreview } from './admin-invites.service';

// F-S2.7 (ADR-0035) — public onboarding endpoints. Invitee opens
// /onboard?token=<plaintext>, the web app calls GET /v1/onboard/preview
// to render the form, then POST /v1/onboard/accept to set password +
// AUP. NO AuthGuard — the token itself is the credential. 410 Gone is
// returned for any invalid/consumed/revoked/expired token (per ADR-0035
// §3 token-security posture).
//
// Note: the plaintext token IS the bearer for this flow. Rate-limit at
// the reverse-proxy layer (Caddy / Coolify) — covered in F-S0.10 prod
// hardening pass, not this PR.

const acceptSchema = z
  .object({
    token: z.string().min(16).max(128),
    password: z.string().min(12).max(256),
    aup_accepted: z.literal(true),
  })
  .strict();

@Controller('v1/onboard')
export class OnboardingController {
  constructor(private readonly invites: AdminInvitesService) {}

  @Get('preview')
  async preview(@Query('token') token?: string): Promise<InvitePreview> {
    if (!token) {
      throw new BadRequestException('token_required');
    }
    return this.invites.previewInvite(token);
  }

  @Post('accept')
  @HttpCode(204)
  async accept(@Body() body: unknown): Promise<void> {
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.invites.consumeInvite(parsed.data);
  }
}
