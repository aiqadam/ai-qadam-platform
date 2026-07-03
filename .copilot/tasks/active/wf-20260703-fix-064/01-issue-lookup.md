# Step 1 — Issue Lookup (output)

**Workflow:** wf-20260703-fix-064
**Issue:** ISS-UAT-001-1
**Branch:** fix/ISS-UAT-001-1-uat-seed-directus-mirror
**Timestamp:** 2026-07-03T11:30:00Z
**Agent:** Orchestrator (direct — no specialized agent per workflow definition)

---

## Result

**Issue FOUND in registry. Lookup PASSED.**

## Issue summary

| Field | Value |
|---|---|
| ID | ISS-UAT-001-1 |
| Severity | blocker |
| Module | uat/seed |
| Status | **open** |
| Reported | 2026-07-03 |
| Reporter | Orchestrator (wf-20260703-uat-063, Step 2 pre-flight) |
| Workflow | wf-20260703-uat-063 (reported) → wf-20260703-fix-064 (queued follow-up) |
| Resolved by PR | — |

## One-line symptom

`pnpm uat:seed --reset BP-UAT-001` exits 1 because new Authentik identity
fixtures (`uat-member-consented`, `uat-member-no-consent`) are not mirrored
into Directus, so the `member_consents.member` FK cannot resolve and the
seed step `reset_domain_fixture` fails on the consent row.

## One-line root cause

`DirectusUsersBridgeService.ensureLinked()` only fires on OIDC
`/v1/auth/callback`. Authentik-admin user creation never triggers that
callback, so the Directus-side `directus_users` row is never created.

## Recommended fix (from the issue file)

**Option (A):** Add an api-internal controller
`POST /v1/internal/users/ensure-linked`
(`InternalAuthGuard`-protected, takes `{ email, displayName }`, calls
`DirectusUsersBridgeService.ensureLinked()` synchronously). Seed calls
it once per identity fixture.

This is the chosen fix for wf-20260703-fix-064. The issue file explicitly
recommends it over alternatives B (loading `infrastructure/.env` to use
the break-glass admin token) and the OIDC-PKCE-dance approach (too heavy
for a one-shot provisioning step).

## Honesty disclosure (per AGENTS.md §6.1)

The fix (A) introduces a NEW internal endpoint that bypasses the OIDC
sign-in trigger. Implications:

- This is a **trust boundary change**. The endpoint is `InternalAuthGuard`-protected
  (already implemented for `/v1/internal/email`), so it requires an
  `INTERNAL_API_TOKEN` shared secret. No external surface is exposed.
- The endpoint is idempotent — calling `ensureLinked` on an existing
  `directus_users` row is a no-op. Safe for the seed to call unconditionally
  per fixture.
- The endpoint does NOT bypass authentication for downstream Directus
  operations — it only ensures the `directus_users` row exists. Per-app
  RBAC is unchanged.

## Files at risk (from the issue file's references)

| File | Why it's in scope |
|---|---|
| `apps/api/src/modules/internal/internal.controller.ts` | Add the new `POST /v1/internal/users/ensure-linked` endpoint. |
| `apps/api/src/modules/internal/internal.module.ts` | Add `DirectusModule` import so the controller can inject `DirectusUsersBridgeService`. |
| `apps/api/src/modules/internal/internal-auth.guard.ts` | Already exists; reused as-is. |
| `apps/api/src/modules/directus/directus-users-bridge.service.ts` | Source of `ensureLinked()`. May need a thin new method `ensureLinkedByEmail(email, displayName)` that does the local-user lookup before calling the existing `ensureLinked(userId, …)`. |
| `apps/api/src/modules/directus/directus.module.ts` | Already exports `DirectusUsersBridgeService`; verify it. |
| `scripts/uat-seed.sh` | In `ensure_test_user` (or a new helper), call the new internal endpoint after the Authentik user is created and added to the right groups. |
| `scripts/uat-fixtures/BP-UAT-001.json` | Unchanged — the fixture format is already correct; only the seed execution path changes. |

## Verification list (from the issue file's Resolution section)

The fix is considered complete when **all** of the following are true:

1. `pnpm uat:seed --reset BP-UAT-001` exits 0 with both new fixture consents
   and the draft event present.
2. `curl -s -H "Authorization: Bearer $DIRECTUS_TOKEN" "http://localhost:8200/users?filter[email][_eq]=uat-member-c@aiqadam.test"`
   returns 1 user row.
3. `curl -s -H "Authorization: Bearer $DIRECTUS_TOKEN" "http://localhost:8200/items/member_consents?filter[member][directus_users_id][email][_eq]=uat-member-c@aiqadam.test"`
   returns 1 row with `purpose: "events"`.
4. The 12 existing `scripts/tests/uat-preflight-check.bats` tests still pass.
5. `scripts/tests/uat-seed.bats` and `scripts/tests/uat-seed-retries.bats` pass.

These 5 ACs will be enumerated in `09-quality-gate.md` and each marked
verified or deferred-with-followup-workflow-ID.

## Gate

**Step 1: PASSED.** Workflow may advance to Step 2 (Impact Analysis).