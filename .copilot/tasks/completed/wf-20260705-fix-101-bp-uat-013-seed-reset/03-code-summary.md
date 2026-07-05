# Step 4 — Code Summary

**Workflow:** wf-20260705-fix-101-bp-uat-013-seed-reset
**Agent:** CodeDeveloper
**Date:** 2026-07-05
**Fix scope:** 1 file modified (production code) + 1 file modified (tests).

---

## Files changed

| File | Δ | Purpose |
|---|---|---|
| `scripts/uat-seed.sh` | +28 lines | Insert token_hash+token_prefix derivation block inside `reset_domain_fixture()`, gated on `collection=operator_invites`. Mirrors the reference implementation in `ensure_operator_invite` (lines 500-501, 558-595) byte-for-byte. |
| `scripts/tests/uat-seed.bats` | +63 lines | 3 new regression tests at the end of the file, covering: (a) structural presence of the derivation block in `reset_domain_fixture`; (b) behavioral mock-mode invariant that `--reset BP-UAT-013` still exits 0 with 4 create lines; (c) behavioral no-flag regression that the unconditional path is unchanged. |

**Total:** 2 files, +91 lines, -0 lines. Well under the §4 PR limits (400 lines, 5 files).

---

## Patch details

### 1. `scripts/uat-seed.sh` — `reset_domain_fixture()`

Inserted at line ~772, between the `member_email` resolution block's closing `fi` (line 770) and the DELETE block's leading comment (line 773).

**Code added:**

```bash
  # ISS-UAT-013-14 fix: derive token_hash + token_prefix from the manifest's
  # token_plain field before the POST. Directus's operator_invites collection
  # requires both fields NOT NULL (added by a schema change post-2026-07-03,
  # after the last-successful --reset run at PR #108 / squash 69f2b3f).
  # Mirrors the reference implementation in ensure_operator_invite() —
  # scripts/uat-seed.sh lines 500-501 and 558-595 — which already does this
  # on the unconditional path. Without this block, --reset BP-UAT-013's
  # POST fails with HTTP 400 FAILED_VALIDATION (token_hash required +
  # token_prefix required), leaving operator_invites empty and breaking
  # BP-UAT-013 Steps 005/006 + Neg 002/003/005.
  #
  # Gated on collection=operator_invites ONLY. Other collections never had
  # a token_hash requirement; broader gating would be over-engineering.
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
      fail "reset_domain_fixture ${id}: collection=operator_invites but manifest has no .token_plain — cannot derive token_hash. Update scripts/uat-fixtures/<bp-uat>.json to declare token_plain per fixture."
    fi
  fi
```

**Behavioral characteristics:**

1. **Mock mode (`UAT_SEED_DIRECTUS_MOCK=1`)** — this block is NOT reached in
   mock mode because the mock branch returns early at line ~748 (above our
   insertion point). The block lives only in the live-mode path. This is
   intentional: silent merge in mock mode preserves the existing
   FR-WORKFLOW-003 row 1 invariant ("exactly 4 create lines").

2. **Live mode** — the block runs before the DELETE block, so the POST that
   eventually goes to Directus contains `token_hash` and `token_prefix`.

3. **Error handling** — if the manifest for `collection=operator_invites`
   is missing `.token_plain`, `fail` is called with an actionable message
   identifying the fixture id and pointing at the manifest file.

4. **No new dependencies** — `sha256_hex` (line 432), `jq`, `${token_plain:0:8}`
   are all already used by `ensure_operator_invite`.

### 2. `scripts/tests/uat-seed.bats` — 3 new `@test` blocks

**Test 1 (structural):** Reads `reset_domain_fixture()`'s body (anchored
via sed to the function header and closing `}`) and grep-verifies the
presence of:
- `[[ "$collection" == "operator_invites" ]]` — the gate.
- `jq -r '.token_plain // empty'` — the manifest read idiom.
- `sha256_hex "$token_plain"` — the hash derivation.
- `token_prefix="${token_plain:0:8}"` — the prefix derivation.
- `jq -c --arg th "$token_hash" --arg tp "$token_prefix" ... '. + {token_hash:$th, token_prefix:$tp}'` — the merge.

This is hermetic (no stack needed). A future edit that accidentally
bypasses any of these 5 invariants trips the test.

