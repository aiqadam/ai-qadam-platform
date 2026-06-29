# Step 9 — Atomic Registry Flip

Workflow: wf-20260629-fix-038
Issue: ISS-UAT-013-6
Date: 2026-06-29

---

## Gate Result

```
status: passed
attempt: 1
timestamp: 2026-06-29T19:10:00Z
summary: Both status tables (ISS-UAT-013-6.md header row + registry.md row)
  flipped from open → resolved in the same working-tree state. They will
  land in the SAME git commit when workflow-finish.sh runs, so an external
  observer will never see the registry referencing a non-resolved status
  header. The Resolution section is appended below the original content,
  preserving the issue's full provenance (Symptom / Repro / Root cause /
  Proposed resolution / Acceptance criteria / References).
```

---

## Edits applied (working tree only — not yet committed)

### `.copilot/issues/ISS-UAT-013-6.md` — header row

```diff
-| Status | open |
-| Workflow | wf-20260628-uat-030 |
+| Status | resolved |
+| Resolved | 2026-06-29 |
+| Workflow | wf-20260629-fix-038 |
+| Merged | _pending PR merge_ |
```

### `.copilot/issues/ISS-UAT-013-6.md` — new `## Resolution` section appended

The section documents:
- Spec edits (AC-1, AC-2) were already on disk from Retry-2 on 2026-06-28
  (Neg 002/003 API-level 410 assertions + comment block; Neg 004 error-text
  regex match).
- Doc change shipped by this workflow (AC-3): new subsection
  `### Negative-scenario assertion rule (mandatory)` under
  `## Negative Scenarios` in `docs/02-business-processes/uat/BP-UAT-template.md`.
- Regression test: `scripts/tests/bp-uat-template-rule.bats` (51 lines,
  5 `@test` blocks; 5/5 pass; 5/5 fail without rule).
- AC-4 deferred to follow-up workflow (out of scope).
- Honesty note: handoff context_refs originally pointed at the wrong file
  (`apps/web-next/...` instead of `apps/web/src/components/OnboardingForm.tsx`);
  fix landed in the template, which is the correct durable artifact for AC-3.

### `.copilot/issues/registry.md` — row update

```diff
-| [ISS-UAT-013-6](ISS-UAT-013-6.md) | enhancement | uat/test-design | ... | open | wf-20260628-uat-030 | 2026-06-28 |
+| [ISS-UAT-013-6](ISS-UAT-013-6.md) | enhancement | uat/test-design | ... | resolved | wf-20260629-fix-038 | 2026-06-29 |
```

## Atomicity guarantee

Both edits are in the working tree on branch `fix/ISS-UAT-013-6-uat-test-design`
and will be staged + committed together by `scripts/workflow-finish.sh` in
Step 12. There is no intermediate state where one file references the other
inconsistently.

Counter `.copilot/meta/next-workflow-id` stays at `39` until Step 12.5
(merge/pull/verify) per protocol.

## Pre-commit checks performed

- `git diff --stat` confirms only the expected files are touched (no
  accidental edits to other registry rows).
- Issue body content (Symptom / Repro / Root cause / Proposed resolution /
  Acceptance criteria / References) is preserved verbatim.
- The Summary column in the registry row is unchanged (preserves the
  historical "spec edits empirically validated in attempt 2" note).

## Links

- [.copilot/issues/ISS-UAT-013-6.md](../../../issues/ISS-UAT-013-6.md) (status header + Resolution section)
- [.copilot/issues/registry.md](../../../issues/registry.md) (row 10)
- [07-test-results.md](07-test-results.md) (Step 8 evidence)
- [handoff.yaml](handoff.yaml)