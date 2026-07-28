# Step 2: Impact Analysis — wf-20260728-fix-141

## Affected surface

- `apps/api/src/modules/me-profile/me-profile.service.ts` — every public
  method (constructor + 15 methods) needs the `DirectusUsersBridgeService`
  id-resolution step.
- `apps/api/src/modules/me-profile/me-profile.controller.ts` — every
  handler must extract `email` from `req.user` and pass it through.
- `apps/api/src/modules/members/onboarding.controller.ts` +
  `onboarding.service.ts` — the only other caller of `MeProfileService`
  methods; needs the same `email` threading.
- `apps/api/src/modules/referrals/referrals.controller.ts` — one-line
  shape fix on `myStats` (Bug B), independent of Bug A.
- No module wiring change: `MeProfileModule` already imports
  `DirectusModule`, which already exports `DirectusUsersBridgeService`.
  NestJS DI auto-wires the new constructor parameter.
- No DB migration needed — no schema change, only a call-site + injection
  fix.
- No frontend change needed — `apps/web-next` components already handle
  the error state correctly; the bug is entirely server-side. The
  `mine/stats` shape fix makes the backend match the frontend's existing
  (correct) expectation, not the other way around.

## Blast radius

- `MeProfileService` is used by exactly two callers:
  `MeProfileController` (the `/v1/me/profile` cabinet) and
  `MembersOnboardingService` (`POST /v1/members/onboard`). Both are
  updated in this change.
- `ReferralsController.myStats` has exactly one frontend consumer
  (`useMyReferralStats()`); no other backend or e2e test currently
  asserts its unwrapped shape (confirmed: `smoke-referrals.spec.ts` does
  not test `mine/stats` at all).
- No auth/token/JWT changes — `req.user.email` already exists on every
  authenticated request; this fix only starts using a field that was
  already there.

## Risk assessment

- **Low risk.** This is a call-site correction following an existing,
  proven pattern (`ReferralsService`) already in production use in the
  same codebase. No new dependencies, no schema changes, no new
  endpoints.
- **Test coverage risk (mitigated):** the existing unit test suite used
  same-namespace opaque IDs (`'u-1'` for both platform and Directus ids),
  which is why this bug shipped undetected. New tests use deliberately
  distinct fixture IDs to close this blind spot going forward.
- **No DB migration** required.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Single-service fix (MeProfileService + 2 controllers) plus one independent one-line shape fix in ReferralsController. No schema change, no new deps, no module wiring change needed."
```
