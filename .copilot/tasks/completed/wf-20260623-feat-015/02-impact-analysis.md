# Impact Analysis — FR-MIG-015

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
