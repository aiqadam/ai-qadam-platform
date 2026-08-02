# Step 1 — Issue Lookup

**Workflow:** wf-20260802-fix-194
**Step:** 1 — Issue Lookup (Orchestrator, direct)
**Date:** 2026-08-02

## Symptom

`apps/web-next/src/lib/event-lifecycle-tab.test.ts` fails on `main`
(run 30731579324, 2026-08-02) for the case "degrades to 'upcoming'
when only startsAt is unparseable":

```
AssertionError: expected 'finished' to be 'upcoming' // Object.is equality
  ❯ src/lib/event-lifecycle-tab.test.ts:112:20
```

Single-failure surface, isolated to the `ci-cd` `build` job's `Test`
step (`@aiqadam/web-next#test`). 1016/1017 tests pass; 1 fails.

## Impact

- The `ci-cd` `build` job is red on every push to `main` and every
  PR. `deploy-qa` is skipped (`needs: build`). `deploy-prod` is
  unaffected (manual `workflow_dispatch`).
- AGENTS.md §6.3 user opt-out: CI is not a merge gate, so this is
  not blocking merges — but it is a real bug (the page logic
  diverges from the unit-test spec authored in
  `wf-20260730-feat-155` for FR-EVT-004).

## Registered as

- Local: `.copilot/issues/ISS-EVT-LIFECYCLE-TAB-001.md`
- Issue ID: **ISS-EVT-LIFECYCLE-TAB-001** (new file)
- Severity: bug (single failing test, deterministic, reproducible)
- Module: web-next/events
- Related: FR-EVT-004, ISS-EVT-004-1, BP-UAT-010

## Pre-existing similar items (for reference, not duplicates)

- `ISS-USR-CLOCK-001` (apps/api test/users.spec.ts clock-ordering
  flake) — different file, different module; pre-existing on main;
  not introduced by my change.
- `TgBroadcastComposer.tsx` lint warning (`suppressions/unused`):
  pre-existing on main; not introduced by my change.

## GitHub issue

Will be created in Step 11.5 after the PR is merged. Will report
this workflow via `gh issue create` with title pattern
`ISS-EVT-LIFECYCLE-TAB-001: deriveDefaultTab() returns 'finished'
when only startsAt is unparseable`.

## Gate

PASS — Issue located, registered locally with all required fields,
severity and module derived from existing registry precedent
(ISS-EVT-004-1, ISS-EVT-005-1).
