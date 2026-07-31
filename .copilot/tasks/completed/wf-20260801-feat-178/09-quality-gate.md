# 09 — Quality Gate: FR-BOT-002 PR 5/6 — `/interests`

**This is a RE-RUN (attempt 2).** The prior pass (attempt 1, preserved in
git history / superseded below) found one gap:
`.copilot/context/workspace-state.md` was not touched by this PR, flagged
as `failed-retry` because `handoff.yaml.expects_registry_update` was `true`
at the time. The Orchestrator subsequently corrected the root cause: that
flag value was copied from PR 1/6's handoff.yaml at Step 0, but PR 1 is the
outlier in this FR-BOT-002 sequence, not the pattern. This re-run begins by
independently verifying that correction, then re-executes the full check
set from scratch (not just the corrected section), since file/tree state
may have shifted since the prior pass.

---

## Independent Verification of the `expects_registry_update` Correction

Before trusting the Orchestrator's note, spot-checked it directly:

**1. `git log --oneline --all -- .copilot/context/workspace-state.md | head -20`:**

```
69fd309 chore(workflow): archive wf-20260801-feat-177 (FR-BOT-002 PR 4/6 shipped) (#208)
3ce2441 chore(workflow): archive wf-20260801-feat-177 (FR-BOT-002 PR 4/6 shipped)
fb398cc chore(workflow): archive wf-20260801-feat-176 (FR-BOT-002 PR 3/6 shipped, Step 13 clean) (#206)
77cc09c chore(workflow): archive wf-20260801-feat-176 (FR-BOT-002 PR 3/6 shipped, Step 13 clean)
dec60e3 chore(workflow): archive wf-20260801-feat-175 (FR-BOT-002 PR 2/6 shipped) (#204)
7f0a45d chore(workflow): archive wf-20260801-feat-175 (FR-BOT-002 PR 2/6 shipped)
012796c FR-BOT-002: Bot member commands, PR 1 of 6 ... (#201)
d71d5cd feat(bot): FR-BOT-002 PR 1/6 — /help, /events, /event <N> (read-only slice)
...
```

PR 4's (`wf-20260801-feat-177`) workspace-state.md paragraph was added by
commit `3ce2441`/`69fd309` — "chore(workflow): archive wf-20260801-feat-177
(FR-BOT-002 PR 4/6 shipped)". `git show 3ce2441 --stat` confirms this commit
touches `.copilot/context/workspace-state.md` (+71 lines) **alongside** the
task-directory move from `active/` to `completed/` — i.e. it is the
POST-MERGE archive commit, not a commit on PR 4's own shipping branch. Same
pattern holds for PR 2 (`dec60e3`/`7f0a45d`) and PR 3 (`fb398cc`/`77cc09c`).

**2. Prior PRs' `expects_registry_update` values, read directly from their
completed handoff.yaml files:**

```
.copilot/tasks/completed/wf-20260801-feat-177/handoff.yaml:56:expects_registry_update: false   (PR 4/6)
.copilot/tasks/completed/wf-20260801-feat-176/handoff.yaml:76:expects_registry_update: false   (PR 3/6)
.copilot/tasks/completed/wf-20260801-feat-175/handoff.yaml:81:expects_registry_update: false   (PR 2/6)
.copilot/tasks/completed/wf-20260731-feat-174/handoff.yaml:159:expects_registry_update: true   (PR 1/6 predecessor — the outlier)
```

**Conclusion: the correction is verified correct.** PRs 2, 3, and 4 —
3 of the 4 prior PRs in this exact sequence, and the more recent, converged
precedent — all used `expects_registry_update: false`, and in every case
the `workspace-state.md` entry was added only by that PR's own Step 11.5
post-merge archive commit, never by the PR's own Step 9 DocWriter pass.
PR 1's early Step 9 entry was non-representative, early-workflow behavior.
`handoff.yaml.expects_registry_update: false` for this workflow
(`wf-20260801-feat-178`) is correct. Per `quality-gate.md` Check #6's own
text ("If `false` or missing: skip this check entirely"), Check #6
(Context-Update Check) and the `expects_registry_update`-gated portions of
Check #8 (Status-Consistency Check) are **skipped**, not failed, for this
re-run. The attempt-1 finding is superseded, not reinstated.

