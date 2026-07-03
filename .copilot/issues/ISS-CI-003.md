# ISS-CI-003 — CI failures regressed again (biome complexity + storybook rolldown build)

| Field | Value |
|---|---|
| ID | ISS-CI-003 |
| Severity | blocker |
| Module | ci/infrastructure |
| Status | open |
| Reported | 2026-07-03 |
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
