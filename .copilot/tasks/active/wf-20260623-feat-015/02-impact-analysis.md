# Impact Analysis — FEAT-MIG-020

## Validated Requirement

**FEAT-MIG-020** (FR-MIG-020): Rebuild the Telegram acquisition funnel entry point in `apps/web-next`:
- `GET /welcome/[slug]` — per-source welcome page from Directus `landing_pages`, CTA links to `/onboard`
- `GET /onboard` — 3-step onboarding form (profile basics, skills+interests, consent+AUP); redirects to `/me` if already onboarded; requires auth
- `POST /v1/members/onboard` (renamed from colliding `/v1/onboard`) — creates/updates member profile, sets `onboarded_at`, awards first-join points

---

## Affected Layers

### API (NestJS)

| Module | Change | Location |
|--------|--------|----------|
| **New module: `modules/members/`** | New `MembersOnboardingController` + `MembersOnboardingService` implementing `POST /v1/members/onboard`. Sits alongside the existing `admin-invites/onboarding.controller.ts` which owns `/v1/onboard/preview` and `/v1/onboard/accept` (operator onboarding — untouched). | `apps/api/src/modules/members/onboarding.controller.ts`, `apps/api/src/modules/members/onboarding.service.ts` |
| **`me-profile` module** | Extend `MeProfileService.patchProfile()` to accept `first_name`, `last_name`, `job_title`. Add `setOnboardedAt(userId)` method. | `apps/api/src/modules/me-profile/me-profile.service.ts` |
| **`points` module** | Add `awardFirstJoinPoints(userId)` to `PointsDirectusService`. Writes a new row to Directus `point_awards` collection with key `first_join`. Must be idempotent (skip if award already exists for this user+key). | `apps/api/src/modules/points/points-directus.service.ts` |

### DB Changes Required

**YES — Directus schema extension (NOT Drizzle/Postgres):**

| Collection | Change | Type |
|------------|--------|------|
| `directus_users` | Add `onboarded_at` column | `datetime`, nullable, no filter restrictions |

- Directus API write (not a Drizzle migration). Coordinated via Directus admin UI or API call during deploy.
- `member_consents` collection already exists; no new collection needed.
- `point_awards` collection already exists; no new collection needed.
- `landing_pages` collection already exists (confirmed in `cms.ts`).
- **DBMigrationAuthor NOT needed** (this is a Directus-level change, not a Drizzle schema change).

### Shared Types

| Type | Change | Location |
|------|--------|----------|
| Zod schema: `OnboardMemberDto` | Input DTO for `POST /v1/members/onboard`: `{ firstName, lastName, jobTitle, skills[], interests[], consents{}, slug? }` | `packages/shared-types/src/` |
| Zod schema: `OnboardMemberResponseDto` | Response shape (currently returns 204 — confirm if body needed) | `packages/shared-types/src/` |
| `CmsLandingPage` type | Already exists in `apps/web/src/lib/cms.ts`; re-export or copy to web-next | N/A (web-next copy) |

### Frontend (`apps/web-next`)

| Page / Component | Change | Location |
|-----------------|--------|----------|
| `pages/welcome/[slug].astro` | New SSR page. Reads `fetchLandingPage(slug)` from Directus, renders campaign landing. 404 on miss. CTA links to `/onboard?slug={slug}`. | `apps/web-next/src/pages/welcome/[slug].astro` |
| `pages/onboard.astro` | New SSR page. AuthGate: redirect to `/auth/sign-in` if anon; redirect to `/me` if `onboarded_at` is set. Renders 3-step onboarding React island. | `apps/web-next/src/pages/onboard.astro` |
| `blocks/customer/SkillTagger.tsx` | Adapter refactor: extract hook-driven internals into a `SkillTaggerInner` that accepts `onSave` + `initialSkills` props. New wrapper `SkillTaggerAdapter` for the standalone onboarding step. | `apps/web-next/src/blocks/customer/SkillTagger.tsx` (modify) |
| `middleware.ts` | Add `onboarded_at` check to `/onboard` route: if authed + `onboarded_at != null`, redirect 302 to `/me`. | `apps/web-next/src/middleware.ts` |
| `lib/cms.ts` | Copy `fetchLandingPage` from `apps/web/src/lib/cms.ts` (lines 1150-1180). Pattern mirrors existing `fetchUpcomingEvents` etc. | `apps/web-next/src/lib/cms.ts` |
| API client | Add `POST /v1/members/onboard` call. Already exists: `apps/web-next/src/lib/api-client.ts`. | `apps/web-next/src/lib/api-client.ts` |