---

## Workflow Instance

- **Workflow ID:** `wf-20260801-feat-178`
- **Type:** `requirement-development`
- **Requirement:** `FR-BOT-002` — PR 5/6, `/interests` command
- **Branch:** `feature/FEAT-BOT-2-interests-slice`
- **Base:** `main`
- **GitHub Issue:** https://github.com/aiqadam/ai-qadam-platform/issues/140

## Step Completion Check

| Step | Agent | Status | Gate Result |
|---|---|---|---|
| 01 | RequirementAnalyst | completed | passed (attempt 1) |
| 02 | ImpactAnalyzer | completed | passed (attempt 1) |
| 03 (DBMigrationAuthor) | — | **correctly skipped** | N/A — impact analysis confirmed no DB changes required (`member_interests` already exists, fully covered by `MeProfileService`) |
| 04 | CodeDeveloper | completed | passed (attempt 1) |
| 05 | SecurityReviewer | completed | passed (attempt 1) |
| 06 | TestStrategist | completed | passed (attempt 1) |
| 07 (TestDesigner) | TestDesigner | completed | passed (attempt 1) |
| 08 | TestRunner | completed | passed (attempt 1) |
| 09 | DocWriter | completed | passed (attempt 1) |
| 10 | QualityGate | **this re-run** | attempt 2, see Gate Result below |

All required steps executed. The only prior `failed-*` gate result in this
chain (QualityGate attempt 1) has its root cause independently re-verified
as a config error, not a real workflow gap — see above.

## Traceability Check

- **Feature identifier:** `FR-BOT-002` referenced throughout
  `03-code-summary.md` (title, "Requirement Implemented" section, Gate
  Result reasoning) and every other step-output file, and in the bot-repo
  commit message (`feat(bot): /interests command — view and toggle topic
  interests (FR-BOT-002 PR 5/6)`, commit `c1be007`). PR 5/6 numbering is
  consistent across all 9 documents.
- **AC → test mapping:** 11 draft ACs (from `01-requirement-validation.md`)
  are each mapped to at least one test in `06-test-strategy.md`'s
  "Acceptance Criteria → Test Mapping" table and independently
  re-confirmed against actual test file line numbers in
  `06-test-design.md`'s "Acceptance Criteria Coverage" table. Both tables
  agree. Spot-checked the three highest-risk mappings directly against
  test file contents:
  - **AC-7** (mixed-intent toggle-off, the load-bearing test):
    `apps/api/test/telegram-bot-interests-service.spec.ts:255` — present,
    asserting exactly the claimed behavior (`removeInterest` called once
    with `row-learn`'s id, `not.toHaveBeenCalledWith(...)` `row-mentor`'s
    id).
  - **AC-11** (unknown topic → 400, no write):
    `apps/api/test/telegram-bot-interests-controller.spec.ts:115` — present.
  - **AC-6** (callback_data ≤ 64 bytes):
    `apps/bot/tests/test_interests_handler.py:143` — present and
    non-vacuous (asserts length ≤ 64 against the real
    `INTEREST_TOGGLE_PREFIX` constant).
  11/11 covered.

## Test Coverage Check

- **Rubric score:** 5 (New API endpoint +2, business rule with edge cases
  +2, cross-module service call +1, tenant-scoped +0, new DB query +0).
  Nominally crosses the literal ≥4 integration-test threshold, but
  TestStrategist reasoned explicitly (not by rote) that both scoring
  criteria are application-layer logic fully exercisable via a mocked
  service boundary (the AC-7 mixed-intent rule is in-memory filtering over
  an already-mocked `listInterests()` result, not a query-correctness
  question) and concluded unit tests are sufficient — consistent with PR
  2/3/4 precedent, reached by evaluating what the score measures rather
  than applying the number mechanically. Independently re-affirmed in
  `06-test-design.md` by reading `toggleInterest`'s actual method body.
  This reasoning holds up on review, not just on trusting the
  self-reported "passed."
