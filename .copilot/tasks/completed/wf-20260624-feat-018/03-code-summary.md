# Code Summary: FR-MIG-023

**Feature:** `/press + /global + /marketing/url-builder` pages
**Branch:** `feature/MIG-023-static-marketing-pages`
**Workflow:** wf-20260624-feat-018
**Agent:** CodeDeveloper

---

## What was implemented

Four files created (3 Astro pages + 1 React island) plus supporting lib extensions:

### 1. `apps/web-next/src/pages/press.astro`
SSR press/media kit page. Sections ported from v1:
- Hero with boilerplate from `press_page` Directus singleton
- Press contact (email + SLA prose)
- Leadership grid with headshot matching by name prefix
- Logo pack (3 PNG files from `/brand/`)
- Brand colors palette (OKLCH values from design-system)
- Fact sheet download (from `marketing_assets` category=fact-sheet)
- Community reports (from `marketing_assets` category=quarterly-digest)
- Press coverage (from `marketing_assets` category=press-coverage)

All sections gracefully degrade to empty-state prose when Directus returns no approved assets.

### 2. `apps/web-next/src/pages/global.astro`
SSR global splash with three country tiles (UZ, KZ, TJ). Each tile shows:
- Flag emoji
- Country name
- Description text
- Past-event count (from Directus aggregate)
- Links to respective subdomain

### 3. `apps/web-next/src/pages/marketing/url-builder.astro`
SSR shell page with `<UtmUrlBuilder>` island (`client:load`). Includes a rules summary section at the bottom.

### 4. `apps/web-next/src/blocks/marketing/UtmUrlBuilder.tsx`
React island with:
- 5 fields: destination URL, utm_source, utm_medium, utm_campaign, utm_content (optional)
- Datalist for utm_source and utm_campaign suggestions
- Select dropdown for utm_medium (from canonical UTM_MEDIUMS list)
- Live URL preview (useMemo, recomputes on every keystroke)
- Copy-to-clipboard button with idle/copied/failed states
- Reset button
- Per-field error validation (mirrors v1 validation logic)
- Wrapped in `<IslandRoot>` per ADR-0038 island pattern

### Supporting files

#### `apps/web-next/src/lib/utm.ts` (new)
Ported from v1 `apps/web/src/lib/utm.ts`:
- `UTM_MEDIUMS` array
- `UTM_MEDIUM_LABELS` Record
- `UTM_SOURCE_SUGGESTIONS` array
- `UTM_CAMPAIGN_SUGGESTIONS` array
- `validateUtmField()` function
- `buildUtmUrl()` function
- `BuildInput`, `BuildResult`, `BuildError` types

#### `apps/web-next/src/lib/cms.ts` (extended)
Added four new fetchers:
- `fetchPressPage()` — press_page singleton
- `fetchTeamMembers(opts)` — team_members collection with pressPageOnly filter
- `fetchMarketingAssets(opts)` — marketing_assets collection with category filter
- `fetchEventCountForCountry(country)` — past-event aggregate per country

#### `apps/web-next/blocks.md` (updated)
- Added page routes: `/press`, `/global`, `/marketing/url-builder`
- Added Marketing blocks section
- Added UtmUrlBuilder entry with props, states, features

---

## Design decisions

1. **SSR over SSG** — all three pages use `prerender = false` because they fetch live Directus data on every request (press page content, event counts). This matches v1 behavior and avoids the "Astro.request.headers not available on prerendered pages" error.

2. **Headshot matching by name prefix** — the same first-token matching approach from v1 is ported. Assets uploaded as "Binali Rustamov — founder headshot" match team member "Binali Rustamov" by splitting on whitespace and comparing the first token lowercase.

3. **UTM island is pure client-side** — no API calls, no TanStack Query. The URL is constructed entirely in-browser via `URLSearchParams`. This matches v1 behavior.

4. **Tailwind classes only** — following ADR-0038 §Locks #1. No inline `style=` attributes. Uses design system tokens via Tailwind utilities.

5. **Graceful degradation** — every Directus fetch returns an empty array / default values on failure. The press page renders all sections with empty-state prose when no approved assets exist, so the page is always meaningful.

---

## Verification

- `pnpm --filter web-next typecheck` — **pass** (0 errors, 0 new warnings)
- `pnpm --filter web-next build` — **pass** (complete in 15.62s)

---

## Files created/modified

**Created:**
- `apps/web-next/src/pages/press.astro`
- `apps/web-next/src/pages/global.astro`
- `apps/web-next/src/pages/marketing/url-builder.astro`
- `apps/web-next/src/blocks/marketing/UtmUrlBuilder.tsx`
- `apps/web-next/src/lib/utm.ts`

**Modified:**
- `apps/web-next/src/lib/cms.ts` (added 4 fetchers)
- `apps/web-next/blocks.md` (added page routes + marketing blocks section)
