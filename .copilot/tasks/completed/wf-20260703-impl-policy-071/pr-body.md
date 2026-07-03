## What

Implements [ISS-WF-CI-OVERRIDE-1](../copilot/issues/ISS-WF-CI-OVERRIDE-1.md): a counter-limited CI-override policy (`AGENTS.md §6.3`) and a dedicated `PRSteward` agent that decides, per failing CI check, whether to override-and-merge or escalate. Today, every PR to `main` is blocked by pre-existing CI failures on `main` HEAD — the §6.2 safety gate #2 forced the Orchestrator to stop and ask the user on every such PR, even when the PR's diff had no overlap with the failure trace.

## Why

The current behaviour converts trivial PR-matters into interactive Q&A. The fix is a **bounded, auditable** policy: the PRSteward overrides only when (1) the failure log mentions **no file** in the PR's diff, (2) the failure class is owned by a tracked issue with a queued follow-up workflow, and (3) the consecutive override counter is below the limit (default 5). Every override — allowed or denied — is recorded in five places: `handoff.yaml`, the squash-commit trailer, the registry row for the owning issue, the counter file, and the PR description. After 5 consecutive overrides of the same class, the PRSteward must stop and surface the failure to the user with the recommendation to fix the underlying issue.

## How

- **`AGENTS.md` §6.3** — the envelope: three preconditions, five safety gates (introduced-by-this-PR, new-failure-class, counter-exhausted, security-check, secrets), audit-trail actions, counter file format.
- **`AGENTS.md` §6.2 safety gate #2** — rewritten to delegate to `PRSteward` instead of stopping the Orchestrator.
- **`.claude/CLAUDE.md`** — documents `PRSteward`, points to §6.3 and the counter file path.
- **`.copilot/agents/pr-steward.md`** — full role definition: decision logic (5 steps mirroring §6.3), audit-trail actions (6 sub-actions), constraints, gate return shape, invocation pattern.
- **`.copilot/meta/ci-override-counters.json`** — `_schema_version: "1.0"`, `_limit: 5`, `_policy_ref: "AGENTS.md §6.3"`. One back-filled class:
  - `15c26207b13cee6b4283d22fd389e3015bc95988` (sha1 of canonical `__vite_ssr_exportName__` error block), `consecutive_count: 3`, `owned_by_issue: "ISS-TEST-WEB-001"`, `queued_workflow: "wf-20260703-fix-066-vitest-bump"`, `failing_job: "ci"`, `history: [PR #91, #92, #93]`.
- **`.copilot/issues/ISS-WF-CI-OVERRIDE-1.md`** + **`.copilot/issues/registry.md`** row + **`.copilot/context/workspace-state.md`** updated.
- **`.copilot/meta/next-workflow-id`** — bumped `69 → 71`.
- **5 generated tool configs** — `.github/copilot-instructions.md`, `.clinerules`, `.cursorrules`, `.windsurfrules`, `.cursor/rules/00-project.mdc`. Same 130-line §6.3 block copied into each. These are "configs and tests excepted" per `AGENTS.md §4` (small-PR rule), so the policy PR is reviewable as "one logical change" even though total diff is ~1400 lines.

## Risks

- **Counter collision with PR #93.** The `fix/ISS-WF-REG-002-registry-state-drift` branch (PR #93, wf-20260703-fix-070) has the counter file at `70` on its branch. Main absorbs the higher value (71) on this PR's merge. When PR #93 lands, the Orchestrator at merge time will see the conflict and keep main's value (`71`), not re-write to `70`. This is documented in `workspace-state.md` "Next Workflow ID" section and in the PRSteward's `NEEDS_REVIEW.md` for PR #93. The registry's `Workflow:` column for `ISS-WF-REG-002` already says `wf-20260703-fix-070` — that ID is a workflow-name, not a counter-claim, so the value of the counter file does not affect its uniqueness.
- **First PRSteward invocation was on PR #94 — the policy tests itself before it can land.** Commit `ebba3da` (this PR's second commit) rewrites §6.3 to v2 after the user's override. The v2 PRSteward was re-invoked on this same PR and overrode both failing checks (see "CI Override" below). Once #94 merges, the policy will be in effect on `main` and PR #93's PRSteward invocation will use the same procedure.
- **PR #93 will land without drama.** Under §6.3 v2, both PR #93's failures are eligible — `ci` counter 4 < 5, `storybook` counter 2 < 5 — so PR #93 should merge without user prompt.
- **Counter file is back-filled, not from a real audit trail.** The `history` array documents this with `"note": "pre-policy, counter back-filled from registry history"` on each entry. The PRSteward's own decisions (post-policy) will append to the real history with full audit context.

