// Members onboarding controller — POST /v1/members/onboard (FR-MIG-020).
//
// Public surface for the Telegram acquisition funnel entry point.
// AuthGuard required (the session cookie gives the member identity).
// No rate-limit override — falls back to AppModule's global 60/min throttle.

import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { OnboardMemberDtoSchema } from './onboarding.dto';
import { MembersOnboardingService } from './onboarding.service';

@Controller('v1/members')
export class MembersOnboardingController {
  constructor(private readonly onboarding: MembersOnboardingService) {}

  /**
   * POST /v1/members/onboard
   *
   * Completes member onboarding: profile fields, skills, interests,
   * consents, onboarded_at timestamp, and first-join points.
   *
   * Idempotent: safe to call twice. Returns 204 on success.
   */
  @Post('onboard')
  @HttpCode(204)
  async onboard(@Req() req: Request, @Body() body: unknown): Promise<void> {
    const userId = requireUserId(req);
    const parsed = OnboardMemberDtoSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.onboarding.completeOnboarding(userId, parsed.data);
  }
}

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}
