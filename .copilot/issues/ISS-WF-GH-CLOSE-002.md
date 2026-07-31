# ISS-WF-GH-CLOSE-002 — `check-closing-keyword.sh` only scans commit messages; GitHub also auto-closes on a PR-body closing keyword, an unguarded second vector of ISS-WF-GH-CLOSE-001's exact bug class

| Field | Value |
|---|---|
| ID | ISS-WF-GH-CLOSE-002 |
| Severity | minor |
| Module | workflow/github-sync |
| Status | resolved |
| Reported | 2026-07-31 |
| Resolved | 2026-07-31 |
| Workflow | wf-20260731-uat-166 (found during Step 13 close-out) |
| Reporter | Orchestrator (self-discovered while closing out `wf-20260731-fix-165` / ISS-UAT-010-2's Step 13) |
| Related | ISS-WF-GH-CLOSE-001, ISS-UAT-010-2 |
| Business-Process | — |
| GitHub-Issue | — |

## Symptom

GitHub issue [#160](https://github.com/aiqadam/ai-qadam-platform/issues/160)
(ISS-UAT-010-2, `Business-Process: BP-UAT-010`) auto-closed at
`2026-07-31T06:34:00Z` — the exact moment PR #181 merged — even though
`ISS-WF-GH-CLOSE-001` (resolved one workflow earlier, `wf-20260731-fix-164`)
was specifically built to prevent this: a `business_process`-linked issue
should only close at its own Step 13 gate, after live re-verification
passes, not at merge time.

`gh api repos/.../issues/160/timeline` showed the close event with
`commit_id: null` — **not** a commit-message closing keyword (which
`check-closing-keyword.sh` already guards, and this workflow's actual
commit correctly used the neutral `Refs #160` form, confirmed passing
that guard). The real cause: PR #181's own body (written by the
Orchestrator, not scanned by any guard) contained the prose **"Closes
#160 / ISS-UAT-010-2"** in its "Why" section. GitHub's auto-close scanner
reads PR body text for closing keywords independently of commit
messages — a second vector `check-closing-keyword.sh` was never built to
cover, because `ISS-WF-GH-CLOSE-001`'s own investigation only looked at
the commit-message path (confirmed by re-reading that issue's Root Cause
section, which discusses only "CodeDeveloper's shipping commit").

## Root cause (confirmed)

`scripts/check-closing-keyword.sh`'s own header comment states its scope
explicitly: "given a commit message and the business_process value... a
PRE-COMMIT / PRE-PUSH style guard." It has no invocation anywhere against
PR body text, and neither `issue-resolution.md` nor
`requirement-development.md` calls it (or any equivalent) before `gh pr
create`. The Orchestrator (or any agent) drafting a PR body is free to
write "Closes #N" in prose — a natural, common phrasing when explaining
"why" a PR exists — with nothing catching it before `gh pr create`
submits it and GitHub's own scanner picks it up at merge time.

## Impact

Identical to `ISS-WF-GH-CLOSE-001`'s impact section: any
`business_process`-linked issue is at risk of closing at merge instead of
at its own Step 13 gate, if the PR body (not just the commit message)
happens to contain a closing keyword. In this instance, caught and
corrected within the same session (issue reopened with an explanatory
comment, then correctly re-closed once Step 13 actually passed) — no
lasting drift, but the underlying gap is systemic, not one-off.

## Acceptance criteria

- [x] AC-1: Extend `scripts/check-closing-keyword.sh` (or add a sibling
      check) to also scan PR body text, not just commit messages, for
      the same closing-keyword-vs-business_process logic.
- [x] AC-2: Wire the extended/new check into both workflows'
      `gh pr create` step (`issue-resolution.md` Step 12,
      `requirement-development.md` Step 11) — before the PR is created,
      not after.
- [x] AC-3: Regression test covering the exact shape that slipped through
      here: a PR body containing "Closes #N" prose for an issue with a
      non-empty `business_process`.
- [x] AC-4 (retroactive, this instance only): issue #160 already
      corrected in this same session (reopened with explanation, then
      correctly re-closed after Step 13's genuine pass) — no further
      action needed for #160 itself.

## Resolution

**Workflow:** wf-20260731-uat-166 (found + fixed inline during this
workflow's Step 13 close-out, same session — not deferred to a separate
workflow since the fix is small, contained, and directly motivated by
what just happened)
**PR:** https://github.com/aiqadam/ai-qadam-platform/pull/184

**Root cause:** `check-closing-keyword.sh` and its workflow wiring only
ever scanned commit messages for closing keywords — GitHub also honors
closing keywords in PR body text, an unguarded second vector of the
identical `ISS-WF-GH-CLOSE-001` bug class.

**Fix:** Extended `check-closing-keyword.sh` with a `--body-file` flag
(alternative to `--message-file`, same detection logic — both call a
shared `scan_for_closing_keyword()` function) and wired a call using it
into both workflows' PR-creation step, immediately before `gh pr create`.
A drafted PR body containing a closing keyword for a
`business_process`-linked issue now fails the same way a commit message
does — rewrite to a neutral reference (e.g. "Addresses #N", "Related to
#N") before the PR is opened.

**Regression test:** `scripts/tests/check-closing-keyword.bats` — new
case reproducing this issue's exact shape (PR-body "Closes #N" prose +
non-empty business_process → fail); existing 12 commit-message cases
unchanged and still passing.

**Merged:** <pending>
