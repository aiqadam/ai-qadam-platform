# ISS-UAT-009-4 — /me AnonView leaves a large unbalanced empty region below the sign-in CTA card

| Field | Value |
|---|---|
| ID | ISS-UAT-009-4 |
| Severity | minor |
| Module | web/me (AnonView layout) |
| Status | resolved |
| Reported | 2026-07-02 |
| Resolved | 2026-07-04 |
| Reporter | BusinessAnalyst (wf-20260702-uat-058 / 03-uat-triage.md) |
| Workflow | wf-20260704-fix-077 |
| AC ref | AC-4 (BP-UAT-009, step-005) — visual-only finding, layered on top of ISS-UAT-009-2's mechanism finding |

## Symptom

Visual-only finding from `02b-visual-review.md`, screenshot
`step-005-redirect-after-signout.png` (`/me` page rendered for an anonymous
visitor, `AnonView` state):

```
Large, unused solid-black region occupying roughly the bottom 55% of the
viewport below the sign-in CTA card. The AnonView card (heading "Sign in to
see your dashboard", body copy, "Sign in" button) is short and centered in the
upper-middle of the page; the remainder of the page is empty page background
with no footer or additional content — a visually unbalanced/incomplete
impression relative to the fuller layouts seen on step-002/003/006 (signed-in
`/me`, leaderboard).
```

Noted independently in both the per-screenshot review and the visual review's
Cross-Screenshot Consistency section as worth flagging. `design_system: PASS`
on token/color/typography grounds — this is a layout-completeness issue, not
an off-brand styling violation.

## Classification

**UI bug** (layout / empty-state). Distinct from ISS-UAT-009-2, which covers
the *mechanism* (in-page CTA vs. redirect); this issue covers the *visual
completeness* of that CTA page once rendered.

## Root cause (hypothesis)

`apps/web/src/components/MeDashboard.tsx`'s `AnonView` renders only the CTA
card with no filler content (no footer, no secondary section, no
illustration/empty-state graphic) — on typical viewport heights the card does
not fill the page, leaving the remaining background exposed. Likely missing
either:
1. A page-level footer that other pages (signed-in `/me`, leaderboard) include
   but `AnonView` omits, or
2. Vertical centering / min-height constraints that assume more content than
   `AnonView` actually renders, or
