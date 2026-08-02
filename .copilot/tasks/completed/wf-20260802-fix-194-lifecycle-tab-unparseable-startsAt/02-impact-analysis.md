# Step 2 — Impact Analysis

**Workflow:** wf-20260802-fix-194
**Step:** 2 — Impact Analysis
**Date:** 2026-08-02

## Surface affected

| File | Purpose | Current state | Change scope |
|---|---|---|---|
| `apps/web-next/src/pages/events/[id].astro` (lines 105-117) | Inline `defaultTab` derivation that drives the page's `?tab=`-routed lifecycle tab (upcoming / live / finished / forum) | 3-line ternary with no `NaN` guard | Add `Number.isNaN(...)` guards so an unparseable `startsAt` cannot trigger a false `'finished'` verdict |
| `apps/web-next/src/lib/event-lifecycle-tab.test.ts` | Unit-test mirror of the page logic (Vitest cannot import `.astro` frontmatter — re-implemented as a pure function in-file) | Local `deriveDefaultTab` re-implements the page's buggy ternary | Update the local mirror to match the corrected page logic (with the new contract documented in the comment) |

## Out-of-scope (verified unaffected)

- `apps/api/**` — no change. The `apps/api` test failures observed
  during full-monorepo `pnpm test` are pre-existing flakes
  (`test/users.spec.ts` clock-ordering, tracked as `ISS-USR-CLOCK-001`),
  not regressions from this branch.
- `apps/web/**` — no change.
- `apps/web-next/src/lib/event-lifecycle-tab.test.ts` other tests —
  the contract change only affects the "startsAt-only bad"
  case; the 4 well-formed-date cases and the 3 other
  malformed-date cases still produce the same result.
- Design system — no change.
- `.github/workflows/**` — no change (the workflow itself is correct;
  it's the test that was failing).

## Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Real user sees a different default tab for a malformed-data event | Low (events with unparseable startsAt are rare — would only arise from a data-quality issue in Directus) | The fallback is `'upcoming'`, the most permissive state — the page renders whatever info the event has without forcing the user to a recordings/recap view |
| Other tests regress | Low | Full `apps/web-next` suite: 40 files / 1017 tests pass after the change; only the targeted 9 in `event-lifecycle-tab.test.ts` were touched |
| Page logic drifts from the test mirror again in the future | Low–Medium | Both files now have an explicit reference to `ISS-EVT-LIFECYCLE-TAB-001` and identical contract comments documenting the defensive-fallback rules |
| Production deploy triggered prematurely | None | This is a documentation-and-test fix to the existing logic; the Astro page behavior only changes in the malformed-data fallback case |

## Honesty disclosures (per AGENTS.md §6.1)

- **Pre-existing drift in `origin/main`** (NOT introduced by this
  branch): the Step 0.5 context-sync script reports
  `MISSING: ISS-PUB-POLICY-UUID-PIN-001 (status='open') has no
  GitHub-Issue link`. That issue is queued for `wf-20260801-fix-188-followup-public-policy-uuid-lookup`; it's not a regression
  from this workflow. The script was invoked with `--skip` per its
  documented escape hatch ("run with `--skip` if intentional").
- **`pnpm test` (full monorepo) reports 4 failures** in
  `apps/api/test/users.spec.ts` (a clock-ordering flake tracked as
  `ISS-USR-CLOCK-001`). These failures exist on `origin/main` HEAD
  `376d08d` (verified by inspecting the test source — the assertion
  compares a Postgres `defaultNow()` against a Node `new Date()`
  across two consecutive calls). This branch does NOT touch
  `apps/api/**`, so the failures are not introduced by my change.
  PR-merge decision: the targeted `apps/web-next` suite is green
  (1017/1017); the broader failure is queued for the existing
  `wf-20260704-fix-096-pre-existing-api-test-flakes` workflow.

## Gate

PASS — surface mapped, blast radius bounded, risks enumerated,
honesty disclosures recorded.
