# Test Results — wf-20260718-feat-121

## Scope Note

FR-WORKFLOW-005 is a `.copilot/`-tooling + shell-script change. The diff
(confirmed via `git status`/`git diff --name-only main...HEAD`) touches
exactly:

- `scripts/uat-qa-preflight-check.sh` (new, bash)
- `scripts/tests/uat-qa-preflight-check.bats` (new, bats — 14 tests)
- `.copilot/agents/uat-runner.md` (doc)
- `.copilot/workflows/uat-verification.md` (doc)
- `.copilot/schemas/handoff.schema.yaml` (schema/doc)
- `.copilot/meta/next-workflow-id` (Orchestrator's Step 0 counter bump, not a code change)

**Zero `.ts`/`.js`/`.py` files are touched.** `pnpm test` (Vitest) and
`INTEGRATION_TEST=1 pnpm test:integration` (Testcontainers) exercise only
TypeScript source in `apps/api`, `apps/web-next`, etc. — there is no code
path in this diff for either suite to hit. Rather than silently omitting
them or fabricating a result, I ran `pnpm test` once anyway as a
belt-and-suspenders regression check (see below): it passes, confirming
nothing broke, but this is not meaningful coverage *of this diff* — the
actual test suite for this change is the bats suite covered in detail
below. `INTEGRATION_TEST=1 pnpm test:integration` was not additionally run
since it is Testcontainers/Postgres-backed and this diff has no schema,
query, or service-layer surface for it to exercise — same reasoning as
`pnpm test`, without a fresh run since `pnpm test` already gave the
belt-and-suspenders signal for "did I break anything in the TS codebase."

---

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Bats — target file (`scripts/tests/uat-qa-preflight-check.bats`) | 14 | 14 | 0 | 0 |
| Bats — full suite (`scripts/tests/*.bats`, 12 files) | 139 | 129 | 10 | 0 |
| Unit (Vitest, `pnpm test`) — belt-and-suspenders, not diff-specific | 1267 (98 files) | 1267 | 0 | 0 |
| Integration (Testcontainers) | N/A | — | — | Not applicable — no DB/service surface in this diff |
| E2E (Playwright) | N/A | — | — | Not applicable — out of scope per `06-test-strategy.md` |

All 10 full-suite bats failures are confined to `scripts/tests/check-workflow-state.bats`
and are pre-existing/unrelated to this PR — see **Failed Tests** below for
the independent verification performed.

---

## Type Check

`pnpm typecheck` — **clean.** 0 errors, 0 warnings, 37 hints (all in files
untouched by this diff — `csat-form.test.ts`, `use-tg-broadcasts.test.ts`,
`onboard.astro`, etc.; pre-existing `noUnusedLocals`-style hints, not
introduced here). 4/4 workspace tasks successful.

## Lint / Format Check

`pnpm biome check .` — **clean (exit code 0).** 2 warnings reported, both in
files this diff does not touch:

- `apps/web-next/src/blocks/workspace/AsyncSelect.tsx:251` (unused
  suppression comment)
- `apps/web-next/src/blocks/workspace/TgBroadcastComposer.tsx:478` (unused
  suppression comment)

Confirmed unrelated by `git diff --name-only main...HEAD` (neither file
appears in this branch's diff) and by `git log -1` on each file (last
touched by an unrelated prior PR, `ISS-CI-001 PR#4`). Per the task
framing, these are pre-existing and not a blocker — noted here for
completeness, not treated as a failed-retry-code since CodeDeveloper
touched zero biome-scoped files (verified via `git diff --stat`: only
`.copilot/` and `scripts/` paths changed).

---

## Failed Tests

| Test | File | Error | Classification |
|---|---|---|---|
| AC-2: --base origin/main exits 0 on a clean repo | `scripts/tests/check-workflow-state.bats` | `[ "$status" -eq 0 ]` failed | **Pre-existing, unrelated to this PR** |
| AC-1: --base origin/main exits 1 when workspace-state.md references a missing workflow | `scripts/tests/check-workflow-state.bats` | assertion failed | **Pre-existing, unrelated to this PR** |
| AC-1: archived/ is recognised as a valid task-dir home (ISS-WF-13-1 regression) | `scripts/tests/check-workflow-state.bats` | assertion failed | **Pre-existing, unrelated to this PR** |
| AC-1: active/ is recognised as a valid task-dir home | `scripts/tests/check-workflow-state.bats` | assertion failed | **Pre-existing, unrelated to this PR** |
| AC-1: completed/ is recognised as a valid task-dir home | `scripts/tests/check-workflow-state.bats` | assertion failed | **Pre-existing, unrelated to this PR** |
| AC-1: missing FR file in requirements-registry.md triggers drift | `scripts/tests/check-workflow-state.bats` | assertion failed | **Pre-existing, unrelated to this PR** |
| AC-2: --base origin/HEAD works (alt ref) | `scripts/tests/check-workflow-state.bats` | assertion failed | **Pre-existing, unrelated to this PR** |
| AC-8: drift diagnostic is written to stderr, not stdout | `scripts/tests/check-workflow-state.bats` | assertion failed | **Pre-existing, unrelated to this PR** |
| AC-2: success summary goes to stdout | `scripts/tests/check-workflow-state.bats` (line 129) | `[ "$status" -eq 0 ]` failed | **Pre-existing, unrelated to this PR** |
| regression: SHA-suffixed ISS IDs (PRSteward auto-registered) do NOT trigger phantom drift | `scripts/tests/check-workflow-state.bats` (line 167) | `[ "$status" -eq 0 ]` failed | **Pre-existing, unrelated to this PR** |

**Independent verification performed (not just cited from the code
summary or trusted from the Orchestrator's note):**

1. Ran the full suite myself: `bash scripts/run-bats.sh scripts/tests/*.bats`
   (139 tests across all 12 `.bats` files). Result: 10 failures, all in
   `check-workflow-state.bats`; all other 11 files (including the 14 new
   `uat-qa-preflight-check.bats` tests) pass clean.
2. Isolated the baseline myself: `git stash push -u` (stashed all 6
   changed/untracked paths belonging to this workflow), then ran
   `bash scripts/run-bats.sh scripts/tests/check-workflow-state.bats`
   against the clean `main`-equivalent tree. Result: **identical 10
   failures, identical test names** (`AC-2: --base origin/main exits 0 on
   a clean repo`, `AC-1: --base origin/main exits 1 ...`, `AC-1:
   archived/...`, `AC-1: active/...`, `AC-1: completed/...`, `AC-1:
   missing FR file...`, `AC-2: --base origin/HEAD...`, `AC-8: drift
   diagnostic...`, `AC-2: success summary goes to stdout`, `regression:
   SHA-suffixed ISS IDs...`). Only 4 tests in that file pass in both runs
   (`--help`, `--skip`, invocation-error, missing-base-ref).
   `git stash pop` restored the working tree immediately after
   (`git status` confirmed the same 6 paths as before the stash, nothing
   lost or added).
3. Confirmed `scripts/run-bats.sh` genuinely propagates bats' real exit
   code (it `exec`s bats directly under `set -euo pipefail`) — ran
   `check-workflow-state.bats` alone and got exit code 1, and
   `uat-qa-preflight-check.bats` alone and got exit code 0, ruling out any
   ambiguity from an earlier piped (`| tail`) invocation that could have
   masked the real exit status.

Root cause is very likely a Windows `core.autocrlf` / CRLF-vs-LF sandbox
quirk (the bats run emits `warning: ... LF will be replaced by CRLF`
noise around the git operations these specific tests perform) — but
regardless of root cause, the failures reproduce byte-for-byte on an
untouched baseline, so they cannot be caused by this PR's diff.

No test in `check-workflow-state.bats` is a test-logic bug introduced by
this workflow, and no code file this workflow touches is implicated —
this is a standing, pre-existing condition of the repo's bats
environment on this machine.

---

## Flaky Tests

None observed. All 14 target-file tests and all 129 passing full-suite
tests passed deterministically on every run (target file run twice,
full suite run twice).

---

## Coverage

- **Line/branch coverage of `scripts/uat-qa-preflight-check.sh`:** high for
  the documented AC surface — happy path (2xx and 3xx), both failure paths
  (app down, IdP down via the `000` connection-failure sentinel, both
  down), the AC-3c read-only message on both success and failure, the
  structural no-seed regression guard, CLI ergonomics (`--help`, `-h`,
  `--base-url` override, invocation errors), and (test 14, added by
  TestDesigner) the IdP URL's non-overridability via `--base-url`.
- **Known, documented gap** (per `06-test-design.md`, not discovered fresh
  here but independently confirmed by reading the script and the bats
  file): `probe_http_code()` (the real `curl` call) and the
  `code_from_test_hook`-miss fallback branch in `check_host()` have zero
  bats coverage, because every existing test sets the
  `UAT_QA_PREFLIGHT_HTTP_CODES` hook for both hosts. This is a legitimate,
  intentionally-left gap (closing it needs curl-mocking with no precedent
  in this repo's bats suite) — not something this step re-opens or needs
  to re-litigate.
- **Doc/schema-only files** (`uat-runner.md`, `uat-verification.md`,
  `handoff.schema.yaml`): no automated coverage exists or is possible in
  this repo (no parser/linter for workflow markdown or YAML-schema
  comments) — confirmed by `Grep` finding zero `.bats` files referencing
  `handoff.schema` or these two markdown files. This matches
  `02-impact-analysis.md`'s and `06-test-design.md`'s prior findings; not
  a new gap discovered at this step.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Ran the full required check set for this .copilot/-tooling + bash/bats-only diff: pnpm typecheck clean (0 errors), pnpm biome check . clean (exit 0, 2 pre-existing warnings in files this diff does not touch), target bats file scripts/tests/uat-qa-preflight-check.bats 14/14 passing, full bats suite (139 tests/12 files) shows only the pre-existing check-workflow-state.bats failures (10/14) which I independently reproduced identically against a git-stash-isolated clean baseline. pnpm test (Vitest) run as a belt-and-suspenders check despite zero TS/JS files in this diff: 1267/1267 passing, confirming no regression. Integration/E2E suites correctly classified as not applicable -- no DB, service, or browser surface in this diff's files."
  findings:
    - "pnpm typecheck: 0 errors across all 4 workspace tasks; 37 pre-existing hints in files unrelated to this diff, not introduced here."
    - "pnpm biome check .: exit code 0 (clean per gate semantics); 2 warnings present but both in AsyncSelect.tsx/TgBroadcastComposer.tsx, confirmed absent from git diff --name-only main...HEAD and last touched by an unrelated prior PR (ISS-CI-001 PR#4) -- not this workflow's responsibility."
    - "scripts/tests/uat-qa-preflight-check.bats: 14/14 passing, run directly by me (not cited from an earlier agent's summary) -- matches TestDesigner's 06-test-design.md count of 14 (13 CodeDeveloper + 1 TestDesigner)."
    - "Full bats suite (bash scripts/run-bats.sh scripts/tests/*.bats, 139 tests/12 files): 129 pass, 10 fail, all 10 failures isolated to scripts/tests/check-workflow-state.bats. Independently verified these are pre-existing by git-stash-isolating this workflow's 6 changed/untracked paths and re-running check-workflow-state.bats alone against the resulting clean baseline -- identical 10 failing test names reproduced. Stash was popped back immediately; git status confirmed the working tree was restored exactly."
    - "Confirmed scripts/run-bats.sh correctly propagates bats' real exit code (not masked by a prior piped invocation): check-workflow-state.bats alone exits 1, uat-qa-preflight-check.bats alone exits 0."
    - "pnpm test (Vitest unit suite): 1267/1267 tests passing across 98 files, run once as a belt-and-suspenders regression check even though this diff contains zero TypeScript/JavaScript files -- confirms no incidental breakage, but is not meaningful coverage of this diff's actual content (the bats suite is)."
    - "INTEGRATION_TEST=1 pnpm test:integration and E2E (Playwright) correctly classified as not applicable -- no DB/service/browser surface exists in this diff's files, consistent with 06-test-strategy.md's Integration/E2E Test Plans."
    - "No new test-design or code gaps found beyond what 06-test-design.md already documented (the probe_http_code real-curl fallback branch, and the doc/schema-only files having no test framework) -- both re-confirmed, not re-opened."
```
