# NEEDS_REVIEW — wf-20260705-uat-100 (BP-UAT-013 re-verification)

**Workflow:** wf-20260705-uat-100 (`uat-verification`)
**Branch:** `uat/BP-UAT-013-verify` (merged + deleted; squash SHA `bc04135`)
**BP-UAT:** 013 (Member signup and operator onboarding)
**Stopped at:** Step 2 (Pre-Flight) — `failed-escalate`
**Date:** 2026-07-05
**PR:** [#118 squash `bc04135`](https://github.com/tvolodi/aiqadam/pull/118) — merged 2026-07-05T05:36:06Z by `tvolodi` (squash, admin override, branch deleted)

---

## Why this workflow stopped

The user requested a UAT verification run for `BP-UAT-013`. Per
`workflows/uat-verification.md` §Step 2, the pre-flight must pass
before UATRunner is invoked. Two distinct non-product failures tripped
the gate:

### Failure A — `--reset BP-UAT-013` manifest payload bug

`scripts/uat-seed.sh`'s `--reset` path POSTs the manifest payload **verbatim**
to Directus. The BP-UAT-013 manifest at `scripts/uat-fixtures/BP-UAT-013.json`
declares only the business fields — no `token_hash`/`token_prefix`. Directus's
`operator_invites` collection now requires both (constraint added post
2026-07-03), so re-creation fails with HTTP 400 FAILED_VALIDATION. The four
fixture rows are deleted before the failure, leaving the collection empty.

**Issue:** [ISS-UAT-013-14](../issues/ISS-UAT-013-14.md) (open)
**Owner workflow:** [wf-20260705-fix-101-bp-uat-013-seed-reset](../queued/wf-20260705-fix-101-bp-uat-013-seed-reset/handoff.yaml) — queue position 1

### Failure B — bash curl in sandbox cannot reach Windows-host localhost

This machine's Copilot-Chat `run_in_terminal` spawns a Git Bash / MSYS
shell. Inside that shell, `/usr/bin/curl` (GNU curl 8.5.0 ELF binary)
**cannot** reach `localhost:3001` — the sandbox's bash `localhost` and
the Windows host's `localhost` are not the same network endpoint. PowerShell
`curl.exe` from the same terminal reaches the api at `:3001` with HTTP 200.
The seed's `api_ensure_directus_user_link` calls (which POST to
`/v1/internal/users/ensure-linked`) all fail with `curl: (7) Failed to
connect` regardless of the `API_BASE_URL` override.

**Issue:** [ISS-UAT-013-15](../issues/ISS-UAT-013-15.md) (open)
**Owner workflow:** [wf-20260705-fix-102-uat-seed-curl-exe-aware](../queued/wf-20260705-fix-102-uat-seed-curl-exe-aware/handoff.yaml) — queue position 2

---

## Honesty disclosure (AGENTS.md §6.1)

The actual Playwright UAT run for BP-UAT-013 is **NOT** complete. The
following ACs are **not verified**:

| AC | Step(s) | Verification status |
|---|---|---|
| AC-1 | Step 001 (lead submit) + Step 002 (verify email) | NOT VERIFIED — seed failed before run |
| AC-2 | Step 003 (verify link) | NOT VERIFIED — seed failed before run |
| AC-3 | Step 004 (idempotent re-submit) | NOT VERIFIED — seed failed before run |
| AC-4 | Neg 001 (honeypot discard) | NOT VERIFIED — seed failed before run |
| AC-5 | Steps 005/006 (operator onboard) + Neg 005 (no-user 409) | NOT VERIFIED — operator_invites table is empty after the failed `--reset` |
| AC-6 | Neg 002 (used token 410) | NOT VERIFIED — operator_invites table is empty |
| AC-7 | Neg 003 (expired token 410) | NOT VERIFIED — operator_invites table is empty |

This is honest reporting per AGENTS.md §9. The follow-up workflow
`wf-20260705-fix-103-uat-013-verify` (queue position 3) will perform the
actual Playwright run once both blocker fixes (positions 1 + 2) land and
will record AC-by-AC verified-or-deferred dispositions.

---

## What was completed

| Artifact | Status |
|---|---|
| [01-uat-script-validation.md](01-uat-script-validation.md) | **PASSED** — BusinessAnalyst validated the script. Manifest matches doc fixture table column-for-column. All 7 ACs mapped to steps or negative scenarios. |
| [02-preflight.md](02-preflight.md) | **FAILED (escalated)** — full pre-flight investigation with curl traces, process-identity checks, and two distinct failure modes documented. |
| [handoff.yaml](handoff.yaml) | Updated to `workflow_status: needs-review`. Two open issues recorded in `issues_created`. Three queued follow-up workflows recorded in `queued_follow_ups`. |
| `.copilot/issues/ISS-UAT-013-14.md` | Created (open, blocker) |
| `.copilot/issues/ISS-UAT-013-15.md` | Created (open, minor) |
| `.copilot/issues/registry.md` | Two rows added |
| `.copilot/tasks/queued/wf-20260705-fix-101-bp-uat-013-seed-reset/handoff.yaml` | Queued (position 1) |
| `.copilot/tasks/queued/wf-20260705-fix-102-uat-seed-curl-exe-aware/handoff.yaml` | Queued (position 2) |
| `.copilot/tasks/queued/wf-20260705-fix-103-uat-013-verify/handoff.yaml` | Queued (position 3, blocked by 1+2) |
| `apps/e2e/uat-results/BP-UAT-013/` | Empty — no Playwright run occurred |
| `docs/02-business-processes/uat/registry.md` | **Not modified** — no run completed; `last_run` retains 2026-07-02 |

