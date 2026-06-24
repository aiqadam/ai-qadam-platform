---
code: FR-MIG-029
name: /workspace/members uplift — segment builder integrated into filter panel
status: Implemented
module: Migration (MIG)
phase: Rebuild Phase 3
---

## Description
Extends the members cabinet (FR-MIG-010) with an integrated segment builder so operators can define reusable audience segments directly from the members filter panel — no separate Telegram segments page visit required.

## Users
Country leads targeting announcements, Telegram broadcasts, and event invites.

## Functional scope
1. Filter panel (already built in FR-MIG-010) gains a "Save as segment" toggle.
2. When toggled: reveals `<SegmentNameInput>` + segment type selector (announcement / telegram / both).
3. Saving creates a segment record via POST `/v1/admin/segments` (unified — not just tg-segments).
4. Saved segments listed below the filter panel with quick-load and delete.
5. Segment used in `<AsyncSelect>` across announce (FR-MIG-011), Telegram broadcasts (FR-MIG-015).

## Acceptance criteria
- [ ] Enabling "Save as segment" and naming the filter set creates a segment of the correct type.
- [ ] Loaded segment restores the full filter state.
- [ ] Segment appears in the cohort picker of the announce composer.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- Depends on: FR-MIG-010 (filter panel must exist), FR-MIG-003 (`<Form>`).
- Unified segment model subsumes `tg-segments` — coordinate with FR-MIG-014 to avoid dual segment tables.
