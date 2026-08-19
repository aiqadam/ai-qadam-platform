# Impact Analysis — wf-20260819-feat-212

## Validated Requirement

**`FR-CMS-007`** — Four new public, unauthenticated Astro pages in
`apps/web-next`: About Us (`/about`), Community Rules & Documents
(`/rules`), Events & History (`/history`), Partner With Us (`/partners`).
Content is authored/translated in Directus CMS and read via the same
direct **Astro-SSR-to-Directus** pattern already used by `/press`,
`/global`, and `/welcome/[slug]` (`apps/web-next/src/lib/cms.ts`) — **not**
a new NestJS module. Styling follows the design-system readme exactly
(Lucide icons only, no raw hex, no new tokens, existing component
classes). Full page-by-page content plan: `00-content-triage.md` §3
(authoritative — not re-derived here).

Confirmed by direct code inspection (not just docs):
- `apps/web-next/src/lib/cms.ts` (976 lines) is a flat set of exported
  fetcher functions, each following the same shape: build a Directus
  REST query with `URLSearchParams`, call the module-private `get<T>()`
  helper, map the snake_case Directus row to a camelCase TS interface,
  and **catch-and-fall-back-to-defaults/null/[]** on any failure (never
  throw into the page). `directusBase()` picks the internal Docker
  network URL server-side and the public CDN URL client-side.
- `apps/api/src/modules/content/` does **not exist**.
  `apps/api/src/modules/directus/` exists but is scoped to user-account
  sync only (`DirectusUsersBridgeService`) — confirmed unrelated,
  matches the requirement doc's "Architecture correction" note.
- No `packages/shared-types` entry exists for any existing CMS
  collection (`landing_pages`, `press_page`, `site_settings`,
  `team_members`) — types for these stay local to
  `apps/web-next/src/lib/cms.ts` / `apps/web-next/src/lib/types.ts`.
  This requirement should follow the same containment.

---

## Affected Layers

### API (NestJS)

| Module | Change | Notes |
|---|---|---|
| — | **None.** | No `apps/api/src/modules/*` change of any kind. This is the binding architecture correction from `01-requirement-validation.md` — do not create `content/`, do not touch `directus/` (unrelated, user-sync only). |

### DB Changes Required: **Yes — Directus schema, not Drizzle/Postgres migration**

This is not a `DBMigrationAuthor`-owned Drizzle migration (no `apps/api`
Drizzle schema file changes). It is a **Directus collection bootstrap**,
following the exact pattern in `infrastructure/directus/bootstrap.sh`
(idempotent `ensure "collection X" ...` blocks, e.g. the `landing_pages`
block at line 754 and `press_page` at line 5390).

Two new collections needed, added as new `ensure` blocks to
`infrastructure/directus/bootstrap.sh` (do **not** create a separate
bootstrap script — this file is the single source of truth and every
existing collection, including `landing_pages`, lives here):

1. **`content_pages`** — one row per slug, for Pages 1/3/4 (About,
   History, Partners). Modeled directly on the `landing_pages` field
   shape (`slug` unique + regex-validated, `status`
   draft/published/archived, `body_md` type `text` with
   `input-rich-text-md` interface, `date_created`/`date_updated`).
   **Needs bilingual content** (ru/en) — `landing_pages` itself has
   *no* `translations` field (it's single-locale), so the closer schema
   precedent for the *i18n shape specifically* is `events.translations`
   (bootstrap.sh line ~4866): a nullable `json` field, interface
   `input-code`/language json, holding a per-locale subobject map
   (`{"ru": {...}, "en": {...}}`), with **top-level fields as the
   tenant-default-locale fallback** — not a Directus-native
   `directus_translations` junction table. CodeDeveloper/
   DBMigrationAuthor should confirm which of these two translation
   mechanisms Directus-native o2m translations vs. the flat-JSON
   `translations` field pattern) to use; the flat-JSON one is what's
   actually shipped and battle-tested in this codebase today (events),
   despite `01-requirement-validation.md` and architecture.md both
   describing "Directus-native translations" — this is a second,
   smaller instance of the same doc-vs-shipped-practice gap already
   flagged for the NestJS module. **Not a blocker**, but flagged here
   so CodeDeveloper doesn't reach for an unproven Directus o2m
   translations collection when a proven flat-JSON pattern already
   exists and is simpler to bootstrap idempotently.
