# ISS-WF-GH-CLOSE-001 — CodeDeveloper's "Closes #N" commit convention auto-closes GitHub issues independently of Project Status, letting an issue read as done while still `Implemented` (not `agent-verified`)

| Field | Value |
|---|---|
| ID | ISS-WF-GH-CLOSE-001 |
| Severity | minor |
| Module | workflow/github-sync |
| Status | resolved |
| Reported | 2026-07-31 |
| Resolved | 2026-07-31 |
| Workflow | wf-20260731-fix-164 |
| Reporter | Orchestrator (user-prompted, investigating why issue #130 had no visible link to its own follow-up issues) |
| Related | ISS-WF-GH-LINK-001, ISS-BRIDGE-STALE-001, FR-EVT-004 |
| Business-Process | — |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/178 |

## Symptom

GitHub issue [#130](https://github.com/aiqadam/ai-qadam-platform/issues/130)
(FR-EVT-004, "Event detail page") is `CLOSED` on GitHub, which reads as
"this is done." But its own mandatory Step 13 post-merge BP-UAT-010
re-verification (`wf-20260730-uat-158`) found 2 real, still-open product
bugs on its own surface (`ISS-EVT-004-1`, `ISS-UAT-010-2`) — the FR is
correctly NOT `agent-verified` on the Project board (still `Implemented`),
but nothing about the closed GitHub issue itself signals that to a human
reader landing on #130.

## Root cause (confirmed via source read)

Two independent systems track "is this done," and only one of them is
actually driven by the workflow:

1. **Project board Status** — set explicitly by
   `scripts/sync-github-project.sh`, called from
   `requirement-development.md`/`issue-resolution.md` Steps 1/9/11.5(or 12.5)/13.
   This DOES correctly distinguish `implemented` (code shipped) from
   `agent-verified` (Step 13 passed clean). Confirmed for #130: Status is
   `Implemented`, never `agent-verified` — this part of the system worked
   exactly as designed.
2. **GitHub issue open/closed state** — controlled entirely by GitHub's
   own commit-message keyword scanner (`Closes #N`, `Fixes #N`, etc.),
   which fires the instant a commit containing that phrase lands on the
   default branch. `wf-20260730-feat-155`'s own squash-merge commit
   (`26a5c08`) body contains a literal `Closes #130` line, written by
   CodeDeveloper as an unreviewed, undocumented default — grep across
   `.copilot/agents/code-developer.md`, `.copilot/agents/doc-writer.md`,
   and `.copilot/schemas/protocol.md` finds this convention documented
   NOWHERE. It is implicit behavior an agent picked up on its own, not a
   rule anyone specified.

**These two systems are not wired together.** `sync-github-project.sh`
never calls `gh issue close`/`gh issue reopen` anywhere in its source
(confirmed by grep). Nothing in the requirement-development workflow
checks, before committing, whether the FR being shipped has a
`business_process` linkage that will require a LATER Step 13 pass before
verification is genuinely complete. The result: the moment the shipping
PR merges, GitHub auto-closes the issue — even though the workflow's own
protocol (`protocol.md`'s Business-Process Linkage section) explicitly
says the requirement isn't done-done until Step 13 passes.

## Impact

- Any FR/ISS with a non-empty `business_process` field is at risk of this
  exact drift: the GitHub issue closes at merge time (Step 11/12 commit),
  but Step 13 (which determines whether it's ACTUALLY verified) runs
  later, potentially finding new issues — as it did for FR-EVT-004.
- A human or agent scanning "closed issues" on GitHub has no signal that
  a "closed" FR/issue may still have open follow-up work blocking full
  verification — they'd have to separately check the Project board's
  Status column (a different UI surface) to notice the gap.
- Not a data-loss or security issue — purely a traceability/trust gap in
  what "closed" communicates. Confirmed today's specific instance (#130)
  by manually posting a cross-reference comment
  (issuecomment-5139399170) naming the 3 open follow-ups — a one-off
  fix, not a systemic one.

## Acceptance criteria

- [x] AC-1: `.copilot/agents/code-developer.md` documents the rule (cross-
      reference note under `## Output`, since the Orchestrator — not
      CodeDeveloper — actually authors the commit at Step 11/12); the
      authoritative rule text lives in `protocol.md`'s new subsection
      (AC-3) with both workflow files (`requirement-development.md` Step
      11, `issue-resolution.md` Step 12) pointing to the
      `check-closing-keyword.sh` guard at the actual commit-authoring step.
- [x] AC-2: Both workflows' Step 13 gates now close the GitHub issue
      (via `gh issue close`) on a clean pass, for the `business_process`-
      linked case. **Narrowed**: reopening an already-prematurely-closed
      issue (the "or ... a new run should reopen it" clause) is NOT
      automated — Step 13's "new issue found" branch documents leaving
      the issue open/instructs against closing, but does not add
      automatic `gh issue reopen` logic for an issue some EARLIER,
      already-merged commit closed under the old behavior. That was
      handled manually for issue #130 itself (a one-off comment, not a
      reopen — see AC-5); a general auto-reopen mechanism is judged
      out of scope for this fix (it would need to distinguish "closed by
      an old pre-fix commit" from "closed correctly by this fix's own
      Step 13," which requires tracking install-date/versioning this
      fix doesn't currently have reason to build).
      **Also found and fixed the same bug in a second location**:
      `issue-resolution.md` Step 12.5's own action 6 was ALSO
      unconditionally closing the GitHub issue at merge time regardless
      of `Business-Process` — a different mechanism (explicit `gh issue
      close` call, not a commit keyword) producing the identical drift.
      Now conditioned on `Business-Process` being `—`.
- [x] AC-3: `protocol.md` gets the new "Two independent 'is this done'
      signals — commit keywords vs. Status field" subsection, using
      issue #130 as the motivating incident.
- [x] AC-4: Regression coverage — `scripts/check-closing-keyword.sh` (new
      mechanical guard, mirroring `check-github-issue-links.sh`'s
      pattern) + `scripts/tests/check-closing-keyword.bats` (12 cases).
      **Narrowed**: tests the guard script's own logic (closing-keyword
      detection against a given business_process value) rather than a
      full end-to-end simulation of Step 13 actually invoking `gh issue
      close` against a live/mocked GitHub API — that would require
      GitHub API mocking infrastructure this repo's bats suite doesn't
      currently have, disproportionate to this fix's scope. The workflow
      docs (AC-2) are the enforcement point for the close-timing half;
      the bats suite is the enforcement point for the keyword-detection
      half.
- [ ] AC-5 (retroactive, this instance only): #130 already has the
      cross-reference comment posted manually today
      (issuecomment-5139399170); no further action needed for #130
      itself under this issue — it is cited here as the motivating case,
      not as an open AC to re-fix.

## Resolution

**Workflow:** wf-20260731-fix-164
**PR:** https://github.com/aiqadam/ai-qadam-platform/pull/179
**Root cause:** Two independent, unwired mechanisms both claimed to
signal "is this done": the Project board's Status field (correctly
script-driven, distinguishes `implemented` from `agent-verified`) and
GitHub's own commit-message closing-keyword scanner (fires on ANY commit
reaching `main`, regardless of verification state). CodeDeveloper's
shipping commit for FR-EVT-004 contained an unreviewed `Closes #130` —
a convention documented nowhere in `.copilot/agents/code-developer.md`
or `protocol.md` — which auto-closed issue #130 the moment the PR merged,
before Step 13's mandatory post-merge BP-UAT-010 re-verification had run.
Step 13 later found 2 real open issues on that same surface, but the
closed GitHub issue gave no visible signal of that.
**Fix:** Added `scripts/check-closing-keyword.sh` (new mechanical guard,
12 bats tests) that fails when a drafted commit message contains a
closing keyword for an issue whose `business_process` field is non-empty.
Wired a pre-commit check into `requirement-development.md` Step 11 and
`issue-resolution.md` Step 12. Moved the actual `gh issue close` call to
each workflow's Step 13 gate (on a clean UAT pass) — the moment
verification is genuinely complete. Documented the split in `protocol.md`
under a new "Two independent 'is this done' signals" subsection.
**Also found and fixed a second instance of the identical bug class**:
`issue-resolution.md` Step 12.5's own action 6 was unconditionally
closing the GitHub issue at merge time via an explicit `gh issue close`
call, regardless of `Business-Process` — now conditioned on
`Business-Process` being `—`.
**Regression test:** `scripts/tests/check-closing-keyword.bats` — 12
cases, including the exact motivating shape (`FR-EVT-004` +
`Closes #130`-style message → fail). 24/24 pass combined with the related
`check-github-issue-links.bats` suite; full repo `scripts/tests/*.bats`
run exits 0.
**Issue #130 itself:** already handled separately (this session, prior
to filing this issue) via a manual cross-reference comment
(issuecomment-5139399170) naming its 3 open follow-ups — not re-done
here; see AC-5.
**Merged:** `3a4e8cf59a6d163693e83f64b58d10739cce1570` (squash)
