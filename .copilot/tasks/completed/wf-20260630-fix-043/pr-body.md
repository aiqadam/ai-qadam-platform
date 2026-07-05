# PR body for wf-20260630-fix-043 / ISS-UAT-013-9

## What

Adds an early-return guard in `LeadsService.create()` that returns `{ status: 'already_verified' }` when the existing lead has `email_verified = true`, preventing both a duplicate verification email and silent de-verification.

## Why

During BP-UAT-013 Step 004 (re-submit idempotency check), Mailpit received 2 emails instead of 1 after the address was verified. The root cause was that `leads.service.ts` had no guard for the `email_verified = true` case — it fell through to `patchLead()` (which resets `email_verified = false`) and `dispatchVerifyEmail()` (which sends a duplicate).

## How

- `apps/api/src/modules/leads/leads.service.ts`: added a 4-line guard between the existing `already_member` block and the `patchLead / dispatchVerifyEmail` calls. Extended `CreateLeadResult.status` union with `'already_verified'`.
- `apps/api/test/leads-service.spec.ts`: added one regression test `'skips email and patch when lead is already verified'` that asserts status, userId, and that neither `dx.patch` nor `dispatcher.dispatch` were called.
- `apps/api/vitest.unit.config.ts`: adds a minimal config to run pure-unit tests without the Testcontainers globalSetup (workaround for Node.js v24 / vite-node v2.1.9 incompatibility in the dev environment).

## Risks

Low. The change is a pure restriction — does less work on re-submission of a verified email address. No API contract change (controller returns `{ accepted: true }` regardless). `email_verified: null` correctly falls through to the re-verification path (null is falsy).

## Testing

- `tsc --noEmit`: PASS
- Biome lint: PASS (0 issues, 2 files checked)
- Unit test: blocked locally (Node.js v24 vs. project .nvmrc v22.14.0 causes vite-node SSR incompatibility — pre-existing on `main`). CI runs Node 22 and will verify.

## Screenshots / Logs

N/A — logic change only.

## Checklist

- [x] Tests added / updated
- [x] Issue registry updated (ISS-UAT-013-9 → resolved)
- [x] No new runtime dependencies (vitest.unit.config.ts is a dev-only file)
- [x] TypeScript clean
