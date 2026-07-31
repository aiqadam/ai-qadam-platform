# Step 8 — Execute Tests

## New suite

```
$ bash scripts/run-bats.sh scripts/tests/find-bp-uat-stakeholders.bats
1..9
ok 1 ISS-WF-PARENT-SYNC-001 motivating case: parent FR is found even when linked_issues only lists child issues
ok 2 AC-1: linked_issues entries are included even if their own file has no matching Business-Process field
ok 3 AC-2: an FR/ISS for a DIFFERENT BP-UAT code is excluded
ok 4 AC-3: an FR/ISS declaring multiple BP-UAT codes is still matched
ok 5 AC-4: output is deduplicated when linked_issues and the file scan both name the same ref
ok 6 AC-5: BP-UAT with no stakeholders at all returns empty output, exit 0
ok 7 AC-6: nonexistent BP-UAT file exits 2
ok 8 invocation error: missing BP-UAT-NNN argument exits 2
ok 9 AC-7: --base ref reads historical state, not the working tree
```

9/9 pass.

## Direct live check against this real repo's actual state

```
$ bash scripts/find-bp-uat-stakeholders.sh BP-UAT-010
FR-EVT-004
ISS-BRIDGE-STALE-001
ISS-EVT-004-1
ISS-EVT-005-1
ISS-UAT-010-1
ISS-UAT-010-2
ISS-UAT-SEED-003
```

Confirms the fix works against the real motivating case: `FR-EVT-004`
(the ref that was silently missed for #130's entire lifetime) is now
correctly returned alongside every already-known follow-up issue.

## Full repo bats suite (regression check)

```
$ bash scripts/run-bats.sh scripts/tests/*.bats
```
Ran to completion, exit code 0. Explicitly re-ran the 3 most relevant
suites together to confirm no interaction bugs from the `test_helper.bash`
change (new `docs/02-business-processes/uat/` dir + new script copy-in):

```
$ bash scripts/run-bats.sh scripts/tests/check-github-issue-links.bats \
    scripts/tests/check-closing-keyword.bats \
    scripts/tests/find-bp-uat-stakeholders.bats
1..36
... (36/36 ok, no regressions)
```

## Gate Result

gate_result:
  status: passed
  summary: "9/9 new tests pass; full repo bats suite (200+ tests) re-runs clean; live-verified against real repo state."
  findings: []
