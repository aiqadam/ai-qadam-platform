---
code: FR-MIG-024
name: /workspace/site-settings — homepage singletons editor
status: Not Started
module: Migration (MIG)
phase: Rebuild Phase 3
---

## Description
New cabinet (no v1 equivalent). Allows operators to edit the homepage hero, footer links, and contact details without an engineer touching Directus directly.

## Users
Super-admins, country leads updating homepage content.

## Functional scope
1. `pages/workspace/site-settings/index.astro` — singleton forms for: (a) homepage hero (headline, subheadline, CTA label + URL), (b) footer links (repeater: label + URL), (c) contact/social links.
2. Uses `<Form>` (FR-MIG-003) for each singleton.
3. PATCH Directus singleton collections on save.
4. AuthGuard (operator).

## Acceptance criteria
- [ ] Editing the hero headline and saving reflects on the homepage (no Directus UI required).
- [ ] Footer link repeater allows add/remove/reorder.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- Closes ADR-0032 debt: operators should never need Directus admin for routine content changes.
- Depends on: FR-MIG-003 (`<Form>`), FR-MIG-005 (`<ActionBar>`).
- Blocks cutover gate (parity-matrix "new cabinets" section).
