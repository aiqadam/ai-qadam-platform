# Step 7 — Test Design (Code Written)

**Workflow:** wf-20260702-fix-049
**Issue:** ISS-UAT-013-10
**Date:** 2026-07-02

## Test code

### New test: AC-5 in `scripts/tests/uat-seed.bats`

The full bats file is reproduced here for context (the change is
localized to one new `@test` block plus a regex update to the existing
AC-1 distribution test):

```bash
@test "AC-5: valid-invite row carries role_groups=['aiqadam-staff']; other three rows carry []" {
  # ISS-UAT-013-10 regression: the BP-UAT-013 Step 005 spec asserts
  # `getByText(/aiqadam-staff/i)` is visible on the onboarding page.
  # That text is rendered by apps/web/src/components/OnboardingForm.tsx at
  # line ~194 from `preview.role_groups.join(', ')`. If the seed leaves
  # role_groups empty for the valid-invite row, Step 005 fails.
  #
  # This test pins the per-row role_groups content via the mock-mode
  # output line:
  #   "operator_invite <token_prefix> (mock, email=<email>, role_groups=<json>)"
  #
  # Expected distribution:
  #   - uat-onbo (the "uat-onboard-token" prefix) → role_groups=['aiqadam-staff']
  #   - all 3 other rows → role_groups=[]
  # Total role_groups=[] lines: 3; total role_groups=['aiqadam-staff'] lines: 1.
  run bash -c 'UAT_SEED_DIRECTUS_MOCK=1 DIRECTUS_TOKEN=mock-token bash "$REPO_ROOT/scripts/uat-seed.sh" 2>&1'
  [ "$status" -eq 0 ]
  local valid empty
  valid=$(echo "$output" | grep -cE 'operator_invite .*\(mock, .*role_groups=\["aiqadam-staff"\]' || true)
  empty=$(echo "$output" | grep -cE 'operator_invite .*\(mock, .*role_groups=\[\]' || true)
  [ "$valid" -eq 1 ]
  [ "$empty" -eq 3 ]
}
```

### Updated test: AC-1 distribution regex

The mock output line format changed from
`(mock, email=<email>)` to
`(mock, email=<email>, role_groups=<json>)`. The existing AC-1 test
that asserts "3 rows with bare email + 1 row with plus-addressed email"
was updated to drop the trailing `\)` from the regex (because there is
no longer a closing paren after the email; the line now continues with
`, role_groups=...`):

```bash
bare=$(echo "$output" | grep -cE 'operator_invite .*\(mock, email=uat-operator@aiqadam\.test' || true)
plus=$(echo "$output" | grep -cE 'operator_invite .*\(mock, email=uat-operator[+]no-user@aiqadam\.test' || true)
```

## Run command

```bash
bash scripts/run-bats.sh scripts/tests/uat-seed.bats
```

## Expected output (current run)

```
1..9
ok 1 AC-1: mock mode exits 0 and provisions all 4 operator_invite tokens
ok 2 AC-1: mock mode summary lists all four token names
ok 3 AC-1: three happy rows share the bare operator email; the no-user row is plus-addressed
ok 4 AC-5: valid-invite row carries role_groups=['aiqadam-staff']; other three rows carry []
ok 5 AC-2: uat-seed.sh has a DIRECTUS_TOKEN guard that emits a FATAL message
ok 6 AC-3: ensure_operator_invite has idempotency GET check before POST
ok 7 AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN
ok 8 AC-4: uat-env-setup.sh contains UAT_ONBOARD_USED_TOKEN
ok 9 AC-4: uat-env-setup.sh contains UAT_ONBOARD_EXPECTED_TOKEN
```

(Verified — see `07-test-results.md`.)

## What this test does NOT cover (and why)

- **Live BP-UAT-013 Step 005 against the full stack.** Out of scope per
  AGENTS.md §6.1; deferred to the next UATRunner workflow.
- **Idempotency of re-seed updating an existing row with empty
  role_groups to non-empty.** The seed script's idempotency guard
  intentionally short-circuits on existing rows. Operators must
  delete-then-reseed. This is documented in the PR description under
  "Risks." Adding a bats test for "delete then re-seed" would require
  a real (not mock) Directus instance — out of scope for this fix's
  hermetic test layer.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "AC-5 test added; existing AC-1 distribution regex updated to match the new mock-output line format. Both tests run in <2 s with no external dependencies."
```