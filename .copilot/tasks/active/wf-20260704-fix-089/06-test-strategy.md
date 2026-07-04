# Step 6 — Test Strategy (ISS-UAT-SEED-002)

## Strategy

This issue is a one-line late-bound default-port drift + a misleading comment. The regression test must:

1. **Pin the original bug** — `grep -F 'localhost:3001'` MUST find no occurrences in `scripts/uat-seed.sh` (AC-1 of the issue's "Required for close": "`grep -n 'localhost:3001' scripts/uat-seed.sh` returns no matches").
2. **Pin the new invariant** — the resolved `api_base` MUST equal whatever `apps/api/.env`'s `PORT` declares (idempotent across future renames; AC-3 of the issue).
3. **Preserve operator override** — an explicit `API_BASE_URL=...` MUST win over the derived default (negative-case regression for the `${VAR:-default}` shape).

The choice of technique is **structural grep + a sourced stub** (no live API stack required):

- Stub `apps/api/.env` into `BATS_TEST_TMPDIR` so each test can change `PORT` and re-source the helper. This avoids mutating the real `apps/api/.env` (which would break `pnpm dev`).
- Stub `INTERNAL_API_TOKEN` to a dummy value and assert only the request URL line, not the actual HTTP round-trip.

This fits the established `scripts/tests/uat-seed.bats` pattern: every existing case uses mock mode or structural grep, never a live API/DB stack. The new cases continue that pattern.

## Test inventory

| # | Test name | Type | What it pins |
|---|---|---|---|
| 1 | `ISS-UAT-SEED-002 AC-1: uat-seed.sh contains no localhost:3001 reference` | structural grep | Original bug |
| 2 | `ISS-UAT-SEED-002 AC-2: api_base default port is derived from apps/api/.env PORT` | stubbed source | New invariant |
| 3 | `ISS-UAT-SEED-002 AC-3: API_BASE_URL env override wins over the derived default` | stubbed source | Override preservation |
| 4 | `ISS-UAT-SEED-002 AC-4: api_base default falls back to :3000 when apps/api/.env is absent` | stubbed source | Fresh-checkout UX |

## Negative-case regression

The pre-fix shape `${API_BASE_URL:-http://host.docker.internal:3001}` would have failed every one of these four tests. Post-fix, all four pass.

A separate negative regression (not strictly required but cheap) confirms that the literal `host.docker.internal` is also gone:

| # | Test name | Type | What it pins |
|---|---|---|---|
| 5 | `ISS-UAT-SEED-002 AC-5: uat-seed.sh contains no host.docker.internal reference` | structural grep | Misleading-prefix removal |

## Layer decisions

- bats (functional / integration shell) — same layer as `uat-seed.bats` and every prior seed regression.
- No unit layer for `.sh` (the project has none for bash scripts).
- No Playwright layer (no UI surface touched).
- No Testcontainers layer (no DB touched).

## Gate Result

gate_result:
  status: passed
  summary: "Five structural / stubbed-source bats cases pin every AC; existing 29 cases in uat-seed.bats continue to apply unchanged."
  findings:
    - "AC-1 (no `localhost:3001`) is a single `grep -F 'localhost:3001'` structural regression."
    - "AC-2 (derived port) and AC-3 (override wins) require a stubbed `apps/api/.env`; stubbed via `BATS_TEST_TMPDIR` mirroring the existing FR-WORKFLOW-003 isolated-copy pattern."
    - "AC-4 (fallback) is a degenerate case of AC-2 with the stubbed file absent."
    - "AC-5 (`host.docker.internal` removed) is a single `grep` structural regression."
    - "All five are added to `scripts/tests/uat-seed.bats` — the established runtime mock + structural-grep suite."
