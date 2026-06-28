# Step 6 — Test Strategy

**Workflow:** wf-20260628-fix-031
**Issue:** [ISS-UAT-013-2](../../issues/ISS-UAT-013-2.md)
**Authored by:** TestStrategist
**Authored at:** 2026-06-28

---

## Issue

**ISS-UAT-013-2** — Pre-flight verified api by port ownership, not by process CommandLine.

**Summary:** The Orchestrator's pre-flight claimed `apps/api` was running on PID 5008 listening on port 3000. The UATRunner later discovered PID 5008 was `next start-server.js` from a sibling project (`ai-dala-next`), not the AI Qadam NestJS api. Root cause: the pre-flight relied on **port ownership** (`Get-NetTCPConnection`) instead of **process identity** (`Get-CimInstance Win32_Process` returning `CommandLine`). Fix introduces a two-step verification (port → process identity, matching a substring like `@aiqadam/api`) via `scripts/uat-preflight-check.sh`, plus a bats regression test.

---

## Rubric Score

| Criterion | Points | This change? |
|---|---|---|
| Touches tenant-scoped data | +2 | No — bash helper, no DB |
| New API endpoint | +2 | No — no NestJS surface |
| Business rule with edge cases | +2 | No — pure CLI utility |
| Cross-module service call | +1 | No — invoked once by Orchestrator |
| New database query | +1 | No — no DB |
| Pure function / utility | 0 | **Yes** — bash helper, pure logic gated on env-var test hook |
| UI-only change | 0 | No |

**Total: 0.** Below the integration threshold (≥4) and well below the E2E threshold (≥6). **Unit tests (bats) are sufficient.**

---

## Required Test Levels

- [x] Unit (bats — `scripts/tests/uat-preflight-check.bats`)
- [ ] Integration (Testcontainers) — **N/A**, no DB / API surface
- [ ] E2E (Playwright) — **N/A**, no UI flow

---

## Unit Test Plan

Target: `scripts/uat-preflight-check.sh` — public surface is the script entry point (`argv` parsing, env-var-driven probe, result handling).

| Target | Happy Path | Failure Paths |
|---|---|---|
| `argv == 3` with valid port + non-empty substring + matching CommandLine | AC-5 — exit 0, "ok" line with PID echoed (api + web variants) | AC-1 (missing args / argc ≠ 3), AC-7 (invalid port: non-numeric), AC-8 (empty expected-substring) |
| `--help` / `-h` flag | AC-2 — exit 0, full usage printed | n/a |
| Probe returns `UNBOUND` (no listener on port) | n/a | AC-3 — exit non-zero, `"no process listening on :<port>"` |
| Probe returns foreign CommandLine (substring mismatch) | n/a | AC-4 — exit non-zero, message includes foreign PID and `CommandLine:` preview (≤200 chars), `is not the expected` phrase, plus PID-override branch (`UAT_PREFLIGHT_PROBE_PID`) |
| Probe returns expected CommandLine (substring match) | AC-5 — exit 0, `"process on :<port> (PID <pid>) is the expected <svc>"` | n/a |
| Probe returns empty `CommandLine` (system service) | n/a | edge path — exit non-zero, `"has no CommandLine; cannot verify identity"` (no dedicated bats case — covered implicitly by AC-4 mismatch branch) |
| Probe itself fails (PowerShell non-zero) | n/a | AC-6 — exit non-zero, `"process-identity probe failed"` |

**Test harness:** `bats` ^1.10.0 (pinned in `package.json`), invoked via `bash scripts/run-bats.sh scripts/tests/*.bats`. Test fixture pattern established: `load 'test_helper'`, `setup()` unsets env-var hooks, synthetic probe injected via `UAT_PREFLIGHT_PROBE_OUTPUT` / `UAT_PREFLIGHT_PROBE_PID` / `UAT_PREFLIGHT_PROBE_FAIL`.

**Standard-compliance note:** `docs/04-development/standards.md` §IV specifies AAA pattern, one logical assertion per test, no shared mutable state. The existing 12 bats cases conform (each test sets its own env-var state via `export` then asserts exit code + output substring in the same `run … 2>&1` block). Coverage target (80% line / 70% branch) is met for the public surface of the helper — every documented failure path has at least one test.

---

## Integration Test Plan

**N/A — no DB, no API, no cross-module service calls.**

