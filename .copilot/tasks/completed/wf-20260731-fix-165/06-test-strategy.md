# Step 6/7 — Test Strategy + Design

## Regression test anchor (required: fails before fix, passes after)

Added to the existing `apps/api/test/registrations-directus.spec.ts`
(no new file needed — a spec for this service already exists):

1. **"polls past a stale first re-read to catch a delayed capacity-flow
   demotion"** — mocks the re-read GET to return `registered` on the 1st
   call and `waitlisted` on the 2nd (path-routed `mockImplementation`, so
   it's immune to the unrelated `maybeFireFirstEventWelcome` GET calls
   interleaving on the same fake). Asserts the final view is `waitlisted`
   and exactly 2 re-reads happened. **Fail-before/pass-after verified
   directly**: stashed the fix, ran this test, got
   `expected 'registered' to be 'waitlisted'` (byte-for-byte the live bug
   from the issue's screenshot evidence); restored the fix, test passes.

2. **"gives up after the poll bound and returns the last-read status
   honestly"** — every re-read returns `registered` (flow never demotes,
   the overwhelmingly common case). Asserts the loop is bounded at
   exactly `SETTLE_POLL_MAX_ATTEMPTS` (3) re-reads, not unbounded, and the
   final status is the honestly-observed `registered` (no silent
   failure/hang). Also fail-before/pass-after verified (pre-fix:
   `expected 1 to be 3` — proves the old code never polled at all).

## Existing coverage preserved

The pre-existing "creates a new registration and returns the settled
(post-flow) row" test (mocks a single `waitlisted` re-read) still passes
unmodified — the poll loop exits after 1 iteration when the first read
already reflects the flow's patch, so behavior for the already-covered
non-race path is unchanged.

## Execution

- `test/registrations-directus.spec.ts`: 33/33 pass.
- Full `apps/api` suite: 1355/1356 pass. 1 failure
  (`test/users.spec.ts:65`, `upsertByAuthentikSubject` clock-race) is the
  same pre-existing, already-tracked flake documented in
  `workspace-state.md` (`wf-20260704-fix-096-pre-existing-api-test-flakes`,
  queued, not yet picked up) — re-ran in isolation, passes; unrelated file,
  unrelated code path.
- `tsc --noEmit`: clean.
- `biome check`: clean.

## Gate

`passed` → Step 8 (Execute Tests — already run above as part of
authoring the fail-before/pass-after proof; results stand).
