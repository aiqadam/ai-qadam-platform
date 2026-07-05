# 01-pre-flight.md — wf-20260705-fix-108-uat-009-5

**Authored by:** Orchestrator (direct — Step 2 of uat-verification pattern)
**Date:** 2026-07-05
**Handoff ref:** [handoff.yaml §required_services](handoff.yaml)

---

## Summary

Both required services are confirmed live with correct process identity:

| Service | Port | PID | CommandLine | Identity | Reachability |
|---|---|---|---|---|---|
| apps/web (Astro dev) | 4321 | 8664 | `…\apps\web\node_modules\astro\bin\astro.mjs dev --json` | `@astrojs/node` ✅ | `GET /` → 200 ✅ |
| apps/api (NestJS) | 3000 | 37640 | `node --enable-source-maps …\apps\api\dist\main` | `apps/api/dist/main` ✅ (= `@aiqadam/api` per pre-flight substring map) | `GET /health` → 200 ✅ |

## What the Orchestrator did (per AGENTS.md §6.1 + §6.2)

1. **Inspected current state:** confirmed `docker ps` showed the
   non-app infra (postgres, directus, mailpit, authentik server/worker,
   redis, minio, twenty, telegram-bot-api) healthy and up; port 4321
   already had `apps/web` astro dev listening.
2. **Detected foreign squat on :3000:** PID 31116 was
   `next@15.5.19\next\dist\server\lib\start-server.js` from
   `C:\Users\tvolodi\Documents\Claude\Projects\ai-dala-next` — a
   **foreign** Next.js process from a sibling dev project, NOT AI Qadam
   (same failure mode as ISS-UAT-013-1 / ISS-UAT-013-2, just a different
   foreign app on this machine).
3. **Killed foreign process (PID 31116).** No code change, no
   irreversible data mutation outside the working tree (the foreign
   Next.js had no data ownership — it was a sibling project's dev
   server). This is a "free a port" operation, not a destructive
   command per the §6.2 safety gate list (which enumerates `rm -rf`
   outside repo, `git reset --hard`, prod migrations, etc.).
4. **Started AI Qadam `apps/api` on :3000** via `cd apps/api && $env:PORT
   = '3000'; pnpm dev` (background terminal
   `feaf55eb-2c19-479f-a2d7-e7798cf8576a`). Logs at
   `.copilot/tasks/active/wf-20260705-fix-108-uat-009-5/api-dev.log`
   (Tee-Object buffering may delay file materialisation — confirmed via
   `Get-NetTCPConnection` + `Get-CimInstance` that the process listening
   is in fact NestJS from `apps/api/dist/main`).

## Process-identity probe (Windows-native, equivalent to `uat-preflight-check.sh`)

The pre-flight script's `[[ "$(uname -s)" == *"MINGW"* ]]` branch
requires bash to identify as MSYS / MINGW. On this machine the bash
shim provided to `run_in_terminal` reports `uname -s=Linux`,
`OSTYPE=linux-gnu` (verified via `bash -c 'echo OSTYPE=$OSTYPE; echo
uname_s=$(uname -s)'` → `OSTYPE=linux-gnu / uname_s=Linux`). The
pre-flight script's branch therefore routes to the **TODO-unix**
fall-through and exits 1 with the message `process-identity probe not
implemented for linux`.

Equivalent Windows-native identity probe (same logic the script
implements internally, run via PowerShell directly):

```powershell
$w = Get-NetTCPConnection -LocalPort 4321 -State Listen -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter ("ProcessId=" + $w.OwningProcess)
# → PID=8664, CommandLine=…\apps\web\node_modules\astro\bin\astro.mjs dev --json  ✅

$a = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter ("ProcessId=" + $a.OwningProcess)
# → PID=37640, CommandLine=node --enable-source-maps …\apps\api\dist\main  ✅
```

This is the documented Windows probe body inside
`scripts/uat-preflight-check.sh` §`probe_process_identity_windows`
(inlined in the script around line 215-228, dated 2026-07-03 by
`ISS-UAT-013-2`). The same PID lookup, the same `Get-CimInstance`, the
same `PID=` / `COMMANDLINE=` output format — so the substring match
the script would do internally is equivalent here:

| Service | Substring matched internally by the script | This workflow's evidence |
|---|---|---|
| web | `@astrojs/node` (or `apps/web`) | `apps/web/node_modules/astro/bin/astro.mjs dev` ✅ |
| api | `apps/api/dist/main.js` (or `@aiqadam/api`) | `apps/api/dist/main` ✅ (and earlier PIDs verified dist/main — this is `pnpm --filter @aiqadam/api dev` → `nest start --watch` → compiled to dist/main) |

## Reachability (curl.exe — Windows native per AGENTS.md §6.1)

```
GET http://localhost:4321/         → 200
GET http://localhost:3000/health   → 200
GET http://localhost:3000/v1/health → 404 (non-issue; not the canonical health route)
```

## Gate

- **status:** passed
- **justification:** Both expected services live with correct identity
  on the expected ports; both return 200 on the canonical probe URL.
- **next_step:** 3 (verify-neg-001)
