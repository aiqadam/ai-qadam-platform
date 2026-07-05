## What

Workflow-artifacts commit for `wf-20260705-uat-100` (BP-UAT-013 re-verification).
The workflow stopped at Step 2 (Pre-Flight) `failed-escalate` — no
Playwright run occurred. This PR captures the failure and registers
follow-up workflows so the audit trail survives.

## Why

The user requested a UAT re-verification for BP-UAT-013.
Per `workflows/uat-verification.md` Step 2, pre-flight must pass
before UATRunner is invoked. Two distinct non-product failures tripped
the gate, both belonging to the seed/test infrastructure rather than
to BP-UAT-013 itself.

## How

**Failure A — `scripts/uat-seed.sh --reset` payload bug.**
The `--reset` path POSTs the manifest payload verbatim to Directus. The
BP-UAT-013 manifest declares only business fields, no `token_hash` or
`token_prefix`. Directus's `operator_invites` collection requires both
(constraint added post 2026-07-03), so re-creation fails with
`FAILED_VALIDATION` and the four fixture rows are deleted before the
failure, leaving the collection empty.
Registered as **ISS-UAT-013-14** (blocker), owned by follow-up
[wf-20260705-fix-101-bp-uat-013-seed-reset](../tasks/queued/wf-20260705-fix-101-bp-uat-013-seed-reset/handoff.yaml) (queue position 1).
The fix: `reset_domain_fixture()` must mirror `ensure_operator_invite()`
(lines 500-501, 558-595) and recompute `token_hash`/`token_prefix` from
manifest's `token_plain` before POSTing.

**Failure B — bash curl in sandbox cannot reach Windows-host localhost.**
This terminal's `run_in_terminal` spawns a Git Bash / MSYS shell with
`/usr/bin/curl` (GNU curl 8.5.0 ELF). It **cannot** reach
`localhost:3001` — the sandbox's bash `localhost` and the Windows host's
`localhost` are not the same network endpoint. PowerShell `curl.exe`
from the same terminal reaches the api HTTP 200. The seed's
`api_ensure_directus_user_link` POSTs all fail with
`curl: (7) Failed to connect` regardless of `API_BASE_URL` override.
Registered as **ISS-UAT-013-15** (minor), owned by follow-up
[wf-20260705-fix-102-uat-seed-curl-exe-aware](../tasks/queued/wf-20260705-fix-102-uat-seed-curl-exe-aware/handoff.yaml) (queue position 2).
The fix: detect MSYS (`uname -s` matches `mingw|msys|cygwin`) and switch
`CURL_BIN=curl.exe` accordingly.

**Follow-up UAT run** queued as
[wf-20260705-fix-103-uat-013-verify](../tasks/queued/wf-20260705-fix-103-uat-013-verify/handoff.yaml)
(queue position 3, blocked by 1+2). It will perform the actual
Playwright BP-UAT-013 run from a native Windows terminal — bash subshells
will still hit the MSYS localhost limitation even after fix 102 lands,
so the Playwright command must be run via PowerShell or cmd.

## Honesty disclosure (AGENTS.md §6.1)

No AC from BP-UAT-013 is verified by this workflow. 0/7 ACs.
The four `operator_invites` rows are gone (deleted by the failed
`--reset` prelude). No `apps/e2e/uat-results/BP-UAT-013/` artifacts
were produced. `docs/02-business-processes/uat/registry.md` BP-UAT-013
row's `last_run` is HONESTLY unchanged at 2026-07-02 — no run
completed, so no `last_run` bump.

| AC | Step | Status |
|---|---|---|
| AC-1 | Step 001 (lead submit) + Step 002 (verify email) | NOT VERIFIED |
| AC-2 | Step 003 (verify link) | NOT VERIFIED |
| AC-3 | Step 004 (idempotent re-submit) | NOT VERIFIED |
| AC-4 | Neg 001 (honeypot discard) | NOT VERIFIED |
| AC-5 | Steps 005/006 (operator onboard) + Neg 005 | NOT VERIFIED |
| AC-6 | Neg 002 (used token 410) | NOT VERIFIED |
| AC-7 | Neg 003 (expired token 410) | NOT VERIFIED |

## Cleanup performed before stopping

- The `@aiqadam/api` instance I started on `:3001` (PID 5488) was
  cleanly stopped.
- The four `operator_invites` rows are gone (deleted by the failed
  `--reset` prelude). The follow-up workflow `wf-20260705-fix-101`
  will recreate them.

## Testing

- **Step 1 (BusinessAnalyst script validation)** —
  [01-uat-script-validation.md](../tasks/active/wf-20260705-uat-100/01-uat-script-validation.md)
  PASSED.
- **Step 2 (Orchestrator pre-flight)** —
  [02-preflight.md](../tasks/active/wf-20260705-uat-100/02-preflight.md)
  FAILED on the two seed issues above; full curl/probe traces inline.
- **Step 3+ (UATRunner / VisualReviewer / BusinessAnalyst triage /
  Orchestrator commit)** — deferred to `wf-20260705-fix-103`.

## Checklist
- [x] New issues registered (ISS-UAT-013-14, ISS-UAT-013-15)
- [x] Follow-up workflows queued (positions 1, 2, 3)
- [x] `handoff.yaml` updated to `workflow_status: needs-review`
- [x] `workspace-state.md` updated to reflect the failed-escalation outcome
- [ ] Tests added/updated (N/A — no code changes)
- [ ] Docs updated if behavior changed (N/A)
- [ ] No new dependencies (N/A)

## Links

- `NEEDS_REVIEW.md` (this PR's source-of-truth explanation)
- `02-preflight.md` (full pre-flight investigation)
- `01-uat-script-validation.md` (script validation, PASSED)
- `handoff.yaml` (workflow state)
- `.copilot/issues/registry.md` (two new rows)