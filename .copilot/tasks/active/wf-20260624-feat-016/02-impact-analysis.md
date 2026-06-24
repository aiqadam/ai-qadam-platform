# Impact Analysis — FR-MIG-021

## Validated Requirement

**FEAT-MIG-021:** `/checkin` — event-day QR check-in page for event operators.

- New Astro page in `apps/web-next` with React island
- QR scanning via `@zxing/browser` + manual code entry fallback
- Event selection dropdown for operators
- Offline queue in `localStorage`
- New API endpoint `POST /v1/registrations/:token/checkin` with event validation
- Returns member name + avatar on success
- Error handling: not registered, already checked in, wrong event

---

## Affected Layers

### API (NestJS)

| File | Change |
|------|--------|
| `apps/api/src/modules/registrations/checkin.controller.ts` | Add new controller at `v1/registrations/:token/checkin` with `eventId` body param; remove `ParseUUIDPipe` constraint (token is the `checkin_code` UUID from registrations) |
| `apps/api/src/modules/registrations/registrations-directus.service.ts` | Modify `checkin()` method to accept optional `eventId` param; throw new `WrongEventError` when token exists but belongs to a different event; enrich return type with member info (name, avatar) |
| `apps/api/src/modules/registrations/registrations.module.ts` | Register new controller if separate, or add route to existing `CheckinController` |

**No new module needed** — all changes stay within the existing `RegistrationsModule`.

### DB Changes Required

**No.** Uses existing Directus tables:
- `registrations` — read existing rows, update `status='attended'`, `checked_in_at`
- `directus_users` — read member `first_name`, `last_name`, `avatar` for enriched response
- No schema migration, no new tables

### Shared Types

| File | Change |
|------|--------|
| `apps/web-next/src/lib/types.ts` | Add `CheckinResponse` interface with `member: { name, avatar }`, `event`, `alreadyCheckedIn`, `checkedInAt`; add `CheckinRequest` body type |
| `packages/shared-types/` | Optionally add Zod schemas for cross-repo type sharing (currently not in use for this API surface) |

### Frontend

| File | Change |
|------|--------|
| `apps/web-next/src/pages/checkin.astro` | New SSR page; fetches active events via SSR; handles `?code=` query param for self-serve mode |
| `apps/web-next/src/blocks/checkin/CheckinOperator.tsx` (new) | React island: event dropdown, QR scanner via `@zxing/browser`, manual entry field, success/error display, offline indicator |
| `apps/web-next/src/lib/use-checkin.ts` (new) | TanStack Query mutation hook for `POST /v1/registrations/:token/checkin` |
| `apps/web-next/src/lib/api-client.ts` | No changes (already covers all HTTP verbs) |
| `apps/web-next/package.json` | Add `@zxing/browser` dependency |

**UI Pattern:** Follows the same structure as `apps/web-next/src/pages/forms/[slug].astro` — Astro page as shell, React island as interactive component (`client:load`).

### Bot

**Not affected.** Existing `POST /v1/checkin/:code` endpoint remains for Telegram bot compatibility.

### Workers

**Not affected.**

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|----------|--------|--------|-----------|
| `POST /v1/checkin/:code` | Post | No change — remains for Telegram bot | No |
| `POST /v1/registrations/:token/checkin` | Post | **New** — accepts `{ eventId: string }` body; validates token belongs to event; returns member info | No (new endpoint) |
| `GET /v1/registrations/member?code=<token>` | Get | Not needed — member info embedded in checkin response | N/A |

**Request shape:**
```typescript
// POST /v1/registrations/:token/checkin
Body: { eventId: string }
```

**Response shape:**
```typescript
interface CheckinResponse {
  status: 'ok';
  alreadyCheckedIn: boolean;
  checkedInAt: string;
  member: {
    name: string;       // "First Last"
    avatar: string | null;
  };
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location: string | null;
  };
}
```

**Error responses:**
- `400 Bad Request` — `WrongEventError` ("this ticket is for a different event: [title]")
- `400 Bad Request` — `CheckinIneligibleError` (cancelled, waitlisted)
- `404 Not Found` — `CheckinNotFoundError` (unknown code)

