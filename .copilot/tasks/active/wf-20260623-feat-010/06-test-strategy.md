# 06-test-strategy.md — TestStrategist

## Requirement

**FEAT-MIG-011** — `/workspace/announce` full announcement composer (L3 block).
Replaces a plain `<textarea>` with a Tiptap rich-text editor and wires the existing
`<ActionBar>` block for Preview/Send actions with a confirmation dialog.

---

## Rubric Score

| Criterion | Points | Justification |
|-----------|--------|---------------|
| Touches tenant-scoped data | +0 | Cohorts are workspace-level; API enforces isolation |
| New API endpoint | +0 | No new endpoints; preview/send already exist |
| Business rule with edge cases | +0 | Logic is straightforward (sanitize, send, show summary) |
| Cross-module service call | +0 | All calls through existing TanStack Query hooks |
| New database query | +0 | No DB changes; cohorts from existing API |
| Pure function / utility | +0 | No new pure functions |
| UI-only change (no logic) | +0 | Pure UI transformation with no new business rules |

**Score: 0** — UI-only change with no new business rules, no new API contracts, no DB changes.

---

## Required Test Levels

- [x] **Unit** — Required. All logic paths must be covered.
- [ ] **Integration (Testcontainers)** — Not required. No DB changes; API endpoints unchanged.
- [x] **E2E (Playwright)** — Required. Critical happy-path flow must be verified end-to-end.

---

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|--------|------------|---------------|
| `DOMPurify.sanitize()` | Accepts valid Telegram-safe HTML (bold, italic, links, code) | Strips disallowed tags/attrs; handles empty body; handles XSS payloads (`javascript:`, `<script>`) |
| `TiptapEditor` output | Bold/italic/link/code toolbar buttons produce correct HTML | Disabled buttons remain disabled when not applicable |
| `EditorToolbar` | Active state toggles on mark application | Link prompt cancellation (empty URL removes link) |
| `ComposerForm.canPreview` | True when cohort + subject + body non-empty; false otherwise | Disabled when isPreviewing=true |
| `AnnounceComposerInner` — cohort loading | Shows loading state while `useCohorts` is pending | Shows error state on `useCohorts` failure |
| `AnnounceComposerInner` — empty cohorts guard | Shows guidance message directing to `/workspace/members` | N/A |
| `AnnounceComposerInner` — success state | Renders `SentSummary` with correct `interactionId` and delivery breakdown | N/A |
| `AnnounceComposerInner` — error state | Preview error shown inline with `previewMutation.error.message`; send error shown inline with `sendMutation.error.message` | N/A |
| ActionBar — Preview action | Calls `handlePreview` (triggers `usePreviewAnnounce` mutation) | Disabled when `canPreview` is false |
| ActionBar — Send action | Opens confirmation dialog showing `estimatedRecipients` count | Disabled when `estimatedRecipients === null` |
| `SentSummary` | Renders `sent.interactionId`, `sent.recipientCount`, `deliveriesSummary` breakdown | N/A |
| `SendControls` | Consent basis selector changes value on selection | N/A |

---

## Integration Test Plan

**Not required.** No database changes, no new service interfaces, and all existing API endpoints are exercised via E2E Playwright tests.

