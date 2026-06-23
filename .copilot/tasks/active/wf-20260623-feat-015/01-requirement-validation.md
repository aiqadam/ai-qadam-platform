# Requirement Validation — FR-MIG-020

## Raw Input

From `docs/03-requirements/FR-MIG-020.md`:

```
The Telegram acquisition funnel entry point. New members arriving from a Telegram invite link land on `/welcome/[slug]`, complete the onboarding form, and are redirected to `/onboard`.

Users: New members completing first-time onboarding.

Functional scope:
1. `pages/welcome/[slug].astro` — per-source welcome page (UTM context + community intro). CTA: "Join AI Qadam". Slug maps to a UTM campaign; page content comes from Directus.
2. `pages/onboard.astro` — multi-step onboarding form: (1) profile basics (name, location, job title), (2) skills + interests (`<SkillTagger>`), (3) consent + AUP.
3. POST `/v1/onboard` on completion → creates member profile + awards first-join points.
4. Redirect to `/me` on success.
5. AuthGate on `/onboard` (must be signed in to complete).

Acceptance criteria:
- `/welcome/[slug]` renders with correct CTA for the given slug.
- Onboarding form collects all three steps before submitting.
- Completing onboarding creates the member profile and redirects to `/me`.
- Revisiting `/onboard` after completion redirects to `/me` (already onboarded).
- `pnpm arch:check` + `astro check` + `pnpm build` pass.

Notes:
- v1 reference: `apps/web/src/pages/onboard.astro` + `welcome/[slug].astro` + `OnboardingForm.tsx`.
- `<SkillTagger>` block already exists in web-next.
- Related: FR-USR-001 (signup / first-time experience).
```

---

## Analysis

### 1. Completeness Issues Found

| # | Issue | Detail |
|---|-------|--------|
| 1 | **Missing field mapping** | "Creates member profile" — which Directus fields? The requirement lists `name`, `location`, `job_title` but the Directus `directus_users` schema has `first_name`, `last_name`, `country_code` (tenant), `job_title`. "Location" is ambiguous: city string? Country code? |
| 2 | **Missing point configuration** | "Awards first-join points" — no point type/key, no amount specified. `apps/api/src/modules/points/points-directus.service.ts` shows a Directus-backed points system but there is no pre-existing `first_join` point award rule. Need a point definition key (e.g., `first_join`) and amount. |
| 3 | **Missing onboarded-state storage** | "Revisiting `/onboard` after completion redirects to `/me`" — where is the "already onboarded" flag stored? Options: `directus_users.onboarded_at` (new nullable TIMESTAMPTZ column), or derive from existence of profile fields. Not defined. |
| 4 | **Step 2 scope ambiguity** | Step 2 says "skills + interests (`<SkillTagger>`)" — `<SkillTagger>` in web-next is wired to `useMyFullProfile` hooks and adds to `member_skills`. Is the intent to use the existing component as-is (read/write skills), or is a separate interests-only step needed? Interests (`member_interests`) exist in `me-profile.service.ts` but the SkillTagger only handles skills. |
| 5 | **Consent + AUP step incomplete** | Step 3 says "consent + AUP" — which consents from `MEMBER_CONSENT_PURPOSES` (me-profile.service.ts:28) are required? All? Just `events`? AUP acceptance needs a storage location (existing `member_consents` table handles purposes; AUP version acceptance is separate — see FR-USR-001 which stores `aup_accepted` on the invite, not on `directus_users`). |
| 6 | **"location" field does not exist in schema** | `directus_users` has no `location` column. The closest is `country_code` (already set by tenant middleware) or `city` (not present). If location capture is required, either add a `city` column or derive from the Telegram user's Telegram profile. |

### 2. Conflicts with Existing Features

