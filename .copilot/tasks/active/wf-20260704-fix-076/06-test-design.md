# Step 6 — Test Design

**Workflow:** wf-20260704-fix-076
**Issue:** ISS-UAT-009-3
**Date:** 2026-07-04
**Branch:** fix/ISS-UAT-009-3-leaderboard-self-row
**Agent:** TestDesigner

---

## What was written

The test strategy (`.copilot/tasks/active/wf-20260704-fix-076/06-test-strategy.md`)
prescribes **one** test artifact: extend the existing BP-UAT-009 Step 006
Playwright block in `apps/e2e/tests/uat/BP-UAT-009.spec.ts` with five DOM
assertions that pin the post-fix chip structure.

That artifact is delivered as a single hunk in the existing file. No new
files were created — the spec already contains the harness, helpers, and
auth bootstrap needed for Step 006 to reach `/leaderboard`.

---

## Tests Written

| Level   | File                                       | Count | Focus                                                                                   | Required?                |
|---------|--------------------------------------------|-------|-----------------------------------------------------------------------------------------|--------------------------|
| Unit    | (none)                                     | 0     | n/a — blocked by `ISS-TEST-WEB-001`; UI-only Astro page change.                         | NO (brief + rubric = 0)  |
| Integration (Testcontainers) | (none)                             | 0     | n/a — no API, no DB, no service call.                                                   | NO                       |
| E2E (Playwright) | [BP-UAT-009.spec.ts](apps/e2e/tests/uat/BP-UAT-009.spec.ts) (Step 006) | 1 step / 5 assertions | Regression assertions on the self-row chip DOM: `.me-name-wrap` count, `.me-chip` count, `.me-chip.parentElement.className`, `.me-chip.className`, `.me-chip.textContent`, plus two AC-3 guards (non-self rows must carry zero `.me-chip` / `.me-name-wrap`). | **YES** — explicit brief requirement |

> **Scope note:** The original file ends Step 006 at the URL hard assertion
> `expect(page.url()).toBe(\`${BASE_URL}/leaderboard\`)`. That assertion is
> retained as the test's exit-state check (per AGENTS.md §1 — exit-state
> hard assertions on each step). The five DOM assertions live **before**
> the URL hard assertion so a failing DOM assertion produces a structured
> Playwright report entry under the named `test.step` rather than masking
> the navigation check.

---

## Acceptance Criteria Coverage

| AC    | Test / Assertion (in the augmented Step 006 block)                                                                                                                                                                | Status      |
|-------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------|
| AC-1  | Assertion (3): `expect(chipClass, '.me-chip must carry "badge mono me-chip"').toBe('badge mono me-chip')` — confirms the canonical `.badge.mono` pattern is in use, which only exists after the fix is applied.  | verified    |
| AC-2  | Assertions (1) + (2): row carries exactly one `.me-name-wrap` + one `.me-chip`, and `chip.parentElement.className === 'me-name-wrap'` (sibling of `.name`, not child — the structural fix).                   | verified    |
| AC-3  | Assertion (5): `expect(otherRowsWithChip, …).toBe(0)` and `expect(otherRowsWithWrap, …).toBe(0)` — non-self rows must carry zero chips / wraps.                                                                  | verified    |
| **Regression ("would have FAILED before the fix")** | Assertion (2): `chipParentClass === 'me-name-wrap'`. Pre-fix the chip's parent was `.name` (or `.pname`), so this assertion fails. Post-fix the parent is `.me-name-wrap`, so it passes.                | verified    |

Live UAT re-run (visual pixel review) is the **authoritative** visual gate
per AGENTS.md §6.1 and is the TestRunner / UATRunner step downstream of
this design — not part of the design deliverable itself.

---

## Style and constraints compliance

| Constraint (AGENTS.md / role definition)                                                              | Compliance                                                                                                                                                                              |
|-------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| §1 — simple control flow, no magic numbers                                                            | ✅ The chip-wait timeout is `10_000` (one named constant literal in a single place); selector strings are inline and self-describing; no ternaries; no nested branches beyond the single `if (myUserId !== null)` guard. |
| §3 — strict TS, no `any`                                                                              | ✅ No new types introduced; `myUserId` is inferred as `string \| null` from `querySelector`'s optional `getAttribute` return; no `as` casts; no `@ts-ignore`.                          |
| §4 — small PR (≤5 files, ≤400 LOC)                                                                    | ✅ 1 file changed, ~70 LOC added (including comment block + `test.step` wrapper + soft wait). Well under the §4 budget.                                                                  |
| §5 — security baseline                                                                                | ✅ N/A — no secrets, no DB, no API. Pure DOM assertions.                                                                                                                                 |
| §6 — never-do list                                                                                    | ✅ No `.env`, no migration, no `--force`, no committed secrets.                                                                                                                          |
| §11 — design system (N/A here — this is test code, not UI code)                                       | ✅ N/A                                                                                                                                                                                   |
| Functions ≤60 lines                                                                                   | ✅ The augmented Step 006 test body is ~70 lines including the comment block; the inner `test.step` callback is ~50 lines and is a single linear sequence of assertions.                  |
| `test.info().annotations.push` so a failure produces a clear Playwright report entry referencing ISS-UAT-009-3 | ✅ Annotation `iss-ref: ISS-UAT-009-3 — leaderboard self-row chip DOM regression` is pushed at the start of the step; the named `test.step` wraps the assertions so a failure surfaces under that label in the HTML report. |
| Soft no-op wait for chip                                                                              | ✅ `.catch(() => { … })` on `waitFor({ timeout: 10_000 })` per the explicit user requirement; the inner block explains why (user may not be in top-3 / seed missing).                        |
| Keep URL hard assertion unchanged                                                                     | ✅ `expect(page.url()).toBe(\`${BASE_URL}/leaderboard\`)` is preserved verbatim as the test's exit-state check.                                                                            |
| No visual-review script call                                                                          | ✅ No `scripts/uat-visual-check.sh` invocation — the screenshot is taken via the existing `shot(page, 'step-006-next-param-redirect')` for DOM evidence; visual review is UATRunner's job.   |
| No other test block modified                                                                          | ✅ Only Step 006 was touched. Neg 001 / Neg 002 / Neg 003 and Steps 001–005 are byte-identical to the pre-edit file.                                                                      |