- **Integration tests:** not written; the reasoning above is adequate
  justification for this specific case (proxy-only DB access, zero new
  query shape). Matches every prior FEAT-BOT-2 PR's scoping.
- **All tests pass:** apps/api 1470/1471 (full suite, run twice, identical
  result) — the one failure (`test/users.spec.ts` clock-order flake)
  independently git-stash-verified this session to fail identically on
  unmodified `main`, confirmed unrelated to this PR's diff (no call-graph
  overlap with any file this PR touches). This PR's own 41 new/modified
  tests: 41/41 passing. apps/bot: 146/146 passing.
- **`it.skip` / `pytest.mark.skip` / `xfail`:** none found — TestDesigner's
  self-check grepped all 7 test files, zero matches.
- **`@flaky` tags:** none introduced by this PR. Two pre-existing flakes
  were surfaced and investigated in `07-test-results.md`
  (`users.spec.ts`'s clock-ordering assertion,
  `telegram-admin-status-service.spec.ts`), both confirmed via `git stash`
  comparison against unmodified `main` to be pre-existing and unrelated to
  this PR's changed files.
- **Coverage:** no formal line/branch percentage tool output cited, but
  branch-level coverage was manually verified exhaustively in
  `06-test-design.md`'s "Branch Coverage Check" section (every branch of
  `toggleInterest`, `getInterests`, `requirePlatformUserAndEmail`,
  `handle_interests`, `handle_interest_toggle_callback` traced against
  source line numbers with a named covering test) — satisfies the spirit
  of the 80%/70% target for the PR's new code; no gap flagged as blocking.

## Security Check

`04-security-review.md`: `passed`, 0 BLOCKER, 0 MAJOR findings. All
applicable invariants (INV-1, INV-2, INV-3, INV-4, INV-5, INV-8, INV-9,
INV-10) confirmed PASS with evidence; INV-6/7/11 correctly N/A (internal
service-to-service surface, no cookies/CSRF/public-rate-limit exposure).

Two findings worth double-checking rather than trusting at face value,
both held up on review:
- **INV-4 enum boundary**: `z.enum(INTEREST_TOPICS)` traced end-to-end as
  the sole enforcement point before `MeProfileService.addInterest` (which
  has no Directus-side enum constraint), proven by
  `telegram-bot-interests-controller.spec.ts` to both 400 AND never invoke
  the service on an out-of-list value.
