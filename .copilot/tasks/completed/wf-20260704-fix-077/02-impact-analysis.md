# Step 2 — Impact Analysis

**Workflow:** wf-20260704-fix-077
**Issue:** ISS-UAT-009-4
**Date:** 2026-07-04
**Live stack source (confirmed):** `apps/web` (legacy Astro) on :4321 — `apps/web-next` is the migrated code target but is NOT wired to :4321 today (verified in handoff.context).

## Validated Requirement

**ISS-UAT-009-4** — `/me` AnonView leaves a large unbalanced empty region below the sign-in CTA card. Visual-completeness finding (sister to ISS-UAT-009-2's *mechanism* fix and ISS-UAT-009-3's *leaderboard self-row* fix from the same BusinessAnalyst triage batch `wf-20260702-uat-058/03-uat-triage.md`).

**Root cause (confirmed by code inspection):**
- `apps/web/src/layouts/Layout.astro` imports `Nav.astro` only — **no `<AppFooter />` is rendered** anywhere on the page wrapper.
- `apps/web/src/components/` contains no `Footer*` or `AppFooter*` component (grep_search `[Ff]ooter` returned only an in-component `Footer()` inside `apps/web/src/components/workspace/TelegramCabinet.tsx`, which is unrelated).
- By contrast, `apps/web-next/src/layouts/Layout.astro` imports and renders **both** `<AppNav />` and `<AppFooter />` (line 50–51).
- Net effect: every page rendered through `apps/web`'s Layout (including `/me` → `me.astro` → `MeDashboard.tsx::AnonView`) ends at the CTA card, with a tall background-coloured empty region where the footer should be.

**Resolution path:** Path A — add `<AppFooter />` to `apps/web/src/layouts/Layout.astro`. Reuse the existing web-next `AppFooter.astro` block, ported into `apps/web/src/components/`. `apps/web/src/lib/cms.ts` already exports `fetchSiteSettings()` (line 383) with the same `SiteSettings` shape `AppFooter.astro` consumes — **no CMS or types changes needed**.

**Alternative considered & rejected:** Adding extra content or a min-height spacer inside `AnonView` itself. Rejected because (a) the empty-region bug exists on every short page, not just `/me`'s AnonView, so a layout-level fix has the right scope; (b) the layout's job is to provide the page wrapper (nav + footer), not for each page to fill its own bottom region.

## Affected Layers

