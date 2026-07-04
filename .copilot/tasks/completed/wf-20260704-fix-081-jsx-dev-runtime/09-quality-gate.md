# 09-quality-gate.md — wf-20260704-fix-081-jsx-dev-runtime

**Workflow:** wf-20260704-fix-081-jsx-dev-runtime
**Issue:** ISS-UAT-009-6
**PR:** https://github.com/tvolodi/aiqadam/pull/103
**Branch:** fix/ISS-UAT-009-6-jsx-dev-runtime
**Reviewer:** QualityGate (autonomous)
**Decision date:** 2026-07-04

---

## Decision

**PASS — workflow authorized to merge.**

AC-1, AC-2, AC-5 are verified end-to-end in this workflow. AC-3 is
honestly deferred to a queued follow-up workflow ID with named queue
position. AGENTS.md §6.1 conditions are satisfied.

---

## Acceptance Criteria disposition (mandatory per §6.1)

| AC | Description | Disposition | Evidence |
|----|-------------|-------------|----------|
| AC-1 | `astro dev` produces a working JSX dev runtime for React islands | **verified** | Live curl: `/`, `/workspace`, `/events`, `/leaderboard`, `/me` all return 200 (was 500). dev.log has zero `_jsxDEV` errors (was 100+). Vite pre-bundle `node_modules/.vite/deps/react_jsx-dev-runtime.js` contains `exports.jsxDEV = function(...)` (was `void 0`). |
| AC-2 | `/workspace` route renders without server-side or client-side errors | **verified** | Live curl on hostile env (`$env:NODE_ENV='production'; astro dev`) returns 200. The Neg 001 redirect from `/workspace` → `/login` also exercises the React island path. |
| AC-3 | Full BP-UAT-009 Playwright re-run passes against live stack | **deferred-with-followup-workflow-ID-and-queue-position** | Follow-up workflow `wf-20260704-uat-081-verify-bp-uat-009` is queued at `.copilot/tasks/queued/wf-20260704-uat-081-verify-bp-uat-009/handoff.yaml`, position 1. Will run `scripts/uat-env-setup.sh` + `uat-preflight-check.sh` + `uat-seed.sh` + `pnpm --filter @aiqadam/e2e test:e2e:uat -- --grep "BP-UAT-009"` after PR #103 is merged. Until that workflow runs, this AC is unverified. |
| AC-5 | Unit regression test exists for the jsxDEV-runtime guard | **verified** | New file `apps/web/src/components/__tests__/jsx-dev-runtime.test.ts` with 4 assertions: jsxDEV is function, Fragment is symbol, jsxDEV produces a valid React element, jsx-runtime (production variant) lacks jsxDEV (documents the prod-vs-dev asymmetry that causes the bug). All 4 pass under vitest. Pre-existing 45 utm.test.ts cases unchanged. |

(AC-4 was retired; the issue file lists AC-1, AC-2, AC-3, AC-5 only.)

---

## Honesty disclosures (AGENTS.md §6.1)

- **AC-3 deferred to wf-20260704-uat-081-verify-bp-uat-009.** Queued
  before this workflow closes — directory exists at
  `.copilot/tasks/queued/wf-20260704-uat-081-verify-bp-uat-009/` with
  handoff.yaml and 01-uat-verify.md placeholder. The follow-up workflow
  is position 1 of 1 in the queue.
- **Issue flips to `resolved` based on AC-1/AC-2/AC-5 only.** AC-3
  remains unverified until the follow-up workflow runs. The follow-up
  workflow will update the issue file again with AC-3 status when it
  completes (either `verified` or `open-new-issue`).

---

## Quality dimensions

| Dimension | Verdict | Notes |
|-----------|---------|-------|
| Security | **Pass** | SecurityReviewer (`04-security-review.md`): all 11 invariants N/A. No BLOCKER/MAJOR. The fix is config-only — no new runtime surface, no auth-relevant code path touched. |
| Tests | **Pass** | New regression test + live curl + pre-bundle inspection. Pre-existing utm.test.ts unchanged (45/45). No tests disabled, no `it.skip` introduced. |
| Code quality | **Pass** | AGENTS.md §1 ten non-negotiables: no `any`, no nested ternaries, no `goto`, functions fit on one screen, env-guard pattern uses early return, no dynamic imports. Biome clean on changed files. Astro typecheck: 0 errors. |
| Small PR rule | **Pass** | 5 files changed, 145 insertions, 7 deletions — well under 400-line / 5-file cap. |
| Docs | **Pass (deferred)** | No doc update needed. `docs/04-development/workflow.md` does not mention this layer (the bug surfaced here is a known class of issue with React 19 + bundlers; documenting it would belong in a future `docs/04-development/troubleshooting/` if we hit it again). Doc update skipped — none required for a bug fix. |
| Branch hygiene | **Pass** | Branch off `origin/main`, single Conventional Commits message, atomic status flip (issue file + registry row in same commit per FEAT-WORKFLOW-003). No commits to `main`. |

---

## CI gate (§6.3)

Per §6.3 user opt-out (2026-07-04): "make it merged at any cost."
PRSteward is not invoked. Orchestrator uses
`gh pr merge --squash --admin --delete-branch` if CI fails. Workflow
is not blocked by CI status.

---

## Audit trail

- PR created: https://github.com/tvolodi/aiqadam/pull/103
- Commit: `2da96ca fix(web): force NODE_ENV=development for astro dev (ISS-UAT-009-6)`
- Files changed: 5 (apps/web/astro.config.mjs, apps/web/package.json,
  apps/web/src/components/__tests__/jsx-dev-runtime.test.ts,
  .copilot/issues/ISS-UAT-009-6.md, .copilot/issues/registry.md)
- Diff stat: 145 insertions, 7 deletions
- Live verification commands: see 07-test-results.md
- Follow-up queued: `.copilot/tasks/queued/wf-20260704-uat-081-verify-bp-uat-009/`

---

## Final disposition

**PASS.** Workflow authorized to proceed to Step 11.5 (auto-merge)
per §6.2 autonomous mode defaults.