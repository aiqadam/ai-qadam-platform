import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { EventSpeakerBriefsService, type TickResult } from './event-speaker-briefs.service';

// F-S1.4b — T-7 speaker brief cron entrypoint.
// Auth: InternalAuthGuard (`x-internal-auth`). External scheduler ticks
// ~hourly. See `docs/02-business-processes/operations/event-pre-event-reminders.md` for wiring.

@Controller('v1/internal/event-speaker-briefs')
@UseGuards(InternalAuthGuard)
export class EventSpeakerBriefsController {
  constructor(private readonly briefs: EventSpeakerBriefsService) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(): Promise<TickResult> {
    return this.briefs.tick();
  }
}
