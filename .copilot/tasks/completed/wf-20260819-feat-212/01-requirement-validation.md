# Requirement Validation — wf-20260819-feat-212

## Raw Input

> Add four public marketing/content pages to the portal — About Us, Community
> Rules & Documents, Events & History, and Partner With Us — sourced from the
> community's existing source documents (manifesto, charter, agreements,
> MoU, factsheet, partnership/sponsorship decks) under
> `portal-content/20260819/` (gitignored, local-only, not part of this diff).
> Content must be authored in Directus CMS (per architecture.md's existing
> Directus-native content model) with ru/en translations where source
> material supports it, rendered via new Astro pages in `apps/web-next`
> styled strictly per the design system readme (Lucide icons only, no raw
> hex, no new tokens, existing component classes).
>
> Page-by-page scope:
> 1. **About Us** — mission statement, seven community principles, governance
>    model summary (council of equals / consent / country leads), chapter
>    model (UZ/KZ/TJ/beyond), leadership team, closing tagline. ru+en.
> 2. **Community Rules & Documents** — a document library, ONE PAGE PER SOURCE
>    DOCUMENT (not synthesized/merged prose): Manifesto, Charter v0.1
>    (current), Kazakhstan MoU (current), Global Board Положение v1.0
>    (labeled superseded by Charter), Soglashenie v1.0 (labeled superseded
>    by Charter). Each document's own structure/headings/wording is reflowed
>    as-is into portal page markup using design-system typography/components
>    — no rewriting, merging, or reconciling wording differences between
>    documents (e.g. the "Хранитель" vs "Основатель" founder-title
>    inconsistency is NOT resolved — each document keeps its own original
>    term). ru-only for this pass; English translation is an explicit
>    tracked gap, not a blocker.
> 3. **Events & History** — founding timeline (Nov 2025 founding, 25 Apr 2026
>    first meetup Tashkent), Meetup #1 and #2 recaps (metrics + speaker
>    rosters + talk titles), growth trajectory, roadmap/what's-next. ru+en.
> 4. **Partner With Us** (new, added to original 3-page scope per PO decision
>    2026-08-19) — partnership tiers and what partners unlock, current
>    partners, regulator/government-partner value proposition, sponsorship
>    call-to-action. Sourced primarily from the English partnership/
>    sponsorship decks (complete) plus the Russian regulator deck; the
>    Russian sponsorship deck has a font-embedding defect preventing full
>    Russian text recovery and may need re-export before its content can be
>    used for the ru version of this page — a known content gap, not a
>    blocking defect in the code.
>
> Explicitly excluded from source material: `AI Qadam BFT v0_1` (internal
> product-requirements doc, not portal content) and
> `Приложение№1_2026.doc` (unrelated ABiTech/InterKvadroSoft contract annex,
> appears misplaced in the source folder).
>
> A prior triage pass (`00-content-triage.md`, this session) produced a full
> file-by-file content map and per-page heading outlines with source
> attribution — treated as the authoritative content plan rather than
> re-derived here; raw files remain on disk under `portal-content/20260819/`
> for exact wording/copy extraction.
>
> Architecture guidance (as stated in the raw request): architecture.md
> "already specifies Directus as CMS with a NestJS content bridge module for
> content reads ... follow that existing architectural decision rather than
> introducing static MDX/markdown content or a new content system."
>
> Placeholder ref in handoff.yaml: `FEAT-CONTENT-1` (superseded below).

---

## Analysis

### Completeness Issues Found

The `requirement_text` is unusually complete for a first pass — it already
carries page-by-page scope, source attribution (via the triage doc),
explicit language-parity decisions per page, and two explicit exclusions.
Two gaps remain, both resolved below with reasonable assumptions rather than
escalated:

1. **Directus schema shape unspecified.** The requirement says "authored in
   Directus" but doesn't name collections/fields. Resolved in the
   Formalized Requirement section below by extending the existing
   `landing_pages`-style pattern (FR-CMS-002) rather than inventing a new
   shape — a single generic `content_pages` collection is proposed, with a
   related `content_documents` collection for Page 2's one-doc-per-record
   library, both natively translatable.
2. **Routing/slugs unspecified.** No URL paths given. Resolved with
   conventional slugs (`/about`, `/rules`, `/history`, `/partners`) — flagged
   as an assumption for the CodeDeveloper to confirm against any existing
   nav/IA convention before implementation (see AC-9).

