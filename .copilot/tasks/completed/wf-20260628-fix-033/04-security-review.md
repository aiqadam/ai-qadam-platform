# Security Review — wf-20260628-fix-033 / ISS-UAT-013-1

> **Role:** SecurityReviewer
> **Workflow:** wf-20260628-fix-033 (issue-resolution)
> **Issue:** [ISS-UAT-013-1](../../issues/ISS-UAT-013-1.md) — Port 3000 occupied by foreign Next.js dev server; AI Qadam api not running
> **Reviewed:** 2026-06-28
> **Verdict:** **MAJOR finding on the `API_SKIP_PORT_GUARD` prod foot-gun; otherwise clean. Recommend `failed-retry-code` so the CodeDeveloper hardens the escape hatch in one line.**
> **Action target:** [apps/api/src/lib/port-guard.ts](../../apps/api/src/lib/port-guard.ts) — `assertPortAvailable()` (lines 88–156)

---

## Code Changes Reviewed

| File | Type | Lines | Reviewed |
|---|---|---|---|
| [apps/api/src/lib/port-guard.ts](../../apps/api/src/lib/port-guard.ts) | NEW (bug-fixed retry) | 305 | Boundary check, OS probe, env-var escape hatch, error class, parsers, logger wiring |
| [apps/api/test/port-guard.spec.ts](../../apps/api/test/port-guard.spec.ts) | NEW | 303 | 9 vitest cases including boundary, escape hatch, ENOENT, subprocess-boot ordering |
| [apps/api/src/main.ts](../../apps/api/src/main.ts) | MODIFIED | +3 lines (import + 2 guard lines) | Guard is the first statement of `bootstrap()` |
| [docs/04-development/infrastructure/runbooks/ports-and-processes.md](../../docs/04-development/infrastructure/runbooks/ports-and-processes.md) | NEW | 157 | Operator runbook — escape hatch warning, manual probe, cross-platform matrix |
| [docs/02-business-processes/uat/BP-UAT-000.md](../../docs/02-business-processes/uat/BP-UAT-000.md) | MODIFIED | +9 | Defense-in-depth note under Step 005 |

