# Requirement Validation — FR-MIG-015

## Raw Input

**FR-MIG-015**: `/workspace/integrations/telegram/broadcasts` — list + composer + actions
**Phase**: Rebuild M2
**Status**: Not Started

Three Telegram broadcast pages: the list, the new-broadcast composer, and the per-broadcast detail/action view.

**Functional scope per the FR:**
1. `broadcasts/index.astro` — `<DataTable>` of broadcasts with status filter (draft/scheduled/sending/sent/failed).
2. `broadcasts/new.astro` — full composer: rich-text body, image upload, up to 8 inline buttons (text + URL pairs), segment picker via `<AsyncSelect>`, schedule-for-future datetime picker.
3. `broadcasts/[id].astro` — read view with `<ActionBar>`: Send now (super-admin, with confirm + recipient count), Test send, Duplicate, Cancel (scheduled only).
4. Send-now shows estimated duration warning if segment > 10k members.
5. Status transitions shown inline: draft → scheduled → sending → sent/failed.

**Acceptance criteria:**
- [ ] Composing a broadcast with a body + segment + scheduled time saves as `status=scheduled`.
- [ ] "Send now" confirm dialog shows recipient count and estimated duration.
- [ ] Failed broadcast shows retry option.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

**Depends on:** FR-MIG-004 (`<AsyncSelect>`), FR-MIG-005 (`<ActionBar>`).
**Related:** FR-CMS-004 (broadcast composer application FR — V1 shipped).

---

## Analysis

### Completeness Issues Found

**Issue 1 — Segment management gap (medium).**
The FR calls for a "segment picker via `<AsyncSelect>`" in the composer but says nothing about creating, editing, or deleting audience segments. The V1 reference (`apps/web/src/components/workspace/TgBroadcastComposer.tsx`) uses `audience_segment` as a free-text UUID field — there is no UI for managing segments. FR-MIG-015 should either:
- Document that segment management is out of scope (segments must be created elsewhere), or
- Define a minimal inline segment picker that also creates segments.
**Resolution:** Given that `AsyncSelect` already exists (`apps/web-next/src/blocks/workspace/AsyncSelect.tsx`), the composer can use it to pick an existing segment. Segment creation is assumed out of scope for this FR. This is a `needs-clarification` flag — not blocking.

**Issue 2 — Image upload mechanism (low).**
The FR says "image upload" without specifying the upload mechanism. V1 uses Directus assets API (`image_asset` field is a UUID referencing a Directus file). The FR should clarify whether this rebuild uses the same Directus asset flow or a different upload path. **Resolution:** Assume Directus asset API (same as V1) — this is the standard asset upload pattern across the codebase. Not blocking.

**Issue 3 — "Read view" ambiguity (low).**
The FR says `broadcasts/[id].astro` is a "read view with `<ActionBar>`". In V1, `[id].astro` is the edit composer (it mounts `TgBroadcastComposer` in `mode="edit"`). The "read view" language likely means a view that shows broadcast state + actions, not a pure read-only display. **Resolution:** Implement `[id].astro` as the edit/view page, matching V1 behavior. Confirmed by existing V1 `[id].astro` pattern.

**Issue 4 — "Failed broadcast shows retry option" (low).**
The acceptance criteria says failed broadcasts should show a retry option, but the functional scope does not define it. In V1, the retry flow is: fix the draft content, then click "Send now" again. There is no dedicated "Retry" button — the send-now action itself is the retry. **Resolution:** Interpret "retry option" as "Send now is available on failed broadcasts so the operator can re-attempt". Not blocking.

**Issue 5 — Status filter for list (low).**
The functional scope says "status filter (draft/scheduled/sending/sent/failed)" but does not specify UI — a dropdown, URL params, or tabs. **Resolution:** Use URL query params (`?status=sent`) and a status dropdown filter chip, consistent with `DataTable` consumers in the workspace.

### Conflicts with Existing Features

**No conflicts found.** The following checks were performed:
- `FR-CMS-004` (Telegram broadcast composer V1) — this FR is the rebuild of CMS-004 in web-next. No conflict.
- `FR-MIG-004` (`<AsyncSelect>`) — status: Implemented in `apps/web-next/src/blocks/workspace/AsyncSelect.tsx`. Dependency is satisfied.
- `FR-MIG-005` (`<ActionBar>`) — status: Shipped in `apps/web-next/src/blocks/workspace/ActionBar.tsx`. Dependency is satisfied.
- `FR-MIG-013` (`/workspace/forms/[id]`) — same pattern (page + `<FormBuilder>` + `<ActionBar>`). No overlap with broadcast pages.
- `FR-MIG-014` (`/workspace/integrations/telegram/segments`) — the segments list page. `broadcasts/new.astro` references a segment picker but does not implement segment management. No conflict.
- `FR-MIG-019` — public form renderer. Unrelated.
- API endpoints in `apps/api/src/modules/workspace/tg-broadcasts.controller.ts` — all 6 endpoints exist (list, detail, create, update, send-now, send-test, cancel, duplicate, analytics). No new endpoints needed.
- API endpoints for segments (`apps/api/src/modules/workspace/tg-segments.controller.ts`) — `GET /v1/workspace/tg-segments` and `GET /v1/workspace/tg-segments/:id/preview` exist. No new segment endpoints needed.

### Architectural Feasibility

