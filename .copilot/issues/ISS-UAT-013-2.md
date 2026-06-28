# ISS-UAT-013-2 — Pre-flight verified api by port ownership, not by process CommandLine

| Field | Value |
|---|---|
| ID | ISS-UAT-013-2 |
| Severity | bug |
| Module | workflow / orchestrator |
| Status | **resolved** |
| Reported | 2026-06-28 |
| Resolved | 2026-06-28 |
| Reporter | BusinessAnalyst triage (wf-20260628-uat-030 / 04-uat-triage.md) |
| Resolver | Orchestrator (wf-20260628-fix-031) |
| Workflow | wf-20260628-uat-030 (reported) → wf-20260628-fix-031 (resolved) |
| Resolved by PR | _pending — workflow-finish.sh has not yet pushed_ |

## Symptom

The Orchestrator's pre-flight report (`02-preflight.md`) claimed `apps/api` was running on PID 5008 listening on port 3000, with `WEB_BASE_URL=http://localhost:4321` and `OIDC_REDIRECT_URI=http://localhost:4321/api/v1/auth/callback`. The pre-flight self-graded `gate_result: passed`.

The UATRunner, 7 minutes later, independently re-verified the same PID 5008 and discovered it was **not** the AI Qadam NestJS api — it was `next start-server.js` from `C:\Users\tvolo\Documents\Claude\Projects\ai-dala-next`. The pre-flight's claim is now retracted by Orchestrator.

Honest disclosure from UATRunner (per AGENTS.md §9): either the api process exited between Step 2 and Step 3, or it never started on the PID the pre-flight reported.

## Root cause

The pre-flight's check for `apps/api` relied on **port ownership** (PID listening on `:3000`) rather than **process identity** (the executable path / CommandLine of the PID). Two unrelated services on the same dev machine can occupy the same port at different times; without verifying the executable path or the working directory, the check cannot distinguish between the NestJS api and any other service that happens to be listening on :3000.