## CI Override

PRSteward was invoked on this PR (run [`28678310518`](https://github.com/tvolodi/aiqadam/actions/runs/28678310518)). Verdict: **OVERRIDE authorised on both failing checks** under `AGENTS.md §6.3 v2`.

| Failing job | Class sha1 | Owned by | Counter before | Counter after | Decision |
|---|---|---|---|---|---|
| `ci` (`__vite_ssr_exportName__`) | `15c26207b13cee6b4283d22fd389e3015bc95988` | `ISS-TEST-WEB-001` (queued `wf-20260703-fix-066-vitest-bump`) | 3 | **4** of 5 | override |
| `storybook` (`[PARSE_ERROR] Unexpected JSX expression`) | `ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7` | `ISS-CI-OVERRIDE-ebd184b` *(auto-registered)* (queued `wf-20260703-fix-072`) | new | **1** of 5 | override (auto-registered) |

- **Pre-existing evidence:** Intersection of PR #94's 17 files with the failed-job file paths is **empty**. PR #94 touches only `.md`/`.json`/`.yaml` under `.copilot/`, `.claude/`, `.github/`, `.cursor/`, plus `AGENTS.md`. The failing files live under `apps/api/test/`, `apps/web-next/src/{blocks,kit,pages}/`. Zero overlap → pre-existing on `main` HEAD.
- **Auto-registered:** the storybook class was registered by PRSteward itself (per §6.3 Auto-register procedure): a local issue file at `.copilot/issues/ISS-CI-OVERRIDE-ebd184b.md`, a queued workflow directory `.copilot/tasks/queued/wf-20260703-fix-072-rolldown-jsx-parse/` with `handoff.yaml`, a row in `.copilot/issues/registry.md`, and the class entry in `.copilot/meta/ci-override-counters.json` with `consecutive_count: 1`. *(GitHub Issues are disabled on `tvolodi/aiqadam` — the local file is the canonical tracker; see the issue file for the back-fill instructions when/if re-enabled.)*
- **Audit trail:**
  1. `handoff.yaml.gate_results.step11.4-pr-steward` — both `failing_jobs[]` entries present, `auto_registered: true` for storybook, `false` for ci.
  2. Squash commit trailer (this PR) — both trailer lines below.
  3. `.copilot/issues/registry.md` — amended rows for both `ISS-TEST-WEB-001` (added `(4/5)` suffix to its Workflow column) and `ISS-CI-OVERRIDE-ebd184b` (new row).
  4. `.copilot/meta/ci-override-counters.json` — `consecutive_count` updated for both classes, `history[]` appended for both.
  5. PR description — this section.

```
CI-Override: 15c26207b13cee6b4283d22fd389e3015bc95988 via ISS-TEST-WEB-001 (count 4/5)
CI-Override: ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7 via ISS-CI-OVERRIDE-ebd184b (count 1/5)
```

## Testing

- AC-1 to AC-7 — verified by the `09-quality-gate.md` file in `.copilot/tasks/active/wf-20260703-impl-policy-071/`.
- AC-8 (integration test) — runs after this PR lands. The PRSteward is invoked against PR #93; the verdict is recorded in `handoff.yaml` and a new `NEEDS_REVIEW.md` for PR #93's `wf-20260703-fix-070` workflow.
- AC-9 — verified by construction: this workflow's `expects_registry_update: true` only targets the new `ISS-WF-CI-OVERRIDE-1` row, not `ISS-WF-REG-002`.

## Checklist

- [x] Tests added / updated — N/A (no application code)
- [x] Docs updated if behavior changed — `AGENTS.md` §6.2 + §6.3, `.claude/CLAUDE.md`, `.copilot/agents/pr-steward.md`, all 5 tool configs
- [x] No new dependencies — N/A
- [x] Manually tested locally — `pnpm ai:sync` ran clean; `git status -sb` is clean; `arch:check` passed on the staged files

## Workflow

- `wf-20260703-impl-policy-071` — this PR
- Next: PRSteward invocation against PR #93 (AC-8 test)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
