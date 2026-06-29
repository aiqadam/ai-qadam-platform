# 06-test-design.md — Test Design (wf-20260629-fix-039)

**Step:** 7 (TestDesigner)
**Date:** 2026-06-29
**Issue:** ISS-UAT-013-8 — `operator_invites.email` plus-addressing vs seeded Authentik user email mismatch
**Branch:** `fix/ISS-UAT-013-8-invite-email-match`
**Strategy ref:** [06-test-strategy.md](06-test-strategy.md)
**Code ref:** [03-code-summary.md](03-code-summary.md)
**Security ref:** [04-security-review.md](04-security-review.md)

---

## Plan

Per the test strategy, no new bats file is needed. The strategy explicitly
chose to **tighten the existing `scripts/tests/uat-seed.bats` in place**
(§"Is a New bats File Needed? → Verdict: NO"). The strategy's §"Optional
Edits" table further recommended a single new `@test` block on top of
the two existing AC-1 blocks — the email-distribution check.

I followed both directives:

1. **Verified the existing Step 4 tightening** (count → 4, summary includes
   `uat-onboard-no-user-token`). Both pass static analysis.
2. **Adjusted the existing AC-1 mock-count regex.** Step 4 used
   `grep -c 'operator_invite .*(mock)'` (BRE literal `(mock)`). Because
   the seed's mock line format includes additional text inside the
   parens (the new `email=…`), that pattern no longer matches
   `(mock, email=…)`. I changed it to `grep -cE 'operator_invite .*\(mock'`
   which matches the prefix `(mock` and is format-extending — i.e. it
   will keep matching if the format string ever grows another field.
3. **Added the optional AC-1 email-distribution `@test` block** (one new
   block, ~9 lines). To make it possible I also extended the seed's
   mock-mode `ok` line to include the email (1-line change in
   `scripts/uat-seed.sh` at the early-return branch of
   `ensure_operator_invite`). The change is hermetic (mock mode only)
   and does not touch the live path.
4. **Did NOT create a new bats file.** Strategy explicit.
5. **Did NOT touch `apps/api/` code.** Strategy explicit.
6. **Did NOT touch `apps/e2e/tests/uat/`.** That is Step 4's domain.

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

| File | Count | Focus | Required? |
|---|---|---|---|
| (none added) | 0 | The new `Neg 005` E2E test is on disk from Step 4 (`BP-UAT-013-signup.spec.ts`). It is **not** in the TestDesigner's scope per the strategy. | No — added in Step 4 |

### Doc-regression (BATS)

| File | Count | Focus | Required? |
|---|---|---|---|
| [scripts/tests/uat-seed.bats](../../../scripts/tests/uat-seed.bats) | 8 | (was 6 — Step 4 tightened count + summary-name; this step fixed the count regex and added 1 new email-distribution test) AC-1 mock count = 4, AC-1 summary echoes 4 token names, AC-1 per-row email distribution (3 bare + 1 plus-addressed), AC-2 DIRECTUS_TOKEN guard, AC-3 idempotency GET, AC-4 env-vars × 3. | Yes |

---

## Acceptance Criteria Coverage

