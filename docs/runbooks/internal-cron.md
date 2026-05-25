# Internal cron scheduler — runbook

## What

All time-based ticks (event reminders, post-event follow-up, member matches, sponsor digests, broadcast scheduler, RBAC poll, lead nurture) run **in-process** via `@nestjs/schedule` on the api container, with a Redis distributed lock so multi-replica deploys don't double-fire.

## Why in-platform

AI Qadam targets self-sufficient platform cost. External CI cron (GitHub Actions, systemd timers on prod host) means:

- Extra secret to rotate (`INTERNAL_API_TOKEN`)
- Extra failure mode (GHA outage, runner queue, network)
- Extra blast radius for misconfigured pipelines
- Extra service dependency to monitor

The Redis we already run + Nest's `@Cron` decorator is the smallest thing that works, with zero recurring spend beyond what's already deployed.

## Architecture

```
@Cron('* * * * *') @nestjs/schedule decorator
  └─ scheduledTick()
       └─ TickLockService.withLock('<name>', ttlSec, async () => this.tick())
            └─ Redis SET <key> <holderId> EX <ttl> NX (atomic mutex)
                 └─ Run tick() if we won the race; release via Lua CAS
```

The `<holderId>` is unique per-process-per-process-start. Release uses a Lua compare-and-swap so an expired-and-reacquired-elsewhere lock can't be stomped.

## Tick inventory

| Service | Cron pattern | Lock name | TTL |
|---|---|---|---|
| `TgBroadcastsSenderService.sendDue` | every minute | `tg-broadcasts-send-due` | 540s |
| `EventRemindersService.tick` | every 10 min | `event-reminders` | 540s |
| `EventMatchesService.tick` | every 10 min | `event-matches` | 540s |
| `EventMatchesPostRegService.tick` | every 10 min | `event-matches-post-reg` | 540s |
| `EventSpeakerBriefsService.tick` | every 30 min | `event-speaker-briefs` | 540s |
| `PostEventCronService.tick` | every hour | `post-event-cron` | 540s |
| `LeadNurtureCronService.tick` | every 30 min | `lead-nurture` | 540s |
| `SponsorDigestsService.tick` | 04:00 UTC on day 5 of month | `sponsor-digests` | 600s |
| `RbacSyncService.pollAllUsers` | 03:30 UTC daily | `rbac-sync-poll` | 540s |

TTL should be longer than the longest expected tick duration. If a holder crashes mid-tick, the next replica picks up after TTL expiry.

## Escape hatches

Every tick still has a corresponding `POST /v1/internal/<name>/tick` endpoint protected by `InternalAuthGuard` (Bearer `INTERNAL_API_TOKEN`). Use these to:

- Force-trigger a tick from operator cabinet / curl during incident response
- Manually re-run a failed-and-retried tick after a fix
- Smoke-test a freshly-deployed tick before waiting for the next scheduled fire

## Multi-replica safety

When we scale `aiqadam-api` past 1 replica, the Redis SET-NX lock ensures only one replica runs each tick per fire. No additional config needed. The lock TTL means a crashed replica's lock auto-releases.

## Adding a new tick

```typescript
// In your service file
import { Cron, CronExpression } from '@nestjs/schedule';
import { TickLockService } from '../internal-cron/tick-lock.service';

@Injectable()
export class MyService {
  constructor(
    // ... existing deps ...
    private readonly locks: TickLockService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledTick(): Promise<void> {
    await this.locks.withLock('my-tick-name', 540, async () => {
      await this.tick();
    });
  }

  async tick(): Promise<TickResult> {
    // ... existing logic ...
  }
}
```

The `InternalCronModule` is `@Global` so `TickLockService` is injectable from any module.

## Observability

Each scheduled tick logs `scheduledTick ...` via the service's Nest Logger. To check the last fire time:

```bash
ssh aiqadam-admin@212.20.151.29 \
  "sudo docker logs <api-container> 2>&1 | grep 'scheduledTick' | tail -20"
```

To check current Redis lock state (during an incident):

```bash
ssh aiqadam-admin@212.20.151.29 \
  "sudo docker exec mrdg9pq6mc7pahscin6brsz3 redis-cli keys 'tick-lock:*'"
```

## Migrating from external cron

Done in this PR. The deleted workflows + runbooks:

- `.github/workflows/sponsor-digest-cron.yml` → replaced by `@Cron('0 4 5 * *')` on `SponsorDigestsService.scheduledTick`
- `.github/workflows/rbac-poll.yml` → replaced by `@Cron('30 3 * * *')` on `RbacSyncService.scheduledTick`
- `docs/runbooks/tg-broadcasts-scheduler.md` (GHA/systemd recipes) → replaced by this runbook

## Related

- ADR-0034 — outbox + notifier (the broadcast scheduler is one consumer)
- `apps/api/src/modules/internal-cron/` — module source
- `apps/api/src/modules/internal-cron/tick-lock.service.ts` — Redis lock implementation
