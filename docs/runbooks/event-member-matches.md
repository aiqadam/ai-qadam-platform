# Runbook: Pre-event member-to-member matching (T-7)

**Audience:** engineers wiring the scheduler; members who want to opt out.
**Pre-reading:** [event-pre-event-reminders.md](./event-pre-event-reminders.md), [member-profile.md](./member-profile.md), [interaction-architecture.md](../interaction-architecture.md), [ux-and-content-guidelines.md §13](../ux-and-content-guidelines.md#13-notification-copy-library).
**Ships:** F-S1.5.

## What this does

Once a day an external scheduler POSTs to `/v1/internal/event-matches/tick` (InternalAuthGuard, header `x-internal-auth: $INTERNAL_API_TOKEN`). The service:

1. Finds published events whose `starts_at` is in `[now+6.5d, now+7.5d]`.
2. For each such event:
   - Skip if `event_announcements (event, kind='member_match_t_minus_7')` already exists.
   - Fetch registered+attended attendees whose `directus_users.appear_in_matches=true`.
   - For each attendee, rank every other opted-in attendee by overlapping `member_interests.topic_tag` count (descending; first-name tiebreaker).
   - Send a personalised `member_match` email naming the top 3 (one dispatch per recipient — each payload is unique).
   - Record one `event_announcements` row stamping the first interaction id + total recipient count.

Idempotent on `(event, kind)`. Re-ticks within the same window are no-ops.

## Privacy + consent model

Two opt-out levers:

| Field | Default | Effect when false |
|---|---|---|
| `directus_users.appear_in_matches` | **true** | Member is never named in another's match email AND never receives one |
| `consent_basis='explicit_opt_in'` + `consent_scope={purpose:'events'}` | (dispatcher gate) | Consent revocation on `purpose=events` blocks delivery |

The first lever is intentionally opt-OUT (unlike `appear_in_directory` which is opt-IN). Reason: match email is per-event, recipient-only, low-volume — much smaller blast radius than a public directory. The trade-off favors discovery while keeping the kill switch on the member side.

Both checks compose: even if `appear_in_matches=true`, the dispatcher still skips the delivery if `events` consent is revoked. Net effect: the member sees the toggle in `/me/profile` (F-S1.5 addition) and can flip it without touching the consent ledger.

## Matching algorithm (v1 + F-S1.5b job-title overlap)

```
my_tags  = member_interests.topic_tag for me
my_role  = normalize(my.job_title)            ← lowercased + trimmed
for each other in attendees (opted in, not me):
  shared    = intersection(my_tags, other_tags)
  job_match = normalize(other.job_title) == my_role
  score     = shared.size * 2  +  (job_match ? 1 : 0)
rank by score (descending) → tiebreak by first_name (ascending) → top 3
```

Zero-overlap candidates are still included if the event has fewer than 3 opted-in attendees with overlapping signal. Better to introduce someone than nobody.

`job_title` match is exact-string after lowercase + trim — no taxonomy yet. Conservative on purpose: "Founder" / "Co-Founder" stay distinct until a controlled vocabulary lands. Scoring weight is half a tag-overlap (one job match = one shared tag), tuned to make tag signal dominant.

**Deliberate non-features (revisit when data justifies):**
- No `member_connections` history de-prioritisation (no "you met them last time" filter)
- No "ask me first" preview before names ship — opted-in by default per spec
- No Telegram channel routing — `allowedChannels=['email']` only
- Job-title taxonomy (ML Eng / MLE / Machine Learning Engineer all bucket together) is still a future-iteration

## F-S1.5b — T+3 post-registration trigger (shipped 2026-05-22)

A second cron complements T-7: per-registration follow-up that fires once a user has been registered for ≥ 3 days, on events still > 7 days out.

- **Endpoint:** `POST /v1/internal/event-matches-post-reg/tick` — `InternalAuthGuard`, hourly
- **Trigger:** `registrations.date_created <= now-3d` AND `status IN (registered, attended)` AND `user.appear_in_matches=true` AND `event.status='published'`
- **Lead-time guard:** event must be > 7 days out. Closer than that, the T-7 broadcast owns dispatch (otherwise the recipient would get two match emails). T+3 attempts in that range are skipped with reason `event_within_t_minus_7`.
- **Idempotency:** shared `member_match_dispatches(user, event, kind, ...)` ledger collection. T-7 and T+3 are **mutually exclusive per (user, event)** — whichever cron fires first writes the row; the other checks it before dispatching. The T-7 service also writes per-recipient rows (in addition to its event-level `event_announcements` row) so T+3 sees them.

Operational SQL:

```sql
-- Recent dispatches by kind (last 7d)
SELECT kind, COUNT(*) FROM member_match_dispatches
WHERE sent_at >= NOW() - INTERVAL '7 days' GROUP BY kind;

-- Pending T+3 candidates (would fire on next tick)
SELECT r.user, r.event, r.date_created, e.starts_at
FROM registrations r JOIN events e ON e.id = r.event
WHERE r.status IN ('registered','attended')
  AND r.date_created <= NOW() - INTERVAL '3 days'
  AND e.status='published'
  AND e.starts_at > NOW() + INTERVAL '7 days'
  AND r.user NOT IN (SELECT user FROM member_match_dispatches WHERE event = r.event);
```

## Wiring the external scheduler

Same three options as F-S1.4 reminders (GH Actions cron / Coolify scheduled task / systemd timer). For F-S1.5, **once a day at a quiet hour** is plenty (e.g. `0 6 * * *` UTC — that's 11am Tashkent, after the morning-coffee inbox check has settled).

Example GH Actions workflow:

```yaml
name: event-matches-tick
on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch: {}
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST \
            -H "x-internal-auth: $INTERNAL_API_TOKEN" \
            https://aiqadam.org/api/v1/internal/event-matches/tick
        env:
          INTERNAL_API_TOKEN: ${{ secrets.INTERNAL_API_TOKEN }}
```

## Operational verification

On staging:
1. Create a published event with `starts_at = now+7d`.
2. Register 4-5 members for it; verify each has `appear_in_matches=true` (default) + at least one `member_interests` row.
3. Tick the endpoint manually.
4. Check `event_announcements` for one row with `kind='member_match_t_minus_7'`.
5. Verify each opted-in attendee received exactly one `member_match` email with 3 names.
6. Verify a member with `appear_in_matches=false` neither received nor was named.
7. Tick again immediately → returns `{dispatched:[], skipped:[{reason:'already_dispatched'}]}`.

## Failure modes + recovery

### "An attendee got a match email but my name didn't appear"
Check: is your `appear_in_matches=true`? (Default yes; toggle in /me/profile.) If true, you should have been considered — possibly the top-3-by-overlap simply didn't include you (algorithm sorts by shared-tag count; with many attendees, only top 3 surface per recipient).

### "I want out of these emails"
`/me/profile` → "Appear in pre-event 'people you might want to meet' emails" → uncheck → Save. Takes effect on the NEXT tick (existing email already sent for this week's event stays in the recipient's inbox).

### "Tick failed midway through a long recipient list"
Currently each recipient dispatch is a separate `InteractionsService.dispatch` call. If the loop fails partway, the ledger row never gets written → next tick re-runs the whole event from scratch (resulting in duplicate emails for the recipients who already got one in the failed run). 

Mitigation today: keep recipient counts small (the eligible-attendee filter narrows naturally to opted-in members of a single event). Mitigation later: write per-recipient ledger rows, OR batch the dispatches in a transaction.

### "I want to re-run matching for an event"
Delete the `event_announcements (event=X, kind='member_match_t_minus_7')` row in Directus admin → next tick treats it as a fresh event.

### "No emails went out for an event"
Look at api logs for `event-matches tick — evaluated=N dispatched=N skipped=N`. If evaluated includes the event but it was skipped:
- `already_dispatched` → ledger row exists, see "re-run" above.
- `no_eligible_attendees` → < 2 opted-in attendees with any registrations. Common for new countries.

## Related

- `apps/api/src/modules/workspace/event-matches.service.ts` — algorithm + tick orchestration
- `apps/api/src/modules/workspace/event-matches.controller.ts` — POST entry
- `apps/api/test/event-matches-service.spec.ts` — 5 unit tests (dispatch happy path + filter opted-out + idempotency + zero-overlap fallback + window query)
- `apps/e2e/tests/smoke-event-matches.spec.ts` — 2 smoke tests (401 paths)
- `apps/web/src/components/MeProfileForm.tsx` — `appear_in_matches` checkbox toggle in the existing /me/profile form
- `infrastructure/directus/bootstrap.sh` — `directus_users.appear_in_matches` field + `event_announcements.kind` enum extension
- F-S1.4 (T-2 / T-3h reminders) uses the same `event_announcements` collection + same scheduler-wiring story
- F-S3.6b shipped `member_interests` (topic_tag + intent) — the data this algorithm reads
