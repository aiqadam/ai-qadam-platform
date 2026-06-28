# Step 2 — Impact Analysis

**Workflow:** wf-20260628-fix-031
**Issue being resolved:** [ISS-UAT-013-2](../issues/ISS-UAT-013-2.md)
**Analyzed by:** ImpactAnalyzer
**Analyzed at:** 2026-06-28T14:05:00Z

---

## Validated Requirement

**ISS-UAT-013-2:** Pre-flight verified api by port ownership, not by process CommandLine.

**Resolution summary (per the issue):** Update the pre-flight step in `.copilot/workflows/uat-verification.md` to require a two-step verification (port ownership → process identity), fail loudly on mismatch, and add a bats regression test.

**Implementation summary (this workflow):**

1. New helper: `scripts/uat-preflight-check.sh`
2. Doc edit: `.copilot/workflows/uat-verification.md` Step 2
3. New test: `scripts/tests/uat-preflight-check.bats`
4. Doc note: `docs/02-business-processes/uat/BP-UAT-000.md` (one paragraph)

---

## Affected Layers

### API (NestJS — `apps/api/src/modules/`)

**No changes.** This is a workflow-layer fix. No NestJS module, controller, service, schema, or DTO changes. The `/api/v1/health/email` endpoint proposed in [ISS-UAT-013-7](../issues/ISS-UAT-013-7.md) is **not** required by this fix (defense-in-depth, out of scope per the issue).

### DB Changes Required

**No.** This fix touches only:
- `scripts/` (new helper, new bats test)
- `.copilot/workflows/uat-verification.md` (doc edit)
- `docs/02-business-processes/uat/BP-UAT-000.md` (doc note)
- `.copilot/issues/ISS-UAT-013-2.md` (resolution note, written in Step 9)
- `.copilot/issues/registry.md` (resolved entry, written in Step 9)

No Drizzle schema, no migration, no Directus schema.

### Shared Types (`packages/shared-types/`)

**No changes.** No new TypeScript types, no new Zod schemas. The helper script is bash; the bats test is bash.

### Frontend (`apps/web/`, `apps/web-next/`)

**No changes.** This fix changes only the **pre-flight verification** (a step that runs *before* any UI is rendered). No Astro page, no React island, no design-system token is touched.

### Bot (`apps/bot/`)

**No changes.** No aiogram handler or keyboard.

### Workers (`apps/workers/`)

**No changes.** No BullMQ queue or processor.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| _(none)_ | | | |

**No API surface changes.** This fix is entirely below the API layer.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| Orchestrator (UAT verification Step 2) | `scripts/uat-preflight-check.sh` | bash invocation |

**No cross-module calls** in the runtime sense. The helper script is invoked once per UAT run, before the UATRunner is invoked.

---

## Workflow / Infrastructure Layer Changes

| File | Change | Lines (est.) |
|---|---|---|
| `scripts/uat-env-setup.sh` | None (read-only reference for style) | 0 |
| `scripts/uat-preflight-check.sh` | **NEW** — bash helper, Windows-first via PowerShell, TODO marker for macOS/Linux | ~120 |
| `scripts/tests/uat-preflight-check.bats` | **NEW** — bats regression test, 4–6 cases | ~80 |
| `.copilot/workflows/uat-verification.md` | Step 2 doc edit — replace bare `curl` with helper call | ~15 |
| `docs/02-business-processes/uat/BP-UAT-000.md` | One-paragraph "process identity" note appended | ~10 |

**Total new code/docs:** ~225 lines across 5 files. **Below the 400-line PR cap** from AGENTS.md §4.

---

## Risk Flags

### Security Review Required

**No.** This fix:
- Adds no network-facing surface.
- Adds no new credential handling.
- Adds no new authn/authz logic.
- Reads process `CommandLine` (which on Windows is visible to any user with `Get-CimInstance Win32_Process` — no privilege escalation).
- Touches no PII or sensitive data.

**Step 5 (SecurityReviewer) will still run per protocol** but is expected to return `passed` with no findings.

### Architecture Rule Risks

**None.** Checked against `docs/04-development/architecture/architecture.md`:

- No module boundary violation (workflow layer is unaffected by API/web/bot module boundaries).
- No new external dependency introduced (uses only `bash`, `powershell.exe` on Windows, `grep`, `awk`, `Get-CimInstance` — all already used in `scripts/check-workflow-state.sh`).
- No new color tokens, no new font, no design-system surface touched.

### Test Runner Risks

**Low.** Bats infrastructure is already established:

| Item | Status |
|---|---|
| `bats` (devDep) | `^1.10.0` already in `package.json:38` |
| `pnpm test:bash` script | Exists in `package.json:21` (`bash scripts/run-bats.sh scripts/tests/*.bats`) |
| `scripts/run-bats.sh` wrapper | Exists; cross-platform; handles system / local / BATS env paths |
| `scripts/tests/test_helper.bash` | Exists; used by all existing 4 bats files |
| Existing `.bats` files | 4 (workflow-finish-amend, step-0.5-doc-presence, quality-gate-context, check-workflow-state) |

The new test follows the same pattern (load `test_helper`, use `setup()` / `@test`).

### Mocking / Cross-Platform Risks

**Medium.** Bats tests run on whichever platform invokes `pnpm test:bash`. On Windows, `powershell.exe` is available; on macOS/Linux it isn't. The helper script's platform-detection logic (Windows vs Unix) must be tested on both, but the **bats test can only run on one platform at a time**.

