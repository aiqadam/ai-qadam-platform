# Test Design — FR-MIG-020

**Workflow:** wf-20260623-feat-015
**Agent:** test-designer
**Date:** 2026-06-24
**Step:** 6

---

## Overview

This document specifies the test suite for FR-MIG-020: Telegram acquisition funnel — `/welcome/[slug]` landing page, `/onboard` 3-step onboarding form, and `POST /v1/members/onboard` API.

Rubric score: **8** — requires Unit + Integration (Testcontainers) + E2E (Playwright).

---

## Test File Locations

| Level | Tool | Location |
|-------|------|----------|
| Unit | Vitest (api) | `apps/api/test/members-onboarding.dto.spec.ts` |
| Unit | Vitest (api) | `apps/api/test/members-onboarding.service.spec.ts` |
| Integration | Vitest + Testcontainers (api) | `apps/api/test/members-onboarding.integration.spec.ts` |
| Unit | Vitest (web-next) | `apps/web-next/src/lib/use-onboarding.test.ts` |
| Unit | Vitest (web-next) | `apps/web-next/src/lib/cms-landing-page.test.ts` |
| Unit | Vitest (web-next) | `apps/web-next/src/blocks/customer/OnboardingForm.test.tsx` |
| E2E | Playwright | `apps/e2e/tests/smoke-onboarding.spec.ts` |

**Note:** `fetchLandingPage` is only implemented in `apps/web-next/src/lib/cms.ts` (SSR layer). The API does not have a corresponding implementation.

---

## Unit Test Targets

### 1. `OnboardMemberDtoSchema` (Zod)

**File:** `apps/api/test/members-onboarding.dto.spec.ts`

Pattern: follow `consent-service.spec.ts` — pure Zod, no mocks.

| Test | Input | Expected |
|------|-------|----------|
| Happy: all required fields only | `{ firstName: 'A', lastName: 'B' }` | Parses successfully; `data` matches |
| Happy: all optional fields | Full payload with skills, interests, consents, slug | Parses successfully; all fields normalised |
| Happy: skill normalisation — trim + lowercase + hyphen | `skills: ['  MLOps  ', 'computer vision!']` | `['mlops', 'computer-vision']` |
| Happy: interest topic_tag normalisation | `interests: [{ topic_tag: 'LLM Optimization', intent: 'learn' }]` | `topic_tag: 'llm-optimization'` |
| Fail: missing firstName | `{}` | Zod error with `firstName` in path |
| Fail: missing lastName | `{ firstName: 'A' }` | Zod error with `lastName` in path |
| Fail: firstName too long (>100 chars) | `firstName: 'x'.repeat(101)` | Zod error |
| Fail: lastName too long (>100 chars) | `lastName: 'x'.repeat(101)` | Zod error |
| Fail: skill > 80 chars | `skills: ['x'.repeat(81)]` | Zod error |
| Fail: skills array > 50 items | `skills: Array(51).fill('mlops')` | Zod error |
| Fail: unknown interest intent | `interests: [{ topic_tag: 'x', intent: 'invalid' }]` | Zod error |
| Fail: unknown consent purpose | `consents: { invalid: true }` | Zod error |
| Fail: strict mode — unknown key | `{ unknownKey: true, firstName: 'A', lastName: 'B' }` | Zod error |
| Type: `z.infer` produces correct shape | — | `OnboardMemberDto` has all expected fields |

### 2. `MembersOnboardingService.completeOnboarding()`

**File:** `apps/api/test/members-onboarding.service.spec.ts`

Pattern: follow `me-profile-service.spec.ts` — mock `MeProfileService` + `PointsDirectusService` with `vi.fn()`, verify call count and arguments.

