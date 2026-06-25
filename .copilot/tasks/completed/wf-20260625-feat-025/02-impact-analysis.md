# Impact Analysis — FR-MIG-031

**Workflow:** wf-20260625-feat-025  
**Agent:** ImpactAnalyzer  
**Date:** 2026-06-25

---

## Validated Requirement

**FEAT-WEB-031** — Production cutover prep for `apps/web-next/`:

1. **Step 1 — Cookie name parity in middleware:** Flip the primary cookie constant in `middleware.ts` from `aiqadam-next-refresh` to `aiqadam-refresh` (canonical post-cutover name); keep the former primary as the legacy/overlap cookie for 24h. The `hasRefresh` multi-cookie check already accepts both names.

2. **Step 2 — SEO re-enablement:** Remove `<meta name="robots" content="noindex,nofollow">` from `Layout.astro`; replace `robots.txt` `Disallow: /` with a permissive ruleset; populate `PageHead.astro` with OG/Twitter card block, `<link rel="canonical">`, Plausible analytics, Google Fonts preconnect, and `captureLandingAttribution` script; update default title/description in `Layout.astro` from build-aside copy to production copy.

Gate dependency: FR-MIG-030 — confirmed Implemented (PR #47 merged 2026-06-25).  
Both changes are inert until the human FQDN flip (Step 5, Coolify web UI only).

---

## Affected Layers

### API (NestJS)

No changes. The API controller (`apps/api/src/modules/auth/auth.controller.ts`) already uses `REFRESH_COOKIE = 'aiqadam-refresh'` as its canonical name (line 52) and accepts `LEGACY_REFRESH_COOKIE = '__Host-aiqadam-refresh'` for overlap. The API is already on the post-cutover cookie name; it is the v2 middleware that currently uses the inverted naming. No API file is touched by this PR.

### DB Changes Required

**No.** Cookie names are runtime constants, not persisted data. OG tags, canonical links, and robots directives are HTML/file output. Zero schema or migration impact.

### Shared Types (`packages/shared-types/`)

**No changes.** The `SsrAuth` interface in `apps/web-next/src/middleware.ts` (exported, consumed only by `env.d.ts`) is structurally unchanged. No Zod schemas or TypeScript types need modification.

### Frontend (`apps/web-next/`)

Four files are directly modified:

| File | Change |
|---|---|
| `src/middleware.ts` | Swap constant values: `REFRESH_COOKIE_NEXT` → `'aiqadam-refresh'`; `REFRESH_COOKIE_LEGACY` → `'aiqadam-next-refresh'`. `hasRefresh` logic already accepts both names — no logic change. |
| `src/layouts/Layout.astro` | Remove `<meta name="robots" content="noindex,nofollow">` line 42. Update default `title` prop from `'AI Qadam (next)'` to `'AI Qadam'`. Update default `description` prop to production copy. Update comment block to reflect post-cutover state. |
| `src/blocks/common/PageHead.astro` | Add OG/Twitter card block, `<link rel="canonical">`, Plausible `<script>`, Google Fonts preconnect `<link>`, and `captureLandingAttribution` inline script. Component already accepts `title` and `description` props — no interface change required. |
| `public/robots.txt` | Replace `Disallow: /` with permissive ruleset (`Allow: /` + sitemap directive). |

**Cascade considerations — comment-only updates (no behavior change required):**

- `src/env.d.ts` (line 14): contains a comment referencing `aiqadam-next-refresh vs aiqadam-refresh`. The comment should be updated to reflect post-cutover semantics. Low risk — purely documentary.
- `src/lib/api-client.ts` (line 19): comment says "so the `aiqadam-next-refresh` cookie flows". Should be updated to `aiqadam-refresh` for accuracy. Low risk — purely documentary.
- `src/pages/auth/signed-out.astro` (line 11 comment, line 73 JS): clears `aiqadam-next-refresh` client-side. **This IS a behavioral item.** Post-cutover the primary cookie the client holds will be `aiqadam-refresh`; `signed-out.astro` must clear that name as primary. Line 75 already clears `aiqadam-refresh` as a secondary; after cutover the two lines should swap primacy. This is a 2-line change in scope.
- `src/pages/index.astro` (line 27-28): hardcodes `title="AI Qadam (next)"` in both `<Layout>` and `<PageHead>` — these must be updated to `"AI Qadam"` to match the production default. Required for AC-8.

**Pages using `<PageHead>` (no structural change needed):** All ~40 pages using `<PageHead slot="head">` will automatically benefit from the restored OG/canonical/analytics output once `PageHead.astro` adds those slots. No per-page edits are required for the shared SEO additions. However, the `index.astro` title hardcode is a per-page fix.

### Bot (`apps/bot/`)

No impact. No bot handlers reference web-next cookie names or head tags.

### Workers (`apps/workers/`)

No impact. No workers reference web-next cookie names or head tags.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| (none) | — | No API surface changes | — |

The middleware already forwards the full `cookie` header verbatim to `/v1/auth/refresh`; the API reads whichever cookie name it finds. No API contract change.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `apps/web-next/src/middleware.ts` | `apps/api` `/v1/auth/refresh` | Internal HTTP (INTERNAL_API_URL) |
| `apps/web-next/src/middleware.ts` | `apps/api` `/v1/auth/me` | Internal HTTP (INTERNAL_API_URL) |

These calls exist today and are unchanged by this PR. The only change is which cookie name the middleware reads first in `hasRefresh` — the HTTP calls themselves are identical.

---

## Risk Flags

### Security Review Required

**Low risk, no security review gate required** for the following reasons:

- Cookie flip is reversing two string constants. The `hasRefresh` overlap check (lines 56-58 of middleware.ts) already covers both names. No session can be invalidated by the constant swap because both names are accepted simultaneously during the overlap window.
- OG/canonical/analytics additions are read-only HTML head elements. No auth, no CSRF surface, no new network endpoints opened.
- Plausible analytics script is a well-known privacy-preserving analytics provider already used in v1. No new third-party data processor is introduced.
- `captureLandingAttribution` script is an existing internal utility.
- `robots.txt` change from blocking to permissive is intentional and is the goal of this PR.

### Architecture Rule Risks

- **No module boundary violations.** All changes are within `apps/web-next/`. No cross-app imports.
- **No raw hex colors, no new tokens** (layout/head changes are HTML/text, not styled components).
- **Icon policy:** No new icons added.
- **FQDN flip is NOT automated** — the most dangerous step (Coolify API wipes Traefik labels) remains human-only as documented. No code in this PR automates it.
- **`signed-out.astro` cookie clear:** After the constant flip, the `aiqadam-next-refresh` client-side clear on line 73 becomes the legacy behavior. The lines should be swapped so `aiqadam-refresh=; Max-Age=0` fires first. If not updated, users who sign out before the FQDN flip will have their sessions cleared correctly (both names cleared); after the FQDN flip the primary cookie is `aiqadam-refresh` and it is still cleared on line 75 — so the omission degrades gracefully. Nonetheless, the swap is needed for correctness and should be part of this PR.

---

## Test Scope

### Unit Tests

| Test | File | Covers |
|---|---|---|
| Middleware: primary cookie (`aiqadam-refresh`) triggers SSR auth | `apps/web-next/src/middleware.test.ts` (new or extend) | AC-1 |
| Middleware: legacy cookie (`aiqadam-next-refresh`) also triggers SSR auth | same | AC-2 |
| Middleware: no cookie → auth: null | same | AC-3 |
| Middleware constant values after swap | same | AC-4 |

### Integration Tests (Testcontainers)

Not required. The middleware makes HTTP calls to the API; unit tests mock the fetch. No DB-touching integration path is introduced.

### E2E Tests (Playwright)

| Test | Covers |
|---|---|
| HTML snapshot: no `<meta name="robots">` with `noindex` on any page | AC-5 |
| `robots.txt` HTTP GET: response body does not contain `Disallow: /` | AC-6 |
| Rendered `<head>` includes `<link rel="canonical">`, `og:title`, `twitter:card`, Plausible script | AC-7 |
| `Layout.astro` default title renders as `"AI Qadam"` (not `"AI Qadam (next)"`) | AC-8 |
| Deployed to `next.aiqadam.org` pre-flip: existing sessions not disrupted (cookie overlap window holds) | AC-9 (manual/smoke gate, not automated) |

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    FR-MIG-031 blast radius is fully bounded within apps/web-next/ (4 primary files + 3 minor
    comment/title cascades). No DB migration required. No API changes required. No shared-types
    changes required. No bot or worker surfaces affected. The middleware cookie swap is a 2-constant
    flip; the hasRefresh multi-name check already supports the overlap window. SEO re-enablement
    touches Layout.astro, PageHead.astro, and robots.txt as planned. One additional behavioral fix
    is required: signed-out.astro must swap cookie clear order to make aiqadam-refresh the primary
    clear target post-cutover. All changes remain inert until the human FQDN flip (Step 5).
  findings:
    - "DB migration: NOT required. Cookie names are runtime constants; OG/robots changes are HTML/file output."
    - "API surface: unchanged. api/auth.controller.ts already uses canonical 'aiqadam-refresh' (line 52)."
    - "middleware.ts: only REFRESH_COOKIE_NEXT/LEGACY constant values swap; hasRefresh logic accepts both names already."
    - "PageHead.astro: props interface unchanged; OG/canonical/analytics block added inside existing frontmatter."
    - "Layout.astro: one <meta> line removed, two string defaults changed; no structural change."
    - "robots.txt: one-line replacement (Disallow: / → Allow: /)."
    - "signed-out.astro: cookie clear order must swap (aiqadam-refresh becomes primary clear target)."
    - "index.astro: title hardcode 'AI Qadam (next)' must be updated to 'AI Qadam' for AC-8."
    - "env.d.ts + api-client.ts: comment-only updates for accuracy (low risk, in scope)."
    - "No cross-module boundary violations. No new third-party dependencies. No security gate required."
    - "Test scope: unit tests for middleware AC-1 through AC-4; Playwright snapshot tests for AC-5 through AC-8."
    - "Total file count including cascades: 8 files (4 primary + signed-out.astro + index.astro + env.d.ts + api-client.ts). LOC estimate: ~40 lines changed/added. Well within PR size constraint."
```