2. **`content_documents`** — one row per source document, for Page 2
   (Rules & Documents), 5 seed rows (Manifesto, Charter v0.1, Kazakhstan
   MoU, Global Board Положение v1.0, Soglashenie v1.0). Fields per
   `01-requirement-validation.md`: `slug`, `title`,
   `source_document_label`, `status_label`, `body_md`, `display_order`.
   **ru-only** — no `translations` field needed for this pass (matches
   AC-2's explicit no-`en`-toggle scope). Seed data itself (the 5 rows'
   `body_md`) is a **content-authoring task**, not a schema task —
   bootstrap.sh's `ensure`-style idempotent seeding (see `seed_team_member`
   at line 5661 for the pattern) could optionally seed the 5 rows, or an
   operator/DocWriter could author them directly in the Directus admin
   UI post-deploy. Recommend CodeDeveloper decide based on whether the
   workflow wants the content committed to bootstrap.sh (reproducible,
   reviewable in the PR diff) vs. authored live in Directus (matches "CMS
   content lives in Directus" spirit more literally). Either way the
   *collection schema* must land in bootstrap.sh.

Both collections need a **public read permission** grant (`ensure_perm`
pattern, e.g. `perm press_page/read` at line 5438, filtered to
`status: {_eq: "published"}` for `content_pages` matching
`landing_pages`'/`fetchLandingPage`'s existing filter convention; no
status filter needed for `content_documents` if it has no draft state,
or the same published filter if it does — CodeDeveloper to decide based
on whether an unpublished-document workflow is wanted).

**This is new schema, so DBMigrationAuthor's Directus-flavored
counterpart in this workflow is: add `ensure` blocks to
`infrastructure/directus/bootstrap.sh` + (if a live Directus target
needs the change applied) re-run bootstrap.sh against it. This does
**not** touch Drizzle/Postgres at all** — `apps/api`'s DB migration
path is untouched by this requirement.

### Shared Types (`packages/shared-types`)

**None.** Consistent with every existing CMS-content fetcher
(`SiteSettings`, `PressPage`, `TeamMember`, `CmsLandingPage`), the new
collections' TS interfaces belong locally in
`apps/web-next/src/lib/cms.ts` (or `apps/web-next/src/lib/types.ts` if
CodeDeveloper prefers separating types from fetchers, matching the
`ApiEvent`/`EventSpeaker` split already used for the events fetchers).
No cross-app consumer exists for this content (bot/workers never read
CMS content pages), so there is no cross-package sharing need.

### Frontend (`apps/web-next`)

**New fetchers in `apps/web-next/src/lib/cms.ts`** (append, following the
file's existing section-comment-block convention, e.g.
`fetchContentPage(slug)` for `content_pages` and
`fetchContentDocuments()` / `fetchContentDocument(slug)` for
`content_documents`), plus corresponding TS interfaces.

**New pages** — **must be created via `pnpm gen:page`
(`tools/gen/page.ts`)**, not hand-authored. This is enforced by
`tools/architecture-check.ts`'s `page-not-from-generator` rule (Lock 2,
line ~228–254): every `.astro` file under `apps/web-next/src/pages/`
must carry a `// @generated-from gen:page` header comment or `pnpm
arch:check` fails the build gate (AC-11 depends on this passing).
CodeDeveloper must run the generator for all four pages, not copy an
existing page file and edit it by hand (the marker alone isn't
sufficient — but skipping the generator risks missing whatever
scaffolding it emits).

