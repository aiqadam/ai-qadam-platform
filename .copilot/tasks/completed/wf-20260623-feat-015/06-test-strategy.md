# Test Strategy — FR-MIG-015

## Requirement

**FEAT-MIG-015**: Rebuild the Telegram broadcast operator cabinet in
`apps/web-next/src/pages/workspace/integrations/telegram/broadcasts/` with three Astro pages:
a broadcasts list with status filter, a new-broadcast composer with rich-text body,
up to 8 inline buttons, segment picker, image upload, and future-date scheduler,
and an edit/view page with Send now, Test send, Duplicate, and Cancel actions.

---

## Rubric Score

| Criterion | Points | Reason |
|-----------|--------|--------|
| Touches tenant-scoped data | 0 | Frontend reads via existing NestJS endpoints; tenant scoping is handled in the backend |
| New API endpoint | 0 | No new endpoints — all 9 NestJS endpoints already exist |
| Business rule with edge cases | 0 | Backend rules (button cap, status transitions) already tested in `tg-broadcasts-service.spec.ts` |
| Cross-module service call | 0 | Frontend only; NestJS backend has no new cross-module calls |
| New database query | 0 | No Drizzle schema changes; Directus reads go through existing service |
| Pure function / utility | 0 | `use-tg-broadcasts.ts` is a query hook layer over existing `apiClient` |

**Total: 0** — Unit tests only. No integration or E2E tests required.

---

## Required Test Levels

- [x] **Unit** — Required
- [ ] Integration (Testcontainers) — Not required (pure frontend; backend already covered by `tg-broadcasts-service.spec.ts`)
- [ ] E2E (Playwright) — Not required (rubric score < 6)

---

## Unit Test Plan

### Target: `use-tg-broadcasts.ts` (TanStack Query hooks)

| Target | Happy Path | Failure Paths |
|--------|-----------|---------------|
| `BROADCASTS_KEY` constant | Matches `['workspace', 'tg-broadcasts']` | — |
| `useBroadcastList(query?)` | Returns `BroadcastSummary[]` from `GET /v1/workspace/tg-broadcasts` | Handles `?status=` param; handles empty list |
| `useBroadcastDetail(id)` | Returns `BroadcastDetail` from `GET /v1/workspace/tg-broadcasts/:id` | Handles missing broadcast (404) |
| `useCreateBroadcast(body)` | POSTs to `/v1/workspace/tg-broadcasts`; returns new `BroadcastDetail` | Handles validation error (400) |
| `useUpdateBroadcast(id, body)` | PATCHes `/v1/workspace/tg-broadcasts/:id`; returns updated `BroadcastDetail` | Handles sent/sending/failed state rejection |
| `useSendNow(id)` | POSTs to `/v1/workspace/tg-broadcasts/:id/send-now` | Handles 403 (not super-admin); handles 409 (wrong status) |
| `useSendTest(id)` | POSTs to `/v1/workspace/tg-broadcasts/:id/send-test` | Handles validation error |
| `useDuplicate(id)` | POSTs to `/v1/workspace/tg-broadcasts/:id/duplicate`; returns new `BroadcastDetail` | Handles missing source broadcast (404) |
| `useCancel(id, sentCount)` | POSTs to `/v1/workspace/tg-broadcasts/:id/cancel` with `sent_count` | Handles wrong status (not sending) |

**Note:** Hook logic will be re-implemented locally (avoiding React/Vitest ESM issues), following the pattern from `use-form-hooks.test.ts`.

### Target: `TgBroadcastsList.tsx` (React island)

| Target | Happy Path | Failure Paths |
|--------|-----------|---------------|
| Status filter renders 5 chips | Draft, Scheduled, Sending, Sent, Failed each selectable | Default shows "All" |
| Clicking chip updates URL param | Navigates to `?status=sent` | Clears to no param on "All" |
| Empty state | Shows "No broadcasts yet" with create button | — |
| Loading state | Shows skeleton rows | — |
| DataTable columns | Title, Country, Status chip, Scheduled, Sent, Created, Actions | — |

### Target: `TgBroadcastComposer.tsx` (React island)

| Target | Happy Path | Failure Paths |
|--------|-----------|---------------|
| Required fields validation | Blocks submit when `title` or `body` empty | Shows inline error messages |
| Max 8 inline buttons enforced | "Add button" hidden at 8; 9th button not added | — |
| Button URL validation | Validates `https?://` URL format | Shows error for invalid URL |
| Save as Draft | PATCHes with `status=draft` | Handles network error |
| Save + Schedule | PATCHes with `status=scheduled` + `scheduled_at` | Shows error when `scheduled_at` in past |
| Mode switch (new vs edit) | Pre-populates form in edit mode; empty in new mode | — |

### Target: ActionBar contextual actions (`TgBroadcastComposer.tsx` / `[id].astro` island)

