# Test Strategy — FEAT-MIG-020

## Requirement

FEAT-MIG-020 (FR-MIG-020): Telegram acquisition funnel — `/welcome/[slug]` landing page, `/onboard` 3-step onboarding form, and `POST /v1/members/onboard` API endpoint. New members arrive via Telegram invite links, land on a campaign-specific landing page sourced from Directus `landing_pages`, complete onboarding, and are redirected to `/me`.

---

## Rubric Score

| Criterion | Points | Detail |
|-----------|--------|--------|
| Touches tenant-scoped data | +2 | Writes to `directus_users`, `member_skills`, `member_interests`, `member_consents`, `point_awards` — all Directus collections scoped by `country_code` |
| New API endpoint | +2 | `POST /v1/members/onboard` — new controller + service + DTO |
| Business rule with edge cases | +2 | Idempotency: double-call must no-op; `onboarded_at` guard; skill+interest upsert |
| Cross-module service call | +1 | `MembersOnboardingService` calls `MeProfileService` + `PointsDirectusService` |
| New database query | +1 | `getOnboardedAt`, `awardFirstJoinPoints` pre-check, `fetchLandingPage` |
| Pure function / utility | 0 | — |
| UI-only change | 0 | — |
| **Total** | **8** | |

---

## Required Test Levels

- [x] Unit Tests (Jest / Vitest) — required
- [x] Integration Tests (Testcontainers + Directus mock) — required (score >= 4)
- [x] E2E Tests (Playwright) — required (score >= 6)

---

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|--------|------------|---------------|
| `OnboardMemberDtoSchema` (Zod) | Valid payload passes: `{ firstName, lastName, jobTitle, skills, interests, consents, slug }` | Missing required fields → Zod error; skills[] with values > 80 chars → error; invalid interest intent → error |
| `MembersOnboardingService.completeOnboarding()` | All fields written to Directus; `onboarded_at` set; points awarded | Double-call → returns early without re-awarding (idempotency); skill upsert → skips existing; interest upsert → skips existing |
| `MembersOnboardingService.patchProfileFields()` | `first_name`, `last_name`, `job_title` patched to `directus_users` | Empty string trimmed; whitespace normalised |
| `MembersOnboardingService.awardFirstJoinPoints()` | Inserts `point_awards` row with `key='first_join'`, `amount=10` | Pre-check finds existing row → no-op (idempotency) |
| `MeProfileService.setOnboardedAt()` | Writes current timestamp to `directus_users.onboarded_at` | — |
| `MeProfileService.getOnboardedAt()` | Returns parsed Date or null | Field not yet added to Directus schema → returns null (pre-deploy safe) |
| `fetchLandingPage(slug)` (cms.ts) | Returns `CmsLandingPage` for valid slug | Non-existent slug → returns null |
| `useOnboardMember()` hook | Calls `POST /v1/members/onboard`, returns `{ mutate, isPending }` | Network error → TanStack Query error state |
| `<OnboardingForm>` React component | Renders 3 steps; step 1 collects name+title; step 2 shows skill input; step 3 shows consent toggles; submit calls mutation | Invalid step data → Next button disabled; API error → error banner |

**Note on `OnboardingForm`:** Code summary §Known Limitations flags that the form has its own inline skill-tagger (SkillTagger adapter refactor deferred). Unit tests for the form should test the step-navigation state machine and submission payload shape, not the deferred SkillTagger internals.

---

## Integration Test Plan

| Scenario | Infrastructure | Key Assertions |
|----------|----------------|----------------|
| Full `POST /v1/members/onboard` happy path | NestJS test request factory + Directus REST mock (msw or nock on Directus endpoints); `me-profile`, `points`, `members` modules loaded | HTTP 204; `directus_users` row has `first_name`, `last_name`, `job_title`, `onboarded_at`; `member_skills` row exists; `member_interests` row exists; `member_consents` row exists; `point_awards` row with `key='first_join'`, `user_id` |
| Double-call idempotency | Same setup, call twice | First: HTTP 204 + all writes; Second: HTTP 204 + `point_awards` count unchanged (no duplicate row) |
| Auth guard | No Bearer token | HTTP 401 |
| Validation failure | Missing `firstName` in body | HTTP 400 + Zod error shape |
| Already-onboarded user calls API | User with `onboarded_at` set in mock Directus | HTTP 204 + `point_awards` count unchanged (points not re-awarded) |
| `GET /v1/me/onboarding-status` — onboarded | Mock `directus_users` with `onboarded_at = now()` | `{ onboarded: true }` |
| `GET /v1/me/onboarding-status` — not onboarded | Mock `directus_users` with `onboarded_at = null` | `{ onboarded: false }` |

