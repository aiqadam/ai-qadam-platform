---
code: FR-MIG-008
name: /workspace/partners/[slug] — partner detail (read-only)
status: Shipped
module: Migration (MIG)
phase: Rebuild M2
---

## Description
Read-only partner detail page in the operator workspace. No PATCH endpoint exists for partners yet; this page is display-only.

## Users
Country leads, super-admins viewing partner records.

## Functional scope
1. `pages/workspace/partners/[slug].astro` — SSR-fetches partner by slug, renders via `<PartnerDetail>`.
2. Shows partner name, logo, tier, contact, linked events.
3. AuthGuard: operator role required.

## Acceptance criteria
- [ ] Page renders at `/workspace/partners/[slug]` with correct data.
- [ ] Anon visit redirects to sign-in.
- [ ] `pnpm arch:check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/workspace/partners/[slug].astro`.
- Block: `<PartnerDetail>` (already exists in web-next).