**Location: page root, not `marketing/`.** Checked all three cited
precedent pages (`/press`, `/global`, `/welcome/[slug]`) plus every
other public content-ish page (`/events`, `/leaderboard`,
`/checkin`) — **none** live under `src/pages/marketing/`. That
directory currently contains exactly one file,
`marketing/url-builder.astro`, which is an **internal operator tool**
(UTM link builder), not public content — its own page copy labels it
"Marketing tools" as an operator-facing utility page, unrelated to
this requirement's audience. The four new pages should land at
`apps/web-next/src/pages/about.astro`, `rules.astro`, `history.astro`,
`partners.astro` (flat, matching `/press`, `/global`), confirming
`01-requirement-validation.md`'s proposed slugs are also correct as
**file locations**, not just URL paths. **`marketing/` is not the
correct home for these pages** — flagging this explicitly since the
task brief asked to check it as a "likely" location; it is not.

**Rules page needs a nested dynamic route** for the one-page-per-document
requirement (AC-2/AC-3/AC-4): `/rules` (index/library list) +
`/rules/[slug].astro` (or `/rules/[doc].astro`) for each document's own
page, following the exact `welcome/[slug].astro` pattern (dynamic
`Astro.params`, 404-via-redirect on miss, `prerender = false`).

**Body-content rendering gap (flag, not necessarily this workflow's to
fix):** `welcome/[slug].astro` lines 47–52 currently do
`<div class="prose ..." set:html="" />` — the `set:html` binding is a
**literal empty string**, not `page.bodyMd`. This means `body_md` is
never actually rendered on the one existing V2 page that has a
`body_md` field, despite FR-CMS-002's own AC #3 requiring "body_md
rendered to HTML (sanitized)". This is a **pre-existing defect**
unrelated to this requirement, but it directly affects this
requirement because `content_pages` and `content_documents` both rely
on `body_md` rendering as their primary content delivery mechanism —
CodeDeveloper cannot copy `welcome/[slug].astro`'s current body-render
block as a working reference; it must build (or fix) real markdown
rendering. Two options exist in the codebase today:
  - `apps/web-next/src/blocks/common/MarkdownBody.astro` — a small
    hand-rolled `escape()`-then-wrap renderer (blank-line block split,
    `- ` bullet detection, no headings/emphasis/links). Safe (all text
    passes through an HTML-entity escape before `set:html`), but too
    limited for the Rules & Documents pages, which need real document
    structure (headings, sub-sections, possibly links) reflowed from
    source Word docs per AC-3.
  - `isomorphic-dompurify` is already a project dependency (used by
    `AnnounceComposer.tsx`, a React island) and has a passing regression
    test (`apps/web-next/src/lib/isomorphic-dompurify-resolution.test.ts`)
    confirming it resolves and sanitizes correctly in this SSR bundle.
    No existing `.astro` page currently pipes CMS markdown through it +
    a real markdown-to-HTML parser (e.g. `marked`/`markdown-it`, neither
    of which appears to be installed yet — CodeDeveloper should check
    before assuming one is available). This is very likely the correct
    direction for the two new content-heavy pages (Rules & Documents
    especially, given the "reflow as-is, preserve headings" requirement
    in AC-3), but it is new plumbing, not a copy-paste of an existing
    working page.
  Recommend CodeDeveloper treat "wire up real `body_md` → sanitized-HTML
  rendering, shared between the new pages and (ideally) fixing
  `welcome/[slug].astro`'s dead binding" as an explicit, scoped sub-task
  — worth a one-line note in the PR description either way, since a
  reviewer diffing against `welcome/[slug].astro` will otherwise
  reasonably ask "why doesn't this match the existing page's renderer."

**i18n:** `apps/web-next/src/lib/i18n.ts` (`getLocale`, `makeT`) is
already used by `/global` and `/welcome/[slug]` for UI chrome strings.
CMS-sourced body content (mission statement, principles, etc.) is a
different i18n axis — driven by the Directus row's per-locale content,
not `makeT`. About Us and Events & History need both: `makeT` for
static UI labels (nav, buttons) and the Directus `translations` JSON
field (or per-locale top-level content fields) for the actual page
prose.

