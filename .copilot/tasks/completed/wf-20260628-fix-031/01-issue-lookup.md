# Step 1 — Issue Lookup

**Workflow:** wf-20260628-fix-031
**Issue:** [ISS-UAT-013-2](../issues/ISS-UAT-013-2.md)
**Looked up by:** Orchestrator (direct — no subagent needed)
**Looked up at:** 2026-06-28T14:00:00Z

---

## Issue summary (verbatim from `.copilot/issues/ISS-UAT-013-2.md`)

**Title:** Pre-flight verified api by port ownership, not by process CommandLine
**Severity:** bug
**Module:** workflow / orchestrator
**Status:** open
**Reported:** 2026-06-28 during `wf-20260628-uat-030` (BP-UAT-013 attempt 1)

### Symptom (one paragraph)

The Orchestrator's pre-flight for `wf-20260628-uat-030` claimed `apps/api` was running on PID 5008 listening on port 3000. The UATRunner, 7 minutes later, independently re-verified the same PID 5008 and discovered it was `next start-server.js` from a sibling project's dev tree (`ai-dala-next`), **not** the AI Qadam NestJS api. Every request the Astro proxy sent to `/api/*` landed on the wrong service for the rest of the run.

### Root cause (one paragraph)

The pre-flight's check for `apps/api` relied on **port ownership** (`Get-NetTCPConnection -LocalPort 3000 -State Listen`) rather than **process identity** (`Get-CimInstance Win32_Process` returning `CommandLine`). The current `uat-verification.md` Step 2 spec uses `curl -sf http://localhost:3000/health`, which is even weaker — it only checks that *something* responds on `:3000/health`, not that the *expected* service is responding.

### Proposed resolution (from issue)

Two-step verification: (1) port ownership → PID; (2) process identity → CommandLine contains `apps/api` or `@aiqadam/api`. On mismatch, fail with `gate_result: failed-retry` and actionable message. Add a bats regression test under `scripts/tests/uat-preflight-check.bats`.

---

## Registry state (read from `.copilot/issues/registry.md`)

ISS-UAT-013-2 was added to the registry on 2026-06-28. It is **not** yet resolved. No other open issues share this symptom (verified by reading the registry and grepping for "port ownership", "process identity", "CommandLine").

Related (sibling, NOT duplicate):

| ID | Relation |
|---|---|
| [ISS-UAT-013-1](../issues/ISS-UAT-013-1.md) | blocker / env — port 3000 occupied by foreign ai-dala-next. The **upstream** cause of this issue. Closing ISS-UAT-013-2 does not close ISS-UAT-013-1 (the env-collision can still happen; the fix only detects it). |
| [ISS-UAT-013-7](../issues/ISS-UAT-013-7.md) | bug / env — `RESEND_API_KEY` unset, mailpit receives nothing. Notes the proposed `/api/v1/health/email` endpoint as a defense-in-depth complement to the pre-flight check. Not addressed here. |

No de-duplication needed.

## Scope confirmation (Orchestrator judgment)

The issue's proposed resolution maps cleanly to the issue-resolution workflow:

1. **Code change:** new helper script `scripts/uat-preflight-check.sh` — a bash wrapper that:
   - On Windows: invokes PowerShell `Get-NetTCPConnection` + `Get-CimInstance Win32_Process`, greps CommandLine for the expected substring.
   - On macOS/Linux: invokes `lsof -i :<port>` + `ps -p <pid> -o command=` (TODO marker; not implemented in this PR — team is Windows-first per AGENTS.md).
   - Returns 0 on match, non-zero with explicit message on mismatch, non-zero on unbound port.
2. **Workflow doc change:** `.copilot/workflows/uat-verification.md` Step 2 — replace bare `curl -sf http://localhost:3000/health` with `bash scripts/uat-preflight-check.sh api :3000 "@aiqadam/api"` (and equivalent for web). Document the two-step verification explicitly.
3. **Regression test:** `scripts/tests/uat-preflight-check.bats` — bats test with mocked platform probes (PASS / FAIL / conflicting-service cases). Requires a bash-with-bats runner; PR includes the `.bats` file plus a runnable smoke check.
4. **Documentation update:** add a one-paragraph "process identity" note to `docs/02-business-processes/uat/BP-UAT-000.md` (env setup script reference) so future operators don't reintroduce the gap.

**Out of scope (per issue):**
- Cross-platform macOS/Linux variants of the process-identity check. TODO marker only; tracked as a separate issue if needed.
- The fact that a sibling project's dev server can squat on :3000 without warning. That's ISS-UAT-013-1 (env-side fix).

## Branch and workflow instance

- **Branch:** `fix/ISS-UAT-013-2-preflight-process-identity` (created at Step 0).
- **Workflow instance ID:** `wf-20260628-fix-031`.
- **`issue_ref`** is now set to `ISS-UAT-013-2` in `handoff.yaml`.

## Gate result

```yaml
gate_result:
  status: passed
  attempt: 1
  summary: "ISS-UAT-013-2 exists, is in the registry, and the proposed resolution is well-scoped for this issue-resolution workflow. No similar issues to de-duplicate. No deferrals."
  findings:
    - "The issue proposed two specific deliverables (helper script + bats test + workflow doc edit) — all four (including the BP-UAT-000 doc note) are in scope here."
    - "ISS-UAT-013-1 is the upstream cause; this fix detects it but does not prevent it. Both stay open until ISS-UAT-013-1's env-side fix lands."
  next_step: "Step 2 — Impact Analysis (ImpactAnalyzer)"
```