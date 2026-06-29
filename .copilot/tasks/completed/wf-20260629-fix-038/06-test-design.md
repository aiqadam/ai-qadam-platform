# 06-test-design.md — Test Design (wf-20260629-fix-038)

**Step:** 7 (TestDesigner)
**Date:** 2026-06-29
**Issue:** ISS-UAT-013-6 — UAT script test-design defects
**Branch:** `fix/ISS-UAT-013-6-uat-test-design`
**Strategy ref:** `06-test-strategy.md`

---

## Plan

The strategy prescribes a single new file, `scripts/tests/bp-uat-template-rule.bats`,
containing exactly 5 `@test` blocks that mirror AC-3's five sub-assertions
(header present, API-contract phrase, vacuous-UI phrase, lives under
`## Negative Scenarios`, fenced TypeScript snippet with `page.request.get`).
I followed the model file `scripts/tests/step-0.5-doc-presence.bats` for
the header comment block, `setup()` pattern, and `REPO_ROOT` derivation.
I also matched the suggested verbatim block in `06-test-strategy.md` §
"Suggested new file" — preserving the awk slicing pattern that isolates
the rule's text window and the tolerant regex for the fenced snippet.

The BATS file is 50 lines (including header comment + blanks), well
under the 60-line screen rule from AGENTS.md §1.4. It adds no
dependencies; it reuses the existing `scripts/run-bats.sh` runner.

---

## Tests Written

### Unit (Vitest)

| File | Count | Required? |
|---|---|---|
| (none) | 0 | No — no production code changed. |

### Integration (Testcontainers)

| File | Count | Required? |
|---|---|---|
| (none) | 0 | No — no schema / API / DB change. |

### E2E (Playwright)

| File | Count | Required? |
|---|---|---|
| (none) | 0 | No — no user-visible behavior change. AC #1 / #2 / #4 already covered by existing / queued Playwright work. |

### Doc-regression (BATS)

| File | Count | Focus | Required? |
|---|---|---|---|
| [scripts/tests/bp-uat-template-rule.bats](scripts/tests/bp-uat-template-rule.bats) | 5 | Doc-presence for AC-3's rule paragraph in `BP-UAT-template.md` | Yes |

---

## Acceptance Criteria Coverage

