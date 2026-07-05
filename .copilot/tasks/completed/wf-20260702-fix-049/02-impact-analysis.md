# Step 2 — Impact Analysis

**Workflow:** wf-20260702-fix-049
**Issue:** ISS-UAT-013-10 — Step 005 spec asserts `aiqadam-staff` role
  visible but seed has empty role_groups.
**Date:** 2026-07-02

## Scope

**Single-file change** to `scripts/uat-seed.sh` (the bash seed script).
**Optional addition** of one regression test in
`scripts/tests/uat-seed.bats` to lock in the role_groups behaviour.

That is the entire surface area of this fix.

## Files to modify

| File | Reason | Lines (est.) |
|---|---|---|
| `scripts/uat-seed.sh` | Add optional `role_groups` parameter to `ensure_operator_invite()`; pass `'["aiqadam-staff"]'` from the valid-invite call site. | ~10 lines added, 0 removed. |
| `scripts/tests/uat-seed.bats` | Add regression test that the mock-mode output line for `uat-onboard-token` shows `role_groups=['aiqadam-staff']`. (Currently only the email distribution is asserted; role_groups is uncovered.) | ~10 lines added. |

## Files NOT modified (verified)

| File | Reason |
|---|---|
| `apps/api/src/modules/admin-invites/admin-invites.service.ts` | The api already accepts `role_groups` as `RoleGroup[]` (validated against `ALLOWED_ROLE_GROUPS`); `aiqadam-staff` is in that allow-list. No code change needed. |
| `apps/web/src/components/OnboardingForm.tsx` | The web component already renders `preview.role_groups.join(', ')`; the seed needs to feed it a non-empty array. No code change needed. |
| `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` | The spec is correct as-is (`getByText(/aiqadam-staff/i)`). Step 005 is the assertion that drives the fix; we are NOT changing the spec. |
| `docs/02-business-processes/uat/BP-UAT-013.md` | No change — the human-readable UAT script correctly describes what Step 005 should look like (invite details visible). |
| `.copilot/issues/ISS-UAT-013-10.md` | The issue body describes the spec/seed misalignment; no change needed. The Status header will be flipped atomically in Step 9. |

## Risks

1. **Idempotency of re-seeding.** The Directus insert path already
   guards on `token_hash` (SHA-256) before POST — confirmed by
   `scripts/tests/uat-seed.bats` AC-3 structural test. Re-running
   `pnpm uat:seed` against an already-seeded database will skip the
   three "happy" rows, including the one whose `role_groups` we just
   changed. **Operators re-seeding after this fix must delete the
   old valid-invite row first** (or use `FORCE_REGEN=1`-style purge,
   which the script does not currently support). I will note this
   in the PR description as a known operational caveat. It is not a
   workflow blocker because the Directus admin can `DELETE /items/
   operator_invites?filter[token_prefix][_eq]=uat-onbo` before the
   next seed run.

2. **Role group assigned to the operator at accept time.** When the
   onboarded operator reaches `/onboard/accept`, the api's
   `consumeInvite()` (apps/api/src/modules/admin-invites/
   admin-invites.service.ts line 388) maps each `RoleGroup` to an
   Authentik group via `ROLE_GROUP_TO_AUTHENTIK`. For
   `aiqadam-staff`, the mapping is `aiqadam-staff → aiqadam-staff`.
   The Authentik group `aiqadam-staff` is provisioned by
   `scripts/provision-authentik-rbac-groups.sh` (already shipped
   per ISS-UAT-013-4). The accept-time group assignment should work
   without further changes. **No risk**, but worth verifying in a
   live UAT re-run (out of scope here; deferred).

3. **bats regression test in `uat-seed.bats`.** The mock-mode line
   format (`operator_invite <token_prefix> (mock, email=<email>)`)
   will need a small extension to print `role_groups=<json>` so the
   regression test can grep for it. This is a non-breaking change
   to the mock output and does not affect real seed runs.

## Blast radius

- **Production:** None. This is a test-only seed script. No production
  data is touched.
- **Other test runs:** BP-UAT-013 is the only UAT script that uses
  `operator_invites`. Other BP-UAT scripts do not interact with this
  table. No collateral impact.
- **Local dev:** Operators running `pnpm uat:seed` against a freshly
  provisioned Directus will see the valid invite row now carry
  `role_groups=['aiqadam-staff']` — this is the desired behaviour.

## Dependency chain

| Dependency | Status |
|---|---|
| `ALLOWED_ROLE_GROUPS` in api includes `aiqadam-staff` | ✅ Already in api/src/modules/admin-invites/admin-invites.service.ts |
| `aiqadam-staff` Authentik group exists | ✅ Provisioned by `scripts/provision-authentik-rbac-groups.sh` |
| Operator's email matches seeded Authentik user (so api can resolve at accept time) | ✅ Resolved by ISS-UAT-013-8 (wf-20260629-fix-039) |
| Lead-verification idempotency (so Step 004 → Step 005 → Step 006 chain works) | ✅ Resolved by ISS-UAT-013-9 (wf-20260630-fix-043) |

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Single-file seed-script change plus optional bats regression. All upstream dependencies already merged. No blast radius."
  findings:
    - "Scope is 1 file (uat-seed.sh) + 1 optional regression test"
    - "Idempotency re-seeding caveat: existing seeded valid-invite rows will not be updated; operators must delete-then-reseed"
    - "Live UAT re-run (BP-UAT-013 Steps 005/006 against full stack) is deferred to next UATRunner workflow per AGENTS.md §6.1"
```