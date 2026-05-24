# tg-broadcasts scheduler — runbook

## What

`POST /v1/internal/tg-broadcasts/tick` picks `tg_broadcasts` rows where:
- `status = 'scheduled'`
- `scheduled_at <= now()`

…and runs `TgBroadcastsSenderService.sendNow(id)` per row.

## Auth

`InternalAuthGuard` — Bearer token from `INTERNAL_API_TOKEN` env. Same key the
`event-reminders` + `event-matches` + `post-event` ticks use.

## How to schedule the tick

We don't have a managed scheduler yet; pick one of:

### Option A — GitHub Actions cron (current default for siblings)

Add a workflow that hits the endpoint every minute. Stable, no host
dependency, free for our usage tier.

```yaml
# .github/workflows/tg-broadcasts-tick.yml (NOT YET ADDED — TODO with first scheduled broadcast)
on:
  schedule:
    - cron: "* * * * *"
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sS -X POST \
            -H "Authorization: Bearer ${{ secrets.INTERNAL_API_TOKEN }}" \
            "https://uz.aiqadam.org/api/v1/internal/tg-broadcasts/tick"
```

### Option B — host systemd timer (matches existing event-reminders runbook)

```ini
# /etc/systemd/system/aiqadam-tg-broadcasts-tick.timer
[Unit]
Description=AI Qadam tg_broadcasts scheduler tick

[Timer]
OnCalendar=*-*-* *:*:00
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/aiqadam-tg-broadcasts-tick.service
[Unit]
Description=AI Qadam tg_broadcasts scheduler tick (oneshot)

[Service]
Type=oneshot
EnvironmentFile=/etc/aiqadam/internal-api-token
ExecStart=/usr/bin/curl -sS -X POST -H "Authorization: Bearer ${INTERNAL_API_TOKEN}" https://uz.aiqadam.org/api/v1/internal/tg-broadcasts/tick
```

## Operator UX

The composer's "Save + schedule" button writes `status='scheduled'` +
`scheduled_at` at the requested time. The cron picks it up within ~60s of
that timestamp and flips status through `sending` → `sent`.

If a tick fails for a row, `failure_reason` is populated; status flips to
`failed`. Operator can clear by re-saving as draft (composer's PATCH
clears `scheduled_at` when intent='save_draft').

## Verification after deploying

```bash
# Manual probe — should return { tick_count, results: [] } on empty queue
curl -sS -X POST \
  -H "Authorization: Bearer $INTERNAL_API_TOKEN" \
  https://uz.aiqadam.org/api/v1/internal/tg-broadcasts/tick
```

## Related

- `docs/runbooks/event-pre-event-reminders.md` — same pattern, T-2 / T-3h pre-event reminders.
- ADR-0034 — outbox + notifier architecture; this PR is the producer side.
- `apps/api/src/modules/workspace/tg-broadcasts-sender.service.ts` — implementation.
