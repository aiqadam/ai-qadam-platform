# ISS-CI-003 — CI failures regressed again (biome complexity + storybook rolldown build)

| Field | Value |
|---|---|
| ID | ISS-CI-003 |
| Severity | blocker |
| Module | ci/infrastructure |
| Status | resolved (won't fix as filed) |
| Reported | 2026-07-03 |
| Resolved | 2026-07-03 |
| Workflow | wf-20260703-fix-069-biome-scope |
| Reporter | Orchestrator (PR #87, wf-20260703-feat-063 close-out) |
| Predecessor | ISS-CI-001 (resolved 2026-06-24), ISS-CI-002 (resolved 2026-07-02) |

## Symptom

Both `ci` and `storybook` checks are failing on `main`'s own current HEAD
(`6000697b922a1545a9016205ed4c9fe470d02a0b`), independent of any specific PR.
Confirmed via `gh api repos/tvolodi/aiqadam/commits/main/check-runs`:

```
{"conclusion":"failure","head_sha":"6000697...","name":"ci"}
{"conclusion":"failure","head_sha":"6000697...","name":"storybook"}
```

### `ci` job — biome complexity errors

```
./apps/api/src/modules/workspace/tg-broadcasts.service.ts:266:17
  lint/complexity/noExcessiveCognitiveComplexity
  Excessive complexity of 14 detected (max: 10).
  Function: sanitizeButtons

./apps/api/src/modules/workspace/tg-segments.service.ts:257:10
  lint/complexity/noExcessiveCognitiveComplexity
  Excessive complexity of 15 detected (max: 10).
  Function: validateLeafOp

(plus at least one more complexity-15 finding earlier in the same job log,
truncated in the captured tail — re-run `pnpm biome check .` on main to get
the full list)
```

### `storybook` job — same rolldown build error as ISS-CI-002's sibling report

```
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @aiqadam/storybook@0.0.0 build:
  `storybook build -o storybook-static`
Exit status 1
```
Stack trace roots in `rolldown@1.1.3`'s `aggregateBindingErrorsIntoJsError` /
`@storybook/builder-vite`'s vite build path — same failure class flagged as
a candidate follow-up in `ISS-CI-002`'s "Proposed resolution" table
("Investigate rolldown binding error in Storybook build") but apparently
never fixed, only the nodemailer/pnpm-audit half of that issue was resolved.

## Why this is a blocker

GitHub branch protection on `main` requires these jobs to pass before merge.
Confirmed via PR #87 (`feature/FR-WORKFLOW-003-uat-fixture-reset`,
`wf-20260703-feat-063`): that PR touches only `scripts/uat-seed.sh`,
`scripts/uat-fixtures/*.json`, and 8 markdown/agent-definition doc files —
zero overlap with `apps/api/src/modules/workspace/*` or the Storybook build
config — yet both checks failed identically to `main`'s own HEAD, confirming
this is systemic, not something the PR introduced.

## Reproduction

```bash
gh api repos/tvolodi/aiqadam/commits/main/check-runs \
  --jq '.check_runs[] | select(.name=="ci" or .name=="storybook") | {name, conclusion, head_sha}'
```

## Relationship to prior issues

- **ISS-CI-001** (resolved 2026-06-24): arch-check + biome + pnpm-audit, unrelated failure signatures — closed via PRs #37-#41.
- **ISS-CI-002** (resolved 2026-07-02): nodemailer CVEs (`pnpm audit`) + the same storybook/rolldown symptom noted as a "future" line item, not actually fixed. Its resolution (PR #82) only addressed the nodemailer half. **The storybook half of ISS-CI-002 was never closed and has now resurfaced as part of this issue.**
- **This issue (ISS-CI-003)** is a third, distinct regression class for the `ci` job (biome cognitive-complexity, not audit/arch-check) plus the still-unresolved storybook/rolldown carryover from ISS-CI-002.

## Proposed resolution

| Fix | Resolves |
|---|---|
| Refactor `sanitizeButtons()` (`tg-broadcasts.service.ts:266`) and `validateLeafOp()` (`tg-segments.service.ts:257`) to reduce cognitive complexity below the biome-configured max of 10 (extract helper functions / early-return guard clauses) | `ci` job biome complexity errors |
| Re-run `pnpm biome check .` on a clean `main` checkout to confirm the full error list (log tail was truncated in this issue's capture) before starting the refactor, in case more than the 2 cited functions are affected | Completeness of the fix |
| Investigate the `rolldown@1.1.3` / `@storybook/builder-vite` binding error (likely a peer-version mismatch) — this was already identified as a follow-up in ISS-CI-002 and should finally be actioned | `storybook` job |

## Honesty disclosures

- Filed by the Orchestrator while closing out `wf-20260703-feat-063` (PR #87). PR #87's own content is unaffected by and does not fix this issue — it is a pre-existing, systemic `main`-branch problem.
- Per user's explicit instruction, PR #87 was merged with an admin override past these two failing required checks (see PR #87's merge record) rather than waiting for this issue to resolve first, since PR #87's own files have zero overlap with the failure surface. This bypass was authorized in chat, not unilaterally decided by the Orchestrator.

## Resolution (2026-07-03, wf-20260703-fix-069-biome-scope)

Closed `won't fix as filed`. The original symptom was based on a **truncated CI
log capture** that mixed warnings with errors. With the full rule-level
breakdown from `pnpm exec biome check . --reporter=summary` on the current
`main` HEAD, the picture is materially different:

| Original claim (this issue's "ci" symptom) | Reality on `main` |
|---|---|
| `lint/complexity/noExcessiveCognitiveComplexity` is a CI-blocking error | It is configured at `level: "warn"` — produces **0 errors**, only 864–890 warnings. Exit code 0 if filtered to complexity only. |
| Specific functions (`sanitizeButtons`, `validateLeafOp`) need refactoring | Those functions' complexity scores are warnings, not errors. Refactoring them would not change CI status. |
| CI step failure is caused by biome complexity | The `Lint + format check (Biome)` step fails because of ~20k pre-existing style violations across the whole repo (`noCommaOperator` 4,480; `noAssignInExpressions` 5,444; `noVar` 2,392; etc.) — not complexity. |

### What changed in this PR (`wf-20260703-fix-069-biome-scope`)

The user explicitly directed (2026-07-03, chat): "GitHub for me is a simple
external drive like Google Drive, no more, no less" and "check that biome and
his friends will not spend time on useless warnings. Turn them off don't waste
CPU time on it." Two changes land in this PR:

1. **`packages/biome-config/biome.json`** — explicitly disable 30+ noisy
   `recommended`-set rules that produce cosmetic noise without catching real
   bugs. Kept only the high-signal rules:
   - `noUnusedVariables`, `noUnusedImports`, `noUnusedFunctionParameters` (dead-code catch)
   - `noExplicitAny` (sloppy-type catch)
   - `useTemplate`, `useConst`, `noNonNullAssertion` (small cheap wins)

   Effect: `pnpm lint` on `main` went from **20,473 errors / 90 s** down to
   **1,658 errors / 15 s** (~92% noise eliminated, ~6× faster).

2. **`.github/workflows/ci.yml`** — removed the `Lint + format check (Biome)`
   step entirely from the `ci` job. CI is already advisory
   (`continue-on-error: true`), but the step was burning CI minutes and
   cluttering the Actions tab with noise the user has no interest in.
   Developers can still run `pnpm lint` locally; the trimmed config keeps
   local runs fast.

### What was NOT changed (and why)

- **The 1,658 remaining biome errors** (mostly `noUnusedImports`,
  `useTemplate`, real dead code) are still pre-existing on `main` and are
  out of scope for this PR. The user explicitly declined to participate in
  "the competition for the best code style and readability" (chat, 2026-07-03).
  A future PR can trim those opportunistically as part of feature work.
- **The storybook rolldown binding error** is a real, separate CI failure
  (failure class identical to ISS-CI-002's deferred follow-up). It is
  unrelated to biome and was not addressed by this PR. It remains visible
  in the dedicated `storybook` advisory job and does not block merges.

### Honesty disclosures on this resolution

- The original acceptance criteria in this issue ("refactor `sanitizeButtons`
  and `validateLeafOp`") were based on a truncated log capture that visually
  grouped warnings with errors. With the full data, those functions are
  warnings, not blockers. Doing the refactor would have been wasted work.
- The scope-down + rule-trim + CI-step-removal combo is a **policy change**
  rather than a code fix: biome noise is now accepted as part of the
  project's stance that GitHub is an external drive, not a quality gate.
  This is consistent with the existing 2026-06-29 override making CI
  advisory throughout.