| Test | Mock behaviour | Assertions |
|------|----------------|------------|
| Happy: all operations called in sequence | All methods resolve | `patchDirectusFields`, each `addSkill`, each `addInterest`, each `setConsent`, `setOnboardedAt`, `awardFirstJoinPoints` all called; `awardFirstJoinPoints` called with userId |
| Empty skills array — no addSkill calls | `skills: []` | `profile.addSkill` not called |
| Empty interests array — no addInterest calls | `interests: []` | `profile.addInterest` not called |
| Only granted consents trigger setConsent | `consents: { events: true, marketing: false }` | `setConsent` called once with `'events'`; `'marketing'` excluded |
| First+last name patched via patchDirectusFields | `firstName: 'A', lastName: 'B'` | `patchDirectusFields` called with `{ first_name: 'A', last_name: 'B' }` |
| jobTitle patched via patchProfile | `jobTitle: 'Engineer'` | `patchProfile` called with `{ job_title: 'Engineer' }` |
| Null jobTitle passes null | `jobTitle: null` | `patchProfile` called with `{ job_title: null }` |
| awardFirstJoinPoints called after setOnboardedAt | — | Call order: `setOnboardedAt` → `awardFirstJoinPoints` |
| Promise.all used for parallel writes | Multiple skills/interests | Each group uses `Promise.all` |

### 3. `MeProfileService.getOnboardedAt()` / `setOnboardedAt()`

**File:** `apps/api/test/me-profile-service.spec.ts` (append to existing)

| Test | Mock | Assertions |
|------|------|------------|
| `getOnboardedAt` returns ISO string | Directus returns `{ data: { onboarded_at: '2026-01-01T00:00:00Z' } }` | Returns `'2026-01-01T00:00:00Z'` |
| `getOnboardedAt` returns null when field is null | Directus returns `{ data: { onboarded_at: null } }` | Returns `null` |
| `getOnboardedAt` returns null on user not found | Directus returns `{ data: null }` | Returns `null` |
| `setOnboardedAt` PATCHes with ISO timestamp | Directus `patch` resolves | `patch` called with `onboarded_at` matching ISO-8601 pattern (ends with 'Z') |

### 4. `fetchLandingPage(slug)` (cms.ts)

**File:** `apps/web-next/src/lib/cms-landing-page.test.ts` (already exists)

**Note:** `fetchLandingPage` is implemented in `apps/web-next/src/lib/cms.ts` (SSR layer). There is no API-side implementation.

| Test | Input | Assertions |
|------|-------|------------|
| Valid slug returns CmsLandingPage | `'telegram-uz'` → Directus row | Returns all fields; slug normalised |
| Non-existent slug | `'does-not-exist'` → empty array | Returns `null` |
| Slug normalised to lowercase | `'TELEGRAM-UZ'` | URL param contains `filter[slug][_eq]=telegram-uz` |
| Slug shape guard — weird characters | `'weird/slug'` | Returns `null` before network call |
| Slug shape guard — path traversal | `'../etc/passwd'` | Returns `null` before network call |
| Network error → null | Directus throws | Returns `null`; error logged but not thrown |
| Published status filter | Valid slug | URL contains `filter[status][_eq]=published` |

### 5. `PointsDirectusService.awardFirstJoinPoints()`

**File:** `apps/api/test/points-directus.spec.ts` (append to existing)

| Test | Mock | Assertions |
|------|------|------------|
| Happy: inserts point_awards row | No existing award; Directus `get` → `[]`, `post` resolves | `post` called once; body has `user`, `points: 10`, `key: 'first_join'` |
| Idempotency: existing award | Directus `get` → `[{ id: 'existing' }]` | `post` not called; returns early |
| Called with userId | Any call | First argument to service is the user's directus ID |
| POST body shape | Valid call | `{ user: <userId>, points: 10, key: 'first_join' }` |

### 6. `useOnboardMember()` hook

**File:** `apps/web-next/src/lib/use-onboarding.test.ts`

Pattern: follow `use-access-log.test.ts` — local re-implementation of hook state machine, mock `apiClient`.

