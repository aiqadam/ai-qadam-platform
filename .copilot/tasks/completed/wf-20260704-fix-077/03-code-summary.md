# 03 — Code Summary (Step 4)

**Workflow:** wf-20260704-fix-077
**Issue:** ISS-UAT-009-4 — `/me` AnonView leaves a large unbalanced empty region below the sign-in CTA card
**Branch:** fix/ISS-UAT-009-4-me-anon-view-empty-region

## Requirement Implemented

Bring `apps/web/src/layouts/Layout.astro` to layout-completeness parity
with `apps/web-next/src/layouts/Layout.astro` by adding a site-wide
`<AppFooter />` rendered after `<slot />`. Port the existing web-next
`AppFooter.astro` block into `apps/web/src/components/`, reusing the
already-exported `fetchSiteSettings()` helper from `apps/web/src/lib/cms.ts`.
This eliminates the ~55% empty-background defect on `/me` AnonView (and
on every other short page rendered through the same Layout) by giving
the page a proper bottom anchor.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/web/src/components/AppFooter.astro` | **Created** | Port of `apps/web-next/src/blocks/common/AppFooter.astro`. Adjusted relative import path from `'../../lib/cms'` to `'../lib/cms'`. Replaced the `↗` Unicode glyph in social `<a>` labels with an inline Lucide `ArrowUpRight` SVG (12×12, `stroke="currentColor"`, viewBox `0 0 24 24`, paths `M7 7h10v10` + `M7 17 17 7`) — per AGENTS.md §11.3 ("Lucide icons only", inline SVG is the explicit Astro-server-component equivalent). All other markup and CSS classes match the source verbatim. |
| `apps/web/src/layouts/Layout.astro` | Modified (+6 LOC) | Added `import AppFooter from '../components/AppFooter.astro';` after the existing Nav import. Added `<AppFooter />` immediately after `<slot />` and before the attribution-capture `<script>` (mirrors web-next Layout ordering exactly, lines 50–51 of `apps/web-next/src/layouts/Layout.astro`). Comment explains the purpose and references the issue/workflow. |
| `apps/web/src/styles/globals.css` | Modified (+50 LOC) | Added the `@theme inline` Tailwind v4 theme bridge — a direct mirror of `apps/web-next/src/styles/globals.css` lines 27–57. Without this bridge the Tailwind utility classes used by the ported footer (`bg-card`, `border-border`, `text-muted-foreground`, `text-foreground`, `hover:text-primary`, `font-display`, `font-mono`, etc.) are not generated and the footer would render unstyled. The bridge uses `@theme inline` so the OKLCH tokens in `design-system/tokens.css` remain the single source of truth. |
| `docs/02-business-processes/uat/BP-UAT-009.md` | Modified (+24 LOC) | Added a new "Layout-completeness contract" paragraph under Step 005 covering: the rendered footer surface (tagline, Follow column, Contact column, copyright row); the explicit "no large unbalanced empty background-coloured region" guarantee; and a note that the contract applies to every page rendered through the shared Layout, not just `/me`. Sister wording change to the Step 006 update done in `wf-20260704-fix-076`. |

## Key Design Decisions

### 1. Port verbatim from web-next — minimal drift

The web-next block is already shipped, already exercised in production
(aiqadam.org serves web-next since cutover), and already reviewed. The
apps/web tree still exists because cutover hasn't happened for it (see
`docs/04-development/frontend/migration-status.md`). Porting the
already-vetted block (with the same `fetchSiteSettings()` helper, the
same `SiteSettings` shape, the same Tailwind utility classes, the same
contact/social column structure) means we cannot accidentally regress
on the web-next side and we keep the two trees visually in sync until
cutover. The only meaningful change at the markup level is the
`↗` → inline-SVG swap described below.

### 2. Replace `↗` Unicode glyph with inline Lucide `ArrowUpRight` SVG

`apps/web-next/src/blocks/common/AppFooter.astro` ships `↗` (U+2197)
inline with the social-link label text. Per AGENTS.md §11.3 ("Lucide
icons only — or inline SVG equivalents for Astro server components"),
a literal Unicode glyph is technically a violation; the issue prompt
explicitly called this out as a hard constraint. Astro server
components cannot import `lucide-react` (React-only), so the equivalent
is an inline SVG using Lucide's published 24×24 `ArrowUpRight` paths
(`M7 7h10v10` and `M7 17 17 7`) with `stroke="currentColor"` so the
icon inherits the link's hover color. Sized at 12×12 to match the 14px
text height (smaller than the icon default, matches the visual weight
of the brand teal on hover).

### 3. Add `@theme inline` Tailwind bridge to `apps/web/src/styles/globals.css`

This is the one decision that diverges from a "minimal verbatim port"
instruction. **Rationale:**

- `apps/web-next/src/styles/globals.css` has an `@theme inline` block
  (lines 27–57) that derives Tailwind utility classes
  (`bg-card`, `text-muted-foreground`, `border-border`, `font-display`,
  `font-mono`, etc.) from the CSS variables defined in
  `design-system/tokens.css`.
- `apps/web/src/styles/globals.css` does **not** have this bridge.
- Without the bridge, Tailwind 4 in `apps/web` will not generate those
  utility classes. The ported footer's `class="bg-card border-border
  text-muted-foreground ..."` would render with default browser
  styling (transparent background, browser-default text color), which
  is **invisible against the dark page background**.