This is a process gap: there is no script in `.copilot/workflows/uat-preflight.md` (or the Orchestrator's standard pre-flight) that runs `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"` and asserts the result contains `@aiqadam/api` or `apps/api/dist/main`.

## Repro

```powershell
# Pre-flight style (today)
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select OwningProcess
# → 5008
# (no verification of what 5008 actually is)

# Pre-flight style (fixed)
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select OwningProcess |
  ForEach-Object {
    Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" |
      Select ProcessId, CommandLine, ExecutablePath
  }
# → ProcessId 5008, CommandLine "C:\Users\…\ai-dala-next\node_modules\.pnpm\next@…\next\dist\server\lib\start-server.js"
# (now visible that this is the wrong service)
```

## Proposed resolution

Update `.copilot/workflows/uat-preflight.md` (or whichever file governs the Orchestrator's pre-flight step) to require a **two-step verification** for each expected service:

1. Port ownership: `Get-NetTCPConnection -LocalPort <port> -State Listen` returns a PID.
2. **Process identity**: `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"` returns a `CommandLine` (or `ExecutablePath` on macOS/Linux) containing a substring specific to the expected service. For the api: `apps/api` or `@aiqadam/api`. For web: `apps/web`. For Astro: `@astrojs/node`. Etc.

If the substring check fails, the pre-flight must fail with a `gate_result: failed-retry` and an explicit message: `"Process on :3000 (PID X) is not the AI Qadam api. CommandLine: '…'. Stop the conflicting process or update the proxy target."`

Add a bats regression test under `scripts/tests/uat-preflight.bats` that mocks both probes (PASS / FAIL / conflicting-service) to prevent regression.

## Out of scope

- Cross-platform macOS/Linux variants of the process-identity check (`lsof -i :3000 -F p | …`). Track separately if needed.
- The fact that a sibling project's dev server can squat on :3000 without warning. See ISS-UAT-013-1 for that env-side fix.

## References

- `.copilot/tasks/active/wf-20260628-uat-030/02-preflight.md` — retracted claim
- `.copilot/tasks/active/wf-20260628-uat-030/03-uat-runner-report.md` — independent verification
- ISS-UAT-013-1 — the underlying port collision

---

## Resolution (wf-20260628-fix-031)

**Resolved on:** 2026-06-28
**Resolved by:** Orchestrator (Viktor) + CodeDeveloper + SecurityReviewer + TestStrategist + TestDesigner + TestRunner

### What was delivered

A two-step verification helper + workflow doc edit + regression test + operator docs.

| Deliverable | File | Change |
|---|---|---|
| Process-identity probe helper | `scripts/uat-preflight-check.sh` | **NEW** — 252 lines. Windows-primary (PowerShell `Get-NetTCPConnection` + `Get-CimInstance Win32_Process`); macOS/Linux TODO marker only per the issue's "Out of scope" and AGENTS.md §0 (Windows-first team). Has test hook via `UAT_PREFLIGHT_PROBE_OUTPUT` env var. |
| Bats regression test | `scripts/tests/uat-preflight-check.bats` | **NEW** — 12 cases covering AC-1..AC-8 (all 8 acceptance points). Auto-picked-up by `pnpm test:bash`. |
| UAT verification workflow doc | `.copilot/workflows/uat-verification.md` | **MODIFIED** — Step 2 (Pre-Flight) now invokes `bash scripts/uat-preflight-check.sh <svc> <port> <substring>` for both web and api, replacing the bare `curl -sf http://localhost:3000/health` that allowed the wrong service to masquerade as the API. |
| Operator reference doc | `docs/02-business-processes/uat/BP-UAT-000.md` | **MODIFIED** — appended `## Process identity check` section explaining why bare `curl` is insufficient and how to use the helper. |

### Test evidence

- `bash -n scripts/uat-preflight-check.sh` → exit 0 (no syntax errors).
- `bash scripts/run-bats.sh scripts/tests/uat-preflight-check.bats` → **12/12 pass**.
- `bash scripts/run-bats.sh scripts/tests/*.bats` → **42/42 pass** (no regressions in the 30 pre-existing bats tests).

### Security review

- Gate `passed` with 3 INFORMATIONAL notes (no BLOCKER or MAJOR findings).
- All 11 role-defined invariants confirmed-OK or N/A.
- Custom checks for command-injection (PowerShell), test-hook safety (env-var parser), log-injection (`printf '%s'` defends Windows paths), permissions (no elevation needed), and new-dependencies (none) all pass.

### Honesty disclosures (per AGENTS.md §9)

1. **Windows-primary fix.** macOS / Linux probe is a TODO stub that exits non-zero with a clear pointer. Per the issue's "Out of scope" and AGENTS.md §0. Open a follow-up issue if cross-platform support becomes a priority.

2. **Bats tests use a test-hook, not real PowerShell.** `UAT_PREFLIGHT_PROBE_OUTPUT` skips the real `Get-CimInstance Win32_Process` invocation. Real PowerShell syntax is validated on Windows CI / dev machines, not by unit tests. The CodeDeveloper self-validation reports 70% confidence on the PowerShell invocation syntax; one Windows run before merge is recommended.

3. **This fix detects the wrong-service case; it does not prevent the port collision.** ISS-UAT-013-1 (the upstream port-3000 collision) stays open. Both issues are now differentiated: ISS-UAT-013-1 is the **env-side** fix (kill the squatter, allocate a dedicated dev port), ISS-UAT-013-2 is the **verification-side** fix (verify process identity before trusting a port).

4. **This fix is defense-in-depth, not a replacement for `/api/v1/health/email`.** ISS-UAT-013-7's proposed endpoint is still open and complements this fix from the API side.

### Related issues

- [ISS-UAT-013-1](ISS-UAT-013-1.md) — **stays open**. This fix detects the wrong-service condition; it does not prevent the collision itself.
- [ISS-UAT-013-7](ISS-UAT-013-7.md) — **stays open**. Separate defense-in-depth fix on the API side (`/api/v1/health/email`).

### Workflow artifacts

- Handoff: `.copilot/tasks/active/wf-20260628-fix-031/handoff.yaml`
- Step 1 (issue lookup): `01-issue-lookup.md`
- Step 2 (impact analysis): `02-impact-analysis.md`
- Step 4 (code summary): `03-code-summary.md`
- Step 5 (security review): `04-security-review.md`
- Step 6 (test strategy): `05-test-strategy.md`
- Step 7 (test design): `06-test-design.md`
- Step 8 (test results): `07-test-results.md`