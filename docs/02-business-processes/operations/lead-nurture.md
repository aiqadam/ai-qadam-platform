# Lead nurture (F-S1.6)

Anonymous visitors enter the funnel via the lead form on `/` and `/events`.
This runbook documents what happens to them, how operators see them, and
what's deliberately deferred to a later sprint.

## Funnel

```
Visitor → /                                    ← form embedded mid-page
         POST /api/v1/leads                    ← email + optional city + topics
       → directus_users row (state='lead', email_verified=false)
         Dispatches lead_welcome_verify        ← T+0, via InteractionsService
       → email arrives with /api/v1/leads/verify?token=… link
       → click → /leads/verified                ← email_verified=true
       ──────────────────────────────────────────────────────────────────
       Later, same email signs in via Authentik:
       → /v1/auth/callback → upsertByAuthentikSubject → ensureLinked
       → LeadsService.convertLeadToMember(userId, email)
       → state='member', email_verified=true
       → Dispatches lead_converted_to_member
```

## What an operator sees

Cohorts built in `/workspace/members` (F-S3.2) can already target leads:
- `state == 'lead'` → unconverted leads
- `state == 'member'` → confirmed members (includes ex-leads + Authentik signups)
- `email_verified == true` → safe to email under operational_contract basis
- `interest_topics CONTAINS 'AI/ML'` → topic-targeted campaigns
- `city == 'Tashkent'` → city-targeted

The Announce composer (F-S3.3) sends to any cohort. So the moment a lead
verifies, an operator can include them in announcement targeting.

## F-S1.6b — nurture cron (shipped 2026-05-22)

Two automated emails to verified leads still in `state='lead'`:

| Tick | Intent | Trigger |
|---|---|---|
| **T+3** | `lead_nurture_value` | `email_verified_at <= now-3d` AND no prior ledger row |
| **T+7** | `lead_nurture_next_event` | `email_verified_at <= now-7d` AND no prior ledger row AND there exists a published event with `starts_at > now` |

**Endpoint:** `POST /v1/internal/lead-nurture/tick` — `InternalAuthGuard`
(`x-internal-auth` header). Called by an external scheduler hourly.

**Idempotency ledger:** `lead_nurture_dispatches` (one row per `(lead, kind)`).
Service queries the ledger first, then `_nin`s those lead IDs out of the
candidate query. Conversion (`state='lead' → 'member'`) drops the lead
out of the candidate filter at the SQL level — no cleanup needed.

**T+7 no-event behavior:** if no upcoming event exists when a T+7 candidate
is found, the cron skips the dispatch WITHOUT recording a ledger row.
The next tick re-evaluates. Trade-off: a lead who verified during a
dry period gets the teaser late (when an event is scheduled), not never.

### Scheduler wiring

Same options as F-S1.4 reminders / F-S1.5 matches:

```bash
# Coolify scheduled task (recommended — already running for other crons)
curl -fsS -X POST \
  -H "x-internal-auth: ${INTERNAL_API_TOKEN}" \
  https://api.aiqadam.org/v1/internal/lead-nurture/tick
```

Cadence: hourly. Lower frequency works (the open-ended window self-heals);
higher frequency wastes API cycles.

### Operational verification

```sql
-- recent dispatches
SELECT lead, kind, sent_at, event_referenced
FROM lead_nurture_dispatches
ORDER BY sent_at DESC LIMIT 50;

-- leads pending T+3 (would dispatch on next tick)
SELECT id, email, email_verified_at FROM directus_users
WHERE state='lead' AND email_verified=true
  AND email_verified_at <= NOW() - INTERVAL '3 days'
  AND id NOT IN (SELECT lead FROM lead_nurture_dispatches WHERE kind='lead_nurture_value');
```

### Still NOT in F-S1.6b (future iterations)

- **Topic-personalised T+7** — current T+7 teases the same upcoming event to everyone; doesn't filter by `interest_topics` overlap.
- **City scoping** — T+7 picks the globally next event regardless of lead's `city`; a Tashkent lead may get teased an Almaty event.
- **Quarterly re-engagement to `state='churned'`** — separate cron, separate ledger; needs `state='churned'` to actually be populated by an inactivity job.
- **Directus cron-flows migration** — current implementation is NestJS; the Phase ζ direction is to move crons into Directus's own flow runner.

## Failure modes + recovery

### "User clicked verify link but nothing happened"
- Most common: link expired (30-day TTL). Direct them to re-submit on `/`.
- Less common: API was down during their click. Verify token is HMAC-signed
  and idempotent — re-clicking later works as long as TTL is fresh.

### "I see duplicate lead rows for the same email"
Shouldn't happen — `LeadsService.create()` looks up by lowercased email
before insert. If you see it, check:
```sql
SELECT id, email, state, email_verified, date_created
FROM directus_users WHERE LOWER(email)='<duplicate>@...'
ORDER BY date_created;
```
Then either:
- Merge manually (move registrations + points to the earlier row) OR
- Delete the later row if it has no activity.

### "Lead form silently does nothing"
Could be the honeypot triggering — if a browser autofill puts a value into
the `name="company"` hidden field, the API silently 202s and drops the row.
Check browser network tab for the request body; if `honeypot` is non-empty,
disable autofill on that field.

### "Email isn't arriving"
1. Check `/workspace/operations/observability` (when shipped) for recent
   `lead_welcome_verify` dispatch errors.
2. Verify `RESEND_KEY` is current at `/tmp/aiqadam-secrets-RESEND_KEY`.
3. Look at the api container logs for `[InteractionsService]` dispatch lines.

## Rotation + secrets

The verify-token HMAC uses `JWT_SECRET` (shared with access tokens). Rotating
JWT_SECRET invalidates outstanding verify links — accept this; users can
re-submit to get a fresh one. Don't rotate without coordinating; impacts
auth too.

## Related

- `apps/api/src/modules/leads/` — service + controller + token mint
- `apps/api/test/leads-service.spec.ts` — 10 unit tests
- `apps/web/src/components/LeadCaptureForm.tsx` — public form
- `infrastructure/directus/bootstrap.sh` §F-S1.6 — directus_users fields
- ADR-0033 — community-graph: leads are part of the same member graph as
  active members; not a separate CRM.
