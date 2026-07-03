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

## Provisioning endpoints (non-tick)

Not every `/v1/internal/...` route is a tick. A small, separate class of
**action endpoints** is mounted on the same `InternalController` (same
`InternalAuthGuard`, same `x-internal-auth: ${INTERNAL_API_TOKEN}` header)
and used for **idempotent provisioning that bypasses a round-trip through
the public OIDC callback**.

The canonical example is:

| Endpoint | Purpose | Used by |
|---|---|---|
| `POST /v1/internal/users/ensure-linked` | Look up a local user by email and link / create the matching `directus_users` row (delegates to `DirectusUsersBridgeService.ensureLinkedByEmail` → existing `ensureLinked`). Returns `{directusUserId}` or `null`. | `scripts/uat-seed.sh` `ensure_test_user()` — provisions every freshly-added STEP-3 identity fixture into Directus during `--reset` so domain fixtures (events, registrations, `operator_invites`, ...) have a real `directus_user_id` foreign key to point at. |

### When to prefer an action endpoint over the OIDC callback

The public OIDC callback (`/v1/auth/callback` → `upsertByAuthentikSubject`
→ `ensureLinked`, documented in `docs/02-business-processes/operations/lead-nurture.md`)
is the right path for **interactive user sign-in**. The action endpoint
is the right path when:

- A provisioning script (e.g. `uat-seed.sh`) needs to materialize a
  Directus row for a user that never logs in during the script.
- An operator-cabinet job needs to repair a missing `directus_user_id`
  without forcing the affected user to sign out and back in.
- A backfill needs to run idempotently across many users in one pass
  (the callback path is one-user-per-sign-in by definition).

### Conventions

- Mounted on the same `InternalController` with the same
  `InternalAuthGuard`. No separate auth surface to audit.
- Body validated with Zod (matches the rest of the API's input rules —
  see `docs/04-development/security/security.md` §Input validation).
- **Idempotent by design.** Repeated calls with the same `email` are
  safe and return the same `directusUserId`. Never name a non-idempotent
  action endpoint under `/v1/internal/...`.
- **Not exposed to browser traffic.** No CORS allowance, no public docs
  entry in `apps/api` OpenAPI — internal clients only.

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
