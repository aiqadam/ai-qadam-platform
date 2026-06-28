# ISS-UAT-013-7 — `RESEND_API_KEY` unset in `apps/api/.env`; verify-email is skipped, Mailpit receives nothing

| Field | Value |
|---|---|
| ID | ISS-UAT-013-7 |
| Severity | bug (env-gap, blocks mailpit-dependent UAT steps) |
| Module | uat / environment |
| Status | open |
| Reported | 2026-06-28 |
| Reporter | BusinessAnalyst (wf-20260628-uat-030 / 04-uat-triage.md, attempt 2) |
| Workflow | wf-20260628-uat-030 |

## Symptom

During the BP-UAT-013 attempt-2 run on 2026-06-28, the API accepted lead
submissions with HTTP 202, but Mailpit at `http://localhost:8025` never received
the verify-email message. The runner's `mailpitSearch(to=uat-lead-new@example.com)`
returned 0 messages for 60 s and Step 002 timed out. Step 003 then failed
immediately because it cannot read a token from a message that was never sent.

The API logs show the smoking gun:

```
[Nest] 42544 - 28.06.2026, 11:56:51  WARN [EmailService]
  [email skipped: RESEND_API_KEY not set]
  to=probe@example.com subject=Confirm your AI Qadam updates for Almaty
[Nest] 42544 - 28.06.2026, 11:57:20  WARN [EmailService]
  [email skipped: RESEND_API_KEY not set]
  to=uat-lead-new@example.com subject=Confirm your AI Qadam updates for Almaty
[Nest] 42544 - 28.06.2026, 11:57:23  WARN [EmailService]
  [email skipped: RESEND_API_KEY not set]
  to=uat-lead-new@example.com subject=Confirm your AI Qadam updates for Almaty
… (8 more identical lines spanning 11:59–12:16, all to uat-lead-new@example.com)
```

`apps/api/.env` line 39 has `RESEND_API_KEY=` (empty). The API's `EmailService`
constructor (`apps/api/src/modules/email/email.service.ts:29`) reads
`env.RESEND_API_KEY` and only constructs a `Resend` client when it is truthy:

```ts
this.resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
```

When `resend` is null, the service logs `[email skipped: RESEND_API_KEY not set]`
and returns without sending (`apps/api/src/modules/email/email.service.ts:39–42`).
The HTTP 202 that the controller returns is therefore **misleading** — the lead
is persisted, but the verify email will never arrive. Production behaviour would
be the same: a missing key means silent drop, not loud failure.

## Root cause

`apps/api/.env` is committed-by-convention missing the `RESEND_API_KEY` value.
The empty key is intentional for local dev when developers do not want to send
real emails, but the API does not signal "email will be skipped" to the caller
in any way the UAT script can detect — it only logs a `WARN` line server-side.
The lead capture form therefore returns 202 success to the browser, the user
sees the "Check your inbox" panel, and no email is ever dispatched.

This is an **environment/configuration gap**, not a product bug: the API and
email service are behaving exactly as written. It surfaces in UAT because Steps
002 and 003 require a real email round-trip via Mailpit.

## Repro

```bash
# 1. Confirm apps/api/.env line 39
grep '^RESEND_API_KEY=' apps/api/.env
# → RESEND_API_KEY=    (empty)

# 2. Submit a lead
curl -i -X POST http://localhost:3001/v1/leads \
  -H "Content-Type: application/json" \
  -d '{"email":"uat-lead-new@example.com","country":"KZ"}'
# → HTTP/1.1 202 Accepted

# 3. Watch the API log
tail -1 apps/api/api-dev.log
# → [Nest] … WARN [EmailService] [email skipped: RESEND_API_KEY not set]
#   to=uat-lead-new@example.com subject=Confirm your AI Qadam updates for Almaty

# 4. Confirm Mailpit is empty
curl -s "http://localhost:8025/api/v1/search?query=to:uat-lead-new@example.com" | jq '.total'
# → 0
```

## Proposed resolution

Two complementary fixes:

### A. UAT environment (immediate, blocks BP-UAT-013 sign-off)

Set `RESEND_API_KEY` to a throwaway dev key in `apps/api/.env`. Because the
Resend SDK requires a real key to accept the request, two options exist:

1. **Provision a Resend test-mode key** (free, no real send). Drop it into
   `apps/api/.env` line 39: `RESEND_API_KEY=re_test_…`. Restart the API. This
   is the cleanest path because Mailpit will still receive the message via the
   `MAILPIT_*` env config in the dev docker-compose — **however**, Resend
   sends to its own inbox, not Mailpit, so this option does NOT actually fix
   the UAT round-trip.
2. **Recommended for UAT:** make `EmailService` honour a `SEND_EMAILS=false`
   + `MAILPIT_SMTP_HOST` config so dev/test can route email to Mailpit instead
   of Resend. The `SEND_EMAILS` knob already exists (see
   `apps/api/src/modules/email/email.service.ts:35`); it just doesn't yet route
   to Mailpit. Adding an SMTP transport (nodemailer + Mailpit) for the UAT/dev
   profile is the cleanest fix and means `RESEND_API_KEY` can stay unset for UAT.

Per AGENTS.md §6, `.env` files should not be modified without explicit user
approval. The Orchestrator is therefore **not** patching `apps/api/.env` in
this workflow; it is **registering this issue** and asking the user to choose.

### B. Code-side defence (defer to next API workflow)

The current 202-on-skip behaviour is the underlying UX defect. Two improvements:

1. Return a structured response from `POST /v1/leads` that distinguishes
   `accepted_and_dispatched` from `accepted_skipped_no_email_config`. The form
   then renders "Thanks — your account is being set up, no email is required"
   in the second case instead of the misleading "Check your inbox."
2. Add an `/api/v1/health/email` endpoint that returns
   `{ configured: boolean, provider: "resend" | "smtp" | "none" }` so UAT
   pre-flight (per ISS-UAT-013-2) can fail fast with an actionable message
   instead of timing out 60 s in mailpit polling.

Until (B) lands, UAT scripts that need Mailpit round-trips must call this
health endpoint in their pre-flight or accept a `partial` outcome on
mailpit-dependent steps.

## Acceptance criteria

1. After applying either (A.1) or (A.2), a re-run of BP-UAT-013 has Step 002
   polling Mailpit for the expected recipient and finding ≥1 message within
   the 60 s budget.
2. The API log no longer contains `[email skipped: RESEND_API_KEY not set]`
   for the happy path (it may still appear if `SEND_EMAILS=false` is intentional).
3. The new `/api/v1/health/email` endpoint exists and is wired into the UAT
   pre-flight (closes the gap exposed by ISS-UAT-013-2).

## References

- `apps/api/src/modules/email/email.service.ts:29,39–42` — `RESEND_API_KEY` check
- `apps/api/.env:39` — empty `RESEND_API_KEY=` value
- `apps/api/api-dev.log` (lines 309, 340–358) — runtime evidence
- `.copilot/tasks/active/wf-20260628-uat-030/03-uat-runner-report.md` §5.2.1
- `.copilot/tasks/active/wf-20260628-uat-030/02-preflight.md` — no mention of RESEND env
- ISS-UAT-013-1 — root-cause-class sibling (api not running); this is api running but email disabled
- ISS-UAT-013-2 — pre-flight process gap; this env gap would have been caught by the proposed `/api/v1/health/email` check
