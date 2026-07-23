# Step 3 — Code Summary

**Workflow:** wf-20260723-fix-127
**Issue:** ISS-USR-REG-002 (blocker, api/auth registration)
**Agent:** CodeDeveloper

---

## Requirement Implemented

Closed the code-level robustness gap identified by ImpactAnalyzer:
`RegistrationService.register()` (`apps/api/src/modules/auth/registration.service.ts`)
had three external call sites (Steps 2, 5, 8) with zero try/catch, and Step 3
only partially handled its failure. `AuthentikError` extends plain `Error`
(not `HttpException`), so any of these four uncaught/partially-caught throws
fell through to NestJS's default exception filter and rendered as a bare,
undiagnosable `500 Internal Server Error` — matching the reported bug
exactly.

This fix does **not** attempt to fix QA's suspected `AUTHENTIK_ADMIN_TOKEN`
misconfiguration (an infra/ops action outside this repo's git history, per
the impact analysis). Instead it makes the failure mode self-diagnosing and
consistent regardless of root cause:

1. **Step 2 (`getUserByEmail`)** — wrapped in try/catch. No Authentik user
   exists yet at this point, so on failure: log a structured
   `registration.duplicate_check_failed` event server-side and throw
   `BadRequestException('registration_failed')`. No orphan cleanup needed.

2. **Step 3 (`createUser`)** — extended the existing `.catch()` to convert
   **any** error (not just 4xx `AuthentikError`s as before) to the same
   generic `BadRequestException('registration_failed')`, logging a
   structured `registration.create_user_failed` event first. Previously 5xx
   and raw network/transport errors rethrew unhandled — same bug class as
   Steps 2/5/8.

3. **Step 5 (`resolveGroupNames` + `setUserGroups`)** — wrapped in
   try/catch. At this point the Authentik user AND password already exist
   (Steps 3/4 succeeded), so this is a partial-failure state analogous to
   Step 4's orphan case. Applied the identical mitigation: best-effort
   `authentik.disableUser(akUser.pk)` (itself wrapped, logged on failure),
   then a structured `registration.orphaned_account` log, then
   `BadRequestException('registration_failed')`.

