# Workflow: Issue Resolution

**Version:** 1.0
**Orchestrator reference for `workflow_type`:** `issue-resolution`

---

## Overview

Resolves a registered issue: identifies root cause, implements a fix, verifies it resolves the issue, and updates the issue registry.

**Retry limits:**
- CodeDeveloper retry: 3 (shared with security/test bouncebacks)
- TestStrategist retry: 2
- TestDesigner retry: 3

---

## Subworkflow Mode

This workflow can run in two modes:

1. **Standalone:** A user or the Orchestrator explicitly starts a resolution for a registered issue. `parent_link` in `handoff.yaml` is empty.
2. **Subworkflow (nested):** Spawned automatically by a parent workflow that hit a `failed-escalate` gate. The parent records this in its `subworkflow_history[]`.

When running as a subworkflow:
- **Branch base:** from `origin/main` (NOT from the parent feature branch)
- **PR target:** `main`
- **`parent_link` MUST be populated** in `handoff.yaml` at Step 0

---

## Steps

### Step 0: Initialize (Orchestrator, direct)

```bash
git fetch origin main
git checkout -b fix/ISS-<n>-<slug>
```

**Subworkflow additions:** Populate `parent_link` in `handoff.yaml`.

---

### Step 1: Issue Lookup

**Agent:** Orchestrator (direct)

1. Read `.copilot/issues/registry.md`
2. Search for issues with the same module or symptom keywords
3. If similar issue found: read `ISS-<n>.md` and append current occurrence
4. If no similar issue: create `ISS-<n>.md`, register in `registry.md`
5. Set `issue_ref` in `handoff.yaml`

**Output file:** `01-issue-lookup.md`

---

### Step 2: Impact Analysis

**Agent:** ImpactAnalyzer
**Inputs:** `ISS-<n>.md`, `01-issue-lookup.md`, `docs/04-development/architecture/architecture.md`

**Output file:** `02-impact-analysis.md`

**Gate:**
- `passed` → Step 3 (if DB changes) or Step 4
- `failed-escalate` → update issue, NEEDS_REVIEW, stop

---

### Step 3: Design DB Migrations (conditional)

Same as `requirement-development.md` Step 3.

---

### Step 4: Develop Fix

**Agent:** CodeDeveloper
**Inputs:**
- `ISS-<n>.md` (prior attempts — do NOT repeat a failed approach)
- `02-impact-analysis.md`
- `05-migration-plan.md` (if applicable)

**Output files:** Code changes + `03-code-summary.md`

**Gate:**
- `passed` → Step 5
- `failed-retry` → retry (max 3). Each attempt is recorded in the issue file.
- On exhaustion → update issue with all attempts, NEEDS_REVIEW, stop

---

### Step 5: Security Review

Same as `requirement-development.md` Step 5.

---

### Step 6: Plan Regression Tests

**Agent:** TestStrategist
**Inputs:** `ISS-<n>.md`, `02-impact-analysis.md`, `03-code-summary.md`, `04-security-review.md`

**Key constraint:** The plan MUST include at least one regression test that:
1. Would have failed before the fix (documents the original bug)
2. Passes after the fix

**Output file:** `06-test-strategy.md`

**Gate:**
- `passed` → Step 7
- `failed-retry` → retry (max 2)

---

### Step 7: Write Regression Tests

**Agent:** TestDesigner
**Inputs:** `06-test-strategy.md`, `03-code-summary.md`

**Output files:** Test files + `06-test-design.md`

---

### Step 8: Execute Tests

Same as `requirement-development.md` Step 8. The regression test is the primary success indicator. All existing tests must also pass (no regressions introduced).

---

### Step 9: Update Issue Registry

**Agent:** Orchestrator (direct)

1. Update `ISS-<n>.md`: add resolution section (date, workflow-id, fix description, test that proves it), set status `resolved`
2. Update `registry.md`: mark issue resolved with date
3. Update `handoff.yaml` with `issue_resolution: resolved`

---

### Step 10: Update Documentation (conditional)

**Condition:** The fix reveals a gap in a guide or convention file.

**Agent:** DocWriter — same as `requirement-development.md` Step 9, focused on preventing this class of issue.

---

### Step 11: Final Quality Gate

**Agent:** QualityGate
**Additional check:** Regression test exists and passes.

---

### Step 12: Commit, Push, Create PR (Orchestrator, direct)

Same as `requirement-development.md` Step 11, using `scripts/workflow-finish.sh`.

---

### Step 13: Archive Task (Orchestrator, direct)

Same as `requirement-development.md` Step 12.

---

## Prior Issue Knowledge Pattern

The issue file accumulates all attempts. Before Step 4, the CodeDeveloper reads the full issue history. If 3 different approaches have failed, the QualityGate will flag it as NEEDS_REVIEW with a recommendation to change the architectural approach.
