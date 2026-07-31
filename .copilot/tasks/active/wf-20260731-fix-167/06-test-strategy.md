# Step 6/7: Test Strategy + Design

**Workflow:** wf-20260731-fix-167

## Strategy

Unit-level regression tests in `apps/web-next/src/lib/cms.test.ts`
(existing file, local re-implementation convention — no new test file
needed). Required: at least one test that fails against the pre-fix
`fetchEvent()` (no second arg to `toApiEvent`) and passes against the fix.

## Cases added

1. **Under-capacity**: `registeredCountOf` returns 3 → `result.registeredCount === 3`.
2. **At-capacity**: `registeredCountOf` returns 2, `capacity: 2` → asserts
   `registeredCount === 2` AND the exact `capacity != null && registeredCount >= capacity`
   expression `RegistrationCTA.tsx` uses for `isFull`.
3. **Query shape**: asserts the second `mockFetch` call targets
   `/items/registrations` with `filter[event][_eq]`, `filter[status][_in]=registered,attended`,
   `aggregate[count]=id`.
4. **Failure fallback**: count query rejects → `fetchEvent` still resolves
   (not null), `registeredCount === 0` (graceful degradation, not a
   whole-page failure).

6 pre-existing tests that reach `fetchEvent`'s happy path (published +
matching country) were updated to also mock the second (count) fetch
call, since `fetchEvent` now makes two Directus calls instead of one.

## Fail-before / pass-after proof

Verified directly (not just asserted): temporarily reverted the test
file's local `fetchEvent` re-implementation to the pre-fix
`return toApiEvent(body.data)` (no second arg) form, re-ran the suite —
3 of the 4 new tests failed with the exact expected mismatch
(`expected +0 to be 3`, `expected +0 to be 2`, and a `mock.calls[1]`
undefined error since no second fetch call is made pre-fix). Restored the
fix; all 36/36 tests in the file pass.

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T07:17:00Z"
  summary: "4 new regression cases + 6 updated existing cases; fail-before/pass-after directly verified by temporary revert."
