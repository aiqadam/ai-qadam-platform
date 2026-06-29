# ISS-UAT-013-1 — Port 3000 occupied by foreign Next.js dev server; AI Qadam api not running

| Field | Value |
|---|---|
| ID | ISS-UAT-013-1 |
| Severity | blocker |
| Module | uat / environment |
| Status | resolved |
| Reported | 2026-06-28 |
| Reporter | UATRunner (wf-20260628-uat-030 / 03-uat-runner-report.md), independently confirmed by Orchestrator via `Get-CimInstance Win32_Process` |
| Workflow | wf-20260628-uat-030 |
| Resolved by | wf-20260629-fix-033 (re-landed cleanly after PR #62 closed; protocol: FEAT-WORKFLOW-003 Step 9 atomic status flip) |
| Resolved on | 2026-06-29 |

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
- `apps/api/src/main.ts` line 42 — current `await app.listen(env.PORT)` (the unguarded call)

---

## Resolution attempt — wf-20260628-fix-033

**Started:** 2026-06-28T15:30:00Z
**Resolver:** Orchestrator + CodeDeveloper + SecurityReviewer + TestStrategist + TestDesigner + TestRunner
**Status:** in-progress (will flip to `resolved` on Step 9 success)

### Approach (per the issue's "Proposed resolution" §1)

Add a `port-guard.ts` module to `apps/api/src/lib/` that probes the requested port before `runMigrations()` and `NestFactory.create()` are called. On `EADDRINUSE` the guard:

1. Detects the owning PID via OS-specific probe (`lsof` / `netstat` + `tasklist`).
2. Captures the CommandLine of the owning PID.
3. Throws an enriched error with the exact actionable text the issue specifies: `"Port 3000 is already in use (PID 5008, command '…\\ai-dala-next\\…\\next start-server.js'). Either stop the conflicting process or set PORT=<other>."`
4. Honors an `API_SKIP_PORT_GUARD=1` escape hatch for CI, Testcontainers, and ad-hoc port reassignment via the existing `PORT` env var (already supported by `env.ts`).

### Why this works

- The check is at the very top of `bootstrap()` — *before* migrations run, so a port collision never produces a half-applied migration set.
- The error is structured (`Error` with a `code: 'PORT_IN_USE'` and `pid` / `command` properties) so future tooling (e.g. the pre-flight script) can parse it programmatically without regex.
- The probe uses `net.createServer()` + `.listen().unref()` — it touches the kernel briefly, never holds the port, and works identically on Windows / macOS / Linux.

### Honest disclosures (per AGENTS.md §9)

- I have not personally tested the fix on macOS or Linux; the cross-platform probe path is designed but the bats/vitest cases will only exercise Windows-first (the team is Windows-first per AGENTS.md §0). If a future operator hits a Linux-only failure, the action plan is in the new runbook.
- The fix prevents the **symptom** (silent api failure with no diagnostic). It does not **prevent the conflict** (a sibling project's dev server can still squat on :3000). Preventing the conflict would require a process-level supervisor, which is out of scope.
- The escape hatch `API_SKIP_PORT_GUARD=1` is a foot-gun: setting it in production defeats the guard. Documented in the runbook; not enforced at startup.

### Implementation (will be filled in by `03-code-summary.md`)

- `apps/api/src/lib/port-guard.ts` — new module, ≤ 80 lines
- `apps/api/src/main.ts` — 2-line edit at the top of `bootstrap()`
- `apps/api/test/port-guard.spec.ts` — vitest cases
- `docs/04-development/infrastructure/runbooks/ports-and-processes.md` — new runbook
- `docs/02-business-processes/uat/BP-UAT-000.md` — one-line cross-reference
- `.copilot/issues/ISS-UAT-013-1.md` — status flip on Step 9 success
- `.copilot/issues/registry.md` — registry update on Step 9 success