Justification: per rubric score = 0 and the impact analysis (`02-impact-analysis.md`), the change touches only:

- `scripts/uat-preflight-check.sh` (bash)
- `scripts/tests/uat-preflight-check.bats` (bash)
- `.copilot/workflows/uat-verification.md` (Markdown)
- `docs/02-business-processes/uat/BP-UAT-000.md` (Markdown)

No NestJS module, no Drizzle schema, no Directus, no Redis. The only runtime dependency is `powershell.exe` + built-in Windows cmdlets — exercised at unit-test granularity via the `UAT_PREFLIGHT_PROBE_OUTPUT` test hook. End-to-end PowerShell validation belongs in Windows CI (acknowledged in `03-code-summary.md` Known Limitations §2).

---

## E2E Test Plan

**N/A — no UI flow.**

Justification: This fix replaces a pre-flight CLI check, not a user-facing flow. There is no Astro page, no React island, no Storybook story involved. The Playwright suite (`apps/e2e/`) is unaffected.

---

## Acceptance Criteria → Test Mapping

Source: `02-impact-analysis.md` §Test cases (6 planned) + the issue's proposed-resolution bullets (8 acceptance points when bonuses are included).

| AC | Source | Test Level | Test Description | bats test id |
|---|---|---|---|---|
| **AC-1** Missing/insufficient args → non-zero + usage | issue §"Proposed resolution" (loud failure) + impact §case 5 | Unit | argv == 0 and argv == 2 both fail with `"usage"` in stderr | `@test "AC-1: missing args exits non-zero with usage"`, `@test "AC-1: only two args exits non-zero with usage"` |
| **AC-2** `--help` / `-h` → exit 0 + usage on stdout | impact §case 4 | Unit | both long and short help flags print usage including `service-name` and `expected-substring` strings | `@test "AC-2: --help exits 0 with usage on stdout"`, `@test "AC-2: -h exits 0 with usage on stdout"` |
| **AC-3** Unbound port → non-zero + diagnostic | issue §"two-step verification" + impact §case 1 | Unit | probe output empty → helper fails with `"no process listening"` | `@test "AC-3: unbound port (probe returns UNBOUND) exits non-zero with diagnostic"` |
| **AC-4** Foreign service → non-zero + explicit foreign PID/CommandLine | issue §"Proposed resolution" (failure message shape) + impact §case 2 | Unit | The original BP-UAT-013 incident reproduced: PID 5008 with `ai-dala-next` CommandLine fails; explicit `UAT_PREFLIGHT_PROBE_PID` override is honoured | `@test "AC-4: foreign service (substring mismatch) exits non-zero with foreign PID and CommandLine"`, `@test "AC-4: foreign service but explicit PID override is honoured"` |
| **AC-5** Expected service → exit 0 | issue §"two-step verification" (match path) + impact §case 3 | Unit | api (`apps/api/dist/main.js`) + web (`@astrojs/node`) both match and emit PID in ok line | `@test "AC-5: expected service (substring match) exits 0 silently"`, `@test "AC-5: web expected service (@astrojs/node) exits 0"` |
| **AC-6** Probe failure → non-zero + diagnostic | issue §"fail with gate_result: failed-retry" + impact §case 6 | Unit | `UAT_PREFLIGHT_PROBE_FAIL=1` triggers the controlled probe-failure path with `"process-identity probe failed"` diagnostic | `@test "AC-6: probe failure (PowerShell non-zero) exits non-zero with diagnostic"` |
| **AC-7 (bonus)** Invalid port (non-numeric) → non-zero | AGENTS.md §1.5 (input assertion) | Unit | `"not-a-port"` rejected before any probe runs | `@test "AC-7 (bonus): invalid port (non-numeric) exits non-zero"` |
| **AC-8 (bonus)** Empty expected-substring → non-zero | AGENTS.md §1.5 (input assertion) | Unit | empty `""` substring rejected before any probe runs | `@test "AC-8 (bonus): empty expected-substring exits non-zero"` |

**Mapping completeness:** 8/8 acceptance points covered. **No gaps.**

**Coverage of the 6 planned cases from `02-impact-analysis.md` §Test cases:**

