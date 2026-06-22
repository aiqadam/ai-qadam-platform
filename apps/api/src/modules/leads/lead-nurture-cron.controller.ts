import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { LeadNurtureCronService, type TickResult } from './lead-nurture-cron.service';

// F-S1.6b — lead nurture cron entrypoint.
// Auth: InternalAuthGuard (Bearer token from INTERNAL_API_TOKEN). Caller
// is an external scheduler ticking ~hourly. See
// `docs/02-business-processes/operations/lead-nurture.md` for wiring options.

@Controller('v1/internal/lead-nurture')
@UseGuards(InternalAuthGuard)
export class LeadNurtureCronController {
  constructor(private readonly nurture: LeadNurtureCronService) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(): Promise<TickResult> {
    return this.nurture.tick();
  }
}
