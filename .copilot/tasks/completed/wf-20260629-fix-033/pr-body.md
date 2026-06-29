## What

Adds a pre-startup port-availability guard to the API process. Before the API binds its HTTP listener, `assertPortAvailable()` probes the configured port and fails fast with a diagnostic error if it is already in use. This closes the UAT process-identity gap documented in ISS-UAT-013-1.

## Why

ISS-UAT-013-1 is a real UAT-process-identity hazard: when two processes can claim the same port area, the UAT runner cannot reliably know which code is actually serving requests. A pre-startup guard is the standard defense-in-depth control. It turns a silent intermittent failure into a loud immediate one with PID + command line.

## How

- New module `apps/api/src/lib/port-guard.ts`: `assertPortAvailable(port)` probes the port. **Connect-based** (not bind-based): connect succeeds = busy, ECONNREFUSED = free, timeout = fail-closed busy. On busy, enriches via netstat+tasklist (Win) / lsof (Unix). `PortInUseError` carries code, port, pid?, command?, probeUnavailable?.
- Wired into `apps/api/src/main.ts` at the top of `bootstrap()`, before `runMigrations()` and `NestFactory.create()`.
- 9 test cases in `apps/api/test/port-guard.spec.ts`.
- Runbook `docs/04-development/infrastructure/runbooks/ports-and-processes.md`.
- **Atomic status flip** (per FEAT-WORKFLOW-003 Step 9): ISS-UAT-013-1.md and registry.md flipped open to resolved in THIS commit.

## Risks

- **Connect-based not bind-based**: Windows allows multiple sockets to bind the same port (no SO_EXCLUSIVEADDRUSE), so bind-based probing is unsound on Windows. Connect-based is correct. Trade-off: a half-open listener may time out and fail-closed to busy (safe direction).
- Escape hatch `API_SKIP_PORT_GUARD=1` or `'true'` for CI/Testcontainers. Documented.
- External probe binaries (netstat, tasklist, lsof) required for PID/command enrichment. Missing (ENOENT) → PortInUseError with probeUnavailable=true, fail-safe.
- AGENTS.md §4 cap lifted for this branch per user direction (2026-06-29): 972 insertions across 9 files. Self-contained feature that does not split without breaking atomic status flip.
- vitest globalSetup is broken with pre-existing vite-node 2.1.9 SSR bug. Blocks ALL api unit tests locally. Reproduces on clean main HEAD. Out of scope. Spec validated via tsx standalone smoke tests.

## Testing

- `pnpm --filter @aiqadam/api typecheck` PASS
- `pnpm exec biome check` on all 3 source files PASS
- `pnpm arch:check` PASS (247 files)
- tsx smoke tests: busy port throws with PID+command, free port resolves silently, escape hatch skips. All PASS.
- Three real bugs found and fixed during smoke testing (would have been caught by unit tests if the harness ran): inverted logic, malformed message, Windows-bind-succeeds flaw.

## Checklist

- [x] Tests added (9 cases)
- [x] Docs added (runbook + BP-UAT-000 cross-reference)
- [x] No new dependencies (node:net, node:child_process, node:util only)
- [x] Manually tested locally (tsx smoke tests; vitest harness broken)
- [x] Atomic status flip per FEAT-WORKFLOW-003 Step 9
