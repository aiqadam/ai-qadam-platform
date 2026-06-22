---
code: FR-CMS-002
name: Landing pages and campaign content
status: Shipped
module: CMS / Content (CMS)
phase: Phase 1 (V1) / Rebuild Phase 3 (V2, Not Started)
---

## Description

Operators can create campaign landing pages for specific initiatives (event invitations, speaker recruitment, sponsor pitches). These are managed in Directus and rendered at `/welcome/[slug]`. UTM and referral attribution is carried through CTA links. Draft/archived pages return 404.

## Users

Content editors, Organizers (create); Public (view).

## Functional scope

1. **Landing pages collection** — `landing_pages` Directus collection: `slug` (unique, `^[a-z0-9][a-z0-9-]{0,63}$`), `title`, `status` (published/draft/archived), `hero_image` (asset), `body_md` (markdown content including images and links), `primary_cta_text`, `primary_cta_url`, `secondary_cta_text`, `secondary_cta_url`.
2. **Route** — `/welcome/[slug]` (SSR, `prerender=false`). Returns 404 if `status != published` or slug not found.
3. **Rendering** — Radial hero image, `body_md` rendered to HTML (sanitized), primary and secondary CTA buttons.
4. **Attribution carry-through** — An inline client script reads `?utm_*` and `?ref=` from the landing page URL and appends them to relative CTA links before navigation. This ensures UTM attribution is preserved from ad → landing page → registration.
5. **SEO** — OG title/description/image from the landing page fields. Canonical URL. `robots: noindex` for draft/archived pages (but 404 prevents serving anyway).

## Acceptance criteria

- [ ] A published landing page at `/welcome/my-event` renders with hero, body, and CTA buttons.
- [ ] A draft or archived landing page returns 404.
- [ ] Visiting `/welcome/my-event?utm_source=tg&utm_medium=social` and clicking the primary CTA carries `utm_source=tg&utm_medium=social` in the destination URL.
- [ ] An invalid slug (containing special characters) returns 404.
- [ ] The hero image is served from Directus assets at the correct CDN URL.

## Notes

- V2 (web-next): not started (M3.4 "welcome" milestone).
- The UTM carry-through script is a small inline JS (no external dependency) that runs after paint via `Layout.astro`.
