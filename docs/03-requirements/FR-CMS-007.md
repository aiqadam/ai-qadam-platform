---
code: FR-CMS-007
name: Public content pages — About Us, Community Rules & Documents, Events & History, Partner With Us
status: Implemented
module: CMS / Content (CMS)
phase: Rebuild Phase 3 (V2)
business_process: —
---

## Description

The platform adds four public, unauthenticated Astro pages in `apps/web-next` —
About Us (`/about`), Community Rules & Documents (`/rules` + `/rules/[slug]`),
Events & History (`/history`), and Partner With Us (`/partners`) — rendering
content authored and translated in Directus CMS. Content is read via the same
direct Astro-SSR-to-Directus pattern already used by `/press` (`FR-CMS-001`)
and `/welcome/[slug]` (`FR-CMS-002`), i.e. `apps/web-next/src/lib/cms.ts`
fetch helpers — **no NestJS module was created for this requirement**; see
Architecture note below.

## Users

Content editors (author/translate in Directus); Public (view, unauthenticated).

## Functional scope

1. **`content_pages` Directus collection** — slug-keyed rows for About Us,
   Events & History, and Partner With Us, with a flat per-locale
   `translations` JSON field (ru/en) following the same shape already proven
   by `events.translations` (`#326`), not Directus-native o2m translations.
   `status` (published/draft) gates visibility; `body_md` carries the
   free-form prose sections (mission/principles/governance on About Us).
   Structured sections with their own visual layout (chapter model,
   leadership team, meetup metrics/speaker rosters) are hardcoded directly
   in the corresponding `.astro` page rather than pulled from `body_md`, to
   preserve the source decks' stat-tile / card / chip presentation.
2. **`content_documents` Directus collection** — one row per source
   governance document for the Community Rules & Documents library (5 rows:
   Manifesto, Charter v0.1, Kazakhstan MoU, Global Board Положение v1.0,
   Soglashenie v1.0). Fields: `slug`, `title`, `source_document_label`,
   `status_label` (e.g. "Current" / "Superseded by Charter v0.1"), `body_md`
   (ru-only for this pass), `display_order`. Each row's `body_md` is a
   faithful reflow of that document's own structure/headings/wording — not
   synthesized, merged, or reconciled with any other row (e.g. the
   "Хранитель" vs "Основатель" founder-title difference between documents is
   preserved verbatim in each, not resolved).
3. **Routes:**
   - `/about` — mission statement, seven community principles, governance
     model summary (council of equals / consent / country leads), chapter
     model (UZ/KZ/TJ/beyond), leadership team, closing tagline. ru+en.
   - `/rules` — document library index listing all published
     `content_documents` rows with a `status_label` badge each, linking to
     `/rules/[slug]`. ru-only for this pass (explicit tracked gap, not a
     blocker — see Notes).
   - `/rules/[slug]` — one-document-per-page detail view; 404s (real HTTP
     404, not a redirect) on an unknown slug or `status != published`.
   - `/history` — founding timeline (Nov 2025 founding, 25 Apr 2026 first
     meetup Tashkent), Meetup #1 and #2 recaps (metrics + speaker rosters +
     talk titles), growth trajectory, roadmap/what's-next. ru+en.
   - `/partners` — partnership tiers and what partners unlock, current
     partners, regulator/government-partner value proposition, sponsorship
     call-to-action (`mailto:` CTA via `site_settings.contact_email_partners`
     convention). English content is complete; Russian content is
     best-effort (see Notes).
4. **Rendering** — shared `renderMarkdown()` helper (`apps/web-next/src/lib/render-markdown.ts`):
   `marked` (CommonMark + GFM tables) → `isomorphic-dompurify` with a tight
   tag/attribute allowlist and an explicit `ALLOWED_URI_REGEXP` restricting
   link schemes to `https`, `http`, `mailto`, `tg` (matching
   `docs/04-development/security/security.md`'s documented URL-scheme
   policy). Used by all four pages wherever `body_md` is rendered.
5. **Resilience** — if Directus is temporarily unreachable, all four pages
   return a graceful fallback rather than a 500, consistent with
   `FR-CMS-001`'s existing press-page resilience pattern.
6. **Nav placement** — links to all four pages added to `AppNav`'s center
   cluster (`hidden lg:inline-flex`, desktop-only to avoid crowding the
   compact mobile header) and to a new "Site" column in `AppFooter` (covers
   discoverability below the `lg` breakpoint).
