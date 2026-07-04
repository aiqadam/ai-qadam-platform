# 06 — Test Design: ISS-UAT-BRIDGE-002 (Option B)

## Summary

Three assertion updates in `scripts/tests/uat-seed.bats`. No new tests
authored. The live seed run (`bash scripts/uat-seed.sh --reset BP-UAT-001`)
provides the load-bearing end-to-end proof that Directus accepts the
new TLD.

## Changes to `scripts/tests/uat-seed.bats`

### Change 1: `AC-1 row 3` (lines 101-104)

**Before:**

```bash
bare=$(echo "$output" | grep -cE 'operator_invite .*\(mock, email=uat-operator@aiqadam\.test' || true)
plus=$(echo "$output" | grep -cE 'operator_invite .*\(mock, email=uat-operator[+]no-user@aiqadam\.test' || true)
```

**After:**

```bash
bare=$(echo "$output" | grep -cE 'operator_invite .*\(mock, email=uat-operator@example\.com' || true)
plus=$(echo "$output" | grep -cE 'operator_invite .*\(mock, email=uat-operator[+]no-user@example\.com' || true)
```

**Rationale:** This test asserts that the 4 mock-mode `operator_invite`
lines have the correct email pattern. With the TLD switched, the
email patterns switch too. The structure (3 bare + 1 plus-addressed)
is unchanged.

### Change 2: `FR-WORKFLOW-003 row 7` (line 301)

**Before:**

```bash
[[ "$output" == *"fixture uat-member-consented-consent (mock, create collection=member_consents, member_email=uat-member-c@aiqadam.test resolved to member=uat-member-consented)"* ]]
```

**After:**

```bash
[[ "$output" == *"fixture uat-member-consented-consent (mock, create collection=member_consents, member_email=uat-member-c@example.com resolved to member=uat-member-consented)"* ]]
```

**Rationale:** This test asserts that the mock-mode member_email FK
resolution logs the correct email. The substring match follows the
email change.

### Change 3: `ISS-UAT-001-1 row 27` (lines 428-440)

**Before:**

```bash
@test "ISS-UAT-001-1: ensure_linked mock line carries the right email per identity" {
  # Strengthens the previous test: the two ensure_linked lines must
  # reference the right emails (one per identity that STEP 3
  # provisions). uat-member's email is `uat-member@aiqadam.test`,
  # uat-operator's is `uat-operator@aiqadam.test`.
  ...
  member_lines=$(echo "$output" | grep -cE 'ensure_linked uat-member@aiqadam\.test \(mock, directus_user_id=mock-uuid\)' || true)
  operator_lines=$(echo "$output" | grep -cE 'ensure_linked uat-operator@aiqadam\.test \(mock, directus_user_id=mock-uuid\)' || true)
```

**After:**

```bash
@test "ISS-UAT-001-1: ensure_linked mock line carries the right email per identity" {
  # Strengthens the previous test: the two ensure_linked lines must
  # reference the right emails (one per identity that STEP 3
  # provisions). uat-member's email is `uat-member@example.com`,
  # uat-operator's is `uat-operator@example.com`.
  # (Switched from @aiqadam.test to @example.com in wf-20260704-fix-086 /
  # ISS-UAT-BRIDGE-002 — the @aiqadam.test TLD is rejected by Directus's
  # built-in is-email validator, blocking the bridge from creating the
  # directus_users mirror. .example.com is RFC 2606 reserved and passes
  # every email validator.)
  ...
  member_lines=$(echo "$output" | grep -cE 'ensure_linked uat-member@example\.com \(mock, directus_user_id=mock-uuid\)' || true)
  operator_lines=$(echo "$output" | grep -cE 'ensure_linked uat-operator@example\.com \(mock, directus_user_id=mock-uuid\)' || true)
```

**Rationale:** Same string substitution + a comment block documenting
the migration source so the next reader understands why the TLD
changed (the original `uat-member@aiqadam.test` comment was misleading
because it was the value being changed, not a stable reference).

## Why no new tests

### Tests we considered but rejected

1. **"The seed PATCHes stale emails on the no-FORCE_REGEN path"** —
   Would require mocking Authentik's `GET /api/v3/core/users/{pk}/`
   and `PATCH /api/v3/core/users/{pk}/` responses, plus asserting on
   the new `ok "${username} email updated: ..."` log line. This is
   testable but the assertion is fragile (depends on log format).
   Better: live verification via the existing seed run.