| # | Conflict | Detail |
|---|----------|--------|
| 1 | **Endpoint naming collision** | FR-MIG-020 specifies `POST /v1/onboard` but `apps/api/src/modules/admin-invites/onboarding.controller.ts` already owns `/v1/onboard/preview` and `/v1/onboard/accept`. These are **operator onboarding endpoints** (token-gated, password-setting, mailbox provisioning). FR-MIG-020's "member onboarding" is a different flow (authed via AuthGate, profile creation). The endpoint MUST be renamed, e.g., `POST /v1/members/onboard` or `POST /v1/onboard/member`. |
| 2 | **Wrong v1 reference** | The Notes cite `apps/web/src/pages/onboard.astro` as the v1 reference. That file is the **operator onboarding** form (password + AUP for invited operators, driven by OnboardingForm.tsx). It is NOT the member onboarding flow. The `welcome/[slug].astro` file is correct (campaign landing pages). The onboard reference is wrong. |
| 3 | **FR-USR-001 overlap** | FR-USR-001 shipped "Member signup and first-time experience" with post-signup redirect to `/me` and a profile nudge for incomplete profiles. FR-MIG-020's redirect to `/me` on completion is consistent but there is no mention of deduplication — if a member completes onboarding via FR-MIG-020 and later visits `/me`, does the nudge still fire? Unclear if the two flows should share state. |

### 3. Architectural Feasibility

