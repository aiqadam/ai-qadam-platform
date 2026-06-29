## What

Adds an SMTP/Mailpit email transport to `EmailService` so UAT environments can receive email via Mailpit without a `RESEND_API_KEY`. Also adds `GET /health/email` endpoint for UAT pre-flight to assert email is configured before tests begin. Closes ISS-UAT-013-7.

## Why

ISS-UAT-013-7: `RESEND_API_KEY` was empty in `apps/api/.env`. `EmailService` silently skipped all email dispatch (WARN log only). Mailpit received nothing. BP-UAT-013 Steps 002–003 timed out waiting for the verify-email message for 60 s and then failed. This is the primary blocker for completing the BP-UAT-013 sign-off.

## How

- `apps/api/src/modules/email/email.service.ts` — SMTP transport via nodemailer. Priority: **SMTP > Resend > none**. When `SMTP_HOST` is set, emails route to nodemailer (→ Mailpit). Resend path unchanged. `getProvider()` returns `'smtp'|'resend'|'none'` for the health endpoint.
- `apps/api/src/config/env.ts` — `SMTP_HOST: z.string().optional()` and `SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025)` added after `RESEND_API_KEY`.
- `apps/api/src/health/health.controller.ts` — `GET /health/email` → `{ configured: boolean, provider: 'resend'|'smtp'|'none' }`. Unauthenticated, consistent with `GET /health`. `ObserveThrottlerGuard` already exempts `/health/*`.
- `apps/api/src/app.module.ts` — `EmailModule` added to `imports[]` so `HealthController` can inject `EmailService`.
- `apps/api/package.json` — `nodemailer@^6.9.16` runtime dep; `@types/nodemailer@^6.4.24` dev dep. lockfile resolves to `nodemailer@6.10.1`.
- `apps/api/.env.example` — documents `SMTP_HOST=` and `SMTP_PORT=1025` with Mailpit comment.
- 2 new test files: `email-service-smtp.spec.ts` (10 cases), `health-email.spec.ts` (3 cases).
- **Atomic status flip** (FEAT-WORKFLOW-003 Step 9): ISS-UAT-013-7.md and registry.md flipped `open → resolved` in this commit.

## Risks

- **nodemailer is a new dep** — MIT, 13M+ weekly downloads, no CVEs, actively maintained on 6.x. Justified: there is no existing SMTP capability in `apps/api`.
- **nodemailer@^3.1.8 was deprecated** — SecurityReviewer found MAJOR-1: original pin was deprecated (all <4.0.1 are deprecated per npm registry). Bumped to `^6.9.16` before commit; lockfile at 6.10.1. AGENTS.md §8 check: ✓ last update <6 months, ✓ >10k weekly downloads, ✓ MIT, ✓ no CVEs.
- **Unauthenticated /health/email** — consistent with the existing pattern (`GET /health` is also unauthenticated). Response exposes only a provider enum string, no credentials, no PII.
- **SMTP_HOST/PORT come from env, not user input** — no injection risk.
- **AGENTS.md §4 cap lifted** for this branch per user direction (2026-06-29).

## Testing

- `pnpm --filter @aiqadam/api typecheck` — PASS
- `pnpm exec biome check` on all 6 changed/new source files — PASS
- `pnpm arch:check` — PASS (247 files)
- vitest unit tests: blocked by pre-existing vite-node 2.1.9 SSR bug (`__vite_ssr_exportName__ is not defined`), confirmed on clean main HEAD. Test files are typecheck-clean and reviewed. See 07-test-results.md.
- Live smoke tests S-1/S-2/S-3 documented in `.copilot/tasks/active/wf-20260629-fix-034/05-test-strategy.md` — run these before BP-UAT-013 attempt 3.

## Checklist

- [x] Tests added (10 cases: email-service-smtp.spec.ts + health-email.spec.ts)
- [x] .env.example updated
- [x] No unnecessary new dependencies (only nodemailer, needed for SMTP)
- [x] Manually validated typecheck + biome + arch:check
- [x] Atomic status flip per FEAT-WORKFLOW-003 Step 9
