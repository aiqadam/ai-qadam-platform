# Test Results — wf-20260801-fix-188-public-policy-uuid-lookup

## Static regression

`bash scripts/run-bats.sh scripts/tests/bootstrap-public-policy-name-lookup.bats` — **5/5 passed**.

| AC | Test | Pre-fix expectation | Result on this branch |
|---|---|---|---|
| AC-1 | `bootstrap.sh no longer defines POLICY_PUBLIC_PROD` | fail | pass |
| AC-2 | `bootstrap.sh does not use the 87bf5954-… UUID in executable code` | fail | pass (only the line-2973 historical comment) |
| AC-3 | `bootstrap.sh has exactly eight lower PUBLIC_POLICY_ID name-lookup blocks` | fail (count = 0) | pass (8 blocks extracted via awk, all contain the encoded `$t:public_label` URL) |
| AC-4 | `all eight expected collections appear under a PUBLIC_POLICY_ID block` | fail | pass |
| AC-5 | `each PUBLIC_POLICY_ID block guards its permissions call` | fail | pass (8 lower + 2 higher skip warnings) |

## Syntax check

`bash -n infrastructure/directus/bootstrap.sh` — clean (exit 0).

## Live Directus pre-flight (mandated by AGENTS.md §6.1)

Directus container `aiqadam-directus` is up; `/server/ping` returns `pong`. Policy lookup against the local Public policy resolved to the expected instance-specific id `abf8a154-5b1c-4a46-ac9c-7300570f4f17`.

## Live bootstrap

`bootstrap.sh` executed end-to-end against the local stack. Eight migrated blocks applied: `event_materials`, `event_photos`, `event_questions`, `event_sponsors`, `sponsors`, `site_settings`, `press_page`, `badge_definitions`, `team_members`. All Public read permission rows are now present (`/permissions?filter[policy][_eq]=abf8a154-…&filter[action][_eq]=read&limit=100` enumerates rows for every collection above).

## Idempotency

Re-running `bootstrap.sh` produced `(public, exists)` for every migrated block — no new POSTs, no duplicates. The script's count-then-create pattern is preserved.

## Decision

All four strategy-level acceptance criteria plus the no-silent-skip guard are verified. The regression test will fail on `origin/main` and pass on the fix branch; the live verification is consistent with the regression test.

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-08-03T00:00:00Z"
  summary: "Static bats regression (5/5) plus live Directus bootstrap + idempotent re-run confirm the eight migrated blocks resolve the local Public policy and apply correct public-read grants."
  output_file: ".copilot/tasks/active/wf-20260801-fix-188-public-policy-uuid-lookup/07-test-results.md"
```
