# ISS-UAT-013-14 — `--reset BP-UAT-013` POSTs manifest without `token_hash`/`token_prefix`

**Severity:** blocker (UAT environment)
**Module:** uat/seed
**Status:** open
**Date:** 2026-07-05
**Discovered by:** wf-20260705-uat-100 (BP-UAT-013 re-verification pre-flight)

## Summary

`scripts/uat-seed.sh`'s `--reset <BP-UAT-NNN>` code path (`reset_domain_fixture` at lines 725-806) POSTs the manifest's payload **verbatim** to Directus. The manifest at `scripts/uat-fixtures/BP-UAT-013.json` declares only the business fields (`email`, `display_name`, `status`, `expires_at_offset`, `consumed_at`, `role_groups`, `country`) — it does **not** declare `token_hash` or `token_prefix`. Directus's `operator_invites` collection now requires both (the constraint was added by the schema bootstrap and the email-routing fields it was protecting were dropped in F-S2.12, but the NOT-NULL constraint stayed). Re-creation fails with:

```
Validation failed for field "token_hash".  Value is required.
Validation failed for field "token_prefix". Value is required.
```

The unconditional seed path (`ensure_operator_invite` at lines 500-595) **does** compute `token_hash`/`token_prefix` at the call site — but `--reset` deliberately bypasses that path (FR-WORKFLOW-003 said `--reset` should DELETE+RECREATE from the manifest payload, not call `ensure_operator_invite`).

## Reproduction

```bash
$ pnpm uat:seed --reset BP-UAT-013
… reset deleting 4 fixture rows …
✗ FATAL: reset_domain_fixture uat-onboard-token: POST operator_invites failed:
  HTTP 400 — {"errors":[
    {"message":"Validation failed for field \"token_hash\". Value is required.",
     "extensions":{"field":"token_hash","path":[],"type":"required","code":"FAILED_VALIDATION"}},
    {"message":"Validation failed for field \"token_prefix\". Value is required.",
     "extensions":{"field":"token_prefix","path":[],"type":"required","code":"FAILED_VALIDATION"}}
  ]}
```

The 4 rows are deleted by the reset prelude, leaving the `operator_invites` collection empty. The script exits non-zero, so the workflow's Step 2 seed gate (`failed-escalate` per `uat-verification.md`) trips.

## Evidence

- Failure log: `.copilot/tasks/active/wf-20260705-uat-100/seed.log` (last 30 lines show the four `✓ fixture … (deleted)` lines followed by the `✗ FATAL: reset_domain_fixture uat-onboard-token: POST operator_invites failed` line)
- BP-UAT-013-04 (script's last successful run): 2026-07-02 — the `--reset` path was used in a follow-up workflow (`wf-20260704-fix-092`, PR #108 squash `69f2b3f`) for the bats assertion regression; that run worked because **the schema had not yet required `token_hash`/`token_prefix` at the time**. The constraint was added by a more recent schema change (post 2026-07-03) that the seed script's reset path was not updated to handle.
- `ensure_operator_invite` (lines 542-595) shows the correct shape — it adds `token_hash` and `token_prefix` to the JSON payload before POST. `reset_domain_fixture` needs to do the same when the manifest declares `kind: domain` + `collection: operator_invites`.

## Proposed fix

Add `token_hash`/`token_prefix` derivation to `reset_domain_fixture` (in `scripts/uat-seed.sh`), gated on the collection being `operator_invites`:

```bash
# Inside reset_domain_fixture(), before building the POST body:
if [[ "$collection" == "operator_invites" ]]; then
  local token_plain
  token_plain=$(jq -r '.token_plain // empty' <<<"$fixture_json")
  if [[ -n "$token_plain" ]]; then
    local token_hash token_prefix
    token_hash=$(sha256_hex "$token_plain")
    token_prefix="${token_plain:0:8}"
    resolved_payload=$(jq -c \
      --arg th "$token_hash" \
      --arg tp "$token_prefix" \
      '. + {token_hash:$th, token_prefix:$tp}' \
      <<<"$resolved_payload")
  else
    fail "reset_domain_fixture ${id}: collection=operator_invites but token_plain missing from manifest — cannot recompute token_hash"
  fi
fi
```

This mirrors `ensure_operator_invite`'s lines 500-501 and lines 558-595. The fix is local to `scripts/uat-seed.sh` and `scripts/uat-fixtures/BP-UAT-013.json` does not need to change (the manifest already carries `token_plain` top-level).

## Acceptance criteria

- [ ] AC-1: `pnpm uat:seed --reset BP-UAT-013` exits 0 and creates all four `operator_invites` rows with non-null `token_hash` + `token_prefix`.
- [ ] AC-2: After reset, `apps/api/src/modules/admin-invites/admin-invites.service.ts::consumeInvite()` finds the seeded row via the recomputed `token_hash` lookup for `UAT_ONBOARD_TOKEN`, `UAT_ONBOARD_USED_TOKEN`, `UAT_ONBOARD_EXPIRED_TOKEN`, and `UAT_ONBOARD_NO_USER_TOKEN`.
- [ ] AC-3: `apps/api` `POST /v1/onboard/preview?token=uat-onboard-token` returns 200 with the seeded row's payload (no 500).
- [ ] AC-4: Regression — add a bats assertion under `scripts/tests/uat-seed.bats` that exercises `--reset BP-UAT-013` end-to-end (existing row → delete → recreate → token_hash round-trip), pinned to a pre-fix commit SHA per the FR-WORKFLOW-003 row 6 fix pattern.
- [ ] AC-5: `pnpm uat:seed` (unconditional) still works byte-identically (regression guard).

## Owner

Queued as `wf-20260705-fix-101-bp-uat-013-seed-reset` (issue-resolution workflow). Picked up immediately after `wf-20260705-uat-100` closes.

## Related

- ISS-UAT-013-1 (resolved) — port 3000 / 3001 squat
- ISS-UAT-SEED-001 (resolved) — `uat-seed.sh` step 4 fails on `consumed_at: null` + CRLF; same script family
- ISS-UAT-SEED-002 (resolved) — `api_base` default; same script
- `wf-20260704-fix-092` PR #108 squash `69f2b3f` — last successful `--reset BP-UAT-013` run (before this issue manifested)
- Manifest: `scripts/uat-fixtures/BP-UAT-013.json` — already declares `token_plain` top-level
- `scripts/uat-seed.sh::ensure_operator_invite` lines 500-501, 558-595 — reference implementation of `token_hash`/`token_prefix` derivation