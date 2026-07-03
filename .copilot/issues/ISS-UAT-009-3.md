# ISS-UAT-009-3 — Leaderboard self-row renders "UAT MemberYou" with no space/separator

| Field | Value |
|---|---|
| ID | ISS-UAT-009-3 |
| Severity | minor |
| Module | web/leaderboard (UI) |
| Status | resolved |
| Reported | 2026-07-02 |
| Resolved | 2026-07-04 |
| Reporter | BusinessAnalyst (wf-20260702-uat-058 / 03-uat-triage.md) |
| Workflow | wf-20260704-fix-076 |
| AC ref | AC-2 (BP-UAT-009, step-006) — visual-only finding, not a DOM/AC failure |

## Symptom

Visual-only finding from `02b-visual-review.md`, screenshot
`step-006-next-param-redirect.png` (Leaderboard page, reached after sign-in via
`next=/leaderboard`). The DOM assertion for this step passed (browser correctly
landed at `/leaderboard`), but pixel inspection found a design-system defect:

```
The current user's leaderboard row renders the name text as "UAT MemberYou"
with no visible space, separator, or badge boundary between the display name
("UAT Member") and the "You" self-indicator. Reads as concatenated text, not a
rendering crash — a missing space or missing badge/pill container around the
self-indicator.
```

Confirmed via `design_system: FAIL` in the visual review (Copy rules /
Component consistency) — not present on any other screenshot in the run.

## Classification

**UI bug.** Missing visual separation (space, or badge/pill styling) between
two adjacent text nodes in the leaderboard row component.

## Root cause (hypothesis)

Likely in the leaderboard row component (search for the self-indicator
rendering logic, e.g. a component under `apps/web/src/components/` responsible
for leaderboard rows) — the "You" self-indicator is concatenated directly onto
the display name string without a separating space or without being wrapped in
its own badge/pill element with margin, e.g.:

```tsx
// suspected pattern:
<span>{member.displayName}{isSelf && 'You'}</span>
// should likely be:
<span>{member.displayName}</span>
{isSelf && <span className="badge">You</span>}
```

Exact file/line not yet located — needs a code-developer investigation pass
against the leaderboard row rendering component.

## Proposed resolution

Locate the leaderboard row component and either:
1. Add a space/margin between the display name and the "You" self-indicator, or
2. Wrap "You" in a proper badge/pill component (preferred, matches design
   system's use of badges elsewhere, e.g. rank "01 · GOLD" styling) with its
   own spacing.

## Acceptance criteria

- [x] Leaderboard row component located and self-indicator rendering fixed
- [x] Visual re-check: self-row renders with clear separation between name and
      "You" indicator (space or badge boundary)
- [x] No regression to other leaderboard row states (non-self rows unaffected)

## Resolution

- **Workflow:** wf-20260704-fix-076
- **PR:** https://github.com/tvolodi/aiqadam/pull/97 (squash SHA: `8fe37e1cbd667fa0a5b2b26da19a7e93a2db59a4`, merged 2026-07-03T21:13:25Z by tvolodi)
- **Root cause:** The client-side `highlightMe` script in `apps/web/src/pages/leaderboard.astro` injected the `.me-chip` as a **child** of the `.name` / `.pname` element, which has `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. The chip's `margin-left: 8px` collapsed against the truncated display name → "UAT MemberYou".
- **Fix:** Wrap `.name` / `.pname` + chip in an inline-flex `.me-name-wrap` sibling container so the chip is no longer a child of the ellipsis-clipped text node. Apply the canonical `.badge.mono` pattern (closed palette, mono uppercased label) to the chip. Split the `<style>` block into a scoped block (for the `.is-me` row highlight, applied to Astro-rendered rows) and an `<style is:global>` block (for `.me-name-wrap` and `.me-chip`, applied to the JS-injected elements that don't inherit Astro's scoped hash). Added three idempotency guards to the chip-injection script.
- **Regression test:** `apps/e2e/tests/uat/BP-UAT-009.spec.ts` Step 006 — five DOM assertions that pin the post-fix chip structure (chip parent is `.me-name-wrap`, not `.name`/`.pname`; chip carries `badge mono me-chip`; chip text is `You`; non-self rows have zero chips/wraps). Assertion (2) — `chip.parentElement.className === 'me-name-wrap'` — would have failed pre-fix (parent was `.name` / `.pname`).
- **Merged:** `8fe37e1cbd667fa0a5b2b26da19a7e93a2db59a4` (squash of 3 commits on `fix/ISS-UAT-009-3-leaderboard-self-row`)
- **CI Override (AGENTS.md §6.3):** PRSteward authorized override on vitest class (4→5/5 — LIMIT REACHED) and rolldown class (2→3/5). Both pre-existing on origin/main HEAD; PR #97 does not touch `apps/api/test/setup-pg.ts` or `apps/web-next/src/kit/`. Audit trail: `.copilot/tasks/active/wf-20260704-fix-076/pr-steward-decision.md`. **NEXT PR with vitest class MUST stop and escalate per §6.3 rule 3.**
- **Visual evidence:** `apps/e2e/uat-results/BP-UAT-009/step-006-next-param-redirect.png` shows the podium card rendering `01 · GOLD | UM avatar | UAT Member | YOU` with the `YOU` chip clearly separated from `UAT Member` by ~6px and a visible 1px badge border (canonical `.badge.mono` pattern).