| AC | Test | File:Line | Status |
|---|---|---|---|
| AC-1 (3 happy rows use bare email; 4th row uses plus-addressed email) | `AC-1: mock mode exits 0 and provisions all 4 operator_invite tokens` | `uat-seed.bats:42-55` | Tightened (Step 4) + regex fix (this step) |
| AC-1 (summary echoes all 4 token names) | `AC-1: mock mode summary lists all four token names` | `uat-seed.bats:57-66` | Tightened (Step 4) |
| AC-1 (3 happy + 1 plus-addressed email distribution) | `AC-1: three happy rows share the bare operator email; the no-user row is plus-addressed` | `uat-seed.bats:68-82` | **Added (this step)** |
| AC-2 (live UAT re-run of Step 006) | (E2E — out of scope for this workflow per issue's "Out of scope") | n/a | Deferred to follow-up UATRunner |
| AC-3 (suffix convention removed from `BP-UAT-013.md`) | Doc-presence BATS (indirect) + E2E persona-label assertion | `uat-seed.bats` summary; spec L282 `UAT Operator (valid)` | Covered (Step 4 doc + Step 4 Neg 005 spec) |
| AC-4 (new negative scenario for `invite_missing_authentik_user`) | (E2E — already on disk from Step 4) | `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` Neg 005 | Covered (Step 4) |

---

## Test Design Decisions

| Decision | Rationale |
|---|---|
| Fix the existing `grep -c 'operator_invite .*(mock)'` regex (Step 4 left it using the literal pattern `(mock)`, which would no longer match the new format `(mock, email=…)`) | The Step 4 tightening was incomplete: the seed's mock line was changed to include the email (per the strategy's "simplest approach" recommendation) but the existing count regex was not adjusted. Without this fix, the AC-1 mock-count test would fail with the new format. The fix is forward-compatible — matches `(mock` as a prefix and tolerates any additional fields. |
| Use ERE (`grep -E`) consistently for the new and updated assertions | BRE and ERE differ on `(`, `)`, `+`, `?`, `{`, `|`. Mixing them in one suite is a footgun. The new test uses ERE throughout; the existing AC-3 grep uses BRE alternation which still works in both engines. |
| Match the literal `+` in the no-user email via character class `[+]` | In ERE, `+` is the "one or more" quantifier. The character class `[+]` is the portable way to match a literal `+` in ERE without an engine-specific escape. |
| Change the seed's mock-mode `ok` line to include the email | This is the **simplest non-invasive** path per the strategy's "Implementation note" (`extend the ok line in scripts/uat-seed.sh to include the email`). It is a 1-line change in mock mode only (the early-return branch of `ensure_operator_invite`) and does not affect the live path, the .mock file, or any Directus payload. The four live-mode branches are untouched. |
| Keep the comment in `uat-seed.sh` honest | The added comment in the mock-mode block explains **why** the format includes the email (grep-friendly for the bats regression) — per AGENTS.md §3 ("Comments explain why, not what"). |
| Reuse `test_helper` (load 'test_helper') like the prior version of this file | Already loaded; no need to add. The helper provides `REPO_ROOT` derivation patterns and other shared utilities. |
| `local` variables in the new `@test` block | Matches the existing AC-1 mock-count test's style (`local count`). Per AGENTS.md §1.6 (smallest possible scope). |
| No new bats file | Strategy decision, justified. The new 9-line block is additive on top of the tightened count + summary assertions. |

---

## Known Test Gaps

| Gap | Why | Mitigation |
|---|---|---|
| AC-2 (live BP-UAT-013 Step 006 re-run) not covered by this workflow | Requires a live Docker stack + re-seed cycle; out of scope per the issue's "Out of scope" section. | UATRunner follow-up workflow (`wf-20260630-uat-031-rerun-bp-uat-013`, suggested). Documented in [06-test-strategy.md](06-test-strategy.md) "Deferred Verification". |
| E2E Neg 005 (live `invite_missing_authentik_user` flow) not executed in this workflow | Same reason — live stack required. The spec is on disk from Step 4 with API + UI assertions per the wf-20260629-fix-038 rule. | UATRunner follow-up workflow. |
| The new `uat-seed.bats` AC-1 mock-count regex (`\(mock`) is a prefix match | A future mock-mode format that drops the literal `(mock` substring (e.g. moves to a JSON output) would silently break the count. | Documented in the inline comment in the new test. If the format ever changes, the regex must change in lockstep. |

---

## Anti-Patterns Avoided

- **No new bats file** — strategy explicit, and a new file would duplicate
  the AC-1 invariant that's already covered by the existing file.
- **No Node / Python script for a regression that grep can express** —
  the email distribution is asserted via `grep -cE` on the mock output.
- **No Testcontainers / Docker** — bats suite is hermetic (mock mode
  bypasses all external calls).
- **No `it.skip`** — every assertion is enabled.
- **No `--force` / `--legacy-peer-deps`** — no new packages.
- **No new dependencies** — bats already in repo.
- **No `eval`, no dynamic imports** — all regexes are literal strings;
  `grep -cE` is invoked with a fixed pattern.
- **No magic numbers** — the only literal in the new test is the
  expected count `3` and `1` for bare and plus-addressed rows,
  respectively. These are derived from the strategy's "exactly 3 bare
  + 1 plus-addressed" invariant, not arbitrary thresholds.
- **Bounded additions** — the new `@test` block is 15 lines (including
  blank lines and comment). The whole file went from 84 → 99 lines, well
  under AGENTS.md §1.4's 60-line *function* rule and well under the
  "small PR" 400-line cap.
- **Comments explain why** — the inline comment in the new test
  explains why `[+]` is used (portability across ERE implementations);
  the inline comment in `uat-seed.sh` explains why the mock line
  includes the email (grep-friendly for the bats regression).
- **No mocking of the seed file** — the test runs the real `uat-seed.sh`
  with `UAT_SEED_DIRECTUS_MOCK=1`; that's the point.