| AC | Test | File:Line | Status |
|---|---|---|---|
| AC-1 (Neg 004 strengthened assertion) | (E2E — already on disk) | `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts:425-481` | Covered (pre-existing) |
| AC-2 (Neg 002/003 API-level 410 + comment) | (E2E — already on disk) | `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts:364-412` | Covered (pre-existing) |
| AC-3a (rule header present) | `AC-3: rule subsection header is present in BP-UAT-template.md` | `bp-uat-template-rule.bats:24-27` | Written |
| AC-3b (rule mandates API contract) | `AC-3: rule mandates the API contract alongside UI assertions` | `bp-uat-template-rule.bats:29-31` | Written |
| AC-3c (rule forbids vacuous UI) | `AC-3: rule forbids vacuous UI assertions` | `bp-uat-template-rule.bats:33-35` | Written |
| AC-3d (rule under ## Negative Scenarios) | `AC-3: rule lives under ## Negative Scenarios (not orphaned)` | `bp-uat-template-rule.bats:37-43` | Written |
| AC-3e (fenced TypeScript snippet) | `AC-3: rule includes a fenced TypeScript snippet with page.request.get` | `bp-uat-template-rule.bats:45-51` | Written |
| AC-4 (api-down re-run fails Neg 004) | (E2E — queued for TestRunner / UATRunner post-merge) | n/a | Out of scope |

---

## Test Design Decisions

| Decision | Rationale |
|---|---|
| Use `setup()` block (not `load 'test_helper'`) | The model file `step-0.5-doc-presence.bats` derives `PROJ_ROOT` inline in `setup()`. The new file follows the same pattern. `test_helper.bash` is reserved for suites that need shared fixtures / mocks (e.g. `uat-seed.bats`); this suite has none. |
| Resolve `TEMPLATE` once in `setup()` and export it | Keeps each `@test` block to a single assertion line. Avoids re-running `cd` per test. The `export` is belt-and-braces — the inline `$TEMPLATE` reference works without it, but export makes the variable visible to any subshell that may be added later. |
| Awk window for "under ## Negative Scenarios" | The regex alone cannot tell where a heading lives. Awk slices the file between `## Negative Scenarios` and the next `## ` heading, then greps the slice for the rule's `### ` heading. Matches the strategy's pseudocode verbatim. |
| Awk window for fenced snippet | Slice everything from the rule's `### ` heading to EOF, then grep for `page\.request\.get|apiRes\.status\(\)`. The regex intentionally tolerates backtick count, language tag, and whitespace — the strategy's "tolerant" note in `06-test-strategy.md`. |
| No `load 'test_helper'` | The strategy's suggested block omits it, and the model file doesn't use it either. Including it without need would add an import-time failure risk if `test_helper.bash` is ever removed. |
| `[ -f "$TEMPLATE" ]` first in test #1 | Provides a clear "No such file" failure message at the top of the suite, before the more specific `grep` failure. If the template is ever moved, this test fails on a more readable line than the grep would. |

---

## Known Test Gaps

| Gap | Why | Mitigation |
|---|---|---|
| AC-4 (api-down re-run fails Neg 004) not covered by this workflow | E2E re-run is a TestRunner / UATRunner job, gated on the workflow's `workflow-finish.sh` PR merge. | Orchestrator queues it post-merge; recorded in `06-test-strategy.md` Honesty Notes and in `handoff.yaml` `deferrals` (if added). |
| Doc reword brittleness — assertions #2 and #3 match literal phrases | Intentional. The friction is the point: a future contributor who rewrites the rule must update the test with an explicit reason. | Documented in `06-test-strategy.md` § "Boundary Conditions". |
| `grep -E` regex on `vacuous UI assertions? (are|is) forbidden` | Accepts both "are" and "is". The template currently uses "are". If a future edit uses "is", the test still passes. | Intentional permissive alternation. |

---

## Anti-Patterns Avoided

- **No new test runner** — reuses `scripts/run-bats.sh` + BATS, same as `step-0.5-doc-presence.bats`.
- **No Node script for a doc-presence check** — `grep -qE` is the existing idiom.
- **No Testcontainers / Docker** — doc test is hermetic, zero infra.
- **No `eval`, no dynamic imports** — all regexes are literal strings; `awk` is invoked with a fixed script.
- **No magic numbers** — none applicable. The only literal in the suite is the `## ` / `### ` Markdown heading depth, which is a structural constant of the file under test (not a numeric threshold).
- **No `it.skip`** — every assertion is enabled.
- **No mocking of the template file** — the test reads the real file; that's the point.
- **Bounded functions** — the entire file is 50 lines, well under AGENTS.md §1.4's 60-line screen rule. Each `@test` body is 1–3 lines.

---

## Run Output

> **Note:** The current session has the terminal tool disabled, so I could
> not run `bash scripts/run-bats.sh scripts/tests/bp-uat-template-rule.bats`
> directly. The expected output below is the result of static analysis
> against the on-disk template (verified by reading
> [docs/02-business-processes/uat/BP-UAT-template.md](docs/02-business-processes/uat/BP-UAT-template.md)
> lines 64–126). The TestRunner step in the workflow will execute the
> actual `bats` invocation and capture the canonical TAP output.

### Static analysis against on-disk template

| Test | Regex match (line in `BP-UAT-template.md`) | Expected outcome |
|---|---|---|
| AC-3.1 header | line 95: `### Negative-scenario assertion rule (mandatory)` | pass |
| AC-3.2 API-contract phrase | line 96: `**Negative scenarios must assert the API contract, not just the UI.**` | pass |
| AC-3.3 vacuous-UI phrase | line 121: `**vacuous UI assertions are forbidden.**` | pass |
| AC-3.4 lives under `## Negative Scenarios` | awk window (lines 64–128) contains line 95 heading | pass |
| AC-3.5 fenced snippet | lines 105–110: `page.request.get('<expected-call>')` and `expect(apiRes.status(), …).toBe(<expected>);` | pass |

### Expected TAP output (when TestRunner executes the suite)

```
1..5
ok 1 AC-3: rule subsection header is present in BP-UAT-template.md
ok 2 AC-3: rule mandates the API contract alongside UI assertions
ok 3 AC-3: rule forbids vacuous UI assertions
ok 4 AC-3: rule lives under ## Negative Scenarios (not orphaned)
ok 5 AC-3: rule includes a fenced TypeScript snippet with page.request.get
```

---

## Links

- Test file: [scripts/tests/bp-uat-template-rule.bats](scripts/tests/bp-uat-template-rule.bats)
- File under test: [docs/02-business-processes/uat/BP-UAT-template.md](docs/02-business-processes/uat/BP-UAT-template.md) — the `### Negative-scenario assertion rule (mandatory)` subsection lives at lines 94–126, under `## Negative Scenarios` (line 64).
- Model: [scripts/tests/step-0.5-doc-presence.bats](scripts/tests/step-0.5-doc-presence.bats)
- Secondary model: [scripts/tests/uat-seed.bats](scripts/tests/uat-seed.bats)
- Runner: [scripts/run-bats.sh](scripts/run-bats.sh)
- Strategy: [.copilot/tasks/active/wf-20260629-fix-038/06-test-strategy.md](.copilot/tasks/active/wf-20260629-fix-038/06-test-strategy.md)
- Issue: [ISS-UAT-013-6](.copilot/issues/ISS-UAT-013-6.md)
- Handoff: [.copilot/tasks/active/wf-20260629-fix-038/handoff.yaml](.copilot/tasks/active/wf-20260629-fix-038/handoff.yaml)

---

## Gate Result

```
status: passed
attempt: 1
timestamp: "2026-06-29T18:50:00Z"
summary: "Doc-regression BATS suite written at scripts/tests/bp-uat-template-rule.bats
  with 5 @test blocks covering the 5 sub-assertions of AC-3 (header
  present, API-contract phrase, vacuous-UI phrase, lives under
  ## Negative Scenarios, fenced TypeScript snippet with page.request.get).
  50 lines total, 0 dependencies, follows the conventions of
  step-0.5-doc-presence.bats. Static analysis against the on-disk
  template confirms all 5 assertions should pass at runtime. AC-1
  and AC-2 are already on disk (pre-existing Playwright work);
  AC-4 is queued for TestRunner / UATRunner post-merge. Terminal
  tool was disabled in this session, so the live bats run is
  delegated to the TestRunner step; the expected TAP output is
  recorded above."
```