- The fix is one canonical block copied verbatim from web-next —
  exact same content, exact same purpose. It is purely additive
  (zero changes to existing tokens or rules).

I considered the alternative of rewriting the footer markup to use
inline `style="..."` with `var(--...)` (the apps/web legacy
convention). Rejected because (a) it would diverge from the web-next
block, defeating the "port verbatim" goal and re-introducing drift
risk; (b) it would lock `apps/web` into the legacy inline-style pattern
even longer, slowing cutover.

### 4. Render `<AppFooter />` after `<slot />` but before the attribution script

Matches the web-next Layout ordering exactly. The attribution-capture
script is per-page-load setup that should run as soon as the page is
in the DOM; the footer is rendered SSR markup with no client-side
runtime, so its position relative to the script is purely about paint
order — keeping the script at the end of `<body>` (as it was) is
correct, and the footer slots in cleanly between slot and script.

## Architecture Rule Compliance

- [x] **Module boundaries**: change stays inside `apps/web`. New
      component (`AppFooter.astro`) lives in `apps/web/src/components/`
      alongside `Nav.astro`. No cross-tree imports — the
      `apps/web/src/lib/cms.ts::fetchSiteSettings()` helper is used
      (same helper web-next's block uses, just at the apps/web relative
      path `../lib/cms`).
- [x] **Tenant scoping**: `fetchSiteSettings()` is tenant-neutral (it
      returns the global `site_settings` singleton — same row for every
      country). No `countryCode` filter needed.
- [x] **Zod at boundaries**: not applicable — no API contract change;
      the `fetchSiteSettings()` helper already does its own
      normalisation + default-on-failure (cms.ts:364-393), which is the
      upstream boundary for the data this footer consumes.
- [x] **No cross-schema queries**: the only CMS call is
      `fetchSiteSettings()` against `items/site_settings` — same call
      the homepage already makes, no new endpoint.
- [x] **No `any` / no `as` casts**: TypeScript types are explicit
      (`SocialLink`, `ContactLink`) and use type-guard predicates for
      the `.filter((x): x is SocialLink => x !== null)` narrowing.
- [x] **Auth at controller level**: not applicable — UI-only change,
      no auth surface touched. The existing
      `Astro.locals.auth` SSR-hand-off in Layout.astro (the
      `__AIQADAM_AUTH__` blob) is unchanged.
- [x] **Design system compliance (AGENTS.md §11)**: no raw hex, no
      gradients, no new colour tokens. All footer colours flow through
      the existing tokens (`--card`, `--border`, `--foreground`,
      `--muted-foreground`, `--primary` for hover). Lucide-style SVG
      icon policy satisfied via inline SVG. Sentence case for the
      rendered button/link text ("Sign in", "Partners", "Press",
      "Support", "Follow", "Contact"). Mono-eyebrow labels
      ("Follow", "Contact", "© <year> AI Qadam · …") use the
      `.font-mono` utility + `uppercase` + `tracking-wider` per the
      design-system `.badge.mono` pattern.
- [x] **No new dependencies**: zero package additions. The ported
      footer uses only `fetchSiteSettings` (already exported from
      `cms.ts`) and Tailwind utility classes (now generated via the
      `@theme inline` bridge — no new Tailwind plugin or config).

## Formatter Check

- `pnpm --filter @aiqadam/web typecheck` (= `astro check`): **0 errors,
  0 warnings, 25 hints (all pre-existing in unrelated files)**. Confirmed
  none of the 25 hints reference any file I created or modified.
- `pnpm exec tsx tools/architecture-check.ts`: **passed (249 files
  scanned)**.
- Biome: `biome.json` has `**/*.astro` in `files.ignore`, so `.astro`
  files are out of biome's scope by design. No formatting action needed
  for the new component or the modified Layout.

## Known Limitations