| Check | Result | Notes |
|-------|--------|-------|
| **Frontend target** | FEASIBLE | `apps/web-next` is the Astro 5 rewrite target per ADR-0038. Both pages can be created under `apps/web-next/src/pages/`. |
| **`/welcome/[slug]`** | FEASIBLE | `fetchLandingPage` already exists in `apps/web/src/lib/cms.ts` and returns `CmsLandingPage { slug, title, subtitle, bodyMd, ctaLabel, ctaUrl }`. Needs to be imported/copied to `web-next`. The CTA URL should point to `/onboard` (or `/auth/sign-in` if not authed). |
| **`/onboard` AuthGate** | FEASIBLE | Auth via `useAuth()` / `AuthProvider` pattern exists in `apps/web-next/src/lib/use-auth.ts`. Astro middleware in `apps/web-next/src/middleware.ts` handles SSR auth. A simple server-side redirect (check session, redirect to `/me` if already onboarded) is straightforward. |
| **Multi-step form** | FEASIBLE | A React island component handles the 3 steps. The `OnboardingForm` in web is operator-specific but the multi-step pattern (`useState` for step + fields) can be adapted. |
| **`POST /v1/onboard`** | BLOCKED | Endpoint naming collision (see Conflict #1). Must rename to avoid breaking the operator onboarding flow. |
| **`<SkillTagger>` reuse** | PARTIAL | The block exists in `apps/web-next/src/blocks/customer/SkillTagger.tsx` but is wired to `useMyFullProfile` hooks for the `/me/profile` page. It cannot be dropped in standalone. A new standalone wrapper or a refactor to accept an `onSave` callback is needed. |
| **Points award** | NEEDS WORK | `PointsDirectusService` in `apps/api/src/modules/points/points-directus.service.ts` reads/writes points via Directus `points` collection. No `award` method exists — it reads leaderboard aggregations. A new service method or job queue entry is needed to award points atomically on onboarding completion. |
| **Directus schema** | NEEDS WORK | `directus_users` table has no `onboarded_at` column. Schema extension required. `member_consents` exists for consent tracking. |

---

## Formalized Requirement

**Feature identifier:** `FEAT-MIG-020` (pre-assigned as `FR-MIG-020`)

**Statement:**
New members arriving via Telegram invite links land on `/welcome/{slug}`, a campaign-specific landing page sourced from Directus `landing_pages`. After clicking "Join AI Qadam", they are redirected to `/onboard` where they complete a three-step onboarding form: (1) profile basics, (2) skills and interests, (3) consent and acceptable use policy. On submit, the member profile is created/updated in Directus and a first-join point award is recorded. The user is redirected to `/me`. Users who have already completed onboarding are redirected from `/onboard` to `/me`.

**Cross-references:**
- `FR-USR-001` — member signup flow (FR-MIG-020 complements FR-USR-001; FR-USR-001 handles auth, FR-MIG-020 handles profile completion)
- `FR-GAM-002` — founding member badge award (separate from first-join points; clarify if both apply)
- `apps/api/src/modules/me-profile/me-profile.service.ts` — existing profile write operations
- `apps/api/src/modules/points/points-directus.service.ts` — existing points system
- `apps/web/src/lib/cms.ts` — `fetchLandingPage` function (to be migrated to web-next)
- `apps/web-next/src/blocks/customer/SkillTagger.tsx` — existing SkillTagger component (needs standalone adapter)

---

## Acceptance Criteria (draft)

> These are Given/When/Then statements for TestDesigner to formalize. Square brackets denote parameters that need concrete values.

| # | Given | When | Then |
|---|-------|------|------|
| AC-1 | A visitor accesses `/welcome/telegram-uz` | the page renders with content from Directus `landing_pages` where `slug = 'telegram-uz'` and `status = 'published'` | The page shows the campaign title, subtitle, body, and a CTA button labeled "Join AI Qadam" linking to `/onboard?slug=telegram-uz` |
| AC-2 | A visitor accesses `/welcome/nonexistent` | no matching `landing_pages` row exists | The page returns HTTP 404 |
| AC-3 | An unauthenticated user accesses `/onboard` | they have no valid session | They are redirected to `/auth/sign-in?redirect=/onboard` |
| AC-4 | An authenticated user who has NOT completed onboarding accesses `/onboard` | they have `onboarded_at = NULL` in `directus_users` | The page renders a 3-step form: (1) profile basics, (2) skills + interests, (3) consent + AUP |
| AC-5 | An authenticated user who HAS completed onboarding accesses `/onboard` | they have `onboarded_at IS NOT NULL` | They are redirected to `/me` with a 302 |
| AC-6 | A user completes step 1 with `first_name = "Ali"`, `last_name = "Rahimov"`, `job_title = "ML Engineer"` | they click Next | Step 2 renders |
| AC-7 | A user adds skill tag "mlops" in step 2 | they submit the form | The skill `mlops` is persisted to `member_skills` for the current user |
| AC-8 | A user submits the full onboarding form | all 3 steps are valid | `POST /v1/members/onboard` is called with all collected data, `onboarded_at` is set on the user's `directus_users` row, and [X] points are awarded under key `first_join` |
| AC-9 | `POST /v1/members/onboard` succeeds | the API returns 204 | The frontend redirects to `/me` |
| AC-10 | `POST /v1/members/onboard` is called twice for the same user | the second call occurs after `onboarded_at` is set | The API returns 204 (idempotent) without re-awarding points |
| AC-11 | The codebase passes | `pnpm arch:check && astro check && pnpm build` | All three commands exit with code 0 |

**Open questions (need answers before implementation):**

1. What is the exact point amount and point definition key for "first-join points"? e.g., `{ key: "first_join", amount: 100 }`?
2. What Directus fields are required for "location"? Is it a city text field, or is country_code from tenant resolution sufficient?
3. Which consent purposes (from `MEMBER_CONSENT_PURPOSES`) must be explicitly accepted vs. default-deny?
4. Is AUP acceptance required for member onboarding, and if so, where is the accepted AUP version stored?
5. Should the Telegram invite slug (`telegram-uz`) be stored on the member profile for analytics?

---

## Gate Result

```
gate: requirement-validation
agent: requirement-analyst
status: failed-retry
workflow: wf-20260623-feat-015
requirement: FR-MIG-020

summary: >
  FR-MIG-020 has 2 conflicts and 6 completeness issues (see §Analysis).
  The requirement passes architectural feasibility for the frontend pages
  and auth flow, but is BLOCKED on: (1) endpoint naming collision with the
  existing /v1/onboard operator endpoints (must rename to /v1/members/onboard),
  (2) missing onboarded_at schema column, (3) incomplete points award mechanism,
  (4) wrong v1 onboard reference (cited file is operator onboarding, not member).
  Analyst produced a detailed formalized version with reasonable assumptions.

needs_clarification:
  - Point amount and key for first-join award (e.g., { key: "first_join", amount: 100 })
  - "location" field mapping to Directus schema (city column? tenant country_code?)
  - Which MEMBER_CONSENT_PURPOSES are required on step 3
  - AUP acceptance storage location for member onboarding
  - Whether telegram invite slug should be stored on profile for analytics

conflicts:
  - Endpoint /v1/onboard already used by operator onboarding (apps/api/src/modules/admin-invites/onboarding.controller.ts)
  - v1 reference onboard.astro is operator onboarding, not member onboarding

confidence: high
```