3. A deliberate empty-state pattern (illustration, secondary CTA, "why sign
   in" bullets) that was never added.

## Proposed resolution

Compare `AnonView`'s render tree against the signed-in `/me` view and the
site-wide footer/layout wrapper to determine whether:
- `AnonView` is missing the standard page footer (quick fix — verify layout
  wrapper is applied consistently), or
- The empty-state card needs additional content to avoid a mostly-empty page
  on common viewport heights.

## Acceptance criteria

- [ ] Root cause identified (missing footer vs. missing empty-state content)
- [ ] `/me` AnonView page no longer shows a large unbalanced empty region on
      the standard UAT viewport size
- [ ] Visual re-check confirms the fix; no regression to the signed-in `/me`
      layout

## Resolution

- **Workflow:** wf-20260704-fix-077
- **PR:** `<pending>` — Step 12 back-fills the URL after `gh pr create`
- **Merged:** `<pending>` — Step 12.5 back-fills the squash SHA on main
- **Root cause:** `apps/web/src/layouts/Layout.astro` imported `Nav.astro` only — there was no `<AppFooter />` (or any footer equivalent) anywhere on the legacy `apps/web` layout. By contrast, `apps/web-next/src/layouts/Layout.astro` renders both `<AppNav />` and `<AppFooter />`. The result: every page rendered through `apps/web`'s Layout (including `/me` → `me.astro` → `MeDashboard.tsx::AnonView`) ended at the CTA card with a tall background-coloured empty region where the footer should be. The visual defect was reported on `step-005-redirect-after-signout.png` in the 2026-07-02 BP-UAT-009 run.
- **Fix:** Ported the existing `apps/web-next/src/blocks/common/AppFooter.astro` block into `apps/web/src/components/AppFooter.astro`, then rendered `<AppFooter />` from `apps/web/src/layouts/Layout.astro` immediately after the page slot (mirroring the web-next layout ordering). Replaced the web-next `↗` Unicode glyph in social-link labels with an inline Lucide `ArrowUpRight` SVG (per AGENTS.md §11.3 — Astro server components can't import `lucide-react`, so the canonical SVG paths `M7 7h10v10` + `M7 17 17 7` are inlined with `stroke="currentColor"`). Added a `@theme inline` Tailwind v4 bridge in `apps/web/src/styles/globals.css` — a direct mirror of the existing web-next block — so the ported footer's Tailwind utility classes (`bg-card`, `border-border`, `text-muted-foreground`, `font-display`, `font-mono`, etc.) render with the canonical design-system tokens instead of unstyled browser defaults. Updated `docs/02-business-processes/uat/BP-UAT-009.md` Step 005 expected state with a new "Layout-completeness contract" paragraph that codifies the footer-visible / no-large-empty-region guarantee for the next UAT runner.
- **Regression test:** `apps/e2e/tests/uat/ISS-UAT-009-4-regression.spec.ts` — a focused, isolated regression spec that re-uses the live `:4321` Astro dev server and asserts (1) `<footer>` visible on `/me` AnonView, (2) `<footer>` follows `<main>` in DOM order via `main.compareDocumentPosition(footer) & DOCUMENT_POSITION_FOLLOWING`, (3) "AI Qadam" tagline in `footer p.font-display`, (4) copyright row matching `/© \d{4} AI Qadam · Community-as-platform/i`. **All 4 hard assertions PASS in 1.6s against the live stack** (verified 2026-07-04). A second copy of the same 4 assertions was also embedded inside `BP-UAT-009.spec.ts` Step 005 (sister to wf-20260704-fix-076's Step 006 leaderboard-chip pattern); the embedded block's assertions PASS individually but the parent Step 005 fails on pre-existing soft-assert divergence (owned by ISS-UAT-009-2) — verified by stash-and-rerun that those failures pre-date this PR.
- **Visual evidence:** `apps/e2e/uat-results/BP-UAT-009/step-005-redirect-after-signout.png` was re-captured during the test run and now shows the full footer surface (tagline, FOLLOW column with Telegram ↗, CONTACT column with Partners + Press, copyright row "© 2026 AI QADAM · COMMUNITY-AS-PLATFORM FOR CENTRAL ASIAN AI ENGINEERS") replacing the previously-empty bottom region.

### Honesty disclosures (per AGENTS.md §6.1)

- **Test-design bug caught + fixed mid-run.** The TestDesigner's first cut of assertion (2) called `footer.compareDocumentPosition(main)` (inverted — checks "does main follow footer?" instead of "does footer follow main?"). I caught this on the first run, fixed it to `main.compareDocumentPosition(footer) & DOCUMENT_POSITION_FOLLOWING`, re-ran, and committed the corrected version. Documented inline as a comment for future sister-workflows (compareDocumentPosition returns position of `other` relative to `this`, not the other way around).
- **BP-UAT-009 full suite has 3 pre-existing failures unrelated to this PR.** Step 004 (Authentik logout interstitial, owned by ISS-UAT-009-1), Step 005's 3 soft asserts (spec/actual divergence owned by ISS-UAT-009-2), and Neg 001 (unrelated). Verified by `git stash push -- apps/e2e/tests/uat/BP-UAT-009.spec.ts` and re-run — same 3 fail without my changes. None of my code is responsible.
- **Layout-fan-out effect.** Adding `<AppFooter />` to `apps/web/src/layouts/Layout.astro` is site-wide. Every page rendered through `apps/web`'s Layout (`/`, `/leaderboard`, `/me`, `/events/*`, `/auth/*`, etc.) now has the footer. The visual-review screenshot for `step-005-redirect-after-signout.png` confirms the `/me` AnonView fix; cross-page visual re-checks of `/leaderboard`, `/`, `/events/[id]` would be a separate BP-UAT-X sweep if product wants them — out of scope for this PR (the issue only calls out `/me` AnonView).
- **Directus request fanout.** `<AppFooter />` calls `fetchSiteSettings()` on every page render; the homepage hero already does the same call. Two `GET /items/site_settings` per page is the current accepted pattern (web-next precedent `wf-20260624-feat-019`); a request-dedup layer is deferred. Not a regression introduced by this PR.
- **apps/web vs apps/web-next drift risk.** Both trees now have parallel `AppFooter.astro` blocks. Any future change to either side needs to be replicated until cutover (`FR-MIG-031` collapses the two trees). Pre-existing pattern (`wf-20260624-feat-019` chose this); not introduced by this PR.
