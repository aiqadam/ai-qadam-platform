# Step 2: Impact Analysis — ISS-WF-GH-CLOSE-001

## Affected Layers

This is a **workflow-tooling / process-documentation** fix, not a
product-code change. No `apps/*` or `packages/*` files are touched.

| File | Change |
|---|---|
| `.copilot/agents/code-developer.md` | New rule: commit message must not use a closing keyword (`Closes`/`Fixes`/`Resolves #N`) for the FR/ISS being shipped when `business_process` is non-empty on that FR/ISS. Use `Refs #N` instead in that case. |
| `.copilot/workflows/requirement-development.md` | Step 11 (commit/push/PR): note the conditional commit-keyword rule at the point where the PR/commit is authored. Step 13's gate (clean pass): add `gh issue close` call, mirroring the existing `sync-github-project.sh --status agent-verified` call already there. |
| `.copilot/workflows/issue-resolution.md` | Step 9's Resolution-section guidance already writes `Closes #N`-shaped language nowhere explicit — checked: this workflow's own Step 12.5 already unconditionally closes the GitHub issue (see its step 6) regardless of `business_process`, which is a DIFFERENT, already-correct pattern (it closes only after its own merge verification, not via a commit keyword) — no change needed here except Step 13's gate, symmetric with requirement-development.md. |
| `.copilot/schemas/protocol.md` | New subsection under "GitHub Issue / Project Sync" documenting the split between commit-keyword-driven open/closed state and script-driven Status field, and the new rule from AC-1. |
| `scripts/tests/*.bats` (new or extended) | Regression test per AC-4. |

## DB Changes Required: no.

## API Surface Changes: none.

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| Step 13's gate (both workflows) | GitHub issue close | new `gh issue close <n>` call, conditioned on `business_process` non-empty AND all linked BP-UATs passed clean |

## Risk Flags

**Security Review Required:** no — this is documentation + a conditional
`gh issue close` call gated on an already-passing verification state; no
new attacker-reachable surface, no credential/secret handling changes.

**Architecture Rule Risks:** none.

**Key design decision (from the issue's own AC-1):** the fix is a
**documentation/instruction change to CodeDeveloper's commit-authoring
behavior**, not a mechanical git-hook or CI gate. This repo's existing
convention for this kind of rule (per `ISS-WF-GH-LINK-001`'s own
resolution, which added a mechanical bats-tested script rather than just
telling agents to remember) suggests a mechanical guard is preferable
where feasible. However, "does this commit message contain a closing
keyword for issue N" is a lint-able, deterministic check that CAN be
scripted (regex over the commit message, cross-referenced against
`business_process` in the associated ISS/FR file) — see Test Scope below
for where this could land as a bats-tested guard analogous to
`check-github-issue-links.sh`, rather than relying purely on the agent
instruction. Decision: implement BOTH — the documented rule (AC-1, so a
human reading `code-developer.md` understands why) AND a mechanical guard
script (extends AC-4's regression coverage beyond a single bats
fixture-test into an actual reusable check), following the
`ISS-WF-GH-LINK-001` precedent exactly.

## Test Scope

- **Unit/bats:** new `scripts/check-closing-keyword.sh` (mirrors
  `check-github-issue-links.sh`'s shape) that, given a commit message and
  a `business_process` value, exits non-zero if a closing keyword is
  present when `business_process` is non-empty. Bats tests for: keyword
  present + non-empty business_process → fail; keyword present + empty
  business_process → pass (this is the correct, unchanged case); no
  keyword + non-empty business_process → pass; `Refs #N` phrasing +
  non-empty business_process → pass.
- **Integration:** none needed — this is a pure shell/text-processing
  check, no live service dependency.
- **E2E:** none applicable.

## Gate Result

**Status:** `passed` → Step 4 (Develop Fix). No DB migration → Step 3
skipped.
