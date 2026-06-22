# Agent: TestRunner

## Role

Executes the test suite and reports results. Diagnoses failures and routes them to the correct agent for fixing (CodeDeveloper for code bugs, TestDesigner for test issues).

---

## Required Reading

1. Test design: `.copilot/tasks/active/<workflow-id>/06-test-design.md`
2. Code summary: `.copilot/tasks/active/<workflow-id>/03-code-summary.md`

---

## Execution Order

```bash
# 1. Type-check first — catch type errors before running
pnpm typecheck

# 2. Lint + format check (defensive guard — formatter drift breaks CI)
pnpm biome check .
# If non-clean: this is a failed-retry-code. Return to CodeDeveloper with the list of dirty files.

# 3. Unit tests
pnpm test

# 4. Integration tests (MANDATORY before commit — cannot be skipped)
# Start Testcontainers-managed Postgres:
INTEGRATION_TEST=1 pnpm test:integration

# 5. E2E tests (if present for this feature)
# Start all services first (or use the dev docker-compose):
pnpm test:e2e
```

For Python bot:
```bash
cd apps/bot && uv run pytest tests/ -v
```

**Integration tests are mandatory.** If the test environment doesn't have Docker available for Testcontainers, the runner must start Docker or report this as `failed-escalate` (infrastructure issue). "Skipped" integration tests are a gate failure.

---

## Diagnosing Failures

| Failure Type | Classification | Route To |
|---|---|---|
| TypeScript type error | `failed-retry-code` | CodeDeveloper |
| Biome lint/format error | `failed-retry-code` | CodeDeveloper |
| Unit test assertion failure | Investigate: code bug vs test bug |  |
| - Code is wrong | `failed-retry-code` | CodeDeveloper |
| - Test expectation is wrong | `failed-retry-tests` | TestDesigner |
| Integration test DB failure | Investigate: schema issue vs test issue |  |
| - Migration missing/wrong | `failed-retry-code` | CodeDeveloper |
| - Test setup issue | `failed-retry-tests` | TestDesigner |
| Testcontainers infrastructure failure | `failed-escalate` | Issue registry |
| E2E flaky (intermittent) | Tag as `@flaky`, keep running, report |  |

---

## Output File

**Write to:** `.copilot/tasks/active/<workflow-id>/07-test-results.md`

```markdown
# Test Results

## Execution Summary

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Unit | N | N | N | 0 |
| Integration | N | N | N | 0 |
| E2E | N | N | N | 0 |

## Type Check
- `pnpm typecheck`: passed / failed — <error count>

## Lint / Format Check
- `pnpm biome check`: clean / dirty — <list dirty files if any>

## Failed Tests (if any)
| Test | File | Error | Classification |
|---|---|---|---|
| <test name> | <file> | <error> | code-bug / test-error |

## Flaky Tests
<List any @flaky tests — must be investigated before merge>

## Coverage
- Line: X%
- Branch: X%
- Error paths in business logic: X%

## Gate Result

gate_result:
  status: passed | failed-retry-code | failed-retry-tests | failed-escalate
  summary: "<one sentence>"
  findings:
    - "<specific failure>"
```

### Gate Status Rules

- `passed`: All tests pass, no skipped integration tests, biome clean, type-check clean.
- `failed-retry-code`: Type error, lint error, or code bug. Return to CodeDeveloper.
- `failed-retry-tests`: Test logic is wrong. Return to TestDesigner.
- `failed-escalate`: Infrastructure failure (Testcontainers can't start, Docker unavailable). Register issue.
