# 05 — Test Strategy

**Workflow:** wf-20260629-fix-034
**Requirement:** ISS-UAT-013-7
**Date:** 2026-06-29

## Unit Tests (10 cases — CodeDeveloper-authored)

### `apps/api/test/email-service-smtp.spec.ts` — 7 cases

| Case | Description |
|---|---|
| getProvider() → 'smtp' | SMTP_HOST set, RESEND_API_KEY absent |
| getProvider() → 'resend' | Only RESEND_API_KEY set |
| getProvider() → 'none' | Neither set |
| SMTP path | SEND_EMAILS=true + SMTP_HOST → sendMail called with correct {from,to,subject,text,html} |
| SMTP path no Resend | SMTP active → Resend SDK NOT called |
| Resend path | SEND_EMAILS=true + RESEND_API_KEY only → Resend.emails.send called |
| SEND_EMAILS=false | Returns early, no transport called regardless of config |

### `apps/api/test/health-email.spec.ts` — 3 cases

| Case | Expected |
|---|---|
| getProvider() returns 'smtp' | { configured: true, provider: 'smtp' } |
| getProvider() returns 'resend' | { configured: true, provider: 'resend' } |
| getProvider() returns 'none' | { configured: false, provider: 'none' } |

## Vitest Blocker

Pre-existing vite-node 2.1.9 SSR bug blocks all api unit tests locally. Tests validated via:
- `pnpm --filter @aiqadam/api typecheck` — confirms test files type-correct
- `pnpm exec biome check` — confirms test files lint-clean
- Live smoke tests (see below) — cover runtime gap

## Live Smoke Plan

**Preconditions:** SMTP_HOST=localhost, SMTP_PORT=1025, SEND_EMAILS=true in apps/api/.env; docker compose up -d (Mailpit on :1025/:8025); API on :3001.

- **S-1** — `GET /health/email` → `{configured: true, provider: "smtp"}` (HTTP 200)
- **S-2** — `POST /v1/leads` → HTTP 202 + Mailpit receives message within 30s
- **S-3** — API log has no `[email skipped: RESEND_API_KEY not set]` on happy path

## AC Mapping

| AC | Coverage |
|---|---|
| AC-1: Step 002 finds ≥1 Mailpit message within 60s | Live smoke S-2 + BP-UAT-013 attempt 3 |
| AC-2: No RESEND_API_KEY skip warning on happy path | Live smoke S-3 |
| AC-3: GET /health/email exists and returns correct provider | Unit tests (3 cases) + live smoke S-1 |

```yaml
gate_result:
  status: passed
  summary: "10 unit cases type-correct and lint-clean. Live smoke plan covers runtime gap. BP-UAT-013 re-run is the acceptance gate for AC-1/AC-2."
```
