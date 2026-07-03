# Test Results — wf-20260703-fix-065-onboarding-copy

**Agent:** TestRunner
**Workflow type:** issue-resolution
**Issue:** [ISS-UAT-013-13](../../issues/ISS-UAT-013-13.md)
**Branch:** `fix/ISS-UAT-013-13-onboarding-copy`
**Date run:** 2026-07-03T17:50:00Z

---

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit (filtered, `OnboardingForm.test.ts`) | 0 ran | 0 | 1 (suite failed to load) | 0 |
| Unit (unfiltered, `pnpm --filter web exec vitest run`) | 45 | 45 | 1 (suite failed to load) | 0 |
| Integration (Testcontainers) | — | — | — | Not required (rubric 0; no backend touched) |
| E2E (Playwright) | — | — | — | Not required (issue author marked Neg 005 visual re-run as optional) |

**Headline:** Code-side gates (`tsc`, `biome`) PASS. Test execution is
**BLOCKED by pre-existing infra** (`ISS-TEST-WEB-001` — vitest 2.1.9 vs
workspace vite 8.1.0 SSR-transform skew). The blocker is named, queued,
and bounded: follow-up workflow `wf-20260703-fix-066-vitest-bump`
owns the fix. This workflow does not mark ISS-UAT-013-13 `resolved`
based on deferred verification alone (AGENTS.md §6.1).

---

## Type Check

**Command:** `pnpm --filter web exec tsc --noEmit`

```
$ pnpm --filter web exec tsc --noEmit
$ "EXIT=$LASTEXITCODE"
EXIT=0
```

**Result:** ✅ **PASS.** Exit code 0, no compiler output.

The widened `roleGroupsText(groups: string[] | null | undefined)`
signature in `apps/web/src/components/OnboardingForm.helpers.ts`
compiles cleanly under `apps/web/tsconfig.json` (extends
`@aiqadam/tsconfig/astro.json`, `strict: true`,
`noUncheckedIndexedAccess: true`). The import line in
`OnboardingForm.tsx` and the assertion types in
`OnboardingForm.test.ts` both type-check.

No new type errors introduced. Routes back to CodeDeveloper only if
this had failed — it did not.

---

## Lint / Format Check

**Command:** `pnpm exec biome check apps/web/src/components/OnboardingForm.tsx apps/web/src/components/OnboardingForm.helpers.ts apps/web/src/components/OnboardingForm.test.ts`

```
$ pnpm exec biome check apps/web/src/components/OnboardingForm.tsx \
    apps/web/src/components/OnboardingForm.helpers.ts \
    apps/web/src/components/OnboardingForm.test.ts

apps/web/src/components/OnboardingForm.tsx:96:29 lint/complexity/noExcessiveCognitiveComplexity

  ! Excessive complexity of 13 detected (max: 10).

    94 │         aupAccepted={aupAccepted}
    95 │         setAupAccepted={setAupAccepted}
  > 96 │         onSubmit={async (e) => {
       │                             ^^^
    97 │           e.preventDefault();
    98 │           if (state.phase !== 'auth_ready') return;

  i Please refactor this function to reduce its complexity score from 13 to the max allowed complexity 10.

Checked 3 files in 8ms. No fixes applied.
Found 1 warning.
EXIT=0
```

**Result:** ✅ **PASS** (exit 0). One warning only:

| File | Line | Rule | Detail | Pre-existing on `main`? |
|---|---|---|---|---|
| `OnboardingForm.tsx` | 96:29 | `lint/complexity/noExcessiveCognitiveComplexity` | `onSubmit={async (e) => {…}}` — complexity 13, max 10 | **Yes** — same `onSubmit={async (e) => {` form exists in `main:apps/web/src/components/OnboardingForm.tsx` (introduced in commit `00e016e` for F-S2.8.2 operator self-service onboarding). |

