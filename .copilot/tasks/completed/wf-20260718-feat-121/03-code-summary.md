# Code Summary — wf-20260718-feat-121

## Requirement Implemented

**FR-WORKFLOW-005 — Read-only QA target mode for agent-driven UAT sessions**

Adds an explicit `target` selector (`local` default | `qa` explicit opt-in) to
the `uat-verification` workflow and the UATRunner agent. `target: local`
behavior is unchanged (Docker/localhost pre-flight, `http://localhost:4321`
landing URL, `pnpm uat:seed [--reset]`). `target: qa` resolves the session's
landing URL to `https://qa.aiqadam.org`, replaces the Docker/localhost
pre-flight with an HTTPS reachability check against `qa.aiqadam.org` and
`auth.qa.aiqadam.org`, and **never** invokes seed/reset against QA
(structurally enforced, not just documented). Implements AC-1 through AC-7 of
`01-requirement-validation.md`.

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `scripts/uat-qa-preflight-check.sh` | New | QA-target HTTPS reachability pre-flight script. Checks `https://qa.aiqadam.org` (or `--base-url` override) and the fixed `https://auth.qa.aiqadam.org` IdP host for a 2xx/3xx response each; exits 1 naming whichever host failed. Prints the AC-3c read-only message verbatim. Supports `UAT_QA_PREFLIGHT_HTTP_CODES` test hook (format `host=code,host=code`) to simulate success/failure per host without real network access. Contains zero occurrences of the seed-invocation token anywhere in its source (structural enforcement of AC-3c, verified by a bats regression guard). |
| `scripts/tests/uat-qa-preflight-check.bats` | New | 13 regression tests: both-hosts-healthy (200 and 3xx variants), QA-app-down, QA-IdP-down, both-down, AC-3c message presence (including on the failure path), the structural `grep -c` seed-token guard, `--help`/`-h`, `--base-url` override, and invocation-error paths (missing value, unrecognized flag). |
| `.copilot/agents/uat-runner.md` | Modified | **Session setup:** added explicit `landingUrl` resolution — read `uat_target` from `handoff.yaml` (default `local`), resolve to `http://localhost:4321` or `https://qa.aiqadam.org` before `UATSessionDriver.create()` — closing the pre-existing gap where `landingUrl` was referenced but never assigned (AC-2, AC-5). **Pre-Flight Checks:** split into a `target: local` block (verbatim copy of prior content, unchanged) and a new `target: qa` block that runs `scripts/uat-qa-preflight-check.sh` instead of Docker/curl checks and explicitly notes seed/reset is never invoked (AC-3c). |
| `.copilot/workflows/uat-verification.md` | Modified | **Overview:** updated the stale "runs against a local stack (localhost)" line to reflect the new local/qa target split, still asserting prod is never targeted. **Step 0:** added a note that `uat_target` is read from the invocation (or defaults to `local`) and validated against the `local`/`qa` allowlist at this step, rejecting anything else with `failed-escalate`. **Step 2 Pre-Flight:** added a parallel `target: qa` conditional branch (mirrors the agent file) running `scripts/uat-qa-preflight-check.sh` and skipping Docker/localhost checks and seed entirely; updated the Gate section to cover both target's failure-message shapes. **Scope Constraints:** replaced the single "must be localhost" bullet with a three-state allowlist description (`local` default / `qa` explicit opt-in / everything else hard-blocked at Step 0), no longer using "localhost" as a synonym for "non-production" (AC-4). |
| `.copilot/schemas/handoff.schema.yaml` | Modified | Added additive `uat_target` field (default `"local"`) directly after `context_sync_commits`, in the same comment-block style as the existing `expects_registry_update` field: documents the `local`/`qa` values, notes it's only meaningful for `workflow_type: uat-verification`, and states the default-when-absent backward-compatibility rationale (AC-6). |

**Not changed** (confirmed out of scope per the impact analysis and verified
by `git status`/`git diff` before finishing): `scripts/uat-seed.sh`,
`apps/e2e/support/uat-session-driver.ts`, `apps/e2e/playwright.uat.config.ts`,
`scripts/uat-preflight-check.sh`.