- **INV-9 toggle-off loop**: assessed as a bounded, request-scoped fan-out
  (0-1 realistic iterations, structurally capped by `addInterest`'s own
  dedup and `listInterests`'s `limit=200`) rather than an unbounded N+1 —
  reasoning is sound, not merely asserted; no attacker-controlled input
  drives the iteration count.

No open BLOCKER/MAJOR findings to resolve before merge.

## Branch and Commit Readiness

- **`git status -sb`:**
  ```
  ## feature/FEAT-BOT-2-interests-slice
   M .copilot/meta/next-workflow-id
   M apps/api/src/modules/auth/auth.controller.ts
   M apps/api/src/modules/auth/auth.module.ts
   M apps/api/src/modules/auth/telegram-auth.service.ts
   M apps/api/src/modules/directus/directus-users-bridge.service.ts
   M apps/api/src/modules/me-profile/me-profile.module.ts
   M apps/api/test/directus-users-bridge.spec.ts
  M  apps/bot
   M docs/03-requirements/FR-BOT-002.md
  ?? .copilot/tasks/active/wf-20260801-feat-178/
  ?? apps/api/test/telegram-bot-interests-controller.spec.ts
  ?? apps/api/test/telegram-bot-interests-service.spec.ts
  ```
  No `origin/...` tracking line shown because this branch has not yet been
  pushed — expected at this point in the workflow (Step 10, pre-Step-11
  commit/push/PR), matching PR 4's own precedent. This is **not** a
  clean-tree-invariant violation: the invariant guards against a branch
  that has diverged from its pushed remote counterpart; this branch has
  simply not been pushed yet. All modified/new files match exactly what
  `02-impact-analysis.md` and `03-code-summary.md` declared as this PR's
  scope — no stray or unexplained changes. `apps/bot` submodule pointer is
  staged (`M  apps/bot`), consistent with `03-code-summary.md`'s Submodule
  Commit Sequencing section (bot-side commit `c1be007` already pushed to
  `origin/main` of the bot repo; only the pointer bump is staged in the
  outer repo, not yet committed — reserved for Step 11 per the task's
  explicit instruction).
- **`handoff.yaml.branch`** (`feature/FEAT-BOT-2-interests-slice`) matches
  `git rev-parse --abbrev-ref HEAD` (`feature/FEAT-BOT-2-interests-slice`).
  Match confirmed.
- **Formatter cleanliness:** `pnpm biome check .` (repo-wide, re-run fresh
  for this pass) reports 84 errors / 2 warnings, but these are entirely
  confined to pre-existing, vendored, minified build artifacts unrelated
  to this PR (a Playwright test-runner UI bundle under
  `apps/e2e/uat-results/html-report/trace/*.js` — confirmed by inspecting
  the diagnostic output, which shows minified React/JS bundle content, not
  any file this PR touches) — the same noise source PR 4's own QualityGate
  documented and correctly excluded. Re-scoped the check to exactly this
  PR's 8 changed/new TypeScript files (`auth.controller.ts`,
  `auth.module.ts`, `telegram-auth.service.ts`,
  `directus-users-bridge.service.ts`, `me-profile.module.ts`,
  `directus-users-bridge.spec.ts`, `telegram-bot-interests-controller.spec.ts`,
  `telegram-bot-interests-service.spec.ts`): **clean — "Checked 8 files in
  10ms. No fixes applied."** This matches `03-code-summary.md`'s own claim
  ("`pnpm biome check` on all changed apps/api files — clean") and
  `07-test-results.md`'s claim (`pnpm biome check apps/api/src apps/api/test`
  — clean, 306 files). The repo-wide vendor/build-artifact noise is
  pre-existing and outside this PR's diff — not treated as a gate failure.
- **`github_pr_url`:** currently empty in `handoff.yaml`
  (`workflow_status: "running"`, `current_step: 9`). Expected at this
  stage — QualityGate passing is the prerequisite that unblocks Step 11
  (`commit-push-pr`), which is what populates `github_pr_url`. Not a gate
  failure; the "must be non-empty" requirement applies to
  `workflow_status: completed`, which this workflow is not yet in.

## Production-Readiness / AC Verification (AGENTS.md §6.1) — Hard Gate

All 11 draft ACs from `01-requirement-validation.md` reviewed against
`07-test-results.md`/`06-test-design.md`/`06-test-strategy.md`:

| AC | Status | Evidence |
|---|---|---|
| AC-1 (no interests → all unselected) | verified | `telegram-bot-interests-service.spec.ts:111`; `test_interests_handler.py:104` |
| AC-2 (existing row → selected, any intent) | verified | `telegram-bot-interests-service.spec.ts:134`; `test_interests_handler.py:122` |
| AC-3 (toggle-on, idempotent, in-place edit) | verified | `telegram-bot-interests-service.spec.ts:199`; `test_interests_handler.py:168` |
| AC-4 (toggle-off, in-place edit) | verified | `telegram-bot-interests-service.spec.ts:224`; `test_interests_handler.py:188` |
| AC-5 (API unavailable → unavailable message) | verified | `test_interests_handler.py:86,226`; `test_api_client_interests.py:78,89,154,165` |
| AC-6 (callback_data ≤ 64 bytes) | verified | `test_interests_handler.py:143` — independently spot-checked, non-vacuous |
| AC-7 (mixed-intent toggle-off scoping, load-bearing) | verified | `telegram-bot-interests-service.spec.ts:255` — independently spot-checked, confirmed asserting the exact claimed behavior |
| AC-8 (`help.interests` drops "coming soon") | verified | `test_help_handler.py:98` |
| AC-9 (`/interests` in `BOT_COMMANDS`) | verified | `test_main_wiring.py:28-30,54` |
| AC-10 (`InternalAuthGuard` enforcement) | verified | `telegram-bot-interests-controller.spec.ts:81,137` + reused generic guard coverage (legitimate reuse of an existing class-level guard test, not a gap) |
| AC-11 (unknown topic → 400, no write) | verified | `telegram-bot-interests-controller.spec.ts:115` — independently spot-checked |