**Nav placement (AC-9):** No existing `<AppNav>` inspection was done in
this pass since it's explicitly flagged as a CodeDeveloper
confirmation step in AC-9, not an ImpactAnalyzer decision — noting only
that `apps/web-next/src/layouts/Layout.astro` and whatever nav
component it composes will need a look before merge to decide
header/footer link placement for 4 new top-level routes.

### Bot (`apps/bot`)

**None.** No aiogram handler, keyboard, or command touches marketing
content pages. Confirmed no overlap by grep of the requirement against
bot scope — this is purely a web surface.

### Workers (`apps/workers`)

**None.** No BullMQ queue/processor involvement — these are simple SSR
reads with no async processing, notification, or scheduled job
component.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| *(none — no NestJS route added, modified, or removed)* | — | — | No |

No `apps/api` HTTP surface changes at all. The only "API surface" touched
is Directus's own REST API (`/items/content_pages`,
`/items/content_documents`), which is Directus's generic collection API,
not a bespoke endpoint this team owns/versions.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `apps/web-next` (Astro SSR frontmatter, new pages) | Directus (`content_pages`, `content_documents` collections) | Direct HTTP fetch through `apps/web-next/src/lib/cms.ts` new fetchers (`get<T>()` helper → `directusBase()`), identical mechanism to existing `fetchLandingPage`/`fetchPressPage`/`fetchSiteSettings` |

No NestJS involvement, no service-to-service call, no tenant-scoped data
(these are global/public content pages, not per-country data — unlike
`events`/`homepage_hero` which are country-scoped via `countryFromHost`).

---

## Risk Flags

### Security Review Required: **Yes, narrow scope**

Per the task brief's own framing, this is **CMS-authored, not
user-submitted** content — editors with Directus access author it, not
end users — so this is not the same threat model as e.g.
`AnnounceComposer`'s user-composed broadcast body or `event_questions`'
public-submitted Q&A. However, flag for SecurityReviewer specifically
because:

1. **`body_md` → HTML rendering path is not yet a solved/proven
   pattern in this codebase** (see Frontend section above —
   `welcome/[slug].astro`'s existing renderer is dead code, and
   `MarkdownBody.astro`'s hand-rolled escaper, while safe, wasn't
   designed for the richer markdown these pages need). Whatever
   CodeDeveloper builds to bridge that gap (likely `isomorphic-dompurify`
   + a markdown parser) is new sanitization logic and should get a
   SecurityReviewer pass — even trusted-editor content benefits from
   XSS-safe rendering as defense-in-depth (a compromised or careless
   Directus editor account, or a future workflow that opens content
   authoring to a wider group, shouldn't be able to inject `<script>`
   via `body_md`).
2. **Directus permission scoping** — both new collections need public
   *read* grants (matching `press_page`/`team_members`/`landing_pages`),
   but must **not** accidentally grant public *write* (the
   `ensure_perm`/permission-creation blocks in bootstrap.sh must be
   read-only for the Public policy, mirroring every existing public
   collection). Low risk given the existing pattern is well-established
   and copy-paste-safe, but worth a quick SecurityReviewer glance at the
   actual `ensure_perm` calls added, given bootstrap.sh's own comment
   history shows at least one prior incident
   (`ISS-SEC-DIRECTUS-USERS-PUBLIC-001`, line ~132) of an unintended
   public grant on `directus_users`.