4. **Step 8 (`createRecoveryLink`)** — wrapped in try/catch. By this point
   registration has already fully succeeded (user created, password set,
   group assigned, Directus linked, country written), matching this
   module's own documented policy that a failure at this stage must not
   fail an already-successful registration. On failure: log loudly
   (mirroring `dispatchWelcomeEmail`'s existing "no directusUserId, operator
   must mint manually via Authentik" precedent) and **do not throw** —
   `recoveryUrl` stays `null`, the welcome-email dispatch is skipped, and
   `fakeSuccessResult()` is returned normally, exactly as it always was for
   this path's terminal response shape.

No new abstractions were introduced; no method was restructured beyond
adding the try/catch blocks and the one `let`/conditional needed for Step
8's non-throwing branch. `auth.controller.ts` was not touched.

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/auth/registration.service.ts` | Modified | Wrapped Steps 2, 5, 8 in try/catch; extended Step 3's catch to cover non-4xx errors; removed now-unused `AuthentikError` import (no longer referenced in code, only in comments) |

---

## Key Design Decisions

- **Step 8 does not throw, Steps 2/3/5 do.** This asymmetry is intentional
  and directly specified by the task: by Step 8 the account is already
  fully live and correct in Authentik/Directus — throwing an HTTP error at
  that point would falsely tell an already-registered user their
  registration failed. Steps 2/3/5 all occur before or during
  provisioning, where failing closed with a generic error is the safe and
  correct response.
- **Reused the exact existing pattern (`BadRequestException('registration_failed')`
  + structured `this.logger.log`/`this.logger.warn`) rather than inventing
  a new error shape or an `isConfigured()` pre-flight guard.** The impact
  analysis explicitly flagged `isConfigured()` as optional future hardening,
  not required scope — adding it would have been a second behavior change
  (fail-fast at entry) beyond what was asked, so it was deliberately left
  out.
- **Step 5's mitigation duplicates Step 4's disable-orphan-then-log-then-throw
  shape verbatim** (down to the same log event name
  `registration.orphaned_account` and the same best-effort nested
  `.catch()` for `disableUser` itself) rather than extracting a shared
  helper. The method is already at a moderate size and the two blocks,
  while textually similar, sit at different points in a linear sequence
  with different surrounding context (Step 4 catches a single call, Step 5
  catches two calls) — the task explicitly said not to refactor the
  method's structure beyond what's needed, so the duplication was kept
  in place matching the file's existing precedent rather than introducing
  a new shared abstraction.
- **`existing` in Step 2 is typed via `Awaited<ReturnType<AuthentikClient['getUserByEmail']>>`**
  rather than importing `AuthentikUser` directly, since the try/catch
  needed a `let` declared before assignment and the return type includes
  `| null`; deriving it from the method signature keeps it in sync with
  `authentik.client.ts` without a second manual type reference.
- **Did not touch `auth.controller.ts`** — confirmed correct by the impact
  analysis and out of scope per the task instructions.

---

## Architecture Rule Compliance

- **Module boundaries:** No new module, no new cross-module call — same
  `AuthentikClient`/`DirectusUsersBridgeService`/`DirectusClient`/
  `InteractionsService` dependencies as before, called via their existing
  public methods only.
- **Tenant scoping:** N/A — no DB query added, no tenant-scoped table
  touched.
- **Zod at boundaries:** N/A — no new external input introduced; `input`
  is already validated at the controller per the existing convention.
- **No cross-schema queries:** N/A — no DB access added.
- **No `any`:** confirmed — no `any` introduced; the one new type
  annotation (`Awaited<ReturnType<AuthentikClient['getUserByEmail']>>`)
  is fully typed. All `catch` blocks type the caught value as `unknown`
  (implicit in TS strict mode) and narrow with `instanceof Error`,
  matching the file's existing convention throughout.
- **Auth at controller level:** unchanged — `register()` remains a public,
  rate-limited endpoint per `auth.controller.ts`, not touched by this fix.
- **Errors are typed / no bare `throw new Error(...)`:** all new throws are
  `BadRequestException('registration_failed')`, the same typed
  `HttpException` subclass already used by Steps 3/4.
- **Promises never unhandled:** all new `await`s are inside `try` blocks
  or chained `.catch()`s; the best-effort `disableUser` and
  `createRecoveryLink` failure paths are explicitly caught and logged, not
  swallowed silently (each has an explanatory comment per STANDARDS.md
  Part I §3).

---

## Formatter Check

- `pnpm biome check --apply apps/api/src/modules/auth/registration.service.ts`
  → `Checked 1 file in 5ms. No fixes applied.` — clean, no changes needed
  beyond what was already written in the correct style.
- `pnpm --filter api lint` (full package, `biome check .`) →
  `Checked 295 files in 99ms. No fixes applied.` — clean.

---

## Known Limitations

- **Does not fix QA's suspected `AUTHENTIK_ADMIN_TOKEN` misconfiguration.**
  As scoped, this is an infra/ops action outside this repo's git history.
  If hypothesis 1 from the impact analysis is correct, this fix changes
  the QA symptom from a bare `500 Internal Server Error` to a
  `400 { "message": "registration_failed" }` (Step 2 would now be the
  first thing to fail-closed cleanly) — a real improvement (diagnosable,
  correctly classified, no leaked detail) but registration itself would
  still not succeed on QA until the token is fixed on the host.
- **No new automated tests added in this step.** Per the task instructions,
  TestDesigner/TestStrategist add regression tests for the new Steps
  2/5/8 error-handling branches in a later workflow step. The existing 8
  `registration-service.spec.ts` tests were run and all pass unchanged —
  none of them needed modification since none previously exercised these
  three call sites' failure paths.
- **`isConfigured()` pre-flight guard was deliberately not added** — see
  Key Design Decisions. This remains available as optional future
  hardening if a subsequent workflow decides it's warranted.
- **QA live verification remains blocked** by the separate `deploy-qa` CI
  failure (permission-denied unlink on the host, tracked as AC-4 of
  `ISS-USR-REG-002`/GitHub issue #50) — this fix cannot be confirmed live
  on QA until that is resolved, consistent with what the impact analysis
  already flagged.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >-
    Implemented try/catch coverage for all three previously-unguarded
    external call sites in RegistrationService.register() (Steps 2, 5, 8)
    plus extended Step 3's existing partial catch to cover non-4xx errors,
    converting every failure mode to the same generic
    BadRequestException('registration_failed') already used by Step 4,
    with structured server-side logging (this.logger.log/.warn) matching
    the file's existing conventions exactly. Step 5 additionally applies
    Step 4's orphan-mitigation pattern (best-effort disableUser + log)
    since the Authentik user+password already exist by that point. Step 8
    is the sole exception per explicit task instruction: because
    registration has already fully succeeded by then, a recovery-link
    mint failure is logged loudly but does NOT throw — the endpoint still
    returns success, matching this module's own documented "must not fail
    an already-succeeded registration" policy. auth.controller.ts was not
    touched. Removed the now-unused AuthentikError import (no longer
    referenced outside comments) to keep lint clean. typecheck, lint,
    build, and biome check --apply all passed clean; all 8 pre-existing
    tests in apps/api/test/registration-service.spec.ts still pass
    unmodified.
  findings:
    - "Step 2 (getUserByEmail) previously had zero try/catch — now converts any thrown error to BadRequestException('registration_failed') with a structured registration.duplicate_check_failed log; no orphan cleanup needed since no Authentik user exists yet at this point."
    - "Step 3 (createUser) previously only converted 4xx AuthentikErrors and rethrew everything else (5xx, network errors) unhandled — now converts ANY error the same way, closing the last asymmetry in this method."
    - "Step 5 (resolveGroupNames + setUserGroups) previously had zero try/catch — now wrapped, applying the identical orphan-mitigation shape Step 4 already established (best-effort disableUser, structured registration.orphaned_account log, then throw), since the Authentik user + password already exist by this point."
    - "Step 8 (createRecoveryLink) previously had zero try/catch — now wrapped, but per explicit task instruction does NOT throw on failure (registration has already fully succeeded by this point); logs loudly instead, mirroring dispatchWelcomeEmail's existing no-directusUserId precedent, and still returns fakeSuccessResult()."
    - "Removed the AuthentikError import since it is no longer referenced anywhere in executable code after this change (only in comments) — kept lint/typecheck clean rather than leaving an unused import."
    - "No architectural deviations: no new module, no new cross-module call, no DB/schema touch, no shared-types change, auth.controller.ts untouched, no isConfigured() guard added (explicitly out of scope per task instructions)."
    - "Validation: pnpm --filter api typecheck (clean), pnpm --filter api lint (Checked 295 files, no fixes applied), pnpm --filter api build (nest build succeeded), pnpm biome check --apply on the changed file (Checked 1 file, no fixes applied), and the existing 8-test apps/api/test/registration-service.spec.ts suite (8 passed, 0 failed, unmodified)."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```