---

## Cleanup performed before stopping

- The `@aiqadam/api` process I started on `:3001` (PID 5488) was stopped
  (Stop-Process) to restore clean state. Port :3001 is no longer listening
  on this machine.
- The four `operator_invites` rows are gone (deleted by the failed `--reset`
  prelude). The follow-up workflow `wf-20260705-fix-101` will recreate them.

---

## What the user can do

To complete the BP-UAT-013 re-verification, the user has two paths:

### Path 1 — Authorize the agent to proceed

Tell the agent to **start `wf-20260705-fix-101` (seed reset path fix)**.
Once that lands, start `wf-20260705-fix-102` (curl.exe MSYS-awareness).
Once both land, the agent can resume `wf-20260705-fix-103` (the actual
UAT run) — though the sandbox-bash-curl limitation may still bite,
in which case the user must run the Playwright command themselves.

### Path 2 — Run it yourself

From your native Windows terminal (PowerShell or cmd, NOT Git Bash):

```powershell
# 1. Start the api on :3001 (because :3000 is held by the foreign ai-dala-next dev server)
cd apps\api
$env:PORT = 3001
pnpm dev

# 2. In another terminal, seed
cd <repo-root>
pnpm uat:seed

# 3. Reset BP-UAT-013 fixtures (after ISS-UAT-013-14 lands)
pnpm uat:seed --reset BP-UAT-013

# 4. Run the BP-UAT-013 Playwright spec against :3001
$env:UAT_API_URL = "http://localhost:3001"
pnpm --filter @aiqadam/e2e exec playwright test `
  --config apps/e2e/playwright.uat.config.ts `
  tests/uat/BP-UAT-013-signup.spec.ts `
  --reporter=list
```

The artifacts already in `.copilot/tasks/active/wf-20260705-uat-100/`
(Step 1 validation + Step 2 pre-flight) remain valid as inputs to the
follow-up workflow.

---

## File inventory for this workflow

- `01-uat-script-validation.md` — BusinessAnalyst Step 1 output
- `02-preflight.md` — Step 2 pre-flight investigation (full failure trace)
- `api-dev.log` — log of the api dev process I started on :3001 (cleanly stopped)
- `seed.log` — log of the seed run (last 30 lines show the failure)
- `seed-trace.log` — bash -x trace of the seed (shows api_base=http://localhost:3001 was honored but bash curl still failed)
- `test-curl.sh` / `test-curl2.sh` — minimal repro scripts proving bash curl returns 000 from inside the sandbox
- `handoff.yaml` — workflow state, status `needs-review`
- `NEEDS_REVIEW.md` — this file

---

## Post-merge (2026-07-05)

The user authorized an explicit squash-merge with --admin override (per AGENTS.md §6.2 user opt-out from CI as a workflow gate, recorded 2026-07-04). PR #118 merged into main as squash commit c04135; remote branch uat/BP-UAT-013-verify deleted by GitHub; local branch force-deleted post-merge. Local task dir archived from ctive/ → completed/ per workflow-finish protocol. 
ext-workflow-id bumped 101 → 104 to reserve IDs for the three queued follow-ups (wf-20260705-fix-101, wf-20260705-fix-102, wf-20260705-fix-103).

### What still needs to happen for BP-UAT-013 verification to actually run

1. Authorize wf-20260705-fix-101-bp-uat-013-seed-reset → fix eset_domain_fixture() to compute 	oken_hash/	oken_prefix from manifest's 	oken_plain before POSTing.
2. Authorize wf-20260705-fix-102-uat-seed-curl-exe-aware → MSYS detection in seed script switches CURL_BIN=curl.exe.
3. After 1 + 2 land, the actual BP-UAT-013 Playwright run still has to happen **from a native Windows terminal** (PowerShell or cmd), NOT from inside this agent's Git Bash MSYS sandbox — the sandbox bash localhost cannot reach the Windows host even after fix 2 ships, because fix 2 helps the uat-seed script itself but Playwright is launched differently.



---

## Post-merge (2026-07-05)

The user authorized an explicit squash-merge with `--admin` override (per AGENTS.md §6.2 user opt-out from CI as a workflow gate, recorded 2026-07-04). PR #118 merged into main as squash commit `bc04135`; remote branch `uat/BP-UAT-013-verify` deleted by GitHub; local branch force-deleted post-merge. Local task dir archived from `active/` → `completed/` per workflow-finish protocol. `next-workflow-id` bumped 101 → 104 to reserve IDs for the three queued follow-ups (`wf-20260705-fix-101`, `wf-20260705-fix-102`, `wf-20260705-fix-103`).

### What still needs to happen for BP-UAT-013 verification to actually run

1. Authorize `wf-20260705-fix-101-bp-uat-013-seed-reset` → fix `reset_domain_fixture()` to compute `token_hash`/`token_prefix` from manifest's `token_plain` before POSTing.
2. Authorize `wf-20260705-fix-102-uat-seed-curl-exe-aware` → MSYS detection in seed script switches `CURL_BIN=curl.exe`.
3. After 1 + 2 land, the actual BP-UAT-013 Playwright run still has to happen **from a native Windows terminal** (PowerShell or cmd), NOT from inside this agent's Git Bash MSYS sandbox — the sandbox bash `localhost` cannot reach the Windows host even after fix 2 ships, because fix 2 helps the `uat-seed` script itself but Playwright is launched differently.