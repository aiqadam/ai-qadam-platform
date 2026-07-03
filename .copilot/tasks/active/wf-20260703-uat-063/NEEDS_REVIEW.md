# NEEDS_REVIEW — wf-20260703-uat-063 (BP-UAT-001 verification)

**Workflow ID:** wf-20260703-uat-063
**Type:** uat-verification
**Branch:** uat/BP-UAT-001-event-publication-broadcast
**Stopped at:** Step 2 (pre-flight) → seed `failed-escalate`
**Reason:** Real env infra gap (seed cannot mirror Authentik identities into
Directus for new fixtures). Registered as `ISS-UAT-001-1`; queued follow-up
workflow `wf-20260703-fix-064` (`fix/ISS-UAT-001-1-uat-seed-directus-mirror`).
**Date:** 2026-07-03

---

## What completed

- **Step 0 (Initialize)**: ✓ — branch `uat/BP-UAT-001-event-publication-broadcast`
  created from clean main, handoff written, next-workflow-id bumped 63 → 64.
- **Step 0.5 (Context sync)**: ✓ — `scripts/check-workflow-state.sh
  --base "origin/main"` reports "no drift".
- **Step 1 (BusinessAnalyst script validation)**: ✓ — gate `passed`. Validation
  output at `.copilot/tasks/active/wf-20260703-uat-063/01-uat-script-validation.md`.
  All 8 contract checks PASS, all 5 ACs mapped, manifest matches doc fixture
  table with intentional identity/domain decomposition.
- **Step 2 (pre-flight)**: PARTIAL — Docker stack healthy, web + api
  process-identity pre-flight ✓ (after fixing two bugs in
  `scripts/uat-preflight-check.sh`), BUT seed `pnpm uat:seed --reset BP-UAT-001`
  exits 1 with the symptom below.

## Symptom

```
✗ FATAL: fixture uat-member-consented-consent: member_email
  'uat-member-c@aiqadam.test' did not resolve to any Directus user —
  fixture-authoring bug (create the identity fixture first), refusing to
  POST a broken member_consents row.
```

Root-cause analysis and three-fix proposals are in
[ISS-UAT-001-1](../../../issues/ISS-UAT-001-1.md). The Orchestrator's recommended
fix is option (A): an `/v1/internal/users/ensure-linked` endpoint gated by
`InternalAuthGuard`, so the seed doesn't need to drive a full OIDC dance.

## What did NOT complete

- **Step 2 gate** — `failed-escalate` (env infra blocker).
- **Step 3 (UATRunner)** — not started.
- **Step 3.5 (VisualReviewer)** — not started.
- **Step 4 (BusinessAnalyst triage)** — not started.
- **Step 5 (commit + push + PR)** — workflow will be abandoned per protocol;
  follow-up workflow `wf-20260703-fix-064` will run after this NEEDS_REVIEW is
  reconciled, then BP-UAT-001 verification will resume as a new workflow
  (`wf-20260703-uat-065` or later, depending on counter).

## Why this is a NEEDS_REVIEW and not just a retry

The seed's failure mode is structural: `member_consents.member` is a uuid FK
to `directus_users.id` and the new fixture identities don't exist in
Directus yet. Three attempted workarounds (Directus static-admin POST,
break-glass admin POST with provider=authentik, full OIDC dance from bash)
all hit real blockers — see ISS-UAT-001-1 §"Why the obvious fix doesn't work"
for the diagnostic transcript.

This is the exact pattern §6.1 of AGENTS.md calls out: a live-infra
prerequisite is missing and the agent with terminal access (Orchestrator)
cannot fabricate it from the workflow's resource budget. The protocol
demands a queued follow-up workflow, which is exactly what was registered.

## Side effect: a small preflight-script bugfix

While diagnosing Step 2 I uncovered two latent bugs in
`scripts/uat-preflight-check.sh` (the ISS-UAT-013-2 process-identity probe
helper):

1. The PowerShell probe was invoked via `powershell.exe -Command "$ps_script"`
   where `$ps_script` contained PowerShell `$`-tokens (`$port`, `$args[0]`,
   `$pidVal`, `$cim`). bash's double-quote expansion of `$ps_script` inside
   `-Command` corrupted the PowerShell parser, producing parse errors that
   silently returned `UNBOUND`. Fixed by writing the PS body to a temp
   `.ps1` file and invoking `powershell.exe -File <path> <port>` instead.
2. PowerShell emits CRLF line endings; the captured CommandLine's PID had a
   trailing `\r`, which made `bash`'s `^[0-9]+$` regex fail. Fixed by
   stripping `\r` from the captured output before the regex check.
3. (bonus) Added path-separator normalization to the substring check:
   `apps\api\dist\main` (Windows backslash) now matches `apps/api` (the
   substring the workflow expected to pass). Without this, the workflow's
   documented substrings (`@astrojs/node`, `@aiqadam/api`) never matched the
   actual CommandLine shape, even after the bugs above were fixed. All 12
   `scripts/tests/uat-preflight-check.bats` regression tests still pass
   (including AC-4's foreign-service-on-port-3000 negative case, which is
   the ISS-UAT-013-2 invariant this script was authored to protect).

These changes are independent of BP-UAT-001 and ship in this branch
(`uat/BP-UAT-001-event-publication-broadcast`) since they were the only
fixes that landed before the escalation. They'll land on main via the
follow-up `wf-20260703-fix-064` PR (or sooner if you split them out — see
"Recommendation" below).

## Recommendation for the reviewer

1. Confirm ISS-UAT-001-1 is registered and `wf-20260703-fix-064` is queued
   in `.copilot/context/workspace-state.md` (currently the active-workflows
   table still shows `wf-20260703-fix-060` as the latest entry; this branch's
   merge will add the new entry).
2. Decide whether to split the preflight-script bugfix into its own PR
   (`fix/uat-preflight-crlf-and-path-normalize`) ahead of the seed-fix PR,
   to keep the small-PR rule (≤400 lines, ≤5 files). The preflight changes
   are 50 insertions / 24 deletions across 1 file — easy to split.
3. Re-run `wf-20260703-uat-063` (BP-UAT-001 verification) AFTER
   `wf-20260703-fix-064` closes and the seed successfully provisions
   `uat-member-c` / `uat-member-nc` into Directus.

## Open dependencies

- The next-workflow-id counter is at 64 (was 63 before this run).
- The handoff file's `workflow_status` will be set to `needs-review` by the
  Orchestrator before this NEEDS_REVIEW file is committed in the
  follow-up workflow.
- No PR has been created from this branch yet (Step 5 was never reached).
  The preflight fixes are in the working tree but uncommitted; per
  Clean-Tree Invariant, they must be either committed (via a separate PR)
  or stashed before this branch is abandoned.