1. **Directus request fanout.** `<AppFooter />` calls
   `fetchSiteSettings()` on every page render. The homepage already
   does the same call for the hero, so request-dedup hasn't landed
   yet — this is the same precedent web-next already accepted
   (`wf-20260624-feat-019`). The extra request is one small Directus
   `GET /items/site_settings` against the internal docker URL; the
   helper already falls back to defaults on failure, so the page never
   breaks if Directus is unreachable.
2. **Drift between `apps/web` and `apps/web-next` footers.** Both
   files now exist. Any future change to one (e.g. adding a new social
   column) needs to be replicated to the other until cutover
   (`FR-MIG-031` collapses the two trees).
3. **No Playwright assertion added.** The impact analysis marked the
   Playwright assertion extension as **optional**; the live UAT re-run
   + visual review is the authoritative check. The new test would be
   one line (`expect(page.locator('footer')).toBeVisible()` after the
   CTA card) — easy follow-up if a future TestDesigner wants to harden
   it. Not blocking the close of this PR.
4. **Live UAT re-run not executed by CodeDeveloper.** Per
   `AGENTS.md §6.1`, the Orchestrator (which has terminal access to
   bring up the full docker stack + Authentik + Directus) is the
   agent that runs the live UAT re-run. The CodeDeveloper scope is the
   code change + static validation, both of which are complete here.

## Architecture Self-Check (from CodeDeveloper role definition)

- [x] Service methods: typed I/O, no `any` — n/a (UI-only).
- [x] Custom typed errors: n/a (UI-only).
- [x] All promises awaited: `await fetchSiteSettings()` on line 24
      of the new `AppFooter.astro`.
- [x] DB queries: n/a (no DB queries — only CMS).
- [x] Cross-module calls via service interface: n/a — uses the
      already-public `fetchSiteSettings()` helper.
- [x] New endpoints auth: n/a — no new endpoints.
- [x] shared-types changes: none.
- [x] New React component: n/a — Astro server component.
- [x] New Astro page: n/a — new Astro component, mounted in the
      existing Layout. The Layout's SSR auth hand-off (the
      `__AIQADAM_AUTH__` blob for `me.astro`'s signed-in state) is
      unaffected.

## Validation Evidence

```
$ pnpm --filter @aiqadam/web typecheck
Result (123 files):
- 0 errors
- 0 warnings
- 25 hints    # all pre-existing, none in my files

$ pnpm exec tsx tools/architecture-check.ts
✓ arch:check passed (249 file(s) scanned, mode=full).
```

Hints are all in pre-existing unrelated files (`CountriesAdmin.tsx`,
`TgBroadcastComposer.tsx`, `TgSegmentsList.tsx`, `index.astro`,
`sign-in.astro`); none reference `AppFooter.astro`, `Layout.astro`,
or `globals.css`.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Layout-completeness fix for ISS-UAT-009-4: ported web-next AppFooter into apps/web, wired it into Layout.astro after the page slot, added the @theme inline Tailwind bridge in globals.css so the ported footer renders with the canonical design-system tokens, and extended BP-UAT-009 Step 005 with the footer-visible / no-empty-region contract. typecheck (astro check) and architecture-check both pass clean."
  findings:
    - "1 new file: apps/web/src/components/AppFooter.astro (port of web-next block; only the import path and the ↗ → inline Lucide ArrowUpRight SVG differ)."
    - "apps/web/src/layouts/Layout.astro: added AppFooter import + render after <slot />, before the attribution-capture script (mirrors web-next Layout ordering)."
    - "apps/web/src/styles/globals.css: added the @theme inline Tailwind bridge (50 LOC, verbatim mirror of web-next's bridge) so Tailwind utility classes used by the ported footer (bg-card, border-border, text-muted-foreground, font-display, font-mono, ...) are actually generated by Tailwind 4 — without it the footer would render unstyled."
    - "docs/02-business-processes/uat/BP-UAT-009.md Step 005: added the Layout-completeness contract paragraph (24 LOC) covering the rendered footer surface, the no-large-empty-region guarantee, and the cross-page applicability note."
    - "TypeScript strict + astro check: 0 errors, 0 warnings. The 25 hints are all pre-existing in unrelated files (CountriesAdmin, TgBroadcast*, index.astro, sign-in.astro); none reference my new or modified files."
    - "Architecture check (tools/architecture-check.ts): passed, 249 files scanned, no boundary violations."
    - "Branch scope: 1 new file + 3 modified files, ~165 LOC total — well under the §4 PR budget (5 files / 400 LOC)."
    - "Live UAT re-run (BP-UAT-009 Steps 001-007) is queued to the Orchestrator per AGENTS.md §6.1 — out of CodeDeveloper scope."
```