- **No new mocks / stubs / fakes** — `UAT_SEED_DIRECTUS_MOCK` was the
  existing mechanism, and its line format was extended (not replaced).

---

## Run Output

> **Note:** The current session has the terminal tool **disabled**, so I
> could not run `bash scripts/run-bats.sh scripts/tests/uat-seed.bats`
> directly. The expected output below is the result of **static
> analysis** against the on-disk files (verified by reading
> [scripts/uat-seed.sh](../../../scripts/uat-seed.sh) and
> [scripts/tests/uat-seed.bats](../../../scripts/tests/uat-seed.bats)).
> The TestRunner step in the workflow will execute the actual `bats`
> invocation and capture the canonical TAP output. This is the same
> pattern used in [wf-20260629-fix-038/06-test-design.md](../../completed/wf-20260629-fix-038/06-test-design.md),
> which had the same constraint and the same outcome (5/5 green on
> first run, per its 07-test-results.md).

### Static analysis against on-disk files

#### AC-1 mock-count (was 3, now 4)

| Input line (from mock output of `uat-seed.sh`) | Regex `operator_invite .*\(mock` | Match? |
|---|---|---|
| `  ✓ operator_invite uat-onbo (mock, email=uat-operator@aiqadam.test)` | yes | ✓ |
| `  ✓ operator_invite uat-onbo (mock, email=uat-operator@aiqadam.test)` | yes | ✓ |
| `  ✓ operator_invite uat-onbo (mock, email=uat-operator@aiqadam.test)` | yes | ✓ |
| `  ✓ operator_invite uat-onbo (mock, email=uat-operator+no-user@aiqadam.test)` | yes | ✓ |

**Expected count: 4.** Pass.

#### AC-1 summary (4 token names)

| Substring | Present in `uat-seed.sh` summary block? |
|---|---|
| `uat-onboard-token` | yes (line ~458) |
| `uat-onboard-used-token` | yes (line ~459) |
| `uat-onboard-expired-token` | yes (line ~460) |
| `uat-onboard-no-user-token` | yes (line ~461) |

**Expected: 4/4 substring matches.** Pass.

#### AC-1 email-distribution (NEW)

| Pattern | Matches in mock output | Expected |
|---|---|---|
| `operator_invite .*\(mock, email=uat-operator@aiqadam\.test\)` | 3 (valid, used, expired) | 3 |
| `operator_invite .*\(mock, email=uat-operator[+]no-user@aiqadam\.test\)` | 1 (no-user) | 1 |

**Expected: 3 bare + 1 plus-addressed.** Pass.

#### AC-2, AC-3, AC-4 (untouched)

These are the pre-existing structural grep tests; they don't depend on
the mock-line format and are unaffected by this step. Pass.

### Expected TAP output (when TestRunner executes the suite)

```
1..8
ok 1 AC-1: mock mode exits 0 and provisions all 4 operator_invite tokens
ok 2 AC-1: mock mode summary lists all four token names
ok 3 AC-1: three happy rows share the bare operator email; the no-user row is plus-addressed
ok 4 AC-2: uat-seed.sh has a DIRECTUS_TOKEN guard that emits a FATAL message
ok 5 AC-3: ensure_operator_invite has idempotency GET check before POST
ok 6 AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN
ok 7 AC-4: uat-env-setup.sh contains UAT_ONBOARD_USED_TOKEN
ok 8 AC-4: uat-env-setup.sh contains UAT_ONBOARD_EXPIRED_TOKEN

8 tests, 0 failures
```

---

## Sibling Regression

| Suite | File | Expected |
|---|---|---|
| `scripts/tests/bp-uat-template-rule.bats` | [bp-uat-template-rule.bats](../../../scripts/tests/bp-uat-template-rule.bats) | 5/5 green (no changes to that file in this workflow; this step's bats changes are isolated to `uat-seed.bats` and the `ensure_operator_invite` mock line in `uat-seed.sh`, which is not referenced by `bp-uat-template-rule.bats`) |

The sibling suite's regexes (5 sub-assertions of AC-3 from
wf-20260629-fix-038) target `BP-UAT-template.md` and are unaffected by
this workflow's diff. Pass expected.

### Static analysis against the sibling file

| Sub-assertion | File under test | Expected |
|---|---|---|
| AC-3.1 header | `BP-UAT-template.md` rule subsection header | pass (no diff to template) |
| AC-3.2 API-contract phrase | `BP-UAT-template.md` "API contract" phrase | pass (no diff to template) |
| AC-3.3 vacuous-UI phrase | `BP-UAT-template.md` "vacuous UI" phrase | pass (no diff to template) |
| AC-3.4 lives under `## Negative Scenarios` | awk window in `BP-UAT-template.md` | pass (no diff to template) |
| AC-3.5 fenced TypeScript snippet | `BP-UAT-template.md` fenced block | pass (no diff to template) |

