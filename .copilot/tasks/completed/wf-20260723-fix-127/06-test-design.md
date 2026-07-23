# Step 6b — Test Design

**Workflow:** wf-20260723-fix-127
**Issue:** ISS-USR-REG-002 (blocker, api/auth registration)
**Agent:** TestDesigner

---

## Tests Written

### Unit

| File | Count/Focus | Required? |
|---|---|---|
| `apps/api/test/registration-service.spec.ts` | +6 new tests across 4 new `describe` blocks, added to the existing 8-test file (no new file created, per instructions): <br>• `register — duplicate-check failure (Step 2 regression, ISS-USR-REG-002)` (1 test) <br>• `register — create-user failure widened to non-4xx errors (Step 3 regression, ISS-USR-REG-002)` (2 tests: 5xx `AuthentikError`, and a raw `TypeError`) <br>• `register — group-assignment failure orphan mitigation (Step 5 regression, ISS-USR-REG-002)` (2 tests: `resolveGroupNames` failure, `setUserGroups` failure) <br>• `register — recovery-link mint failure is non-fatal (Step 8 regression, ISS-USR-REG-002)` (1 test) | Yes |

File total: 14 tests (8 pre-existing, unmodified + 6 new), 0 skipped.

### Integration

None — not required per `06-test-strategy.md` (rubric score 1, no DB/schema touch).

### E2E