| Layer | Change? | Details |
|---|---|---|
| API (NestJS) | No | Out of scope. |
| DB | No | No schema/migration. |
| Shared Types | No | No new types. |
| Frontend `apps/web` (layout) | **Yes (1 file modified)** | `apps/web/src/layouts/Layout.astro` — add `import AppFooter from '../components/AppFooter.astro';` and render `<AppFooter />` after the `<slot />` (mirroring web-next's layout ordering on lines 50–51). |
| Frontend `apps/web` (new component) | **Yes (1 file created)** | `apps/web/src/components/AppFooter.astro` — port the existing `apps/web-next/src/blocks/common/AppFooter.astro` component into the legacy `apps/web` tree. Uses the already-exported `fetchSiteSettings()` from `apps/web/src/lib/cms.ts` (no cms changes). |
| Frontend `apps/web` (MeDashboard) | **No** | `AnonView`'s render tree stays untouched — the empty region is resolved at the layout layer, not the page layer. |
| Design-system CSS | **No** | `AppFooter.astro` uses the canonical Tailwind utility classes (`border-t border-border bg-card`, `font-display`, `font-mono`, `text-muted-foreground`, etc.) that already exist in `apps/web/src/styles/globals.css` (imported by Layout.astro on line 2). No new tokens, no raw hex, no gradients. |
| Documentation | **Yes (1 file updated)** | `docs/02-business-processes/uat/BP-UAT-009.md` Step 005 expected state: extend to cover the visual-completeness contract (footer visible below the AnonView CTA; no large empty region). Sister wording change to the Step 006 update done in `wf-20260704-fix-076`. |

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| _(none)_ | — | No endpoint contract change. | — |

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `apps/web/src/components/AppFooter.astro` (new) | `apps/web/src/lib/cms.ts::fetchSiteSettings()` | Same module-local import pattern already used by `apps/web-next`'s AppFooter. Graceful default on failure (lines 391–392 of cms.ts). |

## Component / File Targets (CodeDeveloper scope)

| File | Change | Lines (est.) | Reason |
|---|---|---|---|
| `apps/web/src/components/AppFooter.astro` (NEW) | Port `apps/web-next/src/blocks/common/AppFooter.astro` verbatim, adjusting the relative import path from `'../../lib/cms'` to `'../lib/cms'`. Tailwind utility classes are already globally available in apps/web. | ~95 LOC (mostly copy from web-next) | The legacy `apps/web` Layout has no footer at all. Adding it here lets one well-tested block land in two trees. |
| `apps/web/src/layouts/Layout.astro` | Add `import AppFooter from '../components/AppFooter.astro';` after the existing `Nav` import (line 3). Add `<AppFooter />` immediately after `<slot />` (currently line 109 in Layout.astro, just before the attribution-capture `<script>`), mirroring the web-next layout ordering. | ~3 LOC changed | Mirrors web-next Layout. Affects every page in `apps/web` — including `/`, `/leaderboard`, `/me`, `/events/*`, `/auth/*` — by giving them the footer that web-next already provides. |
| `docs/02-business-processes/uat/BP-UAT-009.md` | Step 005 Expected UI state: add one bullet covering the footer-visible / no-empty-region contract. Sister to the Step 006 wording change in `wf-20260704-fix-076`. | ~3–5 LOC | Makes the layout-completeness contract explicit for the next UAT runner. |

**Total:** 1 file created + 2 files modified. Well under the §4 PR budget (5 files / 400 LOC). The new file is near-verbatim copy from web-next so review burden is minimal.

## Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| Adding `<AppFooter />` affects every page in `apps/web`, not just `/me` AnonView. A regression on the homepage, leaderboard, or events pages would surface in the live UAT re-run. | Low–Medium | The change is additive — only adds markup below `<slot />`. No existing markup, classes, IDs, or scripts are touched. Live UAT re-run of BP-UAT-009 (Steps 001–007) covers the highest-traffic pages; remaining pages (events detail, auth flows) use the same Layout and inherit the footer for free. |
| `AppFooter.astro` calls `fetchSiteSettings()` on every page render — could double the Directus request count per page (one for the page, one for the footer). | Low | web-next already does this; the precedent is established (`wf-20260624-feat-019` shipped this exact pattern in web-next). `fetchSiteSettings()` is small (~1 row from `site_settings` table), called against an internal docker URL, and the request-dedup layer is explicitly deferred to a follow-up per the web-next comment block. Acceptable for v1. |
| `apps/web-next/src/blocks/common/AppFooter.astro` and the new `apps/web/src/components/AppFooter.astro` will drift if either side is updated. | Low | `wf-20260624-feat-019` already chose this "block in web-next, copy into web" pattern; we are extending it. Pre-cutover the dual-tree is a known constraint (see `docs/04-development/frontend/migration-status.md`). A future cutover (`FR-MIG-031`) will collapse the two. |
| `me.astro` uses `export const prerender = false;` (SSR) — the Layout is therefore server-rendered per request. `<AppFooter />` (an Astro server-rendered component) is compatible. | None | Confirmed: SSR layouts can embed `.astro` server components synchronously. No React-island footprint added. |
| `AppFooter.astro` uses `target="_blank" rel="noopener noreferrer"` on social links — proper hardening, no security flag. | None | Confirmed: pattern is already used elsewhere in the codebase. |

### Security Review Required?

**No.** This is a UI-only additive change.

- No code paths handling secrets, tokens, cookies, or auth are modified.
- The Authentik flow is unchanged; no auth state surfaced in the footer.
- No tenant-isolation boundaries touched.
- No new endpoints, no new dependencies.
- All outbound links use `rel="noopener noreferrer"`.
- No `dangerouslySetInnerHTML` (Astro static markup only).

### Architecture Review Required?

**No.**

- No module boundaries crossed. Change stays inside `apps/web`.
- No cross-schema queries (the new CMS call uses the same `fetchSiteSettings()` helper, same route, same row).
- No new dependencies.
- No new colour tokens (only existing Tailwind utility classes via globals.css).
- Lucide-icon policy: see Risk Flags — `↗` glyph should be replaced with `<ArrowUpRight />` from lucide-react (or rendered via Lucide's static SVG approach). **CodeDeveloper must address this.**

## Test Scope

| Level | What | Where |
|---|---|---|
| Unit | None | UI-only; no logic to unit-test. |
| Integration | None | No API / DB change. |
| E2E (Playwright) | Visual-only assertion extension | `apps/e2e/tests/uat/BP-UAT-009.spec.ts` Step 005 — add a DOM assertion: `document.querySelector('footer')` exists AND is rendered after `<main>`. (Single query; trivial.) **Optional** — the live UAT re-run + visual review is the authoritative check. |
| Live UAT re-run | Full BP-UAT-009 Step 005 (and Steps 001–007 for regression check) | `apps/e2e/tests/uat/BP-UAT-009.spec.ts` against the updated `BP-UAT-009.md` expected state — same orchestration as `wf-20260702-uat-058`. The `/me` AnonView page must end in a visible footer; the previously empty region must be replaced. |
| Visual screenshot review | `uat-visual-check.sh` + manual pixel inspection | `apps/e2e/uat-results/<run>/step-005-redirect-after-signout.png` — bottom 55% of viewport must show the AppFooter (tagline + socials + contacts + copyright row); no large solid-background empty region. |

## Architectural Alignment

- Module boundaries: unaffected. Change stays inside `apps/web` (one new component + one Layout import + one doc).
- Cross-schema queries: unaffected. Same `fetchSiteSettings()` helper, same row, same tenant scoping already handled by the helper.
- Approved stack: unaffected. Pure Astro server components, no new dependencies.
- No new colour tokens (Tailwind utilities via existing globals.css).
- Lucide-icon policy: see Risk Flags — `↗` glyph should be replaced with `<ArrowUpRight />` from lucide-react (or rendered via Lucide's static SVG approach). **CodeDeveloper must address this.**
- Closed palette: footer colours all flow through existing `border-border`, `bg-card`, `text-foreground`, `text-muted-foreground`, `hover:text-primary` — all existing tokens.
- Branch scope: 1 new file + 2 modified files, ~100 LOC total (most of it a near-verbatim copy of the existing web-next block). Well under the §4 PR budget.

## Relationship to Sister Workflows

- **ISS-UAT-009-2** (`wf-20260704-fix-075`, PR #96): docs-only Path B fix for the *mechanism* (CTA-vs-redirect). Already shipped. This workflow fixes the *visual completeness* of the same page — intentionally separate.
- **ISS-UAT-009-3** (`wf-20260704-fix-076`, PR #97): sister visual fix on `/leaderboard` self-row. Same triage batch, same severity, different page. Already shipped. Same DocWriter pattern: extend `BP-UAT-009.md` expected state to make the visual contract explicit.
- **ISS-UAT-009-1** (`wf-20260704-fix-073`, PR #95): logout-interstitial in `api/auth`. Different module; no overlap with this fix.

## Gate Result

gate_result:
  status: passed
  summary: "UI-only additive Layout fix: port the existing web-next AppFooter into apps/web and render it from apps/web/src/layouts/Layout.astro after the page slot. No DB, no API, no security, no new tokens. Live stack source is apps/web (legacy) on :4321; web-next is the migration target but is not wired to :4321 today."
  findings:
    - "Root cause confirmed at apps/web/src/layouts/Layout.astro: imports Nav.astro only; no AppFooter rendered. apps/web-next's layout renders both Nav + AppFooter (lines 50-51). apps/web/src/components/ has no Footer component at all."
    - "Resolution reuses the existing web-next AppFooter block by porting it into apps/web/src/components/AppFooter.astro. apps/web/src/lib/cms.ts already exports fetchSiteSettings() with the same SiteSettings shape; no CMS or types changes needed."
    - "Layout.astro change is additive (one import + one element after slot); affects every page in apps/web for free — homepage, leaderboard, /me, events, auth flows. Live UAT re-run of BP-UAT-009 covers the highest-traffic surfaces."
    - "CodeDeveloper should replace the '↗' Unicode glyph in the social-link <a> labels with a Lucide ArrowUpRight icon to comply with AGENTS.md §11.3 (Lucide icons only)."
    - "Documentation tightening: BP-UAT-009.md Step 005 expected state should explicitly cover the footer-visible / no-empty-region contract — sister to the Step 006 update in wf-20260704-fix-076."
    - "Live UAT re-run requires full stack (apps/web + Authentik OIDC + Directus for fetchSiteSettings) — Orchestrator pre-flight per AGENTS.md §6.1 before marking verified."
    - "Branch scope: 1 file created (AppFooter.astro, ~95 LOC near-verbatim from web-next) + 2 files modified (Layout.astro ~3 LOC, BP-UAT-009.md ~3-5 LOC). Well under the §4 PR budget (5 files / 400 LOC)."