import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import {
  EventMatchesPostRegService,
  type PostRegTickResult,
} from './event-matches-post-reg.service';

// F-S1.5b — T+3 post-registration match cron entrypoint.
// Auth: InternalAuthGuard (`x-internal-auth`). External scheduler ticks
// hourly. See docs/runbooks/event-member-matches.md for wiring.

@Controller('v1/internal/event-matches-post-reg')
@UseGuards(InternalAuthGuard)
export class EventMatchesPostRegController {
  constructor(private readonly svc: EventMatchesPostRegService) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(): Promise<PostRegTickResult> {
    return this.svc.tick();
  }
}