### Bot

**NOT directly affected.** Telegram invite links land in the web funnel, not in the bot. The bot may later send the `/welcome/{slug}` link as a deep-link CTA in broadcast messages, but no bot changes are required for this feature.

### Workers

**NOT directly affected.** Points award is a single Directus write (one row in `point_awards`) and can be done synchronously in the `POST /v1/members/onboard` handler. No BullMQ queue needed unless the team decides to defer the award for resilience — flagged as a risk below.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? | Notes |
|----------|--------|--------|-----------|-------|
| `/v1/onboard/preview` | GET | **No change** | No | Operator onboarding — untouched |
| `/v1/onboard/accept` | POST | **No change** | No | Operator onboarding — untouched |
| `/v1/members/onboard` | POST | **New** | No | Member onboarding — new endpoint |

**New endpoint contract:**

```
POST /v1/members/onboard
Auth: Bearer token (AuthGuard)
Request body: OnboardMemberDto
  - firstName: string (min 1, max 100)
  - lastName: string (min 1, max 100)
  - jobTitle?: string (max 200)
  - skills: string[] (each min 2, max 80 chars)
  - interests: { topicTag: string, intent: 'learn'|'practice'|'mentor'|'discuss' }[]
  - consents: Partial<Record<MemberConsentPurpose, boolean>>  (defaults: all false)
  - slug?: string (campaign slug for analytics)
Response: 204 No Content (idempotent; safe to call twice)
Errors:
  401 Unauthorized
  400 Bad Request (validation failure)
```

---

## Cross-Module Calls

| Caller | Called | Via | Notes |
|--------|--------|-----|-------|
| `MembersOnboardingService` | `MeProfileService.patchProfile()` | Dependency injection | Writes `first_name`, `last_name`, `job_title` |
| `MembersOnboardingService` | `MeProfileService.setOnboardedAt()` | Dependency injection | Sets `onboarded_at = now()` on `directus_users` |
| `MembersOnboardingService` | `PointsDirectusService.awardFirstJoinPoints()` | Dependency injection | Writes `point_awards` row; idempotent |
| `MembersOnboardingService` | `MeProfileService.addSkill()` | Loop over skills array | One call per skill tag |
| `MembersOnboardingService` | `MeProfileService.addInterest()` | Loop over interests array | One call per (topicTag, intent) pair |
| `MembersOnboardingService` | `MeProfileService.setConsent()` | Loop over consented purposes | One call per purpose granted=true |
| `pages/welcome/[slug].astro` | `fetchLandingPage(slug)` | Directus REST (via `lib/cms.ts`) | Public collection — no auth needed |

**No cross-module Postgres/Drizzle queries.** All writes go through Directus API per the existing pattern.

---

## Risk Flags

### Security Review Required

