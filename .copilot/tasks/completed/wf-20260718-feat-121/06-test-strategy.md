# Test Strategy — wf-20260718-feat-121

## Requirement

**FR-WORKFLOW-005 — Read-only QA target mode for agent-driven UAT sessions**

Adds an explicit `target` selector (`local` default | `qa` explicit opt-in)
to the `uat-verification` workflow and the UATRunner agent. `target: local`
is byte-identical to pre-FR behavior. `target: qa` resolves `landingUrl` to
`https://qa.aiqadam.org`, replaces the Docker/localhost pre-flight with an
HTTPS reachability check (`scripts/uat-qa-preflight-check.sh`) against
`qa.aiqadam.org` and `auth.qa.aiqadam.org`, and structurally never invokes
seed/reset against QA. See `01-requirement-validation.md` for AC-1 through
AC-7 in full.

This is a `.copilot/`-tooling + shell-script change: two agent/workflow
markdown files, one additive `handoff.schema.yaml` field, one new shell
script, and its bats regression test. No product code, API, DB, frontend,
bot, or worker surface is touched (confirmed independently in
`02-impact-analysis.md`).

---

## Rubric Score

| Criterion | Applies? | Points |
|---|---|---|
| Touches tenant-scoped data | No | 0 |
| New API endpoint | No | 0 |
| Business rule with edge cases (capacity, waitlist, dates) | No | 0 |
| Cross-module service call | No — `curl` against an already-deployed public HTTPS host is not an internal service call (confirmed in impact analysis's "Cross-Module Calls" table: none) | 0 |
| New database query | No | 0 |
| Pure function / utility | Yes, for the one piece of real logic in scope — `uat-qa-preflight-check.sh`'s host-reachability checking (`check_host`/`probe_http_code`/`code_from_test_hook` are pure-ish shell functions: given inputs, they compute an exit code and message, no persistent state) | 0 |
| UI-only change (no logic) | N/A | — |

**Total score: 0.**

**Honest justification, not inflated:** every point-bearing criterion in the
rubric is written for `apps/api/src/modules/` NestJS product code — tenant
scoping, endpoints, business rules with capacity/date edge cases,
cross-module service calls, and Drizzle queries. None of those concepts
exist in this diff. The rubric's only applicable row is "pure function /
utility," which scores 0 by design. There is no honest path to a score ≥ 4
here: doing so would require treating a `curl` health-check script as
equivalent to a tenant-scoped business-rule service, which it is not. The
impact analysis independently reached the same conclusion in its own "Test
Scope" section (Integration: not applicable, no DB/service/Testcontainers
target; E2E: not applicable to this FR directly).

**Score < 4 → Unit tests sufficient** per the rubric's threshold table. In
this repo's `.copilot/`-tooling context, "unit tests" concretely means
**bats regression tests** for the one executable artifact
(`scripts/uat-qa-preflight-check.sh`), which is the established
shell-test-tier precedent set by `scripts/uat-preflight-check.sh` +
`scripts/tests/uat-preflight-check.bats`. The prose/schema changes
(`uat-runner.md`, `uat-verification.md`, `handoff.schema.yaml`) have no
test tier at all under this rubric or under `standards.md` Part IV's test
pyramid — there is no parser/runner in this repo that executes workflow
markdown or YAML-schema-comment prose as code, and Part IV's "Not measured"
line already excludes "infrastructure scripts" from the coverage-percentage
targets, which by extension excludes prose that isn't even a script.

---

## Required Test Levels

- [x] Unit — shell/bats regression tests for `scripts/uat-qa-preflight-check.sh` (this repo's unit-test-equivalent tier for shell tooling; not Jest/Vitest, since no TypeScript/JavaScript is introduced)
- [ ] Integration (Testcontainers) — not applicable; no DB, no service, nothing Testcontainers would spin up (confirmed in impact analysis)
- [ ] E2E (Playwright) — not applicable; `apps/e2e/playwright.uat.config.ts`'s `UAT_BASE_URL` parameterization is explicitly out of scope for this FR (separate regression-net layer, not the agent-driven session layer this FR touches)

**Additional, non-rubric test level used by this FR:** manual/live
verification, for the ACs that are pure prose/config with no executable
surface (AC-4, AC-6 in part, and the doc-only halves of AC-1/AC-2/AC-5/AC-7).
This is not a rubric tier — it is the honest fallback the impact analysis's
"Testability Risk" section already named for `.copilot/` markdown, and it is
carried forward here rather than fabricated as automated coverage.

---

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `scripts/uat-qa-preflight-check.sh` — `check_host` / `probe_http_code` / `code_from_test_hook` (via full-script invocation, using the `UAT_QA_PREFLIGHT_HTTP_CODES` test hook — no real network) | Both `qa.aiqadam.org` and `auth.qa.aiqadam.org` return 2xx or 3xx → exit 0, "QA pre-flight passed" | QA app host down (non-2xx/3xx or `000`) → exit 1, names `qa.aiqadam.org`; QA IdP host down → exit 1, names `auth.qa.aiqadam.org`; both down → exit 1, names both |
| `scripts/uat-qa-preflight-check.sh` — read-only message (AC-3c) | Message printed verbatim on success | Message printed verbatim on failure too (always logged before checks run) |
| `scripts/uat-qa-preflight-check.sh` — structural no-seed guard (AC-3c) | `grep -c 'uat:seed'` on the script's own source returns `0` | N/A — this is a static-source assertion, not a runtime path; there is no "failure path" to test beyond the guard itself catching a future regression |
| `scripts/uat-qa-preflight-check.sh` — CLI surface | `--help` / `-h` → exit 0, usage printed; `--base-url <url>` → overrides app-under-test URL, IdP URL stays fixed | `--base-url` with missing value → exit 2, usage on stderr; unrecognized flag → exit 2, usage on stderr |

No other public function/script is introduced by this FR. `uat-runner.md`'s
`landingUrl` TypeScript pseudocode snippet and `uat-verification.md`'s Step 0
target-allowlist validation are not executable — they cannot be unit tested
without inventing a parser this repo doesn't have (see Acceptance Criteria
mapping below for how those ACs are covered instead).