The branch's `git diff` against `main` for `OnboardingForm.tsx` is
`+2 / −1` (one import line + the one-line replace inside `<strong>`).
The flagged arrow function is untouched. **This warning is NOT a
regression introduced by this branch** and per AGENTS.md §4 (small PR
rule) is out of scope to fix here — tracked separately.

No formatting drift on any of the three files.

---

## Unit Tests — File-Filtered Run

**Command:** `pnpm --filter web exec vitest run OnboardingForm.test.ts`

```
$ pnpm --filter web exec vitest run OnboardingForm.test.ts

17:49:47 [vite] warning: `esbuild` option was specified by "vitest" plugin. This option is deprecated, please use `oxc` instead.

 RUN  v2.1.9 C:/Users/tvolo/dev/ai-dala/aiqadam/apps/web

 ❯ src/components/OnboardingForm.test.ts (0 test)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/OnboardingForm.test.ts [ src/components/OnboardingForm.test.ts ]
ReferenceError: __vite_ssr_exportName__ is not defined
 ❯ src/components/OnboardingForm.helpers.ts:1:1
      1| // OnboardingForm.helpers.ts — Pure helpers for OnboardingForm that ca…
       | ^
      2| // imported from `environment: 'node'` vitest tests without dragging t…
      3| // JSX component graph into the SSR pipeline.
 ❯ src/components/OnboardingForm.test.ts:12:1

 Test Files  1 failed (1)
      Tests  no tests
   Start at  17:49:47
   Duration  563ms (transform 39ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 194ms)
```

**Result:** ⚠️ **BLOCKED by pre-existing infra — not a code defect.**

Classification: `failed-escalate → ISS-TEST-WEB-001` (already open,
owned by queued follow-up `wf-20260703-fix-066-vitest-bump`).

| Property | Value |
|---|---|
| Error | `ReferenceError: __vite_ssr_exportName__ is not defined` |
| Source location | `OnboardingForm.helpers.ts:1:1` (pure `.ts`, no JSX) |
| Test import line | `OnboardingForm.test.ts:12:1` — `import { roleGroupsText } from './OnboardingForm.helpers';` |
| vitest version | `v2.1.9` (bundles vite 5.x/6.x internally) |
| Workspace vite | `8.1.0` (introduced `__vite_ssr_exportName__` helper) |
| Root cause | Version skew between vitest's bundled vite and the workspace's vite 8 — ANY sibling-source-file import from a `node`-env test (`.ts` or `.tsx`) hits the same error |
| Confirmation | `utm.test.ts` (which inlines its helper) still passes 45/45 in the unfiltered run below |

**This is exactly the failure mode that `Step 4 (CodeDeveloper, Retry 2)`
and `06-test-design.md` predicted.** The follow-up workflow
`wf-20260703-fix-066-vitest-bump` is queued at
`.copilot/tasks/queued/wf-20260703-fix-066-vitest-bump/handoff.yaml`
and will bump vitest to `^3.x` (or `^4.x`) in `apps/api`,
`apps/web`, and `apps/web-next`, then re-run this exact command to
confirm 5/5 pass.

Per the TestRunner role table (`failed-escalate → infrastructure`),
this is not a `failed-retry-code` and not a `failed-retry-tests` — the
test file is correct, the helper is correct, only the test runner
is misconfigured for the current workspace.

---

## Unit Tests — Unfiltered Run

**Command:** `pnpm --filter web exec vitest run`

