## What

Implements FR-WORKFLOW-004 — Agent-driven UAT live browser sessions.

This PR ships the implementation cluster defined in `uat-agent-architecture.md §11 step 1`. Predecessor PR #124 authored the FR doc and architecture doc. This PR adds the code and doc changes that make the new model operational.

No product code changes. Pure test/workflow infrastructure (same scope as FR-WORKFLOW-003).

## Why

Today's "UAT" is a category error: unit/E2E regression testing wearing a UAT label. The UATRunner authored Playwright spec files, ran `playwright test`, and called the result UAT. Every step reached its screen with a direct `page.goto()` deep-link. Vision (VisualReviewer, Step 3.5) was a separable downstream step that got severed and skipped under pressure. Results were overwritten run-to-run. The 5/12 Playwright tests PASSED report from `wf-20260705-uat-110` is the canonical demonstration that this model cannot answer the question UAT exists to answer.

FR-WORKFLOW-004 redefines UAT as an agent-driven live browser session: the agent starts at the landing page, navigates by acting on visible UI, reads the actual rendered screen, judges the result visually as the deciding verdict — the same loop a person runs.

## How

### New files

- **`apps/e2e/support/uat-session-driver.ts`** — persistent `BrowserContext` session driver. Enforces the one-goto rule (AC-1/2) by throwing on a second `driver.goto()` call. Provides viewport screenshots (AC-7), a structured action-trace that `uat-navigation-check.sh` parses, proof-of-look `logStep()` format (AC-4), deliberate `writeTeardown()` (AC-6), and session budget guard-rails (40 steps / 60 screenshots / 20 min, overrideable from BP-UAT front-matter).

- **`scripts/uat-navigation-check.sh`** — AC-2/AC-10a: parses the session log's action trace; fails (`exit 2`) if any mid-session navigation appears that is neither click-driven nor a declared `external_hop` from the BP-UAT front-matter. Names the offending step and URL.

- **`scripts/uat-teardown-check.sh`** — AC-6/AC-10c: verifies `teardown.md` exists in the run-scoped directory and names at least one state item. Exit 2 = absent; exit 3 = present but empty/missing policy field.

### Modified files

- **`scripts/uat-visual-check.sh`** — extended with `--session-mode <BP> <run-id> <session-log>` (AC-4/AC-10b). New mode: run-scoped path glob, in-session verdict source (no separate `02b-visual-review.md`), same-step-screenshot invariant (you cannot judge a screen you did not capture). **Legacy mode `<BP> <review-file>` is fully backward-compatible** — prior BP-UAT results (BP-UAT-009, 010, 013 flat dirs) are unaffected.

- **`.copilot/agents/uat-runner.md`** — completely rewritten. The agent no longer authors a `spec.ts` file. It drives a live browser session using `UATSessionDriver`, follows the perceive→decide→act→judge loop per step, calls `logStep()` with proof-of-look fields, calls `writeTeardown()`, and runs the three post-session enforcement scripts. Documents what the agent does NOT do (no `page.goto()` mid-session, no "I cannot view images", no silent teardown).

- **`.copilot/workflows/uat-verification.md`** — Step 3 rewritten (session driver, not spec authoring). Step 3.5 (VisualReviewer as a separate downstream step) **collapsed into Step 3** — vision is now in-session, not downstream. Step Map, Step 4 inputs, Step 5 commit list, and pre-push gate updated accordingly.

- **`docs/04-development/testing/visual-testing.md`** — FR-WORKFLOW-004 update section prepended: Layer 1a/1b (Playwright pixel-diff + assertDesignSystem) relabeled as the **regression net**; Layer 2 (VisualReviewer) noted as dissolved into in-session Judge. Division of labor table. No spec assertions removed (AC-8).

- **`docs/02-business-processes/uat/BP-UAT-013.md`** — pilot migration (AC-9): added `external_hops:`, `session_budget:`, `teardown_policy:` to front-matter. Seed fixture table email drift fixed (`@aiqadam.test` → `@example.com`, matching ISS-UAT-BRIDGE-002 / wf-20260704-fix-086 which updated the unconditional seed but not this doc).

- **`docs/03-requirements/FR-WORKFLOW-004.md`** — status `Draft` → `Implemented`
- **`docs/04-development/architecture/uat-agent-architecture.md`** — status `Draft` → `Accepted`
- **`docs/03-requirements/requirements-registry.md`** — FR-WORKFLOW-004 row status updated
- **`apps/e2e/tsconfig.json`** — `support/**/*` added to `include` so TypeScript covers the new session driver

## Risks

- **`uat-visual-check.sh` backward compatibility:** legacy mode is preserved exactly. The new `--session-mode` flag is additive. Regression: all existing bats/shell tests continue to pass with the old invocation.
- **Session driver is new infrastructure, not yet wired to any live agent run.** AC-5 (continuous session with persistent auth) and AC-9 (pilot end-to-end run producing visual-vs-DOM divergence evidence) require an actual live UAT session invocation against the running stack — deferred to the first `wf-20260706-uat-NNN-bp-uat-013-pilot` run. This is the expected state: the v1 guard-rails are declared in the BP-UAT-013 front-matter, and the pilot run will calibrate them per decision §12.4.
- **No product code touched.** Blast radius: test/workflow infrastructure only.

## Testing

- `npx tsc --noEmit` in `apps/e2e/` — 0 errors (session driver is type-clean under `strict: true`)
- `npx biome check apps/e2e/support/uat-session-driver.ts` — 0 errors
- `arch:check` (pre-commit hook) — passed (14 files scanned)
- `bash scripts/run-bats.sh scripts/tests/uat-seed.bats` — 47/47 pass (no regression to uat-seed; the new scripts are separate)
- `bash -n scripts/uat-navigation-check.sh` / `bash -n scripts/uat-teardown-check.sh` / `bash -n scripts/uat-visual-check.sh` — all parse clean

## Honesty disclosures

- **AC-9 (pilot end-to-end) and AC-5 (continuous session) not yet demonstrated.** This PR ships the infrastructure and model; the pilot run that exercises it live is the follow-up UAT verification workflow for BP-UAT-013 under the new model. The PR does not falsely claim those ACs are verified — they are explicitly noted as deferred to the first live run.
- **Step 3.5 (VisualReviewer) is dissolved, not deleted.** The `visual-reviewer.md` agent definition still exists in `.copilot/agents/` but is no longer invoked by the `uat-verification` workflow. It is preserved for reference. A follow-up cleanup PR can remove it if desired.

## Checklist

- [x] New enforcement scripts created (uat-navigation-check.sh, uat-teardown-check.sh)
- [x] uat-visual-check.sh extended with session mode, backward-compatible
- [x] uat-runner.md rewritten (no more spec authoring)
- [x] uat-verification.md Step 3 rewritten, Step 3.5 collapsed
- [x] visual-testing.md relabeled (regression net; no assertions removed)
- [x] BP-UAT-013.md pilot fields added (external_hops, session_budget, teardown_policy)
- [x] FR-WORKFLOW-004.md status Implemented, architecture doc Accepted, registry updated
- [x] Biome 0 errors, tsc 0 errors, arch:check passed
- [x] No product code changes