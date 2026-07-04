# 06 — Test Strategy: ISS-UAT-BRIDGE-002 (Option B)

## Strategy summary

**Bats mock mode (existing tests, updated assertions) + live
end-to-end verification.** No new bats tests are authored — the
existing assertions in `scripts/tests/uat-seed.bats` are updated to
match the new TLD, and the live seed run provides the load-bearing
proof that Directus accepts the new emails.

This is consistent with the project's testing posture
(`AGENTS.md §3`): bats is for fast, deterministic, CI-friendly
regression coverage; live verification is for cross-system
integration that requires real infrastructure.

## Why no new bats tests

The change is a string swap. The behavior we care about is:

1. The seed constructs the right body for `ensure_linked` (covered by
   `ISS-UAT-001-1` tests, updated to match `@example.com`).
2. The seed's mock-mode no-flag output is unchanged except for the
   email strings (covered by `FR-WORKFLOW-003` rows 6-9).
3. The Directus API accepts the new emails (not testable in mock mode
   — covered by live verification).

A new bats test that asserts "Directus accepts `@example.com`" would
be tautological — it's testing the validator library, not our code.
The existing live seed run (verified 2026-07-04 13:00Z) provides the
proof that the round-trip works.

## Test plan

### Layer 1 — bats mock mode (deterministic, CI-friendly)

**Command:** `bash scripts/run-bats.sh scripts/tests/*.bats`

**Coverage:**

| Test ID | What it covers | Status before PR | Status after PR |
|---------|---------------|------------------|-----------------|
| `AC-1 row 3` | Mock mode emits 4 `operator_invite` lines, 3 with bare email + 1 with plus-addressed | Pass | Pass (regex updated to `@example.com`) |
| `AC-1 row 1` | Mock mode exits 0 and provisions 4 tokens | Pass | Pass (no change) |
| `AC-1 row 2` | Mock summary lists all 4 token names | Pass | Pass (no change) |
| `AC-5 row 4` | Valid-invite row carries `role_groups=['aiqadam-staff']` | Pass | Pass (no change) |
| `AC-2 row 5` | `DIRECTUS_TOKEN` guard emits FATAL | Pass | Pass (no change) |
| `AC-3 row 6` | `ensure_operator_invite` idempotency GET before POST | Pass | Pass (no change) |
| `AC-4 rows 7-9` | `uat-env-setup.sh` has onboard tokens | Pass | Pass (no change) |
| `FR-WORKFLOW-003 row 1-5, 7-11` | `--reset` mode behaviors | Pass | Pass (no change) |
| `FR-WORKFLOW-003 row 6` | No-flag mock output delta = 2 lines | **Fails on origin/main** | **Fails on this PR** (pre-existing, not introduced — see Deferral below) |
| `ISS-UAT-001-1 row 26` | `ensure_linked` line per identity | Pass | Pass (no change) |
| `ISS-UAT-001-1 row 27` | `ensure_linked` line carries the right email | Pass | Pass (regex updated to `@example.com`) |
| `ISS-UAT-001-1 row 28` | `api_ensure_directus_user_link` helper present | Pass | Pass (no change) |

**Expected result:** 95 of 96 pass. The single failure
(`FR-WORKFLOW-003 row 6`) is pre-existing on `origin/main` and is NOT
introduced by this PR — see Deferrals below.

### Layer 2 — live end-to-end verification (cross-system integration)

**Command:** `bash scripts/uat-seed.sh --reset BP-UAT-001`

**Prerequisites:**

- Directus reachable at `http://localhost:8200` (port-forwarded from
  the `aiqadam-directus` Docker container)
- Authentik reachable at `http://localhost:9000` (port-forwarded from
  the `aiqadam-authentik-server` Docker container)
- API reachable at `http://host.docker.internal:3001` (Windows-host
  `node` process; will fail with connection-refused on WSL bash
  without `host.docker.internal` — this is the bug the URL change
  fixes)

**Coverage:**

| Step | Asserted | Verification command |
|------|----------|---------------------|
| 1 | Directus accepts `uat-operator@example.com` | `GET /users?filter[email][_eq]=uat-operator@example.com` returns 1 row |
| 2 | Authentik accepts `uat-operator@example.com` | `GET /api/v3/core/users/6/` returns email=`uat-operator@example.com` |
| 3 | Directus accepts `uat-member-c@example.com` | `GET /users?filter[email][_eq]=uat-member-c@example.com` returns 1 row |
| 4 | Authentik accepts `uat-member-c@example.com` | `GET /api/v3/core/users/7/` returns email=`uat-member-c@example.com` |
| 5 | Directus accepts `uat-member-nc@example.com` | `GET /users?filter[email][_eq]=uat-member-nc@example.com` returns 1 row |
| 6 | Authentik accepts `uat-member-nc@example.com` | `GET /api/v3/core/users/8/` returns email=`uat-member-nc@example.com` |
| 7 | `member_consents` row resolves `member_email` to a real Directus UUID | Seed log: `✓ fixture uat-member-consented-consent (created, collection=member_consents)` |
| 8 | `events` row creates with `uat-operator@example.com` as `organizer_email` | Seed log: `✓ fixture uat-event-draft-uz (created, collection=events)` |

