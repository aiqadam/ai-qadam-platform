---
code: FR-CMS-001
name: Homepage and site-wide CMS content
status: Shipped
module: CMS / Content (CMS)
phase: Phase 1 (V1) / Customer Surface Finish Line (CSF)
---

## Description

The platform homepage (`/`) and global site elements (navigation brand, site settings, press page, team members) are managed via Directus CMS. Content editors can update these without engineering involvement. The web layer reads from Directus via server-side fetch (never from the browser).

## Users

Content editors, Super Admin (manage content); Public (view).

## Functional scope

1. **Site settings singleton** — `site_settings` Directus collection (singleton): `site_name`, `mission_tagline`, `homepage_stats_events` (int), `homepage_stats_members` (int), `homepage_stats_countries` (int), `partner_cta_text`, `telegram_invite_url`. Falls back to hardcoded `SITE_SETTINGS_DEFAULTS` if Directus is unavailable.
2. **Homepage sections** (all read from CMS, country-scoped):
   - **Hero** — Next upcoming event card (fetched via `fetchUpcomingEvents`, first result).
   - **Events grid** — Next 3 upcoming events.
   - **Stats band** — 3 stats from `site_settings` (updated manually by operator).
   - **Partners row** — Active partners for the current country (`fetchPartners`).
   - **Recent recordings** — Last 3 event recordings from `event_materials` where `kind=recording` and `event.status=published`.
   - **Lead capture form** — `LeadCaptureForm` island (anonymous email collection).
3. **Geo redirect** — Apex `aiqadam.org` 302-redirects to `<country>.aiqadam.org` based on `cf-ipcountry` header. Falls back to `/global` (country picker) when header is absent.
4. **Country picker (`/global`)** — Shows UZ / KZ / TJ tiles with per-country event counts (`fetchEventCountForCountry`).
5. **Press kit page (`/press`)** — SSR page (must be `prerender=false`): press boilerplate, leadership headshots, logos, brand palette, fact sheet, quarterly digests, coverage. Reads from `press_page` singleton + `team_members` collection + `marketing_assets` collection.
6. **Marketing assets** — `marketing_assets` Directus collection: `status=approved`, `visibility=public` gated. Used for logos, headshots, press materials. Served via Directus `/assets/<file-id>`.

## Acceptance criteria

- [ ] Updating `site_settings.mission_tagline` in Directus updates the homepage hero text on next load.
- [ ] Visiting `aiqadam.org` from a Kazakh IP redirects to `kz.aiqadam.org`.
- [ ] Visiting `aiqadam.org` from an unknown IP shows `/global` country picker.
- [ ] `/press` loads without 500 errors even if Directus is temporarily unavailable (falls back to defaults).
- [ ] A `status=draft` marketing asset does not appear on the press page.
- [ ] The homepage partners row shows only `status=active` partners for the current country.

## Notes

- V2 (web-next): homepage is partially shipped (lean hero + events grid). Stats band, partners row, recordings, and full hero richness are part of the Customer Surface Finish Line (CSF, row 34 in requirements registry).
- Press page is `prerender=false` in both V1 and V2 because it fetches live Directus data at render time.
