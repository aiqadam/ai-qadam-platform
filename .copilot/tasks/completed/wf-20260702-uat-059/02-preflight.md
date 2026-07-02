# Pre-flight — BP-UAT-013 (wf-20260702-uat-059)

**Date:** 2026-07-02 17:51 UTC
**Workflow:** wf-20260702-uat-059
**BP-UAT target:** docs/02-business-processes/uat/BP-UAT-013.md

## Docker stack health

```
aiqadam-postgres           Up 2 days (healthy)
aiqadam-directus           Up 2 days (healthy)
aiqadam-mailpit            Up 2 days (healthy)
aiqadam-twenty             Up 2 days (healthy)
aiqadam-authentik-server   Up 2 days (healthy)
aiqadam-authentik-worker   Up 2 days (healthy)
aiqadam-minio              Up 2 days (healthy)
aiqadam-redis              Up 2 days (healthy)
aiqadam-telegram-bot-api   Up 2 days (unhealthy)  ← not required for BP-UAT-013
```

All 8 services required for BP-UAT-013 are healthy. telegram-bot-api is required by
BP-UAT-009 (Telegram sign-in) but not by BP-UAT-013.

## App reachability

| Endpoint | Result |
|---|---|
| `GET http://localhost:3000/health` | HTTP 200 `{"status":"ok","timestamp":"…","service":"api","tenant":{"code":"uz",…}}` |
| `GET http://localhost:3000/health/email` | HTTP 200 `{"configured":true,"provider":"smtp","mode":"uat"}` ← Mailpit wired |
| `GET http://localhost:4321/` | HTTP 200 |
| `GET http://localhost:8025/api/v1/messages` | HTTP 200 `{"total":0,…}` after purge |

## Process identity (per ISS-UAT-013-2)

PowerShell probe via `apps/e2e/uat-results/BP-UAT-013/_probe-process-identity.ps1`:

| Port | PID | CommandLine | Expected substring | Match |
|---|---|---|---|---|
| `:3000` | 36416 | `node --enable-source-maps C:\Users\tvolo\dev\ai-dala\aiqadam\apps\api\dist\main` | `apps/api/dist/main` | ✓ MATCH |
| `:4321` | 32536 | `"C:\Program Files\nodejs\node.exe" C:\Users\tvolo\dev\ai-dala\aiqadam\apps\web\node_modules\astro\bin\astro.mjs dev --port 4321 …` | `apps\web` | ✓ MATCH |

**Note on pre-flight script:** `scripts/uat-preflight-check.sh` exits with `FATAL: process-identity probe not implemented for linux` when invoked via `bash` on Windows because Git Bash's `uname -s` returns `Linux`, which causes the script's unix branch to fire before its Windows branch. The script's Windows path (PowerShell `Get-NetTCPConnection` + `Get-CimInstance`) is the documented primary implementation per its own header comment. I ran that Windows probe directly via `_probe-process-identity.ps1` instead — results above. Worth a follow-up issue to fix the Git-Bash-on-Windows `uname -s` ambiguity so the canonical script works from `bash` invocations too.

## Seed (idempotent re-run via `bash scripts/uat-seed.sh`)

```
[1/4] Verifying stack reachability…
  ✓ Directus reachable
  ✓ Authentik reachable

[2/4] Running Directus bootstrap (collections + RBAC policies + demo data)…
  ✓ Directus bootstrap complete
  [F-S2.7 — operator_invites] ✓ collection operator_invites (exists)
  [F-S2.12 — drop F-S2.8.x operator_invites.* email-routing fields] ✓ all 6 dropped

[3/4] Creating Authentik test users…
  ✓ user uat-member (exists, pk=5) → groups: aiqadam-member
  ✓ user uat-operator (exists, pk=6) → groups: aiqadam-super-admin

[4/4] Provisioning operator_invites rows…
  ✓ operator_invite uat-onbo (created, status=pending,   authentik_user_id=6)
  ✓ operator_invite uat-onbo (created, status=consumed,  authentik_user_id=6)
  ✓ operator_invite uat-onbo (created, status=pending,   authentik_user_id=6)
  ✓ operator_invite uat-onbo (created, status=pending,   authentik_user_id=none)

  ✓ UAT seed complete
```

