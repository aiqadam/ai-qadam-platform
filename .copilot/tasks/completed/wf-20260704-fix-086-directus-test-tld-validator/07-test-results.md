# 07 — Test Results: ISS-UAT-BRIDGE-002 (Option B)

## Run timestamp

2026-07-04 13:00Z (live seed run + bats regression suite)

## Layer 1 — bats regression (mock mode)

**Command:** `bash scripts/run-bats.sh scripts/tests/*.bats`

**Result:** **95 of 96 tests pass** (1 pre-existing failure,
unaffected by this PR — see Deferral note below).

### Tests added/modified by this PR

| Test | Before | After | Delta |
|------|--------|-------|-------|
| `AC-1 row 3` (`mock mode shares operator email`) | Pass | Pass | Updated regex `@aiqadam\.test` → `@example\.com` |
| `FR-WORKFLOW-003 row 7` (`member_email FK resolves`) | Pass | Pass | Updated substring `@aiqadam.test` → `@example.com` |
| `ISS-UAT-001-1 row 27` (`ensure_linked email`) | Pass | Pass | Updated regex + added migration-source comment |

### Failure: `FR-WORKFLOW-003 row 6` (pre-existing on origin/main)

```
not ok 74 FR-WORKFLOW-003 row 6: no-flag mock output is byte-identical to the pre-FR baseline
# (in test file scripts/tests/uat-seed.bats, line 285)
#   `[ "$((current_lines - baseline_lines))" -eq 2 ]' failed
```

**Verified pre-existing:** Ran the test against
`git show origin/main:scripts/uat-seed.sh` and
`git show origin/main:scripts/tests/uat-seed.bats` — same failure mode.

**Root cause:** The test was authored with the assumption that
ISS-UAT-001-1's `ensureLinkedByEmail` fallback would add 2 new lines
to the no-flag mock output (one per identity fixture: `uat-member`
+ `uat-operator`). The actual implementation does not add lines — it
adds a single `ensure_linked` mock line per identity (already counted
in the existing `ISS-UAT-001-1` row 26/27 tests). The assertion
expects delta=2, actual delta=0.

**Why not fixed here:** Pre-existing on origin/main, unrelated to
ISS-UAT-BRIDGE-002 scope. Routed to follow-up workflow
`wf-20260704-fix-087-fix-fr-workflow-003-row-6` (to be queued in
registry).

### Test counts

- Total bats tests: 96
- Pass: 95 (98.96%)
- Fail: 1 (pre-existing, not introduced by this PR)
- Skip: 0

## Layer 2 — Live end-to-end verification

**Command:** `bash scripts/uat-seed.sh --reset BP-UAT-001`

**Result:** **Exit 0, all 5 BP-UAT-001 fixtures created.**

### Full output

```
╔══════════════════════════════════════════════════════╗
║        AI Qadam — UAT Seed Fixtures                  ║
╚══════════════════════════════════════════════════════╝

  ✓ localhost guard passed (DIRECTUS_URL=http://localhost:8200, AK_URL=http://localhost:9000)
  → resetting fixtures for BP-UAT-001 (manifest: .../BP-UAT-001.json)
  → resetting identity fixture uat-operator (uat-operator)
  ✓ user uat-operator (exists, pk=6) — FORCE_REGEN, resetting password
  ✓ password set for uat-operator
  ✓ uat-operator → groups: aiqadam-super-admin
  ✓ ensure_linked uat-operator@example.com (directus_user_id=e227cf93-2fe5-4c5a-9513-f46ab07e6e6a)
  → resetting identity fixture uat-member-consented (uat-member-consented)
  ✓ user uat-member-consented (exists, pk=7) — FORCE_REGEN, resetting password
  ✓ password set for uat-member-consented
  ✓ uat-member-consented → groups: aiqadam-member
  ✓ ensure_linked uat-member-c@example.com (directus_user_id=8a47d08e-e1a8-431a-b709-423acb1d5d55)
  → resetting identity fixture uat-member-no-consent (uat-member-no-consent)
  ✓ user uat-member-no-consent (exists, pk=8) — FORCE_REGEN, resetting password
  ✓ password set for uat-member-no-consent
  ✓ uat-member-no-consent → groups: aiqadam-member
  ✓ ensure_linked uat-member-nc@example.com (directus_user_id=a23efcdf-dd52-4009-bdf0-f47b2590a706)
  → fixture uat-member-consented-consent: member_email 'uat-member-c@example.com' resolved to member=8a47d08e-e1a8-431a-b709-423acb1d5d55
  ✓ fixture uat-member-consented-consent (created, collection=member_consents)
  ✓ fixture uat-event-draft-uz (created, collection=events)
  ✓ BP-UAT-001 reset complete (5 fixture(s))

  ✓ --reset BP-UAT-001 complete
```

### Per-acceptance-criterion verification

| AC | Verification | Status |
|----|--------------|--------|
| AC-1: 3 identity mirrors in `directus_users` | All 3 `ensure_linked <email> (directus_user_id=<uuid>)` lines emitted | **Pass** |
| AC-2: Authentik email migration (PATCH path) | All 3 users existed with `@aiqadam.test` emails; new `user_email_by_pk` branch PATCHed them silently during the FORCE_REGEN→rebuild transition | **Pass** (verified by Authentik GET — see Layer 3) |
| AC-3: `member_consents` row resolves `member_email` to a real Directus UUID | `member_email 'uat-member-c@example.com' resolved to member=8a47d08e-...` | **Pass** |
| AC-4: `events` row creates with new TLD organizer | `✓ fixture uat-event-draft-uz (created, collection=events)` | **Pass** |
| AC-5: bash-curl `-g` flag fixes bracket-range parse | `directus_user_pk_by_email` resolved `uat-member-c@example.com` correctly (was failing with `bad range in URL` before the fix) | **Pass** |
| AC-6: `host.docker.internal:3001` API URL works from WSL bash | All 3 `ensure_linked` lines emitted with valid `directus_user_id` (was failing with `HTTP 000` connection-refused before the fix) | **Pass** |
| AC-7: bats regression suite unaffected | 95/96 pass (1 pre-existing failure on origin/main, unchanged) | **Pass** (modulo pre-existing row 6) |

## Layer 3 — Directus round-trip

**Command:**

```bash
curl -H "Authorization: Bearer uat-directus-static-admin-token-32c" \
  "http://localhost:8200/users?filter[email][_in]=uat-operator@example.com,uat-member-c@example.com,uat-member-nc@example.com&fields=id,email"
```

**Result:** HTTP 200 with 3 rows:

```json
{
  "data": [
    {"id":"e227cf93-2fe5-4c5a-9513-f46ab07e6e6a","email":"uat-operator@example.com"},
    {"id":"8a47d08e-e1a8-431a-b709-423acb1d5d55","email":"uat-member-c@example.com"},
    {"id":"a23efcdf-dd52-4009-bdf0-f47b2590a706","email":"uat-member-nc@example.com"}
  ]
}
```

**Interpretation:** All 3 users are present in `directus_users` with
matching emails. This confirms that Directus's `is-email` validator
accepted the new TLD on the data-write path (the bridge's
`Directus.users.createOne(...)` call succeeded for all 3).

## Authentik PATCH migration verification

**Initial state (before this PR):** `uat-operator`, `uat-member-consented`,
`uat-member-no-consent` had emails `@aiqadam.test` (leftover from prior
seeds).

**Post-seed state (after this PR's seed run):**

```bash
$ curl -H "Authorization: Bearer $AK_TOKEN" \
    "http://localhost:9000/api/v3/core/users/6/" | jq -r '.email'
uat-operator@example.com

$ curl -H "Authorization: Bearer $AK_TOKEN" \
    "http://localhost:9000/api/v3/core/users/7/" | jq -r '.email'
uat-member-c@example.com

$ curl -H "Authorization: Bearer $AK_TOKEN" \
    "http://localhost:9000/api/v3/core/users/8/" | jq -r '.email'
uat-member-nc@example.com
```

**Interpretation:** The new `user_email_by_pk` helper + email-update
branch in `ensure_test_user` correctly migrated all 3 existing seeded
users from `@aiqadam.test` to `@example.com` during the live seed
run. Migration is **idempotent** — re-running the seed will see the
emails already match and skip the PATCH (no-op).

## Aggregate result

| Layer | Result | Confidence |
|-------|--------|-----------|
| 1. bats mock regression | 95/96 pass (1 pre-existing) | High |
| 2. Live end-to-end seed | Exit 0, all 5 fixtures created | High |
| 3. Directus round-trip | 3 rows present, matching emails | High |
| Authentik migration | 3 users' emails updated successfully | High |

**Overall verdict:** Ready to merge.