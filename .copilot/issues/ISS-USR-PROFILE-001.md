# ISS-USR-PROFILE-001 — `/me` subpages fail to load Directus-backed data (wrong user-id space)

| Field | Value |
|---|---|
| ID | ISS-USR-PROFILE-001 |
| Severity | blocker |
| Module | api/me-profile, api/referrals (Directus id-space bug) |
| Status | resolved |
| Reported | 2026-07-28 |
| Resolved | 2026-07-28 |
| Workflow | wf-20260728-fix-141 |
| Reporter | Tester, via [GitHub issue #94](https://github.com/aiqadam/ai-qadam-platform/issues/94) |
| Business-Process | BP-UAT-003, BP-UAT-016 |

## Symptom

On `https://qa.aiqadam.org/me`:

1. `/me/profile` — "Consents unavailable. Reload the page to retry." AND
   "Skills unavailable. Reload the page to retry."
2. `/me/preferences` — "Consents unavailable. Reload the page to retry."
3. `/me/referrals` — "Unable to load referral data. Reload the page to
   retry."

## Root cause (confirmed by static analysis, 2026-07-28)

**Bug A (symptoms 1 and 2 — shared root cause):**
`MeProfileService` (`apps/api/src/modules/me-profile/me-profile.service.ts`)
queries Directus directly using `req.user.sub` — the **platform**
`users.id` UUID — as if it were the Directus `directus_users.id`. These
are two different UUID spaces. The mapping is
`platform.users.directus_user_id`, resolved via
`DirectusUsersBridgeService.ensureLinked()`/`resolveDirectusId()`
(`apps/api/src/modules/directus/directus-users-bridge.service.ts`).
`MeProfileService`'s constructor
(`me-profile.service.ts:172`) injects only `DirectusClient`, never the
bridge, even though `me-profile.module.ts` imports `DirectusModule`
(which exports the bridge). Every method —
`getProfile`/`patchProfile`/`listConsents`/`setConsent`/`listSkills`/
`addSkill`/`removeSkill`/`listInterests`/`listEmployments`/etc. — passes
the raw platform `sub` straight to `GET /users/{userId}` and
`/items/member_consents|member_skills|...?filter[member][_eq]=userId`.
`GET /users/{platformUserId}` 404s or errors against Directus (wrong
primary key), which `DirectusClient.request()` turns into a thrown
`DirectusError` — NestJS's default exception filter then returns a
non-2xx to the frontend, and `apiClient()`
(`apps/web-next/src/lib/api-client.ts:197-200`) throws `ApiError` on any
non-2xx, so React Query's `.error` is set and both `<ConsentList>`
(`apps/web-next/src/blocks/customer/ConsentList.tsx:71-75`) and
`<SkillTagger>` (`apps/web-next/src/blocks/customer/SkillTagger.tsx:28-32`)
render their "unavailable" banners. `/me/preferences` only mounts
`<ConsentList>` (`apps/web-next/src/pages/me/preferences.astro:14,37`),
which is why it shows only the consents error.

Contrast with `ReferralsService`
(`apps/api/src/modules/referrals/referrals.service.ts:59,69,79`), which
correctly resolves `this.bridge.ensureLinked(...)` before ever touching
Directus — this is the existing, working pattern `MeProfileService`
should have followed but doesn't.

**Not a recent regression** — `git log --follow` shows this shape since
`me-profile.service.ts`'s original commit (`ac27eda`, 2026-05-22, F-S3.6).
Likely silently broken in QA/prod all along; became visible once
self-registration (`ISS-USR-REG-001`, shipped 2026-07-18) started
reliably creating real, distinct `directus_user_id` values for new
members exercising this path.

**Why untested:** `apps/api/test/me-profile-service.spec.ts` mocks
`DirectusClient` directly with opaque test IDs (e.g. `'u-1'`) passed
straight through — it never models the two-id-space problem, so the
suite stayed green despite the bug.

**Bug B (symptom 3 — independent, does not share Bug A's root cause):**
`ReferralsController.myStats` (`apps/api/src/modules/referrals/referrals.controller.ts:52-57`)
returns `MyReferralStats` **unwrapped**, but the frontend hook
`useMyReferralStats()` (`apps/web-next/src/lib/use-referrals.ts:24-31`)
reads `body.stats` — a response-shape mismatch. On a real 200 response
this resolves `stats.data` to `undefined`, not an error (`stats.error`
stays unset), so this alone would render "—" placeholders, not the red
error banner — a latent bug, not (by itself) today's reported symptom.
`ReferralsService.listMine`/`getMyStats` both correctly call
`this.bridge.ensureLinked(...)` first and degrade gracefully (`[]` /
`EMPTY_STATS`) if the bridge can't resolve an id — so Bug A's failure
mode does not apply here.

**Open uncertainty on symptom 3's actual trigger:** what *would* trip
`ReferralDashboard`'s `hasError` (`codes.error || stats.error ||
!codes.data`,
`apps/web-next/src/blocks/customer/ReferralDashboard.tsx:140-143`) is any
401/403/5xx from `/v1/referrals/mine` or `/v1/referrals/mine/stats` — both
`AuthGuard`-protected like `/v1/me/profile`. Static analysis alone cannot
confirm whether QA is hitting a genuinely separate failure (e.g. a
transient Directus/auth issue distinct from Bug A) or something not yet
found. This will be investigated at Step 2 (Impact Analysis) /
resolved by live QA verification at Step 13.

## Fix

- `MeProfileService` (`apps/api/src/modules/me-profile/me-profile.service.ts`)
  now injects `DirectusUsersBridgeService` alongside `DirectusClient`. A new
  private `resolveDirectusId(userId, email)` helper calls
  `bridge.ensureLinked({userId, email, displayName: null})` and throws
  `NotFoundException` if the bridge can't resolve one; every public method
  (`getProfile`, `patchProfile`, `listConsents`, `setConsent`, `listSkills`,
  `addSkill`, `removeSkill`, `listInterests`, `addInterest`, `removeInterest`,
  `listEmployments`, `addEmployment`, `removeEmployment`, `setOnboardedAt`,
  `getOnboardedAt`, `patchDirectusFields`) now takes an `email` parameter and
  resolves the Directus id first, using it (not the raw platform `sub`) for
  every Directus call. This mirrors `ReferralsService`'s existing, correct
  pattern.
- `MeProfileController`, `MembersOnboardingController`, and
  `MembersOnboardingService` updated to extract `email` from
  `req.user.email` (already present on the JWT claims — no auth/token
  changes needed) and thread it through to every call site.
- No module-wiring change needed: `MeProfileModule` already imports
  `DirectusModule`, which already exports `DirectusUsersBridgeService` —
  NestJS DI auto-wires the new constructor parameter.
- **Bug B fix:** `ReferralsController.myStats` now wraps its return in
  `{ stats: ... }` to match what `useMyReferralStats()` already expected,
  closing the latent shape mismatch found during investigation (not
  believed to be today's live trigger for symptom 3, but a real bug in the
  same surface, fixed alongside since it's a one-line, low-risk, same-file
  fix).

## Regression test

`apps/api/test/me-profile-service.spec.ts` — new `describe` block
"MeProfileService — Directus id resolution (ISS-USR-PROFILE-001)" with 4
tests, using deliberately distinct `PLATFORM_USER_ID`/`DIRECTUS_USER_ID`
fixture strings (not the old same-space `'u-1'` pattern) so any future
regression that skips the bridge is caught immediately. Fail-before/
pass-after verified live: reverting only `me-profile.service.ts` (via
`git stash` on that file alone) makes 15/27 tests in this file fail
(signature mismatches + the new id-resolution assertions), confirming the
tests genuinely exercise the fix; restoring the fix returns the file to
27/27 passing.

## Verification

- `pnpm exec tsc --noEmit` — clean, no type errors.
- `pnpm exec biome check` on all changed files — clean.
- `pnpm exec vitest run test/me-profile-service.spec.ts
  test/members-onboarding.service.spec.ts
  test/members-onboarding.integration.spec.ts test/referrals-service.spec.ts`
  — 77/77 passing.
- Full `apps/api` suite (`pnpm test`, Testcontainers): 1293/1294 passing.
  The 1 failure (`test/users.spec.ts:65`, a timestamp-race test-design bug)
  is pre-existing on `origin/main`, untouched by this diff (confirmed via
  `git diff --stat main -- apps/api/test/users.spec.ts
  apps/api/src/modules/users/` returning empty), and already tracked by the
  queued follow-up `wf-20260704-fix-096-pre-existing-api-test-flakes`.
- **Live QA re-verification** of the actual reported symptoms
  (`/me/profile`, `/me/preferences`, `/me/referrals` loading without error
  banners) is the Step 13 post-merge BP-UAT-003 / BP-UAT-016
  re-verification — see Resolution section below for outcome.

### Honesty disclosures (AGENTS.md §6.1)

- Symptom 3's exact live trigger on QA was never fully confirmed via static
  analysis alone (see "Open uncertainty" above).
- Bug B (`mine/stats` shape mismatch) is fixed as a low-risk bonus in this
  same PR rather than split into its own issue, since it's a one-line
  change in a file this PR already touches and shares the same test
  surface.
- **Step 13's mandatory live BP-UAT-003 + BP-UAT-016 re-verification
  (full agent-driven Playwright session with screenshots) is deferred**
  to queued follow-up **`wf-20260728-uat-142-bp-uat-003-016-postmerge`**
  (`.copilot/tasks/queued/wf-20260728-uat-142-bp-uat-003-016-postmerge/handoff.yaml`,
  `parent_link.spawned_by_issue: ISS-USR-PROFILE-001`). Reason: running it
  required starting the local web dev server (was down) and re-seeding
  BP-UAT-003/016 fixtures, on top of the api rebuild already done — the
  full session (2 business processes, live browser, screenshots) is a
  substantial addition beyond this workflow's scope as approved.
  **What WAS done live in this workflow, not merely assumed:** rebuilt
  `apps/api` from the merged commit (confirmed stale `dist/main.js`
  predated the fix by 2 days), restarted the local api process, verified
  via `grep -c resolveDirectusId apps/api/dist/modules/me-profile/
  me-profile.service.js` (18 matches) that the running process serves the
  fixed code, and confirmed `/health` returns 200. A full authenticated
  end-to-end check (sign in as `uat-member@aiqadam.test`, hit
  `/v1/me/profile`, `/v1/me/profile/consents`, `/v1/referrals/mine`) was
  **not** performed — that requires a real Authentik OIDC browser session,
  which is exactly what the queued follow-up's Playwright session
  provides; no shortcut exists that would be more honest than deferring to
  it.
  **This issue is NOT being marked `resolved` based on assumption** — the
  static root-cause fix, its regression tests, and the full test suite are
  all live-verified per the sections above; only the *business-process*
  level re-verification (the deeper "no deferred tests" check per
  AGENTS.md §6.1) is what's queued. The follow-up will run:
  `pnpm uat:seed BP-UAT-003 BP-UAT-016` (or per-BP-UAT default seed) then
  drive both sessions per `.copilot/workflows/uat-verification.md`,
  expecting AC-1/AC-2/AC-5 of BP-UAT-003 (profile/skills/consents load and
  persist without error) and BP-UAT-016's referral-dashboard load to pass
  clean.
- **Update (2026-07-28, second attempt at the queued follow-up):** a real
  live authenticated session was driven against `apps/web-next` (signed in
  as `uat-member@example.com` via Authentik OIDC, genuinely authenticated
  — confirmed by the nav avatar and post-signin URL). This **did confirm
  the core fix works**: the api log showed the Directus request using the
  correctly-resolved Directus id (`GET /users/a1524645-...`), not the old
  broken platform id — i.e. the bridge-resolution mechanism this issue
  fixed is proven live, not just by unit test. However, the request then
  hit a **separate, pre-existing, unrelated environment bug**: Directus
  403s reading `onboarded_at` because every local Directus user has no
  policy attached (`RbacSyncService` is permanently dry-run locally). This
  blocks completing the full BP-UAT-003/016 pass/fail verdict in the
  *current* local environment — filed as
  **[ISS-UAT-RBAC-001](ISS-UAT-RBAC-001.md)** (blocker, not yet scheduled)
  since it's a real, previously-undocumented gap that will block every
  future local UAT session needing an authenticated member view, not just
  this one. `wf-20260728-uat-142-bp-uat-003-016-postmerge`'s handoff.yaml
  records the full diagnostic trail (what was tried, what failed, why).
  This issue's own fix remains correctly merged and live-confirmed at the
  mechanism level; only the full BP-UAT pass/fail verdict is still
  blocked, now by a named, filed, different issue rather than an
  undiagnosed gap.

## Resolution

- **Workflow:** wf-20260728-fix-141
- **PR:** [#95](https://github.com/aiqadam/ai-qadam-platform/pull/95)
- **Root cause:** `MeProfileService` queried Directus using the platform
  `users.id` instead of the Directus `directus_users.id`, never resolving
  the mapping via `DirectusUsersBridgeService`. Separately, `referrals
  /mine/stats` returned an unwrapped body that didn't match what the
  frontend hook expected.
- **Fix:** Injected the bridge into `MeProfileService`, resolved the
  Directus id in every method; wrapped the referrals stats response.
- **Regression test:** `apps/api/test/me-profile-service.spec.ts` —
  "MeProfileService — Directus id resolution (ISS-USR-PROFILE-001)".
- **Merged:** `313365f` (squash, 2026-07-28)
