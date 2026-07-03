# 04 — Security Review (Step 5)

**Workflow:** wf-20260704-fix-077
**Issue:** ISS-UAT-009-4 — `/me` AnonView leaves a large unbalanced empty region below the sign-in CTA card
**Branch:** fix/ISS-UAT-009-4-me-anon-view-empty-region
**Date:** 2026-07-04
**Reviewer:** SecurityReviewer

---

## Code Changes Reviewed

| File | Type | LOC delta | Why reviewed |
|---|---|---|---|
| `apps/web/src/components/AppFooter.astro` | NEW | ~141 | New Astro server component rendered site-wide from Layout. Fetches settings, builds email/`mailto:`/social-link `<a>` elements, inlines a Lucide SVG icon. Highest review interest in this PR. |
| `apps/web/src/layouts/Layout.astro` | MODIFIED | +6 | Added `import AppFooter` and `<AppFooter />` render after `<slot />`, before the attribution-capture `<script>`. Affects every page rendered through the layout. |
| `apps/web/src/styles/globals.css` | MODIFIED | +50 | Added `@theme inline` Tailwind v4 theme bridge mirroring `apps/web-next/src/styles/globals.css` (lines 27–57). Pure CSS, zero JS. |
| `docs/02-business-processes/uat/BP-UAT-009.md` | MODIFIED | +24 | Prose-only: added "Layout-completeness contract" paragraph under Step 005 (lines ~236–257). |

**Out-of-scope but verified unchanged:** the existing `apps/web/src/lib/cms.ts::fetchSiteSettings()` helper, the existing `Layout.astro` SSR-auth hand-off (`__AIQADAM_AUTH__` blob), the existing Plausible analytics script tag, and the existing attribution-capture `<script>`. None of these were touched.

---

## Invariant Check Results

