# SUPERSEDED — 2026-07-03 by policy §6.3 v2

This file was originally written on 2026-07-03 to escalate the
**PRSteward's deny verdict on PR #94** (`storybook` failure class was
new, no owned issue, no queued workflow). The user responded:

> "What is our PRSteward for if he all queations reask me? Rules must
> be rewritten: all these problems has to resolved by this role."

Per `AGENTS.md §13` (Critical analysis), the user's explicit override
authorised the policy rewrite: **§6.3 v2** removes the
"new-failure-class" stop condition. New classes are now
auto-registered and the override proceeds. PRSteward escalates
**only** for the four hard-stop conditions:

1. Failure introduced by this PR's diff (rule 1 fails).
2. Counter at or above limit (rule 3 fails).
3. `gitleaks` secret-scan hit (rule 4 absolute).
4. Security-checked job hit.

---

## What replaced this escalation

A second PRSteward invocation at step 11.4, after commit `ebba3da`
landed §6.3 v2 on PR #94's branch, evaluated the same two failures
under the new policy:

### Failing check: `ci` (`__vite_ssr_exportName__`)

- Rule 1: pre-existing on `origin/main` PASS
- Rule 2: class `15c26207b13cee6b4283d22fd389e3015bc95988` registered,
  owned by `ISS-TEST-WEB-001`, `wf-20260703-fix-066-vitest-bump`
  under `.copilot/tasks/queued/`. PASS
- Rule 3: `consecutive_count: 3 < 5`. PASS
- **Verdict: override (counter 3 → 4).**

### Failing check: `storybook` (`[PARSE_ERROR] Unexpected JSX expression`)

- Rule 1: pre-existing on `origin/main` PASS
- Rule 2: class `ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7` NOT in the
  counter file → **auto-registered per the new Auto-register
  procedure**:
  - `.copilot/issues/ISS-CI-OVERRIDE-ebd184b.md` created (local file;
    `gh issue create` is disabled on `tvolodi/aiqadam` — see issue
    file for the note)
  - Row added to `.copilot/issues/registry.md`
  - Class added to `.copilot/meta/ci-override-counters.json` with
    `consecutive_count: 1`
  - Queued workflow directory
    `.copilot/tasks/queued/wf-20260703-fix-072-rolldown-jsx-parse/`
    created with `handoff.yaml`
  - `.copilot/meta/next-workflow-id` bumped `71 → 72`
- Rule 3: `consecutive_count: 1 < 5`. PASS
- **Verdict: override (counter starts at 1).**

### Per-PR net decision

Both checks pass. Net decision: **OVERRIDE**. Merge authorized.
PR #94 squash trailer will carry:

```
CI-Override: 15c26207b13cee6b4283d22fd389e3015bc95988 via ISS-TEST-WEB-001 (count 4/5)
CI-Override: ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7 via ISS-CI-OVERRIDE-ebd184b (count 1/5)
```

---

## Why the user override was correct

The original §6.3 v1 treated every "new failure class" as a stop
condition. That made the PRSteward's net verdict always "escalate"
on the first PR to land after a new regression appeared on `main`
— exactly the case PR #94 demonstrated. The PRSteward is supposed
to be an autonomous decision-maker; every PR hitting a user prompt
defeats that.

The §6.3 v2 design preserves all of v1's invariants:

- **5-strike budget** per failure class (rule 3) is unchanged.
- The user is still consulted for **introduced-by-this-PR** failures
  (real bugs in the PR — must be fixed before merge).
- The user is still consulted for **secrets** (`gitleaks` hit) and
  **security-checked** jobs (`architecture-check`,
  `pnpm audit`, `trivy`).

The only difference is that registering a new failure class is now
treated as bookkeeping (one `gh issue create` equivalent + one
workflow dir + one counter entry + one registry row) instead of as
a stop-the-world event.
