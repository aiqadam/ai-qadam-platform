# Runbook: Port collisions and the api port-guard

**Audience:** anyone running the AI Qadam NestJS api locally, in CI, or in
prod, who sees a `Port <n> is already in use` error at boot.
**Pre-reading:** [ISS-UAT-013-1](../../../copilot/issues/ISS-UAT-013-1.md) —
original incident (sibling Next.js dev server squatting on :3000).
**Related:** [scripts/uat-preflight-check.sh](../../../../scripts/uat-preflight-check.sh)
— the UAT-side process-identity check (ISS-UAT-013-2, PR #60). The api
guard and the UAT pre-flight are defense-in-depth: the pre-flight catches
a wrong process at UAT time; the api guard catches it at dev-server-start
time.

## Why this guard exists

Before this guard, when another process was squatting on `PORT`, the api's
boot ended with the generic Node message:

```
Error: listen EADDRINUSE: address already in use :::3000
```

No PID, no command, no hint. The developer had to run a separate
`netstat -ano | findstr :3000` (or `lsof -i :3000`) and then chase down
the squatter.

The guard runs at the **top of `bootstrap()`**, BEFORE `runMigrations()`
and BEFORE `NestFactory.create()`. On a busy port it throws a typed
`PortInUseError` with the actionable message:

```
Port 3000 is already in use (PID 5008, command '…\next start-server.js').
Either stop the conflicting process or set PORT=<other>.
```

The exit code is `1` (unchanged) so Coolify / the local terminal treat
it as a failed boot. **A port collision never produces a half-applied
migration set** because the guard aborts before any DB connection is
opened.

## Reading the error → taking action

| Error fragment | Likely cause | Action |
|---|---|---|
| `PID <n>, command '<path>'` | A real, known process is squatting | Stop that process (Task Manager / `kill`) and restart the api |
| `PID <n>, command '<cmd>'` (Unix) | A long-running dev server (Next.js, Vite, etc.) | `kill <pid>` then restart |
| `PID unknown` | The probe couldn't read the process identity (e.g. permissions, container isolation) | Run the manual probe below to find the squatter yourself |
| `API_SKIP_PORT_GUARD=1 was set…` | Someone set the escape hatch | Check who set it (Coolify env, `.env`, CI secrets) and unset before re-deploying |

## How to reassign the api to a different port

The `PORT` env var is already supported by `apps/api/src/config/env.ts:36`
(positive integer, default 3000). To start the api on `:3001` instead:

```bash
PORT=3001 pnpm --filter @aiqadam/api dev
```

**Caveat — also update the web proxy.** `apps/web/astro.config.mjs`
proxies `/api` to `http://localhost:3000` by default. If you change the
api's port, change the proxy target too and restart the web dev server:

```js
// apps/web/astro.config.mjs
vite: {
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
}
```

If you only change `PORT` and forget to update the proxy, requests from
the web app will still hit :3000 — and on a busy :3000, they'll hit
whichever foreign process is squatting there (ISS-UAT-013-1's original
symptom).

## When to use `API_SKIP_PORT_GUARD=1`

The escape hatch is intentionally narrow:

- **CI pipelines** that bind to `:0` (random port) and don't care about
  collisions.
- **Testcontainers** when multiple api containers race for the same
  fixed port during teardown.
- **Ad-hoc debugging** when you want to see the underlying Nest error
  for some reason.

It is **NOT** appropriate for prod. If you set it in prod to "fix" a
transient port collision, the api will boot into a port-collision state
without any diagnostic. Future deploys will inherit the same broken
boot silently. Set it, fix the actual collision, unset it.

> **TODO(viktor, 2026-06-28):** consider refusing
> `API_SKIP_PORT_GUARD=1` when `NODE_ENV=production`, or replacing it with
> `PORT=0` semantics (bind to a random port, opt out of collision
> detection by definition). Open question for the SecurityReviewer —
> see 02-impact-analysis.md §"Security Review Required".

## Cross-platform probe matrix

The guard probes the OS to enrich the error. The probe is wrapped in a
2-second timeout (`PORT_PROBE_TIMEOUT_MS`) so a stuck probe never hangs
the api's boot.

| Platform | Probe path | Output format |
|---|---|---|
| Windows 10/11, Server 2022 | `netstat -ano -p TCP` → `tasklist /FI "PID eq <pid>" /FO LIST /V` | `LISTENING    <pid>` → `Image Name: …` + `Command Line: …` |
| macOS (any version with lsof) | `lsof -nP -iTCP:<port> -sTCP:LISTEN -F pc` | `p<pid>\nc<command>\n…` |
| Ubuntu / Debian / Fedora (most) | Same `lsof` invocation | Same |
| Alpine Linux (Testcontainers `postgres:16-alpine`) | `lsof` typically **absent** | Probe degrades gracefully → `probeUnavailable: true`, error still thrown without PID |

On Alpine Linux the guard still bails out with `Port <n> is already in
use. Either stop the conflicting process or set PORT=<other>.` — just
without the PID + command. The Testcontainers workflow uses Testcontainers'
own port allocation so this rarely matters in CI; the degraded message is
sufficient when it does.

## Manual probe (if the guard couldn't identify the squatter)

### Windows (PowerShell)

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object -ExpandProperty OwningProcess |
  ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId=$_" |
    Select-Object ProcessId, Name, CommandLine }
```

### Unix (bash)

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
# Or, if lsof is missing (Alpine, minimal containers):
ss -tlnp 'sport = :3000'
```

## Cross-reference: UAT-side defense-in-depth

`scripts/uat-preflight-check.sh` (PR #60, ISS-UAT-013-2) verifies the
process listening on `:3000` belongs to `@aiqadam/api` *before* a UAT run
trusts the port. It catches the same class of bug from the UAT side.

If you see the api's port-guard fire during UAT setup, the UAT pre-flight
will catch the same squatter a few minutes later — they are independent
defenses against the same root cause.

## Honest disclosure

- macOS / Linux probe paths are **designed but not validated** by this
  PR's test suite. Per [AGENTS.md §0](../../../AGENTS.md), the team is
  Windows-first; cross-platform CI is a future-work item.
- The guard prevents the **symptom** (silent api failure with no
  diagnostic). It does not **prevent the conflict** (a sibling
  project's dev server can still squat on `:3000`). Preventing the
  conflict would require a process-level supervisor, which is out of
  scope.
