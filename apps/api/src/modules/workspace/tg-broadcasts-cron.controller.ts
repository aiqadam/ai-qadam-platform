import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { type SendNowResult, TgBroadcastsSenderService } from './tg-broadcasts-sender.service';

// #294 PR-d — scheduled-broadcast cron entrypoint.
//
// Auth: InternalAuthGuard (Bearer token from INTERNAL_API_TOKEN). The
// expected caller is an external scheduler ticking ~every minute. Same
// pattern as F-S1.4 EventRemindersController.
//
// Picks tg_broadcasts where status=scheduled AND scheduled_at <= now;
// runs the same sendNow logic per row. One row's failure does NOT block
// the rest of the tick (sender catches + persists failure_reason).
//
// Runbook: docs/runbooks/tg-broadcasts-scheduler.md (TODO with this PR).

@Controller('v1/internal/tg-broadcasts')
@UseGuards(InternalAuthGuard)
export class TgBroadcastsCronController {
  constructor(private readonly sender: TgBroadcastsSenderService) {}

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  async tick(): Promise<{ tick_count: number; results: SendNowResult[] }> {
    return this.sender.sendDue();
  }
}