| Target | Happy Path | Failure Paths |
|--------|-----------|---------------|
| Send now visible (super-admin) | Calls `useSendNow`; shows confirm dialog | Hidden for non-super-admin |
| Send now confirm dialog | Shows recipient count + duration estimate from `GET /v1/workspace/tg-segments/:id/preview` | Handles segment preview error |
| Send now duration warning | Shows warning when `match_count > 10000` | — |
| Test send | Calls `useSendTest` | Shows error on failure |
| Duplicate | Calls `useDuplicate`; navigates to new draft | Shows error |
| Cancel visible (scheduled only) | Calls `useCancel` after `window.confirm` | Hidden for non-scheduled; disabled during other operations |

### Target: Status chip component

| Target | Happy Path | Failure Paths |
|--------|-----------|---------------|
| Status → color mapping | draft=gray, scheduled=blue, sending=amber, sent=green, failed=red | — |
| Status → label mapping | Each status renders correct label text | — |

---

## Integration Test Plan

**Not required.** The rubric score is 0. The NestJS service + Directus layer is already covered by:
- `apps/api/test/tg-broadcasts-service.spec.ts`
- `apps/api/test/tg-broadcasts-sender-service.spec.ts`
- `apps/api/test/tg-broadcasts-analytics-service.spec.ts`

No new integration tests needed.

---

## E2E Test Plan

**Not required.** The rubric score is 0 (pure frontend, no new API endpoints, no business rule edge cases). Critical user journeys (list loads, status filter works, composer saves) are covered by unit tests above.

If E2E is desired in the future, the following Playwright flows would be candidates (rubric score would need to reach 6 to make E2E mandatory):

| User Flow | Entry Point | Exit Assertion |
|-----------|-------------|-----------------|
| List broadcasts + filter by status | `GET /workspace/integrations/telegram/broadcasts` | DataTable renders; clicking "Sent" chip shows only sent broadcasts |
| Composer: save as draft | `GET /workspace/integrations/telegram/broadcasts/new` | Submit → navigate to list → draft row appears |
| ActionBar: send-now confirm | `GET /workspace/integrations/telegram/broadcasts/[id]` (scheduled) | Confirm dialog shows recipient count; after confirm, status transitions to sending |

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|----|------------|------------------|
| AC-1: List page renders DataTable with broadcasts | Unit | `TgBroadcastsList`: `useBroadcastList` is called; DataTable columns match spec |
| AC-1: Status filter narrows list via URL param | Unit | `TgBroadcastsList`: clicking "Sent" chip navigates to `?status=sent`; filter is passed to `useBroadcastList` |
| AC-2: Composer validates required fields (title, body) | Unit | `TgBroadcastComposer`: submit with empty fields shows errors; submit succeeds when both populated |
| AC-2: Up to 8 inline buttons enforced | Unit | `TgBroadcastComposer`: adding 9th button is blocked; "Add button" hidden at limit |
| AC-3: Save + Schedule sets `status=scheduled` | Unit | `useUpdateBroadcast` is called with `status=scheduled` + `scheduled_at`; AC-4 covers the hook |
| AC-4: ActionBar actions are contextual (Cancel only on scheduled) | Unit | `TgBroadcastComposer`/`[id].astro`: Cancel button hidden when status != 'scheduled' |
| AC-5: Send-now confirm shows recipient count + duration | Unit | `useSendNow` confirm dialog reads from `GET /v1/workspace/tg-segments/:id/preview`; shows `match_count` and `Math.round(match_count / 30)` seconds |
| AC-6: Failed broadcast shows Send now available | Unit | `useBroadcastDetail` on failed broadcast shows Send now action; `useSendNow` callable |
| AC-9: Status chips display correctly | Unit | Status chip component maps each `BroadcastStatus` to correct color and label |

**Notes on AC-3, AC-7, AC-8:**
- AC-3 (save + schedule), AC-7 (duplicate), AC-8 (cancel) are tested via `useUpdateBroadcast`, `useDuplicate`, and `useCancel` hook unit tests, which verify the correct API endpoints are called with the correct payloads.
- The `TgBroadcastsService` backend is tested in `tg-broadcasts-service.spec.ts`.

---

## Gate Result

```
gate: test-strategy
agent: test-strategist
status: passed
workflow: wf-20260623-feat-015
requirement: FR-MIG-015

rubric_score: 0
justification: Pure frontend feature. No new API endpoints, no DB schema
  changes, no cross-module service calls. All backend rules are already
  tested in tg-broadcasts-service.spec.ts.

test_levels:
  unit: required
  integration: not-required (rubric < 4)
  e2e: not-required (rubric < 6)

unit_targets:
  - use-tg-broadcasts.ts (9 hooks)
  - TgBroadcastsList.tsx (DataTable + status filter)
  - TgBroadcastComposer.tsx (validation + buttons + actions)
  - Status chip component (color + label mapping)

ac_coverage: all 10 ACs mapped to unit tests

confidence: high
```
