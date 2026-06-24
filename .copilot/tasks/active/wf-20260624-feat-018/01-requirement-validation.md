# Requirement Validation: FR-MIG-023

**Requirement:** `/press + /global + /marketing/url-builder` pages
**Analyst:** Orchestrator (requirement validation documented)
**Timestamp:** 2026-06-24T10:30:00Z
**Workflow:** wf-20260624-feat-018

---

## Raw Input

From `.copilot/tasks/active/wf-20260624-feat-018/handoff.yaml` and `docs/03-requirements/FR-MIG-023.md`:

### Requirement Summary
Three marketing/static pages:
1. `pages/press.astro` — press kit page: media assets, team bios, platform stats, press contact
2. `pages/global.astro` — global community overview with country tiles
3. `pages/marketing/url-builder.astro` — UTM URL builder island

### Dependencies
- None (MIG-022 and MIG-021 are shipped)

---

## Analysis

### Completeness Issues Found

1. **Press page scope**: The FR lists 4 sections but v1 has 6 sections (adds logo pack, brand palette)
2. **Global page**: The FR claims "upcoming events across all tenants" but v1 shows past-event counts per country
3. **UTM builder**: The FR says `utm_source` validates against allowed list, but v1 uses free-text with datalist suggestions

### Clarifications Applied

| FR Statement | v1 Reality | Resolution |
|---|---|---|
| Press has 4 sections | Has 6 sections (add logo pack, brand palette) | Port all 6 sections |
| Global shows "upcoming events" | Shows past-event counts per country | Port event counts pattern |
| `utm_source` validates against list | Free-text with datalist suggestions | Port with suggestions |

### Architectural Feasibility

**Overall: Feasible**

| Page | v1 Pattern | web-next Pattern | Status |
|------|-----------|------------------|--------|
| `/press` | SSR, fetches Directus | SSR, reuse api-ssr helpers | Feasible |
| `/global` | SSR, country tiles | SSR, reuse existing patterns | Feasible |
| `/marketing/url-builder` | React island | React island | Feasible |

---

## Formalized Requirement

### Scope

**Must implement:**
1. `apps/web-next/src/pages/press.astro`
   - SSR page (`prerender = false`)
   - Sections: hero/boilerplate, press contact, leadership grid, logo pack, brand colors, fact sheet, quarterly digests, press coverage
   - Fetches from `marketing_assets`, `press_page`, `team_members` Directus collections

2. `apps/web-next/src/pages/global.astro`
   - SSR page (`prerender = false`)
   - Three country tiles (UZ, KZ, TJ) with flags and event counts
   - No auth required

3. `apps/web-next/src/pages/marketing/url-builder.astro`
   - SSR shell with React island
   - `<UtmUrlBuilder>` island component
   - Client-side URL construction with copy-to-clipboard

4. `apps/web-next/src/blocks/marketing/UtmUrlBuilder.tsx`
   - React island: 5 fields (destination URL, utm_source, utm_medium, utm_campaign, utm_content)
   - Live URL preview
   - Copy-to-clipboard functionality
   - Error validation per field

### Cross-references

| Related FR | Relationship |
|------------|--------------|
| FR-MIG-022 | Uses similar SSR + island patterns |
| FR-CMS-006 | UTM URL builder source spec |

---

## Acceptance Criteria (draft)

### Press Page
- **GIVEN** a user visits `/press`
- **WHEN** the page renders
- **THEN** it shows: hero with boilerplate, press contact, leadership grid with headshots, logo downloads, brand colors, fact sheet, quarterly digests, press coverage
- **AND** content comes from Directus collections

### Global Page
- **GIVEN** a user visits `/global`
- **WHEN** the page renders
- **THEN** it shows three country tiles (UZ, KZ, TJ) with flags
- **AND** each tile shows event count for that country
- **AND** clicking a tile links to that country's subdomain

### UTM Builder
- **GIVEN** an operator uses `/marketing/url-builder`
- **WHEN** they fill in destination URL, source, medium, and campaign
- **THEN** the tagged URL preview updates live
- **AND** clicking "Copy URL" copies the URL to clipboard

### Build
- **GIVEN** all pages are implemented
- **WHEN** `pnpm arch:check` + `astro check` + `pnpm build` run
- **THEN** all pass

---

## Gate Result

**Status:** passed
**Attempt:** 1
**Timestamp:** 2026-06-24T10:30:00Z

**Summary:** FR-MIG-023 is feasible as specified. Three pages to implement with clear v1 references. Clarifications documented: press page has 6 sections (not 4), global page shows past-event counts (not upcoming events), UTM source uses datalist suggestions (not locked list). All patterns fit the Astro SSR/SSG architecture.

**Decision Rationale:**
1. All page patterns are architecturally feasible with Astro SSR
2. UTM builder is a pure client-side island — no API calls needed
3. Press page uses existing Directus CMS patterns
4. Global page uses existing country event count patterns
5. No dependencies on in-progress features
