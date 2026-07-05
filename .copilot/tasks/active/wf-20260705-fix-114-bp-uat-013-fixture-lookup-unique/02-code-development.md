# 02 — Code Development (wf-20260705-fix-114-bp-uat-013-fixture-lookup-unique)

## Agent

CodeDeveloper (own implementation, scoped to the manifest-only fix from Option A in the issue body — no script changes needed because `reset_domain_fixture()` already supports arbitrary `lookup_field` / `lookup_value` per fixture)

## Plan (per AGENTS.md §2)

### Task understanding

ISS-UAT-013-16: `scripts/uat-fixtures/BP-UAT-013.json` declares `lookup_field: "token_prefix"` with `lookup_value: "uat-onbo"` for all four fixtures. All four plaintext tokens share the same 8-char prefix `uat-onbo`. The `reset_domain_fixture()` DELETE-step (scripts/uat-seed.sh lines 836-849) therefore matches ALL existing rows on each iteration, and the next fixture's DELETE wipes the previous fixture's CREATE — only the LAST fixture's row survives. Discovered during `wf-20260705-uat-110-bp-uat-013-verify` Step 3 (5/12 Playwright tests passed; 7 failed with 410 `invite_invalid` for missing rows).

### Approach (Option A from issue body — narrowest scope, additive)

Change each fixture's `lookup_field` from the non-unique `token_prefix` to the per-row-unique `token_hash`, and `lookup_value` from `"uat-onbo"` to `sha256(token_plain)`. The reset code path already supports arbitrary lookup fields (lines 836-849: `filter[${lookup_field}][_eq]=${encoded_value}`). No script changes needed.

This mirrors the unconditional `ensure_operator_invite()` idempotency guard (scripts/uat-seed.sh lines 500-501 / 558-561) which already uses `filter[token_hash][_eq]=${token_hash}` — keeping lookup semantics consistent across the two code paths.

### Files modified

1. **scripts/uat-fixtures/BP-UAT-013.json** — 4 fixture entries updated:
   - `uat-onboard-token`: `lookup_field: "token_prefix", lookup_value: "uat-onbo"` → `lookup_field: "token_hash", lookup_value: "441f71146d641161ba02270557c9e33b49ebc6e83ebbc84433dde5662f9bf64e"` (sha256 of `uat-onboard-token`)
   - `uat-onboard-used-token`: → `token_hash = 05ce1c433d0abcde50c3d094b930b5b627d7139539e22c18fc60df473bde8df0`
   - `uat-onboard-expired-token`: → `token_hash = a64b749641479bb96868560e19d0f1e4aec0849b95dd6f245a9bbdd31dcb4da2`
   - `uat-onboard-no-user-token`: → `token_hash = 76859ea10fdfa33395841b2b36eb5ad57b87a5374bcafcc2dc6d793e395ae565`
   - Each fixture's `note` field updated to reference ISS-UAT-013-16 and explain the per-row uniqueness invariant.
   - Each fixture's `payload.email` field updated from `uat-operator@aiqadam.test` → `uat-operator@example.com` (the @aiqadam.test TLD was rejected by Directus's `is-email` validator; switched to @example.com globally in `wf-20260704-fix-086` / ISS-UAT-BRIDGE-002, but this manifest's payload still had the stale TLD until now). Same change for `uat-operator+no-user@aiqadam.test` → `uat-operator+no-user@example.com`.

2. **scripts/tests/uat-seed.bats** — appended 6 new regression rows (rows 42-47):
   - Row 42-45: per-fixture `lookup_field=token_hash` + `lookup_value=sha256(token_plain)` (computed live via a new `manifest_sha256()` helper that mirrors `sha256_hex()` byte-for-byte — sha256sum on Linux, shasum -a 256 on macOS).
   - Row 46: cross-fixture uniqueness invariant — `sort -u` of all 4 lookup_values must yield 4 distinct values (catches the original bug at the manifest level: if any two fixtures share a lookup_value, sort -u reduces the count).
   - Row 47: cross-fixture lookup_field invariant — all 4 fixtures must declare `lookup_field: "token_hash"` AND `collection: "operator_invites"` (catches a partial revert where one fixture still uses token_prefix).

### Risks considered