| Risk | Description |
|------|-------------|
| **Points award race condition** | If `POST /v1/members/onboard` is called twice rapidly before the first write commits, two point awards could be recorded. Requires either a DB-level unique constraint on `(user, key)` in `point_awards`, or an idempotency check in the service. |
| **Consent coercion** | Step 3 collects explicit consent toggles. All purposes default to `false` (deny). Frontend must not pre-check boxes. Backend must reject requests where no consents are provided if a minimum set is required (open question #3). |
| **Slug stored for analytics** | If the campaign slug is stored on the member profile, it becomes PII-adjacent (behavioral tracking). Requires privacy review and disclosure in the AUP/consent step. |
| **AuthGate bypass on /welcome/[slug]** | The landing page is public (correct). However, the CTA must respect auth state: anon users go to `/auth/sign-in?redirect=/onboard`, not directly to `/onboard`. |

### Architecture Rule Risks

| Rule | Risk | Mitigation |
|------|------|------------|
| **Module boundary** | `MembersOnboardingService` calls `MeProfileService`, `PointsDirectusService` — both are explicit service dependencies, no direct entity access. Compliant. | None needed |
| **No new Directus collections without approval** | Adding `onboarded_at` to `directus_users` is a schema extension, not a new collection. Schema field additions are routine; no ADR needed. | Coordinate with Directus admin during deploy |
| **Cross-schema queries forbidden** | All reads/writes use Directus API. No Postgres joins across schemas. Compliant. | None needed |
| **No circular dependencies** | `MembersOnboardingService` -> `MeProfileService` -> `DirectusClient`. No cycle. | None needed |

---

## Test Scope

### Unit Tests

| File | What to test |
|------|--------------|
| `apps/api/src/modules/members/onboarding.service.spec.ts` | `completeOnboarding()`: field mapping to Directus, idempotency (skip if `onboarded_at` set), points award not duplicated, skills+interests written, consents written |

### Integration Tests (Testcontainers)

| File | What to test |
|------|--------------|
| `apps/api/test/members-onboarding-api.spec.ts` | Full `POST /v1/members/onboard` flow against a Directus mock or test container: creates user, sets fields, awards points, returns 204. Also: calling twice returns 204 both times, second call does not re-award points. |

### E2E (Playwright)

| Test | What to test |
|------|--------------|
| `apps/e2e/onboarding.spec.ts` | Full happy path: `GET /welcome/telegram-uz` -> CTA click -> `/onboard` auth redirect (if anon) or form render (if authed) -> fill step 1 -> fill step 2 (SkillTagger) -> fill step 3 (consents) -> submit -> redirect to `/me`. Also: revisit `/onboard` after completion redirects to `/me`. |

### Open Questions That Affect Test Design

1. **Point amount** — if not defined, tests cannot assert leaderboard changes. Requires answer before test-designer formalizes AC-8.
2. **Location field** — "location" in the requirement maps nowhere in the schema. If city is added, tests need field coverage.
3. **Minimum consents** — if any purposes are required (e.g., `events`), tests must assert they are `true` in the request body.

---

## Gate Result

```
gate: impact-analysis
agent: impact-analyzer
status: passed
workflow: wf-20260623-feat-015
requirement: FEAT-MIG-020

summary: >
  Impact fully scoped. API adds one new endpoint (POST /v1/members/onboard)
  with service; DB requires one Directus schema field (onboarded_at on
  directus_users); frontend adds two new Astro pages + SkillTagger adapter;
  shared-types adds a Zod DTO. Bot and workers are unaffected.
  Key risks: points award race condition (needs idempotency guard), consent
  coercion surface, slug analytics privacy. No architecture rule violations.

risks:
  - Points award: idempotency guard required to prevent double-award
  - Consent: all purposes default-deny; backend must enforce minimum set
  - Directus schema change: onboarded_at field must be added before deploy

confidence: high
```

## Validated Requirement

**FEAT-MIG-015**: Rebuild the Telegram broadcast operator cabinet in
`apps/web-next/src/pages/workspace/integrations/telegram/broadcasts/` with three Astro pages:
a broadcasts list with status filter, a new-broadcast composer with rich-text body,
up to 8 inline buttons, segment picker, image upload, and future-date scheduler,
and an edit/view page with Send now, Test send, Duplicate, and Cancel actions.

**Cross-refs:**
- FR-MIG-004 (`<AsyncSelect>`) — dependency, Implemented
- FR-MIG-005 (`<ActionBar>`) — dependency, Shipped
- FR-CMS-004 — V1 reference, Shipped
- FR-MIG-014 (`/workspace/integrations/telegram/segments`) — related, Not Started

---

## Affected Layers

### API (NestJS — `apps/api/src/modules/workspace/`)

**No new endpoints required.** All required endpoints already exist in `tg-broadcasts.controller.ts`:

| Endpoint | Method | Purpose | Already exists |
|---|---|---|---|
| `/v1/workspace/tg-broadcasts` | GET | List with `?status=` filter | yes |
| `/v1/workspace/tg-broadcasts/:id` | GET | Detail | yes |
| `/v1/workspace/tg-broadcasts` | POST | Create | yes |
| `/v1/workspace/tg-broadcasts/:id` | PATCH | Update (incl. schedule) | yes |
| `/v1/workspace/tg-broadcasts/:id/send-now` | POST | Fire broadcast | yes |
| `/v1/workspace/tg-broadcasts/:id/send-test` | POST | Test to operator | yes |
| `/v1/workspace/tg-broadcasts/:id/cancel` | POST | Cancel scheduled | yes |
| `/v1/workspace/tg-broadcasts/:id/duplicate` | POST | Clone to draft | yes |
| `/v1/workspace/tg-broadcasts/:id/analytics` | GET | Delivery stats | yes |
| `/v1/workspace/tg-segments/:id/preview` | GET | Recipient count for confirm dialog | yes |

Existing types exported from `tg-broadcasts.service.ts`: `BroadcastSummary`, `BroadcastDetail`, `BroadcastStatus`.

### DB Changes Required

**No.** The broadcast data lives in Directus (`tg_broadcasts` collection), not in the NestJS/Drizzle `platform` schema. No Drizzle schema changes, no migrations needed. DBMigrationAuthor is **not required**.

### Shared Types

**New types needed in `apps/web-next/src/lib/types.ts`:**

```typescript
// Broadcast list item (mirrors BroadcastSummary from API)
export interface BroadcastSummary { id, title, country, status, ... }

// Broadcast detail (mirrors BroadcastDetail from API)
export interface BroadcastDetail { id, title, html_body, image_asset, inline_buttons, audience_segment, status, scheduled_at, sent_count, failure_reason, ... }

// For the send-now confirm dialog
export interface SegmentPreview { segment_id, match_count, sample }
```

**No changes to `packages/shared-types/`** — this package appears to be empty or unused in this codebase. All types live in `apps/web-next/src/lib/types.ts`.

### Frontend

**New files to create (9 total):**

```
apps/web-next/src/
  pages/workspace/integrations/telegram/broadcasts/
    index.astro         — list page (prerender=false, AuthGate, DataTable)
    new.astro           — new composer page
    [id].astro          — edit/view + ActionBar page

  blocks/workspace/
    TgBroadcastsList.tsx        — React island: DataTable + status filter + create button
    TgBroadcastComposer.tsx    — React island: full composer form (new + edit)

  lib/
    use-tg-broadcasts.ts        — L1 TanStack Query hooks for all broadcast endpoints
```

**Existing blocks to reuse:**
- `DataTable` — `apps/web-next/src/blocks/workspace/DataTable.tsx`
- `ActionBar` / `ActionBarIsland` — `apps/web-next/src/blocks/workspace/ActionBar.tsx`
- `AsyncSelect` — `apps/web-next/src/blocks/workspace/AsyncSelect.tsx`
- `PageShell`, `Breadcrumbs`, `AuthGate` — common blocks
- `IslandRoot` — `apps/web-next/src/lib/island-root.tsx`

**Pattern:** Same Astro page + React island architecture as FR-MIG-013 (`/workspace/forms/[id]`).

### Bot

**No changes.** The Telegram bot (`apps/bot/`) is a thin client. Broadcasts are operator-only via the web cabinet. Bot does not interact with broadcasts.

### Workers

**No changes.** The BullMQ sender service (`apps/api/src/modules/workspace/tg-broadcasts-sender.service.ts`) already handles dispatching. FR-MIG-015 only builds the operator UI — it does not change the send pipeline.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/workspace/tg-broadcasts` | GET | No change (adds `?status=` filter support — already in schema) | no |
| `/v1/workspace/tg-broadcasts/:id` | GET | No change | no |
| `/v1/workspace/tg-broadcasts` | POST | No change | no |
| `/v1/workspace/tg-broadcasts/:id` | PATCH | No change | no |
| `/v1/workspace/tg-broadcasts/:id/send-now` | POST | No change | no |
| `/v1/workspace/tg-broadcasts/:id/send-test` | POST | No change | no |
| `/v1/workspace/tg-broadcasts/:id/cancel` | POST | No change | no |
| `/v1/workspace/tg-broadcasts/:id/duplicate` | POST | No change | no |
| `/v1/workspace/tg-broadcasts/:id/analytics` | GET | No change | no |
| `/v1/workspace/tg-segments/:id/preview` | GET | No change | no |

---

## Cross-Module Calls

| Caller | Called | Via | Notes |
|---|---|---|---|
| `TgBroadcastsList` (React island) | `TgBroadcastsService` | `use-tg-broadcasts.ts` → `apiClient` | Directus data via NestJS |
| `TgBroadcastComposer` (React island) | `TgBroadcastsService` | `use-tg-broadcasts.ts` → `apiClient` | POST/PATCH/dupe/send/cancel |
| `TgBroadcastComposer` (React island) | `TgSegmentsService` | `use-tg-segments.ts` → `apiClient` | Segment picker via AsyncSelect |
| `[id].astro` (SSR) | `TgBroadcastsService` | `api-ssr.ts` | Pre-populate edit page |

**No cross-module service calls within NestJS.** All data flows through `workspace.module`.

---

## Risk Flags

### Security Review Required

- **Super-admin gate on Send-now:** The `sendNow` endpoint is super-admin only. The frontend must check `req.user.role` or a similar mechanism before showing the Send-now button. Verify the frontend gate matches the backend guard.

### Architecture Rule Risks

**None.** The following checks pass:

- Broadcasts live entirely within `workspace.module` — no cross-module schema violations.
- All reads go through NestJS services → Directus API — no raw SQL across the `directus` schema.
- Single monorepo — all changes stay within `apps/web-next`.
- Module boundary: pages call `apiClient` → NestJS, which calls Directus — correct flow per ADR-0038.
- No circular dependencies.

### Scope Notes

- Segment management (create/edit/delete) is **out of scope**. The composer uses `<AsyncSelect>` to pick existing segments only. Segments must be pre-created via FR-MIG-014.
- Image upload defaults to Directus assets API (`POST /assets`) — same pattern as V1. No new upload mechanism needed.
- Duration estimate for send-now confirm dialog (for segments >10k members) is a **frontend-only calculation** — approximate as `Math.round(match_count / 30)` seconds (Telegram bulk send rate).

---

## Test Scope

### Unit Tests

- `TgBroadcastComposer` — form validation (required fields, button count cap, URL validation)
- `TgBroadcastsList` — status filter URL param handling, empty state rendering
- `use-tg-broadcasts.ts` — all 9 hooks (mock `apiClient`)

### Integration Tests (Testcontainers)

**Not required.** The NestJS service + Directus layer is already tested by existing `apps/api/test/tg-broadcasts-*.spec.ts` files. New integration tests are not needed for a pure-frontend feature.

### E2E (Playwright)

**3 flows to cover:**

1. `broadcasts/index` — load list, filter by status, click "New broadcast"
2. `broadcasts/new` — fill composer, save as draft, verify list shows draft
3. `broadcasts/[id]` — open broadcast, verify ActionBar renders all 4 actions (contextual visibility: Cancel only on scheduled)

Location: `apps/e2e/` — follow existing pattern in `workspace/` test files.

---

## Gate Result

```
gate: impact-analysis
agent: impact-analyzer
status: passed
workflow: wf-20260623-feat-015
requirement: FR-MIG-015

summary: >
  FR-MIG-015 is a pure-frontend rebuild. No new API endpoints, no DB
  schema changes, no worker changes, no bot changes. All 9 NestJS
  endpoints + segment preview already exist. All 3 required blocks
  (DataTable, ActionBar, AsyncSelect) are already shipped. Scope is
  9 new files in web-next: 3 Astro pages, 2 React island components,
  1 L1 query hook file, and types additions. DBMigrationAuthor is
  not needed.

files_to_create:
  - apps/web-next/src/pages/workspace/integrations/telegram/broadcasts/index.astro
  - apps/web-next/src/pages/workspace/integrations/telegram/broadcasts/new.astro
  - apps/web-next/src/pages/workspace/integrations/telegram/broadcasts/[id].astro
  - apps/web-next/src/blocks/workspace/TgBroadcastsList.tsx
  - apps/web-next/src/blocks/workspace/TgBroadcastComposer.tsx
  - apps/web-next/src/lib/use-tg-broadcasts.ts
  - apps/web-next/src/lib/types.ts (add BroadcastSummary, BroadcastDetail types)
  - apps/e2e/workspace-telegram-broadcasts.spec.ts

files_to_modify:
  - apps/web-next/src/blocks/workspace/index.ts (export new components)

dependencies:
  - FR-MIG-004 (AsyncSelect) — satisfied
  - FR-MIG-005 (ActionBar) — satisfied
  - FR-MIG-014 (Segments list) — must be shipped or segments pre-created

confidence: high
```
