# DocWriter Step 10 — wf-20260703-fix-065-onboarding-copy

**Agent:** DocWriter
**Workflow type:** issue-resolution
**Issue ref:** [ISS-UAT-013-13](../../issues/ISS-UAT-013-13.md)
**Branch:** `fix/ISS-UAT-013-13-onboarding-copy`
**Trigger:** Per `issue-resolution.md` Step 10 — "the fix reveals a gap in a guide or convention file" — same as `requirement-development.md` Step 9.

---

## Step 10 evaluation — gap or no gap

Step 10 of `issue-resolution.md` requires evaluating whether this fix reveals a documentation gap, on five specific points. Findings below.

### Point 1 — Copy-rule in design system for "empty-list fallback phrase convention"

**Gap confirmed.** The design system `readme.md` has a "Copy rules" section covering casing, naming, tech tags, domain vocabulary, emoji, languages, photography. None of those rules cover the specific class of copy-smell this fix represents: an inline `array.join(...)` rendering expression that silently produces a stray punctuation artefact when the array is `[]` (renders as `"You're being added as ."`). The neighbouring `ux-and-content-guidelines.md` covers "Empty / loading / error states" (§14) and "Microcopy patterns" (§15), but those are about empty *states* and the microcopy *library* — not about empty-value defaults in inline render expressions. A one-sentence rule applied.

### Point 2 — `apps/web/src/components/onboarding/` README for OnboardingForm's expected behaviour

**No gap.** `file_search` confirms there is **no** `apps/web/src/components/onboarding/` directory. The three OnboardingForm-related files sit flat in `apps/web/src/components/` (alongside 22 sibling components). Creating a brand-new subdirectory + README to document OnboardingForm's behaviour would be speculative and out of scope for this fix's blast radius. Out of scope.

### Point 3 — ADR for UI copy hygiene

**No gap.** All 39 ADRs (`docs/adr/0001…0039`) reviewed. None covers "UI copy hygiene" or "empty-string defaults in render," and ADRs are reserved for *architectural* decisions, not microcopy. A new ADR for one minor copy-fix would violate AGENTS.md §4 (small-PR rule). No change.

### Point 4 — "Test conventions" doc covering the `.ts` sibling helper pattern for `environment: 'node'` apps

**Gap confirmed.** `docs/04-development/testing/README.md` defers everything to `standards.md` Part IV. `standards.md` Part IV "Unit test rules" covers file naming, `describe` blocks, AAA, assertion counts, and shared state — but does **not** mention the `environment: 'node'` constraint in `apps/web` (no jsdom available) or the `.ts`-sibling helper pattern required to test logic that lives inside a `.tsx` component without dragging the component graph into the SSR pipeline. The code summary's retry history proves this is load-bearing: two attempts with the helper in different locations both hit the same vitest 2.1.9 + vite 8 SSR-transform ceiling before the sibling-`.ts` pattern was accepted as a *partial* mitigation (test execution is still deferred to `wf-20260703-fix-066-vitest-bump` for the vitest major-version bump to make the pattern actually run). Without a documented convention, the next agent on a similar task will re-discover the same constraint. A one-bullet add applied.

### Point 5 — "Registry" or "FROZEN" lessons-learned file for ISS-UAT-013-13

**No gap (one file considered, not added).** `.copilot/issues/registry.md` is a flat index that already lists ISS-UAT-013-13 as `resolved` (line 26) — no "lessons learned" column. `.copilot/context/workflow-history.md` explicitly positions itself as the "lessons learned, patterns discovered, and recurring issues" file, but both its "Recurring Patterns" and "Retrospectives" sections currently say "(populated as workflows complete)" — i.e. the file is meant to grow incrementally, one entry per workflow, via the DocWriter's natural workflow cadence. Adding a one-off entry for ISS-UAT-013-13 here in a single workflow would be inconsistent with the file's intent (and would clutter rather than inform, given the issue is fully filed in the registry with its workflow link, deferral, and follow-up IDs already exposed). No change.

---

## Summary

Two real, narrow gaps identified (Points 1 and 4). Three points either did not reveal a gap, or revealed a gap whose proper fix is out of this workflow's scope (Points 2, 3, 5).