`.copilot/meta/next-workflow-id` shows as modified in `git status` but that
edit was made by the Orchestrator at Step 0 of this workflow (counter
increment for `wf-20260718-feat-121`), before CodeDeveloper started — not a
CodeDeveloper change.

---

## Key Design Decisions

1. **New script vs. inline `curl` in the doc.** The impact analysis flagged
   this as CodeDeveloper's call, contingent on how much logic the QA
   pre-flight ends up needing. I chose the script (`scripts/uat-qa-preflight-check.sh`)
   because: (a) it needed to check *two* hosts with distinct failure
   messages — already past "2-3 curl lines"; (b) it is the only path to
   genuine automated coverage per the impact analysis's own testability
   framing; (c) it mirrors the established `uat-preflight-check.sh` pattern
   (color helpers, test-hook env var, usage/exit-code contract), so it reads
   as "the same idiom, different check" rather than a new convention.

2. **Test hook shape (`UAT_QA_PREFLIGHT_HTTP_CODES`).** Modeled on
   `UAT_PREFLIGHT_PROBE_OUTPUT` but simpler, since the QA check only needs an
   HTTP status code per host, not a PID/CommandLine pair. Chose a
   comma-separated `host=code` list (rather than one env var per host) so a
   single test can set both hosts' synthetic codes in one line, and so a
   host *not* named in the hook still falls through to a real probe for that
   host only (useful if a future test wants to mock one host and let the
   other hit the real network — not used today, but keeps the hook
   composable).

3. **`code_from_test_hook` returns 1 (not a code) when the host is absent
   from the hook**, so `check_host` can `if code="$(code_from_test_hook "$host")"` and
   cleanly fall back to `probe_http_code` — avoids a sentinel value that
   could collide with a real/simulated HTTP status.

