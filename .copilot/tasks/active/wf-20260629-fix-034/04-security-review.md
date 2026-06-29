# 04 — Security Review

**Workflow:** wf-20260629-fix-034
**Requirement:** ISS-UAT-013-7
**Date:** 2026-06-29

## Invariant Check Results

| Invariant | Result | Notes |
|---|---|---|
| Tenant isolation | N/A | No DB queries in changed files |
| Secrets by reference | PASS | SMTP_HOST/PORT/RESEND_API_KEY never emitted in logs or responses |
| Auth at controller level | PASS | /health/email is intentionally unauthenticated — consistent with /health; ObserveThrottlerGuard.shouldSkip() exempts /health/* |
| Validation at boundaries | PASS | SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025); /health/email takes no input |
| Rate limiting | PASS | ObserveThrottlerGuard exempts all /health/* paths — O(1) liveness probe, no I/O |
| CSRF | N/A | GET /health/email is read-only, no state mutation |
| No magic strings in logs | PASS | Named const LOG_* for all log prefixes in email.service.ts |
| No N+1 / Drizzle parameterization | N/A | No DB queries |

## MAJOR Finding (resolved before gate)

**MAJOR-1 — nodemailer@^3.1.8 was deprecated (all versions below 4.0.1 are deprecated per npm registry); @types/nodemailer@^6.4.24 described the v6 API, creating a type/runtime mismatch.**

**Fix applied:** bumped `apps/api/package.json` to `"nodemailer": "^6.9.16"`; pnpm install resolved to `nodemailer@6.10.1`. Lockfile updated. Typecheck passes clean after the fix.

## BLOCKER Findings

None.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "All invariants pass. MAJOR-1 (deprecated nodemailer version) fixed before gate: runtime bumped to 6.10.1, lockfile updated, typecheck passes. /health/email is unauthenticated and exposes only a provider enum string — acceptable per existing /health pattern."
```
