# ISS-UAT-013-1 — Port 3000 occupied by foreign Next.js dev server; AI Qadam api not running

| Field | Value |
|---|---|
| ID | ISS-UAT-013-1 |
| Severity | blocker |
| Module | uat / environment |
| Status | open |
| Reported | 2026-06-28 |
| Reporter | UATRunner (wf-20260628-uat-030 / 03-uat-runner-report.md), independently confirmed by Orchestrator via `Get-CimInstance Win32_Process` |
| Workflow | wf-20260628-uat-030 |

## Symptom

BP-UAT-013 run on 2026-06-28 at 11:37:00Z failed 9 of 11 tests. All 9 failures — plus 2 visually-coincidental passes in Neg 002 / Neg 003 — trace to a single root cause: **the AI Qadam NestJS api is not running on port 3000**.

Reproduced via three independent probes:

| Probe | Result | Interpretation |
|---|---|---|
| `Get-CimInstance Win32_Process -Filter "ProcessId=5008"` | `…\ai-dala-next\node_modules\.pnpm\next@15.5.19…\next\dist\server\lib\start-server.js` | An unrelated Next.js dev server from `C:\Users\tvolo\Documents\Claude\Projects\ai-dala-next` is squatting on port 3000 |
| `curl.exe -i -X POST http://localhost:3000/v1/leads -d '{"email":"…"}'` | HTTP 404, empty body | Foreign Next.js does not implement any `/v1/*` route |
| Browser-side fetch via Astro proxy `web:4321/api/v1/leads` | UI shows red error text `POST /api/v1/leads → 404` | Same Next.js 404 reaches the React form component |
| Mailpit `/api/v1/messages` search by recipient | 0 messages for `uat-lead-new@aiqadam.test`, `uat-lead-honeypot@aiqadam.test` | Nothing was dispatched — AI Qadam api never ran the verify-email path |

The `apps/web` Astro dev server (PID 23044, port 4321) **is** running correctly. Docker stack is healthy. Directus, Authentik, Mailpit, and the three `operator_invites` rows inserted by the Orchestrator are all present. **The only blocker is the missing api process.**

## Root cause

A sibling project (`C:\Users\tvolo\Documents\Claude\Projects\ai-dala-next`) was started earlier in the dev session and bound port 3000. The AI Qadam NestJS api is not running because port 3000 is already occupied; nothing in `apps/api/package.json` or any startup script warns the developer that another service is squatting on the port.

The Astro dev server in `apps/web/astro.config.mjs` is configured with `vite.server.proxy['/api'] → http://localhost:3000`. When the wrong service listens on :3000, the proxy faithfully forwards requests to the wrong backend with no diagnostic visible to the developer or to UATRunner beyond a generic 404.

## Repro

```bash
# 1. Start the AI Qadam api
pnpm --filter @aiqadam/api dev
# Expected: "Nest application successfully started" + "Listening on http://localhost:3000"
# Actual:   "Error: listen EADDRINUSE: address already in use :::3000"

# 2. Identify the squatter
Get-CimInstance Win32_Process -Filter "ProcessId=5008" | Select CommandLine
# → C:\Users\tvolo\Documents\Claude\Projects\ai-dala-next\node_modules\.pnpm\next@15.5.19_…\node_modules\next\dist\server\lib\start-server.js
```

## Proposed resolution

Two options, in order of preference:

1. **Kill the foreign process and start the AI Qadam api on :3000** (preferred for this workflow, since `apps/web/astro.config.mjs` already proxies to :3000 and `apps/api/.env` has `OIDC_REDIRECT_URI=…:4321/api/v1/auth/callback`):
   ```powershell
   Stop-Process -Id 5008 -Force   # the ai-dala-next dev server
   pnpm --filter @aiqadam/api dev
   ```
2. **Start the AI Qadam api on a different port (e.g., 3001) and temporarily override the Astro proxy target.** This requires editing `apps/web/astro.config.mjs` (`vite.server.proxy['/api'].target = 'http://localhost:3001'`) and restarting `apps/web`. Use this only if killing the foreign process is unacceptable for the dev session.

After restart, re-run `pnpm --filter @aiqadam/e2e exec playwright test --config playwright.uat.config.ts tests/uat/BP-UAT-013-signup.spec.ts --reporter=list`.

## Longer-term improvement (non-blocking)

- Add a pre-startup guard in `apps/api` that checks port availability and exits with a clear error message: `"Port 3000 is already in use (PID X, command '…'). Either stop the conflicting process or set PORT=<other>."`
- Add a UAT environment preflight script (`scripts/uat-env-setup.sh` extension) that verifies the api CommandLine on :3000 belongs to `@aiqadam/api` (by checking the executable path), not just that the port is open. See ISS-UAT-013-2 for the matching process-gap fix on the Orchestrator pre-flight side.

## References

- `.copilot/tasks/active/wf-20260628-uat-030/03-uat-runner-report.md` — full run report
- `.copilot/tasks/active/wf-20260628-uat-030/02-preflight.md` — pre-flight that missed this (see ISS-UAT-013-2)
- `apps/web/astro.config.mjs` — proxy config
- `apps/api/package.json` — api dev script