# Step 3 — Code Summary (RETRY 2 — security hardening)

**Workflow:** wf-20260628-fix-033
**Issue resolved:** [ISS-UAT-013-1](../../issues/ISS-UAT-013-1.md) — Port 3000 occupied by foreign Next.js dev server; AI Qadam api not running
**Implemented by:** CodeDeveloper
**Implemented at:** 2026-06-28T21:40:00Z (retry of 21:30:00Z retry-of-21:20:00Z original)
**Retry count:** 2 / 3 (CodeDeveloper limit per `handoff.yaml.retry_limits`)
**Prior gate status:** `passed` → `failed-retry-code` (SecurityReviewer MAJOR finding S1)
**This gate status:** see [Gate Result](#gate-result)

---

## Retry rationale — security hardening

The SecurityReviewer's review (`04-security-review.md`) returned one MAJOR finding (**S1**) plus four INFORMATIONAL notes. The previous `passed` was technically valid for the bug fix but missed a security hardening: `API_SKIP_PORT_GUARD=1` was honored in **all** environments, including `NODE_ENV=production`. The failure mode in prod was strictly worse than the pre-PR status quo — the api boots, the warn is logged, and then `app.listen(env.PORT)` throws the generic Node `EADDRINUSE` that this guard was built to replace. The escape hatch was a defense-in-depth foot-gun.

The fix is the S1 patch from the review, applied with two cosmetic deviations flagged in [Honest disclosures](#honest-disclosures) §1:

1. **`apps/api/src/lib/port-guard.ts:104-126`** — added a `NODE_ENV === 'production'` hard-refusal inside the `API_SKIP_PORT_GUARD` block. The api now throws a plain `Error` (not `PortInUseError`) with the message `API_SKIP_PORT_GUARD=1 is forbidden in NODE_ENV=production. If you have a real port-collision in prod, fix the squatter. See docs/04-development/infrastructure/runbooks/ports-and-processes.md.` This throw happens **before** any network call, OS probe, or `Promise` allocation — the probe never runs.
2. **`apps/api/test/port-guard.spec.ts:215-243`** — added case #10 covering the new prod-refuse path. Asserts that the caught error is an `Error` (not a `PortInUseError`), the message matches the expected substring and the runbook reference, and that `mockedExecFile` was never called (probe skipped).
3. **`docs/04-development/infrastructure/runbooks/ports-and-processes.md`** — three discrete edits: (a) added the new error row to the "Reading the error → taking action" table; (b) replaced the foot-gun "It is NOT appropriate for prod" sentence with an assertive "**Forbidden in production.**" blockquote; (c) removed the `TODO(viktor, 2026-06-28)` marker (resolved by this patch); (d) added a new sub-section `### Error: API_SKIP_PORT_GUARD=1 is forbidden in NODE_ENV=production` with recovery steps.

The change is the minimum requested: ~12 lines added to `port-guard.ts`, 29 lines added to `port-guard.spec.ts` (case #10), ~17 lines edited in the runbook.

---

## Requirement Implemented

ISS-UAT-013-1 asks for a pre-startup port-availability guard in `apps/api`
that exits with a clear, actionable error message before `NestFactory.create`
is called when the requested port is already in use. The error must include
the PID and command of the squatter.

The implementation (this is a security-hardening retry — the underlying
implementation is unchanged from the previous retry):

1. Adds `apps/api/src/lib/port-guard.ts` — `assertPortAvailable(port, host?)`
   + `PortInUseError` class. Opens a probe socket via `net.createServer()
   .listen().unref()`, catches `EADDRINUSE`, then runs an OS-specific probe
   to enrich the error. Honors `API_SKIP_PORT_GUARD=1`/`true` for CI /
   Testcontainers / ad-hoc port reassignment; **hard-refuses the escape
   hatch in `NODE_ENV=production`** with a plain `Error` pointing at the
   runbook (S1 hardening, this retry).
2. Wires the guard into `apps/api/src/main.ts` as the **first** line of
   `bootstrap()`, BEFORE `runMigrations()` — so a port collision never
   produces a half-applied migration set.
3. Adds `apps/api/test/port-guard.spec.ts` — 10 vitest cases (was 9) covering
   free port, EADDRINUSE enrichment on both Windows and Unix, probe timeout,
   the `API_SKIP_PORT_GUARD` escape hatch (both `'1'` and `'true'`),
   invalid input boundaries, ENOENT/missing-binary degradation, the
   subprocess-boot ordering regression, and **case #10 — the new
   prod-refuse path** (this retry).
4. Adds `docs/04-development/infrastructure/runbooks/ports-and-processes.md`
   — the operator-facing runbook, with the API_SKIP_PORT_GUARD section
   updated to reflect the hard-refuse behavior (this retry).
5. Adds a defense-in-depth note to `docs/02-business-processes/uat/BP-UAT-000.md`
   under the existing "Process identity check" section.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| [apps/api/src/lib/port-guard.ts](../../../apps/api/src/lib/port-guard.ts) | MODIFIED (this retry) | **~317 lines** (was 305 in retry 1). +12 lines: new `NODE_ENV === 'production'` refuse branch inside the `API_SKIP_PORT_GUARD` block + 7-line explanatory comment + dot-access tweak to satisfy Biome `useLiteralKeys`. Underlying logic unchanged from retry 1's bug-fixed version. |
| [apps/api/test/port-guard.spec.ts](../../../apps/api/test/port-guard.spec.ts) | MODIFIED (this retry) | **~332 lines** (was 303 in retry 1). +29 lines: case #10 (`API_SKIP_PORT_GUARD=1 + NODE_ENV=production → throws hard Error`). Placed after case #6 so the cases read in numeric order. |
| [apps/api/src/main.ts](../../../apps/api/src/main.ts) | UNCHANGED (this retry) | +3 lines (1 import + 2 lines at top of `bootstrap()`) — from the original implementation. |
| [docs/04-development/infrastructure/runbooks/ports-and-processes.md](../../../docs/04-development/infrastructure/runbooks/ports-and-processes.md) | MODIFIED (this retry) | **~174 lines** (was 157 in retry 1). 4 discrete edits: new error row in the cross-reference table; replaced the foot-gun warning with the assertive "**Forbidden in production.**" blockquote; removed the `TODO(viktor, 2026-06-28)` marker (resolved); added a new `### Error: API_SKIP_PORT_GUARD=1 is forbidden in NODE_ENV=production` sub-section with recovery steps. |
| [docs/02-business-processes/uat/BP-UAT-000.md](../../../docs/02-business-processes/uat/BP-UAT-000.md) | UNCHANGED (this retry) | +9 lines (defense-in-depth note under Step 005 API-health) — from the original implementation. |

**Total this retry:** 3 files modified, ~58 lines of additions. The cumulative PR (all 5 files) is still well below the 400-line / 5-file code cap from AGENTS.md §4.

## Key Design Decisions

### 1. Hard-refuse in `NODE_ENV=production`, soft-warn elsewhere (this retry)

Per the S1 patch from the SecurityReviewer review. The new `if (process.env.NODE_ENV === 'production') { throw new Error(...); }` block fires **before** `Logger.warn` and **before** any return. The throw happens **before** `createServer()`, **before** any `Promise` allocation, and **before** any `execFile` call. This is consistent with AGENTS.md §1.5 (one assertion per function entry) — the prod refuse is an assertion about the environment, not about the port.

The plain `Error` (not `PortInUseError`) is intentional: the failure is an operator misconfiguration, not a port-state problem. A caller catching `PortInUseError` would otherwise silently miss the refuse — which is exactly what the S1 patch was designed to prevent.

### 2. `portBusy` flag captured inside the Promise (unchanged from retry 1)

From retry 1's bug fix. The flag is set inside `onError` when `err.code === 'EADDRINUSE'` and left at its initial `false` when `onListening` fires. After the Promise resolves, `if (!portBusy) return;` exits cleanly on a free port; the busy branch runs `probeOwner(port)` and throws `PortInUseError`. No `probe.address()` heuristic.

### 3. Probe uses `net.createServer().listen().unref()` (unchanged)

Per AGENTS.md §1.2 and the issue spec. The probe socket touches the kernel briefly, never holds the port, and works identically on all platforms. `unref()` prevents an orphaned probe from keeping the event loop alive.

### 4. Split `probeOwner` into Windows + Unix branches (unchanged)

Per AGENTS.md §1.4 (≤60-line functions). `probeOwnerWindows` uses `netstat -ano -p TCP` → `tasklist /FI "PID eq <pid>" /FO LIST /V`; `probeOwnerUnix` uses `lsof -nP -iTCP:<port> -sTCP:LISTEN -F pc`. Both share the 2-second `PORT_PROBE_TIMEOUT_MS` ceiling.

### 5. Split `parseLsofMachineFormat` into `extractLsofPid` + `extractLsofCommand` (unchanged)

Biome flagged the original single-function parser at complexity 12 (max 10). Splitting the two loops into separate helpers drops each to ≤5. Same pattern as `extractTasklistField`.

### 6. `CommandLine` is logged only via `truncateForLog` (120 chars) (unchanged)

Per the SecurityReviewer focus area 2 in `02-impact-analysis.md`. The full `CommandLine` is captured into `error.command` for programmatic consumers; only `ExecutablePath` (Windows `Image Name`) is written to stderr via `Logger.warn`.

### 7. Placement: guard is FIRST in `bootstrap()` (unchanged)

Per the impact-analysis placement decision (a port collision must never produce a half-applied migration set).

### 8. `exactOptionalPropertyTypes: true` compatibility (unchanged)

Solved via a `buildErrorArgs(port, probeResult)` helper that conditionally adds the `pid`, `command`, and `probeUnavailable` keys only when the underlying value is defined. Keeps the type strict without `as` casts.

### 9. `vi.stubEnv` for env-var tests (unchanged, extended in case #10)

The established pattern from `ops-events.spec.ts` rather than direct `process.env` mutation. Case #10 also stubs `NODE_ENV` via `vi.stubEnv` — and the `afterEach` `vi.unstubAllEnvs()` cleanly restores both stubs.

### 10. Dot-access `process.env.NODE_ENV` instead of bracket-access (this retry)

See [Honest disclosures](#honest-disclosures) §1. Biome's `useLiteralKeys` rule flagged `process.env['NODE_ENV']` as needing dot-access. I verified `noPropertyAccessFromIndexSignature: false` in `apps/api/tsconfig.json:13` (and `@types/node` types `process.env.NODE_ENV` as `string | undefined`), so the dot form is type-safe. The spec's bracket form was defensive against a `noPropertyAccessFromIndexSignature: true` setting that doesn't apply here.

## Architecture Rule Compliance

| Rule (AGENTS.md §) | Compliance | Notes |
|---|---|---|
| §1 — Ten Non-Negotiables | All ten met | No nested-ifs >3 levels (the prod-refuse block is one extra level of nesting under `if (skipRaw === '1' \|\| skipRaw === 'true')` — still <3); loops have explicit upper bounds; magic numbers → named constants; all functions ≤60 lines; one assertion per function entry (the prod refuse is the env-assertion, the boundary check is the port-assertion, both before any work); smallest-possible variable scope; promises awaited; no dynamic imports; flat data structures; zero warnings on changed files. |
| §3 — Code quality | Met | `strict: true` (no implicit any); `noUncheckedIndexedAccess: true` honored (the `cols[cols.length - 1]` check); no `any`; no `as` casts; no `@ts-ignore`; Biome formatter clean on all 3 changed TS files (this retry) — no `Found N errors` from the lint command. The 16 pre-existing `noExcessiveCognitiveComplexity` warnings are all in `apps/api/src/modules/*` (untouched by this PR). |
| §5 — Security baseline | Met | No secrets in code; `argv` is built from `port.toString()` and integer PIDs only (no string interpolation of user-supplied data); no `shell: true`; no command-injection vector; `child_process.execFile` used (not `exec`); the S1 hardening from the SecurityReviewer review adds a **hard refusal in `NODE_ENV=production`** for `API_SKIP_PORT_GUARD=1` so the escape hatch cannot silently undo the guard's value. |
| §9 — Honesty and integrity | Met | See "Honest disclosures" + "Known Limitations" below. The deviations from the task spec (dot-access `NODE_ENV`, template literal instead of concatenation) are explicitly disclosed here and were driven by the project's Biome lint rules — never silent. |
| §1 — Architecture (module boundaries) | Met | `port-guard.ts` is a leaf helper inside `apps/api/src/lib/`. No service / controller / repository imports. |
| §1 — Architecture (no cross-schema queries) | N/A | No DB access. |
| §1 — Architecture (static imports) | Met | All imports are static. |
| §1 — Architecture (no new tenant-scoped tables) | N/A | No DB changes. |
| §1 — Architecture (auth at controller level) | N/A | No HTTP routes. |
| CodeDeveloper role §"Architecture Self-Check" | Met | Custom typed errors (`PortInUseError` with `code: 'PORT_IN_USE'`); awaited promises; no DB; no cross-module calls; no new endpoints; no shared-types; no React; no Astro. The new prod-refuse throw uses a plain `Error` (not a custom type) because the failure mode is operator misconfiguration, not port-state — this is the same plain-Error pattern NestJS uses for its own `EADDRINUSE`. |

## Formatter Check

`pnpm biome check --apply apps/api/src/lib/port-guard.ts apps/api/test/port-guard.spec.ts apps/api/src/main.ts docs/04-development/infrastructure/runbooks/ports-and-processes.md`:

```
Checked 3 files in 10ms. No fixes applied.
```

(The shell also prints an `[internalError/fs] DEPRECATED` notice about `--apply` being replaced by `--write` in a future major — informational, not an error.) All three TypeScript files are Biome-clean. The two markdown files are skipped by the project's Biome config (markdown formatter is not enabled in `biome.json`).

**Initial biome run before the cosmetic fixes failed with 4 errors all on `port-guard.ts:120-124`** (useLiteralKeys, useTemplate, noUnusedTemplateLiteral ×2). These were all auto-fixable per Biome's "Unsafe fix" suggestions. After applying the fixes (dot-access `process.env.NODE_ENV` + single template literal instead of concatenation), the run is clean. See [Honest disclosures](#honest-disclosures) §1 for the deviation rationale.

## Validation Results

| Command | Result | Notes |
|---|---|---|
| `pnpm --filter @aiqadam/api typecheck` | ✅ Exit 0 | 0 errors. `exactOptionalPropertyTypes: true` and `noUncheckedIndexedAccess: true` still honored. The new `process.env.NODE_ENV === 'production'` check is type-safe under `@types/node`. |
| `pnpm --filter @aiqadam/api lint` | ✅ Exit 0 (after fix) | After the biome fixes (dot-access + single template literal): "Found 16 warnings." All 16 are pre-existing `noExcessiveCognitiveComplexity` warnings on `apps/api/src/modules/*` (untouched by this PR). No `Found N errors`. Before the fixes, the same command produced "Found 4 errors. Found 16 warnings" — all 4 errors were on the new prod-refuse block and were biome auto-fixable. |
| `pnpm --filter @aiqadam/api build` | ✅ Exit 0 | `nest build` compiles cleanly; `dist/lib/port-guard.js` contains the patch. Verified via grep: `if (process.env.NODE_ENV === 'production')` and `is forbidden in NODE_ENV=production` both present in the compiled artifact. |
| `pnpm biome check --apply` (on changed paths) | ✅ Exit 0 | "Checked 3 files in 10ms. No fixes applied." |
| **Direct runtime smoke against `dist/lib/port-guard.js` — 3 S1 cases (this retry)** | ✅ All 3 cases PASS | Output verbatim: <br/>• `WARN [PortGuard] API_SKIP_PORT_GUARD=1 — port-guard disabled (skipping pre-startup probe)` <br/>• `SMOKE 1 OK: skip-guard in dev resolves` <br/>• `SMOKE 2 OK: prod skip-guard refused with: API_SKIP_PORT_GUARD=1 is forbidden in NODE_ENV=production. If you have a real port-collision in prod, fix the squatter. See docs/04-development/infrastructure/runbooks/ports-and-processes.md.` <br/>• `SMOKE 3 OK: free port in prod resolves` <br/> Exit 0. All three cases match the expected behavior: case #1 verifies the non-prod path still resolves; case #2 verifies the new prod-refuse throws the exact expected error and message; case #3 verifies that a free port in prod (no env var) still resolves to the normal path. |
| `pnpm --filter @aiqadam/api exec vitest run test/port-guard.spec.ts` | ❌ Blocked by pre-existing infra (unchanged from retry 1) | The vitest 2.1.9 + vite 8.1.0 / vite-node 2.1.9 version mismatch (verified to affect every existing api spec, not specific to this PR) blocks the test runner with `ReferenceError: __vite_ssr_exportName__ is not defined`. The runtime smoke against the compiled artifact confirms the new case #10's expected behavior at runtime. See [Known Limitations](#known-limitations) §1 for the recommended remediation. |

## Known Limitations

1. **Vitest test suite is blocked by a pre-existing vitest 2.1.9 + vite 8.1.0 / vite-node 2.1.9 version mismatch.** Same as retry 1 — `ReferenceError: __vite_ssr_exportName__ is not defined at src/lib/port-guard.ts:1:1` (verified to affect every api spec, not specific to this PR). The new case #10 has not been exercised under vitest; its expected behavior is verified by the runtime smoke against the compiled `dist/lib/port-guard.js` (all 3 S1 smoke cases pass). Recommended remediation: a separate PR to pin matching vite/vite-node versions. Not blocking for this issue-resolution workflow.

2. **`port-guard.ts` is 317 lines (was 305 in retry 1, was 334 in the original buggy pass).** Per AGENTS.md §1.4 the rule is "functions ≤60 lines" — that rule IS met (every function in the file is under 60 lines). The total file length reflects the rationale comments, the typed `PortInUseError` class, the two platform probes + parsers, and the new prod-refuse block + its explanatory comment. Not blocking.

3. **macOS / Linux probe paths are designed but not validated by this PR's test suite (unchanged from retry 1).** `probeOwnerUnix` is exercised via mocked `child_process.execFile` (case #3); the actual `lsof` invocation has not been run on a live Unix system. Per AGENTS.md §0 the team is Windows-first; documented in the runbook.

4. **Cross-platform locale fragility (unchanged INFORMATIONAL from S6 in the SecurityReviewer review).** `parseListeningPidFromNetstat` matches the literal string `LISTENING`. On non-English Windows the parser returns `undefined` → `probeUnavailable: true` → graceful degradation. Documented in the runbook. A follow-up issue for `Get-NetTCPConnection` migration is tracked under `FEAT-CROSSPLATFORM-PORT-GUARD-001`.

5. **`PortInUseError.command` field can contain the squatter's full Windows CommandLine (unchanged INFORMATIONAL from S2 in the SecurityReviewer review).** Not logged today; a future caller could surface it. Recommended follow-up: add a `// SECURITY` doc-block on the field. Not blocking.

6. **The guard prevents the symptom, not the conflict (unchanged from retry 1).** A sibling project's dev server can still squat on :3000 without warning. The guard surfaces the collision loudly with PID + CommandLine; it does not prevent it. Out of scope per the issue.

## Honest disclosures

1. **Two cosmetic deviations from the task spec, both driven by the project's Biome lint rules.** The task spec gave a verbatim code block for the S1 patch:
   - Spec used `process.env['NODE_ENV']`. Biome's `useLiteralKeys` flagged this as needing dot-access. I changed it to `process.env.NODE_ENV`. Verified safe: `apps/api/tsconfig.json:13` has `noPropertyAccessFromIndexSignature: false`, and `@types/node` types `process.env.NODE_ENV` as `string | undefined`. The dot form was already used elsewhere in the codebase (`apps/api/src/config/env.ts:43` and elsewhere) — the bracket form was defensive against a stricter setting that doesn't apply.
   - Spec used 3-line string concatenation. Biome's `useTemplate` + `noUnusedTemplateLiteral` flagged this as needing a single template literal. I changed it to one template literal. The runtime message is identical.

   Both deviations are strict improvements (defensiveness removed where not needed; concatenation replaced with a single template) and Biome's auto-fix offered both. I applied them rather than suppress the lint warning, because AGENTS.md §3 explicitly says "Linter warnings are treated as errors in CI" — leaving the warnings would fail CI. If the SecurityReviewer wants the exact spec form preserved, the runbook update and the test case still pass with the bracket form + concatenation; only the lint check would need a targeted suppression.

2. **The runtime smoke verifies the S1 behavior at runtime, end-to-end.** The smoke script (`_smoke_s1.cjs` in this workflow's dir, gitignored) runs all 3 cases against the compiled `dist/lib/port-guard.js` and produces the expected output. This is the strongest verification I can run without fixing the vitest/vite-node version mismatch (Known Limitation #1).

3. **Case #10 has not been exercised under vitest** for the same Known Limitation #1 reason. The test file is structurally correct (matches the case #5 / case #6 pattern; uses `vi.stubEnv` for both `API_SKIP_PORT_GUARD` and `NODE_ENV`; uses `Object.defineProperty(process, 'platform', …)` to avoid Windows-specific probe paths; uses the `try/catch` pattern from case #3 to capture the thrown error). Once the vitest/vite-node issue is fixed, case #10 is expected to pass based on the runtime smoke output.

4. **The `netstat -ano -p TCP` output format** assumed by `parseListeningPidFromNetstat` matches Windows 10/11 and Server 2022 default output (the `LISTENING` keyword + a trailing PID). If a future Windows version changes the column order or locale-localizes the keyword, the parser will return `undefined` and the guard will degrade gracefully with `probeUnavailable: true`. Same as retry 1.

5. **The previous passes claimed `passed` while the implementation was broken (retry 1) and while the S1 foot-gun was open (this retry).** Per AGENTS.md §9, I own both errors. The current code summary explicitly downgrades to `passed` only for the runtime smoke (3 cases for S1 + the 2 from retry 1) + structural correctness of the test file; the actual vitest suite is blocked by the pre-existing infra issue.

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 3
  summary: "S1 hardening from the SecurityReviewer review applied. API_SKIP_PORT_GUARD=1 now throws a plain Error (not PortInUseError) when NODE_ENV=production, with a clear message pointing at the runbook. Two cosmetic deviations from the spec (dot-access NODE_ENV instead of bracket-access; single template literal instead of concatenation) were required to satisfy the project's Biome lint rules — both are strict improvements and biome auto-fixable. typecheck + lint + build + biome all exit 0 on the changed files. The runtime smoke against the compiled dist/lib/port-guard.js confirms all three S1 cases: (1) skip-guard in dev resolves, (2) skip-guard in production refuses with the exact expected error message, (3) free port in production resolves. The 16 pre-existing lint warnings on apps/api/src/modules/* are out of scope. Vitest remains blocked by the pre-existing vitest 2.1.9 + vite 8.1.0 / vite-node 2.1.9 version mismatch (Known Limitation #1)."
  findings:
    - "S1 hardening applied: assertPortAvailable refuses API_SKIP_PORT_GUARD=1 in NODE_ENV=production with a plain Error pointing at the runbook. Runtime smoke confirms the exact expected message: 'API_SKIP_PORT_GUARD=1 is forbidden in NODE_ENV=production. If you have a real port-collision in prod, fix the squatter. See docs/04-development/infrastructure/runbooks/ports-and-processes.md.'"
    - "Case #10 added to port-guard.spec.ts: asserts the prod-refuse path throws a plain Error (not PortInUseError), the message matches the expected substring and the runbook reference, and that mockedExecFile was never called (probe skipped). Structurally correct; not exercised under vitest due to the pre-existing version mismatch."
    - "Runbook updated: TODO marker resolved; API_SKIP_PORT_GUARD section now asserts 'Forbidden in production'; new cross-reference table row added; new recovery sub-section added under 'Reading the error → taking action'."
    - "All architecture rules from AGENTS.md §1, §3, §5, §9 met for the changed files."
    - "Two cosmetic deviations from the task spec (dot-access NODE_ENV; single template literal) were applied to satisfy Biome's useLiteralKeys + useTemplate + noUnusedTemplateLiteral rules. Verified safe (tsconfig has noPropertyAccessFromIndexSignature: false; @types/node types process.env.NODE_ENV). If the SecurityReviewer wants the verbatim spec form preserved, the lint check would need a targeted biome-ignore comment."
    - "Pre-existing vitest 2.1.9 + vite 8.1.0 / vite-node 2.1.9 version mismatch causes __vite_ssr_exportName__ ReferenceError on every api spec (including those untouched by this PR). Verified to affect every api spec, not specific to this PR. Out of scope for this code-developer step; recommended remediation is a separate PR to pin matching vite/vite-node versions."
    - "Runtime smoke against compiled dist/lib/port-guard.js PASSES (3 S1 cases + the 2 from retry 1: free-port resolves, busy-port throws PortInUseError). The S1 patch is verified end-to-end."
    - "PASS: All 11 canonical INV-1..11 invariants checked in retry 1; the S1 hardening does not touch any of them. No new invariants introduced."
  files:
    new: []  # this retry is modify-only; new files were added in retry 1
    modified:
      - apps/api/src/lib/port-guard.ts                       # +12 lines (prod-refuse block + comment + dot-access tweak)
      - apps/api/test/port-guard.spec.ts                     # +29 lines (case #10)
      - docs/04-development/infrastructure/runbooks/ports-and-processes.md  # ~17 lines edited (TODO removed, foot-gun replaced, table row added, new sub-section)
    cumulative_pr_diff:
      new:
        - apps/api/src/lib/port-guard.ts                    # 317 lines total (was 0 pre-PR)
        - apps/api/test/port-guard.spec.ts                  # ~332 lines, 10 cases (was 0 pre-PR)
        - docs/04-development/infrastructure/runbooks/ports-and-processes.md  # ~174 lines
      modified:
        - apps/api/src/main.ts                              # +3 lines
        - docs/02-business-processes/uat/BP-UAT-000.md      # +9 lines
  validation:
    typecheck: "passed (exit 0)"
    lint: "passed (exit 0; 0 errors, 16 pre-existing warnings in untouched files)"
    build: "passed (exit 0); S1 patch present in dist/lib/port-guard.js (grep verified)"
    biome_format: "passed (exit 0; no fixes needed)"
    vitest_spec: "BLOCKED by pre-existing vitest 2.1.9 + vite 8.1.0 / vite-node 2.1.9 version mismatch — same as retry 1"
    runtime_smoke_s1: "PASSED (3 cases against compiled dist/lib/port-guard.js: dev-skip resolves; prod-skip refuses with exact expected message; free-port-in-prod resolves)"
    runtime_smoke_retry1: "PASSED (2 cases from retry 1: free-port resolves; busy-port throws PortInUseError)"
  cross_platform: "Windows primary (fully implemented + runtime-validated by smoke); macOS/Linux designed and parsing tested via mocks; live-validation on Unix pending (documented as future work)"
  deviations_from_spec:
    - "process.env['NODE_ENV'] → process.env.NODE_ENV (Biome useLiteralKeys rule)"
    - "3-line concatenation → single template literal (Biome useTemplate + noUnusedTemplateLiteral rules)"
    - "Both deviations preserve the exact runtime behavior and message text; both are biome auto-fixable."
  next_step: "Step 5 — Security Review (re-review of S1 hardening)"
```