| Test | Input | Assertions |
|------|-------|------------|
| mutationFn calls `POST /v1/members/onboard` | Valid payload | `apiClient` called with `'/v1/members/onboard'`, `method: 'POST'` |
| mutationFn passes body as JSON | Full `OnboardingData` | `body` of POST call deep-equals the input |
| `isPending` = true before settle | — | State initialises with `isPending: true` |
| Success: `isPending` = false after resolve | `apiClient` resolves | Result `isPending` = false; `isError` = false |
| Error: `isError` = true, error propagated | `apiClient` rejects with `Error` | `isError` = true; `error` is the Error |
| `slug` passed through when provided | `{ ...data, slug: 'telegram-uz' }` | `body.slug === 'telegram-uz'` in POST call |

### 7. `<OnboardingForm>` React component

**File:** `apps/web-next/src/blocks/customer/OnboardingForm.test.tsx`

Pattern: follow `AccessLogTable.test.tsx` — pure helper extraction + state machine stub. No React rendering.

| Test | Scenario | Assertions |
|------|----------|-----------|
| Step 1 renders with first/last/job fields | Initial state `currentStepId = 'profile'` | `Step1Profile` content: firstName, lastName, jobTitle fields |
| Next disabled when firstName or lastName empty | Both empty | `validateStep()` returns `false`; Next button disabled |
| Next enabled when firstName + lastName filled | Both filled | `validateStep()` returns `true` |
| `handleNext` advances to step 2 | After filling step 1 | `currentStepId` becomes `'skills'` |
| Skill added via form submit | User types `mlops` + submits | `skills` array includes `'mlops'` |
| Interest added via form submit | Topic + intent filled + submits | `interests` array includes entry |
| `handleNext` on step 2 → step 3 | — | `currentStepId` becomes `'consents'` |
| Back button on step 2 → step 1 | After advancing to step 2 | `currentStepId` becomes `'profile'` |
| Consent toggle updates state | Toggle 'events' checkbox | `consents.events === true` |
| Submit calls `mutateAsync` with correct payload | All fields filled | `mutateAsync` called with `{ firstName, lastName, jobTitle, skills, interests, consents, slug? }` |
| Redirect to /me after success | `onboard` resolves | `window.location.href === '/me'` |
| Error banner shown on API failure | `onboard.isError === true` | Error message text rendered |

---

## Integration Test Targets

**File:** `apps/api/test/members-onboarding.integration.spec.ts`

Infrastructure: NestJS `Test.createTestingModule()` loading `MembersModule` + `MeProfileModule` + `PointsModule`; Directus HTTP mocked with msw; real Postgres via existing `setup-pg.ts` (Testcontainers).

### `POST /v1/members/onboard`

| Test | Setup | Assertions |
|------|-------|------------|
| Happy path | Valid JWT + full payload | HTTP 204; `directus_users` patched with first_name/last_name/job_title; `member_skills` row; `member_interests` row; `member_consents` row; `point_awards` row with `key='first_join'`, `points=10` |
| Double-call idempotency | Call twice with same payload | First: 204; Second: 204; `point_awards` count = 1 (no duplicate) |
| 401 — no auth | No Bearer token | HTTP 401 |
| 400 — missing firstName | Body `{}` | HTTP 400; error shape has `firstName` in issues |
| 400 — missing lastName | `{ firstName: 'A' }` | HTTP 400; error shape has `lastName` in issues |
| 400 — invalid interest intent | Intent outside enum | HTTP 400 |
| 400 — unknown consent purpose | `consents: { not_a_purpose: true }` | HTTP 400 |
| 400 — strict mode rejects unknown key | `{ unknownField: true, firstName: 'A', lastName: 'B' }` | HTTP 400 |
| Empty skills array | `skills: []` | HTTP 204; no `member_skills` rows written |
| Empty interests array | `interests: []` | HTTP 204; no `member_interests` rows written |
| Already-onboarded: points not re-awarded | Second call on already-onboarded user | HTTP 204; `point_awards` count = 1 (idempotent via pre-check) |

### `GET /v1/me/onboarding-status`

| Test | Setup | Assertions |
|------|-------|------------|
| Onboarded = true | Directus user with `onboarded_at = '2026-01-01T00:00:00Z'` | HTTP 200; `body.onboarded === true` |
| Onboarded = false | Directus user with `onboarded_at = null` | HTTP 200; `body.onboarded === false` |
| 401 — no auth | No Bearer token | HTTP 401 |

