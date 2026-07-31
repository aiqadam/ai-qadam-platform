# Step 6/7 — Test Strategy & Design

New `scripts/tests/find-bp-uat-stakeholders.bats` (9 cases). The first
case is the fail-before/pass-after regression test required by this
workflow: it directly reproduces the motivating shape (a BP-UAT file whose
`linked_issues` list contains only child issues, plus a separate FR file
declaring the same `business_process` in its own frontmatter) and asserts
the parent FR IS found. Verified fail-before by checking out the script
at its first (buggy) revision — the working-tree `list_files()` bug meant
zero FR files were ever found, which is exactly the class of miss this
fix closes — then pass-after once the `list_files()` fix landed. Other 8
cases cover: linked_issues-only refs with no matching own-file (orphan
case), exclusion of unrelated BP-UAT codes, multi-BP-UAT declarations,
dedup when both sources name the same ref, empty-result BP-UATs,
nonexistent BP-UAT files (exit 2), missing-argument invocation error
(exit 2), and `--base <ref>` reading historical vs. working-tree state.

## Gate Result

gate_result:
  status: passed
  summary: "9 new bats cases, including the exact motivating regression case, fail-before/pass-after verified."
  findings: []
