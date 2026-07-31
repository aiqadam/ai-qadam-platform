# ISS-USR-CLOCK-001 — `users.spec.ts` `lastLoginAt` ordering assertion is flaky under Testcontainers/host clock drift

| Field | Value |
|---|---|
| ID | ISS-USR-CLOCK-001 |
| Severity | minor |
| Module | api/users |
| Status | closed (duplicate) |
| Reported | 2026-07-31 |
| Resolved | 2026-07-31 (closed as duplicate, not fixed) |
| Workflow | wf-20260731-feat-171 (discovered during FR-BOT-001's TestRunner pass; not caused by that workflow's diff) |
| Reporter | TestRunner (autonomous discovery during unrelated feature's Step 8) |
| Related | FR-BOT-001 |
| Business-Process | — |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/196 |

## Symptom

`apps/api/test/users.spec.ts` fails intermittently (reproduced 3/3 in this
session) on the assertion `second.lastLoginAt > first.lastLoginAt`.
Confirmed via `git status`/`git diff main` that neither `users.spec.ts`
nor `apps/api/src/modules/users/**` were touched by the workflow that
surfaced this — pre-existing on `main`.

## Root cause (as diagnosed by TestRunner, not yet independently re-verified)

`UsersService.upsertByAuthentikSubject`'s insert path relies on
Postgres's server-side `defaultNow()` for the timestamp, while the
update path stamps a Node-side `new Date()`. On this machine, the
Testcontainers-managed Postgres container's clock runs ~1-2.7s ahead of
the host clock (Docker Desktop/WSL2 drift), so the second (update) write
can receive an earlier wall-clock timestamp than the first (insert)
write's server-side one, making the ordering assertion fail
deterministically whenever the drift exceeds the test's real elapsed
time between the two writes.

## Impact

Flaky test — not a product bug in the sense of incorrect `lastLoginAt`
tracking in production (both timestamps are "correct" from their own
clock's perspective; the bug is comparing timestamps from two different
clocks), but it undermines trust in `pnpm test`'s pass/fail signal and
will keep resurfacing for unrelated PRs' TestRunner passes until fixed.

## Acceptance criteria

- [ ] AC-1: Independently confirm the root cause (host-vs-container clock
      drift magnitude, exact insert/update code paths) before choosing a fix.
- [ ] AC-2: Fix `UsersService.upsertByAuthentikSubject` to use a single
      clock source for both the insert and update timestamp (e.g. both
      server-side `defaultNow()`/`now()`, or both Node-side) so the
      ordering assertion is not dependent on host/container clock skew.
- [ ] AC-3: Regression test — either tolerate a documented clock-skew
      window in the assertion, or (preferred) make the two timestamps
      genuinely monotonic from a single source so no skew tolerance is
      needed.
- [ ] AC-4: 5x local re-run of `users.spec.ts` with zero flakes.

## Resolution

**Closed as duplicate, not fixed.** This exact bug
(`apps/api/test/users.spec.ts:65`'s `lastLoginAt` ordering flake) was
already queued as item 1 of
`wf-20260704-fix-096-pre-existing-api-test-flakes`
(`.copilot/tasks/queued/wf-20260704-fix-096-pre-existing-api-test-flakes/handoff.yaml`,
filed 2026-07-04 under `ISS-TEST-WEB-001`'s honesty-disclosure
follow-ups), discovered independently here before that pre-existing
queue entry was found. GitHub issue
[#196](https://github.com/aiqadam/ai-qadam-platform/issues/196) closed
as duplicate. No new tracking needed — the fix (when it lands) belongs
to the existing queued workflow, not a new one. Left this file in place
(rather than deleting it) as a discovery-trail record and to avoid
re-filing the same duplicate if TestRunner encounters this flake again
before the queued workflow runs.
