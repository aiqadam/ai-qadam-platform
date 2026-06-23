---
code: FR-MIG-015
name: /workspace/integrations/telegram/broadcasts — list + composer + actions
status: Implemented
module: Migration (MIG)
phase: Rebuild M2
---

## Description
Three Telegram broadcast pages: the list, the new-broadcast composer, and the per-broadcast detail/action view.

## Users
Operators composing and sending Telegram channel broadcasts.

## Functional scope
1. `broadcasts/index.astro` — `<DataTable>` of broadcasts with status filter (draft/scheduled/sending/sent/failed).
2. `broadcasts/new.astro` — full composer: rich-text body, image upload, up to 8 inline buttons (text + URL pairs), segment picker via `<AsyncSelect>`, schedule-for-future datetime picker.
3. `broadcasts/[id].astro` — read view with `<ActionBar>`: Send now (super-admin, with confirm + recipient count), Test send, Duplicate, Cancel (scheduled only).
4. Send-now shows estimated duration warning if segment > 10k members.
5. Status transitions shown inline: draft → scheduled → sending → sent/failed.

## Acceptance criteria
- [ ] Composing a broadcast with a body + segment + scheduled time saves as `status=scheduled`.
- [ ] "Send now" confirm dialog shows recipient count and estimated duration.
- [ ] Failed broadcast shows retry option.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/workspace/integrations/telegram/broadcasts/`.
- Depends on: FR-MIG-004 (`<AsyncSelect>`), FR-MIG-005 (`<ActionBar>`).
- Related: FR-CMS-004 (broadcast composer application FR).
