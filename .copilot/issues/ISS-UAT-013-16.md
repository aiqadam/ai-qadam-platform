# ISS-UAT-013-16 — `--reset BP-UAT-013` manifest uses shared `token_prefix=uat-onbo` lookup, wiping each preceding CREATE

**Severity:** blocker (UAT environment)
**Module:** uat/seed
**Status:** open
**Date:** 2026-07-05
**Discovered by:** wf-20260705-uat-110 (BP-UAT-013 re-verification Step 3 — Playwright run)

## Summary

`scripts/uat-fixtures/BP-UAT-013.json` declares `lookup_field: "token_prefix"`
with `lookup_value: "uat-onbo"` for **all four** fixtures. All four plaintext
tokens (`uat-onboard-token`, `uat-onboard-used-token`, `uat-onboard-expired-token`,
`uat-onboard-no-user-token`) share the same 8-char prefix `uat-onbo`. The
`reset_domain_fixture()` DELETE-step in `scripts/uat-seed.sh` (lines ~830-848)
therefore matches ALL existing rows on each iteration, and the next fixture's
DELETE wipes the previous fixture's CREATE.

Net effect after a fresh `pnpm uat:seed --reset BP-UAT-013`:
- The seed script logs 4 "deleted" + 4 "created" lines and prints
  "BP-UAT-013 reset complete (4 fixture(s))" with exit code 0.
- BUT only the **last** fixture's row remains in Directus
  (`uat-onboard-no-user-token` — the only one whose `display_name` happens
  to match the surviving row).
- `apps/api/src/modules/admin-invites/admin-invites.service.ts::consumeInvite()`
  then returns 410 `invite_invalid` for `uat-onboard-token`,
  `uat-onboard-used-token`, and `uat-onboard-expired-token` because
  `lookupByToken()` cannot find rows with the matching `token_hash`.
- BP-UAT-013 Steps 005/006 + Neg 002/003/005 all fail.

The unconditional seed path (`ensure_operator_invite` at lines 500-595)
correctly uses `filter[token_hash][_eq]=${token_hash}` as its idempotency
guard — a per-row unique key. The `--reset` path uses a non-unique
`token_prefix` lookup.

## Reproduction

```bash
$ pnpm uat:seed --reset BP-UAT-013
…
✓ fixture uat-onboard-token        (deleted, id=d9ff63c2-…)
✓ fixture uat-onboard-token        (created)
✓ fixture uat-onboard-used-token   (deleted, id=…)    ← matches all rows
✓ fixture uat-onboard-used-token   (created)         ← creates row 2
✓ fixture uat-onboard-expired-token(deleted, id=…)   ← matches all rows (incl. row 2)
✓ fixture uat-onboard-expired-token(created)         ← creates row 3
✓ fixture uat-onboard-no-user-token(deleted, id=…)   ← matches all rows (incl. 3)
✓ fixture uat-onboard-no-user-token(created)         ← creates row 4
✓ BP-UAT-013 reset complete (4 fixture(s))

$ curl -s "http://localhost:8200/items/operator_invites?fields=id,display_name&limit=-1" \
    -H "Authorization: Bearer uat-directus-static-admin-token-32c"
{"data":[{"id":"…","display_name":"UAT Operator (no-user)"}]}
```

Only 1 row. The other three (`UAT Operator (valid/used/expired)`) were
created and immediately deleted by the next iteration's DELETE.

## Evidence

- Pre-flight probe at `.copilot/tasks/active/wf-20260705-uat-110-bp-uat-013-verify/02-preflight.md`
  Step 3 reported "seed --reset BP-UAT-013 created 4 operator_invites fixtures".
  This was based on the script's stdout ("4 fixture(s)") — the green checkmark
  was misleading.
- Step 3 Playwright run output shows 7 of 12 BP-UAT-013 tests failed.
  Failures traced to 410 `invite_invalid` on every valid + used + expired token.
- Manual verification: `curl http://localhost:3000/v1/onboard/preview?token=uat-onboard-token`
  → `{"message":"invite_invalid","error":"Gone","statusCode":410}`.
- Manual Directus GET above shows only 1 row remaining.
- `apps/api/src/modules/admin-invites/admin-invites.service.ts` line 440:
  `if (!row) throw new GoneException('invite_invalid')` confirms the lookup
  is failing to find rows.

## Root cause