- **Hash collision risk:** Effectively zero. SHA-256 collisions are not computationally feasible, and the per-fixture `token_plain` is unique by construction.
- **Cross-platform risk:** `sha256_hex()` in uat-seed.sh uses `sha256sum` on Linux and `shasum -a 256` on macOS. Both produce identical hex output. The new `manifest_sha256()` helper in the bats file mirrors this exactly, so the assertions remain portable.
- **Cross-token collision risk for the api's lookup:** The api uses `consumeInvite()` → `lookupByToken()` which queries Directus by `filter[token_hash][_eq]=${sha256(token_plain)}`. This is already the unconditional path's idempotency key, so the manifest now matches the api's lookup semantics exactly.
- **TLD drift in payload.email:** The manifest's `payload.email` was `uat-operator@aiqadam.test` — which Directus's `is-email` validator rejects (the reason `wf-20260704-fix-086` switched to `@example.com`). The manifest had not been updated alongside the unconditional seed. This change brings them into alignment. Note: this is technically a separate sub-gap from the lookup-uniqueness bug the issue is filed for — but it's the same kind of drift and the same PR is the natural place to fix it (one-line per fixture).
- **AGENTS.md §6.1 infra obligation:** No infrastructure changes needed — the Docker stack (postgres, directus, mailpit, authentik, redis) is already up on this workstation (verified by `docker ps`). The api is already running on `:3000` (PID 7396; matches `apps/api/.env` PORT=3000). Pre-flight curl against `/health` returned 200. Live verification proceeds without bringing up new infra.

### Plan confirmation

The fix is minimal (1 JSON file + 1 bats file) and additive (no script behavior change, no new dependencies, no new color tokens, no breaking API changes). Per AGENTS.md §6.2 safety gates, this does not require user confirmation — it's a routine issue-resolution within agent authority (§14).

## Implementation

```diff
# scripts/uat-fixtures/BP-UAT-013.json — fixture 1 (uat-onboard-token)
-      "lookup_field": "token_prefix",
-      "lookup_value": "uat-onbo",
-      "note": "token_prefix alone is not unique across these 4 rows (all share prefix 'uat-onbo' from the shared 'uat-onboard-' stem) — the real uniqueness key is token_hash, computed at recreate time from token_plain, same as ensure_operator_invite()'s existing idempotency check.",
+      "lookup_field": "token_hash",
+      "lookup_value": "441f71146d641161ba02270557c9e33b49ebc6e83ebbc84433dde5662f9bf64e",
+      "note": "lookup_value is sha256(uat-onboard-token), computed by sha256_hex() in scripts/uat-seed.sh — token_hash is per-row unique (the unconditional ensure_operator_invite idempotency check uses the same sha256, lines 500-501 / 558-561). Each fixture's lookup_field MUST be token_hash (not token_prefix) because all four fixtures share the 8-char prefix 'uat-onbo'. See ISS-UAT-013-16 for the bug this prevents.",
       "token_plain": "uat-onboard-token",
       "payload": {
-        "email": "uat-operator@aiqadam.test",
+        "email": "uat-operator@example.com",
```

Same shape applied to fixtures 2-4.

## Decisions recorded

- **Option A (manifest) over Option B (script):** Option A is the recommended fix in the issue body because it (a) doesn't bake `operator_invites` special-casing deeper into the script, (b) is additive (doesn't risk regressing the unconditional seed path), (c) places per-row lookup semantics in the manifest where they belong. Option B would be appropriate only if many manifests shared the bug — but BP-UAT-013's is the only known instance.
- **TLD drift in payload.email is fixed in this same PR:** The `payload.email: uat-operator@aiqadam.test` field was already broken (Directus rejects `.aiqadam.test` per RFC 6761 / Directus `is-email` validator). It would have surfaced as the next bug the moment AC-2 of this issue was verified end-to-end. Fixing it here saves a follow-up workflow for the same kind of drift.
- **The cross-fixture bats rows (42-47) are belt-and-suspenders:** Per-row assertion (rows 42-45) catches direct edits; cross-fixture rows (46-47) catch partial reverts and collision regressions.

## Gate result

Step 02-code-development: **PASS** (all AC-by-AC changes implemented and live-verified).