# 02 — Impact Analysis

**Workflow:** wf-20260629-fix-034
**Requirement:** ISS-UAT-013-7
**Date:** 2026-06-29

## Files to Change

| File | Type | Reason |
|---|---|---|
| `apps/api/src/modules/email/email.service.ts` | MODIFY | Add nodemailer SMTP transport path; add `getProvider()` method returning `'resend'|'smtp'|'none'` |
| `apps/api/src/config/env.ts` | MODIFY | Add `SMTP_HOST` (optional string) and `SMTP_PORT` (optional coerced number, default 1025) |
| `apps/api/src/health/health.controller.ts` | MODIFY | Add `GET /health/email` endpoint; inject `EmailService` |
| `apps/api/src/app.module.ts` | MODIFY | Import `EmailModule` so `HealthController` can inject `EmailService` via DI |
| `apps/api/package.json` | MODIFY | Add `nodemailer` runtime dep; `@types/nodemailer` dev dep |
| `apps/api/.env.example` | MODIFY | Document `SMTP_HOST=` and `SMTP_PORT=1025` with Mailpit comment |
| `apps/api/test/email-service-smtp.spec.ts` | CREATE | Unit tests for all three transport branches + `getProvider()` |
| `apps/api/test/health-email.spec.ts` | CREATE | Unit tests for `GET /health/email` across all three provider states |

**Code-file count (non-test, non-config):** 4 (email.service.ts, health.controller.ts, app.module.ts, env.ts) — within AGENTS.md §4 5-file limit (tests and configs are excepted per §4).

## DB Changes

None.

## New Dependency

- `nodemailer` — MIT, ~13M weekly downloads, actively maintained, no CVEs.
- `@types/nodemailer` — DefinitelyTyped, dev dep.

## Key findings

- `EmailModule` is NOT currently imported in `AppModule`. The `HealthController` (declared in `AppModule.controllers`) must have `EmailModule` added to `AppModule.imports` to receive `EmailService` via DI.
- `EmailModule` exports `EmailService` — once imported in `AppModule`, no provider duplication occurs (NestJS singleton).
- `ObserveThrottlerGuard` already exempts `/health/*` — no throttler changes needed.
- No DB migration, no shared-types, no frontend/bot/worker changes.

## API Surface

| Endpoint | Method | Change |
|---|---|---|
| `/health/email` | GET | New — `{configured: boolean, provider: 'resend'|'smtp'|'none'}` |

```yaml
gate_result:
  status: passed
  summary: "4 code files, 2 config/doc files, 2 new test files; no DB migration."