### Expected TAP output (sibling, when TestRunner executes the suite)

```
1..5
ok 1 AC-3: rule subsection header is present in BP-UAT-template.md
ok 2 AC-3: rule mandates the API contract alongside UI assertions
ok 3 AC-3: rule forbids vacuous UI assertions
ok 4 AC-3: rule lives under ## Negative Scenarios (not orphaned)
ok 5 AC-3: rule includes a fenced TypeScript snippet with page.request.get

5 tests, 0 failures
```

---

## Stash-and-Revert Proof (TestRunner Action)

The TestRunner step is expected to perform the following stash-and-revert
proof (mirroring [wf-20260629-fix-038/07-test-results.md](../../completed/wf-20260629-fix-038/07-test-results.md)):

```bash
# Revert the count-4 tightening only — keeps the seed's mock line format
# but brings the count assertion back to 3.
git stash --keep-index -- scripts/tests/uat-seed.bats
bash scripts/run-bats.sh scripts/tests/uat-seed.bats
# Expect: AC-1 mock-count test FAILS (expected 4, got 4 — wait, that
# would still pass). To actually demonstrate the proof, the stash should
# revert the seed's *fourth* row addition:
git stash --keep-index -- scripts/uat-seed.sh
bash scripts/run-bats.sh scripts/tests/uat-seed.bats
# Expect: AC-1 mock-count test FAILS (expected 4, got 3). The new AC-1
# email-distribution test also FAILS (3 bare still 3, 1 plus still
# expected 1 → mismatch).
git stash pop
```

The stash-and-revert proof is delegated to TestRunner. The TestDesigner
documents the expected outcome here; the actual `git stash` invocation
requires shell access that is not available in this session.

---

## Honesty / Scope Disclosures

1. **The terminal tool is disabled in this session.** I could not run
   `bash scripts/run-bats.sh scripts/tests/uat-seed.bats` or the sibling
   suite. The expected TAP output is the result of static analysis
   against the on-disk files. The TestRunner step is the canonical
   executor; the
   [wf-20260629-fix-038/07-test-results.md](../../completed/wf-20260629-fix-038/07-test-results.md)
   precedent confirms this is the workflow's intended division of labor.