**Testcontainer approach:** Spin up a real NestJS app module (`MembersModule` + `MeProfileModule` + `PointsModule`) and mock the Directus HTTP layer with msw interceptors. This avoids the overhead of a full Directus container while testing the service orchestration, Zod validation, and response shapes.

---

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|-----------|-------------|----------------|
| Landing page — valid slug | `GET /welcome/telegram-uz` | Page title visible; CTA button "Join AI Qadam" present and links to `/onboard?slug=telegram-uz` |
| Landing page — invalid slug | `GET /welcome/nonexistent` | HTTP 404 returned |
| Onboarding redirect — anon | `GET /onboard` (no session) | 302 redirect to `/auth/sign-in?redirect=/onboard` |
| Onboarding render — authed, not onboarded | Sign in as user with `onboarded_at = NULL`; `GET /onboard` | 200; step 1 form visible with first_name, last_name, job_title fields |
| Onboarding redirect — already onboarded | Sign in as user with `onboarded_at = NOW`; `GET /onboard` | 302 redirect to `/me` |
| Full onboarding happy path | Land on `/welcome/telegram-uz` → click CTA → sign in → complete step 1 → step 2 → step 3 → submit | 302 redirect to `/me` |
| Onboarding revisits after completion | Same user from above flow; `GET /onboard` | 302 redirect to `/me` (already onboarded guard) |

**Playwright configuration:**
- Base URL: `http://localhost:4321` (web-next dev server)
- API base: `http://localhost:3000` (API dev server)
- Use `@playwright/test` with existing `apps/e2e/` pattern
- Auth: `storageState` fixture with pre-seeded test user (has session cookie, `onboarded_at = NULL` for onboard tests, `onboarded_at = NOW` for redirect tests)
- Directus data: seed script for `landing_pages` with slug `telegram-uz`

---

## Acceptance Criteria — Test Mapping

| AC | Test Level | Test Description |
|----|------------|------------------|
| AC-1: `/welcome/telegram-uz` renders with correct content + CTA | E2E | Landing page happy path: title, subtitle, body, CTA button linking to `/onboard?slug=telegram-uz` |
| AC-2: `/welcome/nonexistent` returns 404 | E2E + Unit | E2E: `GET /welcome/nonexistent` → 404; Unit: `fetchLandingPage('nonexistent')` → null |
| AC-3: Anon accessing `/onboard` redirects to sign-in | E2E | `GET /onboard` (no session) → 302 `/auth/sign-in?redirect=/onboard` |
| AC-4: Authed + not onboarded → renders 3-step form | E2E | Sign in (no onboard), `GET /onboard` → 200 + step 1 visible |
| AC-5: Authed + onboarded → 302 to `/me` | E2E | Sign in (onboarded), `GET /onboard` → 302 `/me` |
| AC-6: Step 1 → Step 2 navigation | Unit | `<OnboardingForm>` test: fill step 1, click Next → step 2 renders |
| AC-7: Skill "mlops" persisted to `member_skills` | Integration | `POST /v1/members/onboard` with `skills: ['mlops']` → `member_skills` row exists for user |
| AC-8: Full form submit calls API + sets `onboarded_at` + awards points | Integration | `POST /v1/members/onboard` (all 3 steps valid) → 204; `directus_users.onboarded_at` set; `point_awards` row with `key='first_join'` |
| AC-9: API 204 → frontend redirects to `/me` | E2E | Full happy path flow ends at `/me` |
| AC-10: Double-call returns 204, no re-award | Integration | Call API twice → second call: 204; `point_awards` count unchanged |
| AC-11: `pnpm arch:check && astro check && pnpm build` pass | CI gate | Executed in CI pipeline (not a test file; enforced by QualityGate) |

---

## Gate Result

gate_result:
  status: passed
  summary: "Test strategy complete for FEAT-MIG-020. Rubric score 8 mandates Unit + Integration (Testcontainers) + E2E (Playwright). All 10 ACs mapped to test cases; AC-11 enforced by CI gate."
  findings:
    - "Rubric score 8 = Unit + Integration + E2E required"
    - "Unit tests: 9 targets across Zod DTO, service methods, SSR helpers, React component"
    - "Integration tests: 7 scenarios covering full POST /v1/members/onboard flow, idempotency, auth, validation, and GET /v1/me/onboarding-status"
    - "E2E tests: 7 Playwright flows covering landing page, auth redirects, onboarding render, and full happy path"
    - "All 10 ACs mapped; AC-11 is CI-gated, not a test file"
    - "Known limitations noted: onboarded_at field must exist in Directus before tests run; SkillTagger adapter deferred (onboarding form has inline tagger)"
