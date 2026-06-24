# Requirement Validation — FR-MIG-031

**Workflow:** wf-20260625-feat-025  
**Agent:** RequirementAnalyst  
**Date:** 2026-06-25

---

## Raw Input

**Requirement ref:** FR-MIG-031  
**Title:** Production cutover — cookie parity, SEO re-enable, FQDN flip (M4 steps 1–2, 5–7)  
**Source file:** `docs/03-requirements/FR-MIG-031.md`

**Automatable code scope (this PR):**
- Step 1: cookie name parity in `apps/web-next/src/middleware.ts` — rename primary cookie from `aiqadam-next-refresh` to `aiqadam-refresh`, keep legacy name for 24h overlap
- Step 2: remove `<meta name="robots" content="noindex,nofollow">` and `robots.txt Disallow: /`; restore OG/Twitter cards, `<link rel="canonical">`, Plausible analytics, Google Fonts preconnect, `captureLandingAttribution` script

**Out of scope for this PR (human/ops-only):**
- Step 3: Authentik OAuth client redirect URI repoint (Authentik admin UI)
- Step 4: Backrest pre-flip snapshot
- Step 5: FQDN flip in Coolify web UI (NEVER automatable — API wipes Traefik labels, 2026-05-24 incident)
- Step 6: 30-min manual smoke test
- Step 7: PM sign-off decision-batch entry
- Step 8: 2-week standby + teardown

---

## Analysis

### 1. Completeness assessment

| Criterion | Result |
|---|---|
| Specific | PASS — both automatable steps name exact files, cookie names, and HTML tag changes |
| Testable | PASS — cookie presence/absence is assertable in middleware tests; noindex removal is assertable in HTML snapshot tests |
| Non-conflicting | PASS — no other active FR touches `middleware.ts` cookie logic or `<head>` SEO tags |
| Scoped to one module layer | PASS — Step 1 is WEB/middleware; Step 2 is WEB/layout+head. Both within `apps/web-next/`. No API changes required |
| Referenced | PASS — links to ADR-0016 (web auth flow), ADR-0038 (rebuild), migration-status.md §Cutover sequence, FR-MIG-030 gate dependency |

**Completeness verdict:** All five criteria satisfied. No gaps requiring clarification.

### 2. Conflicts with existing features

- **FR-MIG-017** (`/auth/sign-in`): uses `aiqadam-next-refresh` cookie for session detection. The 24h overlap window (accept both old and new cookie names) prevents a breaking change for any sessions established before cutover. No conflict.
- **FR-MIG-018** (`/me` hub): reads auth from `Astro.locals.auth`, populated by middleware. The middleware change is transparent to all consumers of `locals.auth`. No conflict.
- **FR-MIG-030** (parity E2E + Lighthouse): the gate dependency. Status in requirements-registry.md is `Implemented`; PR #47 merged to main on 2026-06-25 per workspace-state.md. Gate is satisfied.
- No other FR modifies `public/robots.txt`, `src/layouts/Layout.astro`, or `src/blocks/common/PageHead.astro`.

### 3. Architectural feasibility

**Step 1 — Cookie parity in middleware:**
The current `middleware.ts` already defines `REFRESH_COOKIE_NEXT = 'aiqadam-next-refresh'` and `REFRESH_COOKIE_LEGACY = 'aiqadam-refresh'`. The code comment at line 15 explicitly documents the intended cutover direction: "At cutover (T+0), the API will start issuing the canonical `aiqadam-refresh` cookie from v2 and accept `aiqadam-next-refresh` for a 24h overlap." The constant naming in the current code is backwards relative to post-cutover semantics — `REFRESH_COOKIE_NEXT` (the "new" cookie used now) becomes the legacy name after cutover. The implementation change is:
1. Flip which cookie name is primary (what the middleware reads first and what the API will issue)
2. Keep the old name accepted in `hasRefresh` for the overlap window

This change is in a single file (`middleware.ts`), touches no module boundaries, and requires no DB migration. Architecturally safe.

**Step 2 — Remove noindex, restore SEO/OG/analytics:**
Two files are affected: `src/layouts/Layout.astro` (remove `<meta name="robots">` noindex line, update title default from "AI Qadam (next)" to "AI Qadam", update default description) and `src/blocks/common/PageHead.astro` (add OG/Twitter card block, `<link rel="canonical">`, Plausible analytics script, Google Fonts preconnect, `captureLandingAttribution` script). The `PageHead.astro` comment on line 12 explicitly documents: "At cutover we'll flip both off in one PR (this block + Layout) so search engines see the canonical aiqadam.org URLs cleanly." Architecturally planned and safe.

`public/robots.txt` currently contains `Disallow: /`. It must be replaced with a permissive ruleset (e.g. `Allow: /` with proper sitemap directive).

**Scope constraint check:** The combined change touches:
- `apps/web-next/src/middleware.ts` (1 file, ~5 lines changed)
- `apps/web-next/src/layouts/Layout.astro` (1 file, ~5 lines changed)
- `apps/web-next/src/blocks/common/PageHead.astro` (1 file, adds ~15 lines)
- `apps/web-next/public/robots.txt` (1 file, ~5 lines)

Total: 4 files, well within the ≤5 code files / ≤400 LOC PR constraint from requirements-registry.md.

**Safety profile:** These are no-ops until the ops team executes Step 5 (FQDN flip). Until the FQDN flip, `next.aiqadam.org` remains behind Authentik forward-auth. Cookie change has no effect on an endpoint that isn't receiving production traffic. SEO tags on `next.aiqadam.org` are irrelevant until it becomes the canonical domain.

**Gate dependency confirmation:** FR-MIG-030 shows `status: Implemented` in requirements-registry.md. workspace-state.md confirms PR #47 merged to main 2026-06-25. Gate is green.