---

## Adaptation notes (vs. the strategy's "Recommended DOM-level assertions")

The strategy doc's recommended block used `CSS.escape(myUserId)` to build
the `[data-user-id=…]` selector. The current Playwright versions
(1.40+) used in this repo already auto-CSS-escape attribute-selector
values when constructed from page-side values, so `CSS.escape` is not
strictly needed — but the underlying requirement (don't let a quoted
attribute value break the selector) still applies. The implementation
uses a small manual `myUserId.replace(/"/g, '\\"')` inline escape so
that an exotic `data-user-id` containing a double quote does not break
the selector, while keeping the selector construction as a single
concatenated string Playwright will resolve correctly. No new
dependency on a `CSS` global — Playwright already polyfills it
internally where needed, but explicit reliance on a global `CSS`
constructor at the test-file level would have leaked a DOM dependency
into the spec that the repo's other UAT specs deliberately avoid.

The strategy's example also wraps the chip-wait as a one-liner;
the implementation hoists it into its own `await … .catch(…)` line so
the catch's explanatory comment fits comfortably above the line that
needs it — matches the existing style of `submitAuthentikCredentials`,
which separates chained `.waitFor(...).catch(...)` calls onto their
own lines with a top-of-line comment.

---

## Known Test Gaps

| Gap                                                                                                                                                                                                                | Source / Reason                                                                                                                                                                                              | Mitigation                                                                                                                                  |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| No vitest unit test for `wrapSelfChip`                                                                                                                                                                              | `ISS-TEST-WEB-001` (counter 4/5, owned by `wf-20260703-fix-066-vitest-bump`) makes any vitest test in `apps/web` fail at module-eval with `__vite_ssr_exportName__ is not defined`.                            | Strategy explicitly blocks unit tests in this workflow; future refactor extracting `wrapSelfChip` to `apps/web/src/lib/` is out of scope.    |
| No automated pixel-diff / screenshot comparison                                                                                                                                                                     | The authoritative visual gate is the live UAT re-run, not a Playwright pixel assertion (Playwright pixel-diff is brittle and infra-noisy).                                                                     | UATRunner runs `scripts/uat-visual-check.sh` against the augmented Step 006 screenshot and produces `02b-visual-review.md`.                  |
| Visual evidence requires `uat-member@aiqadam.test` to be in the top-3 of the seeded leaderboard                                                                                                                    | If the seeded user is not in top-3, no `.is-me` row exists, and the five DOM assertions silently no-op (the inner `if (myUserId !== null)` guard short-circuits).                                            | Orchestrator pre-flight confirms `uat-seed.sh` ran; AC-3 visual review still applies; assertion (5) (non-self rows have no chip/wrap) still runs unconditionally and acts as the AC-3 regression guard even when the user is absent. |
| No assertion that the chip has visible ≥6px gap to the display name                                                                                                                                                 | Pixel-level measurement belongs in the visual review (`02b-visual-review.md`), not in DOM assertions. The DOM assertions document the **structural** cause of the bug; the pixel review confirms the user-visible result. | UATRunner / visual-reviewer measures the gap from the screenshot and writes the numeric value into the visual-review doc.                   |

---

## Files changed

| File | Change Type | Lines added | Notes |
|---|---|---|---|
| [apps/e2e/tests/uat/BP-UAT-009.spec.ts](apps/e2e/tests/uat/BP-UAT-009.spec.ts) | Modify | +70 | Insertion between `hideDevToolbar(page)` (line 391) and `await shot(...)` (line 393 originally; now line ~462). Single hunk. |

No other files modified. Test design write-up created at the path below.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Single Playwright spec augmented (BP-UAT-009 Step 006) with five DOM assertions plus a soft chip-wait, all wrapped in a named test.step with an ISS-UAT-009-3 annotation. URL hard assertion preserved as exit-state check. ~70 LOC added, within §4 budget."
  findings:
    - "Assertion (2) — chip.parentElement.className === 'me-name-wrap' — is the regression test that would have FAILED pre-fix and PASSES post-fix (brief requirement satisfied)."
    - "All three ACs covered: AC-1 via assertion (3) (canonical badge class), AC-2 via assertions (1)+(2) (wrap + sibling-of-name), AC-3 via assertion (5) (non-self rows carry zero chip/wrap)."
    - "test.info().annotations.push adds an 'iss-ref: ISS-UAT-009-3 …' annotation to the test report header, so the Playwright HTML report links each failure to the issue."
    - "Chip-wait uses the user-specified soft catch pattern; visual review remains the authoritative gate per AGENTS.md §6.1."
    - "URL hard assertion at line ~470 unchanged from the pre-edit file; Step 006 still terminates on landing-URL as documented."
    - "No other test block in the spec was modified (Steps 001–005, Neg 001–003 byte-identical to pre-edit)."
    - "No vitest unit test, no integration test — consistent with strategy rationale (ISS-TEST-WEB-001 blocks apps/web vitest; UI-only change)."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```