`scripts/uat-fixtures/BP-UAT-013.json` uses a non-unique
`lookup_field: token_prefix` for all 4 fixtures. `reset_domain_fixture()`
deletes everything matching that prefix on each iteration, then the same
script creates only the current fixture's row — so every preceding CREATE
is destroyed.

## Proposed fix

Two options:

**Option A — Manifest fix (recommended, narrowest scope):**
Change `scripts/uat-fixtures/BP-UAT-013.json` so each fixture's
`lookup_field` is `token_hash` (which is unique per plaintext) and
`lookup_value` is the per-fixture sha256 of its `token_plain`. The
seed's `reset_domain_fixture` already supports arbitrary lookup fields
(lines 833-836) — no script change needed.

**Option B — Script fix (broader):**
Teach `reset_domain_fixture` to derive `lookup_field: token_hash` and
`lookup_value: <sha256(token_plain)>` automatically when
`collection=operator_invites`, mirroring the unconditional path's
line 558-561 `filter[token_hash][_eq]=${token_hash}` pattern.

Option A is preferred because it doesn't bake `operator_invites`
special-casing deeper into the script; the manifest is the right
place to declare per-row lookup semantics. Option A is also additive —
it doesn't risk regressing the unconditional seed path.

A new regression bats row at `scripts/tests/uat-seed.bats` should
assert: "after `--reset BP-UAT-013`, querying `operator_invites` by
`filter[token_hash][_eq]=<each of the 4 sha256s>` returns exactly one
row each." This catches the same class of bug (non-unique lookup
wiping preceding CREATEs) for any future fixture added to the manifest.

## Acceptance criteria

- [ ] AC-1: After `pnpm uat:seed --reset BP-UAT-013`, `operator_invites`
  contains **exactly 4 rows** matching the 4 fixture display names
  (valid / used / expired / no-user).
- [ ] AC-2: `POST /v1/onboard/preview?token=uat-onboard-token` returns 200
  with payload matching the seeded row's email (`uat-operator@aiqadam.test`).
- [ ] AC-3: Same AC-2 for `uat-onboard-used-token` (410), `uat-onboard-expired-token`
  (410), `uat-onboard-no-user-token` (200 with `email: uat-operator+no-user@aiqadam.test`).
- [ ] AC-4: `pnpm uat:seed` (unconditional) still works byte-identically
  (no regression to FR-WORKFLOW-003 row 1 / row 6 invariants).
- [ ] AC-5: Bats regression — append a row to `scripts/tests/uat-seed.bats`
  asserting AC-1's "exactly 4 rows" + "each row's token_hash round-trips
  through sha256(token_plain)" invariants.

## Owner

Queued as `wf-20260705-fix-113-bp-uat-013-fixture-lookup-unique`
(issue-resolution workflow). Will be picked up immediately after
`wf-20260705-uat-110` closes.

## Related

- ISS-UAT-013-14 (resolved by wf-20260705-fix-101 / PR #119) — the
  upstream `token_hash`/`token_prefix` derivation gap. This issue is
  the *next* gap in the same `--reset` code path that ISS-UAT-013-14
  did not address. The honesty disclosure in ISS-UAT-013-14's Resolution
  section already anticipated this: "AC-1/AC-2/AC-3 deferred to
  wf-20260705-fix-103-uat-013-verify". Now that
  wf-20260705-uat-110 (the renamed version of that follow-up) has
  executed Step 3 and observed AC-1/AC-2/AC-3 failing on the live
  stack, the next gap is this `lookup_field` non-uniqueness bug.
- `scripts/uat-seed.sh::ensure_operator_invite` lines 558-561 —
  reference implementation that uses `token_hash` (per-row unique)
  for its idempotency guard.
- `scripts/uat-seed.sh::reset_domain_fixture` lines 830-848 — buggy
  code that uses the manifest's `lookup_field` / `lookup_value`
  without enforcing uniqueness across fixtures in the same manifest.
- Manifest: `scripts/uat-fixtures/BP-UAT-013.json` — all 4 fixtures
  carry `lookup_field: "token_prefix"` + `lookup_value: "uat-onbo"`.
- Live evidence:
  - `.copilot/tasks/active/wf-20260705-uat-110-bp-uat-013-verify/03-uat-report.md`
    (Step 3 UAT run output — 5/12 passed, 7 failed with this root cause)
  - `.copilot/tasks/active/wf-20260705-uat-110-bp-uat-013-verify/02-preflight.md`
    (Step 2 — misleading "4 fixture(s)" green checkmark)