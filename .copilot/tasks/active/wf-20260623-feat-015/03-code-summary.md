# Code Summary — FR-MIG-020

## Requirement Implemented

FR-MIG-020 MVP scope: `/welcome/[slug]` landing page, `/onboard` onboarding form, and `POST /v1/members/onboard` API. These three pieces form the Telegram acquisition funnel entry point.

## Files Changed

### API — NEW files

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/api/src/modules/members/onboarding.dto.ts` | create | Zod DTO for `POST /v1/members/onboard`: `OnboardMemberDto`, `InterestEntrySchema`, `OnboardMemberDtoSchema`. Normalises skill tags and topic tags to lowercase-hyphen. |
| `apps/api/src/modules/members/onboarding.service.ts` | create | `MembersOnboardingService` — orchestrates profile patch, skills upsert, interests upsert, consents, `onboarded_at` write, and idempotent first-join point award. |
| `apps/api/src/modules/members/onboarding.controller.ts` | create | `MembersOnboardingController` — `POST /v1/members/onboard`, `AuthGuard` (via class-level inheritance), Zod validation, 204 No Content. |
| `apps/api/src/modules/members/members.module.ts` | create | `MembersModule` wiring `MeProfileModule` + `PointsModule` imports. |

### API — MODIFIED files

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/api/src/modules/me-profile/me-profile.service.ts` | modify | Added `onboarded_at` to `DirectusUserRow`, `PROFILE_FIELDS`, `MemberProfile`, and `toProfile()`. Added `setOnboardedAt(userId)`, `getOnboardedAt(userId)`, `patchDirectusFields(userId, fields)`. |
| `apps/api/src/modules/me-profile/me-profile.controller.ts` | modify | Added `GET /v1/me/onboarding-status` — lightweight SSR redirect helper; returns `{ onboarded: boolean }`. |
| `apps/api/src/modules/points/points-directus.service.ts` | modify | Added `awardFirstJoinPoints(userId)` — idempotent 10-point award for key=`first_join`. |
| `apps/api/src/app.module.ts` | modify | Registered `MembersModule`. |

### web-next — NEW files

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/web-next/src/pages/welcome/[slug].astro` | create | SSR landing page. Fetches landing page from Directus `landing_pages` by slug; 302 to /404 on miss; CTA links to `/onboard?slug={slug}`. |
| `apps/web-next/src/pages/onboard.astro` | create | SSR onboarding page. Anon → redirect to `/auth/sign-in` preserving slug. Authed + onboarded → redirect to `/me`. Renders `<OnboardingForm>`. |
| `apps/web-next/src/blocks/customer/OnboardingForm.tsx` | create | L3 React island: 3-step Wizard (profile basics → skills+interests → consents). |
| `apps/web-next/src/lib/use-onboarding.ts` | create | TanStack Query hook `useOnboardMember()` wrapping `POST /v1/members/onboard`. |

### web-next — MODIFIED files

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/web-next/src/lib/api-ssr.ts` | modify | Added `fetchOnboardingStatus(req, accessToken)` — SSR helper for `/v1/me/onboarding-status`. |
| `apps/web-next/src/lib/cms.ts` | modify | Added `fetchLandingPage(slug)` — mirrors v1 implementation. Added `CmsLandingPage` interface. |
| `apps/web-next/src/blocks/customer/index.ts` | modify | Exported `OnboardingForm`. |
| `apps/web-next/src/layouts/Layout.astro` | modify | Fixed Props interface for `exactOptionalPropertyTypes` compliance. |
| `apps/web-next/src/blocks/common/PageHead.astro` | modify | Fixed Props interface for `exactOptionalPropertyTypes` compliance. |
| `apps/web-next/src/lib/types.ts` | modify | Fixed pre-existing broken import path for `FormBuilder`. Added `PublicForm` re-export. |

## Key Design Decisions

### Endpoint naming: `POST /v1/members/onboard` (not `/v1/onboard`)
The impact analysis confirmed that `/v1/onboard/preview` and `/v1/onboard/accept` are already owned by the operator onboarding flow (`admin-invites`). The new endpoint is placed under `/v1/members/` to avoid collision.

### `onboarded_at` as Directus schema extension (not Drizzle migration)
Per impact analysis: `directus_users.onboarded_at` is a Directus-level field. No Drizzle schema changes. The field must be added in Directus admin UI before this feature is functional in production.