2. **The Step 4 tightening of the AC-1 mock-count regex was incomplete.**
   The strategy's §"Implementation note" recommended extending the seed's
   `ok` line to include the email, but Step 4 did not do that. As a
   result, the `grep -c 'operator_invite .*(mock)'` pattern from Step 4
   would NOT have matched the new format `(mock, email=…)` if the seed
   line had been changed. In this step I both (a) extended the seed's
   mock line to include the email (per the strategy's recommendation)
   AND (b) updated the existing AC-1 count regex to be format-extending
   (`\(mock` prefix). The order matters: the count regex fix is
   independent of the seed-line change — even without the seed-line
   change, the new regex would still work on the old format.
3. **The new AC-1 email-distribution test is recommended, not required.**
   Per the strategy's §"Optional Edits" table: "The TestDesigner may
   add this; if they do, the file grows by ~6 lines, still well within
   the small-PR rule." I chose to add it because it strengthens AC-1
   from "4 rows exist" to "4 rows exist with the right email per row",
   which is the actual invariant the fix is supposed to guarantee.
4. **No new bats file.** Strategy explicit. Justified in
   [06-test-strategy.md](06-test-strategy.md) §"Is a New bats File
   Needed?".
5. **No changes to `apps/api/`, no changes to `apps/e2e/tests/uat/`.**
   Per the strategy's boundary ("Step 7/Step 8 bats-regression surface
   only"). The `BP-UAT-013-signup.spec.ts` Neg 005 from Step 4 is
   unchanged.
6. **The 1-line change to `uat-seed.sh` is in mock mode only.** The
   live `curl POST` path is untouched. The mock line format was
   extended, not replaced. The four live-mode call sites
   (`ensure_operator_invite … "UAT Operator (valid)"`, etc.) are
   unchanged.
7. **The `display_name` field is not asserted in the bats suite.**
   The display_name is wired through `ensure_operator_invite` and
   appears in the live Directus payload, but in mock mode it is not
   echoed. The new bats test asserts the **email distribution**, which
   is the actual invariant of the fix. The display_name path is covered
   by the Step 4 E2E Neg 005 (which reads the rendered persona label).
8. **Stale-row risk in already-seeded Directus is documented but not
   tested.** Per
   [02-impact-analysis.md](02-impact-analysis.md) and
   [04-security-review.md](04-security-review.md) §"Stale-Row Risk".
   Mitigation lives in the PR description, not in code.
9. **The `uat-env-setup.sh` heredoc was not changed in this step.**
   The strategy recommended changing it only if the seed line format
   was changed. The new `ok` line format is purely an internal mock
   format — `uat-env-setup.sh` writes the `UAT_ONBOARD_NO_USER_TOKEN`
   env var to `.env.uat`, which is consumed by the Playwright spec (not
   by the bats suite). No change to the heredoc needed.

---

## Files Changed (this step)

| File | Change Type | Lines | Reason |
|---|---|---|---|
| `scripts/uat-seed.sh` | modify | +5 | Extend the mock-mode `ok` line to include the email; add an explanatory comment. 1-line functional change, 4 lines comment. |
| `scripts/tests/uat-seed.bats` | modify | +18 | (a) Tighten the existing AC-1 mock-count regex to `\(mock` (1 line) + update comment (3 lines). (b) Add new AC-1 email-distribution `@test` block (15 lines including blank lines and comment). |
| **Total** | — | **+23** | Well under the 400-line "small PR" cap. 2 files changed (within the 5-file cap). |

No files created. No files deleted.

---

## Links

- Test file: [scripts/tests/uat-seed.bats](../../../scripts/tests/uat-seed.bats)
- Seed file: [scripts/uat-seed.sh](../../../scripts/uat-seed.sh)
- Sibling test file: [scripts/tests/bp-uat-template-rule.bats](../../../scripts/tests/bp-uat-template-rule.bats)
- Runner: [scripts/run-bats.sh](../../../scripts/run-bats.sh)
- Test helper: [scripts/tests/test_helper.bash](../../../scripts/tests/test_helper.bash)
- Strategy: [.copilot/tasks/active/wf-20260629-fix-039/06-test-strategy.md](06-test-strategy.md)
- Code summary: [.copilot/tasks/active/wf-20260629-fix-039/03-code-summary.md](03-code-summary.md)
- Security review: [.copilot/tasks/active/wf-20260629-fix-039/04-security-review.md](04-security-review.md)
- Impact analysis: [.copilot/tasks/active/wf-20260629-fix-039/02-impact-analysis.md](02-impact-analysis.md)
- Issue: [ISS-UAT-013-8](../../../issues/ISS-UAT-013-8.md)
- Handoff: [.copilot/tasks/active/wf-20260629-fix-039/handoff.yaml](handoff.yaml)
- Precedent (terminal-disabled TestDesigner):
  [.copilot/tasks/completed/wf-20260629-fix-038/06-test-design.md](../../completed/wf-20260629-fix-038/06-test-design.md)
- Precedent (TestRunner live output):
  [.copilot/tasks/completed/wf-20260629-fix-038/07-test-results.md](../../completed/wf-20260629-fix-038/07-test-results.md)

---

## Gate Decision

```
status: passed
attempt: 1
timestamp: 2026-06-29T22:30:00Z
summary: The existing scripts/tests/uat-seed.bats was correctly tightened
  by Step 4 (AC-1 mock-count = 4, summary includes uat-onboard-no-user-token,
  AC-2/3/4 untouched). This step (a) extended the seed's mock-mode ok
  line to include the email so the optional AC-1 email-distribution
  test can grep the per-row distribution, and (b) added the optional
  AC-1 email-distribution @test block (15 lines, asserts 3 bare +
  1 plus-addressed). Also fixed the existing AC-1 mock-count regex
  (the Step 4 literal '(mock)' pattern would not have matched the
  new format '(mock, email=...)' if the seed line had been changed;
  now uses ERE '\(mock' which is format-extending). Total bats file
  grew 84 → 99 lines. No new bats file. No apps/api/ changes. No
  apps/e2e/tests/uat/ changes (Step 4's domain). 2 files changed,
  +23 net lines — well under the 400-line small-PR cap. Terminal
  tool is disabled in this session, so the live bats run is delegated
  to the TestRunner step; the expected TAP output (8/8 pass for
  uat-seed.bats, 5/5 pass for the sibling bp-uat-template-rule.bats)
  is recorded above as static analysis.
next_action: invoke TestRunner (Step 8) to execute
  `bash scripts/run-bats.sh scripts/tests/uat-seed.bats` and the
  sibling `bp-uat-template-rule.bats`, then the stash-and-revert
  proof, then capture the canonical TAP output in 07-test-results.md.
```
