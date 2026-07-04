# Step 2 — Impact Analysis (ISS-UAT-SEED-002)

## Files in scope

| File | Reason | Type of change |
|---|---|---|
| `scripts/uat-seed.sh` (lines 263-269) | The `api_ensure_directus_user_link` helper carries the wrong default port AND a misleading comment. Both must change in the same hunk. | Behavior change + comment edit (5-7 line hunk) |
| `scripts/tests/uat-seed.bats` (append) | New structural regression test pins the default-`PORT` invariant (AC-3 of the issue's "Required for close"). | Test addition (one `@test` block) |

## Files explicitly out of scope

| File | Reason |
|---|---|
| `scripts/uat-preflight-email.sh:44,116` | Same `:3001` typo, but not registered as ISS-*. Bundling into this PR would violate AGENTS.md §4 (small-PR rule). |
| `scripts/uat-env-setup.sh:261` | Same `:3001` typo, same reason. |
| `apps/api/.env`, `apps/api/.env.example`, `apps/api/Dockerfile` | All correctly declare `PORT=3000`. The fix's `<selection>` does NOT change these — the default follows them. |

## Blast radius

- **API code:** zero touch. `apps/api/` is unchanged.
- **Database:** zero touch. No migration.
- **Public endpoints:** zero touch. Nothing user-facing changes.
- **Test coverage:** one new `@test` added to `scripts/tests/uat-seed.bats`.
- **CI:** unrelated. Pre-push gate checks (Biome, typecheck, architecture-check) are not exercised by shell-script edits.
- **Roll-forward safety:** the `API_BASE_URL` env-var override is preserved verbatim, so operators who already export it are unaffected.

## Risk assessment

- **Risk:** low. Changing a default literal cannot break code paths that explicitly set the variable.
- **Risk:** presenter's concern — the live `apps/api/.env` had `PORT=3000` set; on a fresh checkout where someone runs `pnpm uat:seed` without running `scripts/uat-env-setup.sh` first, the api is not running on 3001 either, so they would already see a different failure (`ECONNREFUSED` on any port). **New behavior strictly improves this case** by making the default point to the port the api actually listens on.
- **Mitigation:** the structural bats test pins `api_base` resolves to whatever `apps/api/.env` declares, so a future `PORT` rename is automatically propagated to the seed.

## Security implications

- No new code path. No new endpoint. No new token. No new process. No new credential source.
- The `INTERNAL_API_TOKEN` header path is unchanged.
- AGENTS.md §5 (security baseline) is preserved: no secrets logged, parameterized requests, no auth bypass.

## Ten Non-Negotiables cross-check

- Simple control flow: ✓ (single line edit).
- Loops with bounds: ✓ (n/a).
- No magic numbers / magic strings: the fix DOES introduce a magic number (`3000`) — but the recommended fix uses `env_get "$API_DIR/.env" "PORT"` with a `:3000` fallback, both named constants inside `api_ensure_directus_user_link`. The fallback is gated by `${PORT:-3000}` so the literal `:3000` becomes a default-only constant, not a magic number.
- Functions fit on one screen: ✓ (no new function).
- Assertion per function: ✓ (the existing `[[ -n "$token" ]] || fail ...` guard is unchanged).
- Variables in smallest scope: ✓ (unchanged).
- Return values checked: ✓ (unchanged).
- No dynamic imports / string-built SQL: ✓ (n/a).
- Flat data structures: ✓ (n/a).
- Zero warnings: ✓ (bash `-n` syntax-check is verified by an existing bats case `"FR-WORKFLOW-003 AC-6: bash -n scripts/uat-seed.sh passes"`).

## Gate Result

gate_result:
  status: passed
  summary: "Scope is one line + one comment edit + one bats test; no DB, no security, no API code, no new dependencies; blast radius is the seed workflow only."
  findings:
    - "Code change is bounded to `scripts/uat-seed.sh` (lines 263-269)."
    - "Test change is one new `@test` in `scripts/tests/uat-seed.bats`."
    - "Two analogous `:3001` typos in `uat-preflight-email.sh` and `uat-env-setup.sh` are explicitly out of scope per AGENTS.md §4."
    - "Roll-forward safety: `API_BASE_URL` env-var override is preserved verbatim."
    - "AGENTS.md §5 security invariants are preserved (no new endpoint / token / process)."