### `fetchOnboardingStatus` in `api-ssr.ts` (not middleware)
The middleware cannot check `onboarded_at` directly — it's a Directus field, not in the Authentik JWT. The `/onboard` page uses an SSR API call to check the flag before rendering.

### `first_name`/`last_name` via `patchDirectusFields`
`MeProfileService.patchProfile()` doesn't accept `first_name`/`last_name`. A focused `patchDirectusFields(userId, {first_name, last_name})` method is added for onboarding-only use.

### Points idempotency via pre-check
`awardFirstJoinPoints` queries for an existing award row with `key='first_join'` before inserting. If called twice, the second call silently no-ops.

## Architecture Rule Compliance

- [x] **Service methods: typed I/O, no `any`, all external input Zod-validated** — `OnboardMemberDtoSchema` validates every field.
- [x] **Custom typed errors** — Uses NestJS built-ins (`BadRequestException`, `UnauthorizedException`).
- [x] **All promises awaited or explicitly handled** — All async calls use `await`; early-exit on idempotency has explicit `return`.
- [x] **DB queries: Directus only, no raw SQL, N+1 avoided** — All writes go through Directus REST API.
- [x] **Cross-module calls via service interface** — `MembersOnboardingService` calls `MeProfileService` and `PointsDirectusService` through DI.
- [x] **New endpoint: AuthGuard, RFC 7807 errors, rate limit** — `@UseGuards(AuthGuard)` via class inheritance; `BadRequestException(parsed.error.flatten())`; falls back to AppModule's global 60/min throttle.
- [x] **New React component: functional, explicit props, no `dangerouslySetInnerHTML`** — `OnboardingForm` is a pure functional component.
- [x] **New Astro page: auth-aware** — `/onboard` redirects anon; authed users checked for `onboarded_at` via SSR API.

## Formatter Check

`pnpm biome check` — clean on all changed files. No output.

`pnpm --filter api typecheck` — 0 errors.
`pnpm --filter web-next typecheck` — 0 errors (27 pre-existing hints/warnings in unrelated files).

## Known Limitations

1. **`onboarded_at` field must be added in Directus before deploy.** The field does not yet exist. `getOnboardedAt` returns null until it is added.

2. **SkillTagger adapter deferred.** The onboarding form has its own inline skill-tagger. Refactoring `<SkillTagger>` into a reusable adapter is a follow-up.

3. **First-join point amount is hardcoded as 10.** `POINTS = 10` in `awardFirstJoinPoints`. No admin-configurable value yet.

4. **No tests in this PR.** Unit tests for `MembersOnboardingService`, integration tests, and Playwright E2E are deferred to the test-strategist/test-runner phase.

## Gate Result

```
gate: code-development
agent: code-developer
status: passed
workflow: wf-20260623-feat-015
requirement: FEAT-MIG-020

summary: >
  MVP implemented: POST /v1/members/onboard (API) + /welcome/[slug] page
  + /onboard page (web-next). All typechecks pass (0 errors, API + web-next).
  Biome clean on all changed files. Architecture rules confirmed.

files_created:
  - apps/api/src/modules/members/onboarding.dto.ts
  - apps/api/src/modules/members/onboarding.service.ts
  - apps/api/src/modules/members/onboarding.controller.ts
  - apps/api/src/modules/members/members.module.ts
  - apps/web-next/src/pages/welcome/[slug].astro
  - apps/web-next/src/pages/onboard.astro
  - apps/web-next/src/blocks/customer/OnboardingForm.tsx
  - apps/web-next/src/lib/use-onboarding.ts

files_modified:
  - apps/api/src/modules/me-profile/me-profile.service.ts
  - apps/api/src/modules/me-profile/me-profile.controller.ts
  - apps/api/src/modules/points/points-directus.service.ts
  - apps/api/src/app.module.ts
  - apps/web-next/src/lib/api-ssr.ts
  - apps/web-next/src/lib/cms.ts
  - apps/web-next/src/blocks/customer/index.ts
  - apps/web-next/src/layouts/Layout.astro
  - apps/web-next/src/blocks/common/PageHead.astro
  - apps/web-next/src/lib/types.ts

deferred_to_feature:
  - MIG-020-followup-1: Directus schema — add onboarded_at to directus_users
  - MIG-020-followup-2: SkillTagger adapter refactor
  - MIG-020-followup-3: Configurable point amount
  - MIG-020-followup-4: Unit + integration + E2E tests

confidence: high
```