**Fully feasible.** The following conditions are met:

- **Frontend stack:** Astro 5 + React 19 islands (web-next). All required blocks (`DataTable`, `ActionBar`, `AsyncSelect`) exist in `apps/web-next/src/blocks/workspace/`. No missing primitives.
- **API layer:** NestJS workspace controller (`tg-broadcasts.controller.ts`) handles all CRUD + actions. No new backend endpoints required.
- **Module boundaries:** Broadcasts live in `workspace.module`. Segments are fetched via `tg-segments.controller.ts`. No cross-module schema violations.
- **No cross-schema queries:** All reads go through NestJS services → Directus API. No raw SQL across the `directus` schema.
- **Single monorepo:** All changes stay within `apps/web-next` + `packages/shared-types` if needed. No cross-repo dependencies.
- **Authentication:** Workspace pages use existing `AuthGuard` (operator role). No new auth endpoints needed.

---

## Formalized Requirement

**Feature ID:** `FEAT-MIG-015`
**Cross-refs:**
- FR-MIG-004 (`<AsyncSelect>`) — dependency, Implemented
- FR-MIG-005 (`<ActionBar>`) — dependency, Shipped
- FR-CMS-004 — V1 reference, Shipped
- FR-MIG-014 (`/workspace/integrations/telegram/segments`) — related, Not Started

**Statement:**
> Rebuild the Telegram broadcast operator cabinet in `apps/web-next/src/pages/workspace/integrations/telegram/broadcasts/` with three Astro pages: a broadcasts list with status filter, a new-broadcast composer with rich-text body, up to 8 inline buttons, segment picker, image upload, and future-date scheduler, and an edit/view page with Send now, Test send, Duplicate, and Cancel actions. Send-now confirmation shows recipient count and estimated Telegram delivery duration. Status transitions (draft → scheduled → sending → sent/failed) are displayed inline.

**Assumptions (flagged `needs-clarification`):**
1. Segment management (create/edit/delete) is out of scope; the picker only selects existing segments. Segment IDs are entered via `<AsyncSelect>` pointing to `/v1/workspace/tg-segments`.
2. Image upload uses Directus assets API (`POST /assets` + storing returned file ID as `image_asset` UUID), consistent with the V1 pattern.
3. The `[id].astro` page is an edit/view hybrid (same as V1 `mode="edit"`), not a read-only detail page.
4. "Retry" on a failed broadcast means re-using the Send now action — no dedicated retry button.
5. Status filter uses URL query params (`?status=sent`).

---

## Acceptance Criteria (draft)

- **AC-1:** `GET /workspace/integrations/telegram/broadcasts` renders a `<DataTable>` of broadcast rows with columns: Title, Country, Status chip, Scheduled, Sent, Created, Actions. Status dropdown filter narrows the list.
- **AC-2:** `GET /workspace/integrations/telegram/broadcasts/new` renders a composer with: Title input, Body textarea (Telegram-safe HTML), up to 8 inline button rows (label + URL, add/remove), `<AsyncSelect>` segment picker, datetime-local schedule picker, Recurrence select (none/weekly/monthly), Save as Draft and Save + Schedule buttons.
- **AC-3:** Submitting the composer with "Save + Schedule" sets `status=scheduled` and `scheduled_at` in the database via `POST /v1/workspace/tg-broadcasts` or `PATCH /v1/workspace/tg-broadcasts/:id`.
- **AC-4:** `GET /workspace/integrations/telegram/broadcasts/[id]` renders the same composer pre-populated from `GET /v1/workspace/tg-broadcasts/:id` with an `<ActionBar>` containing: Save, Test to Me, Send now (super-admin), Duplicate, Cancel (scheduled only).
- **AC-5:** Clicking "Send now" triggers a confirmation dialog showing recipient count (from `GET /v1/workspace/tg-segments/:id/preview`) and estimated Telegram drain time. On confirm, calls `POST /v1/workspace/tg-broadcasts/:id/send-now`.
- **AC-6:** On a failed broadcast, "Send now" is still available so the operator can re-attempt.
- **AC-7:** Clicking "Duplicate" calls `POST /v1/workspace/tg-broadcasts/:id/duplicate`, then navigates to the new draft.
- **AC-8:** Clicking "Cancel" (on a scheduled broadcast) calls `POST /v1/workspace/tg-broadcasts/:id/cancel` after browser confirm.
- **AC-9:** Status chip transitions: draft (gray) → scheduled (blue) → sending (amber) → sent (green) or failed (red).
- **AC-10:** `pnpm arch:check` + `astro check` + `pnpm build` pass without errors.

---

## Gate Result

```
gate: requirement-validation
agent: requirement-analyst
status: passed
workflow: wf-20260623-feat-015
requirement: FR-MIG-015

summary: >
  FR-MIG-015 is architecturally feasible. All three required blocks
  (DataTable, ActionBar, AsyncSelect) exist in apps/web-next. The
  full NestJS API surface (6 endpoints + segments preview) is already
  implemented. No conflicts with existing FRs. Two medium items
  require no new implementation: segment management is assumed out of
  scope (picker only), and image upload defaults to Directus assets API.
  Requirement passes.

needs_clarification:
  - Segment management (create/edit) is not defined; assumed out of scope.
  - Image upload mechanism is underspecified; assumed Directus assets API.

confidence: high
```
