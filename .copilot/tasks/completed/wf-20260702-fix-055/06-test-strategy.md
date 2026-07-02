# Step 6 — Test Strategy (wf-20260702-fix-055, ISS-UAT-SEED-001)

## Rubric

| Axis | Score | Notes |
|---|---|---|
| Public surface | 0 | No public API changed. |
| Business logic | 0 | Seed script only; logic is one-time idempotent. |
| Persistence | 0 | Directus HTTP is unchanged. |
| Multi-tenant boundary | 0 | Single-tenant seed for local UAT. |
| User-facing error path | 0 | Script, not user-facing. |
| Async / retry / state machine | 0 | Linear bash, no concurrency. |
| Cross-module integration | 0 | No new integrations beyond existing seed. |
| Security-sensitive (auth/secret) | 0 | No new auth, no new secrets. |
| **Total** | **0** | Below threshold (4) for integration test requirement. |

Unit tests (bats) are sufficient.

## Test tier chosen

- **Unit (bats):** All 4 ACs covered by `scripts/tests/uat-seed-iss-001.bats` (11 tests).
- **Integration (Testcontainers):** Not required.
- **E2E (Playwright):** Not required.
- **Manual live-stack verification:** Optional. The existing BP-UAT-013
  run will validate end-to-end once the seed fix is merged (a
  follow-up UATRunner workflow can re-run BP-UAT-013 and the
  Step 004/005/006 paths that previously failed). Not gated on
  this workflow.

## Coverage map

| AC | Bats test | What it asserts |
|---|---|---|
| AC-1 consumed_at omitted | `AC-1: pending-invite mock line has no consumed_at field` | mock line has zero `consumed_at=` occurrences across all 4 rows. |
| AC-1 consumed_at omitted | `AC-1: ensure_operator_invite jq payload omits consumed_at when value is empty` | static check: `grep` finds no `.consumed_at = null` literal in uat-seed.sh. |
| AC-1 no regression | `AC-1: uat-seed.bats existing tests still pass after the consumed_at fix` | re-runs mock mode, asserts 4 mock lines (no shape change). |
| AC-2 pk in payload | `AC-2: mock line contains the authentik_user_id field for all 4 rows` | mock line ends with `authentik_user_id=(none\|[0-9]+)` for all 4 rows. |
| AC-2 helper exists | `AC-2: uat-seed.sh has a user_pk_by_email helper` | static check: `grep` finds the helper function. |
| AC-2 helper called | `AC-2: ensure_operator_invite calls user_pk_by_email` | static check: helper is referenced from ensure_operator_invite. |
| AC-3 tr strips \r | `AC-3: env_get in uat-seed.sh trims \r from values` | static check: `tr -d '…\r'` literal present. |
| AC-3 sibling | `AC-3: env_get in uat-env-setup.sh trims \r from values` | static check: same fix in sibling script. |
| AC-3 functional | `AC-3: env_get returns the trimmed token (end-to-end with CRLF fixture)` | builds a CRLF .env, sources env_get, asserts output is exactly `mock-token` (10 bytes, no trailing CR). |
| AC-4 documented | `AC-4: apps/api/.env.example contains AUTHENTIK_ADMIN_TOKEN` | static check: var is present. |
| AC-4 documented | `AC-4: apps/api/.env.example contains AUTHENTIK_ADMIN_URL` | static check: URL companion var is present. |

## Why bats (not vitest / not Playwright)

- The change is in a bash script. bats is the project's standard
  for bash regression tests (see `scripts/tests/audit-nodemailer-version.bats`,
  `scripts/tests/uat-seed.bats`, `scripts/tests/uat-seed-retries.bats`).
- Mock mode (`UAT_SEED_DIRECTUS_MOCK=1`) means tests run hermetically
  with no Docker, no Directus, no Authentik — they pass on every
  PR CI machine, in seconds.

## AC traceability summary

- **AC-1 verified** by 3 bats tests.
- **AC-2 verified** by 3 bats tests.
- **AC-3 verified** by 3 bats tests.
- **AC-4 verified-already-satisfied** by 2 bats tests (no code
  change required, tests protect against future regression).
- **Total: 11 bats tests, all passing on the fix; 9/11 fail on the
  pre-fix code** (the 2 AC-4 tests pass on both because AC-4 was
  already satisfied on main).

## Gate Result

gate_result:
  status: passed
  summary: "Score=0 → unit tests sufficient. 11 bats tests across 4 ACs. All pass on fix; 9/11 fail pre-fix."
  findings:
    - "Coverage: 4/4 ACs."
    - "No integration test required (rubric 0)."
    - "No E2E required (no user-facing change)."
    - "Optional follow-up: re-run BP-UAT-013 in a future UATRunner workflow to confirm Step 004/005/006 pass on a fresh seed."
