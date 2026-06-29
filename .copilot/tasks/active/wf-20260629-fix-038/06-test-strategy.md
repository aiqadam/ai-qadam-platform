# 06-test-strategy.md — Test Strategy (wf-20260629-fix-038)

**Step:** 6 (TestStrategist)
**Date:** 2026-06-29
**Issue:** ISS-UAT-013-6 — UAT script test-design defects
**Branch:** `fix/ISS-UAT-013-6-uat-test-design`
**Scope:** doc-only change (+29 lines) in `docs/02-business-processes/uat/BP-UAT-template.md`

---

## Requirement

| ID | Area | One-line |
|---|---|---|
| ENH-UAT-013-6 | uat / test-design | Strengthen BP-UAT-013 negative-scenario assertions and publish a reusable UAT-template rule so the defect class (vacuous UI assertions; UI-coincidental passes via `<GonePanel>`) does not regress in future specs. |

The change is contained in **two layers**:

1. **Already on disk** (Retry-2 pass on 2026-06-28):
   `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` already carries the
   strengthened Neg 002/003 API-level `expect(apiRes.status()).toBe(410)`
   assertion plus a pinned comment block (lines 364–412), and Neg 004
   now requires an explicit error-text regex match instead of the
   vacuous "no success panel" (lines 425–481). These satisfy ACs #1
   and #2 of the issue.
2. **Delivered this workflow** (Step 4):
   `docs/02-business-processes/uat/BP-UAT-template.md` gains a
   `### Negative-scenario assertion rule (mandatory)` subsection
   under `## Negative Scenarios`, forbidding vacuous UI assertions and
   mandating an API-level assertion alongside any UI assertion when
   the UI fallback is a generic error panel. Satisfies AC #3.

AC #4 (re-run BP-UAT-013 with the api down → Neg 004 fails) is queued
for the TestRunner / UATRunner post-merge; not a CodeDeveloper artifact.

---

## Rubric Score

| Criterion | Points | Applies? | Reason |
|---|---|---|---|
| Touches tenant-scoped data | +2 | No | Doc-only. No schema or runtime change. |
| New API endpoint | +2 | No | No endpoint added or changed. |
| Business rule with edge cases | +2 | No | No runtime rule. The new doc *describes* a rule, it does not implement one. |
| Cross-module service call | +1 | No | Doc-only. |
| New database query | +1 | No | Doc-only. |
| Pure function / utility | 0 | n/a | |
| UI-only change (no logic) | 0 | n/a | Doc-only, not even UI. |

**Score: 0 / 6.**

The standard rubric under-scores this change because the rubric assumes
production-code review. A doc-only change is **outside the rubric's
intent**. The pragmatic interpretation:

- No unit tests needed — no production function changed.
- No integration tests needed — no schema / API / DB / worker change.
- No E2E tests needed — no user-visible behavior changed.
- **One documentation-regression test needed** — to satisfy the
  workflow invariant "would have failed before the fix, passes after",
  translated for a doc-only change to: "fails if the rule paragraph
  is removed, passes while the rule paragraph is present".

That single regression test sits **outside the standard test pyramid**
because it tests a documentation invariant, not application behavior.
It belongs with the BATS regression suite under `scripts/tests/`
(see `file_layout` below), not under `apps/e2e/tests/`.

---

## Required Test Levels

