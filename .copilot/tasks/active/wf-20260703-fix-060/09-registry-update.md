# 09 — Registry Update (wf-20260703-fix-060)

## Atomic Status Flip

Per `issue-resolution.md` Step 9, this step performs the atomic status
flip on BOTH state files. Both edits MUST be staged in the same `git
add` and committed together with the substantive spec change.

### Edit 1 — `.copilot/issues/ISS-UAT-013-12.md`

**Diff summary:**

```diff
--- a/.copilot/issues/ISS-UAT-013-12.md
+++ b/.copilot/issues/ISS-UAT-013-12.md
@@ -4,6 +4,8 @@
 | ID | ISS-UAT-013-12 |
 | Severity | minor |
 | Module | uat/test-design |
-| Status | open |
+| Status | resolved |
 | Reported | 2026-07-02 |
 | Reporter | BusinessAnalyst (wf-20260702-uat-059 / 03-uat-triage.md) |
+| Resolved | 2026-07-03 |
+| Workflow | wf-20260703-fix-060 |
 | Related | [ISS-UAT-013-6](ISS-UAT-013-6.md) (Neg 004 was originally strengthened by that issue; this issue is the residual race that escaped that fix) |
 | AC ref | AC-1 (BP-UAT-013) — Neg 004 |
@@ ... @@

 ## Resolution

-_Pending._
+- **Workflow:** wf-20260703-fix-060
+- **PR:** <pending>  (Step 12 back-fills the URL after `gh pr create`.)
+- **Root cause:** ... (full paragraph)
+- **Fix:** ... (full paragraph)
+- **Regression test:** ... (full paragraph)
+- **Verification:** ... (full paragraph)
+- **Merged:** <pending>  (Step 12.5 back-fills the actual merge SHA.)
```

### Edit 2 — `.copilot/issues/registry.md`

**Diff summary:**

```diff
--- a/.copilot/issues/registry.md
+++ b/.copilot/issues/registry.md
@@ ... @@
-| [ISS-UAT-013-12](ISS-UAT-013-12.md) | minor | uat/test-design | Neg 004 spec has React-18 state-commit race (setReactInputValue + form.requestSubmit()); product behaviour verified correct by direct API probe, only the test needs rewrite | open | wf-20260702-uat-059 (triage 2026-07-02; fix pending follow-up workflow) | 2026-07-02 |
+| [ISS-UAT-013-12](ISS-UAT-013-12.md) | minor | uat/test-design | Neg 004 spec has React-18 state-commit race (setReactInputValue + form.requestSubmit()); product behaviour verified correct by direct API probe, only the test needs rewrite | resolved | wf-20260703-fix-060 | 2026-07-03 |
```

### Edit 3 — `handoff.yaml`

`issue_resolution: resolved` will be set in Step 11 (QualityGate) as
the terminal state, not in this step. The handoff.yaml stays a
running-workflow file until the QualityGate clears.

## Atomicity

Both files will be staged in a single `git add` together with
`apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` and committed in a
single commit when Step 12 (workflow-finish.sh) runs. This satisfies
the issue-resolution §9 atomicity rule: "Edits 1 and 2 MUST be staged
in the same `git add` and committed together."

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T00:00:00Z
  summary: >-
    Both files modified. Both show Status = resolved for ISS-UAT-013-12.
    Values agree (registry row Status column = "resolved", issue header
    Status field = "resolved"). Workflow column updated to wf-20260703-fix-060
    in both files. Date column updated to 2026-07-03 in registry. Atomic
    commit will be made in Step 12 with the substantive spec change.
  output_file: ".copilot/tasks/active/wf-20260703-fix-060/09-registry-update.md"
```
