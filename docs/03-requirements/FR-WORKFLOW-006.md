---
code: FR-WORKFLOW-006
name: Session-friction fixes — GitHub issue back-reference, branch-protection routing, gate self-consistency
status: Implemented
module: Workflow (WORKFLOW)
phase: DevEx
relates_to:
  - FR-WORKFLOW-005 (prior session's QA-target-mode fix, same class of change)
  - .copilot/workflows/issue-resolution.md
  - .copilot/workflows/requirement-development.md
  - .copilot/schemas/protocol.md
  - .claude/CLAUDE.md
---

## Description

Five small, unrelated pieces of operator/agent friction surfaced across two
back-to-back workflows in the same session (`wf-20260718-feat-121` /
FR-WORKFLOW-005, and `wf-20260718-fix-122` / ISS-USR-REG-001). None of them
rose to the level of a dedicated workflow on their own, but each will recur
identically for every future agent session until documented. This FR
bundles the fixes into one small, doc-only change:

1. **GitHub issue back-reference.** `issue-resolution.md`'s Step 1 created
   a local `ISS-<n>.md` file and linked it TO the GitHub issue
   (`GitHub-Issue:` field), but nothing linked the GitHub issue back to the
   local tracking file until the very end (Step 12.5's close comment) — a
   human or agent reading the issue mid-flight had no way to find the
   internal record. Fixed: Step 1 now posts an immediate back-reference
   comment; Step 12.5's close comment template now explicitly requires
   naming the file path even if Step 1 already did.
2. **No documented scope-clarification step.** When a GitHub issue lacks
   acceptance criteria (a one-paragraph user story with undefined terms),
   there was no documented procedure for resolving that before
   implementation — it happened ad hoc in chat. Fixed: Step 1 now
   documents resolving ambiguity with the user first and posting the
   resulting decision as a GitHub comment, so it's durable and reviewable.
3. **A repository ruleset blocks the documented direct-to-main archive
   commit.** Both `issue-resolution.md` Step 12.5 and
   `requirement-development.md` Step 11.5 described the task-dir archive
   move (and, for issues, the merge-SHA backfill) as a permitted direct
   `git push origin main`. As of 2026-07-18, `main` on
   `aiqadam/ai-qadam-platform` is covered by an active repository ruleset
   (id `18687633`) requiring `pull_request` for all changes
   (`GH013: Changes must be made through a pull request`) — the documented
   procedure fails. Note this is a *ruleset*, not classic branch
   protection — `gh api repos/<org>/<repo>/branches/main/protection`
   404s even when the ruleset is actively enforcing; check
   `gh api repos/<org>/<repo>/rulesets` instead, a distinction worth
   preserving since the wrong check gives a false "not protected" signal.
   Fixed: both workflow docs and `protocol.md` now describe routing the
   close-out through a small, doc-only PR by default, and document the
   correct way to check for this.
4. **`gh`'s cached default-repo can silently drift from the actual git
   remote.** After the origin migration to `aiqadam/ai-qadam-platform`
   (`ISS-MIGRATE-001`), `gh`'s own default-repo resolution (used internally
   by `gh pr create`/`gh issue view` without `--repo`) could still resolve
   to the old `tvolodi/aiqadam` repo even though `git remote -v` was
   already correct — causing a confusing `gh pr create` failure inside
   `workflow-finish.sh` with no obvious link to the real cause. Fixed:
   documented the symptom check (`gh repo view --json owner,name`) and fix
   (`gh repo set-default aiqadam/ai-qadam-platform`) in `.claude/CLAUDE.md`.
5. **Git Bash/MSYS path-conversion breaks `check-workflow-state.sh`.**
   `git show <ref>:<path>` inside Git Bash on this Windows workstation gets
   its path argument silently mangled by MSYS's auto-path-conversion,
   producing a `fatal: ambiguous argument` that looks like a script bug.
   Fixed: documented `MSYS_NO_PATHCONV=1` as the required prefix for this
   command and for `check-workflow-state.sh` itself (Step 0.5 of every
   workflow).
6. **A gate agent can self-report `status: passed` while its own findings
   list contradicts that.** SecurityReviewer's first pass on
   ISS-USR-REG-001 listed 3 MAJOR findings but self-reported `passed` — a
   direct violation of its own agent definition's documented gate
   semantics (`passed` requires zero MAJOR findings). The Orchestrator
   caught and corrected this manually; nothing in the protocol previously
   required that check. Fixed: `protocol.md` now has an explicit
   "Self-consistency check" the Orchestrator must apply to every gate
   result before advancing — count the findings, compare against the
   agent's own status semantics, correct in place if they disagree.

## Acceptance criteria

- [x] **AC-1:** `issue-resolution.md` Step 1 posts a GitHub-issue
      back-reference comment immediately upon creating `ISS-<n>.md`, not
      deferred to close-out.
- [x] **AC-2:** `issue-resolution.md` Step 1 documents a procedure for
      resolving ambiguous/underspecified issues with the user before
      implementation, and posting the resulting scope decision as a GitHub
      comment.
- [x] **AC-3:** `issue-resolution.md` Step 12.5's closing comment template
      explicitly requires naming the local `ISS-<n>` ID and file path.
- [x] **AC-4:** Both `issue-resolution.md` Step 12.5 and
      `requirement-development.md` Step 11.5 document routing the
      archive/backfill close-out through a small PR (not a direct
      `git push origin main`), with the exact commands.
- [x] **AC-5:** `protocol.md`'s atomicity-rule section reflects that the
      task-dir archive commit is no longer assumed to succeed as a direct
      push on this repo instance.
- [x] **AC-6:** `.claude/CLAUDE.md` documents the `gh` default-repo drift
      symptom and fix, and updates the stale pre-migration origin URL
      reference in the existing git-credentials section.
- [x] **AC-7:** `.claude/CLAUDE.md` documents the `MSYS_NO_PATHCONV=1`
      requirement for `git show <ref>:<path>` and
      `check-workflow-state.sh`.
- [x] **AC-8:** `protocol.md` has an explicit Orchestrator-facing
      self-consistency check requiring gate `status` to be verified
      against the agent's own findings before advancing, citing the
      concrete incident that motivated it.

## Out of scope (v1)

- Adding a formal `Step 1.5` numbering to `issue-resolution.md` for scope
  clarification — folded into Step 1's existing prose instead, since it's
  a small addition to an existing step, not a new gated step with its own
  agent/output file.
- Automating the `gh repo set-default` check (e.g. as a Step 0 pre-flight
  assertion) — documented as a troubleshooting entry for now; could become
  a scripted check in a future FR if it recurs again.
- Retrofitting the self-consistency check into each individual agent's
  `.md` file (SecurityReviewer, QualityGate, etc.) — the check lives once
  in `protocol.md` as shared Orchestrator behavior, per this repo's
  existing "agents reference protocol.md instead of restating" convention.
- **Centralizing the close-out PR procedure into `scripts/workflow-finish.sh`**
  (a "bookkeeping-only" mode, invoked by the Orchestrator's Step 11.5/12.5
  and by `pr-steward.md`'s auto-register flow, instead of three
  near-identical inline bash blocks). This is the architecturally cleaner
  fix — `workflow-finish.sh` is already the documented single source of
  truth for commit/push/PR mechanics for the *substantive* PR, and the
  same script extending to cover the close-out PR would prevent the next
  ruleset/org change from requiring three synchronized doc edits (exactly
  what this FR just had to do). Deliberately deferred rather than bundled
  into this docs-only fix: it's a real script change (new flag, new code
  path, its own test coverage) and belongs in its own scoped workflow, not
  smuggled into a "fix three doc files" change. Flagged here so it isn't
  lost — a good candidate for FR-WORKFLOW-007.

