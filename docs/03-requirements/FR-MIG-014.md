---
code: FR-MIG-014
name: /workspace/integrations/telegram — root + segments builder
status: Shipped
module: Migration (MIG)
phase: Rebuild M2
---

## Description
Telegram integration cabinet root page and the audience segment builder. Segments define the target audience for broadcasts using an `_and`/`_or` criteria DSL.

## Users
Operators managing Telegram audience targeting.

## Functional scope
1. `pages/workspace/integrations/telegram/index.astro` — overview: linked channel, bot status, recent broadcast summary.
2. `pages/workspace/integrations/telegram/segments/index.astro` — list of saved segments (`<DataTable>`), create/edit/delete.
3. Segment editor: criteria builder using `<FormBuilder>` pattern with criterion types: country (`_in`), registered-for-event (via `<AsyncSelect>`), preferred-topics (`_contains`), linked-within-days.
4. Live preview: debounced resolved member count + anonymized sample.
5. Save segment via POST `/v1/admin/tg-segments`.

## Acceptance criteria
- [ ] Telegram root shows bot connection status.
- [ ] Creating a segment with `country: uz` + `registered_for_event: <id>` saves and previews the correct count.
- [ ] Editing an existing segment loads its criteria correctly.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/workspace/integrations/telegram/segments/index.astro` + `CriteriaBuilder.tsx`.
- Depends on: FR-MIG-004 (`<AsyncSelect>`), FR-MIG-006 (`<FormBuilder>` pattern for criteria).
- Related: FR-CMS-005 (audience segments application FR).
