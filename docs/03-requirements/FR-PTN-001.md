---
code: FR-PTN-001
name: Partner profiles
status: Shipped
module: Partners (PTN)
phase: Phase 1 (V1) / Rebuild M2.1 (V2, Shipped)
---

## Description

Companies that support AI Qadam events (as venues, food sponsors, or prize/monetary sponsors) have partner profiles. Partners are managed in Directus and appear on the homepage, event pages, and a partners cabinet in the operator workspace.

## Users

Public / Members (view); Organizers, Country Admins (manage).

## Functional scope

1. **Partner record** — `partners` Directus collection: `name`, `slug` (unique), `logo` (asset), `website_url`, `description_md`, `tier` (venue/food/product/monetary/media), `country` (FK, country-scoped), `status` (active/inactive), `sort`.
2. **Event–partner linking** — `event_partners` / `event_sponsors` junction: links a partner to an event with `tier` override (can differ from their default tier), `contribution_description`.
3. **Homepage partners row** — `fetchPartners(req)` returns active partners for the current country, sorted by `sort`. Displayed as a logo row on the homepage.
4. **Event page sponsors sidebar** — `fetchEventSponsors(eventId)` returns sponsors with logo, tier label, website link. Displayed on the event detail page.
5. **Partner detail page** — `/workspace/partners/[slug]` (operator-only): shows partner entitlements per tier, target audiences, cohort builder, contact info, logo kit download. Backed by `PartnerView` island.
6. **Operator partners list** — `/workspace/partners` lists all partners for the operator's country with basic info and status.

## Acceptance criteria

- [ ] A new partner created in Directus with `status=active` appears in the homepage partners row.
- [ ] An inactive partner does not appear on the homepage.
- [ ] A partner linked to an event appears in the event detail page's sponsors section with the correct tier label.
- [ ] The operator partner detail page shows the partner's audiences and a cohort builder.
- [ ] Partners are country-scoped: a UZ partner does not appear on the KZ homepage.

## Notes

- V2 (web-next): partner list is shipped as RB-P2; partner detail `/workspace/partners/[slug]` is shipped as M2.1.
- `Partner` is the umbrella term. `Sponsor` is a subtype providing monetary/material support. Both use the same `partners` collection (differentiated by tier).
