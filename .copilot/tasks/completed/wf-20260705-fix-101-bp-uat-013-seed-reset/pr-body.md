## What

Mirrors the `ensure_operator_invite` token-derivation logic into `reset_domain_fixture` so `pnpm uat:seed --reset BP-UAT-013` honours Directus's NOT-NULL constraint on `operator_invites.token_hash` + `operator_invites.token_prefix`. Previously the `--reset` path POSTed the manifest's payload verbatim and Directus returned HTTP 400 FAILED_VALIDATION, leaving `operator_invites` empty.

## Why

BP-UAT-013 (Steps 005/006 + Neg 002/003/005) cannot run without the four seeded `operator_invites` rows. `wf-20260705-uat-100`'s Step 2 pre-flight failed on the `--reset` POST with HTTP 400 from Directus. Two schemas collided:

- unconditional `ensure_operator_invite` (scripts/uat-seed.sh lines 500-501, 558-595) derives + ships `token_hash`+`token_prefix` at the call site
- `reset_domain_fixture` (scripts/uat-seed.sh lines 725-806) posts the manifest's payload verbatim

The unconditional path continues to work; only `--reset` is affected.

## How

1. Inside `reset_domain_fixture`, between the existing `member_email` block and the DELETE block, added a new conditional (gated on `[[ "$collection" == "operator_invites" ]]`) that:
   - reads `.token_plain` from the manifest via `jq -r '.token_plain // empty'`
   - derives `token_hash` via `sha256_hex "$token_plain"`
   - derives `token_prefix` as `${token_plain:0:8}`
   - merges into `resolved_payload` via `jq -c --arg th ... --arg tp ... '. + {token_hash:$th, token_prefix:$tp}'`
   - calls `fail()` with an actionable message if the manifest for `collection=operator_invites` has no `.token_plain`

2. Mirror is byte-for-byte identical to `ensure_operator_invite` to keep the two code paths in sync.

3. 3 bats regression tests added to `scripts/tests/uat-seed.bats`:
   - structural: `reset_domain_fixture` body contains the derivation (anchored via sed to exclude the unconditional path)
   - behavioural: `--reset BP-UAT-013` mock-mode exits 0 with exactly 4 create lines
   - behavioural: unconditional `pnpm uat:seed` mock-mode provisions all 4 operator_invites (AC-5 regression guard)

## Risks

Small bash fix (28 lines added in `scripts/uat-seed.sh` + 75 lines in `scripts/tests/uat-seed.bats`). Blast radius:

- **Silent in mock mode** by design — the new block lives only in the live-mode path (the mock branch returns early at line ~748, above the insertion point). This preserves FR-WORKFLOW-003 row 1's "exactly 4 create lines" invariant + row 6's byte-baseline regression.
- **No new dependencies**: `sha256_hex`, `jq`, `${token_plain:0:8}` are all pre-existing.
- **No new auth surface**: bash-only, no API endpoint, no schema change. The schema constraint was already enforced at the Directus layer.
- **Live AC-1/AC-2/AC-3 deferred to `wf-20260705-fix-103-uat-013-verify`** per AGENTS.md §6.1 honesty disclosure (queue position 3 of the BP-UAT-013 cascade). The companion issue ISS-UAT-013-15 (bash curl MSYS sandbox) blocks live `pnpm uat:seed` from this agent sandbox; the queued fix `wf-20260705-fix-102-uat-seed-curl-exe-aware` (position 2) addresses that.

## Testing

`pnpm test:bash` (i.e. `scripts/run-bats.sh scripts/tests/uat-seed.bats`) — **37/37 tests pass**, including:

- 3 new ISS-UAT-013-14 tests at rows 35, 36, 37
- All 34 prior tests still pass (no FR-WORKFLOW-003 regression on rows 1, 2, 3, 3b, 4, 5, 6, 7, 8, 9, 10, 11 + FEAT-UAT-COV-003 row 12 + AC-1..AC-5 + ISS-UAT-001-1 + ISS-UAT-SEED-002)
- Bash syntax check (row 23) passes: `bash -n scripts/uat-seed.sh` returns 0

Log: `.copilot/tasks/active/wf-20260705-fix-101-bp-uat-013-seed-reset/bats-full.log`

## Discovered by

`wf-20260705-uat-100` Step 2 pre-flight `failed-escalate` (PR [#118 squash `bc04135`](https://github.com/tvolodi/aiqadam/pull/118))

## Related

- Sibling issue: [ISS-UAT-013-15](../copilot/issues/ISS-UAT-013-15.md) (bash curl MSYS sandbox) owned by `wf-20260705-fix-102-uat-seed-curl-exe-aware` (position 2)
- Cascade: `wf-20260705-fix-103-uat-013-verify` (position 3) is the actual Playwright BP-UAT-013 re-run, queued behind both fixes
- Last successful `--reset BP-UAT-013` run: `wf-20260704-fix-092` (PR #108 squash `69f2b3f`) — directus schema added the NOT-NULL constraint post-2026-07-03, after this PR
- Reference implementation: `scripts/uat-seed.sh::ensure_operator_invite` lines 500-501, 558-595 — mirrored byte-for-byte

## Checklist

- [x] Tests added / updated (`scripts/tests/uat-seed.bats` rows 35-37)
- [x] No new dependencies
- [x] Manually tested locally (bats 37/37 pass)
- [x] Doc landed in source comment block in `scripts/uat-seed.sh::reset_domain_fixture`
