---
code: FR-MIG-026
name: /workspace/press — press/marketing asset manager
status: Implemented
module: Migration (MIG)
phase: Rebuild Phase 3
---

## Description
New cabinet. Operators manage the press kit (logos, team bios, platform stats, press contact details) that power the public `/press` page (FR-MIG-023).

## Users
Operators maintaining press/media relations content.

## Functional scope
1. `pages/workspace/press/index.astro` — sections for: media assets (download links), team bios (repeater), platform stats (key-value pairs), press contact.
2. Edit via `<Form>` singletons and repeaters.
3. Media asset upload → MinIO.
4. Changes reflect immediately on `/press` (SSR fetch on load).
5. AuthGuard (super-admin).

## Acceptance criteria
- [ ] Adding a new logo asset uploads to MinIO and appears on `/press`.
- [ ] Editing a team bio updates the public press page.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- No v1 equivalent (Directus direct).
- Depends on: FR-MIG-003 (`<Form>`), FR-MIG-005 (`<ActionBar>`).