---

## E2E Test Targets

**File:** `apps/e2e/tests/smoke-onboarding.spec.ts`

Base URL: `http://localhost:4321` (web-next dev server). Auth via `storageState` fixture with pre-seeded test users seeded via Directus API.

| Test | Entry | Assertions |
|------|-------|-----------|
| `/welcome/valid-slug` renders with CTA | `GET /welcome/telegram-uz` | 200; page title; CTA button with label 'Join AI Qadam'; CTA `href` includes `/onboard?slug=telegram-uz` |
| `/welcome/invalid-slug` → 404 | `GET /welcome/nonexistent-slug` | HTTP 404 |
| `/onboard` anon → redirect to sign-in | `GET /onboard` (no session) | 302 → `/auth/sign-in?redirect=/onboard` |
| `/onboard` authed+not-onboarded renders form | Sign in as user with `onboarded_at = null`; `GET /onboard` | 200; step 1 visible; first_name, last_name, job_title fields present |
| `/onboard` authed+onboarded → redirect to /me | Sign in as user with `onboarded_at = NOW`; `GET /onboard` | 302 → `/me` |
| Full happy path: step 1 → 2 → 3 → submit | Sign in → fill step 1 → Next → add skill → Next → toggle consent → submit | 302 → `/me` |
| Revisit /onboard after completion | Same user from above; `GET /onboard` | 302 → `/me` (already onboarded guard) |

**Playwright configuration notes:**
- Follows `smoke-landing-pages.spec.ts` and `smoke-me-profile.spec.ts` patterns
- `storageState` fixtures for test users (one non-onboarded, one onboarded)
- Landing page seed: `landing_pages` with `slug='telegram-uz'`, `status='published'`
- Uses `page.request.get()` for HTTP-level assertions where appropriate

---

## Key Design Decisions

1. **Pure mock unit tests (Vitest api):** Directus mocked with `vi.fn()`. No Testcontainers — follows `me-profile-service.spec.ts` pattern.
2. **Integration tests use msw for Directus mocking:** No real Directus container; msw intercepts HTTP calls. Real Postgres via `setup-pg.ts` for `point_awards` Drizzle-backed tables.
3. **web-next unit tests follow existing pattern:** No `@testing-library/react`; pure-helper + state-machine stub approach from `AccessLogTable.test.tsx`.
4. **E2E uses `storageState` fixtures:** Pre-seeded test users via Directus API; no OTP flow for test accounts.
5. **`onboarded_at` field must exist in Directus:** Service tests return null gracefully if field missing; integration tests mock the field value explicitly.
6. **No `it.skip` or TODOs:** All tests are fully implemented and runnable.

---

## Acceptance Criteria Coverage

| AC | Description | Test(s) |
|----|-------------|---------|
| AC-1 | `/welcome/telegram-uz` renders with correct content + CTA | E2E: `/welcome/valid-slug` renders with CTA |
| AC-2 | `/welcome/nonexistent` returns 404 | E2E: `/welcome/invalid-slug` → 404; Unit: `fetchLandingPage('nonexistent')` → null |
| AC-3 | Anon accessing `/onboard` redirects to sign-in | E2E: `/onboard` anon → 302 `/auth/sign-in` |
| AC-4 | Authed + not onboarded → renders 3-step form | E2E: step 1 visible; Unit: step state machine tests |
| AC-5 | Authed + onboarded → 302 to `/me` | E2E: onboarded → `/me`; Unit: `getOnboardedAt` returns truthy |
| AC-6 | Step 1 → Step 2 navigation | Unit: `OnboardingForm` handleNext advances step |
| AC-7 | Skill persisted to `member_skills` | Integration: `member_skills` row exists after POST |
| AC-8 | Full submit sets `onboarded_at` + awards points | Integration: 204 + `point_awards` row with `key='first_join'` |
| AC-9 | API 204 → frontend redirects to `/me` | Unit: `window.location.href = '/me'` after success |
| AC-10 | Double-call returns 204, no re-award | Integration: second call 204 + `point_awards` count = 1 |
| AC-11 | `pnpm build` passes | CI gate (not a test file) |