---

## Cross-Module Calls

| Caller | Called | Via | Notes |
|--------|--------|-----|-------|
| `RegistrationsDirectusService` | Directus API | HTTP | Reads `directus_users` for member name + avatar enrichment. No cross-module NestJS call needed. |
| Frontend page | `GET /v1/workspace/events` (existing) | `useWorkspaceEvents()` | To populate the operator event dropdown with active events |
| Frontend island | `POST /v1/registrations/:token/checkin` | TanStack mutation | New endpoint call |

**No cross-module service calls within NestJS.** The registrations module reads member data directly from Directus (same pattern as existing `BadgeAwarderService` / `DirectusUsersBridgeService`).

---

## Risk Flags

### Security Review Required

| Risk | Assessment |
|------|------------|
| Check-in authentication | **Open by design** — physical possession of QR code is the auth mechanism (matches existing `POST /v1/checkin/:code`). No change to security posture. |
| Event validation | Adding event ownership check prevents cross-event check-in abuse. Low risk — returns 400, no data leakage. |
| Offline queue | `localStorage` stores `{ code, eventId, queuedAt }`. No PII beyond token (which is already publicly accessible via QR). Low risk. |
| Member avatar exposure | Enriching check-in response with member name + avatar is new. Both fields are already public on member profiles. No new PII exposure. |

### Architecture Rule Risks

| Rule | Status | Notes |
|------|--------|-------|
| Module boundaries | **Compliant** | All DB access via `RegistrationsDirectusService`; no cross-module entity queries |
| No raw fetch outside lib/ | **Compliant** | TanStack Query hook + `apiClient()` pattern followed |
| REST conventions | **Compliant** | New endpoint follows `/v1/resources/:id/action` pattern |
| TanStack Query for server state | **Compliant** | Mutation hook wraps API call |
| Astro + React island pattern | **Compliant** | Matches `forms/[slug].astro` template |

---

## Test Scope

| Test Type | Scope | Location |
|-----------|-------|----------|
| Unit | `CheckinController` — validates `eventId` param, error mapping; `RegistrationsDirectusService.checkin()` — event mismatch path, member enrichment | `apps/api/src/modules/registrations/*.test.ts` |
| Integration | Check-in flow with Directus mocked — token lookup, status update, event validation, member enrichment | `apps/api/src/modules/registrations/*.integration.test.ts` (if existing pattern) |
| E2E (Playwright) | `/checkin` page: event dropdown, QR scanner (mocked camera), manual entry, success display, offline queue indicator | `apps/e2e/checkin.spec.ts` |

**No DB migration tests** — Directus schema unchanged.

---

## Gate Result

```yaml
gate: impact-analyzer
workflow_id: wf-20260624-feat-016
requirement: FR-MIG-021
result: passed
affected_layers:
  api:
    - apps/api/src/modules/registrations/checkin.controller.ts (new route)
    - apps/api/src/modules/registrations/registrations-directus.service.ts (event validation + member enrichment)
  frontend:
    - apps/web-next/src/pages/checkin.astro (new)
    - apps/web-next/src/blocks/checkin/CheckinOperator.tsx (new island)
    - apps/web-next/src/lib/use-checkin.ts (new hook)
  dependencies:
    - apps/web-next/package.json (@zxing/browser)
  types:
    - apps/web-next/src/lib/types.ts (CheckinResponse, CheckinRequest)
db_changes: none
api_changes:
  - "POST /v1/registrations/:token/checkin (new, non-breaking)"
  - "POST /v1/checkin/:code (unchanged, Telegram bot)"
cross_module_calls:
  - "RegistrationsDirectusService → Directus API (member avatar enrichment)"
  - "Frontend → GET /v1/workspace/events (existing hook)"
risk_flags:
  - security: low (open-by-design checkin, no new PII exposure)
  - architecture: compliant
test_scope:
  unit: checkin.controller + registrations-directus.service
  integration: checkin flow with mocked Directus
  e2e: /checkin page (Playwright)
review_required: false
```

**Impact analysis complete.** All components identified. Ready for CodeDeveloper.
