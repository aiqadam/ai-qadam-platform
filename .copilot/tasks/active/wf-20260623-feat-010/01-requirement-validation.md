# 01-requirement-validation.md — RequirementAnalyst

## Raw Input

**Source:** `.copilot/tasks/active/wf-20260623-feat-010/handoff.yaml`
**Requirement file:** `docs/03-requirements/FR-MIG-011.md`
**Feature identifier:** FR-MIG-011 (pre-assigned)

---

## Analysis

### Completeness Issues Found

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Wrong API endpoint in requirement.** FR-MIG-011 says cohorts load from `/v1/admin/cohorts`. The actual live endpoint is `/v1/workspace/cohorts` (GET returns `{ cohorts: CohortRow[] }`) — verified in `apps/api/src/modules/workspace/cohorts.controller.ts`. This is a documentation error, not an implementation gap. | Medium |
| 2 | **Rich-text editor (Tiptap) is not implemented.** FR-MIG-011 requires Tiptap with Telegram-safe HTML subset (bold, italic, links, inline code). The current `AnnounceComposer.tsx` uses a plain `<textarea>` for the body field. `tiptap` is absent from `apps/web-next/package.json`. This is a **major functional gap**. | High |
| 3 | **`<ActionBar>` is not used.** FR-MIG-011 says to use `<ActionBar actions={[Preview, Send]}>`, but the current `AnnounceComposer.tsx` has inline `<Button>` elements directly in the form and below the preview. The existing `<ActionBar>` block (`apps/web-next/src/blocks/workspace/ActionBar.tsx`) supports `confirm` dialogs but is not wired into this component. | High |
| 4 | **Send confirmation dialog is missing.** FR-MIG-011 says "Send (with confirm + estimated recipient count)" but the current `SendControls` renders a bare `onClick` button. The `ActionBar`'s `confirm` prop (shows `<Dialog>` before firing) is not used. Estimated recipient count is shown in the preview pane but not in a confirmation dialog. | High |
| 5 | **`<AsyncSelect>` is not used.** FR-MIG-011 says cohort picker uses `<AsyncSelect>`. The current implementation uses shadcn `<Select>` with the full pre-loaded cohort list. For saved cohorts (which are enumerated upfront via `useCohorts`), `<AsyncSelect>` is arguably over-engineered. This is a **style mismatch** rather than a functional gap. | Low |
| 6 | **No scheduling, drafts, or A/B testing.** Explicitly deferred per the runbook (`docs/02-business-processes/operations/operator-announce-composer.md`), not incompleteness. | N/A |

### Conflicts with Existing Features

| Existing FR | Relationship | Conflict? |
|-------------|--------------|-----------|
| FR-MIG-003 (`<Form>`) | Dependency | None. `<Form>` is for Zod-driven auto-rendered fields; the announce body is a rich-text editor that cannot auto-render. AnnounceComposer is correctly standalone with manual form control. |
| FR-MIG-004 (`<AsyncSelect>`) | Dependency | No conflict. `<AsyncSelect>` exists and works. Current implementation uses `<Select>` instead (acceptable for small pre-loaded lists). |
| FR-MIG-005 (`<ActionBar>`) | Dependency | **Style conflict**: `<ActionBar>` is not used in current AnnounceComposer even though the requirement specifies it. No functional conflict — both can coexist. |
| FR-ADM-003 (Announcement composer v1) | Parity | The runbook (`docs/02-business-processes/operations/operator-announce-composer.md`) marks FR-ADM-003 as "Shipped" and this L3 rebuild as completing the migration. No conflict. |

### Architectural Feasibility

| Check | Result |
|-------|--------|
| Stack fits? | Yes. Astro 5 + React 19 islands + Tailwind 4 + shadcn/ui. Tiptap (plain `@tiptap/react`) is compatible. |
| Module boundary respected? | Yes. Component is an L3 workspace block in `apps/web-next/src/blocks/workspace/AnnounceComposer.tsx`. API calls go through `use-announce.ts` hooks (`/v1/workspace/announce/preview` and `/v1/workspace/announce`). |
| No cross-schema queries? | Yes. Cohort data comes from Directus via NestJS API; dispatch uses `InteractionsService` — all through explicit service interfaces. |
| Single monorepo? | Yes. All changes within `apps/web-next/` and `apps/api/`. |
| API endpoint naming | **Correction needed**: requirement says `/v1/admin/cohorts`; actual is `/v1/workspace/cohorts`. |

---

## Formalized Requirement

**Feature identifier:** `FEAT-MIG-011`
**Module:** Migration (MIG) — workspace cabinet rebuild
**Title:** `/workspace/announce` — full announcement composer (L3 block)

### Behavior statement

