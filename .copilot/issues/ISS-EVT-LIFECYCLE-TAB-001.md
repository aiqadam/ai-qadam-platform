# ISS-EVT-LIFECYCLE-TAB-001 — `event-lifecycle-tab.test.ts` failing on main: deriveDefaultTab() returns 'finished' when only startsAt is unparseable, test expects 'upcoming'

| Field | Value |
|---|---|
| ID | ISS-EVT-LIFECYCLE-TAB-001 |
| Severity | bug |
| Module | web-next/events |
| Status | open |
| Reported | 2026-08-02 |
| Resolved | — |
| Workflow | wf-20260802-fix-194 |
| Reporter | Orchestrator (post-merge CI failure on `main` after PR #236) |
| Related | FR-EVT-004, ISS-EVT-004-1, BP-UAT-010 |
| Business-Process | — |
| GitHub-Issue | (to be created) |

## Symptom

`apps/web-next/src/lib/event-lifecycle-tab.test.ts` has been failing on `main`
for the case "degrades to 'upcoming' when only startsAt is unparseable".
The current behavior in `apps/web-next/src/pages/events/[id].astro`
(lines 105-110, the inline `defaultTab` derivation) returns
`'finished'`; the test expects `'upcoming'`. The `ci-cd` `build` job's
`Test` step consequently fails on `main` (run 30731579324, 2026-08-02)
and blocks the `deploy-qa` job.

```text
build   Test    2026-08-02T04:01:55Z
  ❯ src/lib/event-lifecycle-tab.test.ts (9 tests | 1 failed)
     × degrades to "upcoming" when only startsAt is unparseable
  FAIL  src/lib/event-lifecycle-tab.test.ts > lifecycle-tab default
        derivation — malformed date defensive fallback > degrades to
        "upcoming" when only startsAt is unparseable
  AssertionError: expected 'finished' to be 'upcoming'
  ❯ src/lib/event-lifecycle-tab.test.ts:112:20
```

## Impact

- The `ci-cd` `build` job fails on every push to `main` and every PR
  against `main`. `deploy-qa` is skipped (it `needs: build`).
  `deploy-prod` is unaffected (manual workflow_dispatch).
- The user has opted out of CI as a gate (`AGENTS.md §6.3`), so this is
  not blocking merges — but the failure is real, pre-existing (it
  existed before PR #236), and indicates the Astro page's lifecycle-tab
  derivation does not match the spec the unit test asserts.

## Root cause

`deriveDefaultTab(now, startsAt, endsAt)` (re-implemented in
`event-lifecycle-tab.test.ts` to mirror the page's logic verbatim) is:

```ts
const startsAtMs = Date.parse(startsAt);
const endsAtMs = Date.parse(endsAt);
return now >= endsAtMs ? 'finished' : now >= startsAtMs ? 'live' : 'upcoming';
```

When `startsAt` is unparseable:
- `startsAtMs = NaN`
- `Date.now()` is `2026-08-02T...Z`, which is well past
  `endsAtMs = Date.parse('2026-08-01T14:00:00.000Z')`
- So `now >= endsAtMs` is `true` → returns `'finished'`

The test (lines 109-113) expects `'upcoming'` for this case — a
defensive-fallback spec authored in `wf-20260730-feat-155` (PR #150)
for FR-EVT-004. The Astro page's logic was never updated to match
that spec; the inline conditional there today is byte-identical to the
buggy implementation the test was written to catch.

The page logic also has a related inconsistency: when `endsAt` is
unparseable and `now` is past `startsAt`, the test expects `'live'`
(case "endsAt-only bad + now past startsAt → live"); the page
correctly returns `'live'` for that case because `now >= NaN` is
`false`, so the 'finished' branch is skipped and the 'live' branch
evaluates normally. The page logic happens to satisfy that test case
already.

## Acceptance criteria

- [ ] AC-1: `apps/web-next/src/pages/events/[id].astro`'s inline
      `defaultTab` derivation is updated so that, when `startsAt` is
      unparseable, the result is `'upcoming'` (not `'finished'`).
- [ ] AC-2: All 9 tests in `event-lifecycle-tab.test.ts` pass
      locally: `pnpm --filter @aiqadam/web-next test
      src/lib/event-lifecycle-tab.test.ts` exits 0.
- [ ] AC-3: Full `apps/web-next` test suite still passes:
      `pnpm --filter @aiqadam/web-next test` exits 0 with no other
      regressions.
- [ ] AC-4: `ci-cd` `build` job on the resulting PR exits with all
      steps green (Lint, Typecheck, Build, Test, both Docker image
      builds).

## Resolution

(filled at workflow close)