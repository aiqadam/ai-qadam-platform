import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { EventMatchesService, type MatchTickResult } from './event-matches.service';

// F-S1.5 — pre-event member-matching tick.
// Same external-scheduler pattern as F-S1.4 event-reminders.

@Controller('v1/internal/event-matches')
@UseGuards(InternalAuthGuard)
export class EventMatchesController {
  constructor(private readonly matches: EventMatchesService) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(): Promise<MatchTickResult> {
    return this.matches.tick();
  }
}
