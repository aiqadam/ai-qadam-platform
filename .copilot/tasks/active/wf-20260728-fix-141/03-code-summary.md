# Step 4: Code Summary — wf-20260728-fix-141

## Files changed

- `apps/api/src/modules/me-profile/me-profile.service.ts` — injected
  `DirectusUsersBridgeService`; added private `resolveDirectusId(userId,
  email)`; every public method now takes `email` and resolves the
  Directus id before touching Directus.
- `apps/api/src/modules/me-profile/me-profile.controller.ts` — every
  handler extracts `{ sub, email }` via a renamed `requireUser()` helper
  (was `requireUserId()`) and passes `email` through to the service.
- `apps/api/src/modules/members/onboarding.controller.ts` — same
  `requireUser()` pattern; passes `email` to `completeOnboarding`.
- `apps/api/src/modules/members/onboarding.service.ts` —
  `completeOnboarding(userId, email, dto)` and its private
  `doPatchProfile` now thread `email` to every `MeProfileService` call.
- `apps/api/src/modules/referrals/referrals.controller.ts` — `myStats`
  wraps its return in `{ stats: ... }`.

## Tests updated

- `apps/api/test/me-profile-service.spec.ts` — added a new "Directus id
  resolution" describe block (4 tests, distinct platform/Directus id
  fixtures); updated all 23 existing call sites for the new `email`
  parameter and constructor's second arg (`FakeBridge`).
- `apps/api/test/members-onboarding.service.spec.ts` — added `EMAIL`
  constant; updated all `completeOnboarding`/assertion call sites.
- `apps/api/test/members-onboarding.integration.spec.ts` — `reqWithUser`
  now includes email; updated controller + direct-`MeProfileService`
  instantiation tests (added `fakeBridge`); fixed argument-position shifts
  in destructured mock-call assertions.

## Verification performed

- `pnpm exec tsc --noEmit` (apps/api): clean.
- `pnpm exec biome check` on all changed files: clean.
- Targeted suite (`me-profile-service`, `members-onboarding.service`,
  `members-onboarding.integration`, `referrals-service`): 77/77 passing.
- Full `apps/api` suite (`pnpm test`, Testcontainers): 1293/1294 passing;
  1 pre-existing unrelated flake (`users.spec.ts:65`, already tracked by
  `wf-20260704-fix-096-pre-existing-api-test-flakes`), confirmed absent
  from this diff via `git diff --stat main -- test/users.spec.ts
  src/modules/users/`.
- Fail-before/pass-after verified live via `git stash` isolating
  `me-profile.service.ts`: 15/27 tests fail without the fix, 27/27 pass
  with it.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "5 source files + 3 test files changed. tsc + biome clean. 77/77 targeted tests, 1293/1294 full suite (1 pre-existing unrelated flake). Fail-before/pass-after verified."
```
