# Step 6 — Test Strategy

**Workflow:** wf-20260705-fix-105 (issue-resolution)
**Issue:** ISS-UAT-013-15
**Date:** 2026-07-05
**Author:** TestStrategist

---

## Strategy summary

Add 4 new bats regression tests to `scripts/tests/uat-seed.bats`. No new
unit / integration / E2E layers needed. The fix is a single-script
binary-selector change with no new code paths to exercise against
Postgres / Redis / Directus / Playwright.

| Layer | Decision |
|---|---|
| **Unit (bats, `scripts/tests/uat-seed.bats`)** | **Yes — required by AC-2.** 4 new tests below. |
| Integration (Testcontainers) | **No** — no new code paths. |
| E2E (Playwright) | **No** — no web-side change. |
| Visual | **No** — no UI change. |
| Live BP-UAT-013 re-run | **Yes — owned by follow-up `wf-20260705-fix-103-uat-013-verify` (queue position 3).** AC-1 + AC-4 of ISS-UAT-013-15 are satisfied by that workflow's `pnpm uat:seed` exiting 0. |

---

## Test inventory

| Test ID | Layer | What it asserts | Pre-fix behavior | Post-fix behavior |
|---|---|---|---|---|
| **AC-2 structural** | unit (bats) | `uat-seed.sh` contains `command -v curl.exe`, `CURL_BIN='curl.exe'`, and `CURL_BIN='curl'` lines, and the detection block lives before line 100. | FAIL — none of these strings exist in the source. | PASS. |
| **AC-2 substitution** | unit (bats) | Every runtime `curl` invocation in `uat-seed.sh` routes through `$CURL_BIN`. Specifically: zero `^\s*curl ` invocations remain, AND ≥10 `"$CURL_BIN"` call sites exist. | FAIL — 14 standalone `curl ` invocations exist. | PASS — all 14 routed through `$CURL_BIN`. |
| **AC-2 runtime sim** | unit (bats) | A stripped-down copy of the detection block, executed under two simulated PATH states, selects `curl.exe` when present and `curl` otherwise. | FAIL — block does not exist pre-fix. | PASS — both branches fire correctly. |
| **AC-2 check_deps extension** | unit (bats) | `check_deps()` includes `command -v "$CURL_BIN"` and an actionable error message. | FAIL — neither exists pre-fix. | PASS. |

---

## Pre-fix / post-fix rationale

Each test is a **regression test that would have failed before the fix
and passes after** — the explicit Step 6 constraint in
`issue-resolution.md`. The structural assertions pin the literal text
of the fix (survives the baseline-shift bug already documented in
`FR-WORKFLOW-003 row 6`); the runtime sim proves the control flow
actually works without standing up a fake `curl.exe` binary in
PATH-then-unset.

The four tests collectively cover:

1. **Detection block shape** — guards against a future refactor that
   regresses the form back to the `uname` heuristic.
2. **Routing completeness** — guards against a future code addition
   that introduces a literal `curl` invocation.
3. **Runtime correctness** — guards against a bash typo that makes
   the detection block always select `curl.exe` (or always `curl`).
4. **check_deps coverage** — guards against future removal of the
   actionable `Missing required curl binary` error message.

---

## Mock-mode note

The existing bats suite's `UAT_SEED_DIRECTUS_MOCK=1` mode short-circuits
all curl paths before `$CURL_BIN` is even resolved. Therefore the
existing 37 tests do not exercise `$CURL_BIN` at all — they verify
output structure that does not depend on which binary runs. The 4 new
tests close the gap by exercising `$CURL_BIN` resolution directly.

---

## Honest scope boundaries

- **AC-1** (live seed run from agent terminal) and **AC-4** (BP-UAT-013
  re-run unblocked) cannot be verified inside this workflow's window
  per AGENTS.md §6.1 — the integration test requires the live Docker
  stack + Authentik + Directus + api, AND a Windows host terminal with
  curl.exe on PATH. The agent sandbox can pre-flight but cannot run the
  full BP-UAT-013 flow in its current network-namespace configuration
  (the original symptom of the issue). Both ACs are owned by the queued
  follow-up `wf-20260705-fix-103-uat-013-verify` (queue position 3).
- **AC-3** (AGENTS.md §6.1 note) is moot per the impact analysis —
  Path A is now landing, no Path B workaround note is needed. AC-3 is
  flagged as **moot / superseded by AC-1 landing** in the QualityGate
  decision file.

---

## Gate Result

```
gate_result:
  status: passed
  notes: |
    Strategy approved. 4 new bats tests at scripts/tests/uat-seed.bats
    rows 38-41 (added in Step 7, captured in 06-test-design.md).
    Pre-fix / post-fix delineation clear. Mock-mode interaction
    documented. Honest scope boundary recorded — AC-1/AC-4 owned by
    queued wf-20260705-fix-103-uat-013-verify; AC-3 moot.
```