7. **Design-system compliance** — Lucide icons only, no raw hex values, no
   new CSS custom properties/tokens, existing component classes only, across
   all four pages.

## Architecture note (binding, not just historical)

`docs/04-development/architecture/architecture.md`'s NestJS module-boundary
diagram lists a `content/` module ("Bridge to Directus for content reads").
**No such module exists**, and this requirement does not create one — content
is read directly from Astro SSR via `apps/web-next/src/lib/cms.ts`, the same
pattern every other CMS-backed page in this codebase already uses
(`/press`, `/welcome/[slug]`). `apps/api/src/modules/directus/` (the module
that does exist under a similar name) is scoped narrowly to user-account sync
and is unrelated to content reads. See architecture.md's own corrected note
next to the diagram line for the full explanation.

## Acceptance criteria

- [x] `/about` renders mission statement, seven principles, governance model
      summary, chapter model, leadership team, and closing tagline in the
      requested language (ru/en), using only design-system component classes
      and Lucide icons.
- [x] `/rules` lists all five `content_documents` rows as separate entries,
      each linking to its own `/rules/[slug]` detail page; content renders in
      Russian only, with no `en` toggle offered for this pass.
- [x] The Global Board Положение and Soglashenie v1.0 pages each show their
      own document's original founder-title term ("Основатель") verbatim;
      the Charter v0.1 and Kazakhstan MoU keep "Хранитель" — no
      reconciliation or unified terminology introduced anywhere on the site.
- [x] The Global Board Положение v1.0 and Soglashenie v1.0 pages each display
      a visible "Superseded by Charter v0.1" label while still rendering
      their full original content (not removed, redacted, or redirected).
- [x] `/history` renders the founding timeline, both meetup recaps (metrics +
      speaker roster + talk titles each), growth trajectory, and
      roadmap/what's-next, in the requested language (ru/en).
- [x] `/partners` renders complete English content (tiers, current partners,
      regulator/government value proposition, sponsorship CTA); the Russian
      version renders whatever content is available without erroring or
      500-ing (partial-content Russian is an accepted release state — see
      Notes).
- [x] No page contains content, links, or references derived from the two
      explicitly excluded source files (`AI Qadam BFT v0_1`,
      `Приложение№1_2026.doc`).
- [x] If Directus is temporarily unreachable, all four pages return a
      graceful fallback rather than a 500.
- [x] URL slugs (`/about`, `/rules`, `/history`, `/partners`) and their nav
      placement are confirmed, not merely assumed (see Functional scope §6).
- [x] No raw hex values, no new CSS custom properties/tokens, and no
      non-Lucide icon sets appear anywhere in the new page or component code.
- [x] `pnpm arch:check`, `astro check`, and `pnpm build` all pass with no new
      violations.

## Notes

- **Community Rules & Documents is Russian-only in this pass by explicit
  requirement scope**, not an oversight — an English translation is a
  tracked, future gap, surfaced on-page via a `rules.language_note` i18n key.
- **`/partners` Russian content is best-effort.** The source
  `AI-Qadam-sponsorship-deck-ru.pdf` has a font-embedding defect preventing
  full Russian text recovery; regulator-deck Russian content (which extracted
  cleanly) is used where available. A future workflow re-exporting that PDF
  with fixed font embedding would let a follow-up pass complete the Russian
  partnership copy. Not a blocking defect per this FR's own acceptance
  criteria.
- **About Us leadership bios use English-source data for both locales'
  structural leadership section** — the Russian regulator deck's leadership
  slide text did not extract cleanly as bio prose. Role titles are largely
  language-agnostic; a Directus content author can refine bio copy post-
  deploy without a code change.
- No `apps/api` surface was added or changed by this requirement — see
  Architecture note above.
- V1 (`apps/web`): not applicable — these are new V2-only (`apps/web-next`)
  pages with no V1 equivalent to migrate from.
- No `BP-UAT-*` business process currently covers these pages (checked
  `docs/02-business-processes/uat/registry.md`'s full script list — all 21
  entries cover auth, events, registration, admin/ops, points, or referral
  flows; none is a public marketing/content-page surface). `business_process`
  is left as `—` per protocol rather than linking a non-matching script.