The `/workspace/announce` operator cabinet exposes a full announcement composer as a React island (L3 block). The operator selects a saved cohort, writes a subject line and a rich-text body (Tiptap editor with Telegram-safe HTML subset), previews the rendered email with estimated recipient count, selects a consent basis, and dispatches via a confirmation dialog. The dispatch calls `POST /v1/workspace/announce` and shows an inline delivery summary (sent / skipped_consent / failed / other).

### Cross-references

- **Depends on:** FR-MIG-003 (`<Form>`), FR-MIG-004 (`<AsyncSelect>` — available but plain `<Select>` acceptable for saved-cohort lists), FR-MIG-005 (`<ActionBar>` with confirm dialog)
- **API backing:** `POST /v1/workspace/announce/preview` + `POST /v1/workspace/announce` (already implemented in `apps/api/src/modules/workspace/announce.controller.ts`); cohorts from `GET /v1/workspace/cohorts`
- **Types:** `AnnouncePreview`, `AnnounceSent`, `CohortRow`, `ConsentBasis` in `apps/web-next/src/lib/types.ts`
- **Hooks:** `usePreviewAnnounce`, `useSendAnnounce`, `useCohorts` in `apps/web-next/src/lib/`

### Gaps to close

1. Add `tiptap` + `@tiptap/react` + Telegram-safe HTML extension to `apps/web-next/package.json`
2. Replace `<textarea>` body field with Tiptap editor (bold, italic, link, inline code toolbar)
3. Add `<ActionBar>` with two actions: "Preview" (no confirm) and "Send" (confirm dialog showing estimated recipient count)
4. Wire the Send action's confirm dialog to show `estimatedRecipients` from the last preview
5. Remove inline `<Button>` elements; move all actions into `<ActionBar>`
6. Fix requirement doc: replace `/v1/admin/cohorts` with `/v1/workspace/cohorts`

---

## Acceptance Criteria (draft)

| # | Given / When / Then | Test type target |
|---|----------------------|-----------------|
| AC-1 | **Given** the operator is on `/workspace/announce`, **when** they type in the body field, **then** the Tiptap editor provides bold, italic, link insertion, and inline code formatting | E2E |
| AC-2 | **Given** the operator is on `/workspace/announce`, **when** the page loads, **then** the cohort picker is pre-populated with all saved cohorts from `GET /v1/workspace/cohorts` via the existing `useCohorts` hook | Unit |
| AC-3 | **Given** the operator has selected a cohort, entered subject and body, **when** they click "Preview", **then** the preview pane shows the cohort name, `estimatedRecipients` count, subject, and rendered body text | E2E |
| AC-4 | **Given** a preview has been generated, **when** the operator clicks "Send", **then** a confirmation dialog appears showing the estimated recipient count | E2E |
| AC-5 | **Given** the confirmation dialog is shown, **when** the operator confirms, **then** `POST /v1/workspace/announce` is called with `{ cohortId, subject, body, consentBasis }` and the delivery summary (sent/skipped_consent/failed/other) is shown inline | E2E |
| AC-6 | **Given** the send succeeds, **then** a success state renders with `interactionId`, recipient count, and breakdown counts | Unit |
| AC-7 | **Given** the send fails, **then** an inline error message is shown with the failure reason | Unit |
| AC-8 | **Given** the operator is on `/workspace/announce`, **when** the page loads with no saved cohorts, **then** a guidance message directs them to `/workspace/members` to build one first | Unit |
| AC-9 | `pnpm arch:check` + `astro check` + `pnpm build` pass | CI gate |

---

## Gate Result

```yaml
gate: requirement-validation
agent: requirement-analyst
status: passed
workflow_id: wf-20260623-feat-010
requirement_ref: FR-MIG-011
flagged_issues:
  - type: documentation-error
    description: "Requirement says /v1/admin/cohorts; actual endpoint is /v1/workspace/cohorts. Must fix in FR-MIG-011.md."
  - type: missing-dependency
    description: "tiptap + @tiptap/react not in web-next/package.json. Must add."
  - type: implementation-gap
    description: "AnnounceComposer uses plain <textarea> instead of Tiptap editor. Must replace."
  - type: implementation-gap
    description: "ActionBar with confirm dialog not wired for Send action. Must add."
notes:
  - "The requirement is substantially underspecified in three areas (rich-text, ActionBar, confirm dialog). This formalization fills those gaps with the analyst's best interpretation based on the runbook, existing ActionBar behavior, and Telegram-safe HTML best practices."
  - "AsyncSelect is not strictly required for saved-cohort lists (plain Select with upfront load is acceptable). Flagged as style mismatch, not functional gap."
  - "API controller and service are fully implemented. Only the L3 block needs work."
next_agent: code-developer
```