| Invariant | Applicable? | Result | Notes |
|---|---|---|---|
| **INV-1** Tenant isolation | N/A | n/a | No DB read/write. Only CMS call is `fetchSiteSettings()` against the global `site_settings` singleton — explicitly tenant-neutral (one row for every country). No `countryCode` filter required; the helper already returns the same `SiteSettings` shape regardless of host. Confirmed in `apps/web/src/lib/cms.ts:362–394` and in the CodeDeveloper's architecture self-check (03-code-summary.md §"Architecture Rule Compliance"). |
| **INV-2** Secrets by reference | Yes | **Pass** | No `password` / `secret` / `apiKey` / `token` / `Bearer` literals in the diff. `fetchSiteSettings()` does not log row content; the `console.error('[cms] fetchSiteSettings failed:', ...)` line is pre-existing in cms.ts and logs the error message only (not the row). No new `.env` reads, no new env-var interpolation in client-rendered strings. |
| **INV-3** Auth at controller level | N/A | n/a | No controller. No new server-side endpoint. Astro server components render SSR markup; auth enforcement is unchanged (`Astro.locals.auth` SSR hand-off line ~88 of Layout.astro). |
| **INV-4** Validation at boundaries | Yes | **Pass** | The new `AppFooter.astro` consumes only the typed `SiteSettings` shape that `fetchSiteSettings()` already produces (Zod-equivalent: explicit `normalizeSiteSettings()` in cms.ts:362–372 with `typeof` guards and `?? null` fallbacks). The footer then constructs `SocialLink[]` / `ContactLink[]` arrays via type-guard predicates (`.filter((x): x is SocialLink => x !== null)`) — narrow-typed at the array boundary. The `mailto:${email}` interpolation on lines 38/42/46 uses values that have already been null-coalesced through `normalizeSiteSettings()` (which would have rejected malformed input upstream). The `<a href={c.href}>` and `<a href={s.href}>` bindings (Astro's auto-escaping JSX-like binding) render the strings as plain text — no `set:html`, no `dangerouslySetInnerHTML`. |
| **INV-5** No cross-schema queries | N/A | n/a | No DB queries at all. Only Directus CMS call: `GET /items/site_settings` (a singleton collection, public-read policy). Same call as the homepage already makes. No JOIN across `platform`/`directus`/`authentik`/`twenty`/`listmonk` — these are HTTP service boundaries, not joined queries. |
| **INV-6** Rate limiting | N/A | n/a | No new public endpoint. `fetchSiteSettings()` is server-side (inside the Astro SSR runtime), same as the pre-existing call from the homepage hero — not a new network-reachable surface. |
| **INV-7** CSRF protection | N/A | n/a | No browser-initiated state-changing operations. The footer renders only `<a>` link elements and read-only markup. No `<form>`, no fetch/XHR, no `onclick` handler. |
| **INV-8** No `dangerouslySetInnerHTML` | Yes | **Pass** | Grepped the diff: zero occurrences of `dangerouslySetInnerHTML`, zero occurrences of `set:html`, zero occurrences of `innerHTML` in the four changed files. The only `set:html` usages in the repo are in pre-existing files (`Layout.astro` line 115 for the SSR-auth blob, `events/[id].astro` for JSON-LD + markdown, `welcome/[slug].astro` for editorial body) — none introduced by this PR. |
| **INV-9** No N+1 queries | N/A | n/a | One `fetchSiteSettings()` call per request (the same call the homepage already makes). No loops over query results. The known doubling of CMS calls per page (homepage hero + footer) is documented in the impact analysis and matches the web-next precedent (`wf-20260624-feat-019`). |
| **INV-10** Drizzle parameterization | N/A | n/a | No Drizzle / raw SQL anywhere in the diff. Only Astro SSR markup + one CMS helper call. |
| **INV-11** HttpOnly tokens (web) | Yes | **Pass** | Diff does not touch cookies, localStorage, sessionStorage, or any token-bearing client state. The existing `__AIQADAM_AUTH__` SSR hand-off (which carries the auth state to React islands) is unchanged. The new `AppFooter` adds zero cookie I/O. |

---

## Hard Security Invariants (AGENTS.md §5) — Expanded Walk

| § | Invariant | Result | Evidence |
|---|---|---|---|
| §5.1 | Never log secrets | **Pass** | No new logging introduced. The `console.error('[cms] fetchSiteSettings failed:', err.message)` is pre-existing in `cms.ts:391` and only fires on the existing failure path. |
| §5.2 | Never commit secrets | **Pass** | Diff contains no `.env` changes, no new credential reads, no hardcoded tokens. |
| §5.3 | Parameterized queries only | **Pass** | No SQL in the diff. |
| §5.4 | Validate all input at boundaries | **Pass** | `fetchSiteSettings()` performs `normalizeSiteSettings()` with `typeof` checks and `?? null` fallbacks. The footer then narrows with type-guard predicates. No unvalidated user input reaches the rendered markup. |
| §5.5 | Output encoding by default | **Pass** | Astro auto-escapes JSX-like bindings (`{settings.defaultDescription}`, `{s.href}`, `{s.label}`, `{c.href}`, `{c.label}`, `{year}`, `{settings.countriesServed}`). No `set:html`, no `dangerouslySetInnerHTML`. The inline `<svg>` element has only the literal `M7 7h10v10` and `M7 17 17 7` paths (Lucide's published geometry — no interpolation). |
| §5.6 | Rate limiting on public endpoints | **n/a** | No new public endpoints. |
| §5.7 | CSRF on state-changing ops | **n/a** | No state-changing ops. |
| §5.8 | Auth at controller level | **n/a** | No new controllers / endpoints / webhooks / queue consumers. |

### Spot-Checks Beyond the Standard Invariants

**SSRF surface in `fetchSiteSettings()`:** Verified the underlying `get()` helper at `apps/web/src/lib/cms.ts:123–139`:

```
const { CMS_URL = 'https://cms.aiqadam.org' } = process.env;
const BASE = CMS_URL;
async function get<T>(path: string): Promise<T> { ... }
```

The base URL is **derived from a server-side environment variable**, not from user input (Host header, query string, request body, route param). The `path` argument is the only variable input to `get()`, and the only call site relevant to this PR is the hardcoded literal `/items/site_settings` (cms.ts:382). **No new SSRF surface.** The helper also falls back to `SITE_SETTINGS_DEFAULTS` on any error (cms.ts:391–393), so a CMS outage can never escalate to a DoS on the page render.

**Outbound link hardening (per AGENTS.md §11 / the task prompt's hard invariant #6):** The `target="_blank"` on line 82 is paired with `rel="noopener noreferrer"` on line 83 (verified by `grep_search`). The `mailto:` links (lines 38/42/46) don't open in a new tab and don't need `rel`. The social `href` values come from the `SiteSettings` shape — the upstream `normalizeSiteSettings()` returns them as `string | null` and the footer only emits an `<a>` when the value is non-null. **No `javascript:` / `data:` / `vbscript:` URL possibility** — the schema would have rejected it long before the footer ever sees the value (and even if it didn't, Astro would auto-escape `:` characters in attribute interpolation).

**Inline SVG icon policy (AGENTS.md §11.3):** The `↗` Unicode glyph from the web-next source has been replaced with an inline `<svg>` containing Lucide's published `ArrowUpRight` paths (`M7 7h10v10`, `M7 17 17 7`). `stroke="currentColor"`, `aria-hidden="true"`, no event handlers, no `onload`, no `<script>` inside the SVG. **Conforms to the design-system icon rule.**

**XSS surface added:** None. The only user-content rendered into the new component is `settings.defaultDescription` (a CMS-managed plain-text string from a singleton config row, edited by operators via Directus admin) and the `s.href` / `c.href` URL values (also from the singleton). All bound through Astro's auto-escaping JSX-like interpolation. No markdown rendering, no HTML interpretation, no template composition.

**Tenant-isolation regressions:** None. The footer renders the same content for every country by design — there is no `countryCode` branch, no per-tenant link substitution, no i18n yet (explicitly noted as a Phase-2 concern in the component's top comment). Adding it without country-aware link sets would be the wrong default; the component's author has correctly deferred this.

**Design-system constraints (AGENTS.md §11.1–§11.7):** Confirmed via code-summary self-check: no raw hex in the new component, no gradients, no new colour tokens, three font families via tokens (`font-display`, `font-mono`, body inherits `font-sans`), no emoji in copy (the `🔥` exception from §11.5 is not used; the `↗` arrow is now an SVG, not a Unicode glyph).

---

### BLOCKER Findings

**None.**

### MAJOR Findings

**None.**

### MINOR / Observations (non-blocking)

1. **Duplicate CMS call per request.** `<AppFooter />` calls `fetchSiteSettings()` on every page render; the homepage hero already does the same call. Two `GET /items/site_settings` per page is the current accepted pattern (web-next precedent `wf-20260624-feat-019`); a request-dedup layer is deferred. Not a security issue — just a perf observation. Already noted in the code summary's "Known Limitations" §1.

2. **Drift risk between `apps/web/src/components/AppFooter.astro` and `apps/web-next/src/blocks/common/AppFooter.astro`.** The two files now exist in parallel and will drift if either side is updated without porting. Resolves at cutover (`FR-MIG-031`). Operationally this is a maintenance concern, not a security one.

3. **`apps/web/src/lib/cms.ts::fetchSiteSettings()` logs to `console.error` on failure.** Pre-existing. Could theoretically leak row content if a future maintainer added `err.message` to include the raw response — currently it's just the error message string. Worth keeping an eye on, but out of scope for this PR.

None of these rise to MAJOR; all are pre-existing patterns the CodeDeveloper correctly reused rather than reinventing.

---

## Summary

A pure UI-only additive change: one new Astro server component, one Layout import, one CSS-only theme bridge, one doc paragraph. No DB, no API, no auth surface, no cookie I/O, no new endpoints, no new dependencies, no new colour tokens, no `dangerouslySetInnerHTML`, no un-escaped user content, no SSRF surface, no N+1 surface, all outbound `target="_blank"` links hardened with `rel="noopener noreferrer"`. The new component reuses an already-vetted web-next block (same `fetchSiteSettings()` helper, same `SiteSettings` shape, same Tailwind utility classes, same column structure), with the only meaningful divergence being the `↗` Unicode glyph → inline Lucide `ArrowUpRight` SVG swap (mandated by AGENTS.md §11.3 and explicitly requested in the impact analysis).

**The Impact Analysis's "Security Review Required: No" assessment is correct — confirmed.**

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "UI-only additive layout fix (AppFooter port + Layout render + @theme inline bridge + BP-UAT-009 prose) introduces zero new security surface; no DB / API / auth / cookie / endpoint changes; all 11 standard invariants are N/A or Pass; the one outbound target=_blank is paired with rel=noopener noreferrer; fetchSiteSettings() base URL is server-side env (no SSRF); the ↗ glyph was swapped for an inline Lucide SVG per AGENTS.md §11.3."
  findings:
    - "Reviewed 4 files: 1 new component (AppFooter.astro, ~141 LOC), 1 modified Layout.astro (+6 LOC), 1 modified globals.css (+50 LOC, CSS-only @theme inline bridge), 1 modified BP-UAT-009.md (+24 LOC, prose-only)."
    - "INV-1 / INV-5 / INV-9 / INV-10: N/A — no DB queries anywhere in the diff."
    - "INV-2 / INV-11: Pass — no secrets, tokens, cookies, or credential reads added."
    - "INV-3 / INV-6 / INV-7: N/A — no new controllers, no new endpoints, no state-changing operations."
    - "INV-4: Pass — fetchSiteSettings() already normalises SiteSettings via typeof + ?? null; footer narrows with .filter((x): x is T => x !== null) type guards."
    - "INV-8: Pass — zero dangerouslySetInnerHTML, zero set:html, zero innerHTML in the diff. The only set:html uses in the repo are pre-existing (Layout.astro SSR-auth blob, events/[id].astro JSON-LD, welcome pages)."
    - "SSRF: not applicable — CMS_URL is read once from server-side process.env (cms.ts:123) and the path argument to get() is the hardcoded literal '/items/site_settings'."
    - "Outbound link hardening: target=_blank on line 82 of AppFooter.astro is paired with rel=\"noopener noreferrer\" on line 83 (verified by grep_search)."
    - "No N+1 surface: one fetchSiteSettings() call per request, no loops over query results."
    - "Lucide-icon policy: the ↗ Unicode glyph from the web-next source has been swapped for an inline <svg> with Lucide's published ArrowUpRight paths (M7 7h10v10, M7 17 17 7), stroke=currentColor, aria-hidden=true — satisfies AGENTS.md §11.3."
    - "Three MINOR observations logged (CMS call duplication, AppFooter drift risk, pre-existing console.error logging) — none rise to MAJOR, all pre-existing patterns correctly reused."
```