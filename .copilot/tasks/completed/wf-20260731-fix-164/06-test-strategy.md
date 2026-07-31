# Step 6/7: Test Strategy + Design — ISS-WF-GH-CLOSE-001

## Regression test (mandatory anchor)

Would have failed before the fix, passes after: a commit message
containing `Closes #130`-style text for `FR-EVT-004` (`business_process:
[BP-UAT-010]`) — before this fix, no script existed to catch this at
all; `scripts/check-closing-keyword.sh --message-file ... --issue-ref
FR-EVT-004` now exits 1 for exactly this case
(`check-closing-keyword.bats` AC-6 uses `FR-EVT-004` itself as the test
fixture, matching the real motivating incident's ref).

## Full case list — `scripts/tests/check-closing-keyword.bats` (12 cases)

Already written and passing during Step 4 (see `03-code-summary.md`).
Covers: closing keyword + non-empty business_process (fail), closing
keyword + empty business_process (pass, unchanged case), neutral `Refs
#N` phrasing (pass), case-insensitivity, explicit `--business-process`
override, both `ISS-<n>` and `FR-<CODE>` ref shapes, no-resolvable-number
short-circuit, non-matching issue number (no false positive), and 2
invocation-error cases.

## Gate Result

**Status:** `passed` → Step 8 (Execute Tests) — already run, see
`07-test-results.md`.