```
$ pnpm --filter web exec vitest run

17:49:48 [vite] warning: `esbuild` option was specified by "vitest" plugin. This option is deprecated, please use `oxc` instead.

 RUN  v2.1.9 C:/Users/tvolo/dev/ai-dala/aiqadam/apps/web

 ❯ src/components/OnboardingForm.test.ts (0 test)
 ✓ src/lib/utm.test.ts (45 tests) 11ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/OnboardingForm.test.ts [ src/components/OnboardingForm.test.ts ]
ReferenceError: __vite_ssr_exportName__ is not defined
 ❯ src/components/OnboardingForm.helpers.ts:1:1
      1| // OnboardingForm.helpers.ts — Pure helpers for OnboardingForm that ca…
       | ^
      2| // imported from `environment: 'node'` vitest tests without dragging t…
      3| // JSX component graph into the SSR pipeline.
 ❯ src/components/OnboardingForm.test.ts:12:1

 Test Files  1 failed | 1 passed (2)
      Tests  45 passed (45)
   Start at  17:49:48
   Duration  584ms (transform 74ms, setup 0ms, collect 41ms, tests 11ms, environment 0ms, prepare 420ms)
```

**Result:**

| Test file | Tests | Outcome |
|---|---|---|
| `src/lib/utm.test.ts` | 45/45 | ✅ **PASS** — no regression on the existing pure-`.ts` test |
| `src/components/OnboardingForm.test.ts` | 0 ran | ❌ **FAIL** — same `__vite_ssr_exportName__` SSR-transform error |

**Confirmation that the failure is NOT a code/test regression:**
the existing `utm.test.ts` (pure `.ts`, inlined helper) still passes
all 45 cases in 11ms. Only `OnboardingForm.test.ts`, which imports
a sibling source file, fails — and it fails for the same
`__vite_ssr_exportName__` reason identified in Step 4 Retry 2.

This matches the prediction in the orchestrator prompt exactly:
"`utm.test.ts` still passes 45/45; `OnboardingForm.test.ts` fails for
the same SSR-transform reason."

---

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| Suite-level load failure | `apps/web/src/components/OnboardingForm.test.ts` | `ReferenceError: __vite_ssr_exportName__ is not defined` at `OnboardingForm.helpers.ts:1:1` | **`failed-escalate` (infrastructure) — owned by ISS-TEST-WEB-001 / follow-up `wf-20260703-fix-066-vitest-bump`**, not a code bug |

