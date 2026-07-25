# ISS-WF-CI-002 — introduced-by-this-PR CI failures had no fix-it path, only escalation

| Field | Value |
|---|---|
| ID | ISS-WF-CI-002 |
| Severity | enhancement |
| Module | workflow/ci-policy |
| Status | resolved |
| Reported | 2026-07-25 |
| Workflow | wf-20260725-fix-131 |
| Reporter | tvolodi (chat) |
| GitHub-Issue | (none — internal workflow policy change) |

## Symptom / request

User asked to formalize the standing workflow as: agents push changes,
create a PR, **accept (merge) the PR**, validate CI/CD, update local
main — and explicitly added: "if CI/CD is red then the corresponding
agent has to resolve it." Investigation showed most of this already
existed (`issue-resolution.md` Step 12.5 already auto-merges;
`AGENTS.md §6.2`/`§6.3` already default to autonomous merge with
PRSteward auto-overriding pre-existing CI failures) — the actual gap was
narrower: **CI failures genuinely introduced by the PR's own diff** had
no fix-it path. `AGENTS.md §6.3`'s "When override is NOT allowed"
section hard-stopped and escalated to the user for this case, with no
agent attempting a fix first.

## Fix

Added a new `AGENTS.md §6.3` subsection ("When the failure is introduced
by this PR") that routes an introduced failure to the agent that owns
the affected surface (CodeDeveloper for lint/typecheck/build/Dockerfile
failures, TestRunner for test failures, SecurityReviewer for direct-
dependency advisories) for up to 2 fix attempts before falling back to
the original escalate-to-user behavior. The absolute stops (secrets,
security-checked jobs) are unchanged — no agent auto-fixes a secret leak
or a security-check failure.

Also flagged an open question in the doc: whether Dockerfile/CI-config
fixes deserve a dedicated agent instead of overloading CodeDeveloper,
given CodeDeveloper's scope is application code, not build
infrastructure (BuildKit mechanics, cache-mount semantics — the exact
class of bug fixed live in ISS-INFRA-001/ISS-INFRA-002 this same
session). Left unresolved pending more data on how often this actually
comes up.

## Acceptance criteria

- AC-1: `AGENTS.md §6.3` documents a bounded (2-attempt) fix-it path for
  introduced-by-this-PR CI failures, routed by failure-job-type to the
  agent that owns that surface.
- AC-2: The four existing absolute-stop conditions (secrets,
  security-checked jobs, counter exhaustion, and now "still red after 2
  fix attempts") remain the only paths back to the user — nothing new
  silently ships.
- AC-3: This same session's two Dockerfile-fix PRs (#54, #55) already
  demonstrate the surrounding auto-merge machinery (Step 12.5,
  pre-existing-failure override) working end-to-end — no separate live
  test of the new fix-it path was performed (no introduced failure
  occurred in either PR to exercise it against).

## Regression test

None — this is a process/documentation change, not application code.

## Status

Resolved. Live exercise of the new introduced-by-this-PR fix-it path
(as opposed to the already-proven pre-existing-failure override path)
is deferred until a real introduced failure occurs in a future
workflow — no follow-up workflow queued, since there's nothing to test
against yet; the next PR that trips this path is the natural test.