---

## Issues Fixed (Test Runner Round 1)

### TR-001: TypeScript narrowing bug in use-onboarding.test.ts

**File:** `apps/web-next/src/lib/use-onboarding.test.ts:214`

**Problem:** `capturedState` was declared as `ReturnType<typeof sim.getState> | null`. After the `.then()` callback that assigns to it, TypeScript incorrectly narrowed the type to `never` instead of `ReturnType<typeof sim.getState>` when using optional chaining (`?.`).

**Fix:** Restructured the test to avoid the narrowing issue. The test now calls `mutateAsync` with `await` and then directly accesses `sim.getState()` without capturing state in a separate variable:

```typescript
// Before (broken):
let capturedState: ReturnType<typeof sim.getState> | null = null;
const capture = sim.mutateAsync({...}).then(() => {
  capturedState = sim.getState();
});
await capture;
expect(capturedState?.isPending).toBe(false); // TS narrows to `never`

// After (fixed):
await sim.mutateAsync({...});
const state = sim.getState();
expect(state.isPending).toBe(false);
```

### TR-002: API fetchLandingPage — Not Applicable

**Finding:** `fetchLandingPage` exists only in:
- `apps/web-next/src/lib/cms.ts` (web-next SSR fetcher)
- `apps/web/src/lib/cms.ts` (v1 web app)

There is **no API-side implementation** of `fetchLandingPage`. The API does not need a test file for this function. The landing page fetch is handled directly by the web-next SSR layer calling Directus.

### TR-003: web-next cms-landing-page.test.ts — Already Exists

**Finding:** `apps/web-next/src/lib/cms-landing-page.test.ts` already exists with 23 unit tests covering:
- Slug normalisation (trim, lowercase)
- Shape guard (regex validation for path traversal, special chars)
- URL params construction
- Row normalisation (snake_case to camelCase)
- Full simulation (valid slug, non-existent slug, invalid slug, network error)

No additional test file needed.

### Additional TypeScript Fixes

**File:** `apps/web-next/src/blocks/customer/OnboardingForm.test.tsx`

**Problem:** Two similar TypeScript errors (`TS2339: Property 'trim' does not exist on type 'never'`) at lines 438 and 463. When `jobTitle: null` was explicitly set in test fixtures, TypeScript inferred it as the literal type `null` instead of `string | null`.

**Fix:** Added explicit type annotations to formState objects where `jobTitle` can be `null`:
```typescript
const formState: {
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  // ...
} = { jobTitle: null, ... };
```
Also changed `formState.jobTitle?.trim() || null` to `(formState.jobTitle ?? '')?.trim() || null` to handle the `string | null` union type correctly.

---

## Gate Result

```
gate: test-design
agent: test-designer
workflow: wf-20260623-feat-015
requirement: FR-MIG-020

files_to_create:
  - apps/api/test/members-onboarding.dto.spec.ts
  - apps/api/test/members-onboarding.service.spec.ts
  - apps/api/test/members-onboarding.integration.spec.ts
  - apps/web-next/src/lib/use-onboarding.test.ts
  - apps/web-next/src/blocks/customer/OnboardingForm.test.tsx
  - apps/e2e/tests/smoke-onboarding.spec.ts

files_already_exist:
  - apps/web-next/src/lib/cms-landing-page.test.ts (23 tests, TR-003 N/A)
  - apps/api has no fetchLandingPage (TR-002 N/A)

issues_fixed:
  - TR-001: Restructured use-onboarding.test.ts state capture
  - OnboardingForm.test.tsx: Added type annotations for nullable fields

status: ready
rubric_score: 8
test_levels: unit + integration + e2e
ac_coverage: all 10 ACs mapped
typecheck: 0 errors
test_results: 566 passed
```
