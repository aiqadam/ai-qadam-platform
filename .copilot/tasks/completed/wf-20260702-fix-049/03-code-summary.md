# Step 4 — Code Summary

**Workflow:** wf-20260702-fix-049
**Issue:** ISS-UAT-013-10
**Date:** 2026-07-02

## Files changed

| File | Lines added | Lines removed |
|---|---|---|
| `scripts/uat-seed.sh` | +13 | −3 |
| `scripts/tests/uat-seed.bats` | +21 | −3 |

## `scripts/uat-seed.sh` — what changed

### 1. `ensure_operator_invite()` — accept optional `role_groups`

Added a 7th positional parameter `role_groups` (default `'[]'`):

```bash
ensure_operator_invite() {
  local email="$1" status="$2" expires_at="$3" consumed_at="$4" token_plain="$5" display_name="$6"
  local role_groups="${7:-[]}"   # ← NEW (ISS-UAT-013-10)
  …
}
```

### 2. Mock-mode output line — print `role_groups`

```bash
ok "operator_invite ${token_prefix} (mock, email=${email}, role_groups=${role_groups})"
```

This makes the regression test trivially greppable without changing the
real seed path.

### 3. jq body — emit `role_groups:$rg` instead of hardcoded `[]`

```bash
body=$(jq -nc \
  --arg e   "$email" \
  … \
  --argjson rg "$role_groups" \      # ← NEW (ISS-UAT-013-10)
  $jq_cat \
  'if $cat == "" then { …, role_groups:$rg} | .consumed_at = null else { …, role_groups:$rg} end')
```

`--argjson` is used (not `--arg`) because `$role_groups` is a JSON array
string that jq must parse, not a literal string.

### 4. Call sites — four-row distribution

| Token | Email | role_groups (this PR) | Why |
|---|---|---|---|
| `uat-onboard-token` | `uat-operator@aiqadam.test` | `["aiqadam-staff"]` | Step 005 spec asserts `aiqadam-staff` visible |
| `uat-onboard-used-token` | `uat-operator@aiqadam.test` | `[]` | Spec asserts GonePanel (no role label) |
| `uat-onboard-expired-token` | `uat-operator@aiqadam.test` | `[]` | Spec asserts GonePanel (no role label) |
| `uat-onboard-no-user-token` | `uat-operator+no-user@aiqadam.test` | `[]` | Spec asserts 409 (role_groups irrelevant) |

A block comment above the four call sites documents this rationale for
future maintainers.

## `scripts/tests/uat-seed.bats` — what changed

### 1. Updated AC-1 distribution test

The mock output line format changed from
`(mock, email=<email>)` to
`(mock, email=<email>, role_groups=<json>)`, so the existing
distribution test's regex was updated to match the new tail of the line
(`\(mock, email=...` instead of `\(mock, email=...\)`).

### 2. New AC-5 regression test

```bash
@test "AC-5: valid-invite row carries role_groups=['aiqadam-staff']; other three rows carry []" {
  …
  local valid empty
  valid=$(echo "$output" | grep -cE 'operator_invite .*\(mock, .*role_groups=\["aiqadam-staff"\]' || true)
  empty=$(echo "$output" | grep -cE 'operator_invite .*\(mock, .*role_groups=\[\]' || true)
  [ "$valid" -eq 1 ]
  [ "$empty" -eq 3 ]
}
```

This is the AC-5 regression for the **whole point** of the fix: it would
have failed before this PR (because the seed left `role_groups=[]` on
all four rows) and passes after.

## Idempotency note

The Directus idempotency guard (`filter[token_hash][_eq]=...` GET
before POST) is **unchanged**. Re-running `pnpm uat:seed` against an
already-seeded database will:

- Detect the existing four rows by their `token_hash`.
- Print `operator_invite uat-onbo (exists, id=...)` for each.
- Skip the POST.

This means **operators who already have a valid-invite row with empty
`role_groups` from a prior seed will not see it updated by re-running
the seed**. They must delete the old row first
(`DELETE /items/operator_invites?filter[token_prefix][_eq]=uat-onbo`)
or run the migration documented in the PR description. This caveat is
called out in the PR description under "Risks."

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Single-file seed-script change (15-line net) plus 21-line bats regression. All upstream dependencies satisfied. Idempotency preserved."
  findings:
    - "ensure_operator_invite gained an optional 7th positional parameter (default '[]')"
    - "Valid invite row now carries role_groups=['aiqadam-staff']; other three rows unchanged at []"
    - "New AC-5 regression test pins the per-row role_groups content"
    - "Mock-mode output line format updated; existing AC-1 distribution test regex updated accordingly"
    - "Idempotency: existing rows are NOT auto-updated — operator must delete-then-reseed"
```