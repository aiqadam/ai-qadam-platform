# Step 6a — Test Strategy

**Workflow:** wf-20260723-fix-127
**Issue:** ISS-USR-REG-002 (blocker, api/auth registration)
**Agent:** TestStrategist

---

## Requirement

`ISS-USR-REG-002` — `RegistrationService.register()` had three fully
unguarded external call sites (Step 2 `getUserByEmail`, Step 5
`resolveGroupNames`+`setUserGroups`, Step 8 `createRecoveryLink`) plus a
partial guard on Step 3 (`createUser`, only 4xx handled). Any of these
throwing an `AuthentikError` (extends plain `Error`, not `HttpException`)
fell through to NestJS's default exception filter as a bare, undiagnosable
`500`. CodeDeveloper has already implemented and SecurityReviewer has
already passed the fix: all four call sites now convert failures to a
consistent, non-leaking shape — Steps 2/3/5 throw
`BadRequestException('registration_failed')` (Step 5 additionally applying
the existing orphan-mitigation pattern), Step 8 logs loudly but does not
throw (registration has already fully succeeded by that point). This is a
small, well-scoped bug fix with no new endpoint and no contract change —
TestStrategist and TestDesigner are combined into a single invocation per
the Orchestrator's instruction.

---

## Rubric Score

| Criterion | Applies? | Points |
|---|---|---|
| Touches tenant-scoped data | No — no DB query added or touched | 0 |
| New API endpoint | No — `POST /v1/auth/register` already exists (ISS-USR-REG-001) | 0 |
| Business rule with edge cases (capacity, waitlist, dates) | No | 0 |
| Cross-module service call | Yes — `RegistrationService` already calls `AuthentikClient` (existing cross-module dependency; not newly introduced by this fix) | +1 |
| New database query | No | 0 |
| Pure function / utility | N/A | 0 |
| UI-only change | No | 0 |

**Total: 1 point.**

This is failure-path coverage of an **existing** method's **existing**
external dependencies — the fix adds try/catch around calls that were
already being made, it does not introduce a new call, a new query, or a
new tenant-scoped read/write. Score is well under the Integration
threshold (≥4) and the E2E threshold (≥6).

---

## Required Test Levels

- [x] Unit
- [ ] Integration (Testcontainers) — not required, score < 4, no DB/schema change
- [ ] E2E (Playwright) — not required, score < 6; live QA verification is
      separately tracked and blocked by the unrelated `deploy-qa` CI issue
      (AC-4 of `ISS-USR-REG-002`), already flagged in the impact analysis —
      not this agent's concern to resolve or defer further.

---

## Unit Test Plan

| Target | Happy Path | Failure Paths |
|---|---|---|
| `RegistrationService.register()` — Step 2 (`getUserByEmail`) | Already covered by existing "happy path" and "duplicate email" tests (unchanged) | **NEW:** `getUserByEmail` rejects → `register()` rejects with `BadRequestException('registration_failed')`; `createUser` never called (no orphan possible — nothing was created yet) |
| `RegistrationService.register()` — Step 3 (`createUser`, widened catch) | Already covered by existing "happy path" test (unchanged) | **NEW:** `createUser` rejects with a non-4xx error (5xx `AuthentikError` or plain `TypeError`) → `register()` rejects with `BadRequestException`, NOT the raw error class (pins the exact regression: pre-fix this class of error rethrew unhandled) |
| `RegistrationService.register()` — Step 5 (`resolveGroupNames`/`setUserGroups`) | Already covered by existing "happy path" test (unchanged) | **NEW:** group resolution/assignment rejects after `createUser`+`setPassword` succeed → `register()` rejects with `BadRequestException('registration_failed')`; `authentik.disableUser` called with the created user's `pk` (mirrors the existing Step-4 orphan-mitigation test shape) |
| `RegistrationService.register()` — Step 8 (`createRecoveryLink`) | Already covered by existing "happy path" test (unchanged) | **NEW:** recovery-link mint rejects after everything else (Directus link/country write) succeeds → `register()` STILL RESOLVES with the same `{ recoveryUrl: '/v1/auth/login' }` shape; `interactions.dispatch` (welcome email) NOT called |

---

## Integration Test Plan

Not required — score < 4, no DB/schema change, no new query. All four
failure paths are pure call-chain behavior on an already fully-mocked
service (`AuthentikClient`, `DirectusUsersBridgeService`, `DirectusClient`,
`InteractionsService` are all constructor-injected external clients with
zero direct Postgres/Drizzle access from this service itself — same
rationale the existing spec file's header comment already documents).

---

## E2E Test Plan

Not required — score < 6. No new user-facing flow, no contract change to
`POST /v1/auth/register`. Live verification against a real Authentik/QA
stack remains a separately-tracked, already-flagged dependency
(`deploy-qa` CI issue, AC-4 of `ISS-USR-REG-002`) — out of scope for this
test-design step.

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description |
|---|---|---|
| Step 2 failure must not leak as a bare 500; must fail closed with `BadRequestException('registration_failed')`, no orphan created | Unit | `register — duplicate-check failure (Step 2 regression)`: `getUserByEmail` rejects → `BadRequestException('registration_failed')`, `createUser` never called |
| Step 3 failure (any error class, not just 4xx) must convert to `BadRequestException`, not rethrow raw | Unit | `register — create-user failure widened to non-4xx errors (Step 3 regression)`: `createUser` rejects with 5xx/network error → rejection `instanceof BadRequestException`, not the raw error |
| Step 5 failure must trigger orphan mitigation (`disableUser`) and fail closed the same generic way | Unit | `register — group-assignment failure orphan mitigation (Step 5 regression)`: group call rejects → `BadRequestException('registration_failed')`, `disableUser` called with `pk` |
| Step 8 failure must NOT fail an already-successful registration; welcome email must be skipped | Unit | `register — recovery-link mint failure is non-fatal (Step 8 regression)`: `createRecoveryLink` rejects → `register()` resolves with the standard success shape, `interactions.dispatch` not called |

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >-
    Rubric score is 1 (only "cross-module service call" applies, and that
    dependency is pre-existing, not newly introduced) — well under both the
    Integration (>=4) and E2E (>=6) thresholds, confirming unit-only tier is
    correct for this fix. All four changed/newly-guarded failure paths
    (Steps 2, 3, 5, 8) are mapped to one planned regression unit test each,
    matching the existing spec file's established describe/it shape
    ("orphaned-account rollback" is the closest existing template for Steps
    4/5; the "happy path" and "Directus link failure" tests are the closest
    template for Step 8's non-throwing assertion style). No AC is left
    unmapped. Proceeding to TestDesigner (combined invocation).
  findings:
    - "Rubric score = 1 (cross-module service call only; the dependency itself is pre-existing, not new). No tenant-scoped data, no new endpoint, no new DB query, no business-rule edge cases — unit tests are sufficient, no Testcontainers/Playwright tier required."
    - "Mapped Steps 2, 3 (widened catch), 5, and 8 each to exactly one new regression unit test case, following the existing file's established mocking/assertion conventions (typed vi.fn() fakes, no Testcontainers)."
    - "E2E/live QA verification is out of scope for this step — already tracked separately as AC-4 of ISS-USR-REG-002, blocked on the unrelated deploy-qa CI issue, and not silently dropped (per AGENTS.md §6.1 framing already established in the impact analysis)."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```