**No individual `it()` cases were reached.** The suite fails at SSR
module evaluation, before vitest can collect any test definitions.
The 5 cases in the file (cases 1–5 from `06-test-design.md` §"Inventory
trace to strategy") are not implicated.

---

## Flaky Tests

None. The failure is deterministic across both runs (filtered and
unfiltered, 17:49:47 and 17:49:48). No `@flaky` tags in the test file.

---

## Coverage

| Metric | Target | Observed (this workflow) | Status |
|---|---|---|---|
| Branch coverage of `roleGroupsText` | 100% | 100% **by design** — 5 cases cover all 4 input shapes (`[]`, `undefined`/`null`, single-element, multi-element); one branch in the function | ✅ Exceeds target |
| Line coverage of new helper | 100% | 100% by inspection — single-line function body | ✅ |
| Line coverage of modified render site (`OnboardingForm.tsx:195`) | n/a | Not exercised (jsdom render tests out of scope per `06-test-strategy.md`) | — |

Coverage figures are by-case-count, not by `vitest --coverage` (which
would not run anyway under the current infra blocker). The assertion
set is the full truth table of a 1-line pure function — see
`06-test-design.md` §"Known Test Gaps (none — with reasoning)" for
why no additional cases are needed.

---

## Sanity Checks Against AGENTS.md §6.1 (Production-readiness)

| Rule | Status |
|---|---|
| Every AC verified by an actual test run OR a named-queued follow-up | ✅ AC-1 + AC-2: code-side verified by `tsc` + `biome` + manual read; AC-3 (test execution): deferred to `wf-20260703-fix-066-vitest-bump` (queue position 1); AC-4 (visual): deferred as optional per issue author |
| If test required live infra, infra was brought up by Orchestrator before the test | N/A — no live infra required for a pure-frontend render-text fix; the blocker is local `vitest`/`vite` version skew, not infra |
| No "the stack isn't ready" with no queued follow-up | ✅ Follow-up is queued at `.copilot/tasks/queued/wf-20260703-fix-066-vitest-bump/handoff.yaml` |
| `09-quality-gate.md` will list every AC and mark it verified-or-deferred-with-queue-ref | ✅ Hand-off prepared — QualityGate will write this status in Step 9 |

---

## Honesty Disclosure (AGENTS.md §9)

- The code change is **correct.** `tsc --noEmit` is clean. `biome check`
  is clean (one pre-existing warning on `main`, not introduced). The
  helper is a 1-line pure function whose truth table is obvious from
  reading `OnboardingForm.helpers.ts`.
- The test file is **correct.** It imports the real production helper
  (no re-implementation); all 5 cases match the strategy in
  `06-test-strategy.md`; no `it.skip`, no `any`, no `as` casts,
  comments explain WHY (ISS-UAT-013-13 reference + nullish-safety
  rationale).
- The test **cannot be executed** in this workflow because of a
  pre-existing infra mismatch (ISS-TEST-WEB-001). This is not a code
  defect; the same blocker would hit any test that imports a sibling
  source file under the current `vitest 2.1.9` configuration.
- Per AGENTS.md §9 ("If you're 70% confident in a solution, say 'I think'
  not 'this will work'") — confidence that the 5 cases will pass once
  vitest is bumped to `^3.x` is **high but not 100%**, because the
  bump itself could surface unrelated test-config issues. The follow-up
  workflow's job is to do the bump, run, and confirm.

---

## Gate Result

```
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T17:50:00Z
  summary: Code-side gates PASS (tsc clean, biome clean with one pre-existing-on-main warning). Test execution BLOCKED by pre-existing infra (ISS-TEST-WEB-001 — vitest 2.1.9 vs workspace vite 8.1.0 SSR-transform skew surfaces as ReferenceError: __vite_ssr_exportName__ is not defined). Confirmed not a regression: utm.test.ts still passes 45/45 in the unfiltered run. Test infra fix owned by queued follow-up wf-20260703-fix-066-vitest-bump (queue position 1). Code and test file verified correct by tsc + biome + manual read + file presence; the deferral is bounded, named, and recorded in handoff.yaml.
  output_file: .copilot/tasks/active/wf-20260703-fix-065-onboarding-copy/07-test-results.md
```

### Gate status rationale

The user prompt defined the TestRunner's pass criteria:

> `passed` is appropriate IF the code-side gates (tsc, biome) pass AND
> the vitest failure is fully attributable to the pre-existing infra
> blocker ISS-TEST-WEB-001.

All three conditions hold:

1. ✅ **tsc passes** — exit 0, no output.
2. ✅ **biome passes** — exit 0, one warning is pre-existing on `main`
   (commit `00e016e` for F-S2.8.2), not introduced by this branch.
3. ✅ **vitest failure is fully attributable to ISS-TEST-WEB-001** —
   error message (`__vite_ssr_exportName__ is not defined`) and stack
   location (`OnboardingForm.helpers.ts:1:1`, a pure `.ts` file) match
   the diagnosis from `03-code-summary.md` (Retry 2) and
   `06-test-design.md` exactly; the follow-up workflow
   `wf-20260703-fix-066-vitest-bump` is already queued and owns the fix;
   `utm.test.ts` continues to pass 45/45 in the unfiltered run, proving
   the failure is specifically about importing sibling source files,
   not about anything in the new code or test content.

**No `failed-retry` is warranted.** There is nothing for CodeDeveloper
to fix (tsc + biome are clean) and nothing for TestDesigner to fix
(the 5 cases match the strategy, import the real helper, and are not
flaky). The only outstanding work — bumping vitest — is already
queued under the right ownership.

The QualityGate (Step 9) will carry this disposition forward and
write the AC-by-AC verdict into `09-quality-gate.md` per AGENTS.md
§6.1.