**11/11 ACs verified.** No AC is unmarked or `deferred`. No
infrastructure-pre-flight concern applies — this PR requires no live
Docker/service infrastructure beyond what the existing unit-test suite
(mocked collaborators) already covers; `directus-users-bridge.spec.ts`'s
Testcontainers-backed cases (pre-existing pattern, 2 new cases added) ran
as part of the normal `pnpm --filter api test` full-suite run per
`07-test-results.md`, not deferred.

## Documentation Check

- `docs/03-requirements/FR-BOT-002.md` "## Implementation progress"
  updated with the PR 5/6 shipped paragraph, intro-paragraph refresh, and
  Planned-follow-up-PRs table update, per `08-doc-update.md`.
- **Feature marked "✅ implemented":** N/A for this PR specifically —
  `FR-BOT-002.md` frontmatter `status:` correctly remains `Planned`
  (confirmed by direct grep: `status: Planned`) and
  `requirements-registry.md`'s FR-BOT-002 row correctly remains
  `In Progress` (confirmed by direct read, row 58:
  `| 58 | [FR-BOT-002](FR-BOT-002.md) | Member bot commands | In Progress | ...`).
  This is the same intentional, precedented exception documented by PRs
  1-4 of this sequence: FR-BOT-002 ships across a 6-PR sequence and PR 6/6
  (`/upgrade`) has not shipped yet, so flipping to `Implemented`/`Shipped`
  now would misrepresent the FR as complete. `08-doc-update.md` states
  this explicitly — confirmed correct by independent frontmatter/registry
  read, not merely trusted.
- `business_process:` frontmatter confirmed unchanged (`[BP-UAT-010]`).
- `docs/02-business-processes/uat/registry.md` and `architecture.md`:
  DocWriter's stated reasoning for leaving both unchanged was read and is
  sound (no new BP-UAT process introduced; no existing convention in
  `architecture.md` for per-module DI-cycle documentation, even for the
  older `RegistrationsModule` precedent this PR's fix mirrors).

## Status-Consistency Check (FEAT-WORKFLOW-003)

**Skip condition met.** `handoff.yaml.expects_registry_update` is `false`
(corrected value, independently verified above) → this check is skipped
per its own documented opt-out, consistent with PRs 2, 3, and 4 of this
same sequence, all of which also skipped it for the identical reason (a
mid-sequence PR, not the terminal PR that completes the FR).

For transparency, the underlying values were still spot-checked as part of
the Documentation Check above: `FR-BOT-002.md` frontmatter `status:
Planned` and `requirements-registry.md` row `In Progress` agree with each
other and are the correct, intentional non-terminal values for PR 5 of 6.
No inconsistency exists even though the formal check is skipped — this is
not the wf-20260628-fix-033-style bug the check exists to catch (one file
flipping while the other stays stale); neither file flipped, by design.

## GitHub-Issue Link Check

**N/A — no issue files touched this workflow.** `handoff.yaml.issues_created`
is `[]` and `issue_ref` is empty; this is a `requirement-development`
workflow against an existing, already-linked GitHub issue
(`https://github.com/aiqadam/ai-qadam-platform/issues/140`), not an
`issue-resolution` workflow creating new `ISS-*.md` files. `check-github-issue-links.sh`'s
own scoping rule (only issues *this* workflow touched) does not apply.

## Final Assessment

This re-run independently verified the Orchestrator's correction to
`expects_registry_update` before accepting it: git history conclusively
shows PR 4's (and PR 2's, and PR 3's) `workspace-state.md` entries were
added by their own post-merge Step 11.5 archive commits, never by their
Step 9 DocWriter pass, and their completed `handoff.yaml` files confirm
`expects_registry_update: false` was the value used in all three cases —
directly contradicting only PR 1's predecessor workflow, which is the
documented outlier, not the pattern. The correction is right; Check #6 and
the corresponding part of Check #8 are correctly skipped, not failed. With
that resolved, a full fresh re-run of every other check (workflow
completeness, traceability, test coverage, security, branch/commit
readiness including a freshly-run scoped `pnpm biome check` on the actual
changed files, AC verification, documentation, and the GitHub-issue link
check) finds no new gaps and confirms every finding from the attempt-1
pass (outside the one now-superseded context-update finding) still holds:
independently-verified test rigor (TestStrategist/TestDesigner both
re-read test bodies against source line numbers), thorough and
reasoned security review, the unplanned `me-profile.module.ts`
`forwardRef(AuthModule)` fix correctly caught by an existing live-DI-boot
test, and pre-existing/out-of-scope formatter and test-flake noise
correctly excluded. The intentional non-flip of `FR-BOT-002.md`'s status
frontmatter and the registry's Status column (both correctly remaining at
their mid-sequence values) was independently re-verified by direct file
read. This PR is ready for Step 11 (commit-push-pr).

