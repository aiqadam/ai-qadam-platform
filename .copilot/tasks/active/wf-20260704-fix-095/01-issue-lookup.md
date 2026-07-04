# Step 1 — Issue Lookup (Orchestrator, direct)

**Workflow:** `wf-20260704-fix-095`
**Issue:** `ISS-TEST-WEB-001`
**Workflow type:** `issue-resolution`

---

## Lookup result

`.copilot/issues/ISS-TEST-WEB-001.md` already exists and is registered in
`.copilot/issues/registry.md` (line 42) with `Status: open`. The issue was
originally filed on 2026-07-03 by `wf-20260703-fix-065-onboarding-copy` while
trying to execute the regression test for `ISS-UAT-013-13` AC-3.

### Key facts (verbatim from issue file)

| Field | Value |
|---|---|
| ID | `ISS-TEST-WEB-001` |
| Severity | blocker (test infra) |
| Module | web/test-infrastructure (and api/test-infrastructure, web-next/test-infrastructure — same root cause) |
| Status | open |
| Reported | 2026-07-03 |
| Reporter | Orchestrator (wf-20260703-fix-065-onboarding-copy / CodeDeveloper attempt 2 diagnostic) |
| Blocks | ISS-UAT-013-13 AC-3 (regression test added, cannot be executed); any future test that imports a sibling helper from a `.tsx` or `.ts` file |

### Reproduction confirmed in this workflow

`cd apps/web && pnpm exec vitest run OnboardingForm.test.ts` →
```
ReferenceError: __vite_ssr_exportName__ is not defined
 ❯ src/components/OnboardingForm.helpers.ts:1:1
```

Same error message, same file, same line as in the issue. Reproduction is
confirmed; root cause is exactly as described.

### Proposed resolution (per issue file)

Bump vitest from `^2.1.8` → `^3.x` or `^4.x` in `apps/api/package.json`,
`apps/web/package.json`, `apps/web-next/package.json`. After researching
compatibility this workflow uses `^4.1.9` (latest stable at the time of the
workflow) — vitest 4.1.9 declares peer `vite: ^6.0.0 || ^7.0.0 || ^8.0.0`,
which is exactly the workspace's hoisted vite 8.1.0. Bumping to 4.x
(vs 3.x) keeps us on the current major that vitest itself supports going
forward and avoids a future re-bump.

### Acceptance criteria (verbatim from issue file)

- [ ] `vitest` bumped to a major version compatible with workspace's `vite 8.x` in all three apps.
- [ ] `pnpm install` regenerates lockfile without errors.
- [ ] `apps/web/src/components/OnboardingForm.test.ts` passes 5/5 cases under `pnpm --filter web exec vitest run`.
- [ ] `apps/web/src/lib/utm.test.ts` still passes 45/45 cases (no regression).
- [ ] `apps/api` and `apps/web-next` `vitest` suites run without `__vite_ssr_exportName__` errors.
- [ ] No new biome or tsc warnings introduced.

These 6 ACs are tracked by QualityGate at Step 11.

### Honesty disclosure — already-disclosed debt reused

The test file `apps/web/src/components/OnboardingForm.test.ts` was added by
`wf-20260703-fix-065-onboarding-copy` (PR #90 squash `e38dd18`). That
workflow's resolution section explicitly disclosed that AC-3 of
`ISS-UAT-013-13` (the regression test for the onboarding copy fix) was
deferred to this follow-up workflow. No new debt is being introduced by
this workflow — the regression test already exists in the tree, only its
execution is unblocked.

### Issue → workflow linking

- `issue_ref: ISS-TEST-WEB-001` (already set in handoff.yaml)
- `parent_link` already populated from the spawn (parent
  `wf-20260703-fix-065-onboarding-copy`, spawned by `ISS-UAT-013-13`)
- This is a subworkflow of `wf-20260703-fix-065-onboarding-copy`. After
  this workflow lands on `main`, the parent branch can be rebased to
  consume the new vitest, and `ISS-UAT-013-13` AC-3 can be flipped to
  `verified` by a separate re-verification workflow (already named in the
  parent's Resolution section).

---

## Gate

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-04T20:55:00Z"
  summary: "ISS-TEST-WEB-001 already exists; reproduction confirmed; 6 ACs tracked; ready for Step 2 impact analysis."
  output_file: ".copilot/tasks/active/wf-20260704-fix-095/01-issue-lookup.md"
```