2. **"Directus accepts `@example.com` emails"** — Tautological.
   Directus's `is-email` validator is a third-party library
   (`validator.js`'s `isEmail`). The test would be asserting that
   `validator.js` accepts RFC 2606 reserved `.example`, which it does
   (verified by reading the library source). The actual end-to-end
   proof is the live seed run.

3. **"Migration idempotency — running the seed twice leaves the same
   state"** — Already covered by the existing `FR-WORKFLOW-003 row 5`
   test (`--reset all processes both manifests and exits 0`). The
   email-update branch is idempotent by design (PATCH returns 200
   with no observable change on re-PATCH).

4. **"`host.docker.internal:3001` is reachable from WSL bash"** —
   Environment-dependent. The bats tests run in a single environment
   (the developer machine) and cannot reliably test WSL vs PowerShell
   network namespaces. Better: documented as a code comment with the
   `API_BASE_URL` override hint.

### Tests we considered but deferred

5. **"FR-WORKFLOW-003 row 6 — the no-flag mock output delta"** —
   Pre-existing failure on origin/main (assertion expects delta=2,
   actual delta=0). This is a separate issue (FR-WORKFLOW-003 test
   bug, not ISS-UAT-BRIDGE-002) and is deferred to a follow-up
   workflow. See `06-test-strategy.md` Deferrals section.

## Coverage matrix

| Acceptance Criterion | Test | Status |
|----------------------|------|--------|
| Directus accepts `uat-operator@example.com` | Live verify (Layer 2 + 3) | Verified 2026-07-04 |
| Directus accepts `uat-member-c@example.com` | Live verify (Layer 2 + 3) | Verified 2026-07-04 |
| Directus accepts `uat-member-nc@example.com` | Live verify (Layer 2 + 3) | Verified 2026-07-04 |
| Authentik accepts all 3 emails (initial creation) | Live verify (Layer 2) | Verified 2026-07-04 |
| Authentik PATCH migrates stale `@aiqadam.test` emails | Live verify (Layer 2) | Verified 2026-07-04 (existing users' emails successfully updated) |
| `member_consents.member_email` FK resolves to a real Directus UUID | Live verify (Layer 2) | Verified 2026-07-04 (`member=8a47d08e-...`) |
| `events.organizer_email` accepts the new TLD | Live verify (Layer 2) | Verified 2026-07-04 (`✓ fixture uat-event-draft-uz (created, collection=events)`) |
| Mock-mode `operator_invite` lines have the correct email | `AC-1 row 3` (Layer 1) | Updated assertion, passes |
| Mock-mode `member_email` FK resolution log | `FR-WORKFLOW-003 row 7` (Layer 1) | Updated assertion, passes |
| Mock-mode `ensure_linked` lines have the correct email | `ISS-UAT-001-1 row 27` (Layer 1) | Updated assertion, passes |
| bash curl `-g` fix for `filter[...]` URLs | Live verify (Layer 2) — covers all 3 sites | Verified 2026-07-04 (`directus_user_pk_by_email` resolved `uat-member-c@example.com` correctly) |
| `host.docker.internal:3001` API URL default | Live verify (Layer 2) — `ensure_linked` lines emitted | Verified 2026-07-04 (all 3 `ensure_linked` lines present with valid `directus_user_id`) |

## Final test commands

```bash
# Layer 1 — bats (mock mode, CI-friendly)
bash scripts/run-bats.sh scripts/tests/*.bats
# Expected: 95 of 96 pass (1 pre-existing failure on origin/main)

# Layer 2 — live end-to-end (requires full stack)
bash scripts/uat-seed.sh --reset BP-UAT-001
# Expected: exit 0, all 5 fixtures created

# Layer 3 — Directus round-trip (cross-validates the validator accept)
curl -H "Authorization: Bearer uat-directus-static-admin-token-32c" \
  "http://localhost:8200/users?filter[email][_in]=uat-operator@example.com,uat-member-c@example.com,uat-member-nc@example.com&fields=id,email"
# Expected: HTTP 200, 3 rows
```