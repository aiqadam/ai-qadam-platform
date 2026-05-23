import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  type FinalizeResult,
  OnboardingEmailRoutingService,
  type StatusResult,
  type SubmitDestinationResult,
} from './onboarding-email-routing.service';

// F-S2.8.1 — public endpoints under /v1/onboard/email-routing.
// Token-as-credential (no AuthGuard), matching the existing
// /v1/onboard/preview + /v1/onboard/accept controller pattern.
// Rate-limiting at the reverse-proxy layer is the same posture as
// /v1/onboard/* per F-S2.7.

const submitSchema = z
  .object({
    token: z.string().min(16).max(128),
    destination_gmail: z.string().trim().toLowerCase().email().max(254),
  })
  .strict();

const finalizeSchema = z.object({ token: z.string().min(16).max(128) }).strict();

@Controller('v1/onboard/email-routing')
export class OnboardingEmailRoutingController {
  constructor(private readonly svc: OnboardingEmailRoutingService) {}

  @Post('destination')
  @HttpCode(200)
  async submitDestination(@Body() body: unknown): Promise<SubmitDestinationResult> {
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.svc.submitDestination(parsed.data);
  }

  @Get('status')
  async status(@Query('token') token?: string): Promise<StatusResult> {
    if (!token) {
      throw new BadRequestException('token_required');
    }
    if (token.length < 16 || token.length > 128) {
      throw new BadRequestException('token_invalid');
    }
    return this.svc.getStatus(token);
  }

  @Post('finalize')
  @HttpCode(200)
  async finalize(@Body() body: unknown): Promise<FinalizeResult> {
    const parsed = finalizeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.svc.finalize(parsed.data.token);
  }
}