---

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|-----------|-------------|----------------|
| Happy-path full compose → send | Navigate to `/workspace/announce` | Delivery summary visible with `interactionId` and non-zero `recipientCount`; "Send another" button present |
| Preview generates preview pane | Fill cohort + subject + body; click "Preview" | Preview pane appears showing cohort name, recipient count, subject, and body text |
| Send confirmation dialog shows recipient count | Click "Send" after preview | Confirmation dialog visible with `estimatedRecipients` formatted count; "Cancel" and "Send" buttons present |
| Cancel confirmation returns to form | Click "Cancel" in dialog | Dialog closes; form remains with all values preserved |
| Empty cohorts shows guidance | Navigate to `/workspace/announce` with no cohorts | Guidance message visible with link to `/workspace/members` |

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|----|------------|------------------|
| AC-1: Tiptap bold/italic/link/code formatting | Unit | `TiptapEditor` unit test: toolbar buttons produce correct HTML |
| AC-2: Cohort picker pre-populated from `GET /v1/workspace/cohorts` | Unit | Mock `useCohorts`; verify `Select` options include loaded cohorts |
| AC-3: Preview shows cohort name, estimatedRecipients, subject, body text | E2E | Full compose → click Preview → assert preview pane content |
| AC-4: Send confirmation dialog shows estimated recipient count | E2E | Click Send after preview → assert dialog text includes recipient count |
| AC-5: Confirm fires `POST /v1/workspace/announce` with correct body | Unit | Mock `useSendAnnounce`; confirm dialog → assert mutation called with `{ cohortId, subject, body, consentBasis }` |
| AC-6: Success state renders delivery summary | Unit | Mock `useSendAnnounce` resolve; assert `SentSummary` renders `interactionId` + breakdown counts |
| AC-7: Error renders inline with failure reason | Unit | Mock `useSendAnnounce` reject; assert error paragraph with `role="alert"` and error message |
| AC-8: Empty cohorts shows guidance to `/workspace/members` | Unit | Mock `useCohorts` resolve with `[]`; assert guidance paragraph with link |
| AC-9: CI gate (`pnpm lint` + `pnpm typecheck` + `pnpm build`) | CI | Already enforced; no new skip flags needed |

---

## Mocking Strategy

| Hook / Module | Mock approach |
|---------------|---------------|
| `usePreviewAnnounce` | Mock `vi.fn()` returning `{ cohortName, estimatedRecipients, subject, text, truncated }` |
| `useSendAnnounce` | Mock `vi.fn()` returning `{ interactionId, recipientCount, truncated, deliveriesSummary }` |
| `useCohorts` | Mock with `{ isPending, error, data }` variants for loading/error/empty/success states |
| `useEditor` (Tiptap) | Use `@tiptap/react`'s `fakeEditor` pattern or mock the editor instance for toolbar tests |
| `window.prompt` | Mock `vi.fn()` for link insertion tests |
| `DOMPurify.sanitize` | Optionally mock for unit tests; integration tests should use real DOMPurify |

---

## Coverage Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Line coverage | 80% | AnnounceComposer.tsx + helpers |
| Branch coverage | 70% | All conditionals in ComposerForm and AnnounceComposerInner |
| Error path coverage | 100% | All error states (`cohortsQuery.error`, `previewMutation.error`, `sendMutation.error`) |

---

## Gate Result

```yaml
gate: test-strategy
agent: test-strategist
status: passed
workflow_id: wf-20260623-feat-010
requirement_ref: FR-MIG-011
rubric_score: 0
rubric_justification: "UI-only change; no new API endpoints, no DB changes, no new business rules, no cross-module service calls."
required_test_levels:
  unit: true
  integration: false
  e2e: true
ac_coverage:
  AC-1: unit (TiptapEditor toolbar output)
  AC-2: unit (useCohorts mock with Select options)
  AC-3: e2e (full compose → Preview flow)
  AC-4: e2e (Send confirmation dialog)
  AC-5: unit (mock useSendAnnounce called with correct body)
  AC-6: unit (SentSummary renders interactionId + breakdown)
  AC-7: unit (error inline with role="alert")
  AC-8: unit (empty cohorts guidance message)
  AC-9: ci (existing lint/typecheck/build gate)
coverage_targets:
  line: "80%"
  branch: "70%"
  error_paths: "100%"
mocking_strategy:
  usePreviewAnnounce: vi.fn() with mock resolve/reject
  useSendAnnounce: vi.fn() with mock resolve/reject
  useCohorts: vi.fn() with isPending/error/data variants
  useEditor: tiptap fakeEditor or mocked editor instance
  window.prompt: vi.fn() for link insertion tests
  DOMPurify: real implementation (unit) or mock (if needed)
next_agent: test-designer
```
