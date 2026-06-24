---
code: FR-MIG-023
name: /press + /global + /marketing/url-builder — static and marketing pages
status: Implemented
module: Migration (MIG)
phase: Rebuild M3
---

## Description
Three marketing/static pages. Low complexity; mostly CMS-driven content with one interactive tool.

## Users
Press contacts, global visitors, operators building UTM-tagged links.

## Functional scope
1. `pages/press.astro` — press kit page: media assets download, team bios, platform stats, press contact. Content from Directus `marketing_assets` collection.
2. `pages/global.astro` — global community overview (cross-country stats, upcoming events across all tenants). Read-only, no auth.
3. `pages/marketing/url-builder.astro` — UTM URL builder tool (`<UtmUrlBuilder>` island). Builds and copies UTM-tagged links; validates against the locked UTM scheme.

## Acceptance criteria
- [ ] Press page renders team bios and media assets from Directus.
- [ ] Global page aggregates events and stats across all country tenants.
- [ ] UTM builder validates `utm_source` against the allowed values list and copies the result URL.
- [ ] All three pages are publicly accessible (no auth).
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/press.astro`, `global.astro`, `marketing/url-builder.astro`.
- `<UtmUrlBuilder>` exists in v1 as `UtmUrlBuilder.tsx` — port to web-next blocks.
- Related: FR-CMS-006 (UTM URL builder application FR).
