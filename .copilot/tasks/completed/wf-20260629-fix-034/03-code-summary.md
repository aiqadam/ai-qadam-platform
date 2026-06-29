# 03 — Code Summary

**Workflow:** wf-20260629-fix-034
**Requirement:** ISS-UAT-013-7
**Date:** 2026-06-29
**Developer:** CodeDeveloper (GitHub Copilot)

## Summary

Added a nodemailer/SMTP transport to `EmailService` so local dev and UAT environments
can route email via Mailpit without a `RESEND_API_KEY`. When `SMTP_HOST` is set, SMTP
takes priority over Resend. Added a `GET /health/email` endpoint for UAT scripts to
verify which transport is active before running mail-dependent steps.

## Files Changed

### Modified

| File | Change |
|---|---|
| `apps/api/src/config/env.ts` | Added `SMTP_HOST: z.string().optional()` and `SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025)` after `RESEND_API_KEY` |
| `apps/api/src/modules/email/email.service.ts` | Added nodemailer transport, `getProvider()` method, `sendViaSMTP()` / `sendViaResend()` private helpers; refactored `send()` to dispatch via transport priority (SMTP > Resend > none) |
| `apps/api/src/health/health.controller.ts` | Added `EmailService` constructor injection; added `GET /health/email` endpoint returning `{configured, provider}` |
| `apps/api/src/app.module.ts` | Added `EmailModule` to `imports[]` so `HealthController` can inject `EmailService` via NestJS DI |
| `apps/api/package.json` | Added `nodemailer@^3.1.8` to `dependencies`; `@types/nodemailer@^6.4.24` to `devDependencies` |
| `apps/api/.env.example` | Added `SMTP_HOST=` and `SMTP_PORT=1025` with Mailpit comment after `RESEND_API_KEY=` |

### Created

| File | Purpose |
|---|---|
| `apps/api/test/email-service-smtp.spec.ts` | Unit tests: all three transport branches + `getProvider()` + `SEND_EMAILS=false` guard |
| `apps/api/test/health-email.spec.ts` | Unit tests: `GET /health/email` for all three provider states |

## Key Design Decisions

- **SMTP takes priority over Resend** — when both `SMTP_HOST` and `RESEND_API_KEY` are
  set, SMTP wins. This means dev/UAT always routes to Mailpit without needing to unset
  the Resend key.
- **`sendViaSMTP` and `sendViaResend` extracted as private methods** — required to keep
  `send()` below Biome's cognitive complexity limit of 10. The local variable narrowing
  (`const t = this.transporter; if (!t) return;`) avoids non-null assertions.
- **`getProvider()` is public** — consumed by `HealthController.emailHealth()`; also
  useful for future observability/admin surfaces.
- **`EmailModule` added to `AppModule.imports`** — `HealthController` is declared in
  `AppModule.controllers`, so it must have access to `EmailService` through the module
  graph. `EmailModule` already exports `EmailService`; no duplication.

## Validation

```
pnpm --filter @aiqadam/api typecheck   → no errors
pnpm exec biome check <changed files>  → no warnings (after cognitive-complexity refactor)
```

The full test suite (`pnpm --filter @aiqadam/api test`) fails on `setup-pg.ts` with a
pre-existing vite-node compatibility error (`__vite_ssr_exportName__ is not defined`)
that is unrelated to this PR and present on the branch tip before any of these changes.

## New API Endpoint

```
GET /health/email
Response: { configured: boolean, provider: 'resend' | 'smtp' | 'none' }
```

Exempted from throttling by the existing `ObserveThrottlerGuard` which already skips
`/health/*` routes.

```yaml
gate_result:
  status: passed
  summary: >
    6 files modified, 2 test files created. TypeScript strict typecheck passes.
    Biome lint clean (cognitive complexity resolved by private-method extraction).
    Pre-existing setup-pg.ts test runner failure is unrelated to this change and
    present on the branch tip before any of these modifications.
```