**Expected result:** seed exits 0; all 5 fixtures created.

**Verified 2026-07-04 13:00Z:** seed exited 0 with output:

```
✓ user uat-operator (exists, pk=6) — FORCE_REGEN, resetting password
✓ password set for uat-operator
✓ uat-operator → groups: aiqadam-super-admin
✓ ensure_linked uat-operator@example.com (directus_user_id=e227cf93-2fe5-4c5a-9513-f46ab07e6e6a)
✓ user uat-member-consented (exists, pk=7) — FORCE_REGEN, resetting password
✓ password set for uat-member-consented
✓ uat-member-consented → groups: aiqadam-member
✓ ensure_linked uat-member-c@example.com (directus_user_id=8a47d08e-e1a8-431a-b709-423acb1d5d55)
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

### Layer 3 — Directus round-trip (cross-validates the validator accept)

**Command:**

```bash
curl -H "Authorization: Bearer uat-directus-static-admin-token-32c" \
  "http://localhost:8200/users?filter[email][_in]=uat-operator@example.com,uat-member-c@example.com,uat-member-nc@example.com&fields=id,email"
```

**Expected result:** HTTP 200 with 3 rows, each `{id: <uuid>, email: <...>@example.com}`.

**Verified 2026-07-04 13:00Z:**

```json
{"data":[
  {"id":"e227cf93-2fe5-4c5a-9513-f46ab07e6e6a","email":"uat-operator@example.com"},
  {"id":"8a47d08e-e1a8-431a-b709-423acb1d5d55","email":"uat-member-c@example.com"},
  {"id":"a23efcdf-dd52-4009-bdf0-f47b2590a706","email":"uat-member-nc@example.com"}
]}
```

## Deferrals

### `FR-WORKFLOW-003 row 6` (pre-existing on origin/main)

**Status:** Pre-existing failure on `origin/main` (verified 2026-07-04
by running the test against `git show origin/main:scripts/uat-seed.sh`
and `git show origin/main:scripts/tests/uat-seed.bats` — same failure
mode: `current_lines - baseline_lines == 2` assertion fails because
the actual delta is 0).

**Root cause:** The test was authored with the assumption that
ISS-UAT-001-1's `ensureLinkedByEmail` fallback would add 2 new lines
to the no-flag mock output (one per identity fixture). The actual
implementation does not add lines — it adds a single `ensure_linked`
mock line per identity (already counted in the existing
`ISS-UAT-001-1` row 26/27 tests). The test author conflated "lines
added" with "behavior added".

**Why not fixed in this PR:**

1. The failure is pre-existing on `origin/main` (not introduced by this
   PR), so PRSteward override policy applies per AGENTS.md §6.3.
2. Fixing the assertion (`-eq 2` → `-eq 0`) is scope creep — it's a
   FR-WORKFLOW-003 test, not an ISS-UAT-BRIDGE-002 test.
3. The PRSteward's stop conditions (introduced-by-this-PR, counter-exhausted,
   security-check, secrets) are not tripped.

**Follow-up workflow:** A separate `wf-20260704-fix-XXX-fix-fr-workflow-003-row-6`
workflow will be queued (registered in the registry as
`wf-20260704-fix-087-fix-fr-workflow-003-row-6` or similar). This
follow-up is NOT in scope for the current PR.

## Risk-based test prioritization

| Risk | Test layer | Priority |
|------|------------|----------|
| `Directus` rejects new emails | Layer 3 (round-trip) | Critical |
| `Authentik` PATCH fails for existing users | Layer 2 (live seed) | High |
| WSL bash cannot reach API | Layer 2 (live seed) | High (resolvable by `API_BASE_URL` override) |
| bash curl bracket parse error | Layer 2 (live seed) | High (resolved by `-g` flag) |
| Existing bats regression | Layer 1 (mock) | Medium (existing tests cover most paths) |
| Pre-existing row 6 failure | Deferred | Low (PRSteward override, separate queue) |

## CI gating

Per `AGENTS.md §6.3` user opt-out (recorded 2026-07-04), CI is not a
workflow gate. The PRSteward applies the §6.3 override policy
operationally without surfacing to chat.

The bats test suite (`pnpm test:bash`) is part of the project's
quality bar but not a merge gate. The pre-existing `row 6` failure is
unaffected by this PR — the count of `not ok` tests is unchanged.