---

## Integration Test Plan

**Not applicable.** No service, no database table, no Testcontainers target.
The QA pre-flight branch calls `curl` against already-deployed public HTTPS
endpoints (`qa.aiqadam.org`, `auth.qa.aiqadam.org`) — this is an external
reachability probe, not an internal service-to-service call, and is
correctly excluded from this tier (confirmed in `02-impact-analysis.md`
"Cross-Module Calls": none).

---

## E2E Test Plan

**Not applicable.** No Playwright flow is introduced or modified by this FR.
`apps/e2e/playwright.uat.config.ts`'s independent `UAT_BASE_URL`
parameterization is explicitly out of scope (it already supports pointing
the regression-net at QA; this FR's `target` axis is for the separate
agent-driven session layer). The agent-driven UAT session itself (UATRunner,
FR-WORKFLOW-004's perceive/decide/act/judge loop) is not a Playwright test
suite — it is a live, one-off agent session, verified per-run via
`02-uat-report.md` and the post-session gate scripts
(`uat-navigation-check.sh`, `uat-visual-check.sh`, `uat-teardown-check.sh`),
none of which this FR modifies (AC-7).

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| AC-1 (local target byte-identical) | Manual/live verification | No executable diff to `target: local`'s code path exists to unit-test — `uat-runner.md`'s `target: local` branch and `uat-verification.md`'s Step 2 `target: local` block are verbatim copies of pre-FR prose (confirmed by code summary). Verified by diff-reading the pre/post prose (done at CodeDeveloper/TestDesigner review) plus a live/dry-run workflow invocation with no `target` specified, confirming Docker/localhost checks and `pnpm uat:seed [--reset]` still fire exactly as before. |
| AC-2 (QA target resolves `https://qa.aiqadam.org` as `landingUrl`) | Manual/live verification | `uat-runner.md`'s `landingUrl` resolution is a TypeScript pseudocode snippet in a prose doc — not compiled or executed by any test runner. Verified by inspection (the snippet reads `UAT_TARGET === 'qa' ? 'https://qa.aiqadam.org' : ...`) and, definitively, by a live `target: qa` session confirming `driver.goto()` receives the QA URL and `02-uat-report.md`'s `**Environment:**` field shows it. |
| AC-3a (Docker/localhost checks skipped for `target: qa`) | Manual/live verification (doc-only branch condition) + indirectly by unit test | The branch-selection logic lives in workflow-doc prose (`uat-verification.md` Step 2's `target: qa` vs `target: local` headings), not code — no unit test can execute "did the Orchestrator choose the right doc block." What **is** unit-tested is that the QA-branch's actual check script (`uat-qa-preflight-check.sh`) contains no Docker/localhost-port logic at all (confirmed by reading the script: it only does HTTP GET probes) — this is a structural, inspectable guarantee, not a runtime-asserted one. |
| AC-3b (HTTPS reachability check against both hosts, fails on non-2xx/3xx) | Unit (bats) | `scripts/tests/uat-qa-preflight-check.bats` tests 1–5: both-hosts-healthy (200 and 3xx), QA-app-down, QA-IdP-down, both-down — each asserts exit code and that the failing host is named in output. |
| AC-3c (never invokes seed/reset against QA, logs why) | Unit (bats) — both the message and the structural no-seed guard | Tests 6–7: read-only message printed verbatim on both success and failure. Test 8: `grep -c 'uat:seed' scripts/uat-qa-preflight-check.sh` asserts `0` — the script's source contains zero occurrences of the seed-invocation token anywhere, a stronger structural guarantee than "not reached at runtime." This directly satisfies the AC-3c requirement text: "A test asserting `pnpm uat:seed` was not exec'd during a `target: qa` pre-flight run must pass." |
| AC-4 (Scope Constraints hard-blocks everything but `local`/`qa`) | Manual/live verification (prose-only, no test framework) | `uat-verification.md`'s revised "Scope Constraints" section is prose describing an allowlist check the Orchestrator performs at Step 0 — there is no code artifact to unit test. Coverage is: (a) inspection confirming the revised prose states the three-state model and drops "localhost" as a synonym for "non-production" (both present per code summary); (b) a dry-run/inspection check — attempt an invocation with `target: prod` and confirm the documented gate fires `failed-escalate` before Step 1, performed once during this FR's own live-verification pass, not as a repeatable automated test. **No automated coverage is fabricated for this AC** — it is doc-only per the impact analysis's honest framing. |
| AC-5 (`landingUrl` source explicit for both targets) | Manual/live verification | Same instrument as AC-2 — inspection of the `uat-runner.md` snippet (`const UAT_TARGET = handoff.uat_target ?? 'local'`) plus live-session confirmation. This closes a real pre-existing gap (the Orchestrator's flagged issue that `landingUrl` was referenced but never assigned) but the closure itself is prose, not executable, so it cannot be unit-tested beyond what AC-2's live check already covers. |
| AC-6 (`handoff.yaml` records `uat_target`, default `local`) | Manual/live verification (schema/config, no test framework) | `handoff.schema.yaml`'s new `uat_target` field is a commented YAML template, not a JSON-Schema/Zod validator with a test suite. Verified by inspection (field present, default `"local"`, documented values `local`/`qa`, backward-compat default-when-absent note) and by a live workflow run's actual `handoff.yaml` showing the field populated after Step 0. No bats or Jest test exists (or is invented) for YAML-comment prose. |
| AC-7 (no regression to FR-WORKFLOW-003 / FR-WORKFLOW-004) | Manual/live verification + negative confirmation via file diff | No unit test suite covers `uat-seed.sh`'s `reset_localhost_guard` behavior changing, because it didn't change — confirmed by `git diff` showing `scripts/uat-seed.sh`, `apps/e2e/support/uat-session-driver.ts`, and `apps/e2e/playwright.uat.config.ts` untouched (code summary "Not changed" list, independently re-verifiable via `git diff --stat`). The post-session gate scripts (`uat-navigation-check.sh`, `uat-visual-check.sh`, `uat-teardown-check.sh`) are likewise untouched. This AC's test is a diff-absence check, not a positive runtime assertion — appropriate for a "did not regress" claim about code this FR never edited. |

**Every AC (AC-1 through AC-7) is mapped.** Two ACs (AC-3b, AC-3c) have
genuine automated bats coverage. The remaining five (AC-1, AC-2, AC-4, AC-5,
AC-6, AC-7 — six, not five; AC-3a is also manual/structural-inspection, not
bats) are honestly manual/live-verification or inspection-based, because
they describe prose/config/doc behavior with no test framework wrapping
`.copilot/` markdown or `handoff.schema.yaml` comments in this repo. This
matches `02-impact-analysis.md`'s "Testability Risk" and "Test Scope"
sections precisely — no automated coverage is fabricated for the doc-only
ACs.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-WORKFLOW-005 test strategy complete — rubric scores 0 (no tenant data, no endpoint, no business-rule edge cases, no cross-module call, no DB query); unit tier (bats) applies to scripts/uat-qa-preflight-check.sh only; all 7 ACs mapped honestly, with AC-3b/AC-3c getting genuine automated bats coverage and the remaining doc/schema-only ACs mapped to manual/live verification rather than fabricated automated tests."
  findings:
    - "Rubric score is 0, not inflated to force Integration/E2E tiers: no tenant-scoped data, no new API endpoint, no capacity/waitlist/date business rule, no cross-module NestJS service call, no new DB query anywhere in this diff (independently re-confirmed against 02-impact-analysis.md's Cross-Module Calls and DB Changes Required tables, both empty/no)."
    - "Score < 4 -> Unit tests sufficient per the rubric threshold. Concretely this means bats regression tests for the one executable artifact (scripts/uat-qa-preflight-check.sh) -- this repo's established shell-unit-test tier, mirroring scripts/uat-preflight-check.sh + scripts/tests/uat-preflight-check.bats."
    - "AC-3b and AC-3c are the only ACs with real automated (bats) coverage -- both are properties of the one executable file this FR introduces. AC-1, AC-2, AC-4, AC-5, AC-6, AC-7 map to manual/live verification or static inspection because they describe .copilot/ markdown prose or handoff.schema.yaml comments, for which no test framework exists in this repo -- consistent with 02-impact-analysis.md's Testability Risk section, not a gap introduced by this strategy."
    - "No fabricated coverage: AC-4 (Scope Constraints prose) and AC-6 (handoff schema field) explicitly state 'no automated test exists or is invented' rather than claiming synthetic coverage."
```
