# ISS-UAT-013-2 — Pre-flight verified api by port ownership, not by process CommandLine

| Field | Value |
|---|---|
| ID | ISS-UAT-013-2 |
| Severity | bug |
| Module | workflow / orchestrator |
| Status | open |
| Reported | 2026-06-28 |
| Reporter | BusinessAnalyst triage (wf-20260628-uat-030 / 04-uat-triage.md) |
| Workflow | wf-20260628-uat-030 |

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