**Mitigation:** The bats test mocks the platform probe (PowerShell output or `lsof` output) by injecting stub data via an env var override, e.g. `UAT_PREFLIGHT_PROBE_OUTPUT=...`. The helper reads that env var in test mode and skips the real probe. This is a common bats pattern.

### Cross-Platform Coverage

**Windows (primary):** Fully implemented. `Get-NetTCPConnection` + `Get-CimInstance Win32_Process` already used in `scripts/check-workflow-state.sh` (read-only reference) and in the original `02-preflight.md` that triggered this issue.

**macOS / Linux:** **Out of scope per the issue.** TODO marker in the helper script:
```bash
# TODO(aiqadam-team): implement lsof/ps probe for macOS/Linux.
# Per ISS-UAT-013-2: the team is Windows-first (AGENTS.md §0).
# Track this in a separate issue if cross-platform dev becomes a priority.
```

The helper script exits with a clear error on macOS/Linux today: `"process-identity probe not implemented for darwin/linux — see TODO marker in scripts/uat-preflight-check.sh"`.

---

## Test Scope

| Layer | Required? | Notes |
|---|---|---|
| **Unit** (bats, `scripts/tests/uat-preflight-check.bats`) | **Yes** | 4–6 cases; primary regression test |
| **Integration** (Testcontainers) | No | No DB involved |
| **E2E** (Playwright) | No | No UI involved |
| **Manual** | One-shot | After PR merge, run a real UAT verification with the helper in place. Expected: pre-flight detects a foreign dev server correctly. |

### Test cases for `scripts/tests/uat-preflight-check.bats`

| # | Case | Expected exit | Expected stderr |
|---|---|---|---|
| 1 | Port unbound (no PID listening) | non-zero | `no process listening on :<port>` |
| 2 | Foreign service on port (CommandLine does NOT contain expected substring) | non-zero | `process on :<port> (PID <pid>) is not the expected service. CommandLine: ...` |
| 3 | Expected service on port (CommandLine DOES contain expected substring) | 0 | (silent) |
| 4 | `--help` flag | 0 | (prints usage) |
| 5 | Missing args | non-zero | `usage: uat-preflight-check.sh <service-name> <port> <expected-substring>` |
| 6 | Mock probe failure (PowerShell returns non-zero) | non-zero | `process-identity probe failed` |

These mock the probe by injecting `UAT_PREFLIGHT_PROBE_OUTPUT` env var — the helper reads that and skips the real `Get-NetTCPConnection` call.

---

## Pre-existing Patterns to Reuse

| Pattern | Source | Reuse in `uat-preflight-check.sh` |
|---|---|---|
| Color helpers (`GREEN`/`YELLOW`/`RED`, `ok`/`warn`/`fail`) | `scripts/uat-env-setup.sh:24–28` | Yes |
| `set -euo pipefail` | `scripts/uat-env-setup.sh:21` | Yes |
| `fail()` exits 1 with red stderr | `scripts/uat-env-setup.sh:28` | Yes |
| bats `load 'test_helper'` pattern | `scripts/tests/check-workflow-state.bats:12` | Yes |
| PowerShell process introspection | `scripts/check-workflow-state.sh` and `02-preflight.md` (BP-UAT-013) | Yes — same `Get-CimInstance Win32_Process` invocation |

---

## Honesty Attestations (per AGENTS.md §9)

- The fix is **not** a defense-in-depth fix for ISS-UAT-013-7 (`RESEND_API_KEY` unset). The `/api/v1/health/email` endpoint proposed there is a separate fix; this workflow does not include it.
- The fix **does not** prevent the port-3000 collision (that's ISS-UAT-013-1). It only **detects** the collision. Both stay open after this PR.
- The fix is **Windows-first**; macOS/Linux are TODO markers. If the team starts developing on macOS, a follow-up issue must be opened.
- The fix does not affect the existing `pnpm test:bash` invocation — `scripts/tests/*.bats` glob will pick up the new file automatically.
- The bats test runs on whichever platform invokes `pnpm test:bash`. CI's runner platform determines coverage.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  summary: "ISS-UAT-013-2 is well-scoped: ~225 lines across 5 files (helper script, bats test, 2 doc edits, 1 issue resolution note). No API/web/bot/DB changes. No architectural conflicts. Bats infrastructure is already established (bats ^1.10.0 in devDeps, scripts/run-bats.sh wrapper, test_helper.bash, 4 existing .bats files). Cross-platform limitation (Windows-first; macOS/Linux TODO) is explicitly flagged."
  affected_files:
    new:
      - scripts/uat-preflight-check.sh
      - scripts/tests/uat-preflight-check.bats
    modified:
      - .copilot/workflows/uat-verification.md  # Step 2 doc edit
      - docs/02-business-processes/uat/BP-UAT-000.md  # one-paragraph note
      - .copilot/issues/ISS-UAT-013-2.md  # resolution note (Step 9)
      - .copilot/issues/registry.md  # resolved entry (Step 9)
  blast_radius: minimal — workflow-layer only
  db_changes: none
  migration: none
  new_dependencies: none
  cross_platform: Windows primary; macOS/Linux TODO marker only
  risks:
    - "Mocking the platform probe in bats requires an env-var override path (UAT_PREFLIGHT_PROBE_OUTPUT). Must be added to the helper script as a test hook."
    - "CI's platform determines bats coverage. macOS/Linux coverage is partial until the TODO is implemented."
  next_step: "Step 4 — Develop Fix (CodeDeveloper). Step 3 (DB migrations) skipped — no entity changes."
```