3. **Excluded source material (AC-7)** — `AI Qadam BFT v0_1` (internal
   product roadmap doc) must not leak into any page's content
   (particularly the "BUILD" product-roadmap slide flagged in the
   triage doc's file #12 as bleeding into partnership-deck content —
   worth a content-level, not code-level, check that this slide's
   product-roadmap material doesn't get pulled into `/partners` copy).
   This is a content-authoring risk, not a code vulnerability, but
   worth naming since it's an explicit AC.

### Architecture Rule Risks: **None blocking**

- The NestJS-content-bridge deviation is already resolved and
  documented as a non-blocking correction in
  `01-requirement-validation.md` — reconfirmed here by direct code
  inspection, not just trusting the prior doc.
- `page-not-from-generator` (arch:check Lock 2) is a **hard gate**, not
  a risk — flagged above under Frontend as a binding process constraint,
  not a rule the requirement is at risk of violating, since compliance
  is straightforward (use `pnpm gen:page`).
- No cross-schema SQL query risk (Directus's own REST API is used, not
  a raw DB connection from Astro).
- No tenant-scoping risk — these pages are explicitly non-country-scoped
  (unlike `events`), so `countryFromHost` does not apply here; confirm
  CodeDeveloper doesn't accidentally add tenant filtering that isn't
  wanted.

---

## Test Scope

### Unit (Vitest)

- New `cms.ts` fetchers (`fetchContentPage`, `fetchContentDocuments`,
  `fetchContentDocument`) — follow the established
  local-re-implementation pattern in `cms-landing-page.test.ts` (no
  network mocking; re-implement fetcher logic in the test file and
  assert slug validation, query-param construction, and graceful
  null/[]-on-failure behavior). One test file per fetcher group, or
  extend `cms.test.ts` if that file already covers multiple fetchers —
  check its current scope before creating a new file.
- Any new markdown-rendering helper (if CodeDeveloper builds a shared
  `body_md` → sanitized-HTML renderer per the Frontend-section flag
  above) needs its own unit tests: escaping/XSS-safety assertions
  (`<script>` injection, `javascript:` hrefs) mirroring
  `AnnounceComposer.test.tsx`'s sanitization assertions, plus
  heading/structure-preservation assertions per AC-3's "reflowed as-is"
  requirement.
- Slug-format validation for the new `/rules/[slug]` dynamic route
  (mirroring the existing `fetchLandingPage` slug regex test coverage).

### Integration (Testcontainers)

**Not required.** No `apps/api` module changes means no NestJS
integration-test surface. If the team wants live-Directus integration
coverage for the new fetchers, that would be a Playwright/E2E concern
(below) rather than a Testcontainers-Postgres concern, since Directus
itself isn't part of the API's Testcontainers stack.

### E2E (Playwright, `apps/e2e`)

Recommended, matching the smoke-test pattern already established for
`/welcome/[slug]` (`apps/e2e/tests/smoke-onboarding.spec.ts` touches
`landing_pages`):

- Smoke test per page: `/about`, `/rules`, `/history`, `/partners`
  return 200 and render expected landmark content (H1, at least one
  section heading) — matching AC-1/AC-5/AC-6's "renders" language.
- `/rules` lists exactly 5 document entries and each links to a working
  `/rules/[slug]` detail page (AC-2).
- Superseded-document label renders on the 2 superseded docs' pages
  (AC-4) — a simple text-presence assertion ("Superseded by Charter
  v0.1").
- Directus-unreachable fallback (AC-8) — likely covered by the same
  test technique used for `SITE_SETTINGS_DEFAULTS`/`PRESS_PAGE_DEFAULTS`
  today, if such a technique exists in the E2E suite (worth checking;
  not confirmed in this pass — flag for TestStrategist to verify
  whether existing Directus-outage E2E coverage exists as a pattern to
  extend, or whether this AC is currently only unit-tested via the
  fetcher's try/catch fallback value).
- Design-system compliance (AC-10, no raw hex/new tokens/non-Lucide
  icons) is better suited to a lint/grep-based check (if one exists,
  e.g. a `pnpm design:check` or similar) than an E2E assertion — flag
  for TestStrategist to confirm whether such tooling exists or whether
  this AC is manual-review-only.

### Build gate (AC-11)

`pnpm arch:check` (validates `page-not-from-generator`,
`no-inline-style`, `no-raw-fetch` for the 4–5 new page files and any
new blocks), `astro check`, `pnpm build` — standard V2 gate, no special
handling needed beyond ensuring the pages are generator-created.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    Full impact scoped for FR-CMS-007. Confirmed by direct code
    inspection (not just the requirement doc) that no apps/api change is
    needed — apps/api/src/modules/content/ does not exist and must not
    be created; apps/api/src/modules/directus/ is unrelated
    (user-account sync only). All work is contained to
    apps/web-next/src/lib/cms.ts (new fetchers), four new
    generator-created Astro pages plus one nested dynamic route
    (/rules/[slug]) for the document library, and a new Directus schema
    bootstrap addition (two collections: content_pages, content_documents)
    in infrastructure/directus/bootstrap.sh. No packages/shared-types
    change, no bot/workers surface, no Drizzle/Postgres migration.
  findings:
    - "Architecture correction reconfirmed by inspection: apps/api/src/modules/content/ does not exist; apps/api/src/modules/directus/ exists but is scoped to user-account sync (DirectusUsersBridgeService), not content — matches 01-requirement-validation.md's correction exactly."
    - "marketing/ is NOT the right page location — checked and it holds only the internal operator UTM-builder tool. /press, /global, /welcome/[slug] all live at src/pages/ root; the four new pages (about.astro, rules.astro, history.astro, partners.astro) should follow that same flat placement, plus rules/[slug].astro for the one-page-per-document requirement."
    - "All new .astro pages MUST be created via `pnpm gen:page` (tools/gen/page.ts) — tools/architecture-check.ts's page-not-from-generator rule (Lock 2) hard-fails pnpm arch:check (part of AC-11's build gate) on any page missing the '// @generated-from gen:page' marker."
    - "New Directus schema is NOT a Drizzle/Postgres migration — it's two new collections (content_pages, content_documents) added as idempotent `ensure` blocks to infrastructure/directus/bootstrap.sh, following the landing_pages (line 754) and press_page (line 5390) precedents exactly. landing_pages itself is single-locale (no translations field); the i18n shape precedent that actually exists and is proven in this codebase is events.translations' flat per-locale JSON object pattern, not a Directus-native o2m translations collection — flagged as a second minor doc-vs-practice gap for CodeDeveloper/DbMigrationAuthor to resolve the same way the NestJS gap was resolved (follow shipped practice)."
    - "Found a pre-existing defect directly relevant to this requirement: apps/web-next/src/pages/welcome/[slug].astro renders `set:html=\"\"` (a literal empty string, not page.bodyMd) — body_md is never actually rendered on the one existing V2 page that has this field, despite FR-CMS-002's own AC requiring sanitized body_md rendering. CodeDeveloper cannot copy this page's body-render block as a working reference and must build real markdown-to-sanitized-HTML rendering (isomorphic-dompurify is already a proven dependency via AnnounceComposer.tsx + its own regression test; no markdown parser appears to be installed yet, needs checking). Recommend scoping this explicitly and noting it in the PR description."
    - "SecurityReviewer should look at: (1) whatever new body_md rendering/sanitization logic is built, as defense-in-depth even though content is editor-authored not user-submitted; (2) the new Directus public-read permission grants for content_pages/content_documents, confirming read-only (bootstrap.sh's own history includes one prior unintended-public-write-adjacent incident, ISS-SEC-DIRECTUS-USERS-PUBLIC-001, worth a quick pattern-match check, not a sign of current risk)."
    - "No packages/shared-types change needed — confirmed no existing CMS-content collection (landing_pages, press_page, site_settings, team_members) has a shared-types entry; this requirement should follow the same local-to-web-next containment."
    - "No bot or workers surface touched — confirmed no overlap."
  cross_module_calls_confirmed: true
  security_review_required: true
  architecture_rule_risk: none
  blocking: false
```