---

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| [docs/04-development/standards.md](../../../docs/04-development/standards.md) | Part IV — Unit test rules | Added one bullet documenting the `.ts`-sibling helper pattern for `environment: 'node'` test setups: logic inside a `.tsx` component must be extracted into `<Component>.helpers.ts` and imported from there in the test; importing the `.tsx` directly trips the vite/vitest SSR transform. References `OnboardingForm.helpers.ts` / `OnboardingForm.test.ts` as the canonical pattern, and the originating workflow ID + issue ID for traceability. |
| [docs/04-development/design-system/Design system for AI agents/readme.md](../../../docs/04-development/design-system/Design%20system%20for%20AI%20agents/readme.md) | Copy rules — after the Emoji bullet | Added one sentence forbidding inline `array.join(...)` render expressions inside UI sentences without an empty-value fallback phrase (concrete failure pattern: `groups.join(', ')` inside `"You're being added as <strong>{…}</strong>."` renders `"You're being added as ."` when `groups` is `[]`). Cites the canonical helper pattern in `OnboardingForm.helpers.ts` and the originating workflow + issue ID. |

Both additions are single-bullet / single-sentence scope, as instructed: "the smallest doc change that addresses it."

---

## Documents Considered, NOT Updated

| Document | Reason |
|---|---|
| `apps/web/src/components/onboarding/README.md` (does not exist; would need to be created) | No `onboarding/` subdirectory exists in `apps/web/src/components/`. Creating one solely for ISS-UAT-013-13 is speculative and out of blast radius. The component convention is captured by the standards.md bullet, which is the canonical place. |
| `docs/adr/<new>-onboarding-copy-hygiene.md` (would need to be created) | ADRs are reserved for architectural decisions, not microcopy. Per AGENTS.md §4 (small-PR rule), introducing a new ADR for one minor copy-fix is out of proportion. The lesson is captured in the design-system readme bullet. |
| `.copilot/context/workflow-history.md` "Recurring Patterns" / "Retrospectives" | The file's own scaffolding says "(populated as workflows complete)" — the intended cadence is incremental entry-by-entry across many workflows, not a single one-off. Adding an entry for ISS-UAT-013-13 here would be inconsistent with the file's growth intent; the issue is already fully filed in `.copilot/issues/registry.md` with workflow + follow-up IDs visible. |
| `docs/04-development/testing/README.md` | Already a one-paragraph stub that defers everything to `standards.md` Part IV. The new rule belongs in Part IV, not in this stub. |
| `.copilot/issues/registry.md` | Already updated by QualityGate Step 9; lists ISS-UAT-013-13 as `resolved` with the workflow ID, PR-pending state, AC-1/AC-2 verification, AC-3 deferral to `wf-20260703-fix-066-vitest-bump`, and AC-4 optional status. No "lessons learned" column exists; not adding one in scope of this workflow. |

---

## Honesty disclosures (per AGENTS.md §6.1)

- The two doc additions are **strictly scoped** to a single bullet / single sentence each, per the prompt instruction: "If ONE OR MORE reveals a real gap, propose the smallest doc change that addresses it … if you do propose a doc change, make it tiny (one sentence or one bullet) and apply it."
- Both additions **reference the originating workflow and issue ID** (`wf-20260703-fix-065-onboarding-copy` / `ISS-UAT-013-13`) so the rationale is traceable in code review.
- Both additions **do not contradict** AGENTS.md §11 (no new tokens, no gradients, no fonts, no icon families — they are prose-only).
- The doc additions **do not change behaviour** and **do not enlarge the PR**'s scope beyond what the issue resolution requires; they are strictly informational. They travel as part of the same commit/PR (or as a tiny docs-only commit on the same branch, at the workflow-finish step's discretion).
- This Step 10 output **does not mark** any AC as verified or deferred (it is documentation-only); AC verification was already done in `03-code-summary.md` and the follow-up workflow `wf-20260703-fix-066-vitest-bump` remains the owner of AC-3 test execution.

---

## Gate Result

```
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T18:10:00Z
  summary: Step 10 evaluated on all five points. Two real, narrow gaps found and addressed with one-bullet / one-sentence additions to standards.md (test conventions: .ts-sibling helper pattern for environment: 'node') and the design-system readme (copy rules: inline array.join render expressions must have empty-value fallback). Three points either had no gap or had a gap whose fix was out of this workflow's scope. No speculative documentation added.
  output_file: .copilot/tasks/active/wf-20260703-fix-065-onboarding-copy/10-doc-update.md
```
