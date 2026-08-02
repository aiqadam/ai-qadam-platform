# ISS-API-TELEGRAM-ROLE-001 — `apps/api/test/telegram-auth-service.spec.ts` pre-existing failures: `toEqual` assertions missing the `role` field added to `TelegramAuthService.lookupUser()`'s response by FR-BOT-003 (PR #220, commit `639467b`)

| Field | Value |
|---|---|
| ID | ISS-API-TELEGRAM-ROLE-001 |
| Severity | bug |
| Module | api/auth (Telegram auth) |
| Status | open |
| Reported | 2026-08-02 |
| Resolved | — |
| Workflow | wf-20260802-fix-195 (queued) |
| Reporter | Orchestrator (discovered via PR #237 `ci-cd` build log on top of `origin/main`) |
| Related | FR-BOT-003, ISS-EVT-LIFECYCLE-TAB-001, WF-EVT-LIFECYCLE-TAB-001 |
| Business-Process | — |
| GitHub-Issue | (to be created) |

## Symptom

`apps/api/test/telegram-auth-service.spec.ts` has 3 `expect(result).toEqual({ … })`
assertions that fail on `origin/main` (after FR-BOT-003 / PR #220 / commit
`639467b` was merged):

```text
build   Test    2026-08-02T04:30:29.8418425Z
  AssertionError: expected { directusUserId: 'dir-user-11', …(3) } to deeply equal { directusUserId: 'dir-user-11', …(2) }
  ❯ test/telegram-auth-service.spec.ts:371:20
build   Test    2026-08-02T04:30:29.8428729Z
  AssertionError: expected { directusUserId: null, …(3) } to deeply equal { directusUserId: null, …(2) }
  ❯ test/telegram-auth-service.spec.ts:384:20
build   Test    2026-08-02T04:30:29.8437892Z
  AssertionError: expected { directusUserId: 'dir-user-33', …(3) } to deeply equal { directusUserId: 'dir-user-33', …(2) }
  ❯ test/telegram-auth-service.spec.ts:402:20
```

The "extra" object key is `role: null` (a field added by
`apps/api/src/modules/auth/telegram-auth.service.ts` line 660 via
`role: deriveRoleFromGroups(authentikUser.groups_obj)`).

The 3 affected assertions at lines 371, 384, 402 read:

```ts
// line 371
expect(result).toEqual({ directusUserId: 'dir-user-11', isTemp: false, country: 'kz' });
// line 384
expect(result).toEqual({ directusUserId: null, isTemp: true, country: null });
// line 402
expect(result).toEqual({ directusUserId: 'dir-user-33', isTemp: true, country: 'tj' });
```

Each is missing `role: <expected-value>`. Since `expect.toEqual`
requires exact key-set equality (`Object.is`), the new `role` key
breaks all three.

## Impact

- The `ci-cd` `build` job's `Test` step fails on every push to `main`
  and every PR after FR-BOT-003 was merged (2026-08-01). `deploy-qa`
  is skipped (`needs: build`); `deploy-prod` (manual workflow_dispatch)
  is unaffected.
- The user has opted out of CI as a gate (`AGENTS.md §6.3`), so this
  is not blocking merges — but the failure is real, pre-existing (test
  gap introduced by PR #220 itself, not surfaced at the time), and
  every succeeding CI run consumes compute + pollutes logs with the
  same noise.
- The wider test class "Test Files 1 failed | 119 passed (120) / Tests
  3 failed | 1543 passed (1546)" on PR #237 demonstrates that this
  failure was already present on `origin/main` HEAD `376d08d` (the
  lifecycle-tab test failed first, terminating the run before the api
  tests could surface their failure).

## Root cause

FR-BOT-003 (PR #220) intentionally added `role` to the public shape
of `TelegramAuthService.lookupUser()` so the bot runtime can apply
the role gate. The implementation change is correct and matches the
FR spec; the 3 unit-test expectations in `telegram-auth-service.spec.ts`
were simply not updated in the same PR. This is a known-recurrent
test-shape pattern in the repo (cf. ISS-USR-CLOCK-001, the
`wf-20260704-fix-096-pre-existing-api-test-flakes` queue).

## Acceptance criteria

- [ ] AC-1: `apps/api/test/telegram-auth-service.spec.ts` lines 371,
      384, 402 are updated so the `.toEqual()` expectations match the
      real `lookupUser()` response shape including `role`.
- [ ] AC-2: All `apps/api` tests pass:
      `pnpm --filter @aiqadam/api test` exits 0; no other regressions
      surface across the API suite (1546 tests expected).
- [ ] AC-3: Full repo test suite still passes:
      `pnpm test` exits 0 with no other regressions across all
      workspaces.
- [ ] AC-4: `ci-cd` `build` job on the resulting PR exits with all
      steps green.

## Honesty disclosure

This issue's AC-4 closure depends on a clean `apps/api` test run on
the resulting PR. If the fix requires touching any of the other
`apps/api` modules beyond the test file (e.g. to fix a real
production bug uncovered along the way), the workflow is responsible
for handling that within `wf-20260802-fix-195` itself — not here.

## Resolution

(filled at workflow close)
