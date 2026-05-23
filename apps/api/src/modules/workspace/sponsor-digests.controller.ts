import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { type SponsorDigestTickResult, SponsorDigestsService } from './sponsor-digests.service';

// F-S3.8 — Sponsor quarterly digest cron entry (ADR-0036).
// External GHA scheduler fires this on the 5th of each month; the
// service no-ops if the just-closed quarter's digests are already
// generated.

@Controller('v1/internal/sponsor-digest')
@UseGuards(InternalAuthGuard)
export class SponsorDigestsController {
  constructor(private readonly service: SponsorDigestsService) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(): Promise<SponsorDigestTickResult> {
    return this.service.tick();
  }
}
