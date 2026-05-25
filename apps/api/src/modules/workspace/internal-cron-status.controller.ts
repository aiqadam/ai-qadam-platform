import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { type TickHealthRow, TickHealthService } from '../internal-cron/tick-health.service';

// #392 — operator visibility for in-process cron ticks. Reads the
// sidecar metadata TickLockService.withLock writes after each tick.
//
// Cabinet at /workspace/admin/cron consumes this; powers a table that
// answers "did this tick fire today, how long did it take, did it
// succeed."
//
//   200: { ticks: TickHealthRow[] }
//   401/403: AuthGuard

@Controller('v1/workspace/internal-cron')
@UseGuards(AuthGuard)
export class InternalCronStatusController {
  constructor(private readonly health: TickHealthService) {}

  @Get('status')
  async status(): Promise<{ ticks: TickHealthRow[] }> {
    const ticks = await this.health.listAll();
    return { ticks };
  }
}
