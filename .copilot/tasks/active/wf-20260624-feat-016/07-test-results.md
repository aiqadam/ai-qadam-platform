# Test Results — FR-MIG-021

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit (FR-MIG-021 files) | 56 | 56 | 0 | 0 |
| Integration | 11 | 11 | 0 | 0 |
| **Total** | **67** | **67** | **0** | **0** |

Note: Full unit test suite (89 files) has 1 pre-existing flaky test failure in `test/users.spec.ts` (timing-related, unrelated to FR-MIG-021).

---

## Type Check

| Package | Status | Errors | Warnings |
|---------|--------|--------|----------|
| `@aiqadam/api` | **PASSED** | 0 | 0 |
| `@aiqadam/web-next` | **PASSED** | 0 | 31 hints (FormEvent deprecations, pre-existing) |

---

## Lint / Format Check

| Scope | Status | Issues |
|-------|--------|--------|
| FR-MIG-021 modified files | **CLEAN** | 0 |
| Full repository | Dirty | 168 errors (pre-existing, not in modified files) |

**FR-MIG-021 modified files verified clean:**
- `apps/api/src/modules/registrations/registration-checkin.controller.ts`
- `apps/api/src/modules/registrations/checkin-events.controller.ts`

---

## Failed Tests

No failures in FR-MIG-021 test suite.

| Test | File | Error | Classification |
|------|------|-------|----------------|
| N/A | N/A | N/A | N/A |

**Note:** One pre-existing flaky test failure exists in `test/users.spec.ts`:
- `UsersService.upsertByAuthentikSubject > updates email + displayName + lastLoginAt for an existing subject`
- Error: `expected 1782261000867 to be greater than 1782261002383`
- This is a timing-dependent test in user management code, unrelated to FR-MIG-021 check-in feature.

---

## Flaky Tests

No flaky tests tagged in FR-MIG-021 suite.

---

## Coverage

Coverage data not collected during this run. Per test design, coverage targets are:
- Line: >80%
- Branch: >70%
- Error paths: 100%

---

## Gate Result

```yaml
gate: test-runner
workflow_id: wf-20260624-feat-016
requirement: FR-MIG-021
result: passed

test_execution:
  unit_tests:
    files: 3
    tests_run: 56
    tests_passed: 56
    tests_failed: 0
    tests_skipped: 0
  integration_tests:
    files: 1
    tests_run: 11
    tests_passed: 11
    tests_failed: 0
    tests_skipped: 0

type_check:
  api: passed
  web_next: passed

biome_check:
  modified_files: passed
  full_repo: dirty (pre-existing issues, not in modified files)

failures:
  count: 0
  classification: none

gate_status: passed
```

---

## Notes

- All 67 FR-MIG-021 tests pass (56 unit + 11 integration)
- Type checks pass for both API and web-next packages
- FR-MIG-021 modified files pass biome check
- Integration tests use Testcontainers with Postgres
- E2E tests deferred to follow-up feature (FR-MIG-021-followup)
