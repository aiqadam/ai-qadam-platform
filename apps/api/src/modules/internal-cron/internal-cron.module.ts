import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { TickHealthService } from './tick-health.service';
import { TICK_LOCK_REDIS, TickLockService } from './tick-lock.service';

// In-platform replacement for external GHA / systemd-timer cron.
//
// Provides:
//   - @nestjs/schedule's @Cron / @Interval decorator runtime
//   - TickLockService — Redis SET-NX distributed mutex so multi-replica
//     deploys don't double-fire
//
// Why in-platform: AI Qadam targets self-sufficient platform cost.
// External CI cron means an additional secret (INTERNAL_API_TOKEN),
// an additional failure mode (network, GHA outage), and added blast
// radius for a misconfigured pipeline. The Redis lock + Nest cron
// pair has zero recurring spend beyond the Redis we already run.
//
// Pattern (in any service):
//   @Cron(CronExpression.EVERY_10_MINUTES)
//   async scheduledTick(): Promise<void> {
//     await this.locks.withLock('my-tick', 540, async () => this.tick());
//   }
//
// The InternalAuthGuard /tick controllers stay — they're still useful
// as operator escape hatches for force-trigger + the GHA workflows we
// haven't deleted yet. The in-process @Cron is the primary path; the
// HTTP endpoint is the fallback.

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    {
      provide: TICK_LOCK_REDIS,
      useFactory: (): Redis =>
        new Redis(env.REDIS_URL, {
          lazyConnect: false,
          maxRetriesPerRequest: 3,
        }),
    },
    TickLockService,
    TickHealthService,
  ],
  exports: [TickLockService, TickHealthService, ScheduleModule],
})
export class InternalCronModule {}
