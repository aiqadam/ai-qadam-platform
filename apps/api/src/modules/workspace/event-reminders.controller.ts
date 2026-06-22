import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { EventRemindersService, type TickResult } from './event-reminders.service';

// F-S1.4 — pre-event reminder cron entrypoint.
// Auth: InternalAuthGuard (Bearer token from INTERNAL_API_TOKEN). The
// expected caller is an external scheduler (GitHub Actions cron, Coolify
// scheduled task, or a host systemd timer) that ticks every ~10 min.
// See `docs/02-business-processes/operations/event-pre-event-reminders.md` for the wiring.

@Controller('v1/internal/event-reminders')
@UseGuards(InternalAuthGuard)
export class EventRemindersController {
  constructor(private readonly reminders: EventRemindersService) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(): Promise<TickResult> {
    return this.reminders.tick();
  }
}
