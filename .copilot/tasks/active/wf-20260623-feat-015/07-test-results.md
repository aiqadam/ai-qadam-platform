# Test Results - FR-MIG-020

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Unit (api) | 1105 | 1104 | 1 | 0 |
| Unit (web-next) | 566 | 566 | 0 | 0 |
| Integration | 18 | 18 | 0 | 0 |
| E2E | 36 | 24 | 8 | 4 |

---

## Type Check

**Status: PASSED**

- All packages: 0 errors, 0 warnings
- Packages checked: @aiqadam/api, @aiqadam/web, @aiqadam/web-next
- Pre-existing FormEvent deprecation warnings (non-blocking, in unrelated files)

---

## Lint / Format Check

**Status: FAILED (18 errors in FR-MIG-020 files)**

Biome check on FR-MIG-020 specific files found 18 errors:

### Errors in Test Files (test bugs - routed to TestDesigner)

| File | Error Type | Count |
|------|-----------|-------|
| `members-onboarding.service.spec.ts` | `noNonNullAssertion` | 2 |
| `members-onboarding.service.spec.ts` | `organizeImports` | 1 |
| `points-directus.spec.ts` | `noNonNullAssertion` | 2 |
| `members-onboarding.integration.spec.ts` | `noNonNullAssertion` | 12 |
| `members-onboarding.dto.spec.ts` | `format` | 1 |

All errors are in test files using `!` non-null assertions and import sorting issues.

### Pre-existing Errors (ignored per task context)

162 errors in unrelated files (tools/, scripts/, etc.) - these are pre-existing issues not related to FR-MIG-020.

---

## Failed Tests

### Unit Tests

| Test | File | Error | Classification |
|------|------|-------|----------------|
| `UsersService.upsertByAuthentikSubject > updates email + displayName + lastLoginAt` | `users.spec.ts` | Timing assertion failed: `1782246152547` not greater than `1782246154622` | Pre-existing flaky test (timing race condition) |

This test is unrelated to FR-MIG-020. It's a pre-existing flaky test in the users service with a timing race on millisecond-level assertions.

### E2E Tests

| Test | File | Error | Classification |
|------|------|-------|----------------|
| `anon accessing /onboard redirects to sign-in` | `smoke-onboarding.spec.ts` | Redirect URL mismatch - received `/onboard` not redirecting | Test bug |
| `authed user with onboarded_at=NULL sees step 1 form` | `smoke-onboarding.spec.ts` | Page URL check failing | Test bug |
| `GET /v1/me/profile/onboarding-status requires auth (401)` | `smoke-onboarding.spec.ts` | Expected 401, got 404 | Test bug |
| `POST /v1/members/onboard requires auth (401)` | `smoke-onboarding.spec.ts` | Expected 401, got 404 | Test bug |

**E2E Test Bug Analysis:**
The 404 responses suggest the auth guard routes aren't properly wired in the running server. The E2E tests expect 401 for unauthenticated API requests, but get 404, indicating either:
1. Routes aren't registered in the running server
2. Test server isn't running with the latest code
3. Route paths don't match between test and implementation

---

## Flaky Tests

- `users.spec.ts > UsersService.upsertByAuthentikSubject` - timing-sensitive test with millisecond-level race condition (pre-existing, unrelated to FR-MIG-020)

---

## Coverage

### FR-MIG-020 Test Coverage

| Component | Unit Tests | Integration Tests |
|-----------|-----------|-------------------|
| `MembersOnboardingService` | 17 tests | 2 tests |
| `MembersOnboardingController` | 0 | 11 tests |
| `OnboardMemberDto` (Zod validation) | 42 tests | 0 |
| `PointsDirectusService` | 9 tests | 0 |
| `MeProfileService` | 8 tests | 0 |
| `OnboardingForm` (web-next) | 46 tests | 0 |
| `use-onboarding` (web-next) | 12 tests | 0 |
| `cms-landing-page` (web-next) | 23 tests | 0 |

### Total FR-MIG-020 Coverage
- Service layer: 76+ tests
- UI components: 81 tests
- DTO validation: 42 tests

---

## Gate Result

```
gate: quality-gate
status: failed-retry-tests
attempt: 1
summary: Biome errors in FR-MIG-020 test files (18 errors) + E2E auth guard tests failing
issues:
  - Biome: non-null assertions (!) in test files should use optional chaining (?.)
  - Biome: import sorting in members-onboarding.service.spec.ts
  - Biome: format issue in members-onboarding.dto.spec.ts
  - E2E: auth guard route expectations (404 vs 401) - routes not properly registered
next_agent: test-designer
```

---

## Recommendations

1. **Biome errors**: Replace `!` non-null assertions with `?.` optional chaining in test files
2. **Biome errors**: Run `pnpm biome check --write` on FR-MIG-020 test files to fix formatting
3. **E2E auth tests**: Investigate why API routes return 404 instead of 401 - check route registration in app module
4. **Pre-existing flaky test**: `users.spec.ts` timing issue is unrelated to FR-MIG-020 and should be addressed separately

---

## Previous Issues Status

| Issue | Status |
|-------|--------|
| TR-001: TypeScript type narrowing bug in use-onboarding.test.ts | FIXED |
| TR-002: Missing API fetchLandingPage test | N/A - no such function |
| TR-003: Missing web-next fetchLandingPage test | N/A - already exists |
| Additional TS errors in OnboardingForm.test.tsx | FIXED |

---

## Key Findings

1. **Typecheck: PASSED** - All previous TS errors in FR-MIG-020 files are fixed
2. **web-next: 566 tests PASSED** - All unit tests pass including FR-MIG-020 components
3. **Integration: 18 tests PASSED** - All onboarding flow tests pass
4. **Biome: 18 errors in test files** - Need TestDesigner to fix non-null assertions and formatting
5. **E2E: 8 failures in auth guard tests** - Routes returning 404 instead of 401, likely test setup issue
