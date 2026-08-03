# Quality Gate — wf-20260801-fix-188-public-policy-uuid-lookup

## AC-by-AC disposition

| AC | Description | Status | Evidence |
|---|---|---|---|
| AC-1 | `POLICY_PUBLIC_PROD` and its hardcoded UUID assignment are absent | verified | `grep -c 'POLICY_PUBLIC_PROD' infrastructure/directus/bootstrap.sh` = 0; AC-1 of `bootstrap-public-policy-name-lookup.bats` passes on this branch and fails on `origin/main`. |
| AC-2 | Exactly eight affected lower blocks resolve `$t:public_label` through the encoded `/policies` filter | verified | `awk`-extracted count of `PUBLIC_POLICY_ID=$(curl …)` blocks is 8; each block contains `filter%5Bname%5D%5B_eq%5D=%24t%3Apublic_label` on its continuation line. AC-3 of the bats suite passes. |
| AC-3 | Each block checks the resolved ID before querying or creating permissions | verified | Eight `if [ -n "${PUBLIC_POLICY_ID}" ]` guards plus eight `⚠ Public policy (\$t:public_label) not found — skipping` warnings. AC-5 of the bats suite passes. |
| AC-4 | All expected collections remain represented | verified | AC-4 of the bats suite enumerates `event_materials`, `event_photos`, `event_questions`, `event_sponsors`, `sponsors`, `site_settings`, `press_page`, `badge_definitions`, `team_members` and finds each under a `PUBLIC_POLICY_ID` block. |
| AC-5 | Live Directus verification: the migrated blocks apply on local and are idempotent on re-run | verified | `/server/ping` returns `pong`; the `$t:public_label` lookup returns `abf8a154-5b1c-4a46-ac9c-7300570f4f17`; first bootstrap run applied nine public-read permission rows; the second run was idempotent (`(public, exists)` for every migrated block, no new POSTs). |

## Status consistency

- `handoff.yaml` `workflow_status` set to `running` with the workflow at Step 8.
- `workflow_status` will be advanced to `completed` after `scripts/workflow-finish.sh` records the PR URL.

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-08-03T00:00:00Z"
  summary: "All five acceptance criteria verified via static regression plus live Directus run; workflow proceeds to commit, push, and PR."
  output_file: ".copilot/tasks/active/wf-20260801-fix-188-public-policy-uuid-lookup/09-quality-gate.md"
```
