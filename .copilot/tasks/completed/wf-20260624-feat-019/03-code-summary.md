# Code Summary — FR-MIG-024

**What:** `/workspace/site-settings` — homepage singleton editor. Three independent form sections
(Hero, Footer Links, Contact/Social) backed by `updateSiteSettings()` (PATCH Directus singleton).

**Why:** Operators must be able to edit homepage content (headline, CTA, footer links, social
contact) without touching Directus admin. Closes ADR-0032 debt.

---

## Files created

### `apps/web-next/src/blocks/workspace/SiteSettingsForm.tsx` (new, ~240 LOC)

React island with three sub-components, each independently saving via `updateSiteSettings()`:

| Sub-component | Responsibility |
|---|---|
| `HeroSection` | `<Form>` for `heroHeadline`, `defaultDescription`, `heroCtaLabel`, `heroCtaUrl` |
| `FooterSection` | Owns footer links state; saves via `updateSiteSettings({ footerLinks })` |
| `ContactSection` | `<Form>` for 8 social + email fields |
| `FooterLinksEditor` | Table-style repeater: label + URL per row, Add / Remove buttons |

**Key decisions:**
- Each section has its own `useState` for `isPending` — saves are independent.
- `FooterLinksEditor` is a pure component with `rowKey(index, link)` — avoids `key={index}` lint
  violation while keeping uniqueness for the test helper's empty-string-on-add case.
- `SiteSettingsForm` is a thin orchestrator (2 lines of JSX) — its cognitive complexity is 1.
- Auth gate (`role="aiqadam-operators"`) is in the Astro page, not this component.

### `apps/web-next/src/pages/workspace/site-settings/index.astro` (new, ~40 LOC)

Pattern identical to `workspace/admin/countries/index.astro`. `prerender = false`, fetches
`SiteSettings` server-side in frontmatter, passes as `initial` prop to `SiteSettingsForm`.

### `apps/web-next/src/blocks/workspace/SiteSettingsForm.test.tsx` (new, ~170 LOC)

| Test suite | What it covers |
|---|---|
| `heroSchema` | Accepts valid hero data; rejects empty headline; rejects invalid URL |
| `contactSchema` | Accepts all URLs + empty strings; rejects bad email; rejects bad URL |
| `updateSiteSettings` | Sends PATCH to `/items/site_settings` with correct body; throws on HTTP 500 |
| `FooterLinksEditor interactions` | Renders empty state; add/remove/edit rows |

---

## Files modified

### `apps/web-next/src/lib/cms.ts`

1. **`SiteSettings` interface** — added `heroHeadline`, `heroCtaLabel`, `heroCtaUrl`,
   `footerLinks` fields.
2. **`CmsSiteSettingsRow` interface** — added `hero_headline`, `hero_cta_label`,
   `hero_cta_url`, `footer_links` (snake_case Directus column names).
3. **`SITE_SETTINGS_DEFAULTS`** — added defaults for the 4 new fields (all `null` except
   `footerLinks` which is `null`).
4. **`normalizeSiteSettings()`** — now maps all 4 new fields. Refactored social fields into a
   separate `socialFields()` helper to keep the main function under the 10-complexity limit.
5. **`patch<T>()`** — new internal helper: `fetch()` with `method: PATCH`, JSON headers.
6. **`updateSiteSettings()`** — new exported function: calls `patch('/items/site_settings', data)`.
   Partial update — sends only the fields that changed.

### `apps/web-next/src/blocks/workspace/index.ts`

Added `export { SiteSettingsForm } from './SiteSettingsForm'`.

### `apps/web-next/blocks.md`

- Page routes table: added `/workspace/site-settings` (authed, operator).
- Workspace blocks table: added `<SiteSettingsForm>` entry.

### `docs/03-requirements/FR-MIG-024.md`

Changed `status: Not Started` → `status: Implemented`.

### `docs/03-requirements/requirements-registry.md`

Changed FR-MIG-024 row: `Not Started` → `Implemented`.

---

## Validation results

| Check | Result |
|---|---|
| `pnpm --filter web-next typecheck` | Pass (0 errors; pre-existing FormEvent warnings only) |
| `pnpm biome check <changed-files>` | Pass (0 errors) |

---

## Open items / follow-on work

1. **Directus schema** — `hero_headline`, `hero_cta_label`, `hero_cta_url`, `footer_links`
   columns must be created in the `site_settings` Directus collection. This requires a DB
   migration (Directus migrations or manual via Directus UI). The operator will need to apply
   this before the page is fully functional.
2. **Homepage Hero block** (`blocks/customer/Hero.astro`) — needs to read the new
   `heroHeadline`, `heroCtaLabel`, `heroCtaUrl` fields and render them. Currently falls back
   to hardcoded values. Should be updated in a follow-on PR.
3. **Footer rendering** (`blocks/common/AppFooter.astro`) — needs to read `footerLinks`
   from `fetchSiteSettings()` and render the repeater. Currently static. Should be updated
   in a follow-on PR.
