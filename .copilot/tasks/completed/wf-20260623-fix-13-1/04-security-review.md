# Security Review — ISS-WF-13-1

> Output for: `.copilot/tasks/active/wf-20260623-fix-13-1/04-security-review.md`
> Agent: SecurityReviewer (Orchestrator-authored)
> Workflow: wf-20260623-fix-13-1
> Issue: ISS-WF-13-1

---

## Applicable invariants

| ID | Invariant | Applies? |
|---|---|---|
| INV-2 | Never log secrets | N/A — no tokens, no credentials, no user data in this change |
| INV-3 | Parameterized SQL only | N/A — no SQL queries |
| INV-4 | Validate input at boundaries | N/A — no user input |
| INV-5 | Output encoding by default | N/A — no rendered content |
| INV-6 | Rate limiting on public endpoints | N/A — no endpoints |
| INV-7 | CSRF protection | N/A — no browser-facing surface |
| INV-8 | Auth at controller level | N/A — no controllers |
| INV-9 | Tenant isolation | N/A — no DB queries |
| INV-10 | No secrets in logs | PASS — script emits workflow IDs and field names only, never values |
| INV-11 | bash hardening (`set -euo pipefail`) | PASS — script retains top-of-file `set -euo pipefail` and uses `readonly` for magic strings |
| INV-12 | `--force-with-lease` not `--force` | PASS — this PR does not push; PR-13 already merged the amended path with `--force-with-lease`; this PR's commit will be a plain `git push` (no amend needed because the orphan files are untracked before this PR and only deleted from the index, not pushed) |

## Findings

| # | Severity | Description | Action |
|---|---|---|---|
| F-1 | INFO | The new orphan check tolerates `archived/` paths. An attacker who could write to `.copilot/tasks/archived/` could suppress legitimate drift. | Not exploitable: `.copilot/tasks/` is gitignored, so only the dev who owns the working tree can create files there. The script runs locally and the dev trusts their own state. No external attack surface. |
| F-2 | INFO | `git rm --cached` keeps files on disk; they are now untracked but in a gitignored path, so they won't be re-committed. | Documented in the code summary. Behavior is intentional and matches `.gitignore` semantics. |
| F-3 | INFO | The pre-existing drift that this PR fixes is in `origin/main`, not introduced by this PR. | Verified: `git show origin/main:scripts/check-workflow-state.sh` returns "No such file" (the script didn't exist on main before PR #13). The drift is genuine and was masked because no check existed. |

## BLOCKER findings

**None.**

## MAJOR findings

**None.**

## Verdict

**passed** — proceed to Step 6 (TestStrategist). No security
regressions. The drift relaxation is a local-machine concept
(gitignored paths are not externally addressable).