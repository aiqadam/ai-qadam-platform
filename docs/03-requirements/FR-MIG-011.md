---
code: FR-MIG-011
name: /workspace/announce — full announcement composer
status: Not Started
module: Migration (MIG)
phase: Rebuild M2
---

## Description
Full operator announcement composer: rich-text email body, cohort targeting, consent toggle, preview, and send. The page stub exists; this FR wires it up completely.

## Users
Country leads, super-admins sending event or community announcements.

## Functional scope
1. Subject line (`<Input>`).
2. Rich-text body editor (Telegram-safe HTML subset: bold, italic, links, code).
3. Cohort picker via `<AsyncSelect>` (loads from `/v1/admin/cohorts`).
4. Consent toggle: "only send to members who opted in to announcements".
5. Preview pane: renders the email as recipients will see it.
6. `<ActionBar>` actions: Preview, Send (with confirm + estimated recipient count).
7. POST `/v1/admin/announcements` on send.

## Acceptance criteria
- [ ] Rich-text editor supports bold, italic, link insertion, inline code.
- [ ] Cohort picker loads saved cohorts from the API via `<AsyncSelect>`.
- [ ] Recipient count shown in the send confirmation dialog.
- [ ] Successful send shows toast; failed send shows error inline.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/components/workspace/AnnounceComposer.tsx`.
- Depends on: FR-MIG-003 (`<Form>`), FR-MIG-004 (`<AsyncSelect>`), FR-MIG-005 (`<ActionBar>`).
- Rich-text: use `tiptap` (add to package.json) with the Telegram HTML output extension.