## Implementation

Shipped in workflow `wf-20260718-feat-123`. Pure documentation change —
no code, no tests (nothing executable to test; verified by direct reading
of the edited files, plus an 8-angle `/code-review`-style pass at medium
effort that caught and corrected two real factual errors before merge —
see "Review notes" below). Files changed:

- `.copilot/workflows/issue-resolution.md` — Step 1 (back-reference +
  scope-clarification procedure), Step 12.5 (close-out PR routing, close
  comment template, merge-poll requirement).
- `.copilot/workflows/requirement-development.md` — Step 11.5 (close-out
  PR routing, merge-poll requirement).
- `.copilot/agents/pr-steward.md` — same close-out PR routing fix applied
  to its own direct-to-main auto-register commit (found during review —
  this file was not in the original edit set but has the identical bug).
- `.copilot/schemas/protocol.md` — atomicity-rule update, new
  self-consistency check section.
- `.claude/CLAUDE.md` — `gh` default-repo drift section, `MSYS_NO_PATHCONV`
  section, origin-URL correction in the existing git-credentials section.

### Review notes

A self-review pass (before this FR's own PR) caught two real defects in
the first draft, worth recording since they're the kind of error this same
FR is trying to prevent recurring:

1. **The central "branch protection" claim was checked with the wrong API
   endpoint and initially looked false.** `gh api repos/<org>/<repo>/branches/main/protection`
   returns 404 "Branch not protected" for `main` on this repo — but `main`
   IS protected, via an active **repository ruleset**
   (`gh api repos/<org>/<repo>/rulesets`), a newer, separate GitHub
   mechanism the classic-branch-protection endpoint doesn't see. All doc
   edits now cite the correct check.
2. **`git push --dry-run`** was initially documented (in one of the two
   workflow files) as a way to verify whether direct pushes are blocked —
   but a dry-run does not reliably trigger server-side ruleset evaluation,
   so this would have given a false "safe to push directly" signal. Fixed
   to point at the ruleset API check instead, consistently in both files.
3. **The close-out PR merge used `--auto` without polling for `MERGED`**
   before the workflow declared itself complete — the existing (correct)
   pattern for the *substantive* PR merge earlier in the same workflow
   step already polls; the newly-added close-out merge didn't. Fixed to
   match.

None of these three would have been caught by "does this read plausibly" —
only by independently re-deriving the underlying facts (API calls,
async-merge semantics) rather than trusting the first draft's own
narrative.
