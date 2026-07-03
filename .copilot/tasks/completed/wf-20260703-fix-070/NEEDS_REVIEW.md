# SUPERSEDED — 2026-07-03 by §6.3 v2 + workflow wf-20260703-impl-policy-071

This file was originally written on 2026-07-03 to escalate the CI
failures on PR #93 (the ISS-WF-REG-002 registry-state-drift fix)
for a user override decision under the v1 §6.3 policy.

Under v1, both failures hit PRSteward:
- `ci/__vite_ssr_exportName__` → eligible (pre-existing, ISS-TEST-WEB-001, counter 3).
- `storybook/PARSE_ERROR Unexpected JSX expression` → new class, not in counter file, PRSteward stops.

The user's reply to a similar escalation on PR #94 was:

> "What is our PRSteward for if he all queations reask me? Rules must
> be rewritten: all these problems has to resolved by this role."

That reply triggered the v2 policy rewrite (§6.3 v2 → auto-register
on new classes instead of stopping). PR #94 landed as squash
`9ce08f6`. The branch was rebased on `main`, and PRSteward was
re-invoked under v2 against the same PR #93 failures, now with both
classes registered in the counter file (the storybook class was
auto-registered during PR #94's invocation).

**VERDICT: OVERRIDE authorised on both failing checks.** Merge authorised.

## Failing check: ci (`__vite_ssr_exportName__`)

- Rule 1: pre-existing on `origin/main` PASS (PR #93's 16 file
  paths are all `.md`/`.yaml` under `.copilot/` plus
  `docs/02-business-processes/uat/BP-UAT-013.md`; failure files live
  in `apps/api/test/`)
- Rule 2: class `15c26207b13cee6b4283d22fd389e3015bc95988` is in the
  counter file, owned by `ISS-TEST-WEB-001`, queued workflow
  `wf-20260703-fix-066-vitest-bump`. PASS
- Rule 3: `consecutive_count: 3 < 5`. PASS
- **Verdict: override. Counter 3 → 4.**

## Failing check: storybook (`[PARSE_ERROR] Unexpected JSX expression`)

- Rule 1: pre-existing on `origin/main` PASS (PR #93's diff has zero
  overlap with the failure files in `apps/web-next/src/{blocks,kit}/`)
- Rule 2: class `ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7` was
  auto-registered by PRSteward on PR #94 under the v2
  Auto-register procedure (PR #94 was the first encounter).
  Class file: `.copilot/meta/ci-override-counters.json` (entry with
  `consecutive_count: 1`, `owned_by_issue: ISS-CI-OVERRIDE-ebd184b`,
  `queued_workflow: wf-20260703-fix-072`). PASS
- Rule 3: `consecutive_count: 1 < 5`. PASS
- **Verdict: override. Counter 1 → 2.**

## Per-PR net decision

Both checks pass. Net decision: **OVERRIDE**. Merge authorized.

PR #93 squash trailer will carry:

```
CI-Override: 15c26207b13cee6b4283d22fd389e3015bc95988 via ISS-TEST-WEB-001 (count 4/5)
CI-Override: ebd184bfe1c7b3c4fde6d4d0685be02d595d8be7 via ISS-CI-OVERRIDE-ebd184b (count 2/5)
```

Counter file on `main` after the merge (in the post-merge archive
commit on the PR #93 workflow side): `15c26207...` = 4, `ebd184bf...` = 2.

## What the user override achieves

The PR #93 storybook failure was the original trigger that caused
the v1 PRSteward to escalate on PR #94 (because both PRs hit the
same `storybook` failure). Under v1, both would have stopped and
asked the user. Under v2, the first PR auto-registers the class and
proceeds; subsequent PRs see the class registered and proceed
without prompting. PR #94 was the first; PR #93 is the second.

There are now **two** queued follow-up workflows on `main`:

- `wf-20260703-fix-066-vitest-bump` (owned by `ISS-TEST-WEB-001`,
  counter `15c26207...` will reach 5 after the 5th PR; we are at
  override #4 on this PR; the 5th PR will be the last before
  PRSteward refuses to override on this class)
- `wf-20260703-fix-072` (owned by `ISS-CI-OVERRIDE-ebd184b`,
  counter `ebd184bf...` is at override #2; 3 more before the 5-strike
  budget is exhausted)

Either fix landing on `main` resets its counter to 0.
