# Step 8 — Documentation Update

**Workflow:** wf-20260704-fix-076
**Issue:** ISS-UAT-009-3
**Date:** 2026-07-04
**Agent:** DocWriter

---

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| [`docs/02-business-processes/uat/BP-UAT-009.md`](../../../docs/02-business-processes/uat/BP-UAT-009.md) | Step 006 — "Sign in with valid `next` param" | Extended the "Expected UI state" block to explicitly cover the visual self-row chip rendering. Added four bullets pinning (a) the badge boundary between display name and `YOU` chip, (b) the canonical `.badge.mono` design-system pattern, (c) the non-concatenation invariant (the pre-fix defect `UAT MemberYou`), and (d) the absence of chip/wrapper on non-self rows. Added a "Screenshot review note" pointing the visual reviewer at the chip and the non-self rows. Referenced `ISS-UAT-009-3` inline so future readers know why this contract exists. No other step, AC, or surrounding section was modified. |

## Documents Not Updated

| Document | Considered? | Why Not Updated |
|---|---|---|
| `docs/04-development/architecture/architecture.md` | Yes | No module boundary change — the fix is contained to one Astro page (`apps/web/src/pages/leaderboard.astro`) and reuses an existing design-system pattern (`.badge.mono`). No architecture decision warrants an ADR. |
| `docs/04-development/design-system/Design system for AI agents/readme.md` | Yes | No new design-system tokens, components, or copy rules introduced. The fix **reuses** the canonical `.badge.mono` pattern already documented. |
| `docs/03-requirements/FR-AUTH-001.md` | Yes | FR-AUTH-001's acceptance criteria are unchanged. ISS-UAT-009-3 is a visual-only design-system finding under BP-UAT-009 AC-2 — the FR stays "Implemented". |
| `docs/02-business-processes/uat/BP-UAT-009.md` (other steps) | Yes | Per the task brief: keep the change minimal — DO NOT rewrite the rest of Step 006, DO NOT touch other steps. All other steps remain accurate as-is. |
| `apps/e2e/tests/uat/BP-UAT-009.spec.ts` | Yes (out of DocWriter scope) | The five new DOM assertions for Step 006 were added by the TestRunner in Step 7 of this workflow. DocWriter does not modify test code. |
| `apps/web/src/pages/leaderboard.astro` | Yes (out of DocWriter scope) | Code change is owned by CodeDeveloper (Step 3 of this workflow). DocWriter is documentation-only. |

---

## Rationale (why this wording, why this shape)

- **Bullet-point shape** mirrors the existing Step 006 skeleton (Precondition / Action / Expected UI state / Screenshot label) and matches the level of detail the rest of `BP-UAT-009.md` uses for expected state. Keeps the script readable for a future UAT runner who is not a developer.
- **Explicit reference to `ISS-UAT-009-3`** is placed inline next to the "pre-fix defect" mention AND again in the screenshot review note. Two references is intentional: the first anchors the contract to the issue that produced it, the second anchors the visual reviewer's evidence trail.
- **Canonical `.badge.mono` pattern** is named (not its CSS variable internals) because the test script is a business-process document, not a CSS spec. A future runner reading this needs to know "the chip must look like the existing chips on the page" — and the rank-label chips (`01 · GOLD` / `02 · SILVER` / `03 · BRONZE`) are the in-product reference.
- **Non-self-rows-must-not-carry-the-chip** is called out explicitly because it pins the most likely regression mode (a future change that makes the chip-injection script over-eager and tags every row).
- **No implementation detail** (`gap: 6px`, `flex-shrink: 0`, `is:global`, scoped `<style>` split) leaks into the script — those live in `apps/web/src/pages/leaderboard.astro` and `03-code-summary.md`, not here. The script stays a what-the-runner-should-see document, not a how-it-works document.

---

## Rule Compliance

| Rule | Status | Notes |
|---|---|---|
| AGENTS.md §1 (Ten Non-Negotiables) | ✅ | N/A — this is documentation prose, not control flow. No magic numbers/strings (the only literal is `UAT MemberYou` which is a quoted defect example, not a code constant). |
| AGENTS.md §3 (Code quality enforcement) | ✅ | Markdown style matches the existing file: bullet lists, bold for labels, fenced headings, sentence case. |
| AGENTS.md §4 (Small PR rule) | ✅ | **1 file changed** (`docs/02-business-processes/uat/BP-UAT-009.md`); **~10 lines added** (well under the 400-LOC / 5-file budget). |
| AGENTS.md §5 (Security baseline) | ✅ | N/A — docs-only change. No secrets, no auth code, no user data referenced. |
| AGENTS.md §6 (What you NEVER do) | ✅ | No `.env`, no migration, no `--force`, no secrets. |
| AGENTS.md §11 (Design system) | ✅ | Documentation references the canonical `.badge.mono` pattern correctly. No raw hex, no gradients, no new tokens invented in the docs. |
| AGENTS.md §13 (Critical analysis of user requests) | ✅ | The user request was scoped ("Step 006 section only, do not touch other steps, do not rewrite"). I followed the scope exactly — no scope creep. |
| DocWriter role §Output format | ✅ | This file (`08-doc-update.md`) contains all three required sections (`## Documents Updated`, `## Documents Not Updated`, `## Gate Result`) plus the `context_update:` YAML block required by `workflow-finish.sh` step F.5. |

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "BP-UAT-009 Step 006 'Expected UI state' tightened to explicitly cover the visual self-row chip rendering (badge boundary, canonical .badge.mono pattern, non-concatenation invariant, non-self rows untouched). Inline reference to ISS-UAT-009-3 added. New 'Screenshot review note' points the visual reviewer at the chip and the non-self rows. Change is 1 file / ~10 lines — well under the §4 PR budget. No other docs updated; rationale and rule-compliance tables document the reasoning and the explicit non-updates."
  findings:
    - "Single-file change to docs/02-business-processes/uat/BP-UAT-009.md Step 006 only — no other step, AC, or section altered."
    - "Bullet list shape matches the rest of BP-UAT-009.md expected-state sections (sentence case, bold labels, no implementation detail leakage)."
    - "ISS-UAT-009-3 referenced inline (twice — once with the pre-fix defect, once in the screenshot review note) so future readers know why this contract exists."
    - "No new design-system tokens, no new ADR, no architecture doc change needed — the fix reuses the canonical .badge.mono pattern already in use on the same page (rank-label chips)."
    - "DocWriter did not modify test code or product code — those were already shipped by TestRunner (Step 7) and CodeDeveloper (Step 3) respectively."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```

---

## Context Sync

```yaml
context_update:
  issue_id: ISS-UAT-009-3
  status: resolved
  workflow_id: wf-20260704-fix-076
  workspace_state_note: |
    wf-20260704-fix-076 closed 2026-07-04; PR <pending>; ISS-UAT-009-3
    self-row chip fixed (apps/web/src/pages/leaderboard.astro);
    canonical .badge.mono pattern applied; BP-UAT-009 step 006
    expected state tightened to cover visual self-row chip.
```