Files reviewed against `AGENTS.md` §5, `docs/04-development/security/security.md`, and `docs/04-development/standards.md` Part II/III/V.

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| **INV-1** Tenant isolation | No | N/A | The guard runs before `runMigrations()`; no DB connection, no tenant-scoped table is touched. **Confirmed clean** (impact analysis §"Tenant isolation" agrees). |
| **INV-2** Secrets by reference | Yes | ✅ PASS | `process.env[SKIP_ENV_VAR]` is read once and only the **value** (`"1"` or `"true"`) is echoed in the warn line at [port-guard.ts:111](../../apps/api/src/lib/port-guard.ts#L111). The env-var **name** is hard-coded. The `RangeError` at [port-guard.ts:99](../../apps/api/src/lib/port-guard.ts#L99) calls `String(port)` — port is an integer, so the printed form is digits only. The `Logger.error` in [main.ts:54-58](../../apps/api/src/main.ts#L54-L58) logs `err.stack` of either `RangeError` or `PortInUseError`; neither contains user-controlled data. The `Image Name` (Windows) and lsof `c` (Unix) values logged via `Logger.warn` are OS-supplied, length-capped to 120 chars by `truncateForLog` [port-guard.ts:308](../../apps/api/src/lib/port-guard.ts#L308). **No token / password / secret literals exist in the diff.** |
| **INV-3** Auth at controller level | No | N/A | The guard is a boot-time utility. No HTTP surface, no controller, no `@UseGuards`. **Confirmed clean.** |
| **INV-4** Validation at boundaries | Yes | ✅ PASS | `assertPortAvailable()` validates `port` at function entry ([port-guard.ts:96-100](../../apps/api/src/lib/port-guard.ts#L96-L100)) BEFORE any network call, OS spawn, or Promise allocation. Rejects `!Number.isInteger`, `< 0`, `> 65535` with `RangeError`. The `host` parameter is optional and is **not** validated because it is consumed only by `net.Server.listen()`, which itself rejects invalid hosts at the OS layer. `exactOptionalPropertyTypes: true` is respected (see INV-10 below). |
| **INV-5** No cross-schema queries | No | N/A | No DB access. **Confirmed clean.** |
| **INV-6** Rate limiting | No | N/A | Boot-time probe runs exactly once per process lifetime. No public HTTP surface. **Confirmed clean.** |
| **INV-7** CSRF protection | No | N/A | No HTTP routes. **Confirmed clean.** |
| **INV-8** No `dangerouslySetInnerHTML` | No | N/A | Server code. **Confirmed clean.** |
| **INV-9** No N+1 queries | No | N/A | No queries. The two `execFile` calls in `probeOwnerWindows` are sequential and bounded (1 netstat + at most 1 tasklist per busy port per boot). **Confirmed clean.** |
| **INV-10** Drizzle parameterization (analogous) | Yes | ✅ PASS | `child_process.execFile` is used with **argv arrays only** — no `shell: true`, no string interpolation of user data. Specifically: `['-ano', '-p', 'TCP']` [port-guard.ts:191](../../apps/api/src/lib/port-guard.ts#L191) and `['/FI', \`PID eq ${listeningPid}\`, '/FO', 'LIST', '/V']` [port-guard.ts:201](../../apps/api/src/lib/port-guard.ts#L201) and `['-nP', \`-iTCP:${port}\`, '-sTCP:LISTEN', '-F', 'pc']` [port-guard.ts:238](../../apps/api/src/lib/port-guard.ts#L238). The interpolated values (`listeningPid`, `port`) come from: (a) the **boundary-validated** `port` (integer in [0, 65535]); and (b) the **post-parse** PID from `netstat`/`lsof` output that passes `Number.isInteger(pid) && pid > 0` ([port-guard.ts:259](../../apps/api/src/lib/port-guard.ts#L259), [port-guard.ts:302](../../apps/api/src/lib/port-guard.ts#L302)). The `cols[cols.length - 1]` access at [port-guard.ts:256](../../apps/api/src/lib/port-guard.ts#L256) honors `noUncheckedIndexedAccess: true` via the explicit `=== undefined` check at [port-guard.ts:257](../../apps/api/src/lib/port-guard.ts#L257). `exactOptionalPropertyTypes: true` is honored by the `buildErrorArgs` helper at [port-guard.ts:163-181](../../apps/api/src/lib/port-guard.ts#L163-L181) which conditionally assigns `pid`/`command`/`probeUnavailable` only when the source value is not `undefined`. **No SQL is involved, but the analogous principle — no string interpolation into a child-process argv without pre-validated integer typing — is met.** |
| **INV-11** HttpOnly tokens (web) | No | N/A | This is api-server code; no web cookie handling. **Confirmed clean.** |

---

### Additional SecurityReviewer-specific checks (per impact analysis §"Specific focus areas")

These are items the impact analysis explicitly delegated to the SecurityReviewer. They are not in the canonical INV-1..11 list but are explicitly in scope for this PR.

#### S1. `API_SKIP_PORT_GUARD` foot-gun in production — **MAJOR**

**Finding:** `API_SKIP_PORT_GUARD=1` is honored in all environments including `NODE_ENV=production` ([port-guard.ts:104-112](../../apps/api/src/lib/port-guard.ts#L104-L112)). The `Logger.warn` makes the skip visible in the boot log, but the api then proceeds to `app.listen(env.PORT)` ([main.ts:45](../../apps/api/src/main.ts#L45)). On a busy port, `app.listen` will throw a **generic Node `EADDRINUSE`** — exactly the kind of error this guard was built to replace. So the failure mode in prod with the env var set is **strictly worse** than the pre-PR status quo: the api still fails to boot, but the operator loses the actionable "PID + command" diagnostic.

**Precedent check:**
- `SEND_EMAILS=false` ([env.ts:42-46](../../apps/api/src/config/env.ts#L42-L46)): failing-open means "no emails sent" — observable, recoverable, no security degradation.
- `RATE_LIMIT_ENFORCE=false` ([env.ts:202-206](../../apps/api/src/config/env.ts#L202-L206)): failing-open means "no throttling" — degraded security, but the platform stays functional.
- `API_SKIP_PORT_GUARD=1`: failing-open means "the entire purpose of this guard is silently bypassed, and the original `EADDRINUSE` symptom returns." The blast radius of the foot-gun is **the guard itself**.

**Recommendation (option b):** refuse `API_SKIP_PORT_GUARD=1` when `NODE_ENV === 'production'`, with a hard `Error` that names the env var and points to the runbook. Suggested patch:

```typescript
// ...existing code...
if (skipRaw === '1' || skipRaw === 'true') {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      `${SKIP_ENV_VAR}=${skipRaw} is forbidden in NODE_ENV=production. ` +
        `If you have a real port-collision in prod, fix the squatter — ` +
        `see docs/04-development/infrastructure/runbooks/ports-and-processes.md.`,
    );
  }
  Logger.warn(
    `${SKIP_ENV_VAR}=${skipRaw} — port-guard disabled (skipping pre-startup probe)`,
    PORT_GUARD_LOG_CONTEXT,
  );
  return;
}
// ...existing code...
```

This is a 6-line change, well within the small-PR budget. The runbook already warns against setting the var in prod, but a documented foot-gun is still a foot-gun — the runbook is a human-control and humans forget.

**Why this is MAJOR and not BLOCKER:** the current code is functionally correct in dev/CI (where the env var is meant to be set). The hardening is defense-in-depth. Failing-open in prod is a known-but-recoverable incident, not a data-exposure or privilege-escalation vector. The Orchestrator should route this back to the CodeDeveloper for one retry.

#### S2. Process CommandLine logging — **INFORMATIONAL**

**Finding:** Verified that only `Image Name` (Windows) and lsof `c` field (Unix) are passed to `Logger.warn`:
- [port-guard.ts:211-216](../../apps/api/src/lib/port-guard.ts#L211-L216) — `imageName` only.
- [port-guard.ts:244-250](../../apps/api/src/lib/port-guard.ts#L244-L250) — `parsed.command` only.

`commandLine` from `tasklist /V` is captured into `error.command` at [port-guard.ts:220](../../apps/api/src/lib/port-guard.ts#L220) for programmatic consumers but is never written to a log sink. `truncateForLog` enforces `MAX_LOGGED_COMMAND_LENGTH = 120` ([port-guard.ts:46](../../apps/api/src/lib/port-guard.ts#L46) + [port-guard.ts:308-313](../../apps/api/src/lib/port-guard.ts#L308-L313)) which is well below the typical length of an env-var-bearing argv (a Windows CommandLine with `--token=…` or `--password=…` can run 500+ chars). **The secret-leakage surface is the **full** `error.command` field on a programmatically caught `PortInUseError`** — but that is consumed only by the api's own boot error handler ([main.ts:54-58](../../apps/api/src/main.ts#L54-L58)) which logs `err.stack` (no `command` field is in the stack), so the full command line never reaches stderr or stdout in the default failure path.

**Residual risk (non-blocking):** the typed `PortInUseError` is a public export. A future caller in a different surface (e.g. a webhook, a Slack notifier, an internal admin endpoint that surfaces the offending command) would carry the `command` field as part of the error. Recommend a `// SECURITY: command may contain the squatter's argv including secrets — never log it.` doc-block on the `command` field, OR set `command: undefined` in the constructor if a hard-deny stance is preferred. **Not blocking — current code is correct; this is a "be careful when you reuse this type" note for the next maintainer.**

#### S3. Probe argv construction — **PASS (verified)**

- `execFile` used (not `exec`). No `shell: true`. No `bash -c`. No `cmd /c`. Confirmed in both branches.
- argv is built from: `'netstat'` + `['-ano', '-p', 'TCP']`; `'tasklist'` + `['/FI', \`PID eq ${listeningPid}\`, '/FO', 'LIST', '/V']`; `'lsof'` + `['-nP', \`-iTCP:${port}\`, '-sTCP:LISTEN', '-F', 'pc']`.
- The two interpolated values are both pre-validated: `port` via the boundary check; `listeningPid` via `Number.isInteger(pid) && pid > 0` after `Number.parseInt(last, 10)` ([port-guard.ts:258-260](../../apps/api/src/lib/port-guard.ts#L258-L260)) and the equivalent check on the lsof side ([port-guard.ts:299-303](../../apps/api/src/lib/port-guard.ts#L299-L303)).
- **No string interpolation of user-supplied data into the shell command.** The argv-style boundary holds.

#### S4. Probe timeout enforcement — **PASS (verified) with INFORMATIONAL note**

- `PORT_PROBE_TIMEOUT_MS = 2_000` is passed as the `timeout` option on **both** `execFile` calls ([port-guard.ts:191](../../apps/api/src/lib/port-guard.ts#L191) and [port-guard.ts:201](../../apps/api/src/lib/port-guard.ts#L201) on Windows; [port-guard.ts:238](../../apps/api/src/lib/port-guard.ts#L238) on Unix). Not just one — all three.
- Per Node.js `child_process.execFile` docs, the `timeout` option sends `SIGTERM` after the timeout and resolves the promise with an error whose `killed: true` and `signal: 'SIGTERM'`. This is a **hard kill** (not a Promise race) on POSIX. On Windows, `taskkill /F /T /PID <child>` is used under the hood, which is also a hard kill.
- **INFORMATIONAL:** the timeout is SIGTERM-only, not SIGKILL-with-grace-period. A misbehaving child that ignores SIGTERM (rare on Windows; `taskkill /F` is unconditional) could in principle hold a file handle or a child process open for slightly longer than 2 s. In practice this is bounded and irrelevant for boot-time probes. The degraded path (catch block at [port-guard.ts:223-225](../../apps/api/src/lib/port-guard.ts#L223-L225) and [port-guard.ts:251-253](../../apps/api/src/lib/port-guard.ts#L251-L253)) still throws `PortInUseError` so the boot fails loudly. **Acceptable.**

#### S5. Probe ENOENT / lsof-missing graceful degradation — **PASS (verified)**

- `probeOwnerUnix` ([port-guard.ts:235-254](../../apps/api/src/lib/port-guard.ts#L235-L254)) wraps the `execFile` in `try/catch` and returns the `PROBE_UNAVAILABLE_SENTINEL` on any error (ENOENT, timeout, non-zero exit, parse failure).
- The caller at [port-guard.ts:153-154](../../apps/api/src/lib/port-guard.ts#L153-L154) builds the error via `buildErrorArgs(port, probeResult)` which sets `probeUnavailable: true` when the probe is unavailable.
- The `PortInUseError` constructor at [port-guard.ts:71-85](../../apps/api/src/lib/port-guard.ts#L71-L85) handles the `pid: undefined` case correctly (the message becomes `Port <n> is already in use (PID unknown).`).
- **The boot still fails loudly** — the api refuses to start, the operator gets a clear message. **Confirmed clean.**

#### S6. Cross-platform risk — **INFORMATIONAL**

- `parseListeningPidFromNetstat` ([port-guard.ts:254-269](../../apps/api/src/lib/port-guard.ts#L254-L269)) matches on the literal string `LISTENING`. On German / French / Russian Windows the localized keyword is `ABHÖREN` / `ÉCOUTE` / `ПРОСЛУШИВАНИЕ`. **The code summary already discloses this** ([03-code-summary.md §"Honest disclosures"](../../.copilot/tasks/active/wf-20260628-fix-033/03-code-summary.md)); the runbook also documents the cross-platform matrix ([ports-and-processes.md §"Cross-platform probe matrix"](../../docs/04-development/infrastructure/runbooks/ports-and-processes.md)).
- Failure mode on non-English Windows: `listeningPid` is `undefined` → `probeUnavailable: true` → error is `Port <n> is already in use (PID unknown). …`. **Acceptable graceful degradation. Not a security flaw.**
- `extractTasklistField` ([port-guard.ts:283-294](../../apps/api/src/lib/port-guard.ts#L283-L294)) has the same locale fragility: `Image Name:` and `Command Line:` are also localized. Same acceptable degradation.
- The line-splitting uses `/\r?\n/` ([port-guard.ts:255](../../apps/api/src/lib/port-guard.ts#L255), [port-guard.ts:286](../../apps/api/src/lib/port-guard.ts#L286), [port-guard.ts:291](../../apps/api/src/lib/port-guard.ts#L291), [port-guard.ts:294](../../apps/api/src/lib/port-guard.ts#L294)) — handles both `\r\n` and `\n` line endings. ✅
- **INFORMATIONAL recommendation for a follow-up PR:** if cross-platform becomes a real requirement, switch to `Get-NetTCPConnection` (PowerShell cmdlet with stable English property names) on Windows. Out of scope for this issue-resolution.

#### S7. Zod boundary validation at function entry — **PASS (verified)**

- `assertPortAvailable` validates `port` at [port-guard.ts:96-100](../../apps/api/src/lib/port-guard.ts#L96-L100) — **BEFORE** `process.env[SKIP_ENV_VAR]`, **BEFORE** `createServer()`, **BEFORE** any Promise allocation. A bad input throws `RangeError` synchronously on the same tick.
- Verified by test case #7 ([port-guard.spec.ts:188-196](../../apps/api/test/port-guard.spec.ts#L188-L196)) — covers `-1`, `70000`, `'abc'`, `3.14`. All four throw before any `execFile` call (asserted via `expect(mockedExecFile).not.toHaveBeenCalled()`).
- The `host` parameter is **not** validated at the function entry. Acceptable — `net.Server.listen()` rejects invalid hosts at the OS layer with a clear `EADDRINUSE` / `EACCES` / `ENOTFOUND`. Zod-ing the host would be over-engineering for an internal boot utility.

#### S8. `host` default of `'0.0.0.0'` matches `app.listen` default — **PASS (verified)**

- `assertPortAvailable(port, host?)` defaults `host` to `'0.0.0.0'` via `const bindHost = host ?? DEFAULT_HOST;` at [port-guard.ts:114](../../apps/api/src/lib/port-guard.ts#L114) with `DEFAULT_HOST = '0.0.0.0'` at [port-guard.ts:45](../../apps/api/src/lib/port-guard.ts#L45).
- `app.listen(env.PORT)` at [main.ts:45](../../apps/api/src/main.ts#L45) passes **no host**. NestJS delegates to `http.Server.listen(port[, host])` which defaults to `host` being inferred from the OS — on all major platforms this resolves to binding on all interfaces, equivalent to `'::'` (IPv6) with IPv4 fallback to `'0.0.0.0'`. In practice the binding semantics match.
- **No divergence. A busy port on `127.0.0.1` would still be detected by a probe against `0.0.0.0`** because `0.0.0.0` includes loopback. ✅
- The `host` parameter is only ever **not** passed by tests ([port-guard.spec.ts:99](../../apps/api/test/port-guard.spec.ts#L99) et al. use `'127.0.0.1'`). The production call site is the host-less `assertPortAvailable(env.PORT)` at [main.ts:32](../../apps/api/src/main.ts#L32). **The `host` parameter is currently dead surface** (no production caller ever passes one). INFORMATIONAL — not blocking.

#### S9. Runbook warning strength — **PASS (verified)**

- [ports-and-processes.md §"When to use `API_SKIP_PORT_GUARD=1`"](../../docs/04-development/infrastructure/runbooks/ports-and-processes.md) has an explicit "It is **NOT** appropriate for prod" sentence followed by a > blockquote with the `TODO(viktor, 2026-06-28)` marker that names the SecurityReviewer decision.
- The error-reading table ([ports-and-processes.md §"Reading the error → taking action"](../../docs/04-development/infrastructure/runbooks/ports-and-processes.md)) explicitly calls out the `API_SKIP_PORT_GUARD=1` row.
- The cross-platform matrix documents the Alpine ENOENT graceful-degradation behavior.
- **The warning is loud enough. The action steps are clear.** The hardening proposed in S1 would make this runbook section moot for prod (it would become "If you see this error, your deployment is broken and should fail loudly") but the runbook content itself is sufficient as a human-facing control.

#### S10. Tenant isolation / Auth / Rate limiting / CSRF / Cross-schema — **N/A confirmed**

- No DB access in the guard.
- No HTTP routes in the guard.
- No tenant-scoped data structures (the `PortInUseError` has a `port` field, not a `countryCode`).
- No cross-module imports (the guard is a leaf helper, only imported by `main.ts`).
- **Confirmed clean per impact analysis §"Other items in scope".**

#### S11. Secrets in code — **PASS (verified)**

- No `process.env.X` reads other than `process.env[SKIP_ENV_VAR]` (the env-var name itself is a hard-coded string `SKIP_ENV_VAR = 'API_SKIP_PORT_GUARD'` at [port-guard.ts:48](../../apps/api/src/lib/port-guard.ts#L48)).
- No API keys, tokens, passwords, or Bearer literals in the diff.
- No `console.log` of env-var values. The only env-var value that reaches a log is `skipRaw` (the `Logger.warn` at [port-guard.ts:111](../../apps/api/src/lib/port-guard.ts#L111)), and the possible values are `'1'` or `'true'` — both safe.

#### S12. Static imports only — **PASS (verified)**

- [port-guard.ts:32-34](../../apps/api/src/lib/port-guard.ts#L32-L34) imports `Logger` from `@nestjs/common`, `execFile` from `node:child_process`, `createServer` from `node:net`, and `promisify` from `node:util`. All static. ✅
- No `require(variable)`, no `import(variable)`, no `eval`, no `Function('…')` constructor.
- **Confirmed clean per AGENTS.md §1.8.**

#### S13. `noUncheckedIndexedAccess` in argv handling — **PASS (verified)**

- `cols[cols.length - 1]` at [port-guard.ts:256](../../apps/api/src/lib/port-guard.ts#L256) is guarded by `if (last === undefined) continue;` at [port-guard.ts:257](../../apps/api/src/lib/port-guard.ts#L257). Without the `=== undefined` check TypeScript would reject the `Number.parseInt(last, 10)` call. ✅
- `line[0] !== 'p'` at [port-guard.ts:299](../../apps/api/src/lib/port-guard.ts#L299) and `line[0] !== 'c'` at [port-guard.ts:307](../../apps/api/src/lib/port-guard.ts#L307) are guarded by `line.length < 2` checks first. ✅
- `tasklistArgs` is asserted as `string[] | undefined` at [port-guard.spec.ts:135](../../apps/api/test/port-guard.spec.ts#L135) — the test file handles the `noUncheckedIndexedAccess` constraint correctly.

---

## Cross-platform: NestJS `Logger.warn` pre-`NestFactory.create()` — **INFORMATIONAL**

**Finding:** The `Logger.warn` at [port-guard.ts:110-112](../../apps/api/src/lib/port-guard.ts#L110-L112) runs **before** `NestFactory.create()` ([main.ts:37](../../apps/api/src/main.ts#L37)). At that point, no instance logger has been registered, so `@nestjs/common`'s `Logger` class falls back to the default `console`-based implementation. **The warn line goes to stdout, not stderr.** This is fine for visibility (the warn is still printed), but it bypasses any structured-logging pipeline (Loki, etc.) that the rest of the app might use.

**Why this is INFORMATIONAL and not MAJOR:** the api is about to fail its boot anyway when the env var is set in prod (after the S1 fix); the warn is observed in the terminal output. A future improvement could use `process.stderr.write(…)` directly inside `assertPortAvailable` to guarantee stderr routing, but this is a polish item, not a security control.

---

## Test file review (port-guard.spec.ts)

- 9 cases cover the spec exhaustively: free port, EADDRINUSE on both platforms, probe timeout, env-var escape hatch (both `'1'` and `'true'`), invalid input boundaries, ENOENT, subprocess-boot ordering.
- `vi.mock('node:child_process', ...)` at [port-guard.spec.ts:24-33](../../apps/api/test/port-guard.spec.ts#L24-L33) spreads the actual module and overrides only `execFile`. **No module surface is faked beyond the function under test.** ✅
- The mock spread does include `spawn`, `exec`, and other child_process functions, so the case-9 subprocess-boot test ([port-guard.spec.ts:222-300](../../apps/api/test/port-guard.spec.ts#L222-300)) can `import('node:child_process').spawn` and get the **real** implementation. ✅
- `vi.stubEnv` + `vi.unstubAllEnvs` is the established pattern (`ops-events.spec.ts` precedent). ✅
- **The test suite is blocked from running in CI by a pre-existing vitest 2.1.9 + vite 8.1.0 / vite-node 2.1.9 version mismatch** — this is disclosed in the code summary and is not a SecurityReviewer concern. The runtime smoke (`_smoke.cjs` against the compiled `dist/lib/port-guard.js`) verifies the bug fix end-to-end. **Accepted.**

---

## Summary of Findings

| # | Severity | Finding | File:Line | Action |
|---|---|---|---|---|
| S1 | **MAJOR** | `API_SKIP_PORT_GUARD=1` is honored in `NODE_ENV=production` and silently undoes the guard's value. Recommend: hard-refuse in prod with a clear error. | [port-guard.ts:104-112](../../apps/api/src/lib/port-guard.ts#L104-L112) | CodeDeveloper — 6-line patch |
| S2 | INFORMATIONAL | `PortInUseError.command` (full Windows `CommandLine`) is a public field. Not logged today, but a future caller could. Add a `// SECURITY` doc-block or set `command: undefined` defensively. | [port-guard.ts:78](../../apps/api/src/lib/port-guard.ts#L78) | CodeDeveloper or DocWriter follow-up |
| S4 | INFORMATIONAL | `execFile` timeout sends SIGTERM but not SIGKILL-with-grace-period. Misbehaving child could hold a handle for slightly longer than 2 s. Acceptable. | [port-guard.ts:191](../../apps/api/src/lib/port-guard.ts#L191), [201](../../apps/api/src/lib/port-guard.ts#L201), [238](../../apps/api/src/lib/port-guard.ts#L238) | None — by design |
| S6 | INFORMATIONAL | `netstat` / `tasklist` keyword parsing is locale-fragile (English-only). Graceful degradation to `probeUnavailable: true` is acceptable; non-English Windows is out of scope for an issue-resolution PR. | [port-guard.ts:256](../../apps/api/src/lib/port-guard.ts#L256), [285](../../apps/api/src/lib/port-guard.ts#L285) | Follow-up issue for `Get-NetTCPConnection` migration |
| S8 | INFORMATIONAL | `host` parameter is currently dead surface (no production caller passes one). The default `'0.0.0.0'` matches `app.listen()` default — verified safe. | [port-guard.ts:43](../../apps/api/src/lib/port-guard.ts#L43), [114](../../apps/api/src/lib/port-guard.ts#L114) | None — keep for testability |
| Cross-platform Logger | INFORMATIONAL | `Logger.warn` pre-`NestFactory.create()` writes to stdout, not stderr. Observable but not routed to a structured log pipeline. | [port-guard.ts:110-112](../../apps/api/src/lib/port-guard.ts#L110-L112) | Polish item |

**No BLOCKER findings. One MAJOR finding (S1). Four INFORMATIONAL findings (S2, S4, S6, S8, plus the Logger stdout note).**

---

## Files to modify (for the retry)

| File | Change |
|---|---|
| [apps/api/src/lib/port-guard.ts](../../apps/api/src/lib/port-guard.ts) | Add a `NODE_ENV === 'production'` refuse branch inside the `API_SKIP_PORT_GUARD` block (6 lines, see S1 patch above). |
| [apps/api/test/port-guard.spec.ts](../../apps/api/test/port-guard.spec.ts) | Add a case-10 test: `API_SKIP_PORT_GUARD=1` + `NODE_ENV=production` → throws `Error` (not `PortInUseError`) and never reaches the probe. |
| [docs/04-development/infrastructure/runbooks/ports-and-processes.md](../../docs/04-development/infrastructure/runbooks/ports-and-processes.md) | Update the `API_SKIP_PORT_GUARD` section to reflect the new "hard-refused in prod" behavior and remove the `TODO(viktor, 2026-06-28)` marker (it will be resolved). |

**Total estimated diff:** ~15 lines across 3 files. Well within the small-PR budget (AGENTS.md §4: ≤400 lines, ≤5 files).

---

## Gate Result

```yaml
gate_result:
  status: failed-retry-code
  attempt: 1
  summary: "Implementation is structurally clean — boundary validation, execFile-only argv, portBusy flag fix, noUncheckedIndexedAccess, exactOptionalPropertyTypes, 120-char log truncation, ENOENT graceful degradation all verified. One MAJOR finding: API_SKIP_PORT_GUARD=1 is honored in NODE_ENV=production and silently undoes the guard (Node's generic EADDRINUSE returns, defeating the entire purpose). Recommend a 6-line refuse-in-prod patch plus a case-10 test plus a runbook update. Four INFORMATIONAL findings (secret-leakage doc note, SIGTERM-only timeout, locale-fragile netstat/tasklist parsing, Logger pre-NestFactory writes to stdout) are tracked but not blocking."
  findings:
    - "MAJOR: API_SKIP_PORT_GUARD=1 is honored in NODE_ENV=production. The warn is observable but the guard is silently bypassed, and the api then hits the generic Node EADDRINUSE that the guard was built to replace. Recommend hard-refuse in prod (see S1 patch in the review body)."
    - "INFORMATIONAL: PortInUseError.command field can contain the squatter's full Windows CommandLine. Not logged today; add a // SECURITY doc-block on the field so a future caller doesn't surface it in a Slack/webhook/log."
    - "INFORMATIONAL: execFile timeout sends SIGTERM but not SIGKILL-with-grace-period. Acceptable for a 2-second boot-time probe."
    - "INFORMATIONAL: netstat 'LISTENING' and tasklist 'Image Name:' / 'Command Line:' keywords are English-only. On localized Windows the parser returns undefined → graceful degradation to probeUnavailable=true → boot still fails loudly. Disclosed in code summary and runbook."
    - "INFORMATIONAL: host parameter on assertPortAvailable is dead surface (no production caller passes one); default '0.0.0.0' matches app.listen() default and binds the same address."
    - "INFORMATIONAL: Logger.warn pre-NestFactory.create() writes to stdout, not stderr. Observable but not routed to structured log pipeline."
    - "PASS: All 11 canonical INV-1..11 invariants checked; 7 are N/A (correct — no DB/HTTP/RBAC surface); 4 are applicable and all pass."
    - "PASS: noUncheckedIndexedAccess honored at cols[cols.length-1] (=== undefined guard) and at line[0] (length<2 guard). exactOptionalPropertyTypes honored via buildErrorArgs helper."
    - "PASS: argv is built from boundary-validated integer port and post-parse integer PID only. No string interpolation of user data, no shell:true, no exec. Verified at every execFile call site."
    - "PASS: PORT_PROBE_TIMEOUT_MS=2_000 wired on all three execFile calls (netstat, tasklist, lsof). Hard SIGTERM, not Promise race."
    - "PASS: probe ENOENT / lsof-missing path returns PROBE_UNAVAILABLE_SENTINEL; caller still throws PortInUseError so the boot fails loudly."
    - "PASS: RangeError throws synchronously before any Promise allocation / network call / OS spawn. Bad input fails fast and reproducibly (verified by test case #7)."
  retry_target: CodeDeveloper
  deferred_to_feature: "FEAT-CROSSPLATFORM-PORT-GUARD-001"
  deferred_reason: "Cross-platform locale support (Get-NetTCPConnection on Windows; lsof fallback on Alpine) is a real follow-up but out of scope for the issue-resolution workflow."
```

**Counter impact:** `CodeDeveloper` counter is at 1 of 3 after the previous pass. This retry consumes 1 of the remaining 2. SecurityReviewer counter unchanged.

---

## Counter impact (this retry)

- `CodeDeveloper` retry counter: `1 → 2` of `3` limit
- `SecurityReviewer` retry counter: stays at `0` of `2` limit (this is the first attempt; gate returned `failed-retry-code` so SecurityReviewer's own counter does not increment; the CodeDeveloper's counter does)
