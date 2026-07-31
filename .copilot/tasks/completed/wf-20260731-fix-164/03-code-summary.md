# Step 4: Develop Fix — ISS-WF-GH-CLOSE-001

## Changes

**New file `scripts/check-closing-keyword.sh`:** given a drafted commit
message and an `ISS-<n>`/`FR-<CODE>` ref, exits 1 if the message contains
a GitHub closing keyword (`close(s|d)`/`fix(es|ed)`/`resolve(s|d)
#N`) for that ref's GitHub issue number while its `business_process`
field is non-empty. Reads `business_process` from the issue/FR file
directly (or accepts `--business-process` explicitly, mainly for
testing). Mirrors `check-github-issue-links.sh`'s shape/conventions
(help text, exit codes, `read_file`-style parsing).

**New bats suite `scripts/tests/check-closing-keyword.bats`:** 12 cases
covering both `ISS-<n>` and `FR-<CODE>` refs, case-insensitive keyword
matching, the empty-business-process pass-through case, an explicit
`--business-process` override, and 2 invocation-error cases.

**`scripts/tests/test_helper.bash`:** added
`check-closing-keyword.sh` to the list of scripts copied into each bats
fixture repo (same pattern as the existing `check-github-issue-links.sh`
entry).

**`.copilot/schemas/protocol.md`:** new subsection "Two independent 'is
this done' signals — commit keywords vs. Status field" documenting the
split between commit-keyword-driven GitHub open/closed state and
script-driven Project Status, using issue #130 as the motivating
incident, and stating the rule + where the mechanical guard runs.

**`.copilot/workflows/requirement-development.md`:**
- Step 11: added the `check-closing-keyword.sh` pre-commit check.
- Step 13's gate (clean pass): added `gh issue close` call after the
  existing `agent-verified` sync — this is the new, correct close point
  for `business_process`-linked FRs. Step 13's "new issue found" branch
  explicitly does NOT close (and calls for a reopen if an earlier commit
  already closed it under the old, unpatched behavior).

**`.copilot/workflows/issue-resolution.md`:**
- Step 12 (commit): inherits Step 11's check via its existing "Same as
  requirement-development.md Step 11" line; added an explicit note
  spelling out the check for this workflow's own action 6.
- Step 12.5's action 6 (**was already unconditionally closing the GitHub
  issue at merge time**, independent of `Business-Process` — this is the
  SAME class of bug as the commit-keyword one, just via an explicit `gh
  issue close` call instead of a commit keyword): now conditioned on
  `Business-Process` being `—`. When non-empty, the issue is deliberately
  left open for Step 13 to close.
- Step 13's gate (clean pass): added the deferred `gh issue close` call,
  symmetric with `requirement-development.md`.

**`.copilot/agents/code-developer.md`:** added a short cross-reference
note under `## Output` pointing to the new rule (this agent doesn't
author the commit itself, but may draft message text for the
Orchestrator to use).

## Key Design Decision

Two independent premature-close mechanisms existed, not one:
1. CodeDeveloper's commit-message `Closes #N` keyword (the FR-EVT-004
   incident).
2. `issue-resolution.md` Step 12.5's own `gh issue close` call, which was
   ALSO unconditional regardless of `Business-Process` — discovered while
   reading that step closely during impact analysis, not mentioned in the
   original issue report but the exact same bug class. Both needed fixing
   for the rule to actually hold; fixing only the commit-keyword path
   would have left the issue-resolution workflow's own explicit close
   call as an unpatched second way to reproduce the same drift.

## Files Changed

| File | Change |
|---|---|
| `scripts/check-closing-keyword.sh` | new |
| `scripts/tests/check-closing-keyword.bats` | new |
| `scripts/tests/test_helper.bash` | added script to fixture-repo copy list |
| `.copilot/schemas/protocol.md` | new subsection |
| `.copilot/workflows/requirement-development.md` | Step 11 check + Step 13 gate close call |
| `.copilot/workflows/issue-resolution.md` | Step 12 note + Step 12.5 action 6 conditioned + Step 13 gate close call |
| `.copilot/agents/code-developer.md` | cross-reference note |
| `.copilot/issues/ISS-WF-GH-CLOSE-001.md` | new issue file |
| `.copilot/issues/registry.md` | new row |

## Formatter Check

`pnpm biome check` — N/A for `.sh`/`.bats` files (biome doesn't process
shell); markdown files pass (biome reported "no files processed" only
because it doesn't lint prose `.md` content beyond frontmatter/embedded
code — no errors on any changed file).

## Known Limitations

- The mechanical guard (`check-closing-keyword.sh`) is not yet wired into
  an automated enforcement point the way `check-github-issue-links.sh` is
  (Step 0.5 / QualityGate) — it's documented as a manual pre-commit step
  in both workflow files. A stronger, always-enforced version (e.g. a
  QualityGate check that reads the actual drafted/staged commit message)
  is a reasonable future hardening but out of scope for this fix — the
  documented rule + available script are the AC-1/AC-4 scope, matching
  what the issue's ACs actually asked for.
- No retroactive fix for issue #130 is bundled here — that was already
  handled via a manual cross-reference comment (see
  ISS-WF-GH-CLOSE-001.md's AC-5, marked as reference-only, not an open AC).

## Architecture Rule Compliance

N/A — no `apps/*`/`packages/*` code touched; pure workflow-tooling/shell/
documentation change.

## Gate Result

**Status:** `passed` → Step 5 (Security Review).