Neither gap is a blocker; both are ordinary implementation-detail decisions
a RequirementAnalyst is expected to make. **Gate status: not
`needs-clarification`** — see Gate Result.

### Conflicts with Existing Features

Checked `docs/03-requirements/requirements-registry.md` §CMS row and all six
`FR-CMS-*` files, plus `FR-MIG-023` (the other existing "static/marketing
pages" requirement) for overlap:

| Existing requirement | Scope | Overlap with this requirement |
|---|---|---|
| `FR-CMS-001` (Homepage + site CMS) | `/`, `/global`, `/press`, nav, `site_settings` singleton | None — different pages. Homepage's "mission_tagline" is a one-line summary; About Us is a full page. No shared collection. |
| `FR-CMS-002` (Landing pages) | `/welcome/[slug]` campaign pages, `landing_pages` collection, UTM/referral carry-through | None in page scope, but this is the **closest architectural precedent** — same "Directus collection with `body_md` → sanitized HTML render" shape this requirement should reuse rather than reinvent. No conflict; treated as a pattern to extend, not duplicate. |
| `FR-CMS-003` (Form builder) | Dynamic form schemas | Unrelated. |
| `FR-CMS-004` (Telegram broadcast composer) | Operator broadcast tool | Unrelated. |
| `FR-CMS-005` (Audience segment builder) | Operator segmentation | Unrelated. |
| `FR-CMS-006` (UTM URL builder) | `/marketing/url-builder` tool | Unrelated. |
| `FR-MIG-023` (`/press` + `/global` + `/marketing/url-builder`) | Static/marketing page migration to web-next | Same "static marketing page" *category* but a disjoint page set (press/global/URL-builder vs. About/Rules/History/Partners). No conflict. |

**No conflicting or duplicate requirement exists.** This is genuinely new
page-set scope within the CMS module. No existing FR needs to be revised or
superseded.

### Architectural Feasibility

The raw requirement instructs: *"architecture.md already specifies Directus
as CMS with a NestJS 'content bridge' module for content reads (no such
module exists yet — this is new, greenfield work) ... follow that existing
architectural decision."*

**This instruction does not match current shipped practice, and the
RequirementAnalyst is flagging the discrepancy rather than silently
formalizing a design that contradicts working precedent** (per role
process step 3, "check architectural feasibility... does it violate any
inviolable rules").

Verified by reading code directly, not just docs:

- `docs/04-development/architecture/architecture.md` line 138 lists
  `content/  # Bridge to Directus for content reads` inside the NestJS
  module-boundary diagram (`apps/api/src/modules/`). This module **does
  not exist** — confirmed via `apps/api/src/modules/*` directory listing
  (26 modules present, no `content/`).
- The module that *does* exist under a similar name,
  `apps/api/src/modules/directus/` (`DirectusModule`,
  `DirectusUsersBridgeService`, `DirectusClient`), is scoped narrowly to
  **user-account sync** (syncing platform users into Directus for
  attribution), not content reads. It is not a general content bridge and
  should not be repurposed as one without a separate architectural
  decision.
- The actual, shipped, working pattern for every existing CMS-backed page
  (`FR-CMS-001` homepage/press, `FR-CMS-002` landing pages, `FR-MIG-023`
  press/global) is **Astro reads Directus directly via SSR fetch helpers**
  in `apps/web-next/src/lib/cms.ts` (`directusBase()` picks the internal
  Docker-network URL server-side, public CDN URL client-side; graceful
  fallback to hardcoded defaults if Directus is unreachable). There is
  **no NestJS hop** in the request path for any content read today.
  `landing_pages` (FR-CMS-002) is the nearest precedent to Page 2's
  one-record-per-document library and already demonstrates the
  `body_md` → sanitized-HTML render shape this requirement needs.

**Resolution:** the Formalized Requirement below specifies the
**already-proven Astro→Directus-direct-SSR pattern**, matching
`apps/web-next/src/lib/cms.ts` and FR-CMS-002, and explicitly does **not**
require a new NestJS content-bridge module. This is a interpretation
correction, not a rule violation — the architecture doc's module-boundary
diagram is aspirational/stale on this one line (it was seemingly never
built because the direct-SSR pattern proved sufficient), and the raw
requirement's instruction to "follow that existing architectural decision"
is satisfied more accurately by following what Directus-as-CMS integration
actually looks like in this codebase today than by building a new backend
module purely to match an unbuilt diagram box. No inviolable rule (module
boundaries, cross-schema queries, single monorepo) is at risk either way —
Astro calling Directus's own HTTP API directly is not a cross-schema SQL
query (the forbidden thing per architecture.md's Data Ownership table); it
is the documented "NestJS reads via Directus API" pattern's sibling for
the one layer (Astro SSR) that already has direct Directus access for
every other content page in production.

**This does not block progress and does not need PO escalation** — it is
recorded here as a `failed-retry`-class completeness/feasibility
correction the analyst resolved directly, consistent with role process
step 5. Flagging it explicitly in the Formalized Requirement's
"Architecture correction" note so CodeDeveloper doesn't attempt to build an
unnecessary NestJS module, and so a future doc pass can consider updating
architecture.md's module diagram to drop the stale `content/` line (out of
scope for this workflow to fix the doc itself — noted, not actioned).

No other feasibility concerns:
- Directus-native translations (ru/en per document/field) — proven pattern,
  used by `event_content` translations (#326) and available on any
  collection.
- Design-system compliance (Lucide icons, no raw hex, existing component
  classes) — standard constraint already met by every other `web-next`
  page; no new tokens needed for a text-heavy content page.
- `prerender=false` SSR requirement for live-Directus pages — same pattern
  as `/press` (FR-CMS-001) and `/welcome/[slug]` (FR-CMS-002).

---

## Formalized Requirement

**`FR-CMS-007` — Public content pages: About Us, Community Rules & Documents,
Events & History, Partner With Us**

> Assigned per `docs/03-requirements/requirements-registry.md` §Module
> Abbrev table: module code `CMS` (content) is confirmed correct — six
> `FR-CMS-*` files already exist (001–006), all under the "CMS / Content"
> module label. Next available number is **007**. Using the `FR-<MODULE>-<N>`
> format per `docs/03-requirements/` file-naming convention (all
> non-superseded requirements in this registry use `FR-`, not `FEAT-`; the
> one `FEAT-` file found, `FEAT-UAT-COV-003`, is a workflow-tooling coverage
> item under module `WORKFLOW`, not a precedent for content requirements).
> The handoff.yaml placeholder `FEAT-CONTENT-1` is superseded by
> **`FR-CMS-007`**.

The platform adds four public, unauthenticated Astro pages in
`apps/web-next` — About Us (`/about`), Community Rules & Documents
(`/rules`), Events & History (`/history`), and Partner With Us
(`/partners`) — rendering content authored and translated in Directus CMS,
read via the same direct Astro-SSR-to-Directus pattern already used by
`/press`, `/global`, and `/welcome/[slug]` (`apps/web-next/src/lib/cms.ts`).
Styling follows the design system readme exactly (Lucide icons only, no raw
hex, no new design tokens, existing component classes only).

**Cross-references:**
- Extends the pattern established by `FR-CMS-001` (site-wide CMS content,
  `/press` SSR pattern) and `FR-CMS-002` (`landing_pages` collection,
  `body_md` → sanitized-HTML rendering — direct precedent for Page 2's
  document-library shape).
- Sibling static-page requirement: `FR-MIG-023` (`/press`, `/global`,
  `/marketing/url-builder`) — same category, disjoint page set, no overlap.
- Architecture: `docs/04-development/architecture/architecture.md` "CMS:
  Directus 11" (line 48) and "Content translations: Directus native
  translations" (line 74) — followed as specified. The module-boundary
  diagram's `content/` NestJS bridge (line 138) is **not** used for this
  requirement — see Architecture correction below.
- Source/content plan: `.copilot/tasks/active/wf-20260819-feat-212/00-content-triage.md`
  (authoritative page outlines; do not re-derive).
- Design system: `docs/04-development/design-system/Design system for AI
  agents/readme.md` — governs voice, copy rules, color/token rules, icon
  policy for all four pages.

**Architecture correction (binding for CodeDeveloper):** Do **not** create
`apps/api/src/modules/content/`. Read Directus directly from Astro SSR
frontmatter via `apps/web-next/src/lib/cms.ts` fetch helpers (add new
fetchers there, following the existing `directusBase()` / graceful-fallback
/ typed-row-mapping pattern), matching how `/press`, `/global`, and
`/welcome/[slug]` already work. `apps/api/src/modules/directus/` (the
users-bridge module) is unrelated and must not be repurposed for content
reads.

**Directus schema (proposed, for CodeDeveloper / DbMigrationAuthor to
confirm/refine, not to re-derive from scratch):**
- `content_pages` collection (singleton-per-slug or `slug`-keyed rows) for
  Pages 1, 3, 4 (About Us, Events & History, Partner With Us) — natively
  translatable fields (ru/en), structured per the triage doc's proposed
  heading outlines (§3 of `00-content-triage.md`), `body_md`-per-section or
  full-page `body_md`, `status` (published/draft), following FR-CMS-002's
  `landing_pages` field shape (`slug`, `title`, `status`, `body_md`, hero
  image, SEO fields) as the closest existing template.
- `content_documents` collection for Page 2 (Community Rules & Documents)
  — one row per source document (5 rows: Manifesto, Charter v0.1,
  Kazakhstan MoU, Global Board Положение v1.0, Soglashenie v1.0), fields:
  `slug`, `title`, `source_document_label`, `status_label` (e.g. "Current"
  / "Superseded by Charter v0.1"), `body_md` (ru-only for this pass — do
  **not** mark the collection's translation config as ru/en-required;
  leave `en` fields empty/absent per document until a future translation
  pass), `display_order`. Each row's `body_md` is a faithful reflow of that
  document's own structure/headings/wording — not synthesized or merged
  with any other row.

---

## Acceptance Criteria (draft)

**AC-1 (About Us renders, bilingual).**
Given the `content_pages` record for slug `about` is `status=published`
with both `ru` and `en` translations populated,
when a visitor requests `/about` (and the `ru`/`en` locale variants per the
site's i18n routing convention),
then the page renders mission statement, seven principles, governance
model summary, chapter model, leadership team, and closing tagline in the
requested language, using only design-system component classes and Lucide
icons.

**AC-2 (Community Rules & Documents lists exactly five documents, ru-only).**
Given the `content_documents` collection contains the five specified
records (Manifesto, Charter v0.1, Kazakhstan MoU, Global Board Положение
v1.0, Soglashenie v1.0),
when a visitor requests `/rules`,
then the page lists all five as separate entries, each linking to (or
expanding into) its own one-document-per-page view; content renders in
Russian only; no `en` toggle/locale variant is offered for this page in
this pass (an explicit "English translation coming" note is acceptable,
not required).

**AC-3 (Document content is reflowed, not synthesized).**
Given the Global Board Положение and Soglashenie v1.0 documents both use
the term "Основатель" while the Charter v0.1 and Kazakhstan MoU use
"Хранитель" for the same role,
when both documents' pages are rendered,
then each page shows its own document's original term verbatim — no
reconciliation, footnote-merging, or unified terminology is introduced
anywhere on the site as part of this requirement.

**AC-4 (Superseded documents are labeled, not removed).**
Given the Global Board Положение v1.0 and Soglashenie v1.0 are both
superseded/merged by the Charter v0.1 per the Charter's own text,
when either document's page renders,
then it displays a visible "Superseded by Charter v0.1" (or equivalent
design-system-styled) label, and the document's full original content is
still fully readable on the page (not removed, redacted, or replaced by a
redirect).

**AC-5 (Events & History renders, bilingual, with both meetup recaps).**
Given the `content_pages` record for slug `history` is published with
ru/en translations,
when a visitor requests `/history`,
then the page shows the founding timeline (Nov 2025 founding, 25 Apr 2026
first meetup), Meetup #1 recap (metrics + speaker roster + talk titles),
Meetup #2 recap (metrics + speaker roster + talk titles), growth
trajectory, and roadmap/what's-next, in the requested language.

**AC-6 (Partner With Us renders, ru content gap is tolerated not blocking).**
Given the `content_pages` record for slug `partners` is published with at
minimum full `en` content (per the complete English partnership/
sponsorship decks) and best-effort `ru` content (regulator deck content is
usable; sponsorship-deck-ru content may be incomplete due to the known
font-embedding defect),
when a visitor requests `/partners` in either language,
then the English version renders complete (tiers, current partners,
regulator/government value proposition, sponsorship CTA); the Russian
version renders whatever content is available without erroring, 500-ing,
or blocking the page from shipping — a partial-content Russian version
(or an English-only fallback with a visible note) is an acceptable release
state for this AC, not a defect.

**AC-7 (Excluded source files are not referenced anywhere).**
Given `AI Qadam BFT v0_1` and `Приложение№1_2026.doc` are explicitly
excluded source material,
when all four pages' content is reviewed,
then no page contains content, links, or references derived from either
excluded file.

**AC-8 (Directus unavailability does not 500 any of the four pages).**
Given Directus is temporarily unreachable,
when any of the four pages is requested,
then the page returns a graceful fallback (matching the existing
`SITE_SETTINGS_DEFAULTS`-style pattern in `cms.ts`) rather than a 500 —
consistent with FR-CMS-001's existing press-page resilience AC.

**AC-9 (Routing and nav placement confirmed, not assumed).**
Given no URL slugs or nav placement were specified in the raw requirement,
when CodeDeveloper begins implementation,
then the proposed slugs (`/about`, `/rules`, `/history`, `/partners`) and
their placement in site navigation (e.g. `<AppNav>` footer/header links)
are confirmed against any existing IA convention before merge — flagged
here as an assumption, not a blocking clarification, per Analysis section
above.

**AC-10 (Design-system compliance).**
Given the design system readme's closed color palette, Lucide-only icon
policy, and existing component classes,
when all four pages are reviewed,
then no raw hex values, no new CSS custom properties/tokens, and no
non-Lucide icon sets appear anywhere in the new page or component code.

**AC-11 (`pnpm arch:check` + `astro check` + `pnpm build` pass).**
Given the new pages and any new `cms.ts` fetchers/Directus collections,
when the standard V2 build gate runs,
then `pnpm arch:check`, `astro check`, and `pnpm build` all pass with no
new violations — consistent with FR-MIG-023's AC and the workflow's
production-readiness gate.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    Formalized as FR-CMS-007 (module code CMS confirmed against
    requirements-registry.md; next available number after FR-CMS-001..006).
    No conflicts found against any existing FR-CMS-* or FR-MIG-023.
    Architectural correction applied: the raw requirement's instruction to
    route content reads through a NestJS content-bridge module does not
    match shipped practice (no such module exists; the module
    architecture.md's diagram implies was never built). Requirement instead
    follows the proven Astro-SSR-to-Directus-direct pattern already used by
    FR-CMS-001 and FR-CMS-002.
  findings:
    - "Module code CMS confirmed against requirements-registry.md §Module Abbrev table; assigned FR-CMS-007 (next after FR-CMS-001..006), superseding the handoff.yaml placeholder FEAT-CONTENT-1."
    - "No conflicts or duplicates: checked all six FR-CMS-* files and FR-MIG-023 (the other static/marketing-page requirement) — disjoint page scope in every case, with FR-CMS-002's landing_pages collection identified as the closest reusable pattern (body_md -> sanitized HTML)."
    - "Architectural correction (non-blocking): raw requirement said to route content reads through a NestJS 'content bridge' module per architecture.md line 138. Verified via apps/api/src/modules/* directory listing that no such module exists, and apps/api/src/modules/directus/ that does exist is scoped narrowly to user-account sync (DirectusUsersBridgeService), not content. The actual shipped pattern for every existing CMS page (FR-CMS-001 /press, FR-CMS-002 /welcome/[slug], FR-MIG-023 /global) is direct Astro-SSR-to-Directus reads via apps/web-next/src/lib/cms.ts with no NestJS hop. Formalized requirement follows this proven pattern and flags apps/api/src/modules/content/ as explicitly not to be built."
    - "Two completeness gaps resolved with documented assumptions rather than escalated: Directus schema shape (proposed content_pages + content_documents collections, modeled on FR-CMS-002) and URL slugs (/about, /rules, /history, /partners, flagged in AC-9 for CodeDeveloper confirmation)."
  completeness_check:
    specific: true
    testable: true
    non_conflicting: true
    scoped_to_one_module_layer: true
    referenced: true
  blocking: false
  needs_clarification: false
```
