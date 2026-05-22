# Runbook: Pre-event reminder cron (`reminder_72h` + `reminder_3h`)

**Audience:** engineers wiring the scheduler; operators monitoring delivery.
**Pre-reading:** [event-publication-broadcast.md](./event-publication-broadcast.md), [interaction-architecture.md](../interaction-architecture.md), [ux-and-content-guidelines.md §13](../ux-and-content-guidelines.md#13-notification-copy-library).
**Ships:** F-S1.4 (T-2 + T-3h attendee reminders). T-7 speaker brief deferred to F-S1.4b once F-S1.1b adds the speakers schema.

## What this does

Every ~10 minutes an external scheduler POSTs to `/v1/internal/event-reminders/tick` (InternalAuthGuard, `x-internal-auth: $INTERNAL_API_TOKEN`). The service:

1. Queries published events whose `starts_at` falls in the T-2 window `[now+38h, now+58h]`.
2. Queries published events whose `starts_at` falls in the T-3h window `[now+2h, now+4h]`.
3. For each candidate event × kind, checks the `event_announcements` ledger; if a row already exists, skips (`already_dispatched`).
4. Else, fetches registered/attended attendees (`status IN (registered, attended)`), dispatches `reminder_72h` or `reminder_3h` via `InteractionsService.dispatch` (consentBasis `operational_contract`, channel `email`), and records the ledger row.

Idempotent on `(event, kind)`. A second tick is a no-op for events already announced.

## Window math (why the bands are wide)

- **T-2 window** `[38h, 58h]` — 20-hour-wide band. A 10-min tick cadence walks the window in 120 ticks; an event at exactly T-48h is caught the first tick whose `now+38h ≤ event.starts_at ≤ now+58h` evaluates true. Even if the scheduler misses 20 hours (API down, host reboot, etc.), the event is still caught on the next tick within the window.
- **T-3h window** `[2h, 4h]` — 2-hour-wide band, tighter because the closer we are to the event, the more timing matters.

Trade-off: a wider window means a single event can match more ticks; the ledger row makes that safe (second tick sees the row, short-circuits to `already_dispatched`). Narrower would risk missing an event entirely if the scheduler hiccups.

## Audience model

`status IN (registered, attended)` — exclude waitlisted (they haven't been promoted) and cancelled. `attended` is included so an organiser who pre-marked attendance still gets the heads-up email (rare but possible if check-in opens early).

No consent gate beyond the dispatcher's `operational_contract` default — reminders are service-level, not marketing. A member who unsubscribed from `events` consent still receives their reminder for an event they actively registered for. Per ADR-0033 "operational_contract = the thing you explicitly signed up for."

## Wiring the external scheduler

v1 ships the endpoint + service. **The scheduler itself is per-environment and intentionally not in this PR.** Choose one of:

### Option A — GitHub Actions cron (matches F-S0.11 prod-probe pattern)

```yaml
# .github/workflows/event-reminders-cron.yml
name: event-reminders-tick
on:
  schedule:
    - cron: '*/10 * * * *' # every 10 min
  workflow_dispatch: {}
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST \
            -H "x-internal-auth: $INTERNAL_API_TOKEN" \
            https://aiqadam.org/api/v1/internal/event-reminders/tick
        env:
          INTERNAL_API_TOKEN: ${{ secrets.INTERNAL_API_TOKEN }}
```

GitHub free-tier cron has ~5-15 min jitter; combined with the 20-hour T-2 window the jitter is invisible.

### Option B — Coolify scheduled task

In Coolify app settings → Scheduled tasks → Add task:
- Command: `curl -fsS -X POST -H "x-internal-auth: $INTERNAL_API_TOKEN" http://aiqadam-api/v1/internal/event-reminders/tick`
- Frequency: `*/10 * * * *`

Pro: runs inside the Coolify network, no network egress, no GitHub Actions cost. Con: Coolify scheduled-task UI was inconsistent in past projects.

### Option C — systemd timer on the host (matches F-S0.5 restic-drill)

Mirrors the existing `aiqadam-restore-drill.timer`. Owns its own log lines. Tightest cadence guarantee.

**Recommended for prod:** Option A (lowest moving parts; auditable in GH UI). Switch to C if GH Actions cost becomes a constraint.

## Operational verification

After the scheduler is wired, on staging:

1. Create an event in `status='published'` with `starts_at = now + 50h` (in the T-2 window).
2. Register 2-3 members for it.
3. Wait for next tick (or manually `curl -X POST -H "x-internal-auth: $TOKEN" /v1/internal/event-reminders/tick`).
4. Check `event_announcements` for a `(event=X, kind='reminder_t_minus_2')` row.
5. Check `interactions` for a row whose `interaction_id` matches the ledger's `dispatched_interaction_id`.
6. Check `deliveries` for one row per registered member, `state IN (sent, failed)`.
7. Tick again immediately — should return `{dispatched: [], skipped: [{kind:'reminder_t_minus_2', reason:'already_dispatched'}]}`.

## Failure modes + recovery

### "I got two reminders for the same event"
Shouldn't happen — `(event, kind)` ledger row is the gate. If it does, look for two rows in `event_announcements` for the same `(event, kind)` — manual cleanup in Directus admin.

### "I didn't get a reminder for an event I'm registered for"
1. Was the event status=published? Drafts are skipped.
2. Was the event's `starts_at` in the window when the scheduler last ticked? Check api logs for `event-reminders tick — evaluated=N` lines; cross-reference with the event's id.
3. Check `event_announcements` for the event — if a row exists, the dispatch happened. Then check `interactions` and `deliveries` for your user — likely a delivery failure or your email bounced.
4. If the row doesn't exist and the event was in window, the scheduler may have missed the window. Check the next tick.

### "Tick returns 401"
The scheduler is sending the wrong `INTERNAL_API_TOKEN`. Check the secret matches `/tmp/aiqadam-secrets-INTERNAL_API_TOKEN` value AND the api's `env.INTERNAL_API_TOKEN`.

### "I want to manually re-send a reminder"
Delete the `event_announcements` row for that `(event, kind)` in Directus admin, then trigger the tick (or wait for the next scheduled one).

### "Tick is slow / times out"
Per-tick cost is small (2 list queries + N events × (1 ledger check + 1 attendee query + 1 dispatch + 1 ledger insert)). With 5-10 active events per tick and ~50 attendees each, expect <2s. If slower, look at Directus latency (the bulk of the time is `MembersService` + `attendeesOf`).

## Related

- `apps/api/src/modules/workspace/event-reminders.service.ts` — tick + window logic
- `apps/api/src/modules/workspace/event-reminders.controller.ts` — POST entry
- `apps/api/test/event-reminders-service.spec.ts` — 6 unit tests (windowing + dispatch + idempotency + no-audience + attendees filter)
- `apps/e2e/tests/smoke-event-reminders.spec.ts` — 2 smoke tests
- `infrastructure/directus/bootstrap.sh` `[event_announcements]` — ledger schema (extended kind enum)
- UX copy: [`ux-and-content-guidelines.md §13`](../ux-and-content-guidelines.md#13-notification-copy-library) `reminder_72h` + `reminder_3h` rows
- F-S1.1a (publication) + F-S1.1c (post-event cron) share the same ledger collection.
