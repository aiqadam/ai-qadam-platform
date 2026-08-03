# Impact Analysis — ISS-PUB-POLICY-UUID-PIN-001

## Scope

The defect is confined to `infrastructure/directus/bootstrap.sh`. Eight lower public-read grant blocks use one environment-specific Directus Public policy UUID. The stable lookup key is the built-in policy name `$t:public_label`, already used elsewhere in this script.

## Affected surfaces

- **Infrastructure:** Replace the UUID pin and eight existence guards with a name-resolved policy ID.
- **API, database schema, shared types, frontend, bot, workers:** No changes.
- **Dependencies and migrations:** None.

## Collections

`event_materials`, `event_photos`, `event_questions`, `event_sponsors`, `sponsors`, `site_settings`, `press_page`, `badge_definitions`, and `team_members`.

## Risks

- The resolved ID must be checked for emptiness before creating permissions.
- Existing permission lookup and idempotent creation behavior must remain unchanged.
- A live local Directus run will begin applying these intended grants where the hardcoded UUID previously caused silent skips.

## Verification scope

- Regression test proving the hardcoded UUID/variable is absent and every affected block uses name lookup.
- Shell syntax validation.
- Live Directus pre-flight and bootstrap verification where feasible, including idempotency and permission-row checks.

## Database migration

Not required. No schema changes occur; bootstrap only ensures existing Directus permission rows.

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-08-03T00:00:00Z"
  summary: "Single-file Directus bootstrap fix; no application or schema changes."
  output_file: ".copilot/tasks/active/wf-20260801-fix-188-public-policy-uuid-lookup/02-impact-analysis.md"
```