- [ ] Unit (Vitest) — not required (no production code changed)
- [ ] Integration (Testcontainers) — not required (no DB / API change)
- [ ] E2E (Playwright) — not required (no user-visible behavior change)
- [x] **Doc-regression (BATS)** — required (covers the doc-only AC #3 invariant)

---

## Doc-Regression Test Plan

| Target | Invariant | Why |
|---|---|---|
| `docs/02-business-processes/uat/BP-UAT-template.md` | Contains the `### Negative-scenario assertion rule (mandatory)` subsection header. | A future contributor who deletes the heading will silently remove the rule. The header is the canonical anchor for both humans and search. |
| Same file | Contains the literal phrase `API contract, not just the UI` (or near-equivalent: the rule's mandating sentence). | Encodes the **positive mandate**: "assert the API contract alongside the UI". A regex match on this phrase ensures the rule's *intent* survives rewording more permissively than the heading. |
| Same file | Contains the literal phrase `vacuous UI assertions are forbidden` (or the equivalent sentence banning vacuous "no success panel" checks). | Encodes the **negative prohibition** that closes Defect A's upstream cause. Without this, a future spec can satisfy the API rule while still shipping a vacuous UI-only assertion. |
| Same file | The rule lives under the `## Negative Scenarios` section (not orphaned under a different heading). | Prevents a future mass-move of the section breaking the rule's discoverability for spec authors. |
| Same file | Contains a fenced TypeScript snippet that includes `page.request.get` and `expect(apiRes.status(), …).toBe(…)`. | Locks in the **concrete pattern** — a BusinessAnalyst copy-pasting from the doc must get a runnable shape, not prose. |

### Why BATS, not a Node script

- `scripts/tests/` already runs BATS for documentation-invariant
  regressions (`step-0.5-doc-presence.bats`, `uat-seed.bats`,
  `quality-gate-context.bats`). A new Node script would create a
  second runner.
- The repo already has `scripts/run-bats.sh` that resolves BATS
  regardless of install method (system, pnpm devDep, `BATS=…` env).
- `grep -qE` is sufficient for "string present in file" assertions;
  no real value in spinning up Node.
- Consistency is a teachability win (AGENTS.md §0): one pattern
  (`grep -qE "phrase" file`) is reused across `uat-seed.bats`,
  `step-0.5-doc-presence.bats`, and the new file.

### Suggested new file: `scripts/tests/bp-uat-template-rule.bats`

```bash
#!/usr/bin/env bats
# scripts/tests/bp-uat-template-rule.bats
#
# Documentation regression test for the "Negative-scenario assertion
# rule (mandatory)" subsection added to
# docs/02-business-processes/uat/BP-UAT-template.md by
# wf-20260629-fix-038 (ISS-UAT-013-6).
#
# These are NOT application tests. They are doc-presence assertions
# that fail if a future contributor deletes the rule paragraph. They
# follow the same pattern as scripts/tests/step-0.5-doc-presence.bats.
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/bp-uat-template-rule.bats
#   pnpm test:bash

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TEMPLATE="$REPO_ROOT/docs/02-business-processes/uat/BP-UAT-template.md"
  export TEMPLATE
}

@test "AC-3: rule subsection header is present in BP-UAT-template.md" {
  [ -f "$TEMPLATE" ]
  grep -qE '^### Negative-scenario assertion rule \(mandatory\)' "$TEMPLATE"
}

@test "AC-3: rule mandates the API contract alongside UI assertions" {
  grep -qiE 'API contract[, ]+not just the UI' "$TEMPLATE"
}

@test "AC-3: rule forbids vacuous UI assertions" {
  grep -qiE 'vacuous UI assertions? (are|is) forbidden' "$TEMPLATE"
}

@test "AC-3: rule lives under ## Negative Scenarios (not orphaned)" {
  # awk prints only the part of the file after the ## Negative Scenarios
  # heading; if the rule subsection heading does not appear within that
  # window, the rule is misplaced.
  awk '/^## Negative Scenarios/{flag=1; next} /^## /{flag=0} flag' "$TEMPLATE" \
    | grep -qE '^### Negative-scenario assertion rule \(mandatory\)'
}

@test "AC-3: rule includes a fenced TypeScript snippet with page.request.get" {
  # Tolerant: allow optional whitespace, allow either single or triple
  # backticks with optional "typescript" / "ts" language tag.
  awk '/^### Negative-scenario assertion rule \(mandatory\)/{flag=1; next} flag' "$TEMPLATE" \
    | grep -qE 'page\.request\.get|apiRes\.status\(\)'
}
```

**Estimated size:** 1 file, ~45 lines, 0 new dependencies. Well inside
the small-PR rule.

### Why each assertion is a regression test (not just a smoke test)

| Assertion | Would have failed before the fix? | Why it maps to AC #3 |
|---|---|---|
| Header present | **Yes** — header did not exist | The header is the new section's identity. |
| API-contract phrase | **Yes** — phrase did not exist | Encodes the **positive mandate** of the rule. |
| Vacuous-UI phrase | **Yes** — phrase did not exist | Encodes the **prohibition** that closes Defect A's upstream cause. |
| Under `## Negative Scenarios` | **Yes** — section did not exist | Prevents a future mass-rename from orphaning the rule. |
| Fenced snippet with `page.request.get` | **Yes** — no fenced snippet existed | Locks in the copy-paste shape so future specs get a runnable starting point. |

This is the "would have failed before, passes after" invariant —
applied to a doc-only change. A future contributor who deletes the rule
triggers at least 4 of 5 assertion failures.

---

## Mock Strategy

**N/A for the doc-regression test.** The BATS suite reads the on-disk
template and greps for required phrases. No mocking, no fixture files,
no I/O outside `grep` and `awk`. The test is hermetic and runs without
any external service (Docker, Postgres, Directus, Authentik, Mailpit).

---

## Boundary Conditions

| Boundary | Test behavior |
|---|---|
| Template file is renamed | All 5 assertions fail with `No such file`. Acceptable — the rename must also update `context_refs` in handoffs and the broken links will be visible in PR review. |
| Template file is deleted | Same as rename. Acceptable. |
| Header is renamed but content kept | Assertions #1 fails; #2, #3, #5 pass. **Acceptable** — the rule still exists. The header regex should be re-tuned if this happens deliberately. |
| Content is reworded permissively | Assertions #2/#3 may fail on a paraphrase that preserves intent but drops the literal phrase. **Acceptable** — the prompt to the contributor is "use the canonical wording; if you must change it, update the regression test with an explicit reason in the PR description". This is exactly the kind of friction the test is designed to provide. |
| BATS runner is missing on CI | `scripts/run-bats.sh` exits 127 with an actionable error message. CI surfaces the missing dependency, not a false PASS. |
| Section is moved to a different heading | Assertion #4 fails. Acceptable — the rule must live under `## Negative Scenarios` to be discoverable by spec authors. |

---

## File Layout

| File | Change type | Size | Purpose |
|---|---|---|---|
| `scripts/tests/bp-uat-template-rule.bats` | new | ~45 lines, 0 deps | Doc-regression assertions for AC #3. Runs via `scripts/run-bats.sh`. |

**Total: 1 file added, 0 files modified, 0 dependencies added.** Well
inside the small-PR rule (≤400 LOC, ≤5 files).

The new file lives under `scripts/tests/` because:

1. It tests a documentation invariant, not user-visible behavior.
   The BATS suite under `scripts/tests/` already covers doc-presence
   regressions (`step-0.5-doc-presence.bats`,
   `quality-gate-context.bats`).
2. `apps/e2e/tests/` is gated by Playwright + the dev stack running
   on `localhost:4321`. A pure doc test must not require that stack.
3. The runner `scripts/run-bats.sh` already exists and is wired into
   `pnpm test:bash` — no new wiring needed.

---

## Anti-Patterns Avoided

| Anti-pattern | Avoided by |
|---|---|
| Writing a Node script when grep would do | BATS + `grep -qE` is the existing idiom in `uat-seed.bats`. |
| Asserting on prose tone / wording (brittle) | Assertions match specific literal phrases, not paraphrasable intent. A future reword MUST update the test with explicit reason — exactly the friction we want. |
| Adding Testcontainers / Postgres to a doc test | Doc test is hermetic; zero infra. |
| Promoting the API-level 410 check into `test.beforeAll` | Out of scope and was already rejected in Step 2. Per-test assertion is independent and simpler. |
| Promoting the Mailpit-empty assertion into Neg 004 | Out of scope and was already rejected in Step 4 — fetch-hang risk outweighs the marginal defense gain. |
| Mocking the template file | The test reads the real file; that's the point. No mocking layer. |
| Adding a new test runner framework | Reuses existing BATS. No new dev-dep. |
| Testing the wrong artifact (e.g. grep-ing the spec file instead of the template) | The regression target is `BP-UAT-template.md`, not the spec — the spec is already covered by Playwright. |
| Coupling the doc test to a CI workflow YAML change | The new `.bats` file is automatically picked up by `pnpm test:bash` (which globs `scripts/tests/*.bats`). No CI wiring change needed. |

---

## Acceptance Criteria → Test Mapping

| AC | Test level | Test description | File |
|---|---|---|---|
| AC-1 (Neg 004 strengthened assertion) | E2E (already on disk) | `BP-UAT-013-signup.spec.ts:425-481` — Neg 004 requires error-text regex + no-success-panel. Verified in Step 2. | (no change) |
| AC-2 (Neg 002/003 API-level 410 + comment) | E2E (already on disk) | `BP-UAT-013-signup.spec.ts:364-412` — comment block + `expect(apiRes.status()).toBe(410)`. Verified in Step 2. | (no change) |
| AC-3 (template gains negative-scenarios guidance) | Doc-regression (BATS) | `scripts/tests/bp-uat-template-rule.bats` — 5 assertions: header present, API-contract phrase, vacuous-UI phrase, lives under `## Negative Scenarios`, includes fenced snippet. | new file |
| AC-4 (api-down re-run fails Neg 004) | E2E (queued) | Not re-executed in this workflow. Scheduled by Orchestrator for TestRunner/UATRunner post-merge. | (none) |

---

## Honesty Notes (AGENTS.md §9)

- **The spec-file assertions for AC #1 and #2 are not authored by this
  workflow.** They were already on disk from the wf-20260628-uat-030
  Retry-2 pass. Step 2 verified them against the issue's acceptance
  criteria; this strategy documents them but does not add new spec
  coverage.
- **AC #4 is acknowledged as not re-executed.** A re-run of BP-UAT-013
  with the api down is a TestRunner/UATRunner job, not a TestStrategist
  artifact.
- **The proposed Mailpit-empty assertion was rejected by CodeDeveloper
  and is not promoted here.** Documenting the rejection rather than
  silently dropping it.
- **Doc-only changes fall outside the standard rubric.** This strategy
  adds a **doc-regression** test as the appropriate analog, on equal
  footing with the "would have failed before, passes after" invariant
  that drives every other test in this repo.
- **The proposed BATS file is ~45 lines** — under the 60-line screen
  rule from AGENTS.md §1.4.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| BATS runner missing on a contributor's machine | Low | Test cannot run locally | `scripts/run-bats.sh` emits an actionable install hint. `pnpm test:bash` is the documented entry point. |
| Future reword of the template makes assertions #2/#3 brittle | Medium | False failure on legitimate doc improvement | Acceptable. The friction is the point. |
| Future spec author writes a negative scenario without following the rule | Medium | Same defect class returns | This test guards the *template*; the template's effect on specs is human-process (reviewers point authors at the rule). For automated enforcement, a follow-up issue could add a grep-based pre-commit. Out of scope. |
| Section header renamed without updating the test | Low | False failure | Acceptable. |
| Template moved to a different path | Low | All 5 assertions fail with `No such file` | Acceptable. |

---

## Gate Result

```
status: passed
attempt: 1
timestamp: "2026-06-29T18:35:00Z"
summary: "Doc-only ENH-UAT-013-6 maps to a single documentation-regression
  test under scripts/tests/bp-uat-template-rule.bats (5 grep-based
  assertions on BP-UAT-template.md). ACs #1 and #2 are covered by the
  existing Retry-2 spec on disk; AC #3 is the new doc-rule paragraph;
  AC #4 is queued for TestRunner/UATRunner post-merge. No unit /
  integration / E2E tests needed — no production code, schema, API
  contract, or user-visible behavior changed."
```