None — not required per `06-test-strategy.md` (rubric score 1; live QA verification separately tracked/blocked per AC-4 of `ISS-USR-REG-002`, not this step's concern).

---

## Implementation Notes

- Followed the existing file's conventions exactly: typed `vi.fn()` fakes
  (`FakeAuthentik` etc.), `beforeEach` resetting all mocks to their
  happy-path defaults, AAA structure with `// Arrange` / `// Act` /
  `// Assert` comments, `describe` block names phrased as the regression
  being guarded, `.mockRejectedValueOnce(...)` for one-shot failure
  injection, and asserting on `err instanceof BadRequestException` +
  `.message` via a `.catch((err: unknown) => err)` promise capture — the
  exact pattern already used by the "orphaned-account rollback" blocks.
- Added `AuthentikError` as a new import (value import, separate from the
  existing `import type { AuthentikClient, AuthentikUser }` line) to
  construct realistic 4xx/5xx failures — mirrors
  `admin-invites-service.spec.ts`'s identical two-line import split for
  the same module, which is this repo's established convention for
  mixing a value import and `import type` from one path.
- Step 3's regression is covered by **two** tests, not one, to satisfy the
  "would have failed before the fix" framing precisely: a 5xx
  `AuthentikError` (still an `AuthentikError`, but previously would have
  been the raw class since only `status` in `[400,500)` converted before)
  and a plain `TypeError` (a raw network/transport failure with no
  `AuthentikError` wrapper at all) — both assert the rejection
  `instanceof BadRequestException` and explicitly `not.toBeInstanceOf(AuthentikError)`
  for the first case, pinning the exact "raw error leaked" regression the
  task called out.
- Step 5 is covered by two tests (one for the `resolveGroupNames` leg, one
  for the `setUserGroups` leg) since both calls sit inside the same
  try/catch and are equally reachable failure points; both assert
  `authentik.disableUser` was called with `AK_USER.pk`, mirroring the
  existing Step-4 orphan test's assertion shape verbatim.
- Step 8's test asserts the full non-throwing contract: `register()`
  resolves (not rejects) with the exact `{ recoveryUrl: '/v1/auth/login' }`
  shape every other success/duplicate/honeypot path already returns, and
  `interactions.dispatch` was never called (proving the welcome email was
  correctly skipped because `recoveryUrl` stayed `null`) — while also
  confirming the calls *before* the failure point (`setUserGroups`,
  `directus.patch`) did complete, proving the earlier successful work
  wasn't discarded.
- No `it.skip`, no `any` introduced, no shared mutable state — every test
  relies solely on `beforeEach`'s fresh fixtures plus its own
  `mockRejectedValueOnce`/`mockResolvedValueOnce` overrides.

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| Step 2 (`getUserByEmail`) failure converts to `BadRequestException('registration_failed')`, no orphan created | `register — duplicate-check failure (Step 2 regression, ISS-USR-REG-002)` | Covered |
| Step 3 (`createUser`) widened catch converts ANY error (not just 4xx) to `BadRequestException`, not the raw error | `register — create-user failure widened to non-4xx errors (Step 3 regression, ISS-USR-REG-002)` (2 tests) | Covered |
| Step 5 (`resolveGroupNames`/`setUserGroups`) failure triggers `disableUser` orphan mitigation + `BadRequestException('registration_failed')` | `register — group-assignment failure orphan mitigation (Step 5 regression, ISS-USR-REG-002)` (2 tests) | Covered |
| Step 8 (`createRecoveryLink`) failure does NOT throw; registration still resolves; welcome email skipped | `register — recovery-link mint failure is non-fatal (Step 8 regression, ISS-USR-REG-002)` | Covered |
| Pre-existing 8 tests remain passing, unmodified | Full suite run (`pnpm --filter api test registration-service`) | Covered — 14/14 pass |

---

## Known Test Gaps

None. All four ACs mapped in `06-test-strategy.md` have a corresponding
test, all pass, no `TODO`/`it.skip` left in the file. Live/QA-level
verification remains a separately-tracked, already-flagged dependency
(AC-4 of `ISS-USR-REG-002`, blocked on the unrelated `deploy-qa` CI issue)
— out of scope for unit-level TestDesigner work.

---

## Verification Run

- `pnpm --filter api test registration-service` → **14 passed (14)**, 0 failed, 0 skipped (8 pre-existing + 6 new).
- `pnpm --filter api typecheck` → clean, exit 0, no errors.
- `pnpm biome check --apply apps/api/test/registration-service.spec.ts` → `Checked 1 file. No fixes applied.`
- `pnpm --filter api lint` (full package) → `Checked 295 files. No fixes applied.`

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >-
    Added 6 new regression unit tests across 4 new describe blocks to the
    existing apps/api/test/registration-service.spec.ts (no new file
    created), covering all four Steps (2, 3, 5, 8) identified by
    06-test-strategy.md. Each test pins the specific NEW behavior (exact
    BadRequestException class/message, or exact non-throwing resolve shape
    plus a not-called assertion on interactions.dispatch) so it would fail
    against the pre-fix code: Step 2 and Step 3's tests explicitly assert
    `instanceof BadRequestException` (Step 3 additionally asserts
    `not.toBeInstanceOf(AuthentikError)`) rather than merely asserting a
    rejection occurred, since pre-fix these paths rejected with the raw,
    uncaught AuthentikError/TypeError instead. Followed the existing file's
    conventions exactly: typed vi.fn() fakes, beforeEach fixture reset, AAA
    comment structure, .catch((err) => err) rejection-capture pattern
    already used by the "orphaned-account rollback" blocks, and the same
    disableUser-call assertion shape for the two new Step 5 orphan-
    mitigation tests. Full suite run: 14/14 passing (8 pre-existing,
    unmodified + 6 new), 0 skipped. pnpm --filter api typecheck clean
    (exit 0). pnpm biome check --apply on the test file: no fixes needed.
    pnpm --filter api lint (full package, 295 files): no fixes needed.
  findings:
    - "register — duplicate-check failure (Step 2): getUserByEmail rejects with a 401 AuthentikError -> BadRequestException('registration_failed'); createUser/setPassword/ensureLinkedByEmail/dispatch all confirmed never called."
    - "register — create-user failure widened to non-4xx errors (Step 3): two tests, a 503 AuthentikError and a raw TypeError('fetch failed'), both assert rejection instanceof BadRequestException (first test also asserts NOT instanceof AuthentikError) — pins the exact 'raw error leaked' regression this fix closes."
    - "register — group-assignment failure orphan mitigation (Step 5): two tests (resolveGroupNames failure, setUserGroups failure), both assert BadRequestException('registration_failed') AND authentik.disableUser called with AK_USER.pk, mirroring the existing Step-4 orphan test's assertion shape exactly."
    - "register — recovery-link mint failure is non-fatal (Step 8): createRecoveryLink rejects with a 503 AuthentikError -> register() STILL RESOLVES with {recoveryUrl: '/v1/auth/login'}; interactions.dispatch confirmed never called; prior steps (setUserGroups, directus.patch) confirmed to have completed."
    - "Import convention followed: AuthentikError added as a plain value import, kept on its own line separate from the pre-existing `import type { AuthentikClient, AuthentikUser }` line, matching admin-invites-service.spec.ts's identical split for the same module."
    - "No it.skip, no any, no shared mutable state introduced. All assertions rely only on beforeEach's fresh fixtures plus per-test mockRejectedValueOnce/mockResolvedValueOnce overrides."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```
