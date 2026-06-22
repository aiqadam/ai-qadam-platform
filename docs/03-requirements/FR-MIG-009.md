---
code: FR-MIG-009
name: /workspace/events/[id] — operator control panel with PATCH
status: Not Started
module: Migration (MIG)
phase: Rebuild M2
---

## Description
The operator's primary day-of tool. Allows editing event metadata, managing followup checklist items, and regenerating the OG social card. This is the highest-traffic operator page on event day.

## Users
Country leads, day-of organisers.

## Functional scope
1. `pages/workspace/events/[id].astro` — SSR-fetches event; mounts `<EventEditForm>` + `<EventFollowups>` + `<ActionBar>`.
2. `<EventEditForm>` uses `<Form>` (FR-MIG-003) with event schema: title, description, date/time, location, capacity, survey form (via `<AsyncSelect>` FR-MIG-004), visibility.
3. PATCH `/v1/admin/events/:id` on save.
4. `<EventFollowups>` — checklist of post-event tasks (tick off inline).
5. `<ActionBar>` actions: Save (primary), Regen social card, Cancel event (with confirm dialog).
6. KPI strip: registrations count, check-ins, waitlist.

## Acceptance criteria
- [ ] Editing event title + saving sends PATCH and reflects updated title on reload.
- [ ] Survey form field uses `<AsyncSelect>` populated from `/v1/admin/forms`.
- [ ] "Cancel event" action shows confirm dialog before sending DELETE/PATCH.
- [ ] "Regen social card" calls the OG card endpoint and shows success toast.
- [ ] KPI strip shows live registration counts.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/workspace/events/[id].astro` + `EventControlPanel.tsx`.
- Depends on: FR-MIG-003 (`<Form>`), FR-MIG-004 (`<AsyncSelect>`), FR-MIG-005 (`<ActionBar>`).
- Blocks `<EventEditForm>` and `<EventFollowups>` exist in web-next but need `<Form>` wiring.