**Test 2 (behavioral, --reset path):** Re-runs FR-WORKFLOW-003 row 1's
mock-mode assertion: `--reset BP-UAT-013` in mock mode exits 0 with
exactly 4 `(mock, create collection=operator_invites)` lines. This is
the regression guard against any future noisy log line in the new
derivation block.

**Test 3 (behavioral, unconditional path):** Re-runs the unconditional
mock-mode assertion: `pnpm uat:seed` (no `--reset`) in mock mode
provisions all 4 fixtures (matches the existing AC-1 test). This is
the AC-5 byte-identical regression guard.

---

## Design decisions

### Why silent-in-mock-mode for the new derivation

The unconditional `ensure_operator_invite()` mock line explicitly
includes `email`, `role_groups`, AND `authentik_user_id` (per the
ISS-UAT-013-8 / wf-20260629-fix-039 fix) because the bats regression
needed to verify multiple invariants per call. By contrast, the
`--reset` path's mock-mode line (`\(mock, create collection=operator_invites\)`)
is intentionally minimal — it counts as the row 1 invariant, not as
an invariant about the payload. So the new derivation block stays
silent in mock mode and the structural test (test 1) carries the
invariants. This preserves the FR-WORKFLOW-003 row 1 + row 2 invariants.

### Why gate on collection rather than manifest-schema-discriminator

Two alternatives were considered:

A. **Schema-discriminator (query the Directus schema for NOT NULL columns).
   Pros:** future-proof for any new NOT-NULL field.
   **Cons:** requires a live Directus round-trip in `--reset`'s outer
   loop (N round-trips per manifest); defeats the offline-friendly
   nature of the reset flow; doubles the failure surface; not requested
   in the issue.

B. **Hard-coded `[[ "$collection" == "operator_invites" ]]` gate.**
   **Pros:** zero extra round-trips, fast, deterministic, mirror of the
   only known case, easy to widen later if a new collection gets the
   same constraint.
   **Cons:** requires editing this function again if another collection
   acquires the same constraint.

The issue's `## Proposed fix` text in `ISS-UAT-013-14.md` itself
documents this as the chosen approach. We follow the issue's proposal.

### Why ${id} in the fail() message instead of ${bp_uat}

`bp_uat` is local to `run_reset_for_bp()`, not to `reset_domain_fixture()`.
Carrying `bp_uat` into `reset_domain_fixture` would require a side-effect
(exporting a global). Keeping `${id}` (the fixture id) in the message
provides enough context for human triage, and the file path the message
points at (`scripts/uat-fixtures/<bp-uat>.json`) uses a generic literal.

---

## Tests that still pass (verified by hand-trace)

- FR-WORKFLOW-003 row 1: `--reset BP-UAT-013` mock mode → 4 create lines ✓ (block is silent in mock)
- FR-WORKFLOW-003 row 2: each domain fixture's delete line precedes its create line ✓ (insertion is between resolution and delete, doesn't reorder)
- FR-WORKFLOW-003 row 3 + 3b: localhost guard ✓ (untouched)
- FR-WORKFLOW-003 row 6: byte-equivalent structural baseline ✓ (the new block only adds code, doesn't change existing log lines)
- AC-1 (existing): mock mode provisions all 4 tokens via the unconditional path ✓ (the new block is inside `reset_domain_fixture`, not `ensure_operator_invite`)

---

## Tests that need live infra (deferred to wf-20260705-fix-103-uat-013-verify per AGENTS.md §6.1)

- AC-1, AC-2, AC-3 from the issue: live `pnpm uat:seed --reset BP-UAT-013` against the running Directus stack, plus 4 token-preview curls against the api.

The honesty disclosure for this deferral is recorded in `02-impact-analysis.md`
and will be back-referenced in the issue file's Resolution section at workflow close.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Bounded fix: reset_domain_fixture() gains an operator_invites-gated token derivation block (mirrors reference impl); 3 bats regression tests guard against future regressions."
  lines_changed:
    - scripts/uat-seed.sh: +28 lines, no removals
    - scripts/tests/uat-seed.bats: +63 lines, no removals
  breaking_change: false
  new_dependencies: []
  migration_required: false
  reviewer_notes:
    - "The block is silent in mock mode (silence is by design — preserves FR-WORKFLOW-003 row 1 invariant)."
    - "The block is live-mode only (the mock branch returns at line ~748, above the insertion point)."
    - "The fail() message includes the fixture id and points at the manifest file — sufficient for human triage."
```
