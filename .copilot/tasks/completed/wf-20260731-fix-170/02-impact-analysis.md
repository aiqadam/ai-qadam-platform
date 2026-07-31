# Step 2 — Impact Analysis

**Scope:** protocol/workflow-tooling files only. No product code, no
Directus schema, no CI config.

## Files changed

1. `.copilot/schemas/protocol.md` — new "Syncing ALL stakeholders, not
   just the current workflow's own ref" subsection under "Business-Process
   Linkage & Post-Merge UAT"; amended outcome-4 bullet to reference it.
2. `.copilot/workflows/issue-resolution.md` Step 13 — loop the
   `agent-verified` sync over `find-bp-uat-stakeholders.sh`'s output, not
   just the current `ISS-<n>`.
3. `.copilot/workflows/requirement-development.md` Step 13 — same fix for
   `FR-<CODE>`.
4. `scripts/find-bp-uat-stakeholders.sh` (new) — given a `BP-UAT-NNN`,
   unions its `linked_issues` frontmatter list with a direct scan of every
   `FR-*.md`/`ISS-*.md` file's own `business_process`/`Business-Process`
   field.
5. `scripts/tests/find-bp-uat-stakeholders.bats` (new) — 9 cases,
   including a direct reproduction of the motivating shape (parent FR
   findable even when `linked_issues` only lists child issues).
6. `scripts/tests/test_helper.bash` — extended `setup_test_repo()` to
   create `docs/02-business-processes/uat/` and copy the new script in,
   same pattern as every other script it already copies.

## Risk / blast radius

None on running systems — this only changes what Step 13 (a step that
already runs autonomously, already calls `sync-github-project.sh`) loops
over. The new script is read-only (greps + prints refs; never writes
anything itself). Worst case if the script has a bug: a stakeholder ref
gets synced to `agent-verified` incorrectly (a Project-board display
issue, trivially correctable by re-running the sync with the right
status) or a real stakeholder gets missed (the exact status quo this fix
is closing, not a regression). Full bats suite (201+ tests across the
repo) re-run clean after this change — see `07-test-results.md`.

## Gate Result

gate_result:
  status: passed
  summary: "Workflow-tooling change only; no product/security surface; full bats suite re-run clean."
  findings: []