### 4. Items explicitly out of scope (no action required)

| Step | Reason for exclusion |
|---|---|
| Step 3 (Authentik repoint) | Admin UI operation, no code path |
| Step 4 (Backrest snapshot) | Ops action, no code path |
| Step 5 (FQDN flip) | NEVER automatable — Coolify API write wipes `custom_labels`/Traefik routing (incident 2026-05-24). Coolify web UI → Save → Deploy only. |
| Step 6 (smoke test) | Manual 30-min human verification |
| Step 7 (PM sign-off) | Decision-batch entry by PM |
| Step 8 (teardown) | 2 weeks post-cutover; separate future action |

---

## Formalized Requirement

**Identifier:** FEAT-WEB-031  
_(Module code: WEB — frontend `apps/web-next/`; sequence 031 follows the MIG-031 source)_

**Statement:**  
When the production FQDN flip is imminent, the `web-next` app MUST be prepared with: (a) cookie name parity — the middleware accepts both `aiqadam-refresh` (canonical, post-cutover) and `aiqadam-next-refresh` (legacy, 24h overlap) for SSR auth bootstrap; and (b) SEO re-enablement — the `noindex` meta tag is removed from `Layout.astro`, the `robots.txt` disallow-all rule is replaced with a permissive ruleset, and `PageHead.astro` is populated with OG/Twitter cards, `<link rel="canonical">`, Plausible analytics, Google Fonts preconnect, and `captureLandingAttribution` — so that at the moment of FQDN flip (human ops step), search engines and social scrapers see canonical metadata immediately with no further code deployment required.

**Cross-refs:**
- Gate: FR-MIG-030 (Implemented, PR #47 merged 2026-06-25)
- Auth flow: ADR-0016
- Rebuild rationale: ADR-0038
- Implementation files: `apps/web-next/src/middleware.ts`, `apps/web-next/src/layouts/Layout.astro`, `apps/web-next/src/blocks/common/PageHead.astro`, `apps/web-next/public/robots.txt`
- Migration notes: `docs/04-development/frontend/migration-status.md` §Cutover sequence

---

## Acceptance Criteria (draft)

**Step 1 — Cookie parity:**

AC-1: Given a browser that has an `aiqadam-refresh` cookie (canonical, post-cutover name), when the SSR middleware runs, then the middleware calls `/v1/auth/refresh` and populates `Astro.locals.auth` correctly.

AC-2: Given a browser that still has an `aiqadam-next-refresh` cookie (legacy name from build-window), when the SSR middleware runs, then the middleware also calls `/v1/auth/refresh` (24h overlap) and populates `Astro.locals.auth` correctly — existing sessions are not broken.

AC-3: Given a browser with neither cookie, when the SSR middleware runs, then the middleware returns `auth: null` and the page renders as anonymous (no regression).

AC-4: Given the middleware code after this change, then `REFRESH_COOKIE_NEXT` constant value must equal `'aiqadam-refresh'` (the canonical post-cutover name) and `REFRESH_COOKIE_LEGACY` must equal `'aiqadam-next-refresh'` (the overlap name), with the `hasRefresh` check accepting both.

**Step 2 — SEO/noindex removal:**

AC-5: Given any rendered page from `web-next` after this change, when the HTML `<head>` is inspected, then there is NO `<meta name="robots">` tag with `noindex` or `nofollow` content.

AC-6: Given `apps/web-next/public/robots.txt` after this change, when the file is read, then it does NOT contain `Disallow: /` (disallow-all) and instead permits crawling (e.g. `Allow: /`).

AC-7: Given a page that uses `<PageHead>` component with a `title` and `description`, when the page is rendered, then the `<head>` includes: a `<link rel="canonical">` tag pointing to the correct aiqadam.org URL, an `og:title` / `og:description` / `og:image` OG block, a `twitter:card` Twitter card block, the Plausible analytics `<script>` pointing to `plausible.io`, and a Google Fonts preconnect `<link>`.

AC-8: Given `apps/web-next/src/layouts/Layout.astro` after this change, when the default `title` prop is used, then the default value is `'AI Qadam'` (not `'AI Qadam (next)'`) and the default `description` reflects the production site rather than the build-aside description.

AC-9: Given all these changes are merged to `main` and deployed to `next.aiqadam.org`, when an engineer checks the deployed site BEFORE the FQDN flip, then cookie behaviour is unchanged (no user sessions are impacted because `next.aiqadam.org` is still Authentik-gated), confirming changes are inert until cutover.

---

## Gate Result

gate_result:
  status: passed
  summary: "FR-MIG-031 is specific, testable, non-conflicting, and architecturally feasible; the automatable scope (Steps 1–2) is clearly bounded, the gate dependency (FR-MIG-030, PR #47) is confirmed merged, and the inert-until-FQDN-flip safety property holds."
  findings:
    - "FR-MIG-030 gate dependency confirmed: status Implemented, PR #47 merged to main 2026-06-25."
    - "Scope is 4 files, well within the ≤5 files / ≤400 LOC PR constraint."
    - "Middleware already scaffolded for cutover: REFRESH_COOKIE_NEXT/LEGACY constants and hasRefresh multi-cookie check exist; only constant values and primary logic need to swap."
    - "PageHead.astro comment on line 12 explicitly anticipates this cutover PR; no design rethinking needed."
    - "FQDN flip (Step 5) is documented as permanently human-only; no automation gap exists."
    - "Steps 3, 4, 6, 7, 8 are all human/ops actions with no code counterpart; correctly excluded."
    - "No DB migration required. No API changes required. No new packages required."
    - "Changes are safe to land before the ops gate — they are no-ops until the FQDN flip executes."