4. **AC-3c structural guard.** Initially the script's own doc comments
   mentioned the literal string `pnpm uat:seed` (to explain why it's absent),
   which made the intended `grep -c 'uat:seed'` regression guard find 2
   matches — both were prose, not invocations, but a naive grep can't tell
   the difference. Rather than write a comment-aware/heredoc-aware regex
   (fragile, and this repo has no precedent for that kind of guard), I
   reworded the two doc comments to say "the fixture-seeding pnpm script"
   instead of the literal token. This keeps the regression guard exactly as
   specified in the task (`grep -c 'uat:seed' scripts/uat-qa-preflight-check.sh`
   expecting `0`) — simple, robust, and it happens to also be true: the
   script's source contains zero occurrences of the seed command anywhere,
   including in comments, which is a *stronger* guarantee than "not on an
   executable code path."

5. **`--base-url` override, fixed IdP URL.** Per the task spec, `--base-url`
   overrides only the app-under-test URL; the IdP check
   (`https://auth.qa.aiqadam.org`) is not overridable, since QA has exactly
   one Authentik instance and there's no scenario where a caller would want
   to point the reachability check at a different IdP while still calling it
   "the QA pre-flight."

6. **`landingUrl` resolution shown as pseudocode inline in the existing
   TypeScript session-setup snippet**, not as prose, per the task's explicit
   instruction that AC-5 requires the variable's source to be a concrete
   code/pseudocode line. Used `handoff.uat_target ?? 'local'` to mirror the
   schema's own default-when-absent semantics rather than inventing a
   different fallback convention.

7. **Heading levels in `uat-verification.md` Step 2.** The new `target: local`
   / `target: qa` sub-sections use `####` (not `###`) since they nest under
   the existing `### Step 2: Pre-Flight` heading — avoids two sibling `###`
   headings at the same conceptual level as `### Step 2` itself, which would
   have broken the document's heading hierarchy. `uat-runner.md` uses `###`
   for its two sub-branches since there they nest directly under the `##
   Pre-Flight Checks` H2, consistent with that file's existing `###` usage
   elsewhere (e.g. "Verdict-flip rule").

8. **Overview blurb touch-up (small, outside the task's explicit file-section
   list).** `uat-verification.md`'s `## Overview` had a sentence — "This
   workflow runs against a local stack (`localhost`). It NEVER targets
   production" — that directly contradicts the new Scope Constraints section
   a few dozen lines below once `qa` becomes a valid target. Left uncorrected
   it would read as an internal contradiction in the same file, so I updated
   just that one sentence to name both targets while keeping the "never
   production" guarantee. This is the one edit not explicitly itemized in
   the task instructions; flagging it here for visibility rather than
   silently expanding scope.

---

## Architecture Rule Compliance

This is a `.copilot/`-tooling-only change (confirmed by both
`01-requirement-validation.md` and `02-impact-analysis.md`); the NestJS
module-boundary / tenant-scoping / Zod-at-boundary / cross-schema-query /
`any`-typing / auth-at-controller-level rules in `AGENTS.md` §3 do not apply
to this diff — no `apps/api/`, `apps/web*/`, `apps/bot/`, `apps/workers/`, or
`packages/shared-types/` file is touched. Confirmed by `git diff --stat`
(only `.copilot/` and `scripts/` paths changed).

Shell-script-specific self-check (this repo's applicable equivalent for a
`.sh` change):
- [x] `set -euo pipefail` at the top (matches `uat-preflight-check.sh`)
- [x] Exit-code contract documented and honored: 0 pass, 1 check failure, 2
      invocation error
- [x] Test hook documented in the script header exactly like the existing
      script's `UAT_PREFLIGHT_PROBE_OUTPUT` block
- [x] No unguarded external command whose failure isn't handled — `curl`
      failure is caught via `|| printf '000'`, not left to propagate under
      `set -e`
- [x] No `pnpm uat:seed` invocation anywhere in the script (verified by both
      manual `grep -c` and the bats regression test)

---

## Formatter Check

No `.ts`/`.js` files were touched, so `pnpm biome check --apply` was not run
(per the Orchestrator's explicit instruction that this step doesn't apply to
this bash/markdown-only change). No Python files touched, so `ruff format`
does not apply either.

Shell validation performed instead:
- `bash -n scripts/uat-qa-preflight-check.sh` — syntax OK.
- `shellcheck` — not installed in this environment; skipped (reported
  honestly, not fabricated). Manual review against `uat-preflight-check.sh`'s
  idioms (quoting, `set -euo pipefail`, `local` variable scoping in all
  functions) was performed instead.

**Bats suite result for the new test file:**

```
bash scripts/run-bats.sh scripts/tests/uat-qa-preflight-check.bats
1..13
ok 1 AC-3a/b: both QA hosts healthy passes with exit 0
ok 2 AC-3a/b: both QA hosts healthy via 3xx also passes
ok 3 AC-3b: QA app host down fails with exit 1 and names qa.aiqadam.org
ok 4 AC-3b: QA IdP host down (connection failure) fails with exit 1 and names auth.qa.aiqadam.org
ok 5 AC-3b: both QA hosts down fails with exit 1 and names both hosts
ok 6 AC-3c: read-only / never-invoked-against-QA message is printed verbatim
ok 7 AC-3c: read-only message is printed even on failure (always logged before checks)
ok 8 AC-3c: structural regression guard — script source contains no uat:seed token
ok 9 bonus: --help exits 0 with usage on stdout
ok 10 bonus: -h exits 0 with usage on stdout
ok 11 bonus: --base-url override is honoured and checked against the test hook
ok 12 bonus: --base-url with missing value exits 2 (invocation error)
ok 13 bonus: unrecognized flag exits 2 (invocation error)
```

**13/13 passing.** Run via `scripts/run-bats.sh`, which resolved to the local
`node_modules/bats/bin/bats` (system `bats` is not on PATH in this
environment; the wrapper's fallback chain handled it transparently, matching
its documented behavior).

**Full-suite run (`pnpm test:bash`, all `scripts/tests/*.bats`):** executed
twice for confirmation; both runs terminated with the pnpm-reported "Command
failed with exit code 1" — but the failures are entirely inside
`scripts/tests/check-workflow-state.bats` (11 pre-existing failures: AC-3,
AC-2 ×3, AC-1 ×5, AC-8, a regression test), a file this task does not touch.
I isolated this by `git stash`-ing all of this task's changes and re-running
`bash scripts/run-bats.sh scripts/tests/check-workflow-state.bats` against
the untouched baseline — the same failures reproduce there, confirming they
predate this change (likely a Windows LF/CRLF `core.autocrlf` environment
quirk in this sandbox, given the `warning: ... LF will be replaced by CRLF`
noise around each failing test's git operations — not something this PR
introduces or is responsible for fixing). My stash was popped back
immediately after the isolation check; `git status` before writing this
summary shows exactly the 7 files listed above (plus the pre-existing
`next-workflow-id` counter bump from Step 0), nothing else.

My new file (`uat-qa-preflight-check.bats`) ran cleanly to completion (13/13)
in both full-suite runs, with no interaction with the `check-workflow-state.bats`
failures — confirmed by grepping the captured full-suite log for
`uat-qa-preflight-check` test names, all of which show `ok`.

---

## Known Limitations

1. **No live network verification against the real `qa.aiqadam.org` /
   `auth.qa.aiqadam.org` was performed by CodeDeveloper.** The bats suite
   uses the `UAT_QA_PREFLIGHT_HTTP_CODES` test hook exclusively — this is
   the same limitation the sibling `uat-preflight-check.sh` /
   `uat-preflight-check.bats` pair has (test hook only, no real-network CI
   assertion). Per the impact analysis's Test Scope section, a live
   verification run against the real QA hosts is expected as a separate
   TestRunner/Orchestrator step of this FR's own workflow, not something
   CodeDeveloper self-certifies. The script's default `--base-url` and fixed
   IdP URL are correct per the requirement (`https://qa.aiqadam.org`,
   `https://auth.qa.aiqadam.org`), but their actual reachability was not
   re-verified here.

2. **`.copilot/agents/uat-runner.md` and `.copilot/workflows/uat-verification.md`
   are prose/pseudocode documents, not executable code** — there is no
   parser/linter that validates the `landingUrl` TypeScript snippet compiles
   or that the bash snippets in the pre-flight sections are syntactically
   correct beyond visual review. This matches the impact analysis's
   "Testability Risk" finding: no unit-test framework wraps `.copilot/`
   markdown. The one part of this FR that *is* executable
   (`uat-qa-preflight-check.sh`) has full bats coverage; the doc-only parts
   do not and cannot short of a live workflow dry-run.

3. **`shellcheck` is not installed in this environment** — static-analysis
   coverage for the new script is limited to `bash -n` (syntax only) plus
   manual idiom-matching against the existing `uat-preflight-check.sh`. No
   `shellcheck`-specific findings could be checked or reported.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-WORKFLOW-005 implemented — new scripts/uat-qa-preflight-check.sh + bats suite (13/13 passing), uat-runner.md and uat-verification.md updated with target: local/qa branching (landingUrl resolution, pre-flight, Scope Constraints), handoff.schema.yaml gained an additive uat_target field. No product code touched; pre-existing check-workflow-state.bats failures confirmed unrelated via stash-isolated baseline run."
  findings:
    - "AC-1 through AC-7 all addressed: local-target byte-identical behavior preserved (AC-1), landingUrl resolution explicit for both targets (AC-2, AC-5), QA pre-flight script checks both hosts and never seeds (AC-3a/b/c), Scope Constraints revised to a three-state local/qa/everything-else model (AC-4), handoff.yaml gains uat_target with local default (AC-6), FR-WORKFLOW-003/004 mechanisms untouched (AC-7)."
    - "Structural (not just documented) enforcement of AC-3c: scripts/uat-qa-preflight-check.sh contains zero occurrences of the seed-invocation token anywhere in its source, verified by both a manual grep and a bats regression test (test 8/13)."
    - "5-file footprint as scoped: 1 new script, 1 new bats file, 2 doc edits, 1 schema edit — plus the pre-existing next-workflow-id counter bump from the Orchestrator's Step 0 (not a CodeDeveloper change). Comfortably under small-PR discipline."
    - "Full pnpm test:bash run surfaces pre-existing failures in check-workflow-state.bats unrelated to this change (confirmed via git-stash isolation against the untouched baseline) — reported honestly rather than suppressed or claimed as caused by this PR."
    - "shellcheck unavailable in this environment; reported as a known limitation rather than fabricating a clean-shellcheck claim."
```