## Gate Result

```yaml
gate: quality-gate
status: passed
attempt: 2
reasoning: >
  Re-run following an Orchestrator correction to handoff.yaml's
  expects_registry_update flag (true -> false), independently verified
  before accepting: git log confirms PR 4's (and PR 2's, PR 3's)
  workspace-state.md paragraphs were added exclusively by their own
  post-merge "chore(workflow): archive wf-..." commits, never by their
  own Step 9 DocWriter pass, and their completed handoff.yaml files
  independently confirm expects_registry_update: false was the value
  used in all three cases (only PR 1's predecessor workflow used true,
  confirmed as the documented outlier). Check #6 (Context-Update Check)
  and the expects_registry_update-gated portion of Check #8
  (Status-Consistency Check) are correctly skipped per quality-gate.md's
  own opt-out text, not failed. The attempt-1 failed-retry finding is
  superseded, not reinstated.
  Full fresh re-run of all other checks performed (not just a patch of
  the corrected section): workflow completeness (all 9 prior steps
  passed, DBMigrationAuthor correctly skipped), traceability (FR-BOT-002
  referenced throughout, 11/11 ACs mapped to tests, three highest-risk
  mappings re-spot-checked against actual test content), test coverage
  (rubric score 5 reasoned honestly to unit-tests-sufficient, zero
  it.skip/xfail, two pre-existing unrelated flakes correctly excluded via
  git-stash verification, exhaustive manual branch coverage), security
  (11 invariants checked, zero BLOCKER/MAJOR, two dedicated assessments
  independently reviewed), branch/commit readiness (git status matches
  declared scope exactly including the staged apps/bot submodule
  pointer; biome check on this PR's 8 actual changed files is clean --
  the repo-wide biome failure is entirely pre-existing vendored
  Playwright trace-viewer build noise unrelated to this PR, same source
  PR 4's QualityGate already documented), all 11 ACs verified (not
  deferred), documentation (FR-BOT-002.md updated; frontmatter/registry
  intentional non-flip independently re-confirmed by direct file read,
  matching the established PR 1-4 precedent for a mid-sequence PR), and
  GitHub-issue link check (N/A, no issue files touched).
  github_pr_url is still empty and workflow_status is still "running" --
  expected at this point, since QualityGate passing is what unblocks
  Step 11 (commit-push-pr), which is what populates the PR URL. Not a
  gate failure.
blocking_issues: []
needs_clarification: []
notes: >
  This gate result supersedes attempt 1's failed-retry, which is now
  understood to have been caused by an incorrect handoff.yaml value
  (copied from PR 1's non-representative early-workflow handoff.yaml)
  rather than a genuine gap in this PR. All findings from attempt 1's
  other checks (traceability, test-coverage rubric reasoning, security,
  branch/commit readiness, Status-Consistency intentional non-flip,
  11/11 AC verification) were re-verified fresh in this pass, not merely
  carried forward, and continue to hold. Orchestrator may proceed to
  Step 11 (commit-push-pr).
```
