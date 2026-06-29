# 02 — Impact Analysis

**Workflow:** wf-20260629-feat-032
**Requirement:** FEAT-WORKFLOW-003
**Date:** 2026-06-29

## Scope

**Type:** Documentation / protocol change. No application code, no DB schema,
no API surface, no UI.

**Blast radius:** Future agentic workflows only. No effect on the running
application, CI, or already-shipped features.

## Files to modify

| File | Change |
|---|---|
| `.copilot/workflows/issue-resolution.md` | Rewrite Step 9 (atomic flip spec), add Step 12.5 (post-merge verify), drop Step 13 (archive folded into PR) |
| `.copilot/workflows/requirement-development.md` | Symmetric treatment: rewrite Step 9, add Step 11.5, drop Step 12 |
| `.copilot/agents/orchestrator.md` | Add autonomous-merge default + opt-in-review semantics to the Git Operations section |
| `.copilot/schemas/protocol.md` | Add Status-Consistency gate check to the Workflow-Finish Protocol section |
| `.copilot/agents/quality-gate.md` | Add Check #8: status consistency between ISS file / registry (or FR file / registry) |

## Files NOT modified

- `scripts/workflow-finish.sh` — the script already supports the needed
  operations (commit, push, PR create). The autonomous-merge step is a new
  sequence the Orchestrator runs after `workflow-finish.sh` returns, not a
  modification to the script. Modifying the script is out of scope for this
  PR and would inflate the blast radius.
- `AGENTS.md` §6 — no exception needed. AC-7 explicitly preserves the rule.
- `handoff.schema.yaml` — no new fields required; the existing
  `github_pr_url`, `workflow_status`, and `expects_registry_update` cover it.

## Risks

**R-1 — Auto-merge bypasses human review by default.** Mitigated by AC-3:
the user can opt in to review by saying so. Also mitigated by AC-2: CI must
be green before auto-merge fires (via `gh pr merge --auto`).

**R-2 — Pre-merge status flip is "resolved" before merge.** The status flip
happens on the feature branch as part of the PR. If the PR is rejected, the
status flip never lands on main (because the branch is discarded), so main's
state stays honest. The branch having `resolved` is acceptable because the
branch is throwaway until merged.

**R-3 — `gh pr merge --auto` requires admin / write permissions and may be
disabled on the repo.** Fallback: if `--auto` is rejected, fall back to
`gh pr merge --squash` (immediate). If that also fails (e.g., branch
protection requires review), the workflow pauses and asks the user to merge,
recording the reason in `handoff.yaml`.

**R-4 — Two workflows in flight.** If the user starts a new workflow before
the previous one's PR merges, both might try to flip the same registry. Low
probability in this project (workflows are typically sequential). Mitigation:
Step 0.5 context-sync check catches drift; if registry is ahead of local
main, pull first.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "5 doc files to modify, no code, no schema, no §6 violation."
  findings:
    - "R-1 auto-merge bypass: mitigated by AC-3 opt-in + AC-2 CI gate"
    - "R-3 --auto may be disabled: documented fallback to manual merge"
```
