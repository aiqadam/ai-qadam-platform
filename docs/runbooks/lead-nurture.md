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

## What's deliberately NOT in F-S1.6 (F-S1.6b follow-up)

- T+3 educational email (no event scheduled in their city)
- T+7 topic-personalized "here's an event you'd care about"
- Quarterly "we miss you" re-engagement to `state='churned'`
- Drip flows driven by Directus cron-flows

These need a Directus flow spec; see `infrastructure/directus/flows-bootstrap.sh`.

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