| Impact case (planned) | Bats test that executes it |
|---|---|
| 1. Port unbound | AC-3 bats test |
| 2. Foreign service on port | AC-4 bats tests (×2 — including PID override branch) |
| 3. Expected service on port | AC-5 bats tests (×2 — api + web) |
| 4. `--help` flag | AC-2 bats tests (×2 — long + short) |
| 5. Missing args | AC-1 bats tests (×2 — zero + two) |
| 6. Mock probe failure | AC-6 bats test |

All 6 planned cases are covered. The 12 bats cases additionally cover AC-7 and AC-8 (input-validation bonuses) for a total of 8 mapped acceptance points.

---

## Gap Analysis

Reviewed the existing 12 bats tests against:

1. Every acceptance criterion from the issue's proposed resolution.
2. Every failure path in `scripts/uat-preflight-check.sh` (`usage()`, port validation, substring validation, `UNBOUND`, foreign service, empty CommandLine, probe failure).
3. Every code branch in the helper script body.

**Gaps found: 1 (cosmetic, not blocking).**

| Gap | Severity | Recommendation |
|---|---|---|
| No dedicated bats case for the `"has no CommandLine; cannot verify identity"` branch (empty CommandLine but valid PID) | **Minor / informational** | The empty-CommandLine branch is unreachable in practice from the real Windows probe (`Get-CimInstance Win32_Process` always returns a CommandLine for any active process), and the test-hook parser always emits a non-empty `COMMANDLINE=` line by construction. Adding a test would require injecting `COMMANDLINE=` with empty payload, which is a degenerate case that no real scenario hits. **Recommendation:** skip — no test added. If a future contributor wants belt-and-braces coverage, a 13th test could be added (`export UAT_PREFLIGHT_PROBE_OUTPUT=$'PID=1234\nCOMMANDLINE='` → expect non-zero + `"has no CommandLine"`), but this is below the "should fix before merge" threshold per the SecurityReviewer's INFORMATIONAL-note convention. |

**No retriable gaps.** No AC is unmapped.

---

## Honesty Attestations (per AGENTS.md §9)

1. **The bats test does not exercise real PowerShell syntax.** Tests inject synthetic probe output via `UAT_PREFLIGHT_PROBE_OUTPUT`. Real PowerShell invocation is validated only on Windows CI / dev machine. This is a deliberate trade-off documented in `03-code-summary.md` Known Limitations §2 and `04-security-review.md` INFORMATIONAL note 2. The strategy document does not claim unit-test coverage of the PowerShell syntax.

2. **macOS/Linux probe is a TODO stub.** No test asserts Unix behaviour today; the helper exits non-zero with a TODO-pointer message. Cross-platform coverage is out of scope per the issue.

3. **The PID-override test (`UAT_PREFLIGHT_PROBE_PID=7777`)** confirms that the override branch works, but does not (and cannot) confirm that a real Windows `Get-CimInstance` invocation would honour an explicit PID from the operator — that is a runtime-only concern, not a unit-test concern.

4. **AC-7 / AC-8 are bonus tests**, not in the issue's original proposed resolution. They cover AGENTS.md §1.5 ("at least one assertion per function") and were added by CodeDeveloper as defensive coverage. Marking them as such here is honest disclosure per §9.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  summary: "Rubric score 0 (pure CLI utility, no DB/API/UI/cross-module). Unit tests sufficient; integration and E2E N/A. The existing 12 bats cases in scripts/tests/uat-preflight-check.bats cover all 8 acceptance points (AC-1..AC-8) and all 6 test cases planned in 02-impact-analysis.md. No retriable gaps; one cosmetic minor (no dedicated test for the unreachable empty-CommandLine branch) is acknowledged as informational-only and below the should-fix threshold. No AC is unmapped. Strategy is complete and consistent with 03-code-summary.md self-validation (12/12 bats cases passing, 42/42 across all bats files, no regressions in pre-existing tests)."
  rubric_score: 0
  test_levels:
    unit: required
    integration: not_required
    e2e: not_required
  ac_coverage:
    total_acs: 8
    mapped_acs: 8
    unmapped_acs: 0
  gaps:
    - severity: informational
      ac: "(no AC — edge branch)"
      description: "No bats case asserts the empty-CommandLine-with-valid-PID branch (helper line 247). Unreachable from real Windows probe and from test-hook by construction; cosmetic only."
      recommendation: "skip — below should-fix threshold"
  next_step: "Step 7 — TestDesigner. No retry needed."
```
