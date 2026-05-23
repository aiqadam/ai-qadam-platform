import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { type MyReferralStats, type ReferralCodeView, ReferralsService } from './referrals.service';

// F-S3.9 — referral codes + attribution.
// Public POST /v1/referrals/resolve so unauthenticated visitors can resolve
// ?ref=CODE → owner_user_id (cached client-side for the eventual registration
// submit). The other two endpoints are member-only.

const resolveSchema = z.object({
  code: z.string().trim().min(1).max(24),
});

@Controller('v1/referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Post('issue')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async issue(@Req() req: Request): Promise<{ code: ReferralCodeView }> {
    const { sub, email } = requireUser(req);
    const code = await this.referrals.issueForUser(sub, email);
    return { code };
  }

  @Get('mine')
  @UseGuards(AuthGuard)
  async mine(@Req() req: Request): Promise<{ codes: ReferralCodeView[] }> {
    const { sub, email } = requireUser(req);
    const codes = await this.referrals.listMine(sub, email);
    return { codes };
  }

  // F-S5.3 — "brought a friend" stats for the signed-in member.
  // Separate endpoint (not folded into /mine) so EventShareButtons,
  // which calls /mine on every event detail page load, doesn't pay
  // for the extra 2 queries.
  @Get('mine/stats')
  @UseGuards(AuthGuard)
  async myStats(@Req() req: Request): Promise<MyReferralStats> {
    const { sub, email } = requireUser(req);
    return this.referrals.getMyStats(sub, email);
  }

  // Public: anonymous visitor lands at /?ref=CODE; client resolves to
  // owner_user_id, then stashes it in a long-lived cookie for the
  // eventual registration submit. Returns null when the code is bogus
  // or expired — clients should treat that as "no referral".
  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  async resolve(@Body() body: unknown): Promise<{ ownerUserId: string | null }> {
    const parsed = resolveSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.referrals.resolveCode(parsed.data.code);
    return { ownerUserId: result?.ownerUserId ?? null };
  }
}

function requireUser(req: Request): { sub: string; email: string } {
  if (!req.user) throw new UnauthorizedException('not signed in');
  return { sub: req.user.sub, email: req.user.email };
}