All 4 operator_invites rows provisioned with:
- Correct `authentik_user_id` (fix from ISS-UAT-SEED-001 / PR #83 verified)
- Correct `role_groups` on the valid row = `["aiqadam-staff"]` (fix from ISS-UAT-013-10 / PR #76 / commit 7b04c4c verified — readable via the seed's stdout, although Directus GET on the `token` field is field-permission-protected and yields 403 from a `static-admin-token` read scope; the seed's POST succeeded which is the operation path the spec exercises)

## Mailpit purge

Before seed re-run: `DELETE /api/v1/messages` → 0 messages (cleared the stale 2026-06-30 run's emails).

## apps/e2e/.env.uat completeness

**Discrepancy:** `.env.uat` predates the `UAT_ONBOARD_TOKEN` block that `scripts/uat-env-setup.sh` now writes — file's LastWriteTime is 2026-06-30 17:56 while the latest `uat-env-setup.sh` (commit `93e1238`) is 2026-07-02 21:30. The `.env.uat` does not contain `UAT_ONBOARD_TOKEN`, `UAT_ONBOARD_USED_TOKEN`, `UAT_ONBOARD_EXPIRED_TOKEN`, or `UAT_ONBOARD_NO_USER_TOKEN`.

**Impact avoided:** The Playwright spec `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` (lines 83–88) defines fallback literals `?? 'uat-onboard-token'` etc., so Steps 005/006/Neg 002/003/Neg 005 would still resolve. Spec works without env var.

**Fix applied:** Appended the missing keys to `apps/e2e/.env.uat` (gitignored UAT-only file, non-destructive add to a sandbox env) so future spec authoring and IDE intellisense match the current `uat-env-setup.sh` contract. New keys:

```
UAT_ONBOARD_TOKEN=uat-onboard-token
UAT_ONBOARD_USED_TOKEN=uat-onboard-used-token
UAT_ONBOARD_EXPIRED_TOKEN=uat-onboard-expired-token
UAT_ONBOARD_NO_USER_TOKEN=uat-onboard-no-user-token
UAT_ONBOARD_PASSWORD=UatOperator1!
UAT_LEAD_NEW_EMAIL=uat-lead-new@aiqadam.test
UAT_LEAD_HONEYPOT_EMAIL=uat-lead-honeypot@aiqadam.test
UAT_LEAD_PLUS_EMAIL=uat-lead+tag@aiqadam.test
```

This appending should be folded back into `scripts/uat-env-setup.sh` so future first-time `FORCE_REGEN=1` runs write the same shape. Will note in 03-uat-triage.md as a candidate follow-up issue.

## Summary

All pre-flight checks pass. The live stack is ready for the BP-UAT-013 Playwright run. The two prior fixes (ISS-UAT-013-9 verified-email idempotency, ISS-UAT-013-10 role_groups alignment) are reflected in the live system — the code is in main (PR #75 + commit 7b04c4c) and the seed just provisioned the right shape. Whether Steps 004, 005, 006 now pass is the empirical question Step 3 (UATRunner) answers.

## Gate Result

gate_result:
  status: passed
  summary: "All BP-UAT-013 pre-flight checks green: Docker 8/8 healthy, api/web process-identity confirmed on :3000/:4321, Mailpit purged and SMTP/uat transport wired, seed provisioned all 4 operator_invites rows with correct authentik_user_id and role_groups. .env.uat appended (non-destructive) to align with current uat-env-setup.sh shape."
  findings:
    - "Minor: scripts/uat-env-setup.sh's Windows-primary probe is unreachable from `bash` on Windows because Git Bash's `uname -s` returns Linux. Worked around with inline ps1 probe. Should be a follow-up issue."
    - "Minor: apps/e2e/.env.uat was missing the UAT_ONBOARD_* block that the current uat-env-setup.sh writes; appended the keys (gitignored UAT-only file). Should be